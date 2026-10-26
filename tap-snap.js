// workspace/whereisthesun/tap-snap.js
/* SUNNY tap tolerance (opt96). Every map click is checked against the point layers: the nearest dot
 * whose hit circle (3x its visible diameter, at least 44 px across) contains the tap wins, and the
 * click is moved onto that dot before any layer handler sees it. With stacked dots the nearest one
 * is picked; zooming in separates them. */
(() => {
  "use strict";
  var LAYERS = { "pack-camps-dot": 0, "pack-plaques-dot": 0, "obs-point": 11, "obs-cluster": 0, "meteor-dot": 0, "craters-dot": 0,
    "fire-dot": 0, "beaches-dot": 0, "beaches-sun": 20, "aurora-dot": 0, "sat-dot": 0,
    "sea-trench": 0, "sea-vent": 0, "sea-mount": 0, "plat-dot": 0, "cable-plan": 0, "stn-polar": 0, "stn-other": 0, "acc-lab": 0, "ap-large": 0, "pipe-hit": 0, "plate-edge": 0,
    "quake-old": 0, "quake-new": 0, "volc-dot": 0, "storm-now": 0, "torn-dot": 0, "torn-hit": 0, "torn-star": 0, "wave-dot": 0, "storm-track": 0,
    "hist-wonder": 0, "hist-new7": 0, "hist-whs": 0, "hist-temple": 0, "hist-c200": 0, "hist-c500": 0, "hist-c1000": 0, "hist-c1500": 0, "hist-cold": 0, "hist-cnone": 0,
    "lab-space": 0, "lab-life": 0, "lab-earth": 0, "lab-eng": 0, "lab-chem": 0, "lab-agri": 0, "lab-soc": 0, "lab-rel": 0, "lab-mil": 0, "lab-other": 0,
    "hist-site": 0, "hist-nhsca": 0, "flight-band": 0, "shower-band": 0, "craton-fill": 0, "age-fill": 0, "ap-med": 0, "ap-ca": 0, "ap-casea": 0, "acc-dot": 0, "tower-dot": 0, "ca-cell-dot": 0, "fire-look-dot": 0, "parks-dot": 0,
    "tx-scope": 0, "tx-radar": 0, "tx-radarm": 0, "osm-plat": 0 }; /* opt99: world layers */
  var radius = (m, id, f) => {
    if (LAYERS[id]) {
      if (id === "beaches-sun") return 32 * (m.getZoom() < 6 ? 0.45 : m.getZoom() < 9 ? 0.55 : 0.65);
      return LAYERS[id];
    }
    try {
      var v = m.style._layers[id].paint.get("circle-radius");
      var r = typeof v === "number" ? v : v.evaluate(f, {});
      return r + 1;
    } catch (e) { return 6; }
  };
  /* click priority: once a tap lands on a dot, area layers (fills, lines, pictures) stay quiet for that tap */
  var hits = new WeakSet();
  /* opt154: one tap opens one card, for the topmost item within a few pixels of the (snapped) tap */
  var reg = new Set(), won = new WeakMap(), chose = new WeakMap(), NEAR = 6;
  /* opt166: hover and tap share one picker: point features sorted by screen distance to the pointer */
  var dist = (m, f, p) => { if (!f.geometry || f.geometry.type !== "Point") return 1e8; var q = m.project(f.geometry.coordinates); return Math.hypot(q.x - p.x, q.y - p.y); };
  var near = (m, p, fs) => { return fs.map((f, i) => [dist(m, f, p), i, f]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((r) => r[2]); };
  var winner = (m, e) => {
    var k = e.originalEvent || e;
    if (won.has(k)) return won.get(k);
    var ids = [...reg].filter((id) => { return m.getLayer(id) && m.getLayoutProperty(id, "visibility") !== "none"; }), w = null;
    if (ids.length && e.point) {
      var p = e.point, f = m.queryRenderedFeatures([[p.x - NEAR, p.y - NEAR], [p.x + NEAR, p.y + NEAR]], { layers: ids });
      f = chose.get(k) ? [chose.get(k)] : near(m, p, f);
      w = f.length ? f[0].layer.id : null;
    }
    won.set(k, w);
    return w;
  };
  var hit = (e) => { return !!(e && hits.has(e.originalEvent || e)); };
  var AREA = { fill: 1, line: 1, raster: 1, heatmap: 1, "fill-extrusion": 1 };
  var snap = (m, ev) => {
    var ids = Object.keys(LAYERS).filter((id) => { return m.getLayer(id) && m.getLayoutProperty(id, "visibility") !== "none"; });
    if (!ids.length) return;
    var p = ev.point, R = 60;
    var feats = m.queryRenderedFeatures([[p.x - R, p.y - R], [p.x + R, p.y + R]], { layers: ids });
    var best = null, bestD = 1e9;
    feats.forEach((f) => {
      if (!f.geometry || f.geometry.type !== "Point") return;
      var q = m.project(f.geometry.coordinates);
      var d = Math.hypot(q.x - p.x, q.y - p.y);
      var hit = Math.max(22, 3 * radius(m, f.layer.id, f));
      if (d <= hit && d < bestD) { bestD = d; best = q; chose.set(ev.originalEvent || ev, f); }
    });
    if (best) hits.add(ev.originalEvent || ev);
    if (!best || bestD < 1) return;
    var np = Object.create(Object.getPrototypeOf(p));
    np.x = best.x;
    np.y = best.y;
    ev.point = np;
    ev.lngLat = m.unproject([best.x, best.y]);
  };
  var patch = () => {
    var M = window.maplibregl && window.maplibregl.Map;
    if (!M || M.prototype._sunnySnap) return;
    M.prototype._sunnySnap = true;
    var orig = M.prototype.fire, on = M.prototype.on;
    Object.assign(M.prototype, {
      fire(ev, props) {
        var c = typeof ev === "string" ? props : ev; /* hover-box fires ("click", props) */
        if (c && typeof c === "object" && (c.type === "click" || ev === "click") && c.point) {
          try { snap(this, c); } catch (e) {}
        }
        return orig.call(this, ev, props);
      },
      on(type, layer, fn) {
        if (type !== "click" || typeof layer !== "string" || typeof fn !== "function") return on.apply(this, arguments);
        var m = this;
        reg.add(layer);
        return on.call(this, type, layer, (...a) => {
          var l = m.getLayer(layer);
          if (l && AREA[l.type] && hit(a[0])) return undefined;
          try { if (a[0] && winner(m, a[0]) !== layer) return undefined; } catch (e) {}
          var c = a[0] && chose.get(a[0].originalEvent || a[0]);
          if (c && c.layer.id === layer && a[0].features) { /* the snapped item goes first, so the card matches the hover */
            var same = (g) => { return g.geometry && g.geometry.type === "Point" && g.geometry.coordinates[0] === c.geometry.coordinates[0] &&
              g.geometry.coordinates[1] === c.geometry.coordinates[1]; };
            a[0].features = [c].concat(a[0].features.filter((g) => !same(g)));
          }
          return fn.apply(m, a);
        });
      }
    });
  };
  patch();
  window.SunnyTapSnap = { snap: snap, hit: hit, near: near };
})();
