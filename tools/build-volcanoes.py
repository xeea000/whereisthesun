# SUNNY volcanoes. Run: python3 tools/build-volcanoes.py hol.json eru.json [e1960.json]
# Source: Smithsonian Global Volcanism Program, Volcanoes of the World (VOTW) via its GeoServer WFS
# (layers Smithsonian_VOTW_Holocene_Volcanoes and Smithsonian_VOTW_Holocene_Eruptions).
# Writes data/world/volcanoes.json, rows: lon, lat, class, number, name, last eruption year, eruptions since 1500, max VEI, "due" ratio or -1.
# class 0 erupted since 1900, 1 erupted 1500-1899, 2 earlier Holocene eruption, 3 no dated eruption.
# due ratio = years since the last eruption / mean gap between eruptions since 1500, only with 5+ such eruptions. Rough, not a forecast.
# With e1960.json (layer E3WebApp_Eruptions1960, eruptions from 1960 on) two more fields: recent eruption 1 = continuing,
# 2 = ended in the 12 months before the build, 0 = neither; and that eruption's start date (continuing) or end date (YYYYMMDD).
# The file also gets "built", the build date: the recent flag is only as fresh as that.
import json, sys, datetime
NOW = 2026
BUILT = datetime.date.today()
CUT = (BUILT - datetime.timedelta(days=365)).strftime("%Y%m%d")
rec = {}
for f in (json.load(open(sys.argv[3]))["features"] if len(sys.argv) > 3 else []):
    p = f["properties"]
    if p["ContinuingEruption"] == "True":
        rec[p["VolcanoNumber"]] = (1, p["StartDate"] or "")
    elif (p["EndDate"] or "") >= CUT and rec.get(p["VolcanoNumber"], (9,))[0] != 1:
        rec[p["VolcanoNumber"]] = (2, max(p["EndDate"], rec.get(p["VolcanoNumber"], (0, ""))[1]))
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
    row = [round(c[0], 3), round(c[1], 3), cls, n, p["Volcano_Name"], last, len(recent), vei, due]
    if rec: row += list(rec.get(n, (0, "")))
    rows.append(row)
out = {"n": len(rows), "v": rows}
if rec: out["built"] = BUILT.isoformat()
json.dump(out, open("data/world/volcanoes.json", "w"), separators=(",", ":"), ensure_ascii=False)
print(len(rows), sum(1 for r in rows if len(r) > 9 and r[9]), [sum(1 for r in rows if r[2] == k) for k in range(4)], sum(1 for r in rows if r[8] >= 0), sorted(rows, key=lambda r: -r[8])[:5])
