// workspace/whereisthesun/canada-static.js
/* SUNNY Canada static OpenStreetMap lines (t397u): inside the area the local Canada extract fully covers (data/world/rail-ca.json,
 * built by tools/build-rail-ca.js), a live layer reads its lines from static zoom 7 files instead of asking Overpass, and answers
 * in the same shape as an Overpass reply ({elements: [ways with tags and geometry]}).
 *   SunnyCanada.rail(box)  box [west, south, east, north]; a promise of that reply, or null when the box is not fully inside */
(() => {
  "use strict";
  var K = window.SunnyKit;
  if (!K) return;
  var BASE = "data/world/", meta = null, chunks = {};
  var KIND = { a: { railway: "abandoned" }, d: { railway: "disused" }, t: { railway: "abandoned", highway: "path" } };
  var inRing = (ring, x, y) => {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var a = ring[i], b = ring[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  };
  /* fully inside: all four corners inside and no outline corner within the box */
  var covers = (m, b) => {
    var r = m.ring;
    if (![[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].every((p) => { return inRing(r, p[0], p[1]); })) return false;
    return !r.some((p) => { return p[0] > b[0] && p[0] < b[2] && p[1] > b[1] && p[1] < b[3]; });
  };
  var tileOf = (lon, lat, z) => {
    var n = Math.pow(2, z), r = lat * Math.PI / 180;
    return [Math.floor((lon + 180) / 360 * n), Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n)];
  };
  var way = (row) => {
    var t = { name: row[2], operator: row[3], start_date: row[4], end_date: row[5] }, k = KIND[row[1]] || KIND.a, g = [], x = 0, y = 0;
    for (var key in k) t[key] = k[key];
    for (var i = 0; i < row[6].length; i += 2) { x += row[6][i]; y += row[6][i + 1]; g.push({ lon: x / 1e5, lat: y / 1e5 }); }
    return { type: "way", id: row[0], tags: t, geometry: g };
  };
  var hits = (w, b) => { return w.geometry.some((p) => { return p.lon >= b[0] && p.lon <= b[2] && p.lat >= b[1] && p.lat <= b[3]; }); };
  function rail(b) {
    if (meta === false) return null;
    if (meta && !covers(meta, b)) return null;
    var load = meta ? Promise.resolve(meta) : K.loadJson(BASE + "rail-ca.json").then((m) => { meta = m; return m; });
    return load.then((m) => {
      if (!covers(m, b)) return null;
      var keys = {}, a = tileOf(b[0], b[3], m.z), c = tileOf(b[2], b[1], m.z);
      for (var x = a[0]; x <= c[0]; x++) for (var y = a[1]; y <= c[1]; y++) if (m.tiles.indexOf(x + "_" + y) >= 0) keys[x + "_" + y] = 1;
      return Promise.all(Object.keys(keys).map((k) => {
        chunks[k] = chunks[k] || K.loadJson(BASE + "rail-ca/" + k + ".json");
        return chunks[k];
      })).then((lists) => {
        var seen = {}, out = [];
        lists.forEach((l) => { l.forEach((row) => { if (seen[row[0]]) return; var w = way(row); if (hits(w, b)) { seen[row[0]] = 1; out.push(w); } }); });
        return { elements: out };
      });
    }).catch(() => { meta = false; return null; });
  }
  window.SunnyCanada = { rail: rail };
})();
