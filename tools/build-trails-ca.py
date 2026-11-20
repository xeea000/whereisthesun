#!/usr/bin/env python3
# workspace/whereisthesun/tools/build-trails-ca.py
# SUNNY Trails & hikes (opt301): rest of Canada (not Ontario) from the local Canada
# OpenStreetMap extract. Writes data/trails/{bc,ab,pr,qc,at,no} and updates
# data/trails/index.json, keeping Scotland and Ontario. Usage:
#   python3 tools/build-trails-ca.py [trails-and-bounds.osm.pbf]
from __future__ import annotations
import json, math, re, sys
from collections import Counter, defaultdict
from pathlib import Path

import osmium
from shapely.geometry import shape, Point, MultiPolygon, Polygon
from shapely.ops import unary_union
from shapely.prepared import prep

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path("/tmp/ca-trails-cache")
PBF = Path(sys.argv[1]) if len(sys.argv) > 1 else CACHE / "ca-trails-bounds.osm.pbf"
OUT = ROOT / "data" / "trails"
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
# Province ISO -> pack id. Ontario is skipped (already shipped).
PACK_OF = {
    "CA-BC": "bc", "CA-AB": "ab", "CA-SK": "pr", "CA-MB": "pr",
    "CA-QC": "qc", "CA-NB": "at", "CA-NS": "at", "CA-PE": "at", "CA-NL": "at",
    "CA-YT": "no", "CA-NT": "no", "CA-NU": "no",
}
PACK_NAME = {
    "bc": "British Columbia", "ab": "Alberta", "pr": "Manitoba and Saskatchewan",
    "qc": "Quebec", "at": "Atlantic Canada", "no": "Yukon, Northwest Territories and Nunavut",
}
LONG_NAMES = {re.sub(r"[^a-z0-9]+", " ", s).strip() for s in [
    "the great trail", "trans canada trail", "sentier transcanadien",
    "west coast trail", "juan de fuca marine trail", "juan de fuca trail",
    "sunshine coast trail", "east coast trail", "confederation trail",
    "the island walk", "fundy footpath", "international appalachian trail",
    "sentier international des appalaches", "sentier national",
    "national hiking trail", "chilkoot trail", "canol heritage trail",
    "berg lake trail", "rockwall trail", "kettle valley rail trail",
    "sentier des caps", "newfoundland railway", "newfoundland trailway",
    "t railway", "acadian trail", "gaff point trail",
    "cape chignecto", "waban aki trail", "sentier pituamkek",
]}

def hav_m(a, b) -> float:
    r = 6371000.0
    p1, p2 = math.radians(a[1]), math.radians(b[1])
    dp = p2 - p1
    dl = math.radians(b[0] - a[0])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))

def path_len(cs) -> float:
    return sum(hav_m(cs[i], cs[i + 1]) for i in range(len(cs) - 1))

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

def is_us_leak(name):
    n = name or ""
    if re.search(r"\(\s*(Alaska|Michigan|Washington|Idaho|Montana|Maine)\s*\)", n, re.I):
        return True
    if re.search(r"\b(PCT|CDT)\s*-", n):
        return True
    if re.search(r"Pacific Crest Trail|Continental Divide Trail", n, re.I):
        return True
    return False

def is_long_name(name):
    n = norm_name(name)
    if not n:
        return False
    if n in LONG_NAMES:
        return True
    for g in LONG_NAMES:
        if len(g) >= 12 and (g in n or n in g):
            return True
        if g == n:
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

def load_packs(pbf: Path):
    """Build prepared pack polygons from ISO3166-2=CA-* areas. Ontario is loaded only to exclude it."""
    gf = osmium.geom.GeoJSONFactory()
    by_iso = defaultdict(list)
    for obj in osmium.FileProcessor(str(pbf)).with_locations().with_areas():
        if not obj.is_area():
            continue
        iso = obj.tags.get("ISO3166-2") or ""
        if iso not in PACK_OF and iso != "CA-ON":
            continue
        try:
            raw = gf.create_multipolygon(obj)
        except Exception:
            continue
        g = shape(json.loads(raw))
        if g.is_empty:
            continue
        by_iso[iso].append(g)
        print("area", iso, g.geom_type, "deg2", round(g.area, 3))
    packs = {}
    on_prep = None
    for iso, geoms in by_iso.items():
        u = unary_union(geoms)
        if u.is_empty:
            continue
        u = u.simplify(0.0008, preserve_topology=True)
        if iso == "CA-ON":
            on_prep = prep(u)
            continue
        pid = PACK_OF[iso]
        packs.setdefault(pid, [])
        packs[pid].append(u)
    prepared = {}
    raw = {}
    for pid, geoms in packs.items():
        u = unary_union(geoms)
        raw[pid] = u
        prepared[pid] = prep(u)
        print("pack", pid, "bounds", tuple(round(x, 3) for x in u.bounds))
    return prepared, raw, on_prep

# bbox prefilter per pack for faster region_of
PACKS = {}  # id -> (prep, bounds)
ON_PREP = None

def region_of(lat, lon):
    if lon < -141.1 or lon > -52.4 or lat < 41.6 or lat > 83.2:
        return None
    pt = Point(lon, lat)
    if ON_PREP is not None and ON_PREP.contains(pt):
        return None
    for pid, (pr, bb) in PACKS.items():
        if lon < bb[0] or lon > bb[2] or lat < bb[1] or lat > bb[3]:
            continue
        if pr.contains(pt):
            return pid
    return None

def mid_in(cs, pid):
    segs = []
    acc = 0.0
    for i in range(len(cs) - 1):
        if region_of(cs[i][1], cs[i][0]) != pid and region_of(cs[i + 1][1], cs[i + 1][0]) != pid:
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
            pin = (p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]))
            if region_of(pin[1], pin[0]) == pid:
                return pin
    # fallback: first vertex in the pack
    for c in cs:
        if region_of(c[1], c[0]) == pid:
            return c
    return None

def split_by_pack(cs):
    """Split a linestring into pieces that stay in one non-Ontario pack."""
    if len(cs) < 2:
        return {}
    out = defaultdict(list)
    cur_pid = region_of(cs[0][1], cs[0][0])
    cur = [cs[0]]
    for c in cs[1:]:
        pid = region_of(c[1], c[0])
        if pid == cur_pid:
            cur.append(c)
            continue
        if cur_pid and len(cur) >= 2:
            out[cur_pid].append(cur)
        # include the boundary vertex in the new piece
        cur_pid = pid
        cur = [cur[-1], c] if pid else [c]
    if cur_pid and len(cur) >= 2:
        out[cur_pid].append(cur)
    return out

def pack_len(cs, pid) -> float:
    tot = 0.0
    for i in range(len(cs) - 1):
        if region_of(cs[i][1], cs[i][0]) == pid or region_of(cs[i + 1][1], cs[i + 1][0]) == pid:
            tot += hav_m(cs[i], cs[i + 1])
    return tot

class Scan(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.ways = {}
        self.rels = {}
        self.nodes = []
    def way(self, w):
        tags = {t.k: t.v for t in w.tags}
        # skip admin boundary ways that have no trail tags
        if tags.get("route") not in ROUTES and not (
            tags.get("sac_scale") or tags.get("mtb:scale") or
            (tags.get("highway") or "") in {"via_ferrata", "bridleway", "trailhead"} or
            tags.get("highway") == "cycleway" and tags.get("name")
        ):
            # still need member ways of route relations; keep any way with a location
            if not any(k in tags for k in ("highway", "route", "sac_scale", "mtb:scale", "name")):
                # likely a boundary way; still store coords so route members can stitch
                pass
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

def keep_route_piece(tags, lines, pid) -> bool:
    if not lines:
        return False
    sl = sum(path_len(ln) for ln in lines)
    name, _ = display_name(tags)
    longn = is_long_name(name)
    if sl <= 0:
        return False
    if sl < 200 and not (longn and sl > 0):
        mid = mid_in([c for ln in lines for c in ln], pid)
        if not mid:
            return False
    # drop slivers of a mostly-elsewhere route
    if not longn and sl < 8000 and sl < 0.35 * max(sl, sum(path_len(ln) for ln in lines)):
        # piece length is sl; for a piece already clipped, sl is the piece itself, so this never fires
        pass
    if name or longn or nets_of(tags) or grade_of(tags) != "n" or sl >= 5000:
        return True
    return False

def keep_way(tags, cs) -> bool:
    if skip_way_tags(tags) or len(cs) < 2:
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

def write_pack(pid, routes, peaks, heads_n, loose_n):
    dest = OUT / pid
    if dest.exists():
        for f in dest.glob("*.json"):
            f.unlink()
    dest.mkdir(parents=True, exist_ok=True)
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
    bytes_t = 0
    for key, rows in tile_rows.items():
        s = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
        (dest / f"{key}.json").write_text(s)
        bytes_t += len(s.encode())
    ov = json.dumps({"pins": pins}, ensure_ascii=False, separators=(",", ":"))
    (dest / "ov.json").write_text(ov)
    if pins:
        xs = [p[0] / 1e5 for p in pins]; ys = [p[1] / 1e5 for p in pins]
        bbox = [min(xs) - 0.05, min(ys) - 0.05, max(xs) + 0.05, max(ys) + 0.05]
    else:
        bbox = [-141, 41.7, -52, 83]
    tc, gc = Counter(), Counter()
    for r in routes:
        if r["net"] == "trailhead":
            tc["trailhead"] += 1
        else:
            tc[r["k"]] += 1
            gc[r["g"]] += 1
    print(
        pid, "routes", len(routes) - heads_n, "loose", loose_n, "trailheads", heads_n,
        "peaks", len(peaks), "type", dict(tc), "grade", dict(gc),
        "tiles", len(tile_rows), "tile-bytes", bytes_t, "ov-bytes", len(ov.encode()), "pins", len(pins),
    )
    return {
        "id": pid, "name": PACK_NAME[pid], "bbox": [round(x, 4) for x in bbox],
        "z": Z, "tiles": sorted(tile_rows.keys()),
        "stats": {"routes": len(routes) - heads_n, "loose": loose_n, "trailheads": heads_n,
                  "peaks": len(peaks), "type": dict(tc), "grade": dict(gc),
                  "tiles": len(tile_rows), "tile_bytes": bytes_t, "pins": len(pins)},
    }

def main():
    global PACKS, ON_PREP
    print("polygons from", PBF)
    prepared, raw, on_prep = load_packs(PBF)
    ON_PREP = on_prep
    PACKS = {pid: (prepared[pid], raw[pid].bounds) for pid in prepared}
    print("reading trails", PBF)
    h = Scan()
    h.apply_file(str(PBF), locations=True)
    print("ways", len(h.ways), "rels", len(h.rels), "summit/trailhead nodes", len(h.nodes))
    used_ways = set()
    by_pack = defaultdict(list)
    loose_n = Counter(); heads_n = Counter()
    # relations, split by pack
    for rid, (tags, mem) in h.rels.items():
        parts = []
        for typ, ref, role in mem:
            if typ == "w" and ref in h.ways:
                parts.append(list(h.ways[ref][1]))
        lines = merge_lines(parts)
        if not lines:
            continue
        name, fr = display_name(tags)
        # group pieces by pack
        pieces = defaultdict(list)
        for ln in lines:
            split = split_by_pack(ln)
            for pid, segs in split.items():
                pieces[pid].extend(segs)
        kept_any = False
        for pid, segs in pieces.items():
            if not keep_route_piece(tags, segs, pid):
                continue
            km = sum(path_len(ln) for ln in segs) / 1000.0
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
            pin = mid_in([c for ln in segs for c in ln], pid)
            if not pin or is_us_leak(name):
                continue
            by_pack[pid].append({
                "ref": "r" + str(rid), "k": typ, "g": g, "name": name, "gd": fr, "src": "o",
                "km10": int(round(km * 10)), "net": (tags.get("network") or "").replace(";", ","),
                "lines": [simplify(ln, 20) for ln in segs if len(ln) >= 2], "pin": pin,
                "alt": "fr" if fr else "",
            })
            kept_any = True
        if kept_any:
            for typ, ref, role in mem:
                if typ == "w":
                    used_ways.add(ref)
    # standalone ways
    for wid, (tags, cs) in h.ways.items():
        if wid in used_ways or not keep_way(tags, cs):
            continue
        name, fr = display_name(tags)
        split = split_by_pack(cs)
        for pid, segs in split.items():
            for seg in segs:
                if len(seg) < 2:
                    continue
                mid = mid_in(seg, pid)
                if not mid:
                    continue
                km = path_len(seg) / 1000.0
                typ = type_of(tags, km, is_long_name(name))
                g = grade_of(tags)
                by_pack[pid].append({
                    "ref": "w" + str(wid), "k": typ, "g": g, "name": name, "gd": fr, "src": "o",
                    "km10": int(round(km * 10)), "net": (tags.get("network") or tags.get("designation") or ""),
                    "lines": [simplify(seg, 20)], "pin": mid, "alt": "fr" if fr else "",
                })
                loose_n[pid] += 1
    # peaks and trailheads
    peaks = defaultdict(list)
    for nid, tags, lon, lat in h.nodes:
        pid = region_of(lat, lon)
        if not pid:
            continue
        name, fr = display_name(tags)
        if not name:
            continue
        if notable_peak(tags):
            elev = None
            for key in ("ele", "ele:wgs84"):
                if tags.get(key):
                    try:
                        elev = float(str(tags[key]).replace("m", "").strip())
                    except ValueError:
                        pass
            qid = (tags.get("wikidata") or "").strip()
            ref = "n" + str(nid) + (("|" + qid) if qid else "")
            peaks[pid].append({
                "lon": lon, "lat": lat, "k": "p", "g": "peak", "name": name,
                "gd": fr if fr != name else "", "src": "b" if qid else "o", "ref": ref,
                "extra": int(round(elev)) if elev else 0, "net": "", "alt": "fr" if fr else "",
            })
        elif tags.get("highway") == "trailhead":
            by_pack[pid].append({
                "ref": "n" + str(nid), "k": "h", "g": "n", "name": name, "gd": fr, "src": "o",
                "km10": 0, "net": "trailhead", "lines": [], "pin": (lon, lat),
                "alt": "fr" if fr else "",
            })
            heads_n[pid] += 1
    # dedupe peaks per pack
    for pid, lst in list(peaks.items()):
        lst.sort(key=lambda p: (0 if p["src"] == "b" else 1, -(p["extra"] or 0)))
        kept = []
        for p in lst:
            dup = False
            for q in kept:
                d = hav_m((p["lon"], p["lat"]), (q["lon"], q["lat"]))
                same = norm_name(p["name"]) == norm_name(q["name"])
                if d < 150 or (same and d < 400):
                    dup = True
                    break
            if not dup:
                kept.append(p)
        peaks[pid] = kept
    metas = []
    totals = Counter(); tgrade = Counter(); ttype = Counter()
    for pid in ("bc", "ab", "pr", "qc", "at", "no"):
        routes = by_pack.get(pid, [])
        pk = peaks.get(pid, [])
        if not routes and not pk:
            print("skip empty", pid)
            continue
        # count trailheads already in routes
        hn = sum(1 for r in routes if r["net"] == "trailhead")
        meta = write_pack(pid, routes, pk, hn, loose_n[pid])
        metas.append(meta)
        totals["routes"] += meta["stats"]["routes"]
        totals["peaks"] += meta["stats"]["peaks"]
        totals["trailheads"] += meta["stats"]["trailheads"]
        totals["tiles"] += meta["stats"]["tiles"]
        totals["tile_bytes"] += meta["stats"]["tile_bytes"]
        totals["pins"] += meta["stats"]["pins"]
        for k, v in meta["stats"]["type"].items():
            ttype[k] += v
        for k, v in meta["stats"]["grade"].items():
            tgrade[k] += v
    idx_path = OUT / "index.json"
    keep_ids = {"sct", "on"}
    regions = []
    if idx_path.exists():
        prev = json.loads(idx_path.read_text())
        regions = [r for r in prev.get("regions", []) if r.get("id") in keep_ids]
    for m in metas:
        regions.append({k: m[k] for k in ("id", "name", "bbox", "z", "tiles")})
    idx_path.write_text(json.dumps({"v": "opt301", "regions": regions}, ensure_ascii=False, separators=(",", ":")))
    print("TOTAL", dict(totals), "type", dict(ttype), "grade", dict(tgrade))
    Path("/tmp/ca-trails-cache/build-stats.json").write_text(json.dumps({
        "total": dict(totals), "type": dict(ttype), "grade": dict(tgrade),
        "packs": {m["id"]: m["stats"] for m in metas},
    }, indent=2))

if __name__ == "__main__":
    main()
