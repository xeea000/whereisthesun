# workspace/whereisthesun/tools/build-pipelines.py
# SUNNY opt119 undersea pipelines at all zooms, from Geofabrik OpenStreetMap extracts (ODbL), free and keyless.
# Needs osmium. Downloads the extracts of the main offshore oil and gas countries, keeps man_made=pipeline with location=underwater,
# simplifies them and writes data/world/pipelines.geo.json. Usage: python3 tools/build-pipelines.py <work dir>
import json, os, subprocess, sys, glob
W = sys.argv[1] if len(sys.argv) > 1 else "/tmp/geo"
R = ["europe/norway", "europe/great-britain", "europe/netherlands", "europe/denmark", "north-america/us/louisiana", "north-america/us/texas",
     "asia/malaysia-singapore-brunei", "asia/gcc-states", "africa/nigeria", "australia-oceania/australia", "asia/china", "asia/indonesia", "south-america/brazil"]
os.makedirs(W, exist_ok=True)
for r in R:
    n = os.path.join(W, os.path.basename(r))
    if os.path.exists(n + ".pipe.geojson"): continue
    subprocess.run(["curl", "-sfL", "-o", n + ".pbf", "https://download.geofabrik.de/" + r + "-latest.osm.pbf"], check=True)
    subprocess.run(["osmium", "tags-filter", "-O", "-o", n + ".f.pbf", n + ".pbf", "w/man_made=pipeline"], check=True)
    os.remove(n + ".pbf")
    subprocess.run(["osmium", "export", "-O", "-f", "geojsonseq", "-o", n + ".pipe.geojson", n + ".f.pbf"], check=True)
def simp(cs, tol=0.04):
    out = [cs[0]]
    for p in cs[1:-1]:
        if abs(p[0] - out[-1][0]) + abs(p[1] - out[-1][1]) >= tol: out.append(p)
    out.append(cs[-1])
    return [[round(x, 2), round(y, 2)] for x, y in out]
seen, feats = set(), []
for f in sorted(glob.glob(os.path.join(W, "*.pipe.geojson"))):
    for l in open(f):
        l = l.strip("\x1e\n ")
        if not l: continue
        g = json.loads(l)
        p = g["properties"]
        if p.get("location") != "underwater" or g["geometry"]["type"] != "LineString": continue
        k = p.get("@id") or json.dumps(g["geometry"]["coordinates"][:2])
        if k in seen: continue
        seen.add(k)
        cs = simp(g["geometry"]["coordinates"])
        if len(cs) == 2 and cs[0] == cs[1]: continue
        pr = {"s": p.get("substance", "")}
        if p.get("name"): pr["n"] = p["name"]
        if p.get("operator"): pr["o"] = p["operator"]
        feats.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": cs}, "properties": pr})
out = os.path.join(os.path.dirname(__file__), "..", "data", "world", "pipelines.geo.json")
json.dump({"type": "FeatureCollection", "features": feats}, open(out, "w"), separators=(",", ":"), ensure_ascii=False)
print("pipelines", len(feats), os.path.getsize(out))
