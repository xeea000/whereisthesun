SUNNY beach database
====================

File: data/beaches.json  (and data/beaches.json.gz when uncompressed > 2MB)

Contents: OpenStreetMap features tagged natural=beach or leisure=beach,
worldwide centroids with ISO 3166-1 alpha-2 country codes.

Source: OpenStreetMap
License: ODbL. © OpenStreetMap contributors
https://www.openstreetmap.org/copyright

updated field in the JSON is the extract date (UTC).

How to regenerate
-----------------
1. Natural Earth 10m Admin 0 countries shapefile:
   https://www.naturalearthdata.com/http//www.naturalearthdata.com/download/10m/cultural/ne_10m_admin_0_countries.zip
   Unzip to /tmp/sunny-beaches/ne_10m_admin_0_countries.shp

2. Count (ohsome; do not use time=latest — it 400s). Metadata
   temporalExtent.toTimestamp was 2026-07-27T09:00Z:
   GET https://api.ohsome.org/v1/elements/count?bboxes=-180,-90,180,90&filter=(natural=beach or leisure=beach)&time=2026-07-27
   User-Agent: SUNNY/1.0 (local beach extract)

3. Centroids: POST https://api.ohsome.org/v1/elements/centroid
   form: bboxes, filter=(natural=beach or leisure=beach), properties=tags,
   clipGeometry=false, time=2026-07-27
   If that 403s or times out, tile the world in 20° boxes via Overpass:
     https://maps.mail.ru/osm/tools/overpass/api/interpreter
     https://overpass.openstreetmap.fr/api/interpreter
   Query:
     [out:json][timeout:60];
     (nwr["natural"="beach"](s,w,n,e); nwr["leisure"="beach"](s,w,n,e););
     out center tags;
   Write tile progress under /tmp/sunny-beaches/tiles/. Merge and dedupe by OSM id.

4. Country stamp with the shapefile (ISO_A2, skip -99). Buffer ~10 km, then
   nearest country within 50 km, else null.

5. Atomic write of beaches.json:
   {"v":1,"source":"OpenStreetMap","updated":"YYYY-MM-DD",
    "beaches":[{"id":"way/123","name":"Bondi Beach","lat":-33.8915,"lon":151.277,"country":"AU"}]}
   Gzip to beaches.json.gz if uncompressed > 2MB.

Scripts used for this build: /workspace/sunny-app/fetch_overpass.py
and /tmp/sunny-beaches/stamp_countries.py
