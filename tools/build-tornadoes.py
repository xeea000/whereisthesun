# workspace/whereisthesun/tools/build-tornadoes.py
# SUNNY tornado tracks: NOAA SPC Severe Weather Database (public domain), 1950-2024, EF3/F3 and stronger.
# Usage: curl -o /tmp/torn.csv https://www.spc.noaa.gov/wcm/data/1950-2024_actual_tornadoes.csv && python3 tools/build-tornadoes.py /tmp/torn.csv
import csv, json, sys
rows = [x for x in csv.DictReader(open(sys.argv[1])) if x["sg"] == "1" and x["mag"] in ("3", "4", "5")]
t = []
for x in rows:
    sl, so, el, eo = [round(float(x[k]), 2) for k in ("slat", "slon", "elat", "elon")]
    if el == 0 or eo == 0:
        el, eo = sl, so
    t.append([int(x["mag"]), int(x["yr"]), int(x["mo"]), int(x["dy"]), x["st"], int(x["fat"]), int(x["inj"]), float(x["len"]), int(x["wid"]),
              int(round(sl * 100)), int(round(so * 100)), int(round(el * 100)), int(round(eo * 100))])
o = {"source": "NOAA Storm Prediction Center, Severe Weather Database, 1950-2024 actual tornadoes (public domain), EF3/F3 and stronger",
     "cols": "mag,yr,mo,dy,st,fat,inj,len_mi,wid_yd,slat,slon,elat,elon (lat/lon x100)", "t": t}
open("data/world/tornadoes.json", "w").write(json.dumps(o, separators=(",", ":")))
print(len(t))
