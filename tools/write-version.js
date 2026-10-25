#!/usr/bin/env node
// workspace/whereisthesun/tools/write-version.js
/* SUNNY: writes version.json at the site root. Run on EVERY deploy, after bumping optNN.
 * Build name comes from BUILD in sw.js; hash covers the main shell files. */
"use strict";
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var root = path.join(__dirname, "..");
var FILES = [
  "index.html", "app.js", "app-core.js", "app-timeline.js", "app-cloud-layers.js", "app-play-buffers.js", "app-play-blend.js", "app-cloud-frames.js", "app-beach-store.js", "app-beach-fetch.js", "app-beach-search.js", "app-wind-data.js", "app-wind-draw.js", "app-radar.js", "app-play-clock.js", "app-scrub.js", "frame-tween.js", "motion-worker.js", "radar-key.js", "radar-source.js", "radar-warm.js", "radar-mask.js", "radar-legend.js", "wind-field.js", "wind-gl.js", "point-forecast.js", "craters.js", "observatories.js", "wind-play-fade.js",
  "beach-worker.js", "update-banner.js", "settings-panel.js", "settings-panel.css", "cloud-key.js", "play-handoff.js", "styles.css", "sw.js"
];
var sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
var match = sw.match(/BUILD\s*=\s*"([^"]+)"/);
if (!match) {
  console.error("write-version: could not find BUILD in sw.js");
  process.exit(1);
}
var hash = crypto.createHash("sha256");
function addFile(name) {
  var file = path.join(root, name);
  if (fs.existsSync(file)) hash.update(name + "\n").update(fs.readFileSync(file));
}
FILES.forEach(addFile);
var out = { build: match[1], hash: hash.digest("hex").slice(0, 12), at: new Date().toISOString().slice(0, 10) };
fs.writeFileSync(path.join(root, "version.json"), JSON.stringify(out) + "\n");
console.log("version.json", JSON.stringify(out));
