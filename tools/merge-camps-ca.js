// workspace/whereisthesun/tools/merge-camps-ca.js
/* SUNNY opt291: add Canada RV / trailer parks and viewpoints from tools/osm-camps-ca.py into the
 * existing camps packs, and drop lookout-tower pack rows that are already in data/fire-lookouts.json
 * (those towers are drawn by fire-lookout.js on Lookouts & viewpoints). Does not touch plaques or
 * invent places. Usage: node tools/merge-camps-ca.js <ca-rv-viewpoints.json> */
"use strict";
var fs = require("fs");
var path = require("path");
var SP = require("./split-points.js");
var ROOT = path.join(__dirname, "..");
var PACKS = path.join(ROOT, "data", "packs");
var extraPath = process.argv[2];
if (!extraPath) {
  console.error("usage: node tools/merge-camps-ca.js <ca-rv-viewpoints.json>");
  process.exit(1);
}
var extra = JSON.parse(fs.readFileSync(extraPath, "utf8"));
var fire = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "fire-lookouts.json"), "utf8"));
var index = JSON.parse(fs.readFileSync(path.join(PACKS, "index.json"), "utf8"));
var fireIds = {};
var firePts = [];
fire.forEach((r) => {
  if (r[4] && r[4].charAt(0) !== "w" || (r[4] && r[4].indexOf("wd:") !== 0 && /^[nwr]/.test(r[4]))) fireIds[r[4]] = 1;
  if (r[4]) fireIds[r[4]] = 1;
  firePts.push([r[0], r[1]]);
});
function nearFire(lat, lon) {
  var cy = Math.cos(lat * Math.PI / 180);
  for (var i = 0; i < firePts.length; i++) {
    var dy = (lat - firePts[i][0]) * 111000;
    var dx = (lon - firePts[i][1]) * 111000 * cy;
    if (dx * dx + dy * dy < 200 * 200) return true;
  }
  return false;
}
function loadPack(id) {
  var base = path.join(PACKS, id, "camps");
  var j = JSON.parse(fs.readFileSync(base + ".p.json", "utf8"));
  var cols = j.cols.split(",");
  var items = [], a = 0, o = 0;
  for (var i = 0; i < j.n; i++) {
    a += j.lat[i]; o += j.lon[i];
    var shard = Math.floor(i / j.S);
    if (!loadPack.shards || loadPack.shards.id !== id + ":" + shard) {
      loadPack.shards = { id: id + ":" + shard, rows: JSON.parse(fs.readFileSync(base + ".d" + shard + ".json", "utf8")) };
    }
    var row = loadPack.shards.rows[i - shard * j.S];
    items.push({ lat: a / 1e5, lon: o / 1e5, code: j.codes[j.c[i]], row: row });
  }
  return items;
}
function osmOf(it) { return it.row[colsOsm]; }
var colsOsm = 5; /* name,backcountry,fee,website,operator,osm */
var caPts = []; /* [lat, lon, regionId] for assignment */
index.regions.forEach((R) => {
  if (R.id.indexOf("ca-") !== 0) return;
  loadPack(R.id).forEach((it) => { caPts.push([it.lat, it.lon, R.id]); });
});
function inBox(R, lon, lat) {
  var b = R.bbox;
  return lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
}
function nearestRegion(lon, lat, only) {
  var best = null, bestD = Infinity;
  for (var i = 0; i < caPts.length; i++) {
    var p = caPts[i];
    if (only && only.indexOf(p[2]) < 0) continue;
    var dy = lat - p[0], dx = (lon - p[1]) * Math.cos(lat * Math.PI / 180);
    var d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = p[2]; }
  }
  return best;
}
function regionOf(lon, lat) {
  var cands = index.regions.filter((R) => { return R.id.indexOf("ca-") === 0 && inBox(R, lon, lat); }).map((R) => { return R.id; });
  return nearestRegion(lon, lat, cands.length ? cands : null) || "ca-on";
}
var add = {};
var seenOsm = {};
index.regions.forEach((R) => {
  if (R.id.indexOf("ca-") !== 0) return;
  loadPack(R.id).forEach((it) => { seenOsm[osmOf(it)] = 1; });
});
var nAdd = { r: 0, v: 0, skip: 0 };
extra.forEach((r) => {
  var osm = r[8];
  if (seenOsm[osm]) { nAdd.skip++; return; }
  seenOsm[osm] = 1;
  var id = regionOf(r[0], r[1]);
  add[id] = add[id] || [];
  add[id].push({ lon: r[0], lat: r[1], code: r[3], row: [r[2], r[4], r[5], r[6], r[7], r[8]] });
  nAdd[r[3]] = (nAdd[r[3]] || 0) + 1;
});
var dropped = 0, keptL = 0;
index.regions.forEach((R) => {
  var items = loadPack(R.id);
  var next = [];
  items.forEach((it) => {
    if (it.code === "l" && (fireIds[osmOf(it)] || nearFire(it.lat, it.lon))) { dropped++; return; }
    if (it.code === "l") keptL++;
    next.push(it);
  });
  if (add[R.id]) next = next.concat(add[R.id]);
  if (next.length === items.length && !add[R.id]) return;
  /* rewrite when lookouts were removed or rows were added; unchanged packs are left as they are */
  if (next.length === items.length) return;
  var files = SP.split(path.join(PACKS, R.id, "camps"), next, "name,backcountry,fee,website,operator,osm");
  R.files.camps = files;
  if (add[R.id]) {
    var b = R.bbox.slice();
    add[R.id].forEach((it) => {
      b[0] = Math.min(b[0], it.lon); b[1] = Math.min(b[1], it.lat);
      b[2] = Math.max(b[2], it.lon); b[3] = Math.max(b[3], it.lat);
    });
    R.bbox = b.map((v) => { return Math.round(v * 100) / 100; });
  }
  console.log(R.id, "n=" + files.n, "added", (add[R.id] || []).length, "dropped lookouts in this region counted globally");
});
/* Packs that only lost overlapping lookout towers are rewritten above when the row count changes. */
index.built = new Date().toISOString().slice(0, 10);
index.source = "OpenStreetMap (ODbL), Ontario Heritage Trust, Parks Canada; Canada RV parks and viewpoints from a local OSM extract";
fs.writeFileSync(path.join(PACKS, "index.json"), JSON.stringify(index));
console.log("added", nAdd, "dropped fire-lookout overlaps", dropped, "kept other lookout towers", keptL);
