# SUNNY

Mobile map: nearest clear sky and a beach to tan, from your location. No keys.

Lives in `workspace/whereisthesun/` on `main`. Do not touch starcode.

Open locally: http://127.0.0.1:8765/ (or the SUNNY shortcut). On GitHub, beach data is sharded in `data/bXX.json`. Local copies may also have `data/beaches.json.gz`. Weather is Open-Meteo. Clouds are NASA GIBS. © OpenStreetMap contributors.

## Deploy (opt77+)

1. Set `BUILD = "optNN"` in `sw.js` (no more `?v=optNN` on assets).
2. `node tools/fingerprint.js` — stamps every app file in `index.html` with a content hash (`?h=…`) and writes the precache list into `sw.js`. Hashed files are cached forever; a deploy downloads only changed files.
3. `node tools/write-version.js` — writes `version.json` (the update banner signal). Commit both.

Caches: `sunny-app-1` (hashed app files, old hashes pruned on activate), `sunny-static-1` (map tiles, nexrad-sites.json, impact-craters.json; capped at 900), `sunny-frames-1` (settled past satellite/radar frames only, capped at 400, dropped after 26 h). `index.html` and `version.json` are always network-first.
