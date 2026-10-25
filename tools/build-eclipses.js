// workspace/whereisthesun/tools/build-eclipses.js
/* SUNNY build step (opt94): upcoming central solar eclipse paths from NASA GSFC path tables
 * (Fred Espenak, eclipse.gsfc.nasa.gov, public domain). Usage:
 *   node tools/build-eclipses.js <folder of SE<date><T|A|H>.html files>  -> data/eclipses.json */
"use strict";
var fs = require("fs");
var path = require("path");
var dir = process.argv[2];
var KIND = { T: "Total", A: "Annular", H: "Hybrid" };
var RX = /(\d+) (\d+\.\d)([NS]) +(\d+) (\d+\.\d)([EW])/g;
function deg(d, m, h) {
  var v = +d + m / 60;
  return h === "S" || h === "W" ? -v : v;
}
function unwrap(pts) {
  for (var i = 1; i < pts.length; i++) {
    while (pts[i][0] - pts[i - 1][0] > 180) pts[i][0] -= 360;
    while (pts[i][0] - pts[i - 1][0] < -180) pts[i][0] += 360;
  }
  return pts;
}
function r2(p) {
  return [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
}
function parse(file) {
  var m = /SE(\d{4})(\w{3})(\d\d)([TAH])/.exec(file);
  var txt = fs.readFileSync(path.join(dir, file), "utf8");
  var north = [], south = [], centre = [], dur = "";
  txt.split("\n").forEach((line) => {
    if (!/^ \d\d:\d\d /.test(line)) return;
    var c = [], g;
    RX.lastIndex = 0;
    while ((g = RX.exec(line))) c.push([deg(g[4], g[5], g[6]), deg(g[1], g[2], g[3])]);
    if (c.length !== 3) return;
    north.push(c[0]);
    south.push(c[1]);
    centre.push(c[2]);
    var d = /(\d\dm\d\d\.\ds)\s*$/.exec(line);
    if (d && d[1] > dur) dur = d[1];
  });
  if (centre.length < 3) return null;
  var ring = unwrap(north.concat(south.slice().reverse()));
  ring.push(ring[0].slice());
  return { date: m[1] + " " + m[2] + " " + m[3], kind: KIND[m[4]], maxDuration: dur, path: ring.map(r2), centre: unwrap(centre).map(r2) };
}
var out = fs.readdirSync(dir).filter((f) => { return /^SE.*\.html$/.test(f); }).sort().map(parse).filter(Boolean);
out.sort((a, b) => { return new Date(a.date) - new Date(b.date); });
fs.writeFileSync(path.join(__dirname, "..", "data", "eclipses.json"), JSON.stringify({ source: "NASA GSFC eclipse path tables (Fred Espenak), public domain", eclipses: out }));
console.log(out.length + " eclipses");
