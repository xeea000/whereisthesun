#!/usr/bin/env python3
# workspace/whereisthesun/tools/build-trails-is.py
# SUNNY Trails & hikes (opt305): Iceland hiking, walking, cycling and mountain-bike
# routes plus named summits, the mapped Golden Circle and the Ring Road, from a
# local OpenStreetMap Iceland extract. Grades only when a source tag states one.
# Usage: python3 tools/build-trails-is.py [features.osm.pbf]
from __future__ import annotations
import importlib.util, json, math, re, sys
from collections import Counter, defaultdict
from pathlib import Path

import osmium

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path("/tmp/is-trails-cache")
PBF = Path(sys.argv[1]) if len(sys.argv) > 1 else CACHE / "is-features.osm.pbf"
OUT = ROOT / "data" / "trails"
PID = "is"
TOURIST_ROADS = {65617, 2906605}  # Hringvegur (Ring Road), Golden Circle / Gullhringurinn
LONG_NAMES = {re.sub(r"[^a-z0-9]+", " ", s).strip() for s in [
    "laugavegur", "fimmvorduhals", "fimmvoruhals", "hellismannaleid", "reykjavegur",
    "hornstrandir", "international appalachian trail",
]}

def load_uk():
    path = ROOT / "tools" / "build-trails-uk.py"
    spec = importlib.util.spec_from_file_location("btuk", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

def in_iceland(lat, lon):
    if -25.6 <= lon <= -13.0 and 63.2 <= lat <= 66.85:
        return True
    if -19.15 <= lon <= -17.8 and 66.45 <= lat <= 66.65:
        return True
    return False

def display_is(tags):
    native = tags.get("name") or tags.get("name:is") or ""
    en = tags.get("name:en") or ""
    isl = tags.get("name:is") or (native if native and native != en else "")
    title = en or native or isl
    alt = ""
    if isl and isl != title:
        alt = isl
    elif native and native != title:
        alt = native
    return title, alt, ("is" if alt else "")

def is_long_name(name):
    n = re.sub(r"[^a-z0-9]+", " ", (name or "").lower().replace("&", "and")).strip()
    if n.startswith("the "):
        n = n[4:]
    if n in LONG_NAMES:
        return True
    # fold Icelandic accents for the well-known hikes
    fold = n.replace("ö", "o").replace("ó", "o").replace("ú", "u").replace("á", "a").replace("é", "e").replace("í", "i").replace("ý", "y").replace("ð", "d").replace("þ", "th")
    return fold in LONG_NAMES or any(g in fold for g in LONG_NAMES if len(g) >= 8)

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
        route = tags.get("route") or ""
        if route not in {"hiking", "foot", "bicycle", "mtb", "horse", "via_ferrata", "road"}:
            return
        if route == "road" and r.id not in TOURIST_ROADS:
            return
        self.rels[r.id] = (tags, [(m.type, m.ref, m.role) for m in r.members])
    def node(self, n):
        if not n.location.valid():
            return
        tags = {t.k: t.v for t in n.tags}
        if (tags.get("natural") or "") == "peak" or tags.get("highway") == "trailhead":
            self.nodes.append((n.id, tags, n.location.lon, n.location.lat))

def rel_parts(rid, rels, ways, seen=None):
    if seen is None:
        seen = set()
    if rid in seen or rid not in rels:
        return []
    seen.add(rid)
    tags, mem = rels[rid]
    parts = []
    for typ, ref, role in mem:
        if typ == "w" and ref in ways:
            parts.append(list(ways[ref][1]))
        elif typ == "r":
            parts.extend(rel_parts(ref, rels, ways, seen))
    return parts

def main():
    U = load_uk()
    def pack(lat, lon):
        return "is" if in_iceland(lat, lon) else None
    U.uk_pack = pack
    print("reading", PBF)
    h = Scan()
    h.apply_file(str(PBF), locations=True)
    print("ways", len(h.ways), "rels", len(h.rels), "summit/trailhead nodes", len(h.nodes))
    used = set()
    routes = []
    for rid, (tags, mem) in h.rels.items():
        parts = rel_parts(rid, {i: h.rels[i] for i in h.rels}, {i: (h.ways[i][0], h.ways[i][1]) for i in h.ways})
        # rel_parts needs ways as id -> coords only when typ==w and ref in ways; I passed wrong shape.
        break
    # rebuild rel_parts with coords map
    way_cs = {wid: cs for wid, (tags, cs) in h.ways.items()}
    rels_only = {rid: (tags, mem) for rid, (tags, mem) in h.rels.items()}

    def parts_of(rid, seen=None):
        if seen is None:
            seen = set()
        if rid in seen or rid not in rels_only:
            return []
        seen.add(rid)
        tags, mem = rels_only[rid]
        out = []
        for typ, ref, role in mem:
            if typ == "w" and ref in way_cs:
                out.append(list(way_cs[ref]))
            elif typ == "r":
                out.extend(parts_of(ref, seen))
        return out

    for rid, (tags, mem) in h.rels.items():
        lines = U.merge_lines(parts_of(rid))
        if not lines:
            continue
        segs = []
        for ln in lines:
            for pid, bits in U.split_by_pack(ln).items():
                if pid == "is":
                    segs.extend(bits)
        if not segs:
            continue
        name, alt, lang = display_is(tags)
        sl = sum(U.path_len(ln) for ln in segs)
        if tags.get("route") == "road":
            if rid not in TOURIST_ROADS or sl < 1000:
                continue
            typ = "t"
        else:
            if not (name or U.grade_of(tags) != "n" or sl >= 1500):
                continue
            if sl < 200:
                continue
            typ = U.type_of(tags, sl / 1000.0, is_long_name(name))
        pin = U.mid_in([c for ln in segs for c in ln], "is")
        if not pin:
            continue
        rec = {
            "ref": "r" + str(rid), "k": typ, "g": U.grade_of(tags), "name": name, "gd": alt, "src": "o",
            "km10": int(round(sl / 100.0)), "net": (tags.get("network") or tags.get("ref") or "").replace(";", ","),
            "lines": [U.simplify(ln, 30) for ln in segs if len(ln) >= 2], "pin": pin, "alt": "is" if alt else "",
        }
        # km10 is tenths of km: sl is metres, sl/100 = tenths. yes sl/1000*10 = sl/100.
        routes.append(rec)
        for typm, ref, role in mem:
            if typm == "w":
                used.add(ref)
    ROAD_HW = {
        "motorway", "trunk", "primary", "secondary", "tertiary", "unclassified",
        "residential", "service", "living_street", "motorway_link", "trunk_link",
        "primary_link", "secondary_link", "tertiary_link", "road", "busway",
        "raceway", "corridor",
    }
    loose = 0
    for wid, (tags, cs) in h.ways.items():
        if wid in used or U.skip_way_tags(tags) or len(cs) < 2:
            continue
        hw = tags.get("highway") or ""
        if hw in ROAD_HW or tags.get("route") == "road":
            continue
        name, alt, lang = display_is(tags)
        graded = U.grade_of(tags) != "n"
        ferrata = (hw or tags.get("route") or "") == "via_ferrata"
        if not (name or graded or ferrata):
            continue
        if not (graded or ferrata) and U.path_len(cs) < 1500:
            continue
        for pid, segs in U.split_by_pack(cs).items():
            if pid != "is":
                continue
            for seg in segs:
                mid = U.mid_in(seg, "is")
                if not mid or len(seg) < 2:
                    continue
                km = U.path_len(seg) / 1000.0
                typ = U.type_of(tags, km, is_long_name(name))
                routes.append({
                    "ref": "w" + str(wid), "k": typ, "g": U.grade_of(tags), "name": name, "gd": alt, "src": "o",
                    "km10": int(round(km * 10)), "net": (tags.get("network") or tags.get("designation") or ""),
                    "lines": [U.simplify(seg, 30)], "pin": mid, "alt": "is" if alt else "",
                })
                loose += 1
    peaks = []
    heads = 0
    for nid, tags, lon, lat in h.nodes:
        if not in_iceland(lat, lon):
            continue
        name, alt, lang = display_is(tags)
        if not name:
            continue
        if U.notable_peak(tags):
            elev = None
            for key in ("ele", "ele:wgs84"):
                if tags.get(key):
                    try:
                        elev = float(str(tags[key]).replace("m", "").strip())
                    except ValueError:
                        pass
            qid = (tags.get("wikidata") or "").strip()
            ref = "n" + str(nid) + (("|" + qid) if qid else "")
            peaks.append({
                "lon": lon, "lat": lat, "k": "p", "g": "peak", "name": name,
                "gd": alt, "src": "b" if qid else "o", "ref": ref,
                "extra": int(round(elev)) if elev else 0, "net": "", "alt": "is" if alt else "",
            })
        elif tags.get("highway") == "trailhead":
            routes.append({
                "ref": "n" + str(nid), "k": "h", "g": "n", "name": name, "gd": alt, "src": "o",
                "km10": 0, "net": "trailhead", "lines": [], "pin": (lon, lat), "alt": "is" if alt else "",
            })
            heads += 1
    peaks.sort(key=lambda p: (0 if p["src"] == "b" else 1, -(p["extra"] or 0)))
    kept = []
    for p in peaks:
        dup = False
        for q in kept:
            d = U.hav_m((p["lon"], p["lat"]), (q["lon"], q["lat"]))
            same = re.sub(r"[^a-z0-9]+", " ", (p["name"] or "").lower()) == re.sub(r"[^a-z0-9]+", " ", (q["name"] or "").lower())
            if d < 150 or (same and d < 400):
                dup = True
                break
        if not dup:
            kept.append(p)
    peaks = kept
    # write pack (do not use UK PACK_NAME)
    dest = OUT / PID
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
            for key in U.tiles_of(ln):
                bb = U.tile_bbox(key)
                for piece in U.clip(ln, bb) or [ln]:
                    if len(piece) < 2:
                        continue
                    tile_rows[key].append(row_base + [U.enc(piece), r.get("alt") or ""])
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
    xs = [p[0] / 1e5 for p in pins]; ys = [p[1] / 1e5 for p in pins]
    bbox = [min(xs) - 0.15, min(ys) - 0.1, max(xs) + 0.15, max(ys) + 0.1]
    tc, gc = Counter(), Counter()
    nhead = 0
    for r in routes:
        if r["net"] == "trailhead":
            tc["trailhead"] += 1
            nhead += 1
        else:
            tc[r["k"]] += 1
            gc[r["g"]] += 1
    print(
        "is routes", len(routes) - nhead, "trailheads", nhead, "peaks", len(peaks),
        "loose ways", loose, "type", dict(tc), "grade", dict(gc),
        "tiles", len(tile_rows), "tile-bytes", bytes_t, "ov-bytes", len(ov.encode()), "pins", len(pins),
    )
    for r in routes:
        n = (r["name"] or "").lower()
        if any(s in n for s in ("laugavegur", "fimmv", "golden", "gullhring", "hringvegur", "ring road", "hornstrand")):
            print("  notable", r["k"], r["name"], "km", r["km10"] / 10, r["ref"], "alt", r["gd"])
    idx_path = OUT / "index.json"
    prev = json.loads(idx_path.read_text()) if idx_path.exists() else {"regions": []}
    regions = [r for r in prev.get("regions", []) if r.get("id") != "is"]
    regions.append({
        "id": "is", "name": "Iceland", "bbox": [round(x, 4) for x in bbox],
        "z": 8, "tiles": sorted(tile_rows.keys()),
    })
    idx_path.write_text(json.dumps({"v": "opt305", "regions": regions}, ensure_ascii=False, separators=(",", ":")))
    Path("/tmp/is-trails-cache/build-stats.json").write_text(json.dumps({
        "routes": len(routes) - nhead, "trailheads": nhead, "peaks": len(peaks),
        "type": dict(tc), "grade": dict(gc), "tiles": len(tile_rows),
        "tile_bytes": bytes_t, "pins": len(pins), "loose": loose,
        "notable": [{"k": r["k"], "name": r["name"], "km": r["km10"] / 10, "ref": r["ref"], "alt": r["gd"]}
                    for r in routes if any(s in (r["name"] or "").lower() for s in
                    ("laugavegur", "fimmv", "golden", "gullhring", "hringvegur", "ring road", "hellismanna", "reykjavegur"))],
    }, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
