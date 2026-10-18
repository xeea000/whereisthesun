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
/* opt79: the Lag-O-Meter copy must be the pinned one, byte for byte (workspace/lag-o-meter/README.md says how to upgrade). */
var LAG_DIR = "vendor/lag-o-meter-1.3.0";
var LAG_PINNED = "lag-o-meter 1.3.0 sha256:917ef6682a041155f6a1292ca7537093f689552951898b2dfcb0dee3a00a9d40";
/* The fingerprint line of a vendored meter: its version and a sha256 over each file's name, length and bytes, sorted by name. */
function lagLine(dir) {
  var h = crypto.createHash("sha256");
  function isFile(e) {
    return e.isFile();
  }
  function nameOf(e) {
    return e.name;
  }
  function addFile(name) {
    var bytes = fs.readFileSync(path.join(dir, name));
    h.update(name + "\0" + bytes.length + "\0");
    h.update(bytes);
  }
  fs.readdirSync(dir, { withFileTypes: true }).filter(isFile).map(nameOf).sort().forEach(addFile);
  var version = /VERSION = "([^"]+)"/.exec(fs.readFileSync(path.join(dir, "version.js"), "utf8"))[1];
  return "lag-o-meter " + version + " sha256:" + h.digest("hex");
}
var lag = lagLine(path.join(root, LAG_DIR));
if (lag !== LAG_PINNED) {
  console.error(LAG_DIR + " is not the pinned Lag-O-Meter: " + lag + ", want " + LAG_PINNED);
  process.exit(1);
}
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
/* Any other query part, such as the meter's start.js?key=, stays after the hash. */
function rewrite(all, attr, file, query) {
  if (/^https?:/.test(file)) return all;
  function keep(part) {
    return part && !/^h=/.test(part);
  }
  var rest = (query || "").replace(/^\?/, "").split("&").filter(keep);
  var out = stamp(file) + (rest.length ? "&" + rest.join("&") : "");
  assets.push(out);
  return attr + '="' + out + '"';
}
html = html.replace(/(src|href)="([^"?#]+\.(?:js|css))(\?[^"]*)?"/g, rewrite);
fs.writeFileSync(path.join(root, "index.html"), html);
var list = ["./", "index.html"].concat(assets, EXTRA.map(stamp));
var body = "var PRECACHE = " + JSON.stringify(list, null, 2) + ";";
var swPath = path.join(root, "sw.js");
var sw = fs.readFileSync(swPath, "utf8");
sw = sw.replace(/(PRECACHE-START[^\n]*\n)[\s\S]*?(\n\/\* PRECACHE-END)/, "$1" + body + "$2");
fs.writeFileSync(swPath, sw);
console.log("fingerprinted " + assets.length + " files; precache " + list.length);
