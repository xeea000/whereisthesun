#!/usr/bin/env python3
# workspace/whereisthesun/tools/build-trails-uk-themed.py
# SUNNY Trails opt303: UK tourist and heritage routes. Retags matching routes already
# in the UK packs, adds named routes missing from those packs, and adds mapped
# tourist driving routes (North Coast 500 and official scenic/tourist road relations).
# Grades come only from existing trail tags. Usage:
#   python3 tools/build-trails-uk-themed.py
from __future__ import annotations
import importlib.util, json, math, re, sys
from collections import Counter, defaultdict
from pathlib import Path

import osmium

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path("/tmp/uk-trails-cache")
PBF = CACHE / "uk-trails.osm.pbf"
ROADS = CACHE / "uk-roads-geom.json"
OUT = ROOT / "data" / "trails"
PACKS = ("sct", "eng", "wal", "ni")
SKIP_SUPER = {17403350}  # Bentham Heritage Trail parent; A/B/C already shipped
SKIP_NAME = {
    "beyond anglesey abbey walk anglesey abbey",
    "ripon to fountains abbey walk fountains abbey",
    "studley park water gardens and fountains abbey walk",
    "westmorland and furness way stage 6 the abbey trail",
    "visitor centre to dover castle trail white cliffs",
}
HER = re.compile(
    r"\b(heritage trail|heritage walk|heritage way|heritage path|history trail|"
    r"history walk|historic trail|historical trail|historical walk|heritage cycle)\b", re.I)
CAST = re.compile(
    r"\b((?:\d+|two|three|four|five|six)?\s*castles?\s+(?:trail|walk|way|path|cycle|route)|"
    r"castle trail|castles?\s*&\s*coast)\b", re.I)
PUB = re.compile(r"\b(ale trail|pub trail|pub walk|pub tour|beer (?:trail|mile|walk)|inn way)\b", re.I)
WHS = re.compile(r"\b(whisky (?:trail|road|tour|way)|whiskey (?:trail|road)|distiller(?:y|ies) (?:path|pathway|trail|way|tour))\b", re.I)
ABB = re.compile(r"\b((?:\d+|two|three|four)?\s*abbeys?\s+(?:way|trail|walk|cycle|cycleway|path)|abbey trail)\b", re.I)

def load_uk():
    path = ROOT / "tools" / "build-trails-uk.py"
    spec = importlib.util.spec_from_file_location("btuk", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

def norm(s):
    s = (s or "").lower().replace("&", "and").replace("’", "'")
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    if s.startswith("the "):
        s = s[4:]
    return s

def themes_of(name):
    if not name or norm(name) in SKIP_NAME:
        return []
    tags = []
    if HER.search(name):
        tags.append("heritage")
    if CAST.search(name):
        tags.append("castle")
    if PUB.search(name):
        tags.append("pub")
    if WHS.search(name):
        tags.append("whisky")
    if ABB.search(name):
        tags.append("abbey")
    return tags

def hav_m(a, b):
    r = 6371000.0
    p1, p2 = math.radians(a[1]), math.radians(b[1])
    dp, dl = p2 - p1, math.radians(b[0] - a[0])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))

def path_len(cs):
    return sum(hav_m(cs[i], cs[i + 1]) for i in range(len(cs) - 1))

class RelScan(osmium.SimpleHandler):
    def __init__(self, want):
        super().__init__()
        self.want = want
        self.rels = {}
        self.ways = {}
    def way(self, w):
        cs = []
        try:
            for n in w.nodes:
                if not n.location.valid():
                    return
                cs.append((n.lon, n.lat))
        except Exception:
            return
        if len(cs) >= 2:
            self.ways[w.id] = cs
    def relation(self, r):
        tags = {t.k: t.v for t in r.tags}
        self.rels[r.id] = (tags, [(m.type, m.ref, m.role) for m in r.members])

def rel_lines(rid, rels, ways, seen=None):
    if seen is None:
        seen = set()
    if rid in seen or rid not in rels:
        return []
    seen.add(rid)
    tags, mem = rels[rid]
    parts = []
    for typ, ref, role in mem:
        if typ == "w" and ref in ways:
            parts.append(list(ways[ref]))
        elif typ == "r":
            parts.extend(rel_lines(ref, rels, ways, seen))
    return parts

def road_lines(rel):
    parts = []
    for m in rel.get("members") or []:
        if m.get("type") != "way":
            continue
        g = m.get("geometry") or []
        cs = [(p["lon"], p["lat"]) for p in g]
        if len(cs) >= 2:
            parts.append(cs)
    return parts

def add_route(U, by_pack, existing, tags, lines, rid, kind="t"):
    if not lines:
        return []
    name, alt, lang = U.display_name(tags)
    pieces = defaultdict(list)
    for ln in lines:
        for pid, segs in U.split_by_pack(ln).items():
            pieces[pid].extend(segs)
    added = []
    ref = "r" + str(rid)
    for pid, segs in pieces.items():
        if pid not in PACKS:
            continue
        merged = U.merge_lines(segs)
        if not merged:
            continue
        sl = sum(path_len(ln) for ln in merged)
        if sl < 400:
            continue
        if ref in existing.get(pid, set()):
            continue
        pin = U.mid_in([c for ln in merged for c in ln], pid)
        if not pin:
            continue
        km = sl / 1000.0
        rec = {
            "ref": ref, "k": kind, "g": U.grade_of(tags), "name": name, "gd": alt, "src": "o",
            "km10": int(round(km * 10)), "net": (tags.get("network") or "").replace(";", ","),
            "lines": [U.simplify(ln, 30) for ln in merged if len(ln) >= 2], "pin": pin,
            "alt": U.alt_code(lang),
        }
        by_pack[pid].append(rec)
        existing.setdefault(pid, set()).add(ref)
        added.append((pid, rec))
    return added

def rewrite_pack(U, pid, new_routes, retag_refs):
    dest = OUT / pid
    ov_path = dest / "ov.json"
    ov = json.loads(ov_path.read_text())
    pins = ov["pins"] if isinstance(ov, dict) else ov
    n_retag = 0
    for p in pins:
        ref = p[7] if len(p) > 7 else ""
        if ref in retag_refs and p[2] != "p":
            if p[2] != "t":
                n_retag += 1
            p[2] = "t"
    n_tile = 0
    bytes_t = 0
    for f in sorted(dest.glob("*_*.json")):
        rows = json.loads(f.read_text())
        changed = False
        for r in rows:
            if r[0] in retag_refs and r[1] != "t":
                r[1] = "t"
                changed = True
                n_tile += 1
        if changed:
            s = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
            f.write_text(s)
            bytes_t += len(s.encode())
    # append new routes
    tile_rows = defaultdict(list)
    for r in new_routes:
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
    for key, extra in tile_rows.items():
        fp = dest / f"{key}.json"
        rows = json.loads(fp.read_text()) if fp.exists() else []
        rows.extend(extra)
        s = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
        fp.write_text(s)
    ov_path.write_text(json.dumps({"pins": pins}, ensure_ascii=False, separators=(",", ":")))
    tiles = sorted(p.name[:-5] for p in dest.glob("*_*.json"))
    return {"retag_pins": n_retag, "retag_rows": n_tile, "added": len(new_routes), "tiles": tiles, "pins": len(pins)}

def trail_pack(U, lat, lon):
    p = U._uk_pack_orig(lat, lon)
    if p:
        return p
    # Scotland sits north of the Solway line used by uk_pack; skip ROI and open ocean.
    if lon <= -8.75 or lon >= 1.9 or lat < 54.5 or lat > 61.0:
        return None
    if lon < -5.5 and lat < 55.4:
        return None
    return "sct"

def main():
    U = load_uk()
    U._uk_pack_orig = U.uk_pack
    U.uk_pack = lambda lat, lon: trail_pack(U, lat, lon)
    # existing refs and themed already in packs
    have = defaultdict(set)
    themed_have = []
    for pid in PACKS:
        ov = json.loads((OUT / pid / "ov.json").read_text())
        for p in ov["pins"]:
            ref = p[7] if len(p) > 7 else ""
            if ref:
                have[pid].add(ref)
            if p[2] == "p":
                continue
            th = themes_of(p[4] or "")
            if th:
                themed_have.append({"ref": ref, "pid": pid, "k": p[2], "name": p[4], "themes": th, "km": (p[8] or 0) / 10})
    retag = {r["ref"] for r in themed_have}
    print("already themed", len(themed_have), "unique refs", len(retag))
    # missing walking relations from the UK trails extract
    want = set()
    class Names(osmium.SimpleHandler):
        def __init__(self):
            super().__init__(); self.cands = []
        def relation(self, r):
            tags = {t.k: t.v for t in r.tags}
            if (tags.get("route") or "") not in U.ROUTES and (tags.get("type") or "") not in ("route", "superroute"):
                return
            name = tags.get("name") or tags.get("name:en") or ""
            if not themes_of(name):
                return
            self.cands.append((r.id, tags, (tags.get("type") or ""), len(list(r.members))))
    nm = Names(); nm.apply_file(str(PBF))
    missing_ids = []
    for rid, tags, typ, nmem in nm.cands:
        ref = "r" + str(rid)
        if rid in SKIP_SUPER:
            print("skip superroute parent", ref, tags.get("name"))
            continue
        if any(ref in have[pid] for pid in PACKS):
            continue
        missing_ids.append(rid)
        want.add(rid)
    print("missing walking candidates", missing_ids)
    added_walk = []
    if missing_ids:
        print("reading", PBF, "for missing geometries")
        sc = RelScan(set(missing_ids))
        # need all ways and child rels; scan whole file
        sc.apply_file(str(PBF), locations=True)
        by_pack = defaultdict(list)
        # flatten have for add_route duplicate check
        for rid in missing_ids:
            if rid not in sc.rels:
                print("not in scan", rid)
                continue
            tags, mem = sc.rels[rid]
            if rid in SKIP_SUPER:
                continue
            # skip parent if every relation member is already shipped
            child_refs = ["r" + str(ref) for typ, ref, role in mem if typ == "r"]
            if child_refs and all(any(c in have[pid] for pid in PACKS) for c in child_refs):
                print("skip parent, children already present", "r"+str(rid), tags.get("name"), child_refs)
                continue
            lines = U.merge_lines(rel_lines(rid, sc.rels, sc.ways))
            added = add_route(U, by_pack, have, tags, lines, rid)
            for pid, rec in added:
                added_walk.append((pid, rec["name"], rec["km10"] / 10, rec["ref"]))
                print("add walk", pid, rec["ref"], rec["name"], rec["km10"] / 10, "km")
        new_by_pack = by_pack
    else:
        new_by_pack = defaultdict(list)
    # tourist driving routes
    roads = json.loads(ROADS.read_text())
    added_road = []
    for rel in roads.get("elements") or []:
        if rel.get("type") != "relation":
            continue
        tags = rel.get("tags") or {}
        name = tags.get("name") or ""
        rid = rel["id"]
        ref = "r" + str(rid)
        lines = U.merge_lines(road_lines(rel))
        added = add_route(U, new_by_pack, have, tags, lines, rid)
        for pid, rec in added:
            added_road.append((pid, rec["name"], rec["km10"] / 10, rec["ref"]))
            print("add road", pid, rec["ref"], rec["name"], rec["km10"] / 10, "km")
    # rewrite packs
    metas = {}
    for pid in PACKS:
        news = new_by_pack.get(pid, [])
        meta = rewrite_pack(U, pid, news, retag)
        metas[pid] = meta
        print("pack", pid, meta)
    # index
    idx_path = OUT / "index.json"
    idx = json.loads(idx_path.read_text())
    idx["v"] = "opt303"
    by_id = {r["id"]: r for r in idx.get("regions", [])}
    for pid in PACKS:
        if pid in by_id:
            by_id[pid]["tiles"] = metas[pid]["tiles"]
    idx_path.write_text(json.dumps({"v": "opt303", "regions": idx["regions"]}, ensure_ascii=False, separators=(",", ":")))
    stats = {
        "already_themed": len(themed_have),
        "retag_refs": len(retag),
        "added_walk": added_walk,
        "added_road": added_road,
        "themed_by": dict(Counter(t for r in themed_have for t in r["themes"])),
        "examples_already": [{"name": r["name"], "themes": r["themes"], "pack": r["pid"], "was": r["k"], "km": r["km"]} for r in themed_have],
        "packs": metas,
    }
    (CACHE / "themed-stats.json").write_text(json.dumps(stats, indent=2, ensure_ascii=False))
    print("ADDED WALKS", len(added_walk), "ADDED ROADS", len(added_road), "RETAG", len(retag))

if __name__ == "__main__":
    main()
