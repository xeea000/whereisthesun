// workspace/whereisthesun/tools/build-ancient.js
/* SUNNY build step (t397u, t398u): data/world/ancient.* and data/world/expeditions.* (tools/split-points.js), free and keyless.
 *   node tools/build-ancient.js <cache dir> <BAS historic sites .dbf> <OSM Viking json>
 * Ancient places, Wikidata (CC0); each place once, in the first group that claims it:
 *   vsite   Viking settlements, trading towns, ring forts and ship graves: culture Vikings (P2596 Q12567), Viking ring fortress,
 *           ship grave, and named Viking Age sites Wikidata files only as archaeological sites (VIKING below)
 *   vstone  runestones and picture stones (Wikidata), with OpenStreetMap historic=rune_stone and Viking-tagged places (ODbL)
 *   city    ancient cities
 *   settle  ancient and prehistoric settlements: prehistoric and Neolithic settlements, tells, cliff dwellings, Maya sites,
 *           former settlements
 *   ruin    ruins
 *   arch    archaeological sites with at least one Wikipedia article, hillforts
 * Places already on Heritage & ancient sites, Ghost towns or a Wars row stay there, except Viking sites, which move here (history.* is
 * rewritten without them). In Canada a Wikidata point within 300 m of a ruin or archaeological site on Historic plaques is left out.
 * Expeditions:
 *   hsm     Antarctic Historic Sites and Monuments (Antarctic Treaty list, from the British Antarctic Survey points, CC BY 4.0)
 *   land    places that commemorate an expedition or a voyage of discovery (Wikidata P547), and first landing sites (LANDINGS) */
"use strict";
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const { split } = require("./split-points.js");
const OUT = path.join(__dirname, "..", "data", "world");
const PACKS = path.join(__dirname, "..", "data", "packs");
const [CACHE, DBF, OSMV] = process.argv.slice(2);
const COLS = "name,kind,year,country,qid,wiki,osm";
const VIKING = ["Q208177", "Q1737156", "Q189113", "Q796045", "Q2624400", "Q1478633", "Q2303857", "Q165414", "Q393191"];
const LANDINGS = ["Q1072391", "Q886957", "Q98839256", "Q5453179"];
const sel = (where, langs) => {
  return "SELECT ?i ?iL ?c ?kL ?inc ?coL ?w WHERE { " + where + " ?i wdt:P625 ?c. OPTIONAL{?i wdt:P31 ?k} OPTIONAL{?i wdt:P571 ?inc} OPTIONAL{?i wdt:P17 ?co}" +
    " OPTIONAL{?w schema:about ?i; schema:isPartOf <https://en.wikipedia.org/>}" +
    " SERVICE wikibase:label { bd:serviceParam wikibase:language \"" + (langs || "en,mul,sv,da,no,de,fr,es,it") + "\". ?i rdfs:label ?iL. ?k rdfs:label ?kL. ?co rdfs:label ?coL } }";
};
const Q = {
  vsite: sel("{ ?i wdt:P2596 wd:Q12567 } UNION { ?i wdt:P31 wd:Q586552 } UNION { ?i wdt:P31 wd:Q124473037 } UNION { VALUES ?i { " +
    VIKING.map((q) => { return "wd:" + q; }).join(" ") + " } }"),
  vstone: sel("{ ?i wdt:P31/wdt:P279* wd:Q815241 } UNION { ?i wdt:P31 wd:Q602202 }"),
  city: sel("?i wdt:P31 wd:Q15661340."),
  settle: sel("VALUES ?t { wd:Q106492558 wd:Q106491339 wd:Q755017 wd:Q899959 wd:Q30504597 wd:Q22674925 } ?i wdt:P31 ?t."),
  ruin: sel("?i wdt:P31 wd:Q109607."),
  /* asked in parts by how many Wikipedia articles a site has, with names in English or the shared label (mul): together, or with more
   * name languages, they run past the query service's time limit */
  hill: sel("?i wdt:P31 wd:Q744099."),
  hsmwd: sel("?i wdt:P1435 wd:Q21013851."),
  land: sel("{ ?i wdt:P547 ?e. ?e wdt:P31/wdt:P279* ?t. VALUES ?t { wd:Q2401485 wd:Q1322263 wd:Q2402130 wd:Q170584 } } UNION { VALUES ?i { " +
    LANDINGS.map((q) => { return "wd:" + q; }).join(" ") + " } }")
};
/* a busy query service sometimes cuts an answer short; each query is asked up to three times */
const ARCH = [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 7], [8, 9], [10, 9999]];
ARCH.forEach((r) => { Q["arch" + r[0]] = sel("?i wdt:P31 wd:Q839954; wikibase:sitelinks ?s. FILTER(?s >= " + r[0] + " && ?s <= " + r[1] + ")", "en,mul"); });
/* sites with one article are the most: asked again in three ranges of item number */
const QN = "xsd:integer(STRAFTER(STR(?i), \"Q\"))";
[[0, 2e7], [2e7, 8e7], [8e7, 1e12]].forEach((r, n) => {
  Q["arch1" + "abc".charAt(n)] = sel("?i wdt:P31 wd:Q839954; wikibase:sitelinks ?s. FILTER(?s = 1 && " + QN + " >= " + r[0] + " && " + QN + " < " + r[1] + ")", "en,mul");
});
const wd = (name) => {
  const f = path.join(CACHE, "wd-" + name + ".json");
  for (let i = 0; i < 3; i++) {
    if (!fs.existsSync(f)) {
      cp.execFileSync("curl", ["-s", "-m", "280", "-G", "-H", "Accept: application/sparql-results+json", "-A", "SUNNY-build/1.0 (github.com/xeea000/whereisthesun)",
        "--data-urlencode", "query=" + Q[name], "https://query.wikidata.org/sparql", "-o", f]);
    }
    try { return JSON.parse(fs.readFileSync(f, "utf8")).results.bindings; } catch (e) { fs.renameSync(f, f + ".bad"); }
  }
  throw new Error(name + ": Wikidata did not answer, run again");
};
const v = (b, k) => { return b[k] ? b[k].value : ""; };
const cut = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const r5 = (x) => { return Math.round(x * 1e5) / 1e5; };
/* one grid of kept points in 0.01 degree cells for the distance checks */
const grid = {};
const cell = (lat, lon) => { return Math.round(lat * 100) + "," + Math.round(lon * 100); };
const near = (lat, lon, km, g) => {
  g = g || grid;
  for (let a = -1; a <= 1; a++) for (let o = -1; o <= 1; o++) {
    const c = g[(Math.round(lat * 100) + a) + "," + (Math.round(lon * 100) + o)] || [];
    for (let i = 0; i < c.length; i++) {
      const dy = (c[i][0] - lat) * 111, dx = (c[i][1] - lon) * 111 * Math.cos(lat * Math.PI / 180);
      if (dx * dx + dy * dy < km * km) return true;
    }
  }
  return false;
};
const put = (lat, lon, g) => { g = g || grid; const k = cell(lat, lon); (g[k] = g[k] || []).push([lat, lon]); };
/* points file + shards back to rows */
const readSplit = (base) => {
  const p = JSON.parse(fs.readFileSync(base + ".p.json", "utf8")), out = [];
  let a = 0, o = 0, shard = -1, rows = null;
  for (let i = 0; i < p.n; i++) {
    a += p.lat[i]; o += p.lon[i];
    if (Math.floor(i / p.S) !== shard) { shard = Math.floor(i / p.S); rows = JSON.parse(fs.readFileSync(base + ".d" + shard + ".json", "utf8")); }
    out.push({ lat: a / 1e5, lon: o / 1e5, code: p.codes[p.c[i]], row: rows[i % p.S] });
  }
  return { p: p, items: out };
};
const by = {};
const add = (code, b) => {
  const id = v(b, "i").split("/").pop(), m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(v(b, "c")), name = v(b, "iL");
  if (!m || /^Q\d+$/.test(name)) return;
  const y = /^(-?\d+)-/.exec(v(b, "inc")), yr = y ? String(+y[1]) : "";
  if (by[id]) { if (!by[id].row[2] && yr) by[id].row[2] = yr; return; }
  by[id] = { lat: r5(+m[2]), lon: r5(+m[1]), code: code, row: [cut(name, 90), cut(v(b, "kL"), 50), yr, cut(v(b, "coL"), 40), id,
    v(b, "w").replace("https://en.wikipedia.org/wiki/", ""), ""] };
};
const ORDER = ["vsite", "vstone", "city", "settle", "ruin"].concat(ARCH.slice(1).map((r) => { return "arch" + r[0]; }).reverse(), ["arch1a", "arch1b", "arch1c", "hill"]);
ORDER.forEach((k) => {
  wd(k).forEach((b) => { add(/^(arch\d+[a-c]?|hill)$/.test(k) ? "arch" : k, b); });
  console.error(k, Object.keys(by).length);
});
/* Heritage & ancient sites and Ghost towns keep their places, except Viking sites */
const hist = readSplit(path.join(OUT, "history"));
const ghost = readSplit(path.join(OUT, "ghost"));
const vik = {};
Object.keys(by).forEach((q) => { if (/^v/.test(by[q].code)) vik[q] = 1; });
hist.items.forEach((it) => { if (!vik[it.row[4]]) delete by[it.row[4]]; });
ghost.items.forEach((it) => { delete by[it.row[6]]; });
/* places on a Wars row stay there */
fs.readdirSync(OUT).filter((f) => { return /^wars-[a-z0-9]+\.p\.json$/.test(f); }).forEach((f) => {
  readSplit(path.join(OUT, f.replace(/\.p\.json$/, ""))).items.forEach((it) => { delete by[it.row[4]]; });
});
/* Canada: ruins and archaeological sites already on Historic plaques */
const plq = {};
fs.readdirSync(PACKS).filter((d) => { return fs.existsSync(path.join(PACKS, d, "plaques.p.json")); }).forEach((d) => {
  readSplit(path.join(PACKS, d, "plaques")).items.forEach((it) => { if (/ruins|archaeolog/.test(it.row[1] || "")) put(it.lat, it.lon, plq); });
});
const list = Object.values(by).filter((it) => { return /^v/.test(it.code) || !near(it.lat, it.lon, 0.3, plq); });
list.forEach((it) => { put(it.lat, it.lon); });
/* OpenStreetMap runestones and Viking-tagged places, unless Wikidata has one within 100 m */
const osm = JSON.parse(fs.readFileSync(OSMV, "utf8")).elements || [];
let no = 0;
osm.forEach((el) => {
  const t = el.tags || {}, c = el.type === "node" ? el : el.center;
  if (!c || near(c.lat, c.lon, 0.1)) return;
  const stone = t.historic === "rune_stone";
  list.push({ lat: r5(c.lat), lon: r5(c.lon), code: stone ? "vstone" : "vsite", row: [cut(t.name || (stone ? "Runestone" : "Viking site"), 90),
    stone ? "runestone" : cut(String(t.archaeological_site || t.historic || "").replace(/_/g, " "), 50), "", "", "", cut(t.wikipedia || "", 120),
    el.type.charAt(0) + el.id] });
  put(c.lat, c.lon); no++;
});
console.error("osm viking", no);
const kept = hist.items.filter((it) => { return !vik[it.row[4]]; });
console.error("history moved", hist.items.length - kept.length);
console.log("history", JSON.stringify(split(path.join(OUT, "history"), kept, hist.p.cols, hist.p.S)));
console.log("ancient", JSON.stringify(split(path.join(OUT, "ancient"), list, COLS)));
/* Expeditions: the Antarctic list read from the BAS dBase file (latitude and longitude written as degrees, minutes, seconds) */
const dbf = (f) => {
  const b = fs.readFileSync(f), n = b.readUInt32LE(4), hl = b.readUInt16LE(8), rl = b.readUInt16LE(10), fields = [];
  for (let o = 32; b[o] !== 0x0d; o += 32) fields.push([b.toString("latin1", o, o + 11).replace(/\0.*$/, ""), b[o + 16]]);
  const out = [];
  for (let i = 0; i < n; i++) {
    let o = hl + i * rl + 1;
    const r = {};
    /* the file is UTF-8 (its .cpg); a character the source already lost (U+FFFD: degree signs, quotes) becomes a space */
    fields.forEach((f) => { r[f[0]] = b.toString("utf8", o, o + f[1]).replace(/\uFFFD/g, " ").replace(/ {2,}/g, " ").trim(); o += f[1]; });
    out.push(r);
  }
  return out;
};
const dms = (s) => {
  const m = /(\d+)\D+(\d+)?\D*(\d+(?:\.\d+)?)?\D*([NSEW])/.exec(s || "");
  if (!m) return null;
  const x = +m[1] + (+(m[2] || 0)) / 60 + (+(m[3] || 0)) / 3600;
  return /[SW]/.test(m[4]) ? -x : x;
};
const exp = [], eg = {};
dbf(DBF).forEach((r) => {
  const lat = dms(r.latitude), lon = dms(r.longitude);
  if (lat == null || lon == null) return;
  exp.push({ lat: r5(lat), lon: r5(lon), code: "hsm", row: [cut(r.name, 90), "Antarctic Historic Site or Monument No. " + Math.round(+r.number),
    "", "Antarctica", "", "", cut(r.descriptio, 250)] });
  put(lat, lon, eg);
});
wd("hsmwd").map((b) => { return ["hsm", b]; }).concat(wd("land").map((b) => { return ["land", b]; })).forEach((x) => {
  const b = x[1];
  const id = v(b, "i").split("/").pop(), m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(v(b, "c"));
  /* the Treaty list gives coarse positions, so in the Antarctic a Wikidata site within 3 km of a listed one is taken to be it */
  const far = (e) => {
    const dy = (e.lat - m[2]) * 111, dx = (e.lon - m[1]) * 111 * Math.cos(m[2] * Math.PI / 180);
    return dx * dx + dy * dy >= 9;
  };
  if (!m || exp.some((e) => { return e.row[4] === id; }) || near(+m[2], +m[1], 0.5, eg) || (+m[2] < -60 && !exp.every(far))) return;
  const y = /^(-?\d+)-/.exec(v(b, "inc"));
  exp.push({ lat: r5(+m[2]), lon: r5(+m[1]), code: x[0], row: [cut(v(b, "iL"), 90), cut(v(b, "kL"), 50), y ? String(+y[1]) : "", cut(v(b, "coL"), 40), id,
    v(b, "w").replace("https://en.wikipedia.org/wiki/", ""), ""] });
  put(+m[2], +m[1], eg);
});
console.log("expeditions", JSON.stringify(split(path.join(OUT, "expeditions"), exp, "name,kind,year,country,qid,wiki,desc")));
