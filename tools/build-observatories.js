#!/usr/bin/env node
// workspace/whereisthesun/tools/build-observatories.js
/* SUNNY build step (opt90): turns two OpenStreetMap Overpass CSV exports into
 * data/observatories.json. Run once by hand, never per visit:
 *   node tools/build-observatories.js telescope.tsv observatory.tsv
 * Each TSV is Overpass [out:csv] of nwr["man_made"="telescope"] or ["man_made"="observatory"],
 * columns as in COLS. Weather, seismic and military sites are dropped. Telescopes within
 * 3 km of an observatory fold into it as a count; leftover telescopes within 2 km of each
 * other merge into one site. Data (c) OpenStreetMap contributors, ODbL 1.0. */
"use strict";
var fs = require("fs");
var path = require("path");
var NOT_ASTRO = /meteo|weather|seism|geophys|magnet|volcan|tide|hydro|climat|ionos/i;
function readTsv(file) {
  var lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  var head = lines.shift().split("\t");
  function row(line) {
    var cells = line.split("\t");
    var o = {};
    for (var i = 0; i < head.length; i++) o[head[i]] = (cells[i] || "").trim();
    return o;
  }
  return lines.map(row);
}
function km(a, b) {
  var r = Math.PI / 180;
  var x = (b.lon - a.lon) * r * Math.cos((a.lat + b.lat) / 2 * r);
  var y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}
function diameterM(s) {
  var m = /([\d.]+)\s*(cm|mm|m)?/.exec(s || "");
  if (!m) return null;
  var v = parseFloat(m[1]);
  if (!isFinite(v) || v <= 0) return null;
  if (m[2] === "cm") v /= 100;
  else if (m[2] === "mm") v /= 1000;
  return v > 600 ? null : Math.round(v * 100) / 100;
}
function link(r) {
  if (r.website && /^https?:\/\//.test(r.website)) return r.website;
  var w = /^([a-z-]+):(.+)$/.exec(r.wikipedia || "");
  if (w) return "https://" + w[1] + ".wikipedia.org/wiki/" + encodeURIComponent(w[2].replace(/ /g, "_"));
  if (r.wikidata) return "https://www.wikidata.org/wiki/" + r.wikidata;
  return "";
}
function astro(r) {
  if (r.military) return false;
  if (/radar|military/i.test(r["telescope:usage"] + r["telescope:type"])) return false;
  if (r["observatory:type"] && NOT_ASTRO.test(r["observatory:type"])) return false;
  if (NOT_ASTRO.test(r.name)) return false;
  return isFinite(parseFloat(r["@lat"]));
}
function site(r, kind) {
  return {
    name: r["name:en"] || r.name || "", kind: kind,
    type: (r["telescope:spectrum"] || r["telescope:type"] || "").toLowerCase(),
    diameter_m: diameterM(r["telescope:diameter"]), operator: r.operator || "", link: link(r),
    lat: Math.round(parseFloat(r["@lat"]) * 1e5) / 1e5, lon: Math.round(parseFloat(r["@lon"]) * 1e5) / 1e5,
    scopes: kind === "telescope" ? 1 : 0, osm: r["@type"] + "/" + r["@id"]
  };
}
function absorb(into, t) {
  into.scopes += t.scopes || 1;
  if (t.diameter_m && (!into.diameter_m || t.diameter_m > into.diameter_m)) into.diameter_m = t.diameter_m;
  var types = into.type ? into.type.split(", ") : [];
  if (t.type && types.indexOf(t.type) === -1) types.push(t.type);
  into.type = types.slice(0, 3).join(", ");
  if (!into.operator) into.operator = t.operator;
  if (!into.link) into.link = t.link;
  if (!into.name) into.name = t.name;
}
function nearest(list, p, maxKm) {
  var best = null;
  var bestD = maxKm;
  for (var i = 0; i < list.length; i++) {
    if (Math.abs(list[i].lat - p.lat) > 0.1) continue;
    var d = km(list[i], p);
    if (d < bestD) { bestD = d; best = list[i]; }
  }
  return best;
}
function asTelescope(r) {
  return site(r, "telescope");
}
function asObservatory(r) {
  return site(r, "observatory");
}
function bigFirst(a, b) {
  return (b.diameter_m || 0) - (a.diameter_m || 0);
}
var tel = readTsv(process.argv[2]).filter(astro).map(asTelescope);
var obs = readTsv(process.argv[3]).filter(astro).map(asObservatory);
var loose = [];
function place(t) {
  var o = nearest(obs, t, 3);
  if (o) return absorb(o, t);
  var l = nearest(loose, t, 2);
  if (l) return absorb(l, t);
  loose.push(t);
}
tel.sort(bigFirst);
tel.forEach(place);
function worth(s) {
  return !!(s.name || s.diameter_m || s.link || s.operator);
}
var out = obs.concat(loose).filter(worth);
function slim(s) {
  if (s.kind === "telescope" && s.scopes > 1) s.kind = "array";
  delete s.osm;
  for (var k in s) if (s[k] === "" || s[k] === null || s[k] === 0) delete s[k];
}
out.forEach(slim);
var doc = {
  source: "OpenStreetMap, man_made=telescope and man_made=observatory worldwide, via Overpass API (retrieved " + new Date().toISOString().slice(0, 10) + ").",
  licence: "ODbL 1.0, (c) OpenStreetMap contributors, https://www.openstreetmap.org/copyright",
  sites: out
};
fs.writeFileSync(path.join(__dirname, "..", "data", "observatories.json"), JSON.stringify(doc));
console.log("sites", out.length, "observatories", obs.length, "telescopes", tel.length);
