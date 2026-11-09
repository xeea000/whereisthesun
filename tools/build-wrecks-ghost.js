// workspace/whereisthesun/tools/build-wrecks-ghost.js
/* SUNNY build step (t388u): data/world/wrecks.* and data/world/ghost.* (points file + detail shards, tools/split-points.js).
 *   node tools/build-wrecks-ghost.js <osm places.json> <cache dir>
 * World: Wikidata (CC0), every shipwreck (Q852190 and its subclasses) and every ghost town (Q74047) or abandoned village
 * (Q350895) with a coordinate; the queries are below and the answers are kept in the cache dir (wd-wrecks.json, wd-ghost.json).
 * Canada detail: OpenStreetMap (ODbL) from tools/osm-places.py; an OSM point within 500 m of a Wikidata one is left out.
 * Codes: wrecks h = shipwreck, s = wreck marked on sea charts only (OSM seamark); ghost t = ghost town or village, a = other abandoned place. */
"use strict";
var fs = require("fs");
var path = require("path");
var cp = require("child_process");
var SP = require("./split-points.js");
var OUT = path.join(__dirname, "..", "data", "world");
var OSM = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
var CACHE = process.argv[3];
var LANG = "en,fr,de,nl,nb,sv,es,it,pt,da,fi,pl,ru";
var Q = {
  wrecks: "SELECT ?i ?iLabel ?c ?t ?e ?dep ?w WHERE { ?i wdt:P31/wdt:P279* wd:Q852190; wdt:P625 ?c. OPTIONAL{?i wdt:P585 ?t} OPTIONAL{?i wdt:P576 ?e} " +
    "OPTIONAL{?i wdt:P4511 ?dep} OPTIONAL{?w schema:about ?i; schema:isPartOf <https://en.wikipedia.org/>} " +
    'SERVICE wikibase:label { bd:serviceParam wikibase:language "' + LANG + '" } }',
  ghost: "SELECT ?i ?iLabel ?c ?e ?w WHERE { ?i wdt:P31 ?ty. VALUES ?ty {wd:Q74047 wd:Q350895} ?i wdt:P625 ?c. OPTIONAL{?i wdt:P576 ?e} " +
    "OPTIONAL{?w schema:about ?i; schema:isPartOf <https://en.wikipedia.org/>} " +
    'SERVICE wikibase:label { bd:serviceParam wikibase:language "' + LANG + '" } }'
};
var wd = (name) => {
  var f = path.join(CACHE, "wd-" + name + ".json");
  if (!fs.existsSync(f)) {
    cp.execFileSync("curl", ["-s", "-m", "280", "-G", "-H", "Accept: application/sparql-results+json", "-A", "SUNNY-build/1.0 (github.com/xeea000/whereisthesun)",
      "--data-urlencode", "query=" + Q[name], "https://query.wikidata.org/sparql", "-o", f]);
  }
  var seen = {};
  return JSON.parse(fs.readFileSync(f, "utf8")).results.bindings.filter((b) => {
    var q = b.i.value.split("/").pop();
    if (seen[q]) return false;
    seen[q] = 1;
    return /^Point\(/.test(b.c.value);
  });
};
var cut = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
var r5 = (v) => { return Math.round(v * 1e5) / 1e5; };
var pt = (b) => { var m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(b.c.value); return [r5(+m[1]), r5(+m[2])]; };
var year = (v) => { var m = /^(-?\d+)/.exec(v ? v.value : ""); return m ? String(+m[1]) : ""; };
var label = (b) => { var l = b.iLabel ? b.iLabel.value : ""; return /^Q\d+$/.test(l) ? "" : cut(l, 80); };
var enwiki = (b) => { return b.w ? "en:" + decodeURIComponent(b.w.value.split("/wiki/")[1]).replace(/_/g, " ") : ""; };
var qid = (b) => { return b.i.value.split("/").pop(); };
/* grid of Wikidata points in 0.01 degree cells for the 500 m check */
var near = (list) => {
  var g = {};
  list.forEach((it) => { g[Math.round(it.lat * 100) + "," + Math.round(it.lon * 100)] = (g[Math.round(it.lat * 100) + "," + Math.round(it.lon * 100)] || []).concat([it]); });
  return (lat, lon) => {
    for (var a = -1; a <= 1; a++) for (var o = -1; o <= 1; o++) {
      var c = g[(Math.round(lat * 100) + a) + "," + (Math.round(lon * 100) + o)] || [];
      for (var i = 0; i < c.length; i++) {
        var dy = (c[i].lat - lat) * 111, dx = (c[i].lon - lon) * 111 * Math.cos(lat * Math.PI / 180);
        if (dx * dx + dy * dy < 0.25) return true;
      }
    }
    return false;
  };
};
var osmWiki = (t) => { return cut(t.wikipedia || "", 120); };
var wrecks = wd("wrecks").map((b) => {
  var p = pt(b);
  return { lon: p[0], lat: p[1], code: "h", row: [label(b), "", year(b.t) || year(b.e), b.dep ? String(Math.round(+b.dep.value)) : "", "", enwiki(b), "", qid(b)] };
});
var wNear = near(wrecks);
OSM.filter((o) => { return o.k === "w" && !wNear(o.lat, o.lon); }).forEach((o) => {
  var t = o.t;
  wrecks.push({ lon: r5(o.lon), lat: r5(o.lat), code: t.historic === "wreck" ? "h" : "s",
    row: [cut(t.name, 80), cut(t["wreck:type"] || t["seamark:wreck:category"], 40), cut(t["wreck:date_sunk"] || t.end_date || t.start_date, 20),
      cut(t["wreck:depth"] || t.depth, 12), cut(t.description || t.inscription, 240), osmWiki(t), o.id, ""] });
});
var ghost = wd("ghost").map((b) => {
  var p = pt(b);
  return { lon: p[0], lat: p[1], code: "t", row: [label(b), "", year(b.e), "", enwiki(b), "", qid(b)] };
});
var gNear = near(ghost);
OSM.filter((o) => { return o.k === "g" && !gNear(o.lat, o.lon); }).forEach((o) => {
  var t = o.t, town = /^(ghost_town|abandoned_village|deserted_village)$/.test(t.historic || "");
  ghost.push({ lon: r5(o.lon), lat: r5(o.lat), code: town ? "t" : "a",
    row: [cut(t.name || t.old_name, 80), cut(t["abandoned:place"] || t["disused:place"] || t.place || t.historic, 30), cut(t.end_date, 20),
      cut(t.description, 240), osmWiki(t), o.id, ""] });
});
console.log("wrecks", JSON.stringify(SP.split(path.join(OUT, "wrecks"), wrecks, "name,type,sunk,depth,desc,wiki,osm,qid")));
console.log("ghost", JSON.stringify(SP.split(path.join(OUT, "ghost"), ghost, "name,kind,date,desc,wiki,osm,qid")));
