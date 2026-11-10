// workspace/whereisthesun/country-view.js
/* SUNNY t392u: country names follow the view. When a country fills part of the screen but its own label point is off
 * screen, its name goes at the middle of the visible part instead. After the map stops moving (and at most every
 * 250 ms) this clips each country outline (data/world/country-shapes.json, Natural Earth 1:110m) to the screen, keeps
 * countries whose visible part covers at least 6% of the screen and whose own name is not drawn, and puts one name
 * at the centre of the largest visible piece. Style, size and order come from label-tiers.js (row "country-view"). */
(function () {
  "use strict";
  var URL = "data/world/country-shapes.json", MIN_SHARE = 0.06, WAIT = 250;
  var shapes = null, loading = null, timer = 0, last = "";
  var stats = { ms: 0, shown: 0, checked: 0 };
  function lt() { return window.SunnyLabelTiers; }
  function row(id) { return lt().TIERS.filter((t) => { return t.id === id; })[0]; }
  function load() {
    if (!loading) loading = fetch(URL).then((r) => { return r.json(); }).then((j) => { shapes = j; return j; }).catch(() => { loading = null; });
    return loading;
  }
  /* Sutherland–Hodgman: clip a screen polygon [[x,y],…] to the rectangle 0..w, 0..h */
  function clip(pts, w, h) {
    var edges = [[(p) => { return p[0] >= 0; }, (a, b) => { return cut(a, b, 0, null); }],
      [(p) => { return p[0] <= w; }, (a, b) => { return cut(a, b, w, null); }],
      [(p) => { return p[1] >= 0; }, (a, b) => { return cut(a, b, null, 0); }],
      [(p) => { return p[1] <= h; }, (a, b) => { return cut(a, b, null, h); }]];
    edges.forEach((e) => {
      var out = [];
      for (var i = 0; i < pts.length; i++) {
        var a = pts[i], b = pts[(i + 1) % pts.length], ina = e[0](a), inb = e[0](b);
        if (ina) out.push(a);
        if (ina !== inb) out.push(e[1](a, b));
      }
      pts = out;
    });
    return pts;
  }
  function cut(a, b, x, y) {
    if (x !== null) { var t = (x - a[0]) / (b[0] - a[0]); return [x, a[1] + t * (b[1] - a[1])]; }
    var u = (y - a[1]) / (b[1] - a[1]);
    return [a[0] + u * (b[0] - a[0]), y];
  }
  /* signed area and centroid of a polygon */
  function centroid(pts) {
    var A = 0, cx = 0, cy = 0;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[(i + 1) % pts.length], f = p[0] * q[1] - q[0] * p[1];
      A += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f;
    }
    A /= 2;
    return A ? { a: Math.abs(A), x: cx / (6 * A), y: cy / (6 * A) } : { a: 0, x: 0, y: 0 };
  }
  function inside(pts, x, y) {
    var c = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if ((pts[i][1] > y) !== (pts[j][1] > y) && x < (pts[j][0] - pts[i][0]) * (y - pts[i][1]) / (pts[j][1] - pts[i][1]) + pts[i][0]) c = !c;
    }
    return c;
  }
  /* a point inside the piece: its centroid, or else the inside grid point nearest to it */
  function anchor(pts, c) {
    if (inside(pts, c.x, c.y)) return [c.x, c.y];
    var xs = pts.map((p) => { return p[0]; }), ys = pts.map((p) => { return p[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var best = null, bd = Infinity;
    for (var i = 1; i < 12; i++) {
      for (var j = 1; j < 12; j++) {
        var x = x0 + (x1 - x0) * i / 12, y = y0 + (y1 - y0) * j / 12, d = (x - c.x) * (x - c.x) + (y - c.y) * (y - c.y);
        if (d < bd && inside(pts, x, y)) { bd = d; best = [x, y]; }
      }
    }
    return best;
  }
  function labelsShown(map) {
    var id = lt().ids.filter((i) => { return /country-view$/.test(i); })[0];
    return !!(id && map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== "none");
  }
  function update() {
    timer = 0;
    var map = window.map, L = lt();
    if (!map || !L || !map.getSource(L.VIEW_SRC)) return;
    if (map.isMoving()) { schedule(); return; }
    var v = row("country-view"), z = map.getZoom(), feats = [];
    if (labelsShown(map) && z >= v.min && z < v.max) {
      if (!shapes) { load().then(schedule); return; }
      var t0 = performance.now(), cv = map.getCanvas(), w = cv.clientWidth, h = cv.clientHeight, b = map.getBounds();
      var own = {};
      var staticIds = L.ids.filter((i) => { return /country-(xl|l|m|s|xs)$/.test(i) && map.getLayer(i); });
      map.queryRenderedFeatures({ layers: staticIds }).forEach((f) => { own[f.properties.iso_a2] = true; });
      stats.checked = 0;
      shapes.forEach((c) => {
        if (own[c.c] || c.b[2] < b.getWest() || c.b[0] > b.getEast() || c.b[3] < b.getSouth() || c.b[1] > b.getNorth()) return;
        var k = L.areaClass(c.c), tr = row("country-" + k);
        if (z < tr.min || z >= tr.max) return;
        stats.checked++;
        var total = 0, top = null;
        c.g.forEach((poly) => {
          var ring = poly[0], pts = [];
          for (var i = 0; i < ring.length; i += 2) { var p = map.project([ring[i], ring[i + 1]]); pts.push([p.x, p.y]); }
          var piece = clip(pts, w, h);
          if (piece.length < 3) return;
          var cn = centroid(piece);
          total += cn.a;
          if (!top || cn.a > top.c.a) top = { pts: piece, c: cn };
        });
        if (!top || total < MIN_SHARE * w * h) return;
        var at = anchor(top.pts, top.c);
        if (!at) return;
        var ll = map.unproject(at);
        feats.push({ type: "Feature", geometry: { type: "Point", coordinates: [Math.round(ll.lng * 1e4) / 1e4, Math.round(ll.lat * 1e4) / 1e4] },
          properties: { name_en: c.n, iso_a2: c.c, s: L.sizeAt("country-" + k, tr.min, z) } });
      });
      stats.ms = Math.round((performance.now() - t0) * 10) / 10;
    }
    stats.shown = feats.length;
    var key = JSON.stringify(feats);
    if (key === last) return;
    last = key;
    map.getSource(L.VIEW_SRC).setData({ type: "FeatureCollection", features: feats });
  }
  function schedule() {
    if (!timer) timer = setTimeout(update, WAIT);
  }
  function boot() {
    var map = window.map;
    if (!map || !map.on || !lt()) { setTimeout(boot, 500); return; }
    map.on("moveend", schedule);
    map.on("idle", schedule);
    document.addEventListener("change", (e) => { if (e.target && e.target.id === "toggle-map") schedule(); });
  }
  boot();
  window.SunnyCountryView = { update: update, stats: stats };
})();
