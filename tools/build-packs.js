// workspace/whereisthesun/tools/build-packs.js
/* SUNNY build step (opt95): offline data packs for Campsites & lookouts and Historic plaques.
 * Source: OpenStreetMap via Overpass (ODbL), one query per province or state, retried patiently
 * when the servers are busy; raw answers are kept in a cache folder so a rerun resumes.
 * Plaques also merge the Ontario Heritage Trust plaque inventory (pdftotext -layout of the 2021
 * open-data PDF) and Parks Canada national historic sites (parks.canada.ca/lhn-nhs/recherche-search
 * saved as HTML), skipping any within 150 m of an OSM plaque with a similar name.
 *   node tools/build-packs.js <cache dir> [oht.txt] [parks-canada.html]
 * Writes data/packs/<region>/camps.json, data/packs/<region>/plaques.json, data/packs/index.json.
 * Regions: one per Canadian province or territory, and USA groups of states (the ids and state
 * lists are in the table below): Northeast ME NH VT MA RI CT NY NJ PA, Mid-Atlantic DE MD DC VA WV,
 * Southeast NC SC GA FL AL MS TN KY, North Central OH MI IN IL WI MN IA MO ND SD NE KS,
 * South Central TX OK AR LA, Mountain & Southwest MT ID WY CO UT NV AZ NM, Pacific Northwest WA OR,
 * California, Alaska, Hawaii. */
"use strict";
var fs = require("fs");
var path = require("path");
var SP = require("./split-points.js");
var CACHE = process.argv[2];
var OHT = process.argv[3];
var PCA = process.argv[4];
var OUT = path.join(__dirname, "..", "data", "packs");
var SERVERS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
var CA = { ab: "Alberta", bc: "British Columbia", mb: "Manitoba", nb: "New Brunswick", nl: "Newfoundland and Labrador", ns: "Nova Scotia",
  nt: "Northwest Territories", nu: "Nunavut", on: "Ontario", pe: "Prince Edward Island", qc: "Quebec", sk: "Saskatchewan", yt: "Yukon" };
var US = [["us-northeast", "US Northeast", "ME NH VT MA RI CT NY NJ PA"], ["us-midatlantic", "US Mid-Atlantic", "DE MD DC VA WV"],
  ["us-southeast", "US Southeast", "NC SC GA FL AL MS TN KY"], ["us-northcentral", "US North Central", "OH MI IN IL WI MN IA MO ND SD NE KS"],
  ["us-southcentral", "US South Central", "TX OK AR LA"], ["us-mountain", "US Mountain & Southwest", "MT ID WY CO UT NV AZ NM"],
  ["us-northwest", "US Pacific Northwest", "WA OR"], ["us-california", "California", "CA"], ["us-alaska", "Alaska", "AK"], ["us-hawaii", "Hawaii", "HI"]];
var REGIONS = [];
Object.keys(CA).forEach(addCa);
US.forEach(addUs);
function addCa(k) {
  REGIONS.push({ id: "ca-" + k, name: CA[k], areas: ["CA-" + k.toUpperCase()] });
}
function addUs(r) {
  REGIONS.push({ id: r[0], name: r[1], areas: r[2].split(" ").map(usCode) });
}
function usCode(s) {
  return "US-" + s;
}
var Q = {
  camps: '(nwr["tourism"="camp_site"](area.a);nwr["man_made"="tower"]["tower:type"~"fire_lookout|observation"](area.a););',
  plaques: '(nwr["historic"~"^(plaque|blue_plaque|monument|memorial|fort|battlefield|castle|ruins|archaeological_site)$"]["name"](area.a);' +
    'nwr["memorial"="plaque"](area.a);nwr["tourism"="information"]["board_type"="history"](area.a););'
};
function sleep(ms) {
  return new Promise(wake.bind(null, ms));
}
function wake(ms, res) {
  setTimeout(res, ms);
}
/* Node's fetch gets TLS resets from Overpass on some hosts, so curl does the request. */
function curl(url, ql) {
  return new Promise(run);
  function run(res) {
    var args = ["-s", "-m", "1000", "-A", "SUNNY-build/1.0 (github.com/xeea000/whereisthesun)", "--data-urlencode", "data@-", "-w", "\n%{http_code}", url];
    var p = require("child_process").execFile("curl", args, { maxBuffer: 1 << 30 }, done);
    p.stdin.end(ql);
    function done(err, out) {
      var k = String(out || "").lastIndexOf("\n");
      res({ code: err ? "ERR" : out.slice(k + 1), body: out.slice(0, k) });
    }
  }
}
async function overpass(area, layer) {
  var file = path.join(CACHE, area + "-" + layer + ".json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  var ql = '[out:json][timeout:900];area["ISO3166-2"="' + area + '"]->.a;' + Q[layer] + "out center tags;";
  for (var i = 0; i < 40; i++) {
    var url = SERVERS[i % SERVERS.length];
    try {
      var r = await curl(url, ql);
      if (r.code === "200") {
        var j = JSON.parse(r.body);
        if (j.remark && /runtime error|timed out/i.test(j.remark)) throw new Error(j.remark);
        fs.writeFileSync(file, JSON.stringify(j));
        return j;
      }
      console.log(area, layer, "HTTP", r.code, "retry", i);
    } catch (e) {
      console.log(area, layer, String(e).slice(0, 80), "retry", i);
    }
    await sleep(Math.min(300000, 15000 * (i + 1)));
  }
  throw new Error("gave up " + area + " " + layer);
}
function cut(s, n) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function r5(v) {
  return Math.round(v * 1e5) / 1e5;
}
/* rows: camps [lon, lat, name, kind c|l, backcountry 0|1, fee, website, operator, osm id like n123] */
function campRow(el) {
  var t = el.tags || {};
  var c = el.center || el;
  var look = t.man_made === "tower";
  var nm = t.name || (look ? (t["tower:type"] === "fire_lookout" ? "Fire lookout tower" : "Lookout tower") : "Campsite");
  return [r5(c.lon), r5(c.lat), cut(nm, 80), look ? "l" : "c", t.backcountry === "yes" ? 1 : 0, cut(t.fee, 20), cut(t.website, 120), cut(t.operator, 60), el.type[0] + el.id];
}
/* rows: plaques [lon, lat, name, kind, inscription, date, website, source o|h|p] */
function plaqueRow(el) {
  var t = el.tags || {};
  var c = el.center || el;
  var kind = t.memorial === "plaque" ? "plaque" : t.historic || (t.board_type ? "history board" : "");
  var nm = t.name || t["memorial:name"] || (kind === "plaque" ? "Historical plaque" : "");
  if (!nm && !t.inscription) return null;
  return [r5(c.lon), r5(c.lat), cut(nm || "Historical plaque", 90), kind, cut(t.inscription || t.description, 300), cut(t.start_date, 20), cut(t.website, 120), "o", el.type[0] + el.id];
}
function readOht() {
  if (!OHT) return [];
  var lines = fs.readFileSync(OHT, "utf8").split("\n");
  var out = [];
  var cols = null;
  var cur = null;
  lines.forEach(ohtLine);
  function ohtLine(line) {
    if (/^\s*Title\s+Plaque text/.test(line)) {
      cols = [line.indexOf("Plaque text"), line.indexOf("Location")];
      return;
    }
    if (!cols || /Page \d+ of/.test(line)) return;
    var m = /(\d{2}\.\d+)\s+(-\d{2,3}\.\d+)\s*$/.exec(line);
    if (m) {
      cur = { title: "", text: "", lat: +m[1], lon: +m[2] };
      out.push(cur);
    }
    if (!cur) return;
    cur.title += " " + line.slice(0, cols[0]).trim();
    cur.text += " " + line.slice(cols[0], cols[1]).trim();
  }
  return out.map(ohtRow);
}
function ohtRow(p) {
  var t = cut(p.title, 90).replace(/^"?(.*?), The$/, "The $1");
  return [r5(p.lon), r5(p.lat), t, "Ontario Heritage Trust plaque", cut(p.text, 300), "", "https://heritagetrust.on.ca/user_assets/documents/2021-Provincial-plaques-Open-data-v02-FINAL-ENG.pdf", "h", ""];
}
function readPca() {
  if (!PCA) return [];
  var s = fs.readFileSync(PCA, "utf8");
  var re = /<td[^>]*>2<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*><a href="([^"]+)">[^<]*<\/a><\/td>\s*<td[^>]*>\s*(-?[\d.]+) (-?[\d.]+)\s*<\/td>/g;
  var out = [];
  var m;
  while ((m = re.exec(s))) out.push([r5(+m[3]), r5(+m[4]), cut(m[1], 90), "National Historic Site (Parks Canada)", "", "", m[2], "p", ""]);
  return out;
}
function norm(s) {
  return String(s).toLowerCase().replace(/national historic sites?|the|plaque|[^a-z0-9]/g, "");
}
function near(a, b) {
  var dy = (a[1] - b[1]) * 111000;
  var dx = (a[0] - b[0]) * 111000 * Math.cos(a[1] * Math.PI / 180);
  return dx * dx + dy * dy < 150 * 150;
}
function dupe(row, list) {
  var n = norm(row[2]);
  return list.some(similar);
  function similar(o) {
    if (!near(row, o)) return false;
    var m = norm(o[2]);
    return !n || !m || m.indexOf(n.slice(0, 8)) >= 0 || n.indexOf(m.slice(0, 8)) >= 0;
  }
}
function inBox(row, box) {
  return row[0] >= box[0] && row[0] <= box[2] && row[1] >= box[1] && row[1] <= box[3];
}
function boxOf(rows) {
  var b = [180, 90, -180, -90];
  rows.forEach(grow);
  function grow(r) {
    b = [Math.min(b[0], r[0]), Math.min(b[1], r[1]), Math.max(b[2], r[0]), Math.max(b[3], r[1])];
  }
  return b.map(r2);
}
function r2(v) {
  return Math.round(v * 100) / 100;
}
function uniq(rows) {
  var seen = {};
  return rows.filter(keepOne);
  function keepOne(r) {
    var k = r[0] + "," + r[1] + "," + r[2];
    if (seen[k]) return false;
    seen[k] = 1;
    return true;
  }
}
function listDir(d) {
  return fs.readdirSync(path.join(__dirname, "..", d)).sort().map((f) => { return d + "/" + f; });
}
function sharedSize(f) {
  var body = fs.readFileSync(path.join(__dirname, "..", f));
  return { url: f, gz: require("zlib").gzipSync(body).length };
}
async function main() {
  var extra = readOht().concat(readPca());
  console.log("extra plaques", extra.length);
  var index = { built: new Date().toISOString().slice(0, 10), source: "OpenStreetMap (ODbL), Ontario Heritage Trust, Parks Canada", regions: [] };
  for (var i = 0; i < REGIONS.length; i++) {
    var R = REGIONS[i];
    var camps = [];
    var plaques = [];
    for (var a = 0; a < R.areas.length; a++) {
      var cj = await overpass(R.areas[a], "camps");
      camps = camps.concat(cj.elements.map(campRow));
      var pj = await overpass(R.areas[a], "plaques");
      plaques = plaques.concat(pj.elements.map(plaqueRow).filter(Boolean));
    }
    camps = uniq(camps);
    plaques = uniq(plaques);
    var box = boxOf(camps.concat(plaques));
    if (R.id.indexOf("ca-") === 0) {
      var add = extra.filter((r) => { return inBox(r, box) && !dupe(r, plaques); });
      plaques = plaques.concat(add);
    }
    fs.mkdirSync(path.join(OUT, R.id), { recursive: true });
    var files = {};
    files.camps = SP.split(path.join(OUT, R.id, "camps"), camps.map((r) => {
      return { lon: r[0], lat: r[1], code: r[3], row: [r[2], r[4], r[5], r[6], r[7], r[8]] };
    }), "name,backcountry,fee,website,operator,osm");
    files.plaques = SP.split(path.join(OUT, R.id, "plaques"), plaques.map((r) => {
      return { lon: r[0], lat: r[1], code: r[7], row: [r[2], r[3], r[4], r[5], r[6], r[8]] };
    }), "name,kind,inscription,date,website,osm");
    index.regions.push({ id: R.id, name: R.name, bbox: box, files: files });
    console.log(R.id, JSON.stringify(files));
  }
  /* shared data the offline download also saves, with sizes so the phone can show MB first */
  index.shared = ["data/impact-craters.json", "data/eclipses.json"].concat(listDir("data/obs"), listDir("data/met")).map(sharedSize);
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index));
}
main();
