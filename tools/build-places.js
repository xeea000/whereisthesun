// workspace/whereisthesun/tools/build-places.js
/* SUNNY build step (t397u): data/world/<set>.* (points file + detail shards, tools/split-points.js) for the place sets that
 * tools/osm-canada.py reads from a local Canada OpenStreetMap extract (ODbL), plus, where a set has them, worldwide places from
 * Wikidata (CC0) and from one OpenStreetMap Overpass query at build time for a few brands. Free and keyless.
 *   node tools/build-places.js <set> <dir with <set>.json from tools/osm-canada.py> <cache dir>
 * Canada rows first; a place mapped twice in OpenStreetMap (same type within 150 m) is listed once, and a worldwide place
 * within 1 km of one already listed (same type) is left out. */
"use strict";
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const { split } = require("./split-points.js");
const OUT = path.join(__dirname, "..", "data", "world");
const [SET, SRC, CACHE] = process.argv.slice(2);
const UA = "Mozilla/5.0 (X11; Linux x86_64) SUNNY-build/1.0 (github.com/xeea000/whereisthesun)";
/* worldwide extras per set: Wikidata types by code, and Overpass statements with a function giving each element's code */
const WORLD = {
  fun: { wd: { Q43501: "zoo", Q2281788: "zoo", Q2416723: "park", Q194195: "park" } },
  furniture: { ov: 'nwr["brand:wikidata"="Q54078"]["shop"];', code: () => { return "ikea"; } },
  ev: { ov: 'nwr["amenity"="charging_station"]["brand:wikidata"="Q478214"];nwr["shop"="car"]["brand:wikidata"="Q478214"];',
    code: (t) => {
      if (t.shop === "car") return "store";
      return /supercharger/i.test((t.name || "") + (t.network || "")) || t["socket:tesla_supercharger"] ? "super" : "dest";
    } }
};
const W = WORLD[SET] || {};
const fetch = (url, file, extra) => {
  const f = path.join(CACHE, file);
  for (let i = 0; i < 3; i++) {
    try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { /* fetch below */ }
    cp.execFileSync("curl", ["-s", "-m", "290", "-A", UA, "-o", f].concat(extra, [url]));
  }
  return JSON.parse(fs.readFileSync(f, "utf8"));
};
const grid = {};
const near = (lat, lon, km, code) => {
  for (let a = -1; a <= 1; a++) for (let o = -1; o <= 1; o++) {
    const c = grid[(Math.round(lat * 50) + a) + "," + (Math.round(lon * 50) + o)] || [];
    for (let i = 0; i < c.length; i++) {
      const dy = (c[i][0] - lat) * 111, dx = (c[i][1] - lon) * 111 * Math.cos(lat * Math.PI / 180);
      if (c[i][2] === code && dx * dx + dy * dy < km * km) return true;
    }
  }
  return false;
};
const put = (lat, lon, code) => { const k = Math.round(lat * 50) + "," + Math.round(lon * 50); (grid[k] = grid[k] || []).push([lat, lon, code]); };
const cut = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const items = [];
const add = (lat, lon, code, km, row) => {
  lat = Math.round(lat * 1e5) / 1e5; lon = Math.round(lon * 1e5) / 1e5;
  if (near(lat, lon, km, code)) return;
  put(lat, lon, code);
  items.push({ lat: lat, lon: lon, code: code, row: row });
};
/* rows [name, brand or operator, osm, extra, country, qid, wiki]; named places first so the one kept of a pair has a name */
JSON.parse(fs.readFileSync(path.join(SRC, SET + ".json"), "utf8")).sort((a, b) => { return (b[3] ? 1 : 0) - (a[3] ? 1 : 0); }).forEach((r) => {
  add(r[0], r[1], r[2], 0.15, [cut(r[3], 90), cut(r[4], 60), r[5], cut(r[6], 60), "Canada", "", ""]);
});
const caN = items.length;
if (W.ov) {
  const q = "[out:json][timeout:280];(" + W.ov + ");out center tags;";
  fetch("https://overpass-api.de/api/interpreter", "ov-" + SET + ".json", ["-G", "--data-urlencode", "data=" + q]).elements.forEach((e) => {
    const t = e.tags || {}, lat = e.lat != null ? e.lat : e.center && e.center.lat, lon = e.lon != null ? e.lon : e.center && e.center.lon;
    if (lat == null) return;
    add(lat, lon, W.code(t), 0.15, [cut(t.name, 90), cut(t.brand || t.operator, 60), e.type.charAt(0) + e.id, cut(t.capacity || t.shop, 60),
      cut(t["addr:country"], 40), "", ""]);
  });
}
if (W.wd) {
  Object.keys(W.wd).forEach((t) => {
    const q = "SELECT ?i ?iL ?c ?coL ?w WHERE { ?i wdt:P31 wd:" + t + "; wdt:P625 ?c. OPTIONAL{?i wdt:P17 ?co} " +
      "OPTIONAL{?w schema:about ?i; schema:isPartOf <https://en.wikipedia.org/>} " +
      "SERVICE wikibase:label { bd:serviceParam wikibase:language \"en,mul,fr,de,es\". ?i rdfs:label ?iL. ?co rdfs:label ?coL } }";
    fetch("https://query.wikidata.org/sparql", "wd-" + SET + "-" + t + ".json", ["-G", "-H", "Accept: application/sparql-results+json",
      "--data-urlencode", "query=" + q]).results.bindings.forEach((b) => {
      const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(b.c.value), v = (k) => { return b[k] ? b[k].value : ""; };
      if (!m) return;
      add(+m[2], +m[1], W.wd[t], 1, [/^Q\d+$/.test(v("iL")) ? "" : cut(v("iL"), 90), "", "", "", cut(v("coL"), 40), b.i.value.split("/").pop(),
        v("w").replace("https://en.wikipedia.org/wiki/", "")]);
    });
  });
}
console.log(SET, "canada", caN, "world", items.length - caN);
console.log(JSON.stringify(split(path.join(OUT, SET), items, "name,op,osm,extra,country,qid,wiki")));
