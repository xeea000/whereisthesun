// workspace/whereisthesun/tools/build-maritime.js
/* SUNNY build step (t397u): data/world/maritime.* (points file + detail shards, tools/split-points.js), free and keyless.
 *   node tools/build-maritime.js <Canada OSM maritime json from tools/osm-maritime.py> <cache dir>
 * Canada: OpenStreetMap (ODbL). World: Wikidata (CC0) ports and harbours, fishing and container ports, marinas, shipyards and dry docks.
 * A Wikidata point within 500 m of an OpenStreetMap one of the same type is left out; a place mapped twice in OpenStreetMap
 * (same type, within 150 m) is listed once. Existing Heritage places keep their Wikidata points, not duplicated here. */
"use strict";
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const { split } = require("./split-points.js");
const OUT = path.join(__dirname, "..", "data", "world");
const [OSMF, CACHE] = process.argv.slice(2);
const WD = { Q190928: "yard", Q811177: "dry", Q492425: "port", Q15310171: "port", Q44782: "port", Q1420027: "port", Q283202: "port", Q721207: "marina" };
/* one query per type keeps each answer well inside the query service time limit; a cut-off answer is fetched again */
const qOf = (t) => {
  return "SELECT ?i ?iL ?c ?t ?coL ?opL ?w WHERE { VALUES ?t { wd:" + t + " } ?i wdt:P31 ?t; wdt:P625 ?c. " +
    "OPTIONAL{?i wdt:P17 ?co} OPTIONAL{?i wdt:P137 ?op} OPTIONAL{?w schema:about ?i; schema:isPartOf <https://en.wikipedia.org/>} " +
    "SERVICE wikibase:label { bd:serviceParam wikibase:language \"en,mul,fr,de,es\". ?i rdfs:label ?iL. ?co rdfs:label ?coL. ?op rdfs:label ?opL } }";
};
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")).results.bindings; } catch (e) { return null; } };
const wd = [];
Object.keys(WD).forEach((t) => {
  const f = path.join(CACHE, "wd-maritime-" + t + ".json");
  for (let i = 0; i < 3 && !read(f); i++) {
    cp.execFileSync("curl", ["-s", "-m", "280", "-G", "-H", "Accept: application/sparql-results+json", "-A", "SUNNY-build/1.0 (github.com/xeea000/whereisthesun)",
      "--data-urlencode", "query=" + qOf(t), "https://query.wikidata.org/sparql", "-o", f]);
  }
  (read(f) || []).forEach((b) => { wd.push(b); });
});
const grid = {};
const near = (lat, lon, km, code) => {
  for (let a = -1; a <= 1; a++) for (let o = -1; o <= 1; o++) {
    const c = grid[(Math.round(lat * 50) + a) + "," + (Math.round(lon * 50) + o)] || [];
    for (let i = 0; i < c.length; i++) {
      const dy = (c[i][0] - lat) * 111, dx = (c[i][1] - lon) * 111 * Math.cos(lat * Math.PI / 180);
      if ((!code || c[i][2] === code) && dx * dx + dy * dy < km * km) return true;
    }
  }
  return false;
};
const put = (lat, lon, code) => { const k = Math.round(lat * 50) + "," + Math.round(lon * 50); (grid[k] = grid[k] || []).push([lat, lon, code]); };
const cut = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const taken = {};
fs.readdirSync(OUT).filter((f) => { return f.startsWith("history.d"); }).forEach((f) => {
  JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")).forEach((row) => { row.forEach((v) => { if (/^Q\d+$/.test(v)) taken[v] = 1; }); });
});
const items = [];
/* named places first, so the one kept of a pair is the one with a name */
JSON.parse(fs.readFileSync(OSMF, "utf8")).sort((a, b) => { return (b[3] ? 1 : 0) - (a[3] ? 1 : 0); }).forEach((r) => {
  if (near(r[0], r[1], 0.15, r[2])) return;
  put(r[0], r[1], r[2]);
  const ref = r[5].split("/");
  items.push({ lat: r[0], lon: r[1], code: r[2], row: [cut(r[3], 90), cut(r[6], 40), "Canada", "", "", ref[0].charAt(0) + ref[1], cut(r[4], 60)] });
});
const osmN = items.length, seen = {};
wd.forEach((b) => {
  const id = b.i.value.split("/").pop(), m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(b.c.value), code = WD[b.t.value.split("/").pop()];
  if (seen[id] || taken[id] || !m || !code) return;
  seen[id] = 1;
  const lat = Math.round(+m[2] * 1e5) / 1e5, lon = Math.round(+m[1] * 1e5) / 1e5;
  if (near(lat, lon, 0.5, code)) return;
  put(lat, lon, code);
  const v = (k) => { return b[k] ? b[k].value : ""; };
  items.push({ lat: lat, lon: lon, code: code, row: [/^Q\d+$/.test(v("iL")) ? "" : cut(v("iL"), 90), "", cut(v("coL"), 40), id,
    v("w").replace("https://en.wikipedia.org/wiki/", ""), "", cut(v("opL"), 60)] });
});
console.log("osm", osmN, "wikidata", items.length - osmN);
console.log(JSON.stringify(split(path.join(OUT, "maritime"), items, "name,kind,country,qid,wiki,osm,op")));
