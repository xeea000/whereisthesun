// workspace/whereisthesun/tools/build-country-shapes.js
/* SUNNY t392u: small country outlines for country names that follow the view (country-view.js).
 * Usage: node tools/build-country-shapes.js ne_110m_admin_0_countries.geojson tile-country-names.json
 * Input 1: Natural Earth 1:110m Admin 0 countries (public domain, github.com/nvkelso/natural-earth-vector).
 * Input 2: ISO code → name map read from the OpenFreeMap place tiles, so a moved name matches the map's own name.
 * Output data/world/country-shapes.json: [{c: ISO code, n: name, b: [west, south, east, north], g: [polygon rings]}],
 * coordinates rounded to 0.01 degree. Places without an ISO code in either source are left out. */
"use strict";
const fs = require("fs"), path = require("path");
const ne = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const names = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const r2 = (v) => Math.round(v * 100) / 100;
const out = [];
ne.features.forEach((f) => {
  const p = f.properties;
  const c = p.ISO_A2 !== "-99" ? p.ISO_A2 : p.ISO_A2_EH;
  if (!c || c === "-99") return;
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  let w = 180, s = 90, e = -180, n = -90;
  const g = polys.map((poly) => poly.map((ring) => {
    const flat = [];
    ring.forEach((pt) => {
      w = Math.min(w, pt[0]); e = Math.max(e, pt[0]); s = Math.min(s, pt[1]); n = Math.max(n, pt[1]);
      flat.push(r2(pt[0]), r2(pt[1]));
    });
    return flat;
  }));
  out.push({ c: c, n: names[c] || p.NAME, b: [r2(w), r2(s), r2(e), r2(n)], g: g });
});
fs.writeFileSync(path.join(__dirname, "..", "data/world/country-shapes.json"), JSON.stringify(out));
console.log("countries", out.length);
