# SUNNY volcanoes. Run: python3 tools/build-volcanoes.py hol.json eru.json
# Source: Smithsonian Global Volcanism Program, Volcanoes of the World (VOTW) via its GeoServer WFS
# (layers Smithsonian_VOTW_Holocene_Volcanoes and Smithsonian_VOTW_Holocene_Eruptions).
# Writes data/world/volcanoes.json, rows: lon, lat, class, number, name, last eruption year, eruptions since 1500, max VEI, "due" ratio or -1.
# class 0 erupted since 1900, 1 erupted 1500-1899, 2 earlier Holocene eruption, 3 no dated eruption.
# due ratio = years since the last eruption / mean gap between eruptions since 1500, only with 5+ such eruptions. Rough, not a forecast.
import json, sys
NOW = 2026
vol = json.load(open(sys.argv[1]))["features"]
eru = json.load(open(sys.argv[2]))["features"]
by = {}
for f in eru:
    p = f["properties"]
    if p["Activity_Type"] != "Confirmed Eruption" or p["StartDateYear"] is None:
        continue
    by.setdefault(p["Volcano_Number"], []).append((p["StartDateYear"], p["ExplosivityIndexMax"]))
rows = []
for f in vol:
    p = f["properties"]; n = p["Volcano_Number"]; e = by.get(n, [])
    years = sorted(y for y, _ in e)
    last = years[-1] if years else None
    cls = 3 if last is None else 0 if last >= 1900 else 1 if last >= 1500 else 2
    recent = [y for y in years if y >= 1500]
    vei = max([v for _, v in e if v is not None] or [-1])
    due = -1
    if len(recent) >= 5:
        gap = (recent[-1] - recent[0]) / (len(recent) - 1)
        if gap > 0:
            due = round((NOW - recent[-1]) / gap, 2)
    c = f["geometry"]["coordinates"]
    rows.append([round(c[0], 3), round(c[1], 3), cls, n, p["Volcano_Name"], last, len(recent), vei, due])
json.dump({"n": len(rows), "v": rows}, open("data/world/volcanoes.json", "w"), separators=(",", ":"), ensure_ascii=False)
print(len(rows), [sum(1 for r in rows if r[2] == k) for k in range(4)], sum(1 for r in rows if r[8] >= 0), sorted(rows, key=lambda r: -r[8])[:5])
