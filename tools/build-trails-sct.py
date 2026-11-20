#!/usr/bin/env python3
# workspace/whereisthesun/tools/build-trails-sct.py
# SUNNY Trails & hikes (opt299): Scotland pack from a local OpenStreetMap extract
# (route relations, graded and named paths, core paths, trailheads) plus Munros,
# Corbetts and Grahams from OSM tags and Wikidata. Writes data/trails/sct and
# data/trails/index.json. Usage:
#   python3 tools/build-trails-sct.py [trails.osm.pbf] [wd-peaks-dir]
from __future__ import annotations
import json, math, re, sys
from collections import Counter, defaultdict
from pathlib import Path

import osmium

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path("/tmp/sct-trails-cache")
PBF = Path(sys.argv[1]) if len(sys.argv) > 1 else CACHE / "sct-trails.osm.pbf"
WDDIR = Path(sys.argv[2]) if len(sys.argv) > 2 else CACHE
OUT = ROOT / "data" / "trails"
REG = "sct"
Z = 8
N = 2 ** Z
PAD = 0.03
ROUTES = {"hiking", "foot", "bicycle", "mtb", "horse", "via_ferrata"}
LONG_NET = {"iwn", "nwn", "icn", "ncn"}
REG_NET = {"rwn", "rcn"}
SAC = {
    "strolling": "e", "hiking": "e", "mountain_hiking": "d",
    "demanding_mountain_hiking": "r", "alpine_hiking": "x",
    "demanding_alpine_hiking": "x", "difficult_alpine_hiking": "x",
}
DIFF = {
    "easy": "e", "easy_foot": "e", "strolling": "e", "moderate": "d",
    "intermediate": "d", "medium": "d", "hard": "r", "difficult": "r",
    "demanding": "r", "expert": "x", "extreme": "x", "alpine": "x",
}
GREAT = {re.sub(r"[^a-z0-9]+", " ", s).strip() for s in [
    "annandale way", "arran coastal way", "ayrshire coastal path", "berwickshire coastal path",
    "borders abbeys way", "borders abbey way", "cateran trail", "clyde walkway",
    "cross borders drove road", "dava way", "fife coastal path", "formartine and buchan way",
    "forth and clyde canal towpath", "union canal towpath", "forth and clyde union canal towpath",
    "great glen canoe trail", "great glen way", "great trossachs path", "john muir way",
    "kintyre way", "loch lomond and cowal way", "cowal way", "moray coast trail",
    "mull of galloway trail", "river ayr way", "rob roy way", "romans and reivers route",
    "st cuthberts way", "southern upland way", "speyside way", "three lochs way",
    "west highland way", "west island way",
]}

def uk_nation(lat: float, lon: float) -> str:
    # Solway–Liddesdale–Cheviots–Berwick line, tight enough to keep Cumbria out
    if lon < -5.4 and lat < 55.4 and lat >= 54.0 and lon > -8.3:
        return "Northern Ireland"
    if lon <= -4.8:
        border = 54.63
    elif lon <= -3.2:
        border = 54.98
    elif lon >= -2.0:
        border = 55.81
    else:
        border = 54.98 + (lon + 3.2) / 1.2 * (55.81 - 54.98)
    if lat >= border:
        return "Scotland"
    return "other"

def is_sct(lat: float, lon: float) -> bool:
    return uk_nation(lat, lon) == "Scotland"

def hav_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = 6371000.0
    p1, p2 = math.radians(a[1]), math.radians(b[1])
    dp = p2 - p1
    dl = math.radians(b[0] - a[0])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))

def path_len(cs: list[tuple[float, float]]) -> float:
    return sum(hav_m(cs[i], cs[i + 1]) for i in range(len(cs) - 1))

def sct_len(cs: list[tuple[float, float]]) -> float:
    tot = 0.0
    for i in range(len(cs) - 1):
        if is_sct(cs[i][1], cs[i][0]) or is_sct(cs[i + 1][1], cs[i + 1][0]):
            tot += hav_m(cs[i], cs[i + 1])
    return tot

def mid_sct(cs: list[tuple[float, float]]) -> tuple[float, float] | None:
    segs = []
    acc = 0.0
    for i in range(len(cs) - 1):
        if not (is_sct(cs[i][1], cs[i][0]) or is_sct(cs[i + 1][1], cs[i + 1][0])):
            continue
        d = hav_m(cs[i], cs[i + 1])
        segs.append((acc, acc + d, cs[i], cs[i + 1]))
        acc += d
    if acc <= 0:
        return None
    half = acc / 2
    for a, b, p, q in segs:
        if b >= half:
            t = 0 if b == a else (half - a) / (b - a)
            return (p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]))
    return cs[len(cs) // 2]

def bbox_of(cs: list[tuple[float, float]]) -> list[float]:
    xs = [c[0] for c in cs]; ys = [c[1] for c in cs]
    return [min(xs), min(ys), max(xs), max(ys)]

def tile_xy(lon: float, lat: float) -> tuple[int, int]:
    lat = min(85.05112878, max(-85.05112878, lat))
    r = math.radians(lat)
    x = int(min(N - 1, max(0, math.floor((lon + 180) / 360 * N))))
    y = int(min(N - 1, max(0, math.floor((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * N))))
    return x, y

def tiles_of(cs: list[tuple[float, float]]) -> set[str]:
    xs, ys = set(), set()
    for lon, lat in cs:
        x, y = tile_xy(lon, lat)
        xs.add(x); ys.add(y)
    # also fill the bbox of tiles so long diagonal lines are not missed
    if not cs:
        return set()
    b = bbox_of(cs)
    x0, y0 = tile_xy(b[0], b[3])
    x1, y1 = tile_xy(b[2], b[1])
    out = set()
    for x in range(min(x0, x1), max(x0, x1) + 1):
        for y in range(min(y0, y1), max(y0, y1) + 1):
            out.add(f"{x}_{y}")
    return out

def perp_dist(p, a, b) -> float:
    # metres, rough local projection
    ax, ay = a; bx, by = b; px, py = p
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return hav_m(p, a)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = min(1.0, max(0.0, t))
    return hav_m(p, (ax + t * dx, ay + t * dy))

def simplify(cs: list[tuple[float, float]], eps: float = 20.0) -> list[tuple[float, float]]:
    if len(cs) <= 2:
        return cs
    # Douglas-Peucker
    maxd, idx = 0.0, 0
    for i in range(1, len(cs) - 1):
        d = perp_dist(cs[i], cs[0], cs[-1])
        if d > maxd:
            maxd, idx = d, i
    if maxd > eps:
        left = simplify(cs[: idx + 1], eps)
        right = simplify(cs[idx:], eps)
        return left[:-1] + right
    return [cs[0], cs[-1]]

def enc(cs: list[tuple[float, float]]) -> list[int]:
    out = []; px = py = 0
    for lon, lat in cs:
        ix, iy = int(round(lon * 1e5)), int(round(lat * 1e5))
        out.extend((ix - px, iy - py)); px, py = ix, iy
    return out

def clip(cs: list[tuple[float, float]], bb: list[float]) -> list[list[tuple[float, float]]]:
    def inside(c):
        return bb[0] <= c[0] <= bb[2] and bb[1] <= c[1] <= bb[3]
    lines, cur = [], []
    for i, c in enumerate(cs):
        if inside(c):
            if not cur and i > 0:
                cur.append(cs[i - 1])
            cur.append(c)
        elif cur:
            cur.append(c)
            if len(cur) >= 2:
                lines.append(cur)
            cur = []
    if len(cur) >= 2:
        lines.append(cur)
    return lines

def tile_bbox(key: str) -> list[float]:
    x, y = map(int, key.split("_"))
    def lon(x):
        return x / N * 360.0 - 180.0
    def lat(y):
        n = math.pi - 2.0 * math.pi * y / N
        return math.degrees(math.atan(math.sinh(n)))
    return [lon(x) - PAD, lat(y + 1) - PAD, lon(x + 1) + PAD, lat(y) + PAD]

def norm_name(s: str) -> str:
    s = (s or "").lower().replace("&", "and")
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    if s.startswith("the "):
        s = s[4:]
    return s

def is_great(name: str) -> bool:
    n = norm_name(name)
    if not n:
        return False
    if n in GREAT:
        return True
    for g in GREAT:
        if g in n or n in g:
            return True
    return False

def nets_of(tags: dict) -> set[str]:
    raw = (tags.get("network") or "").replace(";", ",").replace("/", ",")
    return {p.strip() for p in raw.split(",") if p.strip()}

def grade_of(tags: dict) -> str:
    sac = (tags.get("sac_scale") or "").split(";")[0].strip()
    if sac in SAC:
        return SAC[sac]
    mtb = tags.get("mtb:scale") or tags.get("mtb:scale:uphill") or ""
    mtb = str(mtb).split(";")[0].strip()
    if mtb != "":
        try:
            v = float(mtb.replace("+", "").replace("-", ""))
        except ValueError:
            v = None
        if v is not None:
            if v <= 1:
                return "e"
            if v <= 2:
                return "d"
            if v <= 3:
                return "r"
            return "x"
    diff = (tags.get("difficulty") or tags.get("grade") or "").lower().strip()
    if diff in DIFF:
        return DIFF[diff]
    return "n"

def type_of(tags: dict, km: float, great: bool) -> str:
    nets = nets_of(tags)
    route = tags.get("route") or ""
    hw = tags.get("highway") or ""
    if great or (nets & LONG_NET) or (nets & REG_NET and km >= 20):
        return "l"
    if route == "mtb" or tags.get("mtb:scale") not in (None, ""):
        return "b"
    if route == "bicycle" or hw == "cycleway":
        return "c"
    return "h"

def merge_lines(parts: list[list[tuple[float, float]]]) -> list[list[tuple[float, float]]]:
    unused = [list(p) for p in parts if len(p) >= 2]
    if not unused:
        return []
    out = []
    while unused:
        cur = unused.pop(0)
        changed = True
        while changed:
            changed = False
            for i, other in enumerate(unused):
                if hav_m(cur[-1], other[0]) < 8:
                    cur += other[1:]; unused.pop(i); changed = True; break
                if hav_m(cur[-1], other[-1]) < 8:
                    cur += list(reversed(other[:-1])); unused.pop(i); changed = True; break
                if hav_m(cur[0], other[-1]) < 8:
                    cur = other + cur[1:]; unused.pop(i); changed = True; break
                if hav_m(cur[0], other[0]) < 8:
                    cur = list(reversed(other)) + cur[1:]; unused.pop(i); changed = True; break
        out.append(cur)
    return out

def display_name(tags: dict) -> tuple[str, str]:
    name = tags.get("name") or tags.get("name:en") or tags.get("name:gd") or ""
    gd = tags.get("name:gd") or ""
    if gd == name:
        gd = ""
    return name, gd

def skip_way_tags(tags: dict) -> bool:
    fw = tags.get("footway") or ""
    if fw in {"sidewalk", "crossing", "access_aisle"}:
        return True
    if tags.get("area") == "yes":
        return True
    if (tags.get("highway") or "") in {"corridor", "steps"}:
        return True
    return False

def peak_class(tags: dict) -> str | None:
    clas = (tags.get("classification") or "").lower()
    if tags.get("munro_top") == "yes" or clas in {"munro_top", "munro top"}:
        return "top"
    if tags.get("munro") == "yes" or clas == "munro":
        return "munro"
    if tags.get("corbett") == "yes" or clas == "corbett":
        return "corbett"
    if tags.get("graham") == "yes" or clas == "graham":
        return "graham"
    return None

class Scan(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.ways: dict[int, tuple[dict, list]] = {}
        self.rels: dict[int, tuple[dict, list]] = {}
        self.nodes: list[tuple] = []
    def way(self, w):
        tags = {t.k: t.v for t in w.tags}
        cs = []
        try:
            for n in w.nodes:
                if not n.location.valid():
                    return
                cs.append((n.lon, n.lat))
        except Exception:
            return
        if len(cs) >= 2:
            self.ways[w.id] = (tags, cs)
    def relation(self, r):
        tags = {t.k: t.v for t in r.tags}
        if tags.get("route") not in ROUTES:
            return
        mem = [(m.type, m.ref, m.role) for m in r.members]
        self.rels[r.id] = (tags, mem)
    def node(self, n):
        if not n.location.valid():
            return
        tags = {t.k: t.v for t in n.tags}
        if peak_class(tags) or tags.get("highway") == "trailhead":
            self.nodes.append((n.id, tags, n.location.lon, n.location.lat))

def load_wd() -> list[dict]:
    rows = []
    bands = {"munro": (914.4, 2000.0), "corbett": (762.0, 914.4), "graham": (600.0, 762.0)}
    for kind, (lo, hi) in bands.items():
        p = WDDIR / f"wd-peaks-{kind}.json"
        if not p.exists():
            continue
        for r in json.loads(p.read_text()):
            try:
                lat, lon = float(r["lat"]), float(r["lon"])
            except Exception:
                continue
            if not is_sct(lat, lon):
                continue
            elev = r.get("elev")
            if elev is None or not (lo <= float(elev) < hi):
                continue
            name = (r.get("name") or "").strip()
            if not name or name.endswith("shire") or name.startswith("List of"):
                continue
            rows.append({
                "qid": r.get("qid") or "", "name": name, "gd": r.get("gd") or "",
                "lon": lon, "lat": lat, "elev": float(elev), "kind": kind,
            })
    return rows

def keep_route(tags, lines) -> bool:
    if not lines:
        return False
    pts = [c for ln in lines for c in ln]
    sl = sum(sct_len(ln) for ln in lines)
    km = sum(path_len(ln) for ln in lines) / 1000.0
    name, _ = display_name(tags)
    great = is_great(name)
    tot = path_len(pts)
    if sl <= 0:
        return False
    if sl < 200 and not (great and sl > 0):
        mid = mid_sct(pts) or pts[len(pts) // 2]
        if not is_sct(mid[1], mid[0]):
            return False
    # drop routes that only clip Scotland (English coast / wall paths)
    if not great and sl < 8000 and tot > 0 and sl / tot < 0.35:
        return False
    if name or great or nets_of(tags) or grade_of(tags) != "n" or km >= 5:
        return True
    return False

def keep_way(tags, cs, in_rel: bool) -> bool:
    if in_rel or skip_way_tags(tags) or len(cs) < 2:
        return False
    mid = cs[len(cs) // 2]
    if not is_sct(mid[1], mid[0]):
        return False
    name, _ = display_name(tags)
    graded = grade_of(tags) != "n"
    core = (tags.get("designation") or "") in {"core_path", "corepath", "core_paths"}
    ferrata = (tags.get("highway") or tags.get("route") or "") == "via_ferrata"
    bridle = (tags.get("highway") or "") == "bridleway"
    if not (name or graded or ferrata or core or bridle):
        return False
    km = path_len(cs) / 1000.0
    if not name and not graded and not ferrata and km < 0.5:
        return False
    return True

def main():
    print("reading", PBF)
    h = Scan()
    h.apply_file(str(PBF), locations=True)
    print("ways", len(h.ways), "rels", len(h.rels), "summit/trailhead nodes", len(h.nodes))
    routes = []
    used_ways: set[int] = set()
    for rid, (tags, mem) in h.rels.items():
        parts = []
        for typ, ref, role in mem:
            if typ == "w" and ref in h.ways:
                parts.append(list(h.ways[ref][1]))
        lines = merge_lines(parts)
        if not keep_route(tags, lines):
            continue
        for typ, ref, role in mem:
            if typ == "w":
                used_ways.add(ref)
        name, gd = display_name(tags)
        km = sum(path_len(ln) for ln in lines) / 1000.0
        typ = type_of(tags, km, is_great(name))
        g = grade_of(tags)
        # inherit a grade from member ways only when every graded member agrees
        if g == "n":
            gs = set()
            for typm, ref, role in mem:
                if typm == "w" and ref in h.ways:
                    gg = grade_of(h.ways[ref][0])
                    if gg != "n":
                        gs.add(gg)
            if len(gs) == 1:
                g = gs.pop()
        pin = mid_sct([c for ln in lines for c in ln])
        if not pin:
            continue
        routes.append({
            "ref": "r" + str(rid), "k": typ, "g": g, "name": name, "gd": gd, "src": "o",
            "km10": int(round(km * 10)), "net": (tags.get("network") or "").replace(";", ","),
            "lines": [simplify(ln, 20) for ln in lines if len(ln) >= 2], "pin": pin,
        })
    loose = 0
    for wid, (tags, cs) in h.ways.items():
        if not keep_way(tags, cs, wid in used_ways):
            continue
        name, gd = display_name(tags)
        km = path_len(cs) / 1000.0
        typ = type_of(tags, km, is_great(name))
        g = grade_of(tags)
        pin = mid_sct(cs) or cs[len(cs) // 2]
        routes.append({
            "ref": "w" + str(wid), "k": typ, "g": g, "name": name, "gd": gd, "src": "o",
            "km10": int(round(km * 10)), "net": (tags.get("network") or tags.get("designation") or ""),
            "lines": [simplify(cs, 20)], "pin": pin,
        })
        loose += 1
    # summits
    peaks = []
    seen_q = set(); used_osm = set()
    def add_peak(lon, lat, kind, name, gd, src, ref, elev):
        if not is_sct(lat, lon) or not name:
            return
        peaks.append({
            "lon": lon, "lat": lat, "k": "p", "g": kind, "name": name, "gd": gd if gd != name else "",
            "src": src, "ref": ref, "extra": int(round(elev)) if elev else 0, "net": "",
        })
    wd = load_wd()
    osm_peaks = []
    for nid, tags, lon, lat in h.nodes:
        kind = peak_class(tags)
        if not kind or not is_sct(lat, lon):
            continue
        name, gd = display_name(tags)
        if not name:
            continue
        elev = None
        for key in ("ele", "ele:wgs84"):
            if tags.get(key):
                try:
                    elev = float(str(tags[key]).replace("m", "").strip())
                except ValueError:
                    pass
        qid = (tags.get("wikidata") or "").strip()
        osm_peaks.append({"id": nid, "lon": lon, "lat": lat, "kind": kind, "name": name, "gd": gd,
                          "elev": elev, "qid": qid})
    # match WD to OSM within 150 m or same qid
    for op in osm_peaks:
        match = None
        if op["qid"]:
            for w in wd:
                if w["qid"] == op["qid"]:
                    match = w; break
        if match is None:
            best, bestd = None, 151.0
            for w in wd:
                if w["kind"] != op["kind"] and not (op["kind"] == "top" and w["kind"] == "munro"):
                    # tops are not merged into munros by coord alone when kinds differ? allow same name
                    if norm_name(w["name"]) != norm_name(op["name"]):
                        continue
                d = hav_m((op["lon"], op["lat"]), (w["lon"], w["lat"]))
                if d < bestd:
                    best, bestd = w, d
            match = best
        if match:
            seen_q.add(match["qid"])
            used_osm.add(op["id"])
            name = match["name"] or op["name"]
            gd = match["gd"] or op["gd"]
            elev = match["elev"] or op["elev"]
            kind = op["kind"]  # OSM class wins when tagged
            ref = "n" + str(op["id"]) + "|" + match["qid"]
            add_peak(op["lon"], op["lat"], kind, name, gd, "b", ref, elev)
        else:
            used_osm.add(op["id"])
            add_peak(op["lon"], op["lat"], op["kind"], op["name"], op["gd"], "o", "n" + str(op["id"]), op["elev"])
    for w in wd:
        if w["qid"] in seen_q:
            continue
        if any(hav_m((w["lon"], w["lat"]), (p["lon"], p["lat"])) < 150 for p in peaks):
            continue
        add_peak(w["lon"], w["lat"], w["kind"], w["name"], w["gd"], "w", w["qid"], w["elev"])
    # one pin per summit: same class within 150 m, or same name and class within 400 m
    peaks.sort(key=lambda p: (0 if p["src"] == "b" else 1 if p["src"] == "w" else 2, -(p["extra"] or 0)))
    kept = []
    for p in peaks:
        dup = False
        for q in kept:
            if p["g"] != q["g"]:
                continue
            d = hav_m((p["lon"], p["lat"]), (q["lon"], q["lat"]))
            same = norm_name(p["name"]) == norm_name(q["name"])
            if d < 150 or (same and d < 400):
                dup = True
                break
        if not dup:
            kept.append(p)
    peaks = kept
    # named trailheads
    heads = 0
    for nid, tags, lon, lat in h.nodes:
        if tags.get("highway") != "trailhead" or not is_sct(lat, lon):
            continue
        name, gd = display_name(tags)
        if not name:
            continue
        routes.append({
            "ref": "n" + str(nid), "k": "h", "g": "n", "name": name, "gd": gd, "src": "o",
            "km10": 0, "net": "trailhead", "lines": [], "pin": (lon, lat),
        })
        heads += 1
    # tiles + overview pins
    tile_rows = defaultdict(list)
    pins = []
    for r in routes:
        pin = r["pin"]
        pins.append([
            int(round(pin[0] * 1e5)), int(round(pin[1] * 1e5)), r["k"], r["g"], r["name"], r["gd"],
            r["src"], r["ref"], r["km10"], r["net"],
        ])
        for ln in r["lines"]:
            if len(ln) < 2:
                continue
            row_base = [r["ref"], r["k"], r["g"], r["name"], r["gd"], r["src"], r["km10"], r["net"]]
            for key in tiles_of(ln):
                bb = tile_bbox(key)
                for piece in clip(ln, bb) or [ln]:
                    if len(piece) < 2:
                        continue
                    tile_rows[key].append(row_base + [enc(piece)])
    for p in peaks:
        pins.append([
            int(round(p["lon"] * 1e5)), int(round(p["lat"] * 1e5)), "p", p["g"], p["name"], p["gd"],
            p["src"], p["ref"], p["extra"], p["net"],
        ])
    dest = OUT / REG
    if dest.exists():
        for f in dest.glob("*.json"):
            f.unlink()
    dest.mkdir(parents=True, exist_ok=True)
    bytes_t = 0
    for key, rows in tile_rows.items():
        s = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
        (dest / f"{key}.json").write_text(s)
        bytes_t += len(s.encode())
    ov = json.dumps({"pins": pins}, ensure_ascii=False, separators=(",", ":"))
    (dest / "ov.json").write_text(ov)
    # region bbox from pins + lines
    xs = [p[0] / 1e5 for p in pins] or [-8.6, -0.7]
    ys = [p[1] / 1e5 for p in pins] or [54.6, 60.8]
    bbox = [min(xs) - 0.05, min(ys) - 0.05, max(xs) + 0.05, max(ys) + 0.05]
    # keep any existing regions other than sct (Ontario later)
    idx_path = OUT / "index.json"
    regions = []
    if idx_path.exists():
        try:
            prev = json.loads(idx_path.read_text())
            regions = [r for r in prev.get("regions", []) if r.get("id") != "sct"]
        except Exception:
            regions = []
    regions.append({
        "id": "sct", "name": "Scotland", "bbox": [round(x, 4) for x in bbox],
        "z": Z, "tiles": sorted(tile_rows.keys()),
    })
    idx = {"v": "opt299", "regions": regions}
    idx_path.write_text(json.dumps(idx, ensure_ascii=False, separators=(",", ":")))
    tc, gc = Counter(), Counter()
    for r in routes:
        if r["net"] == "trailhead":
            tc["trailhead"] += 1
        else:
            tc[r["k"]] += 1
            gc[r["g"]] += 1
    pc = Counter(p["g"] for p in peaks)
    print("routes", len(routes) - heads, "loose ways", loose, "trailheads", heads, "peaks", len(peaks))
    print("type", dict(tc))
    print("grade", dict(gc))
    print("peaks", dict(pc))
    print("tiles", len(tile_rows), "tile-bytes", bytes_t, "ov-bytes", len(ov.encode()), "pins", len(pins))
    named_routes = sum(1 for r in routes if r["name"] and r["net"] != "trailhead")
    print("named routes", named_routes, "great-trail-named",
          sum(1 for r in routes if is_great(r["name"])))

if __name__ == "__main__":
    main()
