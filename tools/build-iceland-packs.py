#!/usr/bin/env python3
# workspace/whereisthesun/tools/build-iceland-packs.py
# SUNNY opt305: Iceland campsites, viewpoints and historic sites from a local
# OpenStreetMap extract, written as a region pack for the existing Campsites,
# Lookouts and Historic plaques layers. Dedupes historic sites already in the
# worldwide Heritage and Ancient layers. Usage:
#   python3 tools/build-iceland-packs.py [features.osm.pbf]
#   node tools/write-iceland-packs.js
from __future__ import annotations
import json, math, re, sys
from pathlib import Path
import osmium

PBF = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/is-trails-cache/is-features.osm.pbf")
OUT = Path("/tmp/is-trails-cache/pack-items.json")
# Already in worldwide history / ancient layers (Wikidata).
HAVE = [
    (63.304, -20.6047, "surtsey"),
    (64.2581, -21.125, "thingvellir"),
    (64.2581, -21.125, "pingvellir"),
    (65.0592, -21.5411, "eiriksstadir"),
    (64.15167, -19.7525, "stong"),
    (64.15167, -19.7525, "thjodveldisbaerinn"),
    (65.0396, -14.95078, "skriduklaustur"),
    (65.77824, -18.17019, "gasir"),
]
HIST_OK = {
    "plaque", "blue_plaque", "monument", "memorial", "fort", "battlefield",
    "castle", "ruins", "archaeological_site", "rune_stone", "church",
    "farm", "settlement",
}

def norm(s):
    s = (s or "").lower().replace("þ", "th").replace("ð", "d")
    for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ö", "o"), ("ú", "u"), ("ý", "y"), ("æ", "ae")):
        s = s.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "", s)

def hav_m(a, b):
    r = 6371000.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))

def already(lat, lon, name):
    n = norm(name)
    for hlat, hlon, hname in HAVE:
        if hav_m((lat, lon), (hlat, hlon)) < 400:
            if not n or not hname or hname in n or n[:8] in hname or n in hname:
                return True
    return False

def mid(cs):
    if not cs:
        return None
    return (sum(c[0] for c in cs) / len(cs), sum(c[1] for c in cs) / len(cs))

def cut(s, n):
    s = (s or "").strip()
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"

def camp_kind(tags):
    tour = tags.get("tourism") or ""
    if "viewpoint" in tour.split(";"):
        return "v"
    if "caravan_site" in tour.split(";"):
        return "r"
    if tags.get("man_made") == "tower" and re.search(r"fire_lookout|observation", tags.get("tower:type") or ""):
        return "l"
    if "camp_site" in tour.split(";") and re.search(r"\b(r\.?\s*v\.?|rv|trailer|caravan)\s+parks?\b", tags.get("name") or "", re.I):
        return "r"
    if "camp_site" in tour.split(";"):
        return "c"
    return None

def camp_name(tags, k):
    return tags.get("name") or tags.get("name:is") or tags.get("name:en") or (
        "Viewpoint" if k == "v" else "RV / trailer park" if k == "r" else
        "Fire lookout tower" if k == "l" and (tags.get("tower:type") or "") == "fire_lookout" else
        "Lookout tower" if k == "l" else "Campsite"
    )

class Scan(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.camps = []
        self.plaques = []
        self.seen_c = set()
        self.seen_p = set()
        self.ways = {}
    def _add_camp(self, typ, oid, tags, lon, lat):
        k = camp_kind(tags)
        if not k or lon is None:
            return
        key = typ[0] + str(oid)
        if key in self.seen_c:
            return
        self.seen_c.add(key)
        self.camps.append({
            "lon": round(lon, 5), "lat": round(lat, 5), "code": k,
            "row": [
                cut(camp_name(tags, k), 80),
                1 if tags.get("backcountry") == "yes" else 0,
                cut(tags.get("fee"), 20),
                cut(tags.get("website"), 120),
                cut(tags.get("operator"), 60),
                key,
            ],
        })
    def _add_plaque(self, typ, oid, tags, lon, lat):
        hist = tags.get("historic") or ""
        if tags.get("memorial") == "plaque":
            kind = "plaque"
        elif hist in HIST_OK:
            kind = hist
        elif tags.get("tourism") == "information" and tags.get("board_type") == "history":
            kind = "history board"
        else:
            return
        name = tags.get("name") or tags.get("name:is") or tags.get("name:en") or tags.get("memorial:name") or ""
        insc = tags.get("inscription") or tags.get("description") or ""
        if not name and not insc:
            return
        if lon is None or already(lat, lon, name):
            return
        key = typ[0] + str(oid)
        if key in self.seen_p:
            return
        self.seen_p.add(key)
        self.plaques.append({
            "lon": round(lon, 5), "lat": round(lat, 5), "code": "o",
            "row": [
                cut(name or "Historical plaque", 90),
                kind,
                cut(insc, 300),
                cut(tags.get("start_date"), 20),
                cut(tags.get("website"), 120),
                key,
            ],
        })
    def node(self, n):
        if not n.location.valid():
            return
        tags = {t.k: t.v for t in n.tags}
        self._add_camp("node", n.id, tags, n.lon, n.lat)
        self._add_plaque("node", n.id, tags, n.lon, n.lat)
    def way(self, w):
        tags = {t.k: t.v for t in w.tags}
        cs = []
        try:
            for nd in w.nodes:
                if not nd.location.valid():
                    return
                cs.append((nd.lon, nd.lat))
        except Exception:
            return
        if len(cs) >= 2:
            self.ways[w.id] = cs
        c = mid(cs)
        if not c:
            return
        self._add_camp("way", w.id, tags, c[0], c[1])
        self._add_plaque("way", w.id, tags, c[0], c[1])
    def relation(self, r):
        tags = {t.k: t.v for t in r.tags}
        if not (camp_kind(tags) or tags.get("historic") or tags.get("memorial") == "plaque"):
            return
        parts = []
        for m in r.members:
            if m.type == "w" and m.ref in self.ways:
                parts.extend(self.ways[m.ref])
        c = mid(parts)
        if not c:
            return
        self._add_camp("relation", r.id, tags, c[0], c[1])
        self._add_plaque("relation", r.id, tags, c[0], c[1])

def main():
    print("reading", PBF)
    h = Scan()
    h.apply_file(str(PBF), locations=True)
    # one more pass is not needed; relations after ways in OSM files
    from collections import Counter
    print("camps", len(h.camps), Counter(c["code"] for c in h.camps))
    print("plaques", len(h.plaques), Counter(p["row"][1] for p in h.plaques))
    OUT.write_text(json.dumps({"camps": h.camps, "plaques": h.plaques}, ensure_ascii=False))
    print("wrote", OUT, "bytes", OUT.stat().st_size)

if __name__ == "__main__":
    main()
