# workspace/whereisthesun/tools/osm-maritime.py
# SUNNY build step (t397u): maritime places in Canada from a local OpenStreetMap extract (ODbL), for tools/build-maritime.js.
#   python3 tools/osm-maritime.py <canada.pbf> <out.json>   (reads the pbf only, three passes, no node index file)
# Rows [lat, lon, code, name, operator, osm ref, tag]; a way or relation is placed at the mean of its nodes.
import osmium, json, sys
def code(t):
    g = t.get
    if g("waterway") == "dock" and g("dock") in ("drydock", "floating"): return "dry"
    if g("industrial") == "shipyard" or g("landuse") == "shipyard": return "yard"
    if g("leisure") == "slipway": return "ramp"
    if g("leisure") == "marina": return "marina"
    if g("industrial") == "port" or g("landuse") == "port" or g("harbour") == "yes": return "port"
    return ""
KEYS = ["waterway", "dock", "industrial", "landuse", "leisure", "harbour"]
pbf, dst = sys.argv[1], sys.argv[2]
found, ways, rels, need_w, need_n = [], {}, [], set(), set()
for o in osmium.FileProcessor(pbf).with_filter(osmium.filter.KeyFilter(*KEYS)):
    t = {k: v for k, v in o.tags}
    c = code(t)
    if not c: continue
    row = [c, t.get("name", ""), t.get("operator", ""), "", t.get("dock") or t.get("industrial") or t.get("leisure") or t.get("landuse") or t.get("harbour", "")]
    if o.is_node():
        if o.location.valid(): found.append([round(o.location.lat, 5), round(o.location.lon, 5)] + row[:3] + ["node/%d" % o.id, row[4]])
    elif o.is_way():
        refs = [n.ref for n in o.nodes]; ways[o.id] = refs; need_n.update(refs); found.append([None, ("w", o.id)] + row[:3] + ["way/%d" % o.id, row[4]])
    elif o.is_relation():
        ms = [m.ref for m in o.members if m.type == "w"]
        if ms: rels.append(o.id); need_w.update(ms); found.append([None, ("r", ms)] + row[:3] + ["relation/%d" % o.id, row[4]])
print("pass 1", len(found), flush=True)
need_w -= set(ways)
for w in osmium.FileProcessor(pbf, osmium.osm.WAY).with_filter(osmium.filter.IdFilter(need_w)):
    refs = [n.ref for n in w.nodes]; ways[w.id] = refs; need_n.update(refs)
print("pass 2", len(ways), len(need_n), flush=True)
loc = {}
for n in osmium.FileProcessor(pbf, osmium.osm.NODE).with_filter(osmium.filter.IdFilter(need_n)):
    loc[n.id] = (n.location.lat, n.location.lon)
out = []
for f in found:
    if f[0] is None:
        kind, ref = f[1]
        refs = ways.get(ref, []) if kind == "w" else [r for w in ref for r in ways.get(w, [])]
        ps = [loc[r] for r in refs if r in loc]
        if not ps: continue
        f = [round(sum(p[0] for p in ps) / len(ps), 5), round(sum(p[1] for p in ps) / len(ps), 5)] + f[2:]
    out.append(f)
json.dump(out, open(dst, "w"), ensure_ascii=False)
print(len(out))
