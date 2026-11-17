// workspace/whereisthesun/tools/build-smells.js
/* SUNNY build step (t406u): data/world/smells.* (points file + detail shards, tools/split-points.js), free and keyless.
 *   node tools/build-smells.js <osm smells json from tools/osm-smells.py> <cache dir>
 * Canada: OpenStreetMap (ODbL). World: Wikidata (CC0) landfills, wastewater plants, paper and pulp mills, oil refineries, chemical
 * plants, slaughterhouses, rendering plants, tanneries, composting facilities and fumaroles; a Wikidata point within 1 km of an
 * OpenStreetMap one is left out, and an OpenStreetMap place mapped twice (a point and an area within 300 m, same type) is listed once. */
"use strict";
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const { split } = require("./split-points.js");
const OUT = path.join(__dirname, "..", "data", "world");
const [OSMF, CACHE] = process.argv.slice(2);
const WD = { Q152810: "landfill", Q15242449: "sewage", Q918088: "pulp", Q56316683: "pulp", Q3410766: "pulp", Q12353044: "refinery", Q905286: "refinery",
  Q385557: "meat", Q11400754: "meat", Q3515239: "meat", Q36804458: "compost", Q105880: "sulphur" };
const Q = "SELECT ?i ?iL ?c ?t ?coL ?opL ?w WHERE { VALUES ?t { " + Object.keys(WD).map((q) => { return "wd:" + q; }).join(" ") + " } ?i wdt:P31 ?t; wdt:P625 ?c. " +
  "OPTIONAL{?i wdt:P17 ?co} OPTIONAL{?i wdt:P137 ?op} OPTIONAL{?w schema:about ?i; schema:isPartOf <https://en.wikipedia.org/>} " +
  "SERVICE wikibase:label { bd:serviceParam wikibase:language \"en,mul,fr,de,es\". ?i rdfs:label ?iL. ?co rdfs:label ?coL. ?op rdfs:label ?opL } }";
const f = path.join(CACHE, "wd-smells.json");
if (!fs.existsSync(f)) {
  cp.execFileSync("curl", ["-s", "-m", "280", "-G", "-H", "Accept: application/sparql-results+json", "-A", "SUNNY-build/1.0 (github.com/xeea000/whereisthesun)",
    "--data-urlencode", "query=" + Q, "https://query.wikidata.org/sparql", "-o", f]);
}
const wd = JSON.parse(fs.readFileSync(f, "utf8")).results.bindings;
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
const items = [];
/* named places first, so the one kept of a pair is the one with a name */
JSON.parse(fs.readFileSync(OSMF, "utf8")).sort((a, b) => { return (b[3] ? 1 : 0) - (a[3] ? 1 : 0); }).forEach((r) => {
  if (near(r[0], r[1], 0.3, r[2])) return;
  put(r[0], r[1], r[2]);
  const ref = r[5].split("/");
  items.push({ lat: r[0], lon: r[1], code: r[2], row: [cut(r[3], 90), cut(r[6], 40), "Canada", "", "", ref[0].charAt(0) + ref[1], cut(r[4], 60)] });
});
const osmN = items.length, seen = {};
wd.forEach((b) => {
  const id = b.i.value.split("/").pop(), m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(b.c.value), code = WD[b.t.value.split("/").pop()];
  if (seen[id] || !m || !code) return;
  seen[id] = 1;
  const lat = Math.round(+m[2] * 1e5) / 1e5, lon = Math.round(+m[1] * 1e5) / 1e5;
  if (near(lat, lon, 1)) return;
  put(lat, lon, code);
  const v = (k) => { return b[k] ? b[k].value : ""; };
  items.push({ lat: lat, lon: lon, code: code, row: [/^Q\d+$/.test(v("iL")) ? "" : cut(v("iL"), 90), "", cut(v("coL"), 40), id,
    v("w").replace("https://en.wikipedia.org/wiki/", ""), "", cut(v("opL"), 60)] });
});
console.log("osm", osmN, "wikidata", items.length - osmN);
console.log(JSON.stringify(split(path.join(OUT, "smells"), items, "name,kind,country,qid,wiki,osm,op")));
