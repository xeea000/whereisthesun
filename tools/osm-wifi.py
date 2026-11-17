# workspace/whereisthesun/tools/osm-wifi.py
# SUNNY build step (t404u): Canada Wi-Fi spots from a local OpenStreetMap extract (ODbL), two passes so no node index file is needed.
#   python3 tools/osm-wifi.py <canada.pbf> <out.json>   (reads the pbf only); rows [lat, lon, name, kind, fee, operator, ssid, city, osm ref]
import osmium, json, sys
WANT = {"wlan", "yes", "wifi", "public", "terminal;wlan", "wlan;terminal"}
KEYS = ("amenity", "shop", "tourism", "leisure", "office", "building", "public_transport", "railway", "aeroway")
pbf, dst = sys.argv[1], sys.argv[2]
out, ways, need = [], [], set()
def row(t, lat, lon, ref):
    kind = next((k + "=" + t[k] for k in KEYS if k in t), "")
    return [round(lat, 5), round(lon, 5), t.get("name", ""), kind, t.get("internet_access:fee", ""), t.get("operator", "") or t.get("brand", ""),
            t.get("internet_access:ssid", ""), t.get("addr:city", ""), ref]
fp = osmium.FileProcessor(pbf).with_filter(osmium.filter.KeyFilter("internet_access"))
for o in fp:
    t = {k: v for k, v in o.tags}
    if t.get("internet_access") not in WANT: continue
    if o.is_node() and o.location.valid(): out.append(row(t, o.location.lat, o.location.lon, "node/%d" % o.id))
    elif o.is_way():
        refs = [n.ref for n in o.nodes]; ways.append((t, refs, o.id)); need.update(refs)
print("nodes", len(out), "ways", len(ways), flush=True)
loc = {}
for n in osmium.FileProcessor(pbf, osmium.osm.NODE).with_filter(osmium.filter.IdFilter(need)):
    if n.id in need: loc[n.id] = (n.location.lat, n.location.lon)
for t, refs, wid in ways:
    ps = [loc[r] for r in refs if r in loc]
    if ps: out.append(row(t, sum(p[0] for p in ps) / len(ps), sum(p[1] for p in ps) / len(ps), "way/%d" % wid))
json.dump(out, open(dst, "w"), ensure_ascii=False)
print(len(out))
