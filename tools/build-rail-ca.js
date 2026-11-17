// workspace/whereisthesun/tools/build-rail-ca.js
/* SUNNY build step (t397u): Canada abandoned, disused and razed railway lines as static files, so the Abandoned railways layer does not wait on Overpass there.
 *   node tools/build-rail-ca.js <rail.json from tools/osm-canada.py> <canada.poly from Geofabrik>
 * Writes data/world/rail-ca/<x>_<y>.json, one per zoom 7 map tile, each line [osm way id, kind a|d|t, name, operator, opened, closed,
 * lon/lat pairs as integers of 1e-5 degrees, the first absolute and the rest as differences], a line in every tile its box touches;
 * and data/world/rail-ca.json with the extract outline (Geofabrik's Canada boundary, the area the extract fully covers) and the
 * list of tiles that have lines. OpenStreetMap (ODbL). */
"use strict";
const fs = require("fs");
const path = require("path");
const [RAIL, POLY] = process.argv.slice(2);
const OUT = path.join(__dirname, "..", "data", "world");
const Z = 7, N = Math.pow(2, Z);
const tx = (lon) => { return Math.max(0, Math.min(N - 1, Math.floor((lon + 180) / 360 * N))); };
const ty = (lat) => {
  const r = lat * Math.PI / 180;
  return Math.max(0, Math.min(N - 1, Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * N)));
};
const ring = fs.readFileSync(POLY, "utf8").split("\n").map((l) => { return l.trim().split(/\s+/).map(Number); })
  .filter((p) => { return p.length === 2 && !isNaN(p[0]) && !isNaN(p[1]); }).map((p) => { return [Math.round(p[0] * 1e3) / 1e3, Math.round(p[1] * 1e3) / 1e3]; });
const tiles = {};
JSON.parse(fs.readFileSync(RAIL, "utf8")).forEach((r) => {
  const cs = r[6];
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, px = 0, py = 0;
  const enc = [];
  cs.forEach((c) => {
    const x = tx(c[0]), y = ty(c[1]), ix = Math.round(c[0] * 1e5), iy = Math.round(c[1] * 1e5);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    enc.push(ix - px, iy - py); px = ix; py = iy;
  });
  const row = [+r[0].slice(1), r[1], r[2], r[3], r[4], r[5], enc];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) (tiles[x + "_" + y] = tiles[x + "_" + y] || []).push(row);
});
const dir = path.join(OUT, "rail-ca");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
let bytes = 0;
Object.keys(tiles).forEach((k) => {
  const s = JSON.stringify(tiles[k]);
  bytes += s.length;
  fs.writeFileSync(path.join(dir, k + ".json"), s);
});
fs.writeFileSync(path.join(OUT, "rail-ca.json"), JSON.stringify({ z: Z, ring: ring, tiles: Object.keys(tiles).sort() }));
console.log("tiles", Object.keys(tiles).length, "bytes", bytes, "ring", ring.length);
