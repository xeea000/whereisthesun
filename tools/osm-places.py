# workspace/whereisthesun/tools/osm-places.py
# SUNNY build step (t388u): shipwrecks and ghost places from a Geofabrik OpenStreetMap extract (ODbL), two passes with
# pyosmium (pip install osmium): pass one keeps tagged nodes and ways, pass two reads the way nodes for a centre point.
#   python3 tools/osm-places.py canada-latest.osm.pbf /tmp/places.json   then   node tools/build-osm-places.js /tmp/places.json
# Wrecks: historic=wreck or seamark:type=wreck. Ghost places: historic=ghost_town, abandoned_village or deserted_village,
# abandoned:place, disused:place, or a place tagged abandoned=yes. Ruins stay with Historic plaques & sites.
import osmium, json, sys
def want(t):
    if t.get("historic") == "wreck" or t.get("seamark:type") == "wreck": return "w"
    if t.get("historic") in ("ghost_town", "abandoned_village", "deserted_village") or "abandoned:place" in t or "disused:place" in t: return "g"
    if "place" in t and t.get("abandoned") == "yes": return "g"
    return None
KEEP = ["name", "historic", "seamark:type", "seamark:wreck:category", "wreck:date_sunk", "wreck:type", "wreck:depth", "depth", "start_date", "end_date",
        "description", "wikipedia", "wikidata", "website", "abandoned:place", "disused:place", "place", "abandoned",
        "operator", "old_name", "inscription"]
KEYS = ("historic", "seamark:type", "abandoned:place", "disused:place", "abandoned")
def tags(o):
    return {x: o.tags[x] for x in KEEP if x in o.tags}
out, ways, need = [], {}, set()
# pass one: the C++ key filter hands only tagged nodes and ways to Python
for o in osmium.FileProcessor(sys.argv[1], osmium.osm.NODE | osmium.osm.WAY).with_filter(osmium.filter.KeyFilter(*KEYS)):
    k = want(o.tags)
    if not k: continue
    if o.is_node():
        if o.location.valid(): out.append({"k": k, "id": "n%d" % o.id, "lon": o.location.lon, "lat": o.location.lat, "t": tags(o)})
    else:
        refs = [r.ref for r in o.nodes]
        refs = refs[:: max(1, len(refs) // 8)]
        ways[o.id] = (k, refs, tags(o))
        need.update(refs)
# pass two: only the nodes those ways use
loc = {}
for n in osmium.FileProcessor(sys.argv[1], osmium.osm.NODE).with_filter(osmium.filter.IdFilter(need)):
    if n.location.valid(): loc[n.id] = (n.location.lon, n.location.lat)
for wid, (k, refs, t) in ways.items():
    pts = [loc[r] for r in refs if r in loc]
    if pts: out.append({"k": k, "id": "w%d" % wid, "t": t, "lon": sum(p[0] for p in pts) / len(pts), "lat": sum(p[1] for p in pts) / len(pts)})
json.dump(out, open(sys.argv[2], "w"))
from collections import Counter
print(len(out), Counter(o["k"] for o in out))
