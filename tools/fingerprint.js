// workspace/whereisthesun/tools/fingerprint.js
/* SUNNY build step (opt77): stamps every app file in index.html with a content hash
 * (file.js?h=abc123) and writes the precache list into sw.js. Hashed files are cached
 * forever by the service worker, so a deploy downloads only files that changed.
 * Run from the app folder before tools/write-version.js:  node tools/fingerprint.js */
"use strict";
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var root = path.join(__dirname, "..");
var EXTRA = ["manifest.webmanifest", "icon-192.png", "icon-512.png"];
function hashOf(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex").slice(0, 10);
}
function stamp(file) {
  return file + "?h=" + hashOf(file);
}
/* opt78: one hash over all beach files; the app fetches them as data/<file>?h=<hash>. */
function beachDataHash() {
  var dir = path.join(root, "data");
  var h = crypto.createHash("sha256");
  function addFile(name) {
    h.update(name);
    h.update(fs.readFileSync(path.join(dir, name)));
  }
  fs.readdirSync(dir).filter(isBeachFile).sort().forEach(addFile);
  return h.digest("hex").slice(0, 10);
}
function isBeachFile(name) {
  return name === "manifest.json" || /\.gz$/.test(name);
}
var beachV = beachDataHash();
var beachVPath = path.join(root, "beach-data-v.js");
var beachVSrc = fs.readFileSync(beachVPath, "utf8").replace(/SUNNY_BEACH_V = "[^"]*"/, 'SUNNY_BEACH_V = "' + beachV + '"');
fs.writeFileSync(beachVPath, beachVSrc);
var html = fs.readFileSync(path.join(root, "index.html"), "utf8");
var assets = [];
function rewrite(all, attr, file) {
  if (/^https?:/.test(file)) return all;
  var out = stamp(file);
  assets.push(out);
  return attr + '="' + out + '"';
}
html = html.replace(/(src|href)="([^"?#]+\.(?:js|css))(?:\?[^"]*)?"/g, rewrite);
fs.writeFileSync(path.join(root, "index.html"), html);
var list = ["./", "index.html"].concat(assets, EXTRA.map(stamp));
var body = "var PRECACHE = " + JSON.stringify(list, null, 2) + ";";
var swPath = path.join(root, "sw.js");
var sw = fs.readFileSync(swPath, "utf8");
sw = sw.replace(/(PRECACHE-START[^\n]*\n)[\s\S]*?(\n\/\* PRECACHE-END)/, "$1" + body + "$2");
fs.writeFileSync(swPath, sw);
console.log("fingerprinted " + assets.length + " files; precache " + list.length);
