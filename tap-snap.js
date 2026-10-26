// workspace/whereisthesun/tap-snap.js
/* SUNNY tap tolerance (opt96). Every map click is checked against the point layers: the nearest dot
 * whose hit circle (3x its visible diameter, at least 44 px across) contains the tap wins, and the
 * click is moved onto that dot before any layer handler sees it. With stacked dots the nearest one
 * is picked; zooming in separates them. */
(() => {
  "use strict";
  var LAYERS = { "pack-camps-dot": 0, "pack-plaques-dot": 0, "obs-point": 11, "obs-cluster": 0, "meteor-dot": 0, "craters-dot": 0,
    "fire-dot": 0, "beaches-dot": 0, "beaches-sun": 20, "aurora-dot": 0, "sat-dot": 0,
    "sea-trench": 0, "sea-vent": 0, "sea-mount": 0, "plat-dot": 0, "cable-plan": 0, "stn-polar": 0, "stn-other": 0, "acc-lab": 0, "ap-large": 0, "pipe-hit": 0,
    "hist-wonder": 0, "hist-new7": 0, "hist-whs": 0, "hist-temple": 0, "hist-c200": 0, "hist-c500": 0, "hist-c1000": 0, "hist-c1500": 0, "hist-cold": 0, "hist-cnone": 0,
    "hist-site": 0, "shower-band": 0, "craton-fill": 0, "age-fill": 0, "ap-med": 0, "acc-dot": 0, "lab-dot": 0, "inst-dot": 0, "tower-dot": 0,
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
      if (d <= hit && d < bestD) { bestD = d; best = q; }
    });
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
    var orig = M.prototype.fire;
    Object.assign(M.prototype, {
      fire(ev, props) {
        if (ev && typeof ev === "object" && ev.type === "click" && ev.point) {
          try { snap(this, ev); } catch (e) {}
        }
        return orig.call(this, ev, props);
      }
    });
  };
  patch();
  window.SunnyTapSnap = { snap: snap };
})();
