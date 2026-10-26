# SUNNY tropical cyclone tracks, Saffir-Simpson category 3 and up (USA_WIND 96 kt or more), seasons 1980 on.
# Run: python3 tools/build-storms.py ibtracs.since1980.list.v04r01.csv
# Source: NOAA NCEI IBTrACS v04r01 (public domain), https://www.ncei.noaa.gov/products/international-best-track-archive
# Writes data/world/storms.json: rows of name, season, peak wind kt, then a flat track of lon*10, lat*10, category (-1 to 5) every 12 hours;
# after the first point lon and lat are steps from the point before. Tracks are cut to the part at tropical storm strength or more.
import csv, json, sys
def cat(w):
    return -1 if w < 34 else 0 if w < 64 else 1 if w < 83 else 2 if w < 96 else 3 if w < 113 else 4 if w < 137 else 5
st = {}
rd = csv.reader(open(sys.argv[1]))
head = next(rd); next(rd)
ix = {k: i for i, k in enumerate(head)}
for r in rd:
    if r[ix["TRACK_TYPE"]] != "main" or r[ix["ISO_TIME"]][11:13] not in ("00", "12"):
        continue
    w = r[ix["USA_WIND"]].strip()
    w = int(w) if w else 0
    s = st.setdefault(r[ix["SID"]], {"n": r[ix["NAME"]].title(), "y": int(r[ix["SEASON"]]), "m": 0, "t": []})
    s["m"] = max(s["m"], w)
    s["t"] += [round(float(r[ix["LON"]]) * 10), round(float(r[ix["LAT"]]) * 10), cat(w)]
def trim(t):
    k = [i for i in range(0, len(t), 3) if t[i + 2] >= 0]
    return t[k[0]:k[-1] + 3] if k else []
def delta(t):
    o = t[:3]
    for i in range(3, len(t), 3):
        o += [t[i] - t[i - 3], t[i + 1] - t[i - 2], t[i + 2]]
    return o
out = [[s["n"], s["y"], s["m"], delta(trim(s["t"]))] for s in st.values() if s["m"] >= 96 and len(trim(s["t"])) >= 6]
json.dump({"n": len(out), "s": out}, open("data/world/storms.json", "w"), separators=(",", ":"))
print(len(out))
