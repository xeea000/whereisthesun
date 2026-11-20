// workspace/whereisthesun/tools/write-iceland-packs.js
// Writes data/packs/is from /tmp/is-trails-cache/pack-items.json and adds Iceland to packs/index.json.
"use strict";
var fs = require("fs");
var path = require("path");
var SP = require("./split-points.js");
var ROOT = path.join(__dirname, "..");
var items = JSON.parse(fs.readFileSync("/tmp/is-trails-cache/pack-items.json", "utf8"));
var dest = path.join(ROOT, "data", "packs", "is");
fs.mkdirSync(dest, { recursive: true });
function boxOf(rows) {
  var b = [180, 90, -180, -90];
  rows.forEach((r) => {
    b = [Math.min(b[0], r.lon), Math.min(b[1], r.lat), Math.max(b[2], r.lon), Math.max(b[3], r.lat)];
  });
  return b.map((v) => { return Math.round(v * 100) / 100; });
}
var all = items.camps.concat(items.plaques);
var files = {};
files.camps = SP.split(path.join(dest, "camps"), items.camps, "name,backcountry,fee,website,operator,osm", 200);
files.plaques = SP.split(path.join(dest, "plaques"), items.plaques, "name,kind,inscription,date,website,osm", 200);
var idxPath = path.join(ROOT, "data", "packs", "index.json");
var idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
idx.regions = (idx.regions || []).filter((r) => { return r.id !== "is"; });
idx.regions.push({ id: "is", name: "Iceland", bbox: boxOf(all), files: files });
idx.built = "2026-11-20";
fs.writeFileSync(idxPath, JSON.stringify(idx));
console.log("is", JSON.stringify({ files: files, bbox: boxOf(all), regions: idx.regions.length }));
