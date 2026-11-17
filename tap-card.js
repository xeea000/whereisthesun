// workspace/whereisthesun/tap-card.js
/* SUNNY tap card for everything (t409u). After a real tap, if no layer opened its own card, this opens one:
 *   a dot, line or area of a switched-on layer gets its name, type and the facts the map data carries, and its source;
 *   a cluster zooms in to split; a picture or field layer (raster, heatmap, wind) says what it shows at that spot,
 *   with the value there when the layer can give one (window.SunnyTapValue[layer id](lngLat) -> text), and its source.
 * Which switch drew a map layer is learnt when the layer is added: its taps list, its id or source, a source that switch
 * already drew from, or the switch being applied at that moment. Layers with no known switch get no card from here. */
(() => {
  "use strict";
  var owners = {}, bySrc = {}, applying = null;
  var BASE = { ofm: 1, osm: 1, "base-sat": 1, "base-dark": 1 };
  var FIELD = { raster: 1, heatmap: 1, hillshade: 1 };
  var SKIP = /^(i|k|ov|id|cluster|cluster_id|point_count|point_count_abbreviated|sites|magOut|h|r|s|c|t|hover|_.*)$/;
  var esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var L = () => window.SunnyLayers;
  var defOf = (id) => { var D = L(); return D ? D.defs().filter((d) => d.id === id)[0] : null; };
  var ownerOf = (spec) => {
    var D = L(), lid = spec.id, ds = D ? D.defs() : [];
    var d = ds.filter((x) => x.taps && x.taps.indexOf(lid) >= 0)[0] ||
      ds.filter((x) => lid.indexOf(x.id + "-") === 0 || spec.source === x.id || spec.source === "w-" + x.id)[0];
    if (!d && bySrc[spec.source]) return bySrc[spec.source];
    if (!d && applying) d = applying;
    if (d && spec.source && typeof spec.source === "string") bySrc[spec.source] = d.id;
    return d ? d.id : "";
  };
  var wrap = (d) => {
    if (!d || d._tapWrap) return;
    d._tapWrap = true;
    ["apply", "set"].forEach((fn) => {
      var f = d[fn];
      if (typeof f !== "function") return;
      d[fn] = (...a) => {
        applying = d;
        try { return f.apply(d, a); } finally { applying = null; }
      };
    });
  };
  var hookLayers = () => {
    var D = L();
    if (!D || D._tapHook) return !!D;
    D._tapHook = true;
    D.defs().forEach(wrap);
    var add = D.add;
    D.add = (d, ...a) => { wrap(d); return add.call(D, d, ...a); };
    return true;
  };
  var M = window.maplibregl && window.maplibregl.Map;
  if (M && !M.prototype._tapCard) {
    M.prototype._tapCard = true;
    var addLayer = M.prototype.addLayer;
    M.prototype.addLayer = addOwned;
  }
  function addOwned(spec, ...a) {
    try { if (spec && spec.id && !owners[spec.id]) owners[spec.id] = ownerOf(spec); } catch (e) {}
    return addLayer.call(this, spec, ...a);
  }
  var onNow = (id) => { var D = L(); return !!id && D && D.isOn(id); };
  var srcOf = (m, sid) => {
    var s = m.getSource(sid), a = (s && (s.attribution || (s._options && s._options.attribution))) || "";
    var lk = /<a[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/.exec(a);
    if (lk) return [lk[2].replace(/^©\s*/, "") || "Source", lk[1]];
    var txt = String(a).replace(/<[^>]+>/g, "").trim();
    return txt ? txt : null;
  };
  var nice = (k) => { k = String(k).replace(/[_:]+/g, " "); return k.charAt(0).toUpperCase() + k.slice(1); };
  var facts = (p) => Object.keys(p || {}).filter((k) => !SKIP.test(k) && /^(string|number)$/.test(typeof p[k]) && String(p[k]).length < 80 &&
    String(p[k]) !== "" && !/^(name|n|title|NAME|Name|label|nm)$/.test(k)).slice(0, 5).map((k) => "<small>" + esc(nice(k)) + ": " + esc(p[k]) + "</small>");
  var show = (m, ll, title, lines, src) => {
    var K = window.SunnyKit;
    return K ? K.show(m, ll, title, lines, src || "named in the text above") : null;
  };
  var featCard = (m, f, ll) => {
    var d = defOf(owners[f.layer.id]), name = d ? d.name : "Map item", p = f.properties || {};
    var src = srcOf(m, f.source);
    if (p.cluster && m.getSource(f.source).getClusterExpansionZoom) {
      show(m, ll, name, [esc(p.point_count) + " places here. Zooming in to show each one."], src);
      Promise.resolve(m.getSource(f.source).getClusterExpansionZoom(p.cluster_id)).then((z) => {
        m.easeTo({ center: f.geometry.type === "Point" ? f.geometry.coordinates : ll, zoom: Math.min(z, 18) });
      }).catch(() => { m.easeTo({ center: ll, zoom: m.getZoom() + 2 }); });
      return;
    }
    var T = window.SunnyHoverTip, pp = null;
    var lab = T ? T.label(f, (h) => { if (pp && pp.isOpen()) pp.setHTML(window.SunnyKit.card(name, [h].concat(facts(p)), src || "Map data")); }) : "";
    pp = show(m, ll, name, [lab].concat(facts(p)), src);
  };
  var fieldCards = (m, ll) => {
    var D = L();
    if (!D) return 0;
    var by = {};
    m.getStyle().layers.forEach((l) => {
      var o = owners[l.id];
      if (!o || !onNow(o) || m.getLayoutProperty(l.id, "visibility") === "none") return;
      (by[o] = by[o] || []).push(l);
    });
    var n = 0;
    D.list().forEach((d) => {
      var ls = by[d.id] || [];
      if (!ls.length || !ls.some((l) => FIELD[l.type])) return;
      var val = window.SunnyTapValue && window.SunnyTapValue[d.id] ? window.SunnyTapValue[d.id](ll) : "";
      var fl = ls.filter((l) => FIELD[l.type])[0];
      show(m, ll, d.name, [val ? "<b>" + esc(val) + "</b>" : "", d.tip ? esc(d.tip) : "What this layer shows"], fl ? srcOf(m, fl.source) : null);
      n++;
    });
    return n;
  };
  /* canvas overlays that are not MapLibre layers (Wind, plate-motion streaks) */
  var CANVAS = {
    wind: { el: "wind-layer", src: ["Open-Meteo", "https://open-meteo.com/"] },
    platemotion: { el: "plate-gl-canvas", src: ["NNR-MORVEL56, Argus et al. 2011", "https://doi.org/10.1029/2011GC003751"] }
  };
  var canvasEl = (id) => {
    var spec = CANVAS[id];
    return document.getElementById(spec ? spec.el : id + "-layer");
  };
  var canvasOn = (el) => {
    if (!el || el.hidden || el.classList.contains("wind-play-hidden")) return false;
    if (el.style && el.style.display === "none") return false;
    var vis = getComputedStyle(el);
    return vis.display !== "none" && vis.visibility !== "hidden";
  };
  var canvasCards = (m, ll) => {
    var D = L(), n = 0;
    if (!D) return 0;
    D.list().forEach((d) => {
      if (!onNow(d.id)) return;
      var el = canvasEl(d.id);
      if (!canvasOn(el)) return;
      var val = window.SunnyTapValue && window.SunnyTapValue[d.id] ? window.SunnyTapValue[d.id](ll) : "";
      var spec = CANVAS[d.id];
      show(m, ll, d.name, [val ? "<b>" + esc(val) + "</b>" : "", d.tip ? esc(d.tip) : "What this layer shows"], spec ? spec.src : null);
      n++;
    });
    return n;
  };
  var GENERIC = /^<div class="pf-src">(Dropped pin|Loading forecast…)<\/div>$/;
  /* a layer with its own click handler opens its own card, at times after a download: wait longer before stepping in */
  var ownClick = (m, lid) => ((m._delegatedListeners && m._delegatedListeners.click) || []).some((x) => x.layers && x.layers.indexOf(lid) >= 0);
  var onTap = (m, e) => {
    if (!hookLayers()) return;
    /* a layer's own click handler may run just before this one on the same click: count cards from 300 ms before */
    var t0 = Date.now() - 300, pt = e.point, ll = e.lngLat;
    var fs = [];
    try {
      fs = m.queryRenderedFeatures([[pt.x - 6, pt.y - 6], [pt.x + 6, pt.y + 6]]).filter((f) => f.layer && !BASE[f.source] && onNow(owners[f.layer.id]));
    } catch (er) { fs = []; }
    if (window.SunnyTapSnap) fs = window.SunnyTapSnap.near(m, pt, fs);
    var f = fs.find((g) => /circle|symbol/.test(g.layer.type)) || fs.find((g) => g.layer.type === "line") ||
      fs.find((g) => !FIELD[g.layer.type]);
    var got = () => { var I = window.SunnyInfo; return I && I.since ? I.since(t0).filter((h) => !GENERIC.test(h)).length : 0; };
    var later = fs.some((g) => ownClick(m, g.layer.id));
    var step = (left) => {
      if (got()) return;
      if (left) { setTimeout(() => { step(left - 1); }, 500); return; }
      if (f && onNow(owners[f.layer.id])) featCard(m, f, ll);
      else if (!f) { if (!fieldCards(m, ll)) canvasCards(m, ll); }
    };
    setTimeout(() => { step(later ? 3 : 0); }, 450);
  };
  window.SunnyTapValue = Object.assign(window.SunnyTapValue || {}, {
    aurora: (ll) => { var A = window.SunnyAurora, v = A ? A.at(ll.lng, ll.lat) : 0; return "Aurora chance here " + Math.round(v || 0) + " %"; },
    sunhours: (ll) => { var S = window.SunnySunHours, v = S ? S.at(ll) : null; return v == null ? "" : "About " + S.fmt(v) + " of direct sun today here"; }
  });
  hookLayers();
  var boot = () => {
    var m = window.map;
    if (!m || !m.on) return setTimeout(boot, 500);
    hookLayers();
    m.on("click", (e) => { onTap(m, e); });
  };
  window.addEventListener("load", boot);
  window.SunnyTapCard = { owner: (lid) => owners[lid] || "" };
})();
