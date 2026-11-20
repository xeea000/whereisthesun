// workspace/whereisthesun/tools/build-history-uk.js
/* SUNNY History fill for the United Kingdom (Scotland first, then England, Wales and Northern Ireland).
 * Adds named places from Wikidata (CC0, no Wikipedia-count gate — the same rule as Canada's
 * castle and site fill in tools/build-history.js) and OpenStreetMap (ODbL) historic tags:
 * castles, towers, brochs, hillforts, abbeys, battlefields, standing stones, cairns,
 * Roman sites, and other named historic places. Each location is kept once: an existing
 * History point wins, then a Wikidata point, then OpenStreetMap. Usage:
 *   node tools/build-history-uk.js [cache dir]
 * Writes data/world/history.* and updates data/world/manifest.json. */
"use strict";
var fs = require("fs");
var path = require("path");
var { split } = require("./split-points.js");
var ROOT = path.join(__dirname, "..");
var OUT = path.join(ROOT, "data", "world");
var CACHE = process.argv[2] || path.join("/tmp", "uk-hist-cache");
var COLS = "name,kind,year,country,qid,wiki,osm";
var NOW = new Date().getFullYear();
var AREAS = [
  ["GB-SCT", "Scotland"],
  ["GB-ENG", "England"],
  ["GB-WLS", "Wales"],
  ["GB-NIR", "Northern Ireland"]
];
var QL = '(nwr["historic"="castle"]["name"](area.a);' +
  'nwr["historic"="tower"]["name"](area.a);' +
  'nwr["historic"="broch"]["name"](area.a);' +
  'nwr["historic"="archaeological_site"]["site_type"~"broch"]["name"](area.a);' +
  'nwr["historic"="hillfort"]["name"](area.a);' +
  'nwr["historic"="archaeological_site"]["site_type"~"hillfort"]["name"](area.a);' +
  'nwr["fortification_type"="hillfort"]["name"](area.a);' +
  'nwr["historic"="battlefield"]["name"](area.a);' +
  'nwr["historic"~"^(monastery|abbey|priory)$"]["name"](area.a);' +
  'nwr["historic"~"^(standing_stone|stone_circle|menhir|megalith)$"]["name"](area.a);' +
  'nwr["historic"="cairn"]["name"](area.a);' +
  'nwr["historic"="archaeological_site"]["site_type"~"cairn"]["name"](area.a);' +
  'nwr["historic"="roman_villa"]["name"](area.a);' +
  'nwr["historic:civilization"~"^(roman|ancient_roman)$"]["name"](area.a);' +
  'nwr["historic"~"^(fort|ruins|manor|city_gate|archaeological_site)$"]["name"](area.a););';
function sleep(ms) {
  return new Promise((res) => { setTimeout(res, ms); });
}
function cut(s, n) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function band(y) {
  if (y === "" || y == null || !isFinite(+y)) return "cnone";
  var a = NOW - +y;
  return a <= 200 ? "c200" : a <= 500 ? "c500" : a <= 1000 ? "c1000" : a <= 1500 ? "c1500" : "cold";
}
function parseYear(s) {
  var m = /^(-?\d{3,4})(?:-\d{2}(?:-\d{2})?)?$/.exec(String(s || "").trim());
  return m ? +m[1] : "";
}
function ptWkt(s) {
  var m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(s || "");
  return m ? [+m[2], +m[1]] : null;
}
async function sparql(q) {
  var u = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q);
  var t;
  for (t = 0; t < 4; t++) {
    try {
      var r = await fetch(u, { headers: { "User-Agent": "SunnyBuild/1.0 (github.com/xeea000/whereisthesun)" } });
      if (r.ok) return (await r.json()).results.bindings;
      console.error("wikidata", r.status);
    } catch (e) { console.error(e.message); }
    await sleep(5000);
  }
  throw new Error("wikidata failed");
}
function v(b, k) { return b[k] ? b[k].value : ""; }
async function subs(roots) {
  var q = "SELECT DISTINCT ?s WHERE { VALUES ?k0 { " + roots.map((r) => { return "wd:" + r; }).join(" ") +
    " } ?s wdt:P279* ?k0. }";
  return (await sparql(q)).map((b) => { return "wd:" + v(b, "s").split("/").pop(); });
}
function loadExisting() {
  var p = JSON.parse(fs.readFileSync(path.join(OUT, "history.p.json"), "utf8"));
  var cols = typeof p.cols === "string" ? p.cols.split(",") : p.cols;
  var items = [];
  var a = 0, o = 0, i, k, shard, row, rec, j, outRow;
  for (i = 0; i < p.n; i++) {
    a += p.lat[i]; o += p.lon[i];
    if (i % p.S === 0) shard = JSON.parse(fs.readFileSync(path.join(OUT, "history.d" + (i / p.S) + ".json"), "utf8"));
    row = shard[i % p.S] || [];
    rec = {};
    cols.forEach((c, n) => { rec[c] = row[n]; });
    outRow = COLS.split(",").map((c) => { return rec[c] == null ? "" : rec[c]; });
    items.push({ lat: a / 1e5, lon: o / 1e5, code: p.codes[p.c[i]], row: outRow, qid: rec.qid || "", name: rec.name || "" });
  }
  return items;
}
function keyDeg(lat, lon) {
  return Math.floor(lat * 200) + ":" + Math.floor(lon * 200);
}
function indexItems(items) {
  var grid = Object.create(null);
  var qids = Object.create(null);
  items.forEach((it) => {
    if (it.qid) qids[it.qid] = 1;
    var k = keyDeg(it.lat, it.lon);
    if (!grid[k]) grid[k] = [];
    grid[k].push(it);
  });
  return { grid: grid, qids: qids };
}
function nearHave(idx, lat, lon, name) {
  var i, j, k, cell, it, dlat, dlon, n, nm;
  n = (name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  for (i = -1; i <= 1; i++) {
    for (j = -1; j <= 1; j++) {
      cell = idx.grid[Math.floor((lat + i * 0.005) * 200) + ":" + Math.floor((lon + j * 0.005) * 200)];
      if (!cell) continue;
      for (k = 0; k < cell.length; k++) {
        it = cell[k];
        dlat = (it.lat - lat) * 111;
        dlon = (it.lon - lon) * 111 * Math.cos(lat * Math.PI / 180);
        if (dlat * dlat + dlon * dlon < 0.15 * 0.15) return true;
        if (dlat * dlat + dlon * dlon < 0.3 * 0.3) {
          nm = (it.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
          if (n && nm && (n === nm || n.indexOf(nm) >= 0 || nm.indexOf(n) >= 0)) return true;
        }
      }
    }
  }
  return false;
}
function addItem(items, idx, it) {
  if (it.qid && idx.qids[it.qid]) return false;
  if (nearHave(idx, it.lat, it.lon, it.name)) return false;
  items.push(it);
  if (it.qid) idx.qids[it.qid] = 1;
  var k = keyDeg(it.lat, it.lon);
  if (!idx.grid[k]) idx.grid[k] = [];
  idx.grid[k].push(it);
  return true;
}
function item(lat, lon, code, name, kind, year, country, qid, wiki, osm) {
  return {
    lat: +(+lat).toFixed(5), lon: +(+lon).toFixed(5), code: code, name: name,
    qid: qid || "",
    row: [cut(name, 90), cut(kind, 80), year === "" || year == null ? "" : year, country || "United Kingdom", qid || "", wiki || "", osm || ""]
  };
}
async function wdRows(where, codeOf) {
  var q = "SELECT ?i ?iL ?c ?kL ?inc ?coL ?w WHERE { " + where +
    " ?i wdt:P625 ?c. OPTIONAL{?i wdt:P571 ?inc} OPTIONAL{?i wdt:P17 ?co}" +
    " OPTIONAL{?w schema:about ?i; schema:isPartOf <https://en.wikipedia.org/>}" +
    " SERVICE wikibase:label { bd:serviceParam wikibase:language \"en,mul\". ?i rdfs:label ?iL. ?k rdfs:label ?kL. ?co rdfs:label ?coL } }";
  var out = [];
  (await sparql(q)).forEach((b) => {
    var id = v(b, "i").split("/").pop(), p = ptWkt(v(b, "c")), name = v(b, "iL");
    if (!p || /^Q\d+$/.test(name) || !name) return;
    var y = /^(-?\d+)-/.exec(v(b, "inc"));
    var yr = y ? +y[1] : "";
    var code = typeof codeOf === "function" ? codeOf(yr) : codeOf;
    if (!code) return;
    var wiki = v(b, "w").replace("https://en.wikipedia.org/wiki/", "");
    out.push(item(p[0], p[1], code, name, v(b, "kL"), yr, v(b, "coL") || "United Kingdom", id, wiki, ""));
  });
  return out;
}
async function wdBatched(cls, extra, codeOf) {
  var n = [], i, part;
  for (i = 0; i < cls.length; i += 80) {
    part = await wdRows("VALUES ?k { " + cls.slice(i, i + 80).join(" ") +
      " } VALUES ?co0 { wd:Q145 wd:Q21 wd:Q22 wd:Q25 wd:Q26 } ?i wdt:P31 ?k. ?i wdt:P17 ?co0. " + extra, codeOf);
    n = n.concat(part);
    console.error("wikidata batch", i, "got", part.length);
  }
  return n;
}
function wantOsm(t) {
  var h = t.historic || "";
  var st = t.site_type || t.fortification_type || "";
  var civ = t["historic:civilization"] || "";
  var ok = "castle|tower|broch|hillfort|battlefield|monastery|abbey|priory|standing_stone|stone_circle|menhir|megalith";
  ok += "|cairn|roman_villa|fort|ruins|manor|city_gate|archaeological_site";
  if (new RegExp("^(" + ok + ")$").test(h)) return true;
  if (/broch|hillfort|cairn/.test(st) || t.fortification_type === "hillfort") return true;
  if (/^(roman|ancient_roman)$/.test(civ)) return true;
  return false;
}
function ukNation(lat, lon) {
  if (lon < -5.4 && lat < 55.4 && lat >= 54.0 && lon > -8.3) return "Northern Ireland";
  var border;
  if (lon <= -3.6) border = 54.63;
  else if (lon >= -2.0) border = 55.81;
  else border = 54.63 + (lon + 3.6) / 1.6 * (55.81 - 54.63);
  if (lat >= border) return "Scotland";
  if (lon <= -2.72 && lon >= -5.5 && lat >= 51.33 && lat <= 53.43) {
    if (lat >= 53.05 && lon >= -3.05) return "England";
    if (lat < 51.55 && lon > -2.85) return "England";
    return "Wales";
  }
  return "England";
}
function sh(cmd, args, opt) {
  require("child_process").execFileSync(cmd, args, opt || { stdio: "inherit" });
}
function geomCentre(g) {
  if (!g) return null;
  if (g.type === "Point") return { lon: g.coordinates[0], lat: g.coordinates[1] };
  var b = [180, 90, -180, -90];
  walkGeom(g.coordinates, b);
  if (b[0] === 180) return null;
  return { lon: (b[0] + b[2]) / 2, lat: (b[1] + b[3]) / 2 };
}
function walkGeom(c0, b) {
  if (typeof c0[0] === "number") {
    b[0] = Math.min(b[0], c0[0]);
    b[1] = Math.min(b[1], c0[1]);
    b[2] = Math.max(b[2], c0[0]);
    b[3] = Math.max(b[3], c0[1]);
    return;
  }
  c0.forEach((x) => { walkGeom(x, b); });
}
function osmFromPbf() {
  fs.mkdirSync(CACHE, { recursive: true });
  var seq = path.join(CACHE, "uk-historic.geojsonseq");
  var by = { Scotland: [], England: [], Wales: [], "Northern Ireland": [] };
  if (!fs.existsSync(seq)) {
    var pbf = path.join(CACHE, "united-kingdom-latest.osm.pbf");
    var small = path.join(CACHE, "uk-historic.osm.pbf");
    if (!fs.existsSync(pbf)) {
      console.error("download Geofabrik United Kingdom extract");
      sh("curl", ["-L", "--retry", "8", "--retry-all-errors", "-C", "-", "--output", pbf,
        "https://download.geofabrik.de/europe/united-kingdom/united-kingdom-latest.osm.pbf"]);
    }
    console.error("filter historic tags");
    sh("osmium", ["tags-filter", "-O", "-o", small, pbf, "nwr/historic", "nwr/fortification_type=hillfort", "nwr/historic:civilization"]);
    if (fs.existsSync(pbf)) fs.unlinkSync(pbf);
    sh("osmium", ["export", "-O", "-f", "geojsonseq", "-u", "type_id", "-o", seq, small]);
  }
  fs.readFileSync(seq, "utf8").split("\n").forEach((line) => {
    line = line.replace(/^\x1e/, "");
    if (!line.trim()) return;
    var f, t, id, el, nation;
    try { f = JSON.parse(line); } catch (e) { return; }
    t = f.properties || {};
    if (!t.name || !wantOsm(t)) return;
    id = String(f.id || "");
    el = { type: { n: "node", w: "way", r: "relation", a: "way" }[id[0]] || "node", id: +id.slice(1), tags: t };
    if (f.geometry) {
      var c = geomCentre(f.geometry);
      if (c) el.center = c;
    }
    var loc = osmCenter(el);
    if (!loc) return;
    nation = ukNation(loc.lat, loc.lon);
    by[nation].push(el);
  });
  return by;
}
function classifyOsm(t) {
  var h = t.historic || "";
  var st = t.site_type || t["fortification_type"] || "";
  var civ = t["historic:civilization"] || "";
  if (h === "castle") {
    return { code: band(parseYear(t.start_date || t["building:start_date"] || "")),
      kind: (t.castle_type ? "castle · " + t.castle_type : "castle").replace(/_/g, " ") };
  }
  if (h === "broch" || /broch/.test(st)) return { code: "broch", kind: "broch" };
  if (h === "hillfort" || /hillfort/.test(st) || t.fortification_type === "hillfort") return { code: "hillfort", kind: "hillfort" };
  if (h === "battlefield") return { code: "battle", kind: "battlefield" };
  if (/^(monastery|abbey|priory)$/.test(h)) return { code: "abbey", kind: h };
  if (/^(standing_stone|stone_circle|menhir|megalith)$/.test(h)) return { code: "stone", kind: h.replace(/_/g, " ") };
  if (h === "cairn" || /cairn/.test(st)) return { code: "cairn", kind: "cairn" };
  if (h === "roman_villa" || /^(roman|ancient_roman)$/.test(civ) || /roman/.test(st)) return { code: "roman", kind: (h === "roman_villa" ? "Roman villa" : "Roman site") };
  if (h === "tower") return { code: "tower", kind: t["tower:type"] ? "tower · " + t["tower:type"].replace(/_/g, " ") : "tower" };
  if (h === "fort") return { code: band(parseYear(t.start_date || "")), kind: "fort" };
  if (h === "manor") return { code: "site", kind: "manor" };
  if (h === "city_gate") return { code: "tower", kind: "city gate" };
  if (h === "ruins" || h === "archaeological_site") return { code: "site", kind: (st || h).replace(/_/g, " ") };
  return { code: "site", kind: (h || "historic site").replace(/_/g, " ") };
}
function osmCenter(el) {
  if (el.lat != null && el.lon != null) return { lat: +el.lat, lon: +el.lon };
  if (el.center) return { lat: +el.center.lat, lon: +el.center.lon };
  return null;
}
function wikiTag(t) {
  var w = t.wikipedia || t["wikipedia:en"] || "";
  var m = /^(?:en:)?(.+)$/.exec(w);
  return m ? m[1].replace(/ /g, "_") : "";
}
function osmId(el) {
  return (el.type === "node" ? "n" : el.type === "way" ? "w" : "r") + el.id;
}
async function main() {
  var items = loadExisting();
  var before = items.length;
  var idx = indexItems(items);
  var added = { wd: 0, osm: 0 };
  var by = {};
  function tally(code, src) {
    by[src + ":" + code] = (by[src + ":" + code] || 0) + 1;
  }
  console.error("existing", before);
  var jobs = [
    { roots: ["Q23413", "Q1785071", "Q57831"], code: band, label: "castles" },
    { roots: ["Q1477260", "Q7160230", "Q11177345", "Q13642"], code: "tower", label: "towers" },
    { roots: ["Q1644093"], code: "broch", label: "brochs" },
    { roots: ["Q744099"], code: "hillfort", label: "hillforts" },
    { roots: ["Q334383", "Q44613", "Q2755485"], code: "abbey", label: "abbeys" },
    { roots: ["Q4895508"], code: "battle", label: "battlefields" },
    { roots: ["Q838425", "Q738071", "Q164240", "Q188267"], code: "stone", label: "stones" },
    { roots: ["Q1134688", "Q1266298"], code: "cairn", label: "cairns" },
    { roots: ["Q839627", "Q170388"], code: "roman", label: "roman" }
  ];
  var j, cls, got, n, it;
  for (j = 0; j < jobs.length; j++) {
    var wdFile = path.join(CACHE, "wd-" + jobs[j].label + ".json");
    try {
      if (fs.existsSync(wdFile)) {
        got = JSON.parse(fs.readFileSync(wdFile, "utf8"));
        console.error("wikidata", jobs[j].label, "cache", got.length);
      } else {
        cls = await subs(jobs[j].roots);
        console.error("wikidata", jobs[j].label, "classes", cls.length);
        got = await wdBatched(cls, "", jobs[j].code);
        fs.mkdirSync(CACHE, { recursive: true });
        fs.writeFileSync(wdFile, JSON.stringify(got));
      }
    } catch (e) {
      console.error("wikidata", jobs[j].label, "failed", e.message);
      got = [];
    }
    n = 0;
    got.forEach((it0) => {
      if (addItem(items, idx, it0)) { n++; added.wd++; tally(it0.code, "wd"); }
    });
    console.error("wikidata", jobs[j].label, "kept", n, "of", got.length);
  }
  var osmBy = osmFromPbf();
  for (j = 0; j < AREAS.length; j++) {
    var area = AREAS[j];
    var els = osmBy[area[1]] || [];
    n = 0;
    els.forEach((el) => {
      var t = el.tags || {};
      var c = osmCenter(el);
      if (!c || !t.name) return;
      var cl = classifyOsm(t);
      it = item(c.lat, c.lon, cl.code, t.name, cl.kind, parseYear(t.start_date || t["building:start_date"] || ""), area[1], "", wikiTag(t), osmId(el));
      if (addItem(items, idx, it)) { n++; added.osm++; tally(it.code, "osm"); }
    });
    console.error("osm", area[1], "kept", n, "of", els.length);
  }
  var codes = {};
  items.forEach((s) => { codes[s.code] = (codes[s.code] || 0) + 1; });
  var man = JSON.parse(fs.readFileSync(path.join(OUT, "manifest.json"), "utf8"));
  man.files.history = split(path.join(OUT, "history"), items, COLS, 150);
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(man));
  console.log("history", before, "+", added.wd, "wikidata", "+", added.osm, "osm", "=", items.length, JSON.stringify(codes));
  console.log("added-by", JSON.stringify(by));
  console.log("manifest", JSON.stringify(man.files.history));
}
main().catch((e) => { console.error(e); process.exit(1); });
