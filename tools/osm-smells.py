# workspace/whereisthesun/tools/osm-smells.py
# SUNNY build step (t406u): smell sources in Canada from a local OpenStreetMap extract (ODbL), for tools/build-smells.js.
#   python3 tools/osm-smells.py <canada.pbf> <out.json>   (reads the pbf only, three passes, no node index file)
# Rows [lat, lon, code, name, operator, osm ref, tag]; a way or relation is placed at the mean of its nodes.
import osmium, json, sys
def code(t):
    g = t.get
    if g("landuse") == "landfill": return "landfill"
    if g("man_made") == "wastewater_plant" or g("industrial") in ("wastewater", "sewage"): return "sewage"
    if g("content") == "manure" or g("basin") == "manure" or g("landuse") == "feedlot" or g("building") == "sty" or g("animal_keeping") == "pig": return "manure"
    if g("industrial") in ("paper_mill", "pulp_mill"): return "pulp"
    if g("industrial") in ("slaughterhouse", "rendering", "fish_processing", "tannery") or g("craft") == "tannery": return "meat"
    if g("industrial") in ("refinery", "chemical"): return "refinery"
    if g("industrial") == "compost": return "compost"
    if g("natural") == "fumarole": return "sulphur"
    if g("natural") == "hot_spring" and any("sulph" in (v or "").lower() or "sulf" in (v or "").lower() for v in (g("name"), g("description"), g("water_characteristic"), g("note"))): return "sulphur"
    return ""
KEYS = ["landuse", "man_made", "industrial", "content", "basin", "building", "animal_keeping", "craft", "natural"]
pbf, dst = sys.argv[1], sys.argv[2]
found, ways, rels, need_w, need_n = [], {}, [], set(), set()
for o in osmium.FileProcessor(pbf).with_filter(osmium.filter.KeyFilter(*KEYS)):
    t = {k: v for k, v in o.tags}
    c = code(t)
    if not c: continue
    row = [c, t.get("name", ""), t.get("operator", ""), "", t.get("industrial") or t.get("man_made") or t.get("landuse") or t.get("natural") or t.get("building") or t.get("content", "")]
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
