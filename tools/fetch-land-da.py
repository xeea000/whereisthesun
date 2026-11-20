# Fetch 2021 StatCan cartographic DA polygons (OGL-Canada) from the StatCan ArcGIS REST service, simplified ~50 m.
import json, urllib.request, os, sys, time
U="https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer/12/query"
out=os.environ.get("SUNNY_LAND_RAW", "/workspace/t407/raw") + "/da"
off=0; step=2000
while True:
    f=f"{out}/p{off:06d}.json"
    if not os.path.exists(f):
        q=f"?where=1%3D1&outFields=DAUID&returnGeometry=true&outSR=4326&maxAllowableOffset=0.0004&geometryPrecision=5&resultOffset={off}&resultRecordCount={step}&orderByFields=DAUID&f=geojson"
        for t in range(5):
            try:
                d=urllib.request.urlopen(U+q,timeout=180).read(); break
            except Exception as e:
                print("retry",off,e,flush=True); time.sleep(5)
        open(f,"wb").write(d)
    n=len(json.load(open(f))["features"]); print(off,n,flush=True)
    if n<step: break
    off+=step
