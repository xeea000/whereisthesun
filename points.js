// workspace/whereisthesun/points.js
/* SUNNY progressive disclosure (opt96). Reads the tiny points files written by tools/split-points.js
 * (delta-encoded lat/lon plus a category code) into map features, and fetches one detail shard when
 * a dot is tapped (kept in memory, and in the offline cache when a region was saved). */
(() => {
  "use strict";
  var shards = {};
  var toFeatures = (j, extra) => {
    var out = [], a = 0, o = 0;
    for (var i = 0; i < j.n; i++) {
      a += j.lat[i]; o += j.lon[i];
      var p = { i: i, k: j.codes[j.c[i]] };
      if (extra) Object.assign(p, extra);
      out.push({ type: "Feature", properties: p, geometry: { type: "Point", coordinates: [o / 1e5, a / 1e5] } });
    }
    return out;
  };
  var load = (url) => { return fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }); };
  /* base is the path without suffix, e.g. data/packs/ca-on/plaques; meta is the points file. */
  var detail = (base, meta, i, ver) => {
    var k = Math.floor(i / meta.S);
    var u = base + ".d" + k + ".json" + (ver ? "?h=" + ver : "");
    if (!shards[u]) shards[u] = load(u).catch((e) => { delete shards[u]; throw e; });
    return shards[u].then((rows) => {
      var row = rows[i - k * meta.S] || [];
      var obj = {};
      meta.cols.split(",").forEach((c, n) => { obj[c] = row[n]; });
      return obj;
    });
  };
  var skeleton = (title) => {
    return '<div class="pf-now"><span class="pf-facts"><b>' + (title || "") + '</b><span class="sk-line"></span><span class="sk-line sk-short"></span>' +
      '<span class="sk-line"></span></span></div>';
  };
  window.SunnyPoints = { toFeatures: toFeatures, load: load, detail: detail, skeleton: skeleton };
})();
