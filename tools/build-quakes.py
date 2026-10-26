# SUNNY historical earthquakes, M6.5 and up since 1900. Run: python3 tools/build-quakes.py q6.csv
# Source: USGS ComCat, https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&starttime=1900-01-01&minmagnitude=6.5 (public domain).
# Writes data/world/quakes.json: flat list lon, lat, magnitude x10, date as yyyymmdd, depth km.
import csv, json, sys
out = []
for r in csv.DictReader(open(sys.argv[1])):
    if r["type"] != "earthquake" or not r["mag"] or float(r["mag"]) < 6.5:
        continue
    out += [round(float(r["longitude"]), 2), round(float(r["latitude"]), 2), round(float(r["mag"]) * 10), int(r["time"][:10].replace("-", "")),
            round(float(r["depth"] or 0))]
json.dump({"n": len(out) // 5, "q": out}, open("data/world/quakes.json", "w"), separators=(",", ":"))
print(len(out) // 5)
