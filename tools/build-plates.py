# SUNNY tectonic plates. Run: python3 tools/build-plates.py /path/to/pb
# Plates and boundary steps: Bird (2003) PB2002, GeoJSON from github.com/fraxen/tectonicplates (ODC-By).
# Plate rotation poles: NNR-MORVEL56, Argus, Gordon and DeMets (2011), Table 1, saved as poles.json.
# Writes data/world/plates.geo.json (plates and typed boundaries) and data/world/plate-motion.json (3 degree velocity grid, mm per year).
import json, math, sys
from shapely.geometry import shape, Point, mapping
from shapely.strtree import STRtree
src = sys.argv[1]
poles = json.load(open(src + "/poles.json"))
ALIAS = {"AF": "NB_NUBIA", "SO": "SM", "YA": "YZ"}
poles["NB_NUBIA"] = [47.68, -68.44, 0.292, "Nubia (Africa)"]
KIND = {"SUB": "sub", "OCB": "conv", "CCB": "conv", "OSR": "div", "CRB": "div", "OTF": "tr", "CTF": "tr"}
plates = json.load(open(src + "/PB2002_plates.json"))["features"]
feats, geoms, codes = [], [], []
def r(c):
    return [round(c[0], 2), round(c[1], 2)]
for f in plates:
    code = f["properties"]["Code"]
    p = poles.get(ALIAS.get(code, code))
    g = shape(f["geometry"]).buffer(0)
    geoms.append(g); codes.append(code)
    s = g.simplify(0.05, preserve_topology=True)
    m = mapping(s)
    rings = m["coordinates"] if m["type"] == "Polygon" else [x for poly in m["coordinates"] for x in poly]
    polys = [[[r(c) for c in ring] for ring in poly] for poly in (m["coordinates"] if m["type"] == "MultiPolygon" else [m["coordinates"]])]
    feats.append({"type": "Feature", "properties": {"t": "plate", "code": code, "name": f["properties"]["PlateName"], "w": p[2] if p else None, "pole": p[:3] if p else None},
                  "geometry": {"type": "MultiPolygon", "coordinates": polys}})
steps = json.load(open(src + "/PB2002_steps.json"))["features"]
cur = None
def flush():
    if cur:
        feats.append({"type": "Feature", "properties": {"t": "edge", "k": cur["k"], "pair": cur["pair"], "v": round(sum(cur["v"]) / len(cur["v"]), 1)},
                      "geometry": {"type": "LineString", "coordinates": cur["c"]}})
for f in steps:
    p = f["properties"]; k = KIND[p["STEPCLASS"]]; a = [p["STARTLONG"], p["STARTLAT"]]; b = [p["FINALLONG"], p["FINALLAT"]]
    if abs(a[0] - b[0]) > 180:
        flush(); cur = None; continue
    if cur and cur["k"] == k and cur["pair"] == p["PLATEBOUND"] and cur["c"][-1] == r(a):
        cur["c"].append(r(b)); cur["v"].append(p["VELOCITYLE"])
    else:
        flush(); cur = {"k": k, "pair": p["PLATEBOUND"], "c": [r(a), r(b)], "v": [p["VELOCITYLE"]]}
flush()
json.dump({"type": "FeatureCollection", "features": feats}, open("data/world/plates.geo.json", "w"), separators=(",", ":"))
tree = STRtree(geoms)
S, R = 3, 6371.0
u, v = [], []
for la in range(-87, 90, S):
    for lo in range(-180, 180, S):
        pt = Point(lo + 0.5 * S, la + 0.5 * S)
        hit = [i for i in tree.query(pt) if geoms[i].contains(pt)]
        p = poles.get(ALIAS.get(codes[hit[0]], codes[hit[0]])) if hit else None
        if not p:
            u.append(0); v.append(0); continue
        w = math.radians(p[2])
        wl, wo = math.radians(p[0]), math.radians(p[1])
        W = [w * math.cos(wl) * math.cos(wo), w * math.cos(wl) * math.sin(wo), w * math.sin(wl)]
        y, x = math.radians(pt.y), math.radians(pt.x)
        q = [R * math.cos(y) * math.cos(x), R * math.cos(y) * math.sin(x), R * math.sin(y)]
        V = [W[1] * q[2] - W[2] * q[1], W[2] * q[0] - W[0] * q[2], W[0] * q[1] - W[1] * q[0]]
        e = -math.sin(x) * V[0] + math.cos(x) * V[1]
        n = -math.sin(y) * math.cos(x) * V[0] - math.sin(y) * math.sin(x) * V[1] + math.cos(y) * V[2]
        u.append(round(e)); v.append(round(n))
json.dump({"step": S, "lat0": -87, "lon0": -180, "nx": 120, "u": u, "v": v}, open("data/world/plate-motion.json", "w"), separators=(",", ":"))
print(len(feats), "features", len(u), "cells")
