// workspace/whereisthesun/tools/osm-extract.js
/* SUNNY build step (opt95): fills the raw cache that tools/build-packs.js reads, from Geofabrik
 * extracts instead of Overpass (the public Overpass servers ask automated jobs to go elsewhere).
 * Needs curl and osmium-tool. Keys are Geofabrik names for each province and state, coast and inland alike. Downloads one province or state at a time, filters, deletes the pbf.
 *   node tools/osm-extract.js <cache dir> [only these ISO 3166-2 codes, e.g. CA-PE]
 * Several can run at once on different code lists; a job whose pbf is already downloading is skipped.
 * Writes <cache>/<ISO>-camps.json and <cache>/<ISO>-plaques.json shaped like an Overpass answer. */
"use strict";
var fs = require("fs");
var path = require("path");
var cp = require("child_process");
var CACHE = process.argv[2];
var ONLY = process.argv[3];
var CA = { AB: "alberta", BC: "british-columbia", MB: "manitoba", NB: "new-brunswick", NL: "newfoundland-and-labrador", NS: "nova-scotia",
  NT: "northwest-territories", NU: "nunavut", ON: "ontario", PE: "prince-edward-island", QC: "quebec", SK: "saskatchewan", YT: "yukon" };
var US = { AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california", CO: "colorado", CT: "connecticut", DE: "delaware",
  DC: "district-of-columbia", FL: "florida", GA: "georgia", HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa", KS: "kansas",
  KY: "kentucky", LA: "louisiana", ME: "maine", MD: "maryland", MA: "massachusetts", MI: "michigan", MN: "minnesota", MS: "mississippi",
  MO: "missouri", MT: "montana", NE: "nebraska", NV: "nevada", NH: "new-hampshire", NJ: "new-jersey", NM: "new-mexico", NY: "new-york",
  NC: "north-carolina", ND: "north-dakota", OH: "ohio", OK: "oklahoma", OR: "oregon", PA: "pennsylvania", RI: "rhode-island",
  SC: "south-carolina", SD: "south-dakota", TN: "tennessee", TX: "texas", UT: "utah", VT: "vermont", VA: "virginia", WA: "washington",
  WV: "west-virginia", WI: "wisconsin", WY: "wyoming" };
var jobs = [];
Object.keys(CA).forEach(caJob);
Object.keys(US).forEach(usJob);
function caJob(k) {
  jobs.push(["CA-" + k, "north-america/canada/" + CA[k]]);
}
function usJob(k) {
  jobs.push(["US-" + k, "north-america/us/" + US[k]]);
}
var PLQ = /^(plaque|blue_plaque|monument|memorial|fort|battlefield|castle|ruins|archaeological_site)$/;
function isCamp(t) {
  return t.tourism === "camp_site" || (t.man_made === "tower" && /fire_lookout|observation/.test(t["tower:type"] || ""));
}
function isPlaque(t) {
  return (PLQ.test(t.historic || "") && t.name) || t.memorial === "plaque" || (t.tourism === "information" && t.board_type === "history");
}
function centre(g) {
  var b = [180, 90, -180, -90];
  walk(g.coordinates);
  function walk(c) {
    if (typeof c[0] === "number") {
      b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])];
      return;
    }
    c.forEach(walk);
  }
  return { lon: (b[0] + b[2]) / 2, lat: (b[1] + b[3]) / 2 };
}
function sh(cmd, args) {
  cp.execFileSync(cmd, args, { stdio: ["ignore", "ignore", "inherit"] });
}
jobs.forEach(runJob);
function runJob(j) {
  var iso = j[0];
  if (ONLY && ONLY.indexOf(iso) < 0) return;
  var outC = path.join(CACHE, iso + "-camps.json");
  var pbf = path.join(CACHE, iso + ".osm.pbf");
  if (fs.existsSync(outC) || fs.existsSync(pbf)) return;
  var small = path.join(CACHE, iso + "-f.osm.pbf");
  var seq = path.join(CACHE, iso + ".geojsonseq");
  sh("curl", ["-sSfL", "--retry", "5", "-o", pbf, "https://download.geofabrik.de/" + j[1] + "-latest.osm.pbf"]);
  sh("osmium", ["tags-filter", "-O", "-o", small, pbf, "nwr/tourism=camp_site,information", "nwr/tower:type", "nwr/historic", "nwr/memorial=plaque"]);
  fs.unlinkSync(pbf);
  sh("osmium", ["export", "-O", "-f", "geojsonseq", "-u", "type_id", "-o", seq, small]);
  var camps = [];
  var plaques = [];
  fs.readFileSync(seq, "utf8").split("\n").forEach(take);
  function take(line) {
    line = line.replace(/^\x1e/, "");
    if (!line.trim()) return;
    var f = JSON.parse(line);
    var t = f.properties || {};
    var id = String(f.id || "");
    var el = { type: { n: "node", w: "way", r: "relation", a: "way" }[id[0]] || "node", id: +id.slice(1), tags: t, center: centre(f.geometry) };
    if (id[0] === "a") el = areaId(el, id);
    if (isCamp(t)) camps.push(el);
    if (isPlaque(t)) plaques.push(el);
  }
  fs.writeFileSync(path.join(CACHE, iso + "-plaques.json"), JSON.stringify({ elements: plaques }));
  fs.writeFileSync(outC, JSON.stringify({ elements: camps }));
  fs.unlinkSync(small);
  fs.unlinkSync(seq);
  console.log(iso, camps.length, plaques.length);
}
/* osmium area ids: even = way id * 2, odd = relation id * 2 + 1 */
function areaId(el, id) {
  var n = +id.slice(1);
  el.type = n % 2 ? "relation" : "way";
  el.id = Math.floor(n / 2);
  return el;
}
