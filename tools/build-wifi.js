// workspace/whereisthesun/tools/build-wifi.js
/* SUNNY build step (t404u): data/world/wifi.* (points file + detail shards, tools/split-points.js), Canada only, free and keyless.
 *   node tools/build-wifi.js <osm wifi json from tools/osm-wifi.py> <MTLWiFi csv>
 * OpenStreetMap (ODbL): places tagged internet_access (Wi-Fi or yes), coded by internet_access:fee:
 *   f free (no), c customers or students only, p paid (yes), u fee not stated.
 * Ville de Montréal (CC BY 4.0), Bornes du réseau sans fil MTLWiFi: m city Wi-Fi spots; one within 50 m of an OpenStreetMap spot is left out
 * (many were imported into OpenStreetMap); city rows at the same spot (about 10 m) are one spot
 * with all their types. An OpenStreetMap spot with the same name as one within 50 m is listed once. */
"use strict";
const fs = require("fs");
const path = require("path");
const { split } = require("./split-points.js");
const OUT = path.join(__dirname, "..", "data", "world");
const [OSMF, MTLF] = process.argv.slice(2);
const FEE = { no: "f", customers: "c", students: "c", yes: "p" };
const near = (a, b) => {
  const dx = (a.lon - b.lon) * Math.cos(a.lat * Math.PI / 180) * 111320, dy = (a.lat - b.lat) * 110540;
  return dx * dx + dy * dy < 2500;
};
/* a grid of about 1 km cells so the 50 m checks look only at neighbours */
const grid = {};
const cell = (p, di, dj) => { return Math.floor(p.lat * 100 + (di || 0)) + ":" + Math.floor(p.lon * 100 + (dj || 0)); };
const around = (p) => {
  const out = [];
  [-1, 0, 1].forEach((di) => { [-1, 0, 1].forEach((dj) => { out.push(...(grid[cell(p, di, dj)] || [])); }); });
  return out.filter((q) => { return near(p, q); });
};
const keep = (p) => { (grid[cell(p)] = grid[cell(p)] || []).push(p); return p; };
const kindOf = (k) => { const v = String(k || "").split("=")[1] || ""; return v === "yes" ? "" : v.replace(/_/g, " "); };
const items = [];
JSON.parse(fs.readFileSync(OSMF, "utf8")).forEach((r) => {
  const p = { lat: r[0], lon: r[1], name: r[2] };
  if (r[2] && around(p).some((q) => { return q.name === r[2]; })) return;
  keep(p);
  items.push({ lat: r[0], lon: r[1], code: FEE[r[4]] || "u", row: [r[2], kindOf(r[3]), r[4], r[5], r[6], r[7], r[8]] });
});
const lines = fs.readFileSync(MTLF, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
const head = lines.shift().split(",");
const col = (n) => { return head.indexOf(n); };
let mtl = 0, dup = 0;
const spot = {};
lines.forEach((l) => {
  const c = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((s) => { return s.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, "\""); });
  const p = { lat: +c[col("Latitude")], lon: +c[col("Longitude")] };
  if (!p.lat || !p.lon || c[col("Zone active")] !== "X") return;
  if (around(p).length) { dup++; return; }
  /* the city lists one row per building service; rows at the same spot become one, with every type */
  const at = Math.round(p.lat * 1e4) + ":" + Math.round(p.lon * 1e4), ty = c[col("Type")].split(/,\s*/);
  if (spot[at]) { ty.forEach((t) => { if (spot[at].ty.indexOf(t) < 0) spot[at].ty.push(t); }); return; }
  mtl++;
  spot[at] = { ty: ty, it: { lat: Math.round(p.lat * 1e5) / 1e5, lon: Math.round(p.lon * 1e5) / 1e5, code: "m",
    row: [c[col("Lieu")], "", "no", "Ville de Montréal", "MTLWiFi", c[col("Arrondissement")] || "Montréal", ""] } };
});
Object.values(spot).forEach((s) => { s.it.row[1] = s.ty.join(", "); items.push(s.it); });
console.log("osm", items.length - mtl, "mtl", mtl, "mtl near osm", dup);
console.log(JSON.stringify(split(path.join(OUT, "wifi"), items, "name,kind,fee,op,ssid,city,osm")));
