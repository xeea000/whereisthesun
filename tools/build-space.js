// workspace/whereisthesun/tools/build-space.js
/* SUNNY build step (t397u): data/world/space.* (points file + detail shards, tools/split-points.js), free and keyless.
 *   node tools/build-space.js <cache dir>
 * Wikidata (CC0): spaceports, launch sites, launch pads, space centres, rocket engine test stands, and factories whose product is a
 * launch vehicle, spacecraft or satellite (not missiles). OpenStreetMap (ODbL, one Overpass query at build time): launch pads and
 * spaceports, and works tagged as making spacecraft, space rockets or satellites, or named as a space factory or assembly site.
 * Wikidata first; an OpenStreetMap place of the same kind within 500 m (spaceports 3 km; works 3 km of any kind) of one already
 * listed is left out. A Wikidata place already in Science labs or Heritage (same id) is left out. */
"use strict";
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const { split } = require("./split-points.js");
const OUT = path.join(__dirname, "..", "data", "world");
const CACHE = process.argv[2];
const UA = "Mozilla/5.0 (X11; Linux x86_64) SUNNY-build/1.0 (github.com/xeea000/whereisthesun)";
const get = (url, file, extra) => {
  const f = path.join(CACHE, file);
  if (!fs.existsSync(f)) cp.execFileSync("curl", ["-s", "-f", "-m", "290", "-A", UA, "-o", f].concat(extra || [], [url]));
  return JSON.parse(fs.readFileSync(f, "utf8"));
};
const WD = { Q194188: "port", Q1933026: "port", Q1353183: "pad", Q1192221: "centre", Q1030411: "centre" };
const sparql = (name, body) => {
  const q = "SELECT ?i ?iL ?c ?t ?coL ?opL ?w ?y WHERE { " + body + " ?i wdt:P625 ?c. OPTIONAL{?i wdt:P17 ?co} OPTIONAL{?i wdt:P137 ?op} " +
    "OPTIONAL{?i wdt:P571 ?y} OPTIONAL{?w schema:about ?i; schema:isPartOf <https://en.wikipedia.org/>} " +
    "SERVICE wikibase:label { bd:serviceParam wikibase:language \"en,mul,fr,ru,zh\". ?i rdfs:label ?iL. ?co rdfs:label ?coL. ?op rdfs:label ?opL } }";
  return get("https://query.wikidata.org/sparql", "wd-" + name + ".json", ["-G", "-H", "Accept: application/sparql-results+json",
    "--data-urlencode", "query=" + q]).results.bindings;
};
const taken = {};
["labs", "history"].forEach((base) => {
  fs.readdirSync(OUT).filter((f) => { return f.startsWith(base + ".d"); }).forEach((f) => {
    JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")).forEach((row) => { row.forEach((v) => { if (/^Q\d+$/.test(v)) taken[v] = 1; }); });
  });
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
const items = [], seen = {};
const addWd = (rows, codeOf) => {
  rows.forEach((b) => {
    const id = b.i.value.split("/").pop(), m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(b.c.value), code = codeOf(b);
    if (seen[id] || taken[id] || !m || !code) return;
    seen[id] = 1;
    const lat = Math.round(+m[2] * 1e5) / 1e5, lon = Math.round(+m[1] * 1e5) / 1e5;
    put(lat, lon, code);
    const v = (k) => { return b[k] ? b[k].value : ""; };
    items.push({ lat: lat, lon: lon, code: code, row: [/^Q\d+$/.test(v("iL")) ? "" : cut(v("iL"), 90), v("y").slice(0, 4), cut(v("opL"), 60),
      cut(v("coL"), 40), id, v("w").replace("https://en.wikipedia.org/wiki/", ""), ""] });
  });
};
addWd(sparql("space-sites", "VALUES ?t { " + Object.keys(WD).map((q) => { return "wd:" + q; }).join(" ") + " } ?i wdt:P31 ?t."),
  (b) => { return WD[b.t.value.split("/").pop()]; });
addWd(sparql("space-factories", "?i wdt:P31/wdt:P279* wd:Q83405; wdt:P1056 ?p. ?p wdt:P279* ?r. " +
  "VALUES ?r { wd:Q697175 wd:Q40218 wd:Q26540 }"), () => { return "factory"; });
const wdN = items.length;
const SPACEY = /(^|[^a-z])(space|rocket|launch|orbit|satellit|astro)/i;
const osmCode = (t) => {
  if (t.aeroway === "launchpad" || t.man_made === "launch_pad") return "pad";
  if (t.aeroway === "spaceport") return "port";
  /* launch complexes are sometimes mapped as aerospace industry */
  if (/launch complex|\bpad\b|^slc-/i.test(t.name || "")) return "pad";
  /* a works only when its tags say it makes spacecraft or space rockets, or its name says it builds them; offices, headquarters and
   * defence firms are left out */
  if (/spacecraft|space.?rocket|aerospace_rockets|satellite/i.test(t.product || "")) return "factory";
  if (SPACEY.test(t.name || "") && /construction facility|factory|manufactur|assembly|build/i.test(t.name || "")) return "factory";
  return "";
};
const ovq = "[out:json][timeout:180];(nwr[\"aeroway\"~\"^(launchpad|spaceport)$\"];nwr[\"man_made\"=\"launch_pad\"];" +
  "nwr[\"industrial\"=\"aerospace\"][\"name\"~\"[Ss]pace|[Rr]ocket|[Ll]aunch|[Oo]rbit|[Ss]atellit|[Aa]stro\"];nwr[\"industrial\"=\"space\"];" +
  "nwr[\"product\"~\"spacecraft|rocket\"];);out center tags;";
get("https://overpass-api.de/api/interpreter", "osm-space.json", ["-G", "--data-urlencode", "data=" + ovq]).elements.forEach((e) => {
  const t = e.tags || {}, code = osmCode(t), lat = e.lat != null ? e.lat : e.center && e.center.lat, lon = e.lon != null ? e.lon : e.center && e.center.lon;
  if (!code || lat == null) return;
  const la = Math.round(lat * 1e5) / 1e5, lo = Math.round(lon * 1e5) / 1e5;
  if (near(la, lo, code === "pad" ? 0.5 : 3, code === "factory" ? "" : code)) return;
  put(la, lo, code);
  items.push({ lat: la, lon: lo, code: code, row: [cut(t.name, 90), String(t.start_date || "").slice(0, 4), cut(t.operator, 60), "", "", "",
    e.type.charAt(0) + e.id] });
});
console.log("wikidata", wdN, "osm", items.length - wdN, "taken", Object.keys(taken).length);
console.log(JSON.stringify(split(path.join(OUT, "space"), items, "name,year,op,country,qid,wiki,osm")));
