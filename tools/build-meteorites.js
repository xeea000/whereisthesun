// workspace/whereisthesun/tools/build-meteorites.js
/* SUNNY build step (opt94): observed meteorite falls from NASA "Meteorite Landings"
 * (The Meteoritical Society data, NASA open data, public domain; CSV mirror from
 * rfordatascience/tidytuesday 2019-06-11). Keeps only "Fell" with real coordinates.
 *   node tools/build-meteorites.js <meteorites.csv>  -> data/meteorite-falls.json
 * Rows: [name, class, mass grams, year, lat, lon] */
"use strict";
var fs = require("fs");
var path = require("path");
function cells(line) {
  var out = [], cur = "", q = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') q = !q;
    else if (ch === "," && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
var rows = fs.readFileSync(process.argv[2], "utf8").split("\n").slice(1).map(cells);
var falls = [];
rows.forEach((r) => {
  if (r[5] !== "Fell" || r[2] !== "Valid") return;
  var lat = +r[7], lon = +r[8];
  if (!r[7] || (lat === 0 && lon === 0) || isNaN(lat)) return;
  falls.push([r[0], r[3], r[4] ? Math.round(+r[4]) : null, r[6] ? +r[6] : null, Math.round(lat * 1e3) / 1e3, Math.round(lon * 1e3) / 1e3]);
});
fs.writeFileSync(path.join(__dirname, "..", "data", "meteorite-falls.json"), JSON.stringify({ source: "NASA Meteorite Landings (Meteoritical Society), public domain", falls: falls }));
console.log(falls.length + " falls");
