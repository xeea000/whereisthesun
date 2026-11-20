// workspace/whereisthesun/tools/refile-history-sites.js
/* SUNNY Heritage tidy: move "site" points into existing History types where the tags or
 * kind fit, add a few new groups only when nothing existing applies, drop junk and
 * duplicates of Wars, Ghost towns, Shipwrecks and Ancient cities, and keep a proper
 * name (including a tagged Gaelic name). Usage:
 *   node tools/refile-history-sites.js [osm geojsonseq]
 * Rewrites data/world/history.* and data/world/manifest.json. */
"use strict";
var fs = require("fs");
var path = require("path");
var { split } = require("./split-points.js");
var ROOT = path.join(__dirname, "..");
var OUT = path.join(ROOT, "data", "world");
var SEQ = process.argv[2] || path.join("/tmp", "uk-hist-cache", "uk-historic.geojsonseq");
var COLS = "name,kind,year,country,qid,wiki,osm";
var NOW = new Date().getFullYear();
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
function loadPack(file, qidKey) {
  var p = JSON.parse(fs.readFileSync(path.join(OUT, file + ".p.json"), "utf8"));
  var cols = typeof p.cols === "string" ? p.cols.split(",") : p.cols;
  var qids = Object.create(null);
  var a = 0, o = 0, i, shard, row, rec, key = qidKey || "qid";
  for (i = 0; i < p.n; i++) {
    a += p.lat[i]; o += p.lon[i];
    if (i % p.S === 0) shard = JSON.parse(fs.readFileSync(path.join(OUT, file + ".d" + (i / p.S) + ".json"), "utf8"));
    row = shard[i % p.S] || [];
    rec = {};
    cols.forEach((c, n) => { rec[c] = row[n]; });
    if (rec[key]) qids[rec[key]] = 1;
  }
  return qids;
}
function loadHistory() {
  var p = JSON.parse(fs.readFileSync(path.join(OUT, "history.p.json"), "utf8"));
  var cols = typeof p.cols === "string" ? p.cols.split(",") : p.cols;
  var items = [];
  var a = 0, o = 0, i, shard, row, rec, outRow;
  for (i = 0; i < p.n; i++) {
    a += p.lat[i]; o += p.lon[i];
    if (i % p.S === 0) shard = JSON.parse(fs.readFileSync(path.join(OUT, "history.d" + (i / p.S) + ".json"), "utf8"));
    row = shard[i % p.S] || [];
    rec = {};
    cols.forEach((c, n) => { rec[c] = row[n]; });
    outRow = COLS.split(",").map((c) => { return rec[c] == null ? "" : rec[c]; });
    items.push({ lat: a / 1e5, lon: o / 1e5, code: p.codes[p.c[i]], row: outRow, qid: rec.qid || "",
      name: rec.name || "", kind: rec.kind || "", osm: rec.osm || "", wiki: rec.wiki || "",
      year: rec.year == null ? "" : rec.year, country: rec.country || "" });
  }
  return items;
}
function displayName(name, tags) {
  var en = cut(name || (tags && (tags["name:en"] || tags.name)) || "", 90);
  var gd = tags && tags["name:gd"] ? cut(tags["name:gd"], 90) : "";
  if (gd && en && gd.toLowerCase() !== en.toLowerCase()) return cut(en + " (" + gd + ")", 90);
  return en || gd;
}
function isJunk(name) {
  var n = String(name || "").replace(/\s+/g, " ").trim();
  if (!n || /^Q\d+$/.test(n)) return true;
  if (/^(the\s+)?mill ponds?$/i.test(n)) return true;
  if (/^(unnamed|ruin|ruins|site)$/i.test(n)) return true;
  if (/\banti[-\s]?aircraft\b/i.test(n)) return true;
  if (/\bnursery\b/i.test(n) && !/\b(castle|fort|kirk|church|cairn|abbey)\b/i.test(n)) return true;
  if (/\brotor\b/i.test(n) && /\b(raf|radar|transmit)\b/i.test(n)) return true;
  if (/^(redbraes weir|.+\sweir)$/i.test(n) && !/\b(castle|mill|kirk|church|fort)\b/i.test(n)) return true;
  return false;
}
function blob(tags, kind, name) {
  return ((name || "") + " " + (kind || "") + " " + (tags ? Object.keys(tags).map((k) => {
    return k + " " + tags[k];
  }).join(" ") : "")).toLowerCase();
}
function classify(code, kind, name, tags) {
  var t = tags || {};
  var h = t.historic || "";
  var st = t.site_type || t.fortification_type || "";
  var civ = t["historic:civilization"] || "";
  var meg = t.megalith_type || "";
  var tomb = t.tomb || "";
  var mem = t.memorial || "";
  var b = blob(t, kind, name);
  if (/wreck|shipwreck|sunken/.test(h + " " + (kind || "") + " " + b) && /wreck/.test(b)) return { drop: "wreck" };
  if (mem === "war_memorial" || tomb === "war_grave" || /war memorial|war grave/.test(b)) return { drop: "wars" };
  if (h === "memorial" && /bench|community_centre/.test(mem)) return { drop: "junk" };
  if (/broch/.test(h + " " + st + " " + b)) return { code: "broch", kind: "broch" };
  if (/hillfort|hill_fort|hill fort|promontory_fort|promontory fort|oppidum|ringfort|ring_fort|fortlet/.test(h + " " + st + " " + b) ||
      /\bduns?\b/.test(st) || (/\bdun\b/.test(h + " " + st) || /,\s*dun\b|^dun\b|\bdun site\b/.test((name || "").toLowerCase()))) {
    return { code: "hillfort", kind: /dun/.test(st + " " + (name || "").toLowerCase()) ? "dun" : "hillfort" };
  }
  if (h === "cairn" || /cairn/.test(meg + " " + st) || /\b(chambered cairn|ring cairn|long cairn|chambered_cairn)\b/.test(b)) {
    return { code: "cairn", kind: "cairn" };
  }
  if (/^(standing_stone|stone_circle|menhir|megalith)$/.test(h) ||
      /menhir|stone_circle|standing_stone|dolmen|alignment/.test(meg) ||
      /\b(stone circle|standing stone|menhir|dolmen|megalith|cup and ring|rock art|petroglyph|pictish stone)\b/.test(b)) {
    return { code: "stone", kind: (h || meg || "standing stone").replace(/_/g, " ") };
  }
  if (h === "roman_villa" || /^(roman|ancient_roman)$/.test(civ) || /\broman\b/.test(st) ||
      /\b(roman|ancient roman)\b/.test((kind || "") + " " + (name || ""))) {
    return { code: "roman", kind: /villa/.test(b) ? "Roman villa" : "Roman site" };
  }
  if (h === "battlefield" || /battlefield/.test((kind || ""))) return { code: "battle", kind: "battlefield" };
  if (/^(monastery|abbey|priory)$/.test(h) || /\b(monastery|abbey|priory)\b/.test((kind || "") + " " + (name || ""))) {
    return { code: "abbey", kind: h === "abbey" || h === "priory" || h === "monastery" ? h : "abbey" };
  }
  if (h === "city_gate" || (h === "tower" && !/tower house/.test(b)) || /watchtower|city gate/.test(b)) {
    return { code: "tower", kind: h === "city_gate" ? "city gate" : "tower" };
  }
  if (h === "castle" || /^(motte|bastle)$/.test(st) || /tower house|motte|bastle|peel tower|gatehouse fort/.test(b) ||
      /\bcastles?\b/.test((kind || "")) || /^castle\b|\bcastle$/.test((name || "").toLowerCase())) {
    return { code: band(parseYear(t.start_date || t["building:start_date"] || "")),
      kind: (t.castle_type ? "castle · " + t.castle_type : (st === "motte" ? "motte" : "castle")).replace(/_/g, " ") };
  }
  if (h === "church" || (t.amenity === "place_of_worship" && /church|kirk/.test(b) && !/chapel|abbey|priory/.test(b)) ||
      /\b(parish church|\bkirk\b|old kirk|church of)\b/.test(b)) {
    return { code: "kirk", kind: "parish church or kirk" };
  }
  if (h === "wayside_cross" || /wayside_cross|celtic_cross|standing cross/.test(b) ||
      (/\bchapel\b/.test(b) && !/abbey|priory/.test(b))) {
    return { code: "religious", kind: h === "wayside_cross" ? "wayside cross" : (/chapel/.test(b) ? "chapel" : "religious site") };
  }
  if (h === "tomb" || /tumulus|barrow|cist|mausoleum|necropolis|burial mound|graveyard|kirkyard|churchyard|cemetery|burial ground|\bcladh\b/.test(b) ||
      /^(tumulus|mausoleum|vault|chest_tomb|cist)$/.test(tomb) || t.amenity === "grave_yard" || t.landuse === "cemetery") {
    return { code: "burial", kind: (tomb || h || "burial site").replace(/_/g, " ") };
  }
  if (h === "manor" || /^(manor|country house|estate)$/.test((kind || "").toLowerCase()) ||
      (/\b(manor|country house|stately home)\b/.test(b))) {
    return { code: "manor", kind: "manor" };
  }
  if (/lime_kiln|mine_shaft|mine_adit/.test(h) || h === "industrial" || h === "mine" || h === "quarry" ||
      /\b(colliery|lime kiln|saw ?mill|flint mill|mine shaft|coal pit|coal mine|industrial)\b/.test(b) ||
      (/\b(mill|mines?|kiln|quarry|works)\b/.test(b) && !/\b(castle|kirk|church|cairn|fort|hillfort)\b/.test((name || "").toLowerCase()))) {
    return { code: "industrial", kind: (h === "mine" || /mine/.test(b) ? "mine" : /kiln/.test(b) ? "kiln" : "mill or industrial site") };
  }
  if (h === "ruins" || /^(ruins)$/.test((kind || "").toLowerCase())) return { code: "ruins", kind: "ruins" };
  if (h === "archaeological_site" || /archaeolog|settlement site|tell|crop.?mark|earthworks|ancient city|polis/.test((kind || "") + " " + h)) {
    return { code: "digs", kind: (st || kind || "archaeological site").replace(/_/g, " ") };
  }
  if (code && code !== "site") return { code: code, kind: kind || code };
  return { code: "site", kind: (kind || h || "historic site").replace(/_/g, " ") };
}
function loadSeq(file) {
  var by = Object.create(null);
  if (!fs.existsSync(file)) return by;
  fs.readFileSync(file, "utf8").split("\n").forEach((line) => {
    line = line.replace(/^\x1e/, "");
    if (!line.trim()) return;
    var f, t, id;
    try { f = JSON.parse(line); } catch (e) { return; }
    t = f.properties || {};
    id = String(f.id || "");
    if (!id) return;
    var c = null, g = f.geometry;
    if (g && g.type === "Point" && g.coordinates) c = { lon: g.coordinates[0], lat: g.coordinates[1] };
    else if (g && g.coordinates) {
      var b = [180, 90, -180, -90];
      (function walk(c0) {
        if (typeof c0[0] === "number") {
          b[0] = Math.min(b[0], c0[0]); b[1] = Math.min(b[1], c0[1]);
          b[2] = Math.max(b[2], c0[0]); b[3] = Math.max(b[3], c0[1]);
          return;
        }
        c0.forEach(walk);
      })(g.coordinates);
      if (b[0] !== 180) c = { lon: (b[0] + b[2]) / 2, lat: (b[1] + b[3]) / 2 };
    }
    by[id] = { tags: t, center: c };
  });
  return by;
}
function keyDeg(lat, lon) {
  return Math.floor(lat * 200) + ":" + Math.floor(lon * 200);
}
function nearQid(grid, lat, lon) {
  var i, j, cell, k, it, dlat, dlon;
  for (i = -1; i <= 1; i++) {
    for (j = -1; j <= 1; j++) {
      cell = grid[Math.floor((lat + i * 0.005) * 200) + ":" + Math.floor((lon + j * 0.005) * 200)];
      if (!cell) continue;
      for (k = 0; k < cell.length; k++) {
        it = cell[k];
        dlat = (it.lat - lat) * 111;
        dlon = (it.lon - lon) * 111 * Math.cos(lat * Math.PI / 180);
        if (dlat * dlat + dlon * dlon < 0.15 * 0.15) return it;
      }
    }
  }
  return null;
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
function inUK(lat, lon) {
  return lat >= 49.8 && lat <= 60.9 && lon >= -8.7 && lon <= 1.8;
}
function itemFrom(lat, lon, code, name, kind, year, country, qid, wiki, osm) {
  return {
    lat: +(+lat).toFixed(5), lon: +(+lon).toFixed(5), code: code, name: name, qid: qid || "", osm: osm || "",
    kind: kind, year: year, country: country, wiki: wiki || "",
    row: [cut(name, 90), cut(kind, 80), year === "" || year == null ? "" : year, country || "", qid || "", wiki || "", osm || ""]
  };
}
function main() {
  var items = loadHistory();
  var before = items.length;
  var exclude = Object.create(null);
  ["ancient", "ghost", "wrecks", "wars-civil", "wars-colonial", "wars-early", "wars-indep",
    "wars-korea", "wars-modern", "wars-vietnam", "wars-ww1", "wars-ww2"].forEach((f) => {
    try {
      var q = loadPack(f, "qid");
      Object.keys(q).forEach((id) => { exclude[id] = f; });
    } catch (e) { console.error("skip pack", f, e.message); }
  });
  var osmBy = loadSeq(SEQ);
  console.error("osm cache", Object.keys(osmBy).length);
  var tallies = { dropJunk: 0, dropDupeLayer: 0, dropDedupe: 0, refile: 0, keep: 0, added: 0 };
  var byFrom = {};
  var kept = [];
  items.forEach((it) => {
    var tags = (it.osm && osmBy[it.osm]) ? osmBy[it.osm].tags : null;
    if (tags && tags.wikidata && !it.qid) it.qid = String(tags.wikidata).split("/").pop();
    var name = displayName(it.name, tags || {});
    /* only the "site" drawer is re-filed; other Heritage types keep their code */
    if (it.code !== "site") {
      if (!name) name = it.name;
      kept.push(itemFrom(it.lat, it.lon, it.code, name, it.kind, it.year, it.country, it.qid, it.wiki, it.osm));
      tallies.keep++;
      return;
    }
    if (isJunk(name)) { tallies.dropJunk++; return; }
    if (it.qid && exclude[it.qid]) { tallies.dropDupeLayer++; return; }
    var cl = classify(it.code, it.kind, name, tags);
    if (cl.drop) { tallies.dropDupeLayer++; byFrom["drop:" + cl.drop] = (byFrom["drop:" + cl.drop] || 0) + 1; return; }
    if (cl.code !== it.code) {
      tallies.refile++;
      byFrom[(it.code || "site") + "→" + cl.code] = (byFrom[(it.code || "site") + "→" + cl.code] || 0) + 1;
    } else tallies.keep++;
    var year = it.year;
    if (tags && (year === "" || year == null)) year = parseYear(tags.start_date || tags["building:start_date"] || "");
    kept.push(itemFrom(it.lat, it.lon, cl.code, name, cl.kind, year, it.country, it.qid, it.wiki, it.osm));
  });
  var qids = Object.create(null);
  var grid = Object.create(null);
  kept.forEach((it) => {
    if (it.qid) qids[it.qid] = it;
    var k = keyDeg(it.lat, it.lon);
    if (!grid[k]) grid[k] = [];
    grid[k].push(it);
  });
  var afterQ = [];
  var seenQ = Object.create(null);
  kept.forEach((it) => {
    if (it.qid) {
      if (seenQ[it.qid]) { tallies.dropDedupe++; return; }
      seenQ[it.qid] = 1;
    }
    if (it.osm) {
      var tags = osmBy[it.osm] ? osmBy[it.osm].tags : null;
      var wd = it.qid || (tags && tags.wikidata ? String(tags.wikidata).split("/").pop() : "");
      if (wd && seenQ[wd] && !it.qid) { tallies.dropDedupe++; return; }
      var near = nearQid(grid, it.lat, it.lon);
      if (near && near.qid && near !== it && !it.qid) { tallies.dropDedupe++; return; }
    }
    afterQ.push(it);
  });
  kept = afterQ;
  /* named churches, tombs and wayside crosses in the UK extract that are not already kept */
  var haveOsm = Object.create(null);
  kept.forEach((it) => { if (it.osm) haveOsm[it.osm] = 1; });
  Object.keys(osmBy).forEach((id) => {
    var rec = osmBy[id], t = rec.tags || {}, c = rec.center;
    if (!c || haveOsm[id] || !t.name) return;
    if (!inUK(c.lat, c.lon)) return;
    var h = t.historic || "";
    if (!(h === "church" || h === "tomb" || h === "wayside_cross" || t.amenity === "grave_yard" || t.landuse === "cemetery")) return;
    var name = displayName(t.name, t);
    if (isJunk(name)) return;
    var wd = t.wikidata ? String(t.wikidata).split("/").pop() : "";
    if (wd && (qids[wd] || exclude[wd])) return;
    if (nearQid(grid, c.lat, c.lon)) return;
    var cl = classify("site", "", name, t);
    if (cl.drop || cl.code === "site") return;
    var it = itemFrom(c.lat, c.lon, cl.code, name, cl.kind, parseYear(t.start_date || ""),
      ukNation(c.lat, c.lon), wd, (t.wikipedia || "").replace(/^en:/, "").replace(/ /g, "_"), id);
    kept.push(it);
    haveOsm[id] = 1;
    if (wd) qids[wd] = it;
    var k = keyDeg(it.lat, it.lon);
    if (!grid[k]) grid[k] = [];
    grid[k].push(it);
    tallies.added++;
  });
  var codes = {};
  kept.forEach((s) => { codes[s.code] = (codes[s.code] || 0) + 1; });
  var scot = {};
  kept.forEach((s) => {
    if (inUK(s.lat, s.lon) && ukNation(s.lat, s.lon) === "Scotland") scot[s.code] = (scot[s.code] || 0) + 1;
  });
  var man = JSON.parse(fs.readFileSync(path.join(OUT, "manifest.json"), "utf8"));
  man.files.history = split(path.join(OUT, "history"), kept, COLS, 150);
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(man));
  console.log("history", before, "->", kept.length, JSON.stringify(tallies));
  console.log("refile", JSON.stringify(byFrom));
  console.log("codes", JSON.stringify(codes));
  console.log("scotland", JSON.stringify(scot));
  console.log("manifest", JSON.stringify(man.files.history));
  var sample = kept.filter((s) => { return inUK(s.lat, s.lon) && ukNation(s.lat, s.lon) === "Scotland"; });
  var picks = [];
  var seen = {}, n = 0, guard = 0;
  while (picks.length < 30 && guard < 4000 && sample.length) {
    guard++;
    var ix = Math.floor(Math.random() * sample.length);
    var s = sample[ix];
    var key = s.code + ":" + s.name;
    if (seen[key]) continue;
    seen[key] = 1;
    var tags = s.osm && osmBy[s.osm] ? osmBy[s.osm].tags : {};
    picks.push({
      name: s.name, code: s.code, kind: s.kind, qid: s.qid, osm: s.osm, lat: s.lat, lon: s.lon,
      historic: tags.historic || "", site_type: tags.site_type || "",
      fortification_type: tags.fortification_type || "", megalith_type: tags.megalith_type || "",
      civ: tags["historic:civilization"] || "", wikidata: tags.wikidata || s.qid || "",
      "name:gd": tags["name:gd"] || ""
    });
    n++;
  }
  var shotDir = "/workspace/t423";
  try { fs.mkdirSync(shotDir, { recursive: true }); } catch (e) {}
  fs.writeFileSync(path.join(shotDir, "scotland-spotcheck-298.json"), JSON.stringify(picks, null, 2));
  console.log("spotcheck", picks.length, path.join(shotDir, "scotland-spotcheck-298.json"));
}
main();
