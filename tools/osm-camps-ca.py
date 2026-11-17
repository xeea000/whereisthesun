# workspace/whereisthesun/tools/osm-camps-ca.py
# SUNNY build step (opt291): Canada RV / trailer parks and viewpoints from a local OpenStreetMap extract (ODbL).
#   python3 tools/osm-camps-ca.py <canada.pbf> <out.json>   (three passes, no node index file)
# Rows [lon, lat, name, kind r|v, backcountry 0|1, fee, website, operator, osm ref] — same shape as tools/build-packs.js campRow.
import osmium, json, re, sys

def cut(s, n):
    s = (s or "").strip()
    return s if len(s) <= n else s[:n - 1] + "…"

def kind(t):
    parts = set((t.get("tourism") or "").lower().split(";"))
    if "viewpoint" in parts:
        return "v"
    if "caravan_site" in parts:
        return "r"
    if "camp_site" in parts:
        name = t.get("name") or ""
        if re.search(r"\b(r\.?\s*v\.?|rv|trailer|caravan)\s+parks?\b", name, re.I):
            return "r"
        if re.search(r"\b(rv|trailer)\s+(resort|campground|camp)\b", name, re.I):
            return "r"
    return ""

def row(t, lat, lon, typ, oid):
    k = kind(t)
    if not k:
        return None
    if k == "v":
        nm = t.get("name") or "Viewpoint"
    else:
        nm = t.get("name") or "RV / trailer park"
    return [round(lon, 5), round(lat, 5), cut(nm, 80), k, 1 if t.get("backcountry") == "yes" else 0,
            cut(t.get("fee"), 20), cut(t.get("website"), 120), cut(t.get("operator"), 60), typ[0] + str(oid)]

pbf, dst = sys.argv[1], sys.argv[2]
found, ways, rels, need_w, need_n = [], {}, [], set(), set()
for o in osmium.FileProcessor(pbf).with_filter(osmium.filter.KeyFilter("tourism")):
    t = {k: v for k, v in o.tags}
    if not kind(t):
        continue
    if o.is_node():
        if o.location.valid():
            r = row(t, o.location.lat, o.location.lon, "node", o.id)
            if r:
                found.append(r)
    elif o.is_way():
        refs = [n.ref for n in o.nodes]
        ways[o.id] = (t, refs)
        need_n.update(refs)
        found.append(["w", o.id, t])
    elif o.is_relation():
        ms = [m.ref for m in o.members if m.type == "w"]
        if ms:
            rels.append((o.id, t, ms))
            need_w.update(ms)
            found.append(["r", o.id, t, ms])
print("pass 1", sum(1 for f in found if not isinstance(f[0], str)), "ways", sum(1 for f in found if f[0] == "w"),
      "rels", sum(1 for f in found if f[0] == "r"), flush=True)
need_w -= set(ways)
for w in osmium.FileProcessor(pbf, osmium.osm.WAY).with_filter(osmium.filter.IdFilter(need_w)):
    refs = [n.ref for n in w.nodes]
    ways[w.id] = (None, refs)
    need_n.update(refs)
print("pass 2", len(ways), "nodes needed", len(need_n), flush=True)
loc = {}
for n in osmium.FileProcessor(pbf, osmium.osm.NODE).with_filter(osmium.filter.IdFilter(need_n)):
    if n.location.valid():
        loc[n.id] = (n.location.lat, n.location.lon)
out = []
for f in found:
    if not isinstance(f[0], str):
        out.append(f)
        continue
    typ, oid, t = f[0], f[1], f[2]
    if typ == "w":
        refs = ways.get(oid, (None, []))[1]
    else:
        refs = [r for wid in f[3] for r in ways.get(wid, (None, []))[1]]
    ps = [loc[r] for r in refs if r in loc]
    if not ps:
        continue
    r = row(t, sum(p[0] for p in ps) / len(ps), sum(p[1] for p in ps) / len(ps),
            "way" if typ == "w" else "relation", oid)
    if r:
        out.append(r)
json.dump(out, open(dst, "w"), ensure_ascii=False)
print("wrote", len(out), "r", sum(1 for r in out if r[3] == "r"), "v", sum(1 for r in out if r[3] == "v"))
