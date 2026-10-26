# workspace/whereisthesun/tools/build-cratons.py
# SUNNY opt115 Cratons layer: Archean (older than 2.5 Ga) basement polygons from Hasterok et al. (2022) global_tectonics, GPL-3.0.
# Needs pyshp. Writes data/world/cratons.geo.json. Usage: python3 tools/build-cratons.py
import json, os, urllib.request, shapefile, io
B = "https://raw.githubusercontent.com/dhasterok/global_tectonics/main/plates%26provinces/shp/cratons."
f = {e: io.BytesIO(urllib.request.urlopen(B + e).read()) for e in ("shp", "shx", "dbf")}
r = shapefile.Reader(shp=f["shp"], shx=f["shx"], dbf=f["dbf"], encoding="latin1")
def ring(pts):
    out = []
    for x, y in pts:
        p = [round(x, 1), round(y, 1)]
        if not out or abs(p[0] - out[-1][0]) + abs(p[1] - out[-1][1]) >= 0.2: out.append(p)
    if out[0] != out[-1]: out.append(out[0])
    return out if len(out) >= 4 else None
feats = []
for sr in r.shapeRecords():
    s, rec = sr.shape, sr.record
    parts = list(s.parts) + [len(s.points)]
    rings = [ring(s.points[parts[i]:parts[i + 1]]) for i in range(len(parts) - 1)]
    rings = [g for g in rings if g]
    if not rings: continue
    feats.append({"type": "Feature", "geometry": {"type": "MultiPolygon", "coordinates": [[g] for g in rings]},
                  "properties": {"n": rec["prov_name"].strip(), "t": rec["prov_type"].strip(), "o": rec["lastorogen"].strip(),
                                 "c": rec["continent"].strip(), "w": 1 if rec["reworked"].strip() == "yes" else 0}})
out = os.path.join(os.path.dirname(__file__), "..", "data", "world", "cratons.geo.json")
json.dump({"type": "FeatureCollection", "features": feats}, open(out, "w"), separators=(",", ":"))
print("cratons", len(feats), os.path.getsize(out))
