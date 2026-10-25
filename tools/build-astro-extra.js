#!/usr/bin/env node
// workspace/whereisthesun/tools/build-astro-extra.js
/* SUNNY build step (opt91): writes data/observatories.json from the opt90 OpenStreetMap
 * build (tools/osm-observatories.json) plus Wikidata sites (tools/wikidata-astro.json,
 * from tools/fetch-wikidata-astro.sh). Every site gets cat: optical, radio, neutrino,
 * gravitational-wave or cosmic-ray. Non-astronomy OSM rows are dropped, type text is
 * tidied and quote marks stripped. A Wikidata site within 3 km of an OSM site that
 * shares a name word enriches it; otherwise it is added with its QID. Canadian sites come
 * from tools/wikidata-canada.json (query tools/wikidata-canada.rq), typed by name. */
"use strict";
var fs = require("fs");
var path = require("path");
var CLASS_CAT = { Q184356: "radio", Q349772: "radio", Q583152: "neutrino", Q2302080: "gravitational-wave", Q3348407: "cosmic-ray" };
var QID_CAT = {
  Q44547: "radio", Q174540: "radio", Q1043942: "radio", Q1238107: "radio", Q41804148: "radio", Q725364: "radio",
  Q7391872: "neutrino", Q12027631: "neutrino", Q893513: "neutrino", Q1569514: "neutrino", Q647227: "neutrino",
  Q363047: "neutrino", Q1799482: "neutrino", Q5250343: "neutrino",
  Q51792451: "gravitational-wave", Q121094988: "gravitational-wave", Q7696800: "cosmic-ray", Q794886: "cosmic-ray"
};
var NOTES = { Q44547: "Collapsed December 2020; no longer operating." };
var NOT_ASTRO_NAME = new RegExp(["security|solutions|\\bltd\\b|\\binc\\b|\\bllc\\b|restaurant|hotel",
  "\\bcafe\\b|\\bshop\\b|\\bstore\\b|realty|insurance|weather|meteo"].join("|"), "i");
var GENERIC = new RegExp("^(observatory|observatorio|observatoire|sternwarte|telescope|radio|array|astronomical|astronomy" +
  "|national|station|experiment|detector|neutrino|facility|research|centre|center)$", "i");
function km(a, b) {
  var r = Math.PI / 180;
  var x = (b.lon - a.lon) * r * Math.cos((a.lat + b.lat) / 2 * r);
  var y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}
function unquote(s) {
  return String(s || "").replace(/["\u201c\u201d]+/g, "").replace(/\s+/g, " ").trim();
}
function tidyType(t) {
  var out = [];
  function add(w) {
    if (w && out.indexOf(w) === -1) out.push(w);
  }
  function one(raw) {
    var w = raw.trim().toLowerCase();
    if (/ghz|mhz|millimet|submm|microwave|radio/.test(w)) add("radio");
    else if (/optic|visible|reflect|refract|catadiop|schmidt|cassegr/.test(w)) add("optical");
    else if (/infra/.test(w)) add("infrared");
    else if (/solar|sun/.test(w)) add("solar");
    else if (/gamma|x-?ray|cherenkov|ultraviolet/.test(w)) add(w);
  }
  String(t || "").split(/[,;]/).forEach(one);
  return out.join(", ");
}
function words(s) {
  function keep(w) {
    return w.length >= 4 && !GENERIC.test(w);
  }
  return unquote(s).toLowerCase().split(/[^a-z0-9\u00c0-\u024f]+/).filter(keep);
}
function sharesWord(a, b) {
  var wb = words(b);
  function inB(w) {
    return wb.indexOf(w) !== -1;
  }
  return words(a).some(inB);
}
function cleanOsm(s) {
  s.name = unquote(s.name);
  if (s.operator) s.operator = unquote(s.operator);
  var t = tidyType(s.type);
  if (t) s.type = t;
  else delete s.type;
  s.cat = /radio/.test(s.type || "") && !/optical/.test(s.type || "") ? "radio" : "optical";
  if (/\bLIGO\b|gravitational|\bVirgo\b|KAGRA|GEO600/i.test(s.name)) s.cat = "gravitational-wave";
  else if (/neutrino/i.test(s.name)) s.cat = "neutrino";
  else if (/\bAuger\b|cosmic.ray|air shower/i.test(s.name)) s.cat = "cosmic-ray";
  return s;
}
function isAstro(s) {
  return !(s.name && NOT_ASTRO_NAME.test(s.name)) && !(s.operator && NOT_ASTRO_NAME.test(s.operator) && !/observ|astro|univers/i.test(s.name));
}
var root = path.join(__dirname, "..");
var osmDoc = JSON.parse(fs.readFileSync(path.join(__dirname, "osm-observatories.json"), "utf8"));
var before = osmDoc.sites.length;
var sites = osmDoc.sites.filter(isAstro).map(cleanOsm);
var dropped = before - sites.length;
var rows = JSON.parse(fs.readFileSync(path.join(__dirname, "wikidata-astro.json"), "utf8")).results.bindings;
function qidOf(uri) {
  return uri.split("/").pop();
}
function toWd(b) {
  var q = qidOf(b.i.value);
  var m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(b.c.value);
  var cat = QID_CAT[q] || (b.cl ? CLASS_CAT[qidOf(b.cl.value)] : catByName(b.iLabel.value));
  if (!m || !cat || /^Q\d+$/.test(b.iLabel.value)) return null;
  var s = { name: unquote(b.iLabel.value), kind: "observatory", cat: cat, qid: q,
    lat: Math.round(parseFloat(m[2]) * 1e5) / 1e5, lon: Math.round(parseFloat(m[1]) * 1e5) / 1e5 };
  if (b.opLabel && !/^Q\d+$/.test(b.opLabel.value)) s.operator = unquote(b.opLabel.value);
  s.link = b.art ? b.art.value : "https://www.wikidata.org/wiki/" + q;
  if (NOTES[q]) s.note = NOTES[q];
  return s;
}
var CA_SKIP = /viewpoint|atmosphere|tower|building|geophys/i;
function catByName(n) {
  if (CA_SKIP.test(n)) return null;
  if (/neutrino/i.test(n)) return "neutrino";
  if (/cosmic ray/i.test(n)) return "cosmic-ray";
  if (/radio|hydrogen|synthesis|solar-flux|galt|\d+m (radio )?telescope/i.test(n)) return "radio";
  return "optical";
}
var caRows = JSON.parse(fs.readFileSync(path.join(__dirname, "wikidata-canada.json"), "utf8")).results.bindings;
rows = rows.concat(caRows);
function priority(a, b) {
  return (QID_CAT[b.qid] ? 1 : 0) - (QID_CAT[a.qid] ? 1 : 0);
}
var wd = rows.map(toWd).filter(Boolean).sort(priority);
var added = [];
var merged = 0;
var counts = {};
function near(list, p, maxKm, test) {
  for (var i = 0; i < list.length; i++) {
    if (Math.abs(list[i].lat - p.lat) > 0.2) continue;
    if (km(list[i], p) < maxKm && test(list[i])) return list[i];
  }
  return null;
}
function placeWd(w) {
  function sameQid(o) {
    return o.qid === w.qid;
  }
  function sameSpot(o) {
    return o.cat === w.cat && sharesWord(o.name, w.name);
  }
  function osmMatch(o) {
    return !o.qid && sharesWord(o.name, w.name);
  }
  if (near(added, w, 5, sameQid) || near(added, w, 0.3, sameSpot)) return;
  var o = near(sites, w, 3, osmMatch);
  if (o) {
    o.qid = w.qid;
    if (w.cat !== "optical") o.cat = w.cat;
    if (!o.link) o.link = w.link;
    if (w.note) o.note = w.note;
    merged++;
    return;
  }
  added.push(w);
  counts[w.cat] = (counts[w.cat] || 0) + 1;
}
wd.forEach(placeWd);
var all = sites.concat(added);
var doc = {
  source: "OpenStreetMap man_made=telescope/observatory via Overpass (opt90), plus Wikidata (CC0) radio telescopes, interferometers, neutrino, gravitational-wave and cosmic-ray detectors (retrieved " + new Date().toISOString().slice(0, 10) + ").",
  licence: "OSM data ODbL 1.0, (c) OpenStreetMap contributors; Wikidata CC0",
  sites: all
};
fs.writeFileSync(path.join(root, "data", "observatories.json"), JSON.stringify(doc));
console.log("osm kept", sites.length, "dropped", dropped, "wikidata merged", merged, "added", added.length, JSON.stringify(counts));
