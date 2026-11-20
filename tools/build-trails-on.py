#!/usr/bin/env python3
# workspace/whereisthesun/tools/build-trails-on.py
# SUNNY Trails & hikes (opt300): Ontario pack from the local Canada OpenStreetMap
# extract (route relations, graded and named paths, trailheads, named summits).
# Writes data/trails/on and updates data/trails/index.json, keeping Scotland.
# Usage: python3 tools/build-trails-on.py [trails.osm.pbf] [ontario-tight.geojson]
from __future__ import annotations
import json, math, re, sys
from collections import Counter, defaultdict
from pathlib import Path

import osmium
from shapely.geometry import shape, Point
from shapely.prepared import prep

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path("/tmp/on-trails-cache")
PBF = Path(sys.argv[1]) if len(sys.argv) > 1 else CACHE / "on-trails.osm.pbf"
POLY = Path(sys.argv[2]) if len(sys.argv) > 2 else CACHE / "ontario-tight.geojson"
OUT = ROOT / "data" / "trails"
REG = "on"
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
LONG_NAMES = {re.sub(r"[^a-z0-9]+", " ", s).strip() for s in [
    "bruce trail", "the great trail", "trans canada trail", "sentier transcanadien",
    "great lakes waterfront trail", "waterfront trail", "ganaraska trail",
    "oak ridges trail", "oak ridges moraine trail", "rideau trail", "voyageur trail",
    "thames valley trail", "avon trail", "grand valley trail", "cataraqui trail",
    "maitland trail", "elgin hiking trail", "greenbelt route",
    "ottawa valley recreational trail", "la cloche silhouette trail",
    "coastal hiking trail", "pukaskwa coastal hiking trail", "pukaskwa coastal trail",
    "casque isles trail", "western uplands backpacking trail", "western uplands trail",
    "highland backpacking trail", "algonquin highland trail",
]}

def load_poly():
    feat = json.loads(POLY.read_text())
    g = shape(feat["geometry"] if feat.get("type") == "Feature" else feat)
    return prep(g), g

PREP, POLY_G = None, None

def in_on(lat: float, lon: float) -> bool:
    if lon < -95.3 or lon > -74.2 or lat < 41.6 or lat > 57.0:
        return False
    return PREP.contains(Point(lon, lat))

def hav_m(a, b) -> float:
    r = 6371000.0
    p1, p2 = math.radians(a[1]), math.radians(b[1])
    dp = p2 - p1
    dl = math.radians(b[0] - a[0])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))

def path_len(cs) -> float:
    return sum(hav_m(cs[i], cs[i + 1]) for i in range(len(cs) - 1))

def on_len(cs) -> float:
    tot = 0.0
    for i in range(len(cs) - 1):
        if in_on(cs[i][1], cs[i][0]) or in_on(cs[i + 1][1], cs[i + 1][0]):
            tot += hav_m(cs[i], cs[i + 1])
    return tot

def mid_on(cs):
    segs = []
    acc = 0.0
    for i in range(len(cs) - 1):
        if not (in_on(cs[i][1], cs[i][0]) or in_on(cs[i + 1][1], cs[i + 1][0])):
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

def bbox_of(cs):
    xs = [c[0] for c in cs]; ys = [c[1] for c in cs]
    return [min(xs), min(ys), max(xs), max(ys)]

def tile_xy(lon, lat):
    lat = min(85.05112878, max(-85.05112878, lat))
    r = math.radians(lat)
    x = int(min(N - 1, max(0, math.floor((lon + 180) / 360 * N))))
    y = int(min(N - 1, max(0, math.floor((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * N))))
    return x, y

def tiles_of(cs):
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
    ax, ay = a; bx, by = b; px, py = p
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return hav_m(p, a)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = min(1.0, max(0.0, t))
    return hav_m(p, (ax + t * dx, ay + t * dy))

def simplify(cs, eps=20.0):
    if len(cs) <= 2:
        return cs
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

def enc(cs):
    out = []; px = py = 0
    for lon, lat in cs:
        ix, iy = int(round(lon * 1e5)), int(round(lat * 1e5))
        out.extend((ix - px, iy - py)); px, py = ix, iy
    return out

def clip(cs, bb):
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

def tile_bbox(key):
    x, y = map(int, key.split("_"))
    def lon(x):
        return x / N * 360.0 - 180.0
    def lat(y):
        n = math.pi - 2.0 * math.pi * y / N
        return math.degrees(math.atan(math.sinh(n)))
    return [lon(x) - PAD, lat(y + 1) - PAD, lon(x + 1) + PAD, lat(y) + PAD]

def norm_name(s):
    s = (s or "").lower().replace("&", "and")
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    if s.startswith("the "):
        s = s[4:]
    return s

def is_long_name(name):
    n = norm_name(name)
    if not n:
        return False
    if n in LONG_NAMES:
        return True
    for g in LONG_NAMES:
        if g in n or n in g:
            return True
    return False

def nets_of(tags):
    raw = (tags.get("network") or "").replace(";", ",").replace("/", ",")
    return {p.strip() for p in raw.split(",") if p.strip()}

def grade_of(tags):
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

def type_of(tags, km, long_name):
    nets = nets_of(tags)
    route = tags.get("route") or ""
    hw = tags.get("highway") or ""
    if long_name or (nets & LONG_NET) or (nets & REG_NET and km >= 20):
        return "l"
    if route == "mtb" or tags.get("mtb:scale") not in (None, ""):
        return "b"
    if route == "bicycle" or hw == "cycleway":
        return "c"
    return "h"

def merge_lines(parts):
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

def display_name(tags):
    name = tags.get("name") or tags.get("name:en") or tags.get("name:fr") or ""
    fr = tags.get("name:fr") or ""
    if fr == name:
        fr = ""
    return name, fr

def skip_way_tags(tags) -> bool:
    fw = tags.get("footway") or ""
    if fw in {"sidewalk", "crossing", "access_aisle"}:
        return True
    if tags.get("area") == "yes":
        return True
    if (tags.get("highway") or "") in {"corridor", "steps"}:
        return True
    return False

def notable_peak(tags) -> bool:
    if (tags.get("natural") or "") != "peak":
        return False
    name = tags.get("name") or tags.get("name:en") or tags.get("name:fr")
    if not name:
        return False
    if tags.get("wikidata") or tags.get("wikipedia"):
        return True
    if tags.get("prominence") or tags.get("ele:prominence"):
        return True
    return False

class Scan(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.ways = {}
        self.rels = {}
        self.nodes = []
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
        if notable_peak(tags) or tags.get("highway") == "trailhead":
            self.nodes.append((n.id, tags, n.location.lon, n.location.lat))

def keep_route(tags, lines) -> bool:
    if not lines:
        return False
    pts = [c for ln in lines for c in ln]
    sl = sum(on_len(ln) for ln in lines)
    tot = path_len(pts)
    km = tot / 1000.0
    name, _ = display_name(tags)
    longn = is_long_name(name)
    if sl <= 0:
        return False
    if sl < 200 and not (longn and sl > 0):
        mid = mid_on(pts) or pts[len(pts) // 2]
        if not in_on(mid[1], mid[0]):
            return False
    if not longn and sl < 8000 and tot > 0 and sl / tot < 0.35:
        return False
    if name or longn or nets_of(tags) or grade_of(tags) != "n" or km >= 5:
        return True
    return False

def keep_way(tags, cs, in_rel: bool) -> bool:
    if in_rel or skip_way_tags(tags) or len(cs) < 2:
        return False
    mid = cs[len(cs) // 2]
    if not in_on(mid[1], mid[0]):
        return False
    name, _ = display_name(tags)
    graded = grade_of(tags) != "n"
    ferrata = (tags.get("highway") or tags.get("route") or "") == "via_ferrata"
    bridle = (tags.get("highway") or "") == "bridleway"
    if not (name or graded or ferrata or bridle):
        return False
    km = path_len(cs) / 1000.0
    if not name and not graded and not ferrata and km < 0.5:
        return False
    return True

def row_alt(fr):
    return "fr" if fr else ""

def main():
    global PREP, POLY_G
    PREP, POLY_G = load_poly()
    print("reading", PBF, "poly", POLY)
    h = Scan()
    h.apply_file(str(PBF), locations=True)
    print("ways", len(h.ways), "rels", len(h.rels), "summit/trailhead nodes", len(h.nodes))
    routes = []
    used_ways = set()
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
        name, fr = display_name(tags)
        km = sum(path_len(ln) for ln in lines) / 1000.0
        typ = type_of(tags, km, is_long_name(name))
        g = grade_of(tags)
        if g == "n":
            gs = set()
            for typm, ref, role in mem:
                if typm == "w" and ref in h.ways:
                    gg = grade_of(h.ways[ref][0])
                    if gg != "n":
                        gs.add(gg)
            if len(gs) == 1:
                g = gs.pop()
        pin = mid_on([c for ln in lines for c in ln])
        if not pin or not in_on(pin[1], pin[0]):
            continue
        routes.append({
            "ref": "r" + str(rid), "k": typ, "g": g, "name": name, "gd": fr, "src": "o",
            "km10": int(round(km * 10)), "net": (tags.get("network") or "").replace(";", ","),
            "lines": [simplify(ln, 20) for ln in lines if len(ln) >= 2], "pin": pin,
            "alt": row_alt(fr),
        })
    loose = 0
    for wid, (tags, cs) in h.ways.items():
        if not keep_way(tags, cs, wid in used_ways):
            continue
        name, fr = display_name(tags)
        km = path_len(cs) / 1000.0
        typ = type_of(tags, km, is_long_name(name))
        g = grade_of(tags)
        pin = mid_on(cs) or cs[len(cs) // 2]
        if not in_on(pin[1], pin[0]):
            continue
        routes.append({
            "ref": "w" + str(wid), "k": typ, "g": g, "name": name, "gd": fr, "src": "o",
            "km10": int(round(km * 10)), "net": (tags.get("network") or tags.get("designation") or ""),
            "lines": [simplify(cs, 20)], "pin": pin, "alt": row_alt(fr),
        })
        loose += 1
    peaks = []
    for nid, tags, lon, lat in h.nodes:
        if not notable_peak(tags) or not in_on(lat, lon):
            continue
        name, fr = display_name(tags)
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
        ref = "n" + str(nid) + (("|" + qid) if qid else "")
        src = "b" if qid else "o"
        peaks.append({
            "lon": lon, "lat": lat, "k": "p", "g": "peak", "name": name, "gd": fr if fr != name else "",
            "src": src, "ref": ref, "extra": int(round(elev)) if elev else 0, "net": "",
            "alt": row_alt(fr),
        })
    peaks.sort(key=lambda p: (0 if p["src"] == "b" else 1, -(p["extra"] or 0)))
    kept = []
    for p in peaks:
        dup = False
        for q in kept:
            d = hav_m((p["lon"], p["lat"]), (q["lon"], q["lat"]))
            same = norm_name(p["name"]) == norm_name(q["name"])
            if d < 150 or (same and d < 400):
                dup = True
                break
        if not dup:
            kept.append(p)
    peaks = kept
    heads = 0
    for nid, tags, lon, lat in h.nodes:
        if tags.get("highway") != "trailhead" or not in_on(lat, lon):
            continue
        name, fr = display_name(tags)
        if not name:
            continue
        routes.append({
            "ref": "n" + str(nid), "k": "h", "g": "n", "name": name, "gd": fr, "src": "o",
            "km10": 0, "net": "trailhead", "lines": [], "pin": (lon, lat), "alt": row_alt(fr),
        })
        heads += 1
    tile_rows = defaultdict(list)
    pins = []
    for r in routes:
        pin = r["pin"]
        pins.append([
            int(round(pin[0] * 1e5)), int(round(pin[1] * 1e5)), r["k"], r["g"], r["name"], r["gd"],
            r["src"], r["ref"], r["km10"], r["net"], r.get("alt") or "",
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
                    tile_rows[key].append(row_base + [enc(piece), r.get("alt") or ""])
    for p in peaks:
        pins.append([
            int(round(p["lon"] * 1e5)), int(round(p["lat"] * 1e5)), "p", p["g"], p["name"], p["gd"],
            p["src"], p["ref"], p["extra"], p["net"], p.get("alt") or "",
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
    xs = [p[0] / 1e5 for p in pins] or [-95.0, -74.4]
    ys = [p[1] / 1e5 for p in pins] or [41.7, 56.8]
    bbox = [min(xs) - 0.05, min(ys) - 0.05, max(xs) + 0.05, max(ys) + 0.05]
    idx_path = OUT / "index.json"
    regions = []
    if idx_path.exists():
        try:
            prev = json.loads(idx_path.read_text())
            regions = [r for r in prev.get("regions", []) if r.get("id") != "on"]
        except Exception:
            regions = []
    regions.append({
        "id": "on", "name": "Ontario", "bbox": [round(x, 4) for x in bbox],
        "z": Z, "tiles": sorted(tile_rows.keys()),
    })
    idx = {"v": "opt300", "regions": regions}
    idx_path.write_text(json.dumps(idx, ensure_ascii=False, separators=(",", ":")))
    tc, gc = Counter(), Counter()
    for r in routes:
        if r["net"] == "trailhead":
            tc["trailhead"] += 1
        else:
            tc[r["k"]] += 1
            gc[r["g"]] += 1
    print("routes", len(routes) - heads, "loose ways", loose, "trailheads", heads, "peaks", len(peaks))
    print("type", dict(tc))
    print("grade", dict(gc))
    print("tiles", len(tile_rows), "tile-bytes", bytes_t, "ov-bytes", len(ov.encode()), "pins", len(pins))
    named_routes = sum(1 for r in routes if r["name"] and r["net"] != "trailhead")
    print("named routes", named_routes, "long-named", sum(1 for r in routes if is_long_name(r["name"])))

if __name__ == "__main__":
    main()
