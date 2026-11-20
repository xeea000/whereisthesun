"""SUNNY land value data build (shipped as data/land/).

Inputs default to /workspace/t407/raw (override with SUNNY_LAND_RAW).
Output defaults to data/land/ when run from the app folder (override with SUNNY_LAND_OUT).
Quebec cache /workspace/t407/land_ca_v2.pkl and /workspace/t407/qc_units.pkl.

Sources (never invent values; areas with no source stay blank):
  Quebec land   Rôle d'évaluation foncière du Québec 2026 (MAMH, CC BY 4.0)
                https://www.donneesquebec.ca/recherche/dataset/roles-d-evaluation-fonciere-du-quebec
  Vancouver land City of Vancouver property tax report 2026 (BC Assessment, July 1 2025)
                https://opendata.vancouver.ca/explore/dataset/property-tax-report/
  US land       FHFA Working Paper 19-01 v4, single-family land prices 2022
                https://www.fhfa.gov/research/papers/wp1901
  Canada homes  Statistics Canada 2021 Census Profile, characteristic 1474 (median value of dwellings)
                https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/prof/index.cfm?Lang=E
  DA polygons   Statistics Canada 2021 cartographic dissemination areas (OGL-Canada)
  US polygons   Census Bureau 2019 cartographic tracts and counties
  FX            Bank of Canada annual average USD to CAD (Valet FXUSDCAD)
"""

import json, glob, math, os, sys
import numpy as np, pandas as pd, geopandas as gpd
from shapely.geometry import mapping, box
from shapely import set_precision
R = os.environ.get("SUNNY_LAND_RAW", "/workspace/t407/raw/")
if not R.endswith("/"): R += "/"
O = os.environ.get("SUNNY_LAND_OUT", os.path.join(os.path.dirname(__file__), "..", "data", "land") + "/")
O = os.path.normpath(O) + "/"
os.makedirs(O + "t", exist_ok=True)
FX = {2022: 1.3013, 2023: 1.3497, 2024: 1.3698, 2025: 1.3978}  # Bank of Canada annual average USD->CAD (Valet FXUSDCAD)
ACRE = 4046.8564224
TILE = 2

def log(*a): print(*a, flush=True)

# ---- DA polygons (StatCan 2021 cartographic, simplified ~40 m at fetch)
fs = []
for f in sorted(glob.glob(R + "da/p*.json")): fs += json.load(open(f))["features"]
da = gpd.GeoDataFrame.from_features(fs, crs=4326)[["DAUID", "geometry"]]
da = da[da.geometry.notna() & ~da.geometry.is_empty].reset_index(drop=True)
log("DA", len(da))

# ---- Census 2021 median value of dwellings (char 1474)
c = pd.read_csv(R + "da1474-DA.csv", dtype=str, usecols=["REF_AREA", "CHARACTERISTIC", "OBS_VALUE", "ALT_GEO_CODE"])
c = c[c.CHARACTERISTIC == "1474"].dropna(subset=["OBS_VALUE"])
home = dict(zip(c.ALT_GEO_CODE, pd.to_numeric(c.OBS_VALUE)))
log("census home values", len(home))

import pickle
CACHE = "/workspace/t407/land_ca_v2.pkl"
if os.path.exists(CACHE):
    land = pickle.load(open(CACHE, "rb"))
else:
    land = {}  # DAUID -> dict(v=CAD/m2, med=median lot CAD/m2, n=units, src, date)
    # ---- Quebec assessment roll 2026 (MAMH, CC BY 4.0): land value (RL0402A) / land area (RL0302A)
    q = pd.read_pickle("/workspace/t407/qc_units.pkl")
    q = q[(q.rl0402a > 0) & (q.rl0302a > 0) & q.lon.notna()]
    qg = gpd.GeoDataFrame(q[["rl0402a", "rl0302a", "dat_cond_mrche", "code_mun"]], geometry=gpd.points_from_xy(q.lon, q.lat), crs=4269).to_crs(4326)
    qda = da[da.DAUID.str.startswith("24")]
    j = gpd.sjoin(qg, qda, predicate="within", how="inner")
    j["r"] = j.rl0402a / j.rl0302a
    g = j.groupby("DAUID")
    agg = pd.DataFrame({"V": g.rl0402a.sum(), "A": g.rl0302a.sum(), "n": g.size(), "med": g.r.median(),
                        "date": g.dat_cond_mrche.agg(lambda s: str(s.mode().iloc[0])[:10])})
    for k, r in agg.iterrows():
        if r.n < 5: continue  # too few units to stand for the area
        land[k] = dict(v=r.V / r.A, med=r.med, n=int(r.n), src="qc", date=r.date)
    log("QC DAs", sum(1 for v in land.values() if v["src"] == "qc"), "units", len(j))

    # ---- City of Vancouver property tax report 2026 (BC Assessment values, July 1 2025) + parcel polygons (OGL-Vancouver)
    t = pd.read_csv(R + "van-tax-2026.csv", dtype={"land_coordinate": str})
    tv = t.groupby("land_coordinate").current_land_value.sum()
    p = gpd.read_file(R + "van-parcels.geojson")[["tax_coord", "geometry"]]
    p = p[p.tax_coord.isin(tv.index)].copy()
    p["V"] = p.tax_coord.map(tv)
    pm = p.to_crs(26910); p["A"] = pm.area.values
    p = p[p.A > 1].copy(); pm = p.to_crs(26910)
    p["r"] = p.V / p.A
    pc = gpd.GeoDataFrame(p[["V", "A", "r"]], geometry=pm.centroid.to_crs(4326).values, crs=4326)
    vj = gpd.sjoin(pc, da[da.DAUID.str.startswith("59")], predicate="within")
    dam = da.set_index("DAUID").to_crs(26910).area
    g = vj.groupby("DAUID")
    for k, V in g.V.sum().items():
        A = g.A.sum()[k]
        if A / dam[k] < 0.35 or g.size()[k] < 5: continue  # DA mostly outside the city (or mostly roads/parks with no roll)
        land[k] = dict(v=V / A, med=float(g.r.median()[k]), n=int(g.size()[k]), src="van", date="2025-07-01")
    log("Vancouver DAs", sum(1 for v in land.values() if v["src"] == "van"), "parcels", len(p))

    pickle.dump(land, open(CACHE, "wb"))
# ---- FHFA WP 19-01 v4 (June 2024), panel 2022, land value per acre as-is (single-family parcels)
import openpyxl
wb = openpyxl.load_workbook(R + "fhfa-land-2024.xlsx", read_only=True)
def panel(sheet, idcol):  # 2022 rows of a balanced panel sheet
    out = {}
    for row in wb[sheet].iter_rows(min_row=3, values_only=True):
        if row[3] == 2022 and row[5] not in (None, "", "."):
            out[row[idcol]] = dict(acre=float(row[5]), share=row[6], name=row[1])
    return out
tr = panel("Panel Census Tracts", 2); co = panel("Panel Counties", 2)
def yr(sheet, idcol, y):
    return {r[idcol]: float(r[5]) for r in wb[sheet].iter_rows(min_row=3, values_only=True) if r[3] == y and isinstance(r[5], (int, float))}
c15, s15, s22 = yr("Panel Counties", 2, 2015), yr("Panel States", 2, 2015), yr("Panel States", 2, 2022)
def idx(cfips):  # FHFA's own land price change 2015->2022: the county's if it has a panel, else its state's
    if cfips in co and cfips in c15: return co[cfips]["acre"] / c15[cfips], "county"
    st = cfips // 1000
    return s22[st] / s15[st], "state"
def pooled(sheet, idcol):
    out = {}
    for row in wb[sheet].iter_rows(min_row=3, values_only=True):
        if isinstance(row[4], (int, float)): out[row[idcol]] = dict(acre=float(row[4]), share=row[5], name=row[1])
    return out
trp, cop = pooled("Cross-Section Census Tracts", 2), pooled("Cross-Section Counties ", 2)
for g, d in trp.items():
    if g in tr: continue
    k, how = idx(g // 1000000); tr[g] = dict(acre=d["acre"] * k, share=d["share"], name=d["name"], how=how)
for g, d in cop.items():
    if g in co: continue
    k, how = idx(g); co[g] = dict(acre=d["acre"] * k, share=d["share"], name=d["name"], how=how)
log("FHFA tracts with pooled", len(tr), "counties", len(co))
ust = gpd.read_file("zip://" + R + "cb_2019_us_tract_500k.zip")[["GEOID", "geometry"]].to_crs(4326)
usc = gpd.read_file("zip://" + R + "cb_2019_us_county_500k.zip")[["GEOID", "NAME", "geometry"]].to_crs(4326)
ust["id"] = ust.GEOID.astype(int); usc["id"] = usc.GEOID.astype(int)
ust = ust[ust.id.isin(tr.keys())]; usc = usc[usc.id.isin(co.keys())]
log("tract polys matched", len(ust), "county polys", len(usc))
# a county average fills only the part of the county that no tract estimate covers (no double drawing)
ust["cf"] = ust.GEOID.str[:5]
tu = ust.groupby("cf").geometry.apply(lambda g: g.union_all())
def rest(r):
    if r.GEOID not in tu.index: return r.geometry
    d = r.geometry.buffer(0).difference(tu[r.GEOID].buffer(0))
    return d if d.area > 1e-6 else None
usc["geometry"] = usc.apply(rest, axis=1)
usc = usc[usc.geometry.notna() & ~usc.geometry.is_empty]
log("county remainders", len(usc))

# ---- features: [id, kind, value, extra...] kind: q qc land, v van land, t FHFA tract, c FHFA county, h census home
feats = []
def add(fid, kind, geom, props):
    feats.append((fid, kind, geom, props))
for _, r in da.iterrows():
    k = r.DAUID
    hv = int(home[k]) if k in home else None  # one geometry per DA: land value (if any) and census home value side by side
    if k in land:
        L = land[k]; add(k, "q" if L["src"] == "qc" else "v", r.geometry, [round(L["v"], 2), round(L["med"], 2), L["n"], L["date"], hv])
    elif hv is not None:
        add(k, "h", r.geometry, [None, None, None, None, hv])
for _, r in ust.iterrows():
    d = tr[r.id]; add(str(r.GEOID), "t", r.geometry, [round(d["acre"] / ACRE * FX[2022], 2), round(d["acre"] / ACRE, 2), d["share"], d.get("how", "")])
for _, r in usc.iterrows():
    d = co[r.id]; add("c" + str(r.GEOID), "c", r.geometry, [round(d["acre"] / ACRE * FX[2022], 2), round(d["acre"] / ACRE, 2), d["share"], d["name"], d.get("how", "")])
log("features", len(feats))

# ---- encode: rings as flat int arrays (1e4 deg), first point absolute, then deltas
def enc(geom):
    geom = geom.simplify(0.00025, preserve_topology=True)
    polys = [geom] if geom.geom_type == "Polygon" else list(getattr(geom, "geoms", []))
    out = []
    for pg in polys:
        if pg.geom_type != "Polygon" or pg.area < 2e-8: continue
        rings = []
        for ring in [pg.exterior] + list(pg.interiors):
            xy = np.round(np.asarray(ring.coords)[:, :2] * 1e4).astype(np.int64)
            keep = np.ones(len(xy), bool); keep[1:] = np.any(np.diff(xy, axis=0) != 0, axis=1)
            xy = xy[keep]
            if len(xy) < 4: continue
            d = np.vstack([xy[:1], np.diff(xy, axis=0)]).ravel().tolist()
            rings.append(d)
        if rings: out.append(rings)
    return out
tiles = {}; big = []
for fid, kind, geom, props in feats:
    e = enc(geom)
    if not e: continue
    row = [fid, kind] + props + [e]
    x0, y0, x1, y1 = geom.bounds
    tx = range(math.floor(x0 / TILE), math.floor(x1 / TILE) + 1); ty = range(math.floor(y0 / TILE), math.floor(y1 / TILE) + 1)
    if len(tx) * len(ty) > 12: big.append(row); continue
    for a in ty:
        for b in tx:
            if geom.intersects(box(b * TILE, a * TILE, (b + 1) * TILE, (a + 1) * TILE)):
                tiles.setdefault(f"{a * TILE}_{b * TILE}", []).append(row)
for k, rows in tiles.items():
    json.dump(rows, open(O + "t/" + k + ".json", "w"), separators=(",", ":"))
json.dump(big, open(O + "big.json", "w"), separators=(",", ":"))
log("tiles", len(tiles), "big", len(big))

# ---- overview rasters (Web Mercator, z5 pixels) with palette classes
from PIL import Image, ImageDraw
LAND_BR = [2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000]  # CAD per m2 class edges (14 classes, about 2.5x apart)
HOME_BR = [100e3, 150e3, 250e3, 350e3, 450e3, 600e3, 800e3, 1000e3, 1300e3, 1700e3, 2200e3, 3000e3, 4000e3]  # CAD per dwelling
# 14-step ramp: deep blue > violet > magenta > coral > pale peach; lightness rises with value; no yellow or green (the Stinky map plume is #b8c934)
ANCH = ["#22306e", "#3c4db0", "#7a4bc4", "#b73fae", "#e24f7e", "#f78f70", "#ffd2c2"]
def _ramp(n):
    a = np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)] for h in ANCH], float); out = []
    for t in np.linspace(0, len(ANCH) - 1, n):
        i = min(int(t), len(ANCH) - 2); f = t - i; c = a[i] * (1 - f) + a[i + 1] * f
        out.append("#%02x%02x%02x" % tuple(int(round(x)) for x in c))
    return out
RAMP = _ramp(14)
Z = 5; W = 256 * 2 ** Z
BB = [-170.0, 17.5, -50.0, 72.0]
def mx(lon): return (lon + 180) / 360 * W
def my(lat):
    s = math.sin(math.radians(lat)); return (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * W
X0, X1, Y0, Y1 = mx(BB[0]), mx(BB[2]), my(BB[3]), my(BB[1])
IW, IH = int(round(X1 - X0)), int(round(Y1 - Y0))
def cls(v, br): return int(np.searchsorted(br, v, side="right"))
def render(kinds, br, name):
    im = Image.new("P", (IW, IH), 0)
    pal = [0, 0, 0]
    for h in RAMP: pal += [int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)]
    im.putpalette(pal + [0] * (768 - len(pal)))
    dr = ImageDraw.Draw(im)
    order = sorted([f for f in feats if f[1] in kinds or (kinds == "h" and f[1] in "qv" and f[3][4] is not None)], key=lambda f: "ctqvh".index(f[1]))  # counties first, tracts over them
    for fid, kind, geom, props in order:
        ci = cls(props[4] if kinds == "h" else props[0], br) + 1
        polys = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
        for pg in polys:
            xy = np.asarray(pg.exterior.coords)[:, :2]
            pts = [(mx(x) - X0, my(y) - Y0) for x, y in xy]
            if len(pts) >= 3: dr.polygon(pts, fill=ci)
            for hole in pg.interiors:
                xy = np.asarray(hole.coords)[:, :2]; pts = [(mx(x) - X0, my(y) - Y0) for x, y in xy]
                if len(pts) >= 3: dr.polygon(pts, fill=0)
    im.save(O + name, optimize=True, transparency=0)
    log(name, IW, IH, os.path.getsize(O + name))
render("ctqv", LAND_BR, "ov-land.png")
render("h", HOME_BR, "ov-home.png")
def lat_of(y): return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / W))))
man = dict(v="t407a", tile=TILE, tiles=sorted(tiles), big=len(big) > 0, liveZ=7,
           ov=dict(bounds=[BB[0], lat_of(Y1), BB[2], lat_of(Y0)], z=Z),
           land=dict(unit="CAD/m2", breaks=LAND_BR), home=dict(unit="CAD per dwelling", breaks=HOME_BR), ramp=RAMP, fx=FX,
           counts={k: sum(1 for f in feats if f[1] == k) for k in "qvtch"}, homes=sum(1 for f in feats if f[1] in "qvh" and f[3][4] is not None))
json.dump(man, open(O + "manifest.json", "w"), indent=1)
log(json.dumps(man["counts"]))
