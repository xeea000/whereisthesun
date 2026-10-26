// workspace/whereisthesun/tools/build-sat-mag.js
/* SUNNY opt107: standard magnitudes for satellites in the small CelesTrak groups, from Mike McCants' quicksat.mag
 * (https://www.mmccants.org/programs/qsmag.zip; magnitude at 1000 km range, half lit). Satellites with no value
 * there are left out, so the app shows "unknown" instead of a guess.
 * Usage: node tools/build-sat-mag.js <dir with quicksat.mag and stations/science/weather/gnss/visual .tle> */
const fs = require("fs");
const path = require("path");
const dir = process.argv[2];
const ids = new Set();
["stations", "science", "weather", "gnss", "visual"].forEach((g) => {
  fs.readFileSync(path.join(dir, g + ".tle"), "utf8").split(/\r?\n/).forEach((l) => { if (l.startsWith("1 ")) ids.add(+l.slice(2, 7)); });
});
const mag = {};
fs.readFileSync(path.join(dir, "quicksat.mag"), "latin1").split(/\r?\n/).slice(1).forEach((l) => {
  const id = +l.slice(0, 5), m = parseFloat(l.slice(33, 38));
  if (ids.has(id) && !isNaN(m)) mag[id] = m;
});
fs.writeFileSync(path.join(__dirname, "..", "data", "sats", "mag.json"), JSON.stringify(mag));
console.log("satellites", ids.size, "with magnitude", Object.keys(mag).length);
