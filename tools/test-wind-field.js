// workspace/whereisthesun/tools/test-wind-field.js
/* Checks wind-field.js sample(): the allocation-free form (out array) and the object form agree with a plain
 * bilinear reference over random tiles, including missing nodes. Usage: node tools/test-wind-field.js */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const STEP = 4, TILE = 8;
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const store = {}, ref = {};
for (let tx = 0; tx < 12; tx++) for (let ty = 0; ty < 6; ty++) {
  const u = [], v = [];
  for (let n = 0; n < 64; n++) {
    const gap = rnd() < 0.05;
    u.push(gap ? null : Math.round((rnd() * 40 - 20) * 100) / 100);
    v.push(gap ? null : Math.round((rnd() * 40 - 20) * 100) / 100);
  }
  ref[tx + "_" + ty] = { u, v };
  store["sunny-wf4-" + tx + "_" + ty] = JSON.stringify({ at: Date.now(), u, v });
}
function refNode(i, j) {
  i = ((i % 90) + 90) % 90;
  const t = ref[Math.floor(i / TILE) + "_" + Math.floor(j / TILE)];
  if (!t) return null;
  const k = (j % TILE) * TILE + (i % TILE);
  return t.u[k] === null ? null : [t.u[k], t.v[k]];
}
function refSample(lon, lat) {
  const x = (lon + 180) / STEP, y = (lat + 90) / STEP, i = Math.floor(x), j = Math.floor(y);
  const a = refNode(i, j), b = refNode(i + 1, j), c = refNode(i, j + 1), d = refNode(i + 1, j + 1);
  if (!a || !b || !c || !d) return null;
  const fx = x - i, fy = y - j;
  return { u: (a[0] * (1 - fx) + b[0] * fx) * (1 - fy) + (c[0] * (1 - fx) + d[0] * fx) * fy,
    v: (a[1] * (1 - fx) + b[1] * fx) * (1 - fy) + (c[1] * (1 - fx) + d[1] * fx) * fy };
}
const ctx = { window: {}, localStorage: { getItem: (k) => store[k] ?? null, setItem() {} }, fetch: () => new Promise(() => {}),
  setTimeout, Date, Math, JSON, Object, Array, Number, isFinite, Float64Array, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "wind-field.js"), "utf8"), ctx);
const W = ctx.window.SunnyWindField;
W.ensure({ getBounds: () => ({ getWest: () => -180, getEast: () => 180, getSouth: () => -78, getNorth: () => 80 }), getCenter: () => ({ lng: 0, lat: 0 }) });
let bad = 0, gaps = 0;
const out = [0, 0];
for (let n = 0; n < 100000; n++) {
  const lon = rnd() * 400 - 200, lat = rnd() * 156 - 78;
  const r = refSample(lon, lat), o = W.sample(lon, lat), ok = W.sample(lon, lat, out);
  if (!r) { gaps++; if (o || ok) bad++; continue; }
  if (!o || !ok || Math.abs(o.u - r.u) > 1e-9 || Math.abs(o.v - r.v) > 1e-9 || Math.abs(out[0] - r.u) > 1e-9 || Math.abs(out[1] - r.v) > 1e-9) bad++;
}
console.log((bad ? "FAIL" : "PASS") + " wind-field sample: " + bad + " mismatches, " + gaps + " gaps");
/* a view across the antimeridian (west < -180) asks only for whole tiles 0..11 */
const keys = [];
const ctx2 = { window: {}, localStorage: { getItem: (k) => { keys.push(k.replace("sunny-wf4-", "")); return null; }, setItem() {} },
  fetch: () => new Promise(() => {}), setTimeout: () => 0, Date, Math, JSON, Object, Array, Number, isFinite, Float64Array, console };
vm.createContext(ctx2);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "wind-field.js"), "utf8"), ctx2);
const wideView = { getWest: () => -250, getEast: () => -100, getSouth: () => 0, getNorth: () => 40 };
ctx2.window.SunnyWindField.ensure({ getBounds: () => wideView, getCenter: () => ({ lng: -175, lat: 20 }) });
const frac = keys.filter((k) => { const tx = Number(k.split("_")[0]); return tx !== Math.floor(tx) || tx < 0 || tx > 11; });
const pacific = ["7_3", "8_3", "9_3", "10_3", "11_3"].every((k) => { return keys.indexOf(k) >= 0; });
console.log((frac.length || !pacific ? "FAIL" : "PASS") + " wind-field tiles across the antimeridian: " + (frac.join(" ") || "all whole") + (pacific ? "" : ", missing 7..11"));
process.exit(bad || frac.length || !pacific ? 1 : 0);
