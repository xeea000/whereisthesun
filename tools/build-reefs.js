// workspace/whereisthesun/tools/build-reefs.js
/* SUNNY build step (t397u): data/world/reefs.* (points file + detail shards, tools/split-points.js), free and keyless.
 *   node tools/build-reefs.js <cache dir>
 * NOAA Coral Reef Watch 5 km regional virtual stations (public domain, a work of the United States government): one point per
 * reef region with that day's sea temperature, anomaly, heat stress (degree heating weeks) and bleaching alert level, a snapshot
 * from the build day. Wikidata (CC0): coral, barrier and fringing reefs, sponge reefs, atolls, blue holes and marine caves, and
 * other reefs with an English Wikipedia article. A place already in Seafloor features or Wrecks (same Wikidata id) is left out, as
 * is a Wikidata point within 500 m of one already listed. */
"use strict";
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const { split } = require("./split-points.js");
const OUT = path.join(__dirname, "..", "data", "world");
const CACHE = process.argv[2];
const UA = "SUNNY-build/1.0 (github.com/xeea000/whereisthesun)";
const get = (url, file, extra) => {
  const f = path.join(CACHE, file);
  if (!fs.existsSync(f)) cp.execFileSync("curl", ["-s", "-f", "-m", "280", "-A", UA, "-o", f].concat(extra || [], [url]));
  return JSON.parse(fs.readFileSync(f, "utf8"));
};
const WD = { Q11292: "coral", Q4078911: "coral", Q1999990: "coral", Q7578997: "coral", Q42523: "atoll", Q7180402: "hole", Q106704395: "hole",
  Q184358: "reef" };
const wd = (name, types, enOnly) => {
  const q = "SELECT ?i ?iL ?c ?t ?coL ?w WHERE { VALUES ?t { " + types.map((t) => { return "wd:" + t; }).join(" ") + " } ?i wdt:P31 ?t; wdt:P625 ?c. " +
    (enOnly ? "" : "OPTIONAL{") + "?w schema:about ?i; schema:isPartOf <https://en.wikipedia.org/>" + (enOnly ? " " : "} ") + "OPTIONAL{?i wdt:P17 ?co} " +
    "SERVICE wikibase:label { bd:serviceParam wikibase:language \"en,mul,fr,es,de\". ?i rdfs:label ?iL. ?co rdfs:label ?coL } }";
  return get("https://query.wikidata.org/sparql", "wd-" + name + ".json", ["-G", "-H", "Accept: application/sparql-results+json",
    "--data-urlencode", "query=" + q]).results.bindings;
};
/* Wikidata ids already shown by Seafloor features and Wrecks */
const taken = {};
["seafloor", "wrecks"].forEach((base) => {
  fs.readdirSync(OUT).filter((f) => { return f.startsWith(base + ".d"); }).forEach((f) => {
    JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")).forEach((row) => { row.forEach((v) => { if (/^Q\d+$/.test(v)) taken[v] = 1; }); });
  });
});
const grid = {};
const near = (lat, lon, km) => {
  for (let a = -1; a <= 1; a++) for (let o = -1; o <= 1; o++) {
    const c = grid[(Math.round(lat * 50) + a) + "," + (Math.round(lon * 50) + o)] || [];
    for (let i = 0; i < c.length; i++) {
      const dy = (c[i][0] - lat) * 111, dx = (c[i][1] - lon) * 111 * Math.cos(lat * Math.PI / 180);
      if (dx * dx + dy * dy < km * km) return true;
    }
  }
  return false;
};
const put = (lat, lon) => { const k = Math.round(lat * 50) + "," + Math.round(lon * 50); (grid[k] = grid[k] || []).push([lat, lon]); };
const cut = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const items = [];
const crw = get("https://coralreefwatch.noaa.gov/product/vs/vs_polygons.json", "crw-stations.json").features;
crw.filter((f) => { return f.geometry.type === "Point"; }).forEach((f) => {
  const p = f.properties, c = f.geometry.coordinates;
  items.push({ lat: c[1], lon: c[0], code: "crw" + (+p.alert || 0),
    row: [cut(p.name, 90), "", "", "", [p.date, p.sst, p.ssta, p.dhw, p.alert, p.gauge_page].join("|")] });
});
const crwN = items.length, seen = {};
const add = (rows) => {
  rows.forEach((b) => {
    const id = b.i.value.split("/").pop(), m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(b.c.value), code = WD[b.t.value.split("/").pop()];
    if (seen[id] || taken[id] || !m || !code) return;
    seen[id] = 1;
    const lat = Math.round(+m[2] * 1e5) / 1e5, lon = Math.round(+m[1] * 1e5) / 1e5;
    if (near(lat, lon, 0.5)) return;
    put(lat, lon);
    const v = (k) => { return b[k] ? b[k].value : ""; };
    items.push({ lat: lat, lon: lon, code: code, row: [/^Q\d+$/.test(v("iL")) ? "" : cut(v("iL"), 90), cut(v("coL"), 40), id,
      v("w").replace("https://en.wikipedia.org/wiki/", ""), ""] });
  });
};
add(wd("reefs-special", Object.keys(WD).filter((q) => { return WD[q] !== "reef"; })));
add(wd("reefs-other", ["Q184358"], true));
console.log("noaa", crwN, "wikidata", items.length - crwN, "taken", Object.keys(taken).length);
console.log(JSON.stringify(split(path.join(OUT, "reefs"), items, "name,country,qid,wiki,crw")));
