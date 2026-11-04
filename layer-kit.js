// workspace/whereisthesun/layer-kit.js
/* SUNNY layer helpers (opt94), shared by the opt94 layers. Everything here is data-light:
 *   store    small localStorage cache with an expiry, so slow-changing data is fetched rarely
 *   tiles    viewport loader: splits the view into zoom-10 tiles, loads only missing tiles,
 *            waits for the map to stop moving, and only above a zoom threshold
 *   zoomGate shared no-hysteresis rule (opt206): hide when below minZoom or view too wide
 *   lod      opt207 level-of-detail band picker (overview → detail by zoom, no hysteresis)
 *   size     opt210 shared circle/icon size curve (smooth zoom + capped cluster boost)
 *   overzoom opt219/opt220 source maxzoom = provider native max (MapLibre upscales past it);
 *            uncapped drops layer maxzoom caps so overlays stay to map maxZoom
 *   popup    the same tap card the Craters layer uses */
(() => {
  "use strict";
  var popup = null;
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  /* src is "text" or ["text", "https://record-or-dataset-page"]; every card ends with a link */
  function srcHtml(src) {
    var s = Array.isArray(src) ? src : [src, ""];
    var a = s[1] ? '<a href="' + esc(s[1]) + '" target="_blank" rel="noopener">' + esc(s[0]) + "</a>" : esc(s[0]);
    return '<div class="pf-src">Source: ' + a + "</div>";
  }
  function card(title, lines, src) {
    return '<div class="pf-now"><span class="pf-facts"><b>' + esc(title) + "</b>" +
      lines.filter(Boolean).map((l) => { return "<br>" + l; }).join("") + "</span></div>" + srcHtml(src);
  }
  function show(map, lngLat, title, lines, src) {
    var html = '<div class="pf-now"><span class="pf-facts"><b>' + esc(title) + "</b>" +
      lines.filter(Boolean).map((l) => { return "<br>" + l; }).join("") +
      '</span></div>' + srcHtml(src);
    popup = new window.maplibregl.Popup({ closeButton: true, maxWidth: "280px", className: "pf-popup", offset: 8 });
    popup.setLngLat(lngLat).setHTML(html).addTo(map);
    if (!map._sunnyGone) {
      map._sunnyGone = true; /* opt165: a card whose place has left the screen closes */
      map.on("moveend", () => {
        try {
          var ll = popup && popup.getLngLat && popup.getLngLat();
          if (!popup || !popup.isOpen() || !ll || !isFinite(ll.lng) || !isFinite(ll.lat)) return;
          if (!map.getBounds().contains(ll)) popup.remove();
        } catch (e) {}
      });
    }
    return popup;
  }
  function before(map) {
    var ids = ["obs-cluster", "craters-fill", "beaches-fill", "beaches-line", "beaches-dot"];
    for (var i = 0; i < ids.length; i++) if (map.getLayer(ids[i])) return ids[i];
    return undefined;
  }
  function vis(map, ids, on) {
    ids.forEach((id) => {
      var want = on ? "visible" : "none";
      if (map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== want) map.setLayoutProperty(id, "visibility", want);
    });
  }
  function getStore(key) {
    try {
      var v = JSON.parse(localStorage.getItem("sunny-c-" + key));
      if (v && v.t > Date.now()) return v.d;
    } catch (e) {}
    return null;
  }
  function putStore(key, data, ttlMs) {
    var s = JSON.stringify({ t: Date.now() + ttlMs, d: data });
    try {
      localStorage.setItem("sunny-c-" + key, s);
    } catch (e) {
      prune();
      try { localStorage.setItem("sunny-c-" + key, s); } catch (e2) {}
    }
  }
  /* full storage: drop the SUNNY tile caches (they reload a piece at a time) */
  function prune() {
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && k.indexOf("sunny-c-t-") === 0) localStorage.removeItem(k);
      }
    } catch (e) {}
  }
  var json = {};
  function loadJson(url) {
    if (!json[url]) {
      json[url] = fetch(url).then((r) => {
        if (!r.ok) throw new Error(url + " " + r.status);
        return r.json();
      });
      json[url].catch(() => { delete json[url]; });
    }
    return json[url];
  }
  function tileOf(lng, lat, z) {
    var n = Math.pow(2, z);
    var x = Math.floor((lng + 180) / 360 * n);
    var r = lat * Math.PI / 180;
    var y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n);
    return [Math.max(0, Math.min(n - 1, x)), Math.max(0, Math.min(n - 1, y))];
  }
  function tileBox(x, y, z) {
    var n = Math.pow(2, z);
    function lat(yy) {
      return Math.atan(Math.sinh(Math.PI * (1 - 2 * yy / n))) * 180 / Math.PI;
    }
    return [x / n * 360 - 180, lat(y + 1), (x + 1) / n * 360 - 180, lat(y)];
  }
  /* opts: { key, minZoom, maxTiles, ttlMs, fetchTile(box) -> Promise<array>, onData(allItems) , isOn() } */
  /* opt206: below minZoom or when the view is too wide, emit [] so visibility depends only on
   * the current zoom/view — never on zoom history (no hysteresis).
   * Tile mem + localStorage stay so zooming back in is instant. */
  function tiles(map, opts) {
    var Z = 10;
    var mem = {};
    var timer = null;
    var busy = false;
    function wanted() {
      var b = map.getBounds();
      var a = tileOf(b.getWest(), b.getNorth(), Z);
      var c = tileOf(b.getEast(), b.getSouth(), Z);
      var out = [];
      for (var x = a[0]; x <= c[0]; x++) for (var y = a[1]; y <= c[1]; y++) out.push(x + "/" + y);
      return out;
    }
    function emit(list) {
      var all = [];
      list.forEach((k) => { if (mem[k]) all = all.concat(mem[k]); });
      opts.onData(all);
    }
    function run() {
      timer = null;
      if (busy) return;
      if (!opts.isOn()) { opts.onData([]); return; }
      var gate = zoomGate(map, { minZoom: opts.minZoom, tileCount: wanted().length, maxTiles: opts.maxTiles || 6 });
      if (!gate.show) { opts.onData([]); return; }
      var list = wanted();
      var missing = [];
      list.forEach((k) => {
        if (mem[k]) return;
        var c = getStore("t-" + opts.key + "-" + k);
        if (c) mem[k] = c;
        else missing.push(k);
      });
      emit(list);
      if (!missing.length) return;
      busy = true;
      var k = missing[0];
      var p = k.split("/");
      opts.fetchTile(tileBox(+p[0], +p[1], Z)).then((items) => {
        mem[k] = items;
        putStore("t-" + opts.key + "-" + k, items, opts.ttlMs);
        /* Re-check gate: user may have zoomed out while the tile was in flight. */
        var g2 = zoomGate(map, { minZoom: opts.minZoom, tileCount: wanted().length, maxTiles: opts.maxTiles || 6 });
        if (!opts.isOn() || !g2.show) opts.onData([]);
        else emit(list);
        busy = false;
        if (missing.length > 1) schedule(1500);
      }).catch(() => {
        busy = false;
        schedule(30000);
      });
    }
    function schedule(ms) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, ms == null ? 700 : ms);
    }
    map.on("moveend", () => { schedule(); });
    return { refresh: schedule };
  }
  /* opt206 shared zoom gate: what is visible must depend only on the current view/zoom.
   * Loaders that fetch above a threshold use this instead of early-return-and-keep-source.
   * reason: "ok" | "off" | "zoom" | "wide"
   * Also set layer minzoom (setMinZoom) when ALL of a layer's data is gated. */
  function zoomGate(map, opts) {
    opts = opts || {};
    if (opts.isOn && !opts.isOn()) return { show: false, reason: "off" };
    var zMin = opts.minZoom == null ? 0 : opts.minZoom;
    if (map && map.getZoom() < zMin) return { show: false, reason: "zoom" };
    if (opts.tileCount != null && opts.tileCount > (opts.maxTiles == null ? 6 : opts.maxTiles)) {
      return { show: false, reason: "wide" };
    }
    return { show: true, reason: "ok" };
  }
  function setMinZoom(map, ids, z) {
    var zMin = z == null ? 0 : z;
    (ids || []).forEach((id) => {
      if (!map.getLayer(id)) return;
      try {
        if (map.setLayerZoomRange) map.setLayerZoomRange(id, zMin, 24);
      } catch (e) {}
    });
  }
  function zoomNote(map, minZoom, label) {
    if (!map || map.getZoom() >= (minZoom || 0)) return "";
    return label || "";
  }
  /* main Overpass server first, then public mirrors when it is busy */
  var OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
  function overpass(ql, i) {
    i = i || 0;
    return fetch(OVERPASS[i] + "?data=" + encodeURIComponent(ql)).then((r) => {
      if (!r.ok) throw new Error("overpass " + r.status);
      return r.json();
    }).catch((e) => {
      if (i + 1 < OVERPASS.length) return overpass(ql, i + 1);
      throw e;
    });
  }
  function fc(feats) {
    return { type: "FeatureCollection", features: feats || [] };
  }
  /* opt108: one shared Group nearby markers setting (default on); off drops clustering and zoom gates on point layers */
  var grouped = () => { try { return localStorage.getItem("sunny-group") !== "0"; } catch (e) { return true; } };
  var gz = (z) => { return grouped() ? z : 0; };
  /* opt110: legend html helpers. ramp: gradient bar with end labels; keys: [[colour, "dot"|"line"|"area", label], ...] */
  var legRamp = (grad, lo, mid, hi) => {
    return '<div class="sat-leg"><div class="sat-ramp" style="background:linear-gradient(90deg,' + grad + ')"></div>' +
      '<div class="sat-rl"><span>' + lo + "</span><span>" + (mid || "") + "</span><span>" + hi + "</span></div></div>";
  };
  var legKeys = (rows) => {
    return rows.map((r) => { return '<span class="ls-k"><i class="ls-sw ls-' + r[1] + '" style="background:' + r[0] + '"></i>' + r[2] + "</span>"; }).join("");
  };
  /* opt199: shared parent/kids visibility.
   * Subset kids (default): a feature shows only when it matches ≥1 checked kid;
   *   zero subset kids checked → show nothing (parent switch may stay on).
   * Modifier kids (role: "mod"): display/option switches — ignored by matchAny /
   *   activeCodes / anyOn. Do not use them for feature subsets.
   * Storage: sunny-L-<kid.id>, same key layers-panel writes. */
  function kidsDflt(k) { return k && k.dflt == null ? true : !!(k && k.dflt); }
  function kidsIsOn(id, dflt) {
    try {
      var v = localStorage.getItem("sunny-L-" + id);
      return v == null ? !!dflt : v === "1";
    } catch (e) { return !!dflt; }
  }
  function kidsSubset(list) {
    return (list || []).filter((k) => { return k.role !== "mod" && k.kind !== "mod"; });
  }
  function kidsActive(list) {
    return kidsSubset(list).filter((k) => { return kidsIsOn(k.id, kidsDflt(k)); });
  }
  function kidsAnyOn(list) { return kidsActive(list).length > 0; }
  /* JS feature gate: none on → false; else OR of pred(kid) over active subset kids */
  function kidsMatchAny(list, pred) {
    var on = kidsActive(list);
    if (!on.length) return false;
    for (var i = 0; i < on.length; i++) if (pred(on[i])) return true;
    return false;
  }
  function kidsActiveCodes(list, codeOf) {
    return kidsActive(list).map(codeOf || ((k) => { return k.code != null ? k.code : k.id; }))
      .filter((c) => { return c != null && c !== ""; });
  }
  /* MapLibre filter: empty codes → never matches.
   * Shared helper for every kid filter. MapLibre 4.7 ignores ["==", 1, 0], so empty must be
   * real `false` (also kids.noneFilter) or dots stay on after unticking every kid. */
  function kidsNoneFilter() { return false; }
  function kidsInFilter(getExpr, codes) {
    if (!codes || !codes.length) return kidsNoneFilter();
    return ["in", getExpr, ["literal", codes]];
  }
  /* Per-sublayer visibility: parent on AND that kid on */
  function kidsLayerOn(parentOn, kidId, dflt) {
    return !!parentOn && kidsIsOn(kidId, dflt == null ? true : !!dflt);
  }
  /* Parent on AND at least one subset kid on — use for shared layer visibility. */
  function kidsParentShow(parentOn, list) {
    return !!parentOn && kidsAnyOn(list);
  }
  /* Legend rows for active subset kids only. rowOf(kid) → [colour, "dot"|"line"|"area", label] or null. */
  function kidsLegKeys(list, rowOf) {
    var rows = kidsActive(list).map(rowOf).filter(Boolean);
    return rows.length ? legKeys(rows) : "";
  }
  var kids = { isOn: kidsIsOn, subset: kidsSubset, active: kidsActive, anyOn: kidsAnyOn,
    matchAny: kidsMatchAny, activeCodes: kidsActiveCodes, inFilter: kidsInFilter,
    noneFilter: kidsNoneFilter, layerOn: kidsLayerOn, parentShow: kidsParentShow, legKeys: kidsLegKeys };
  /* opt200: global Marker size (0.5x–3x, default 1x). Bake into interpolate stops —
   * MapLibre 4.7.1 drops layers with ["*", k, interpolate(zoom)]. Per-layer scales
   * (e.g. beach icon size) pass as extra and multiply on top. Not for raster/heatmap/line. */
  var MS_KEY = "sunny-marker-scale", MS_MIN = 0.5, MS_MAX = 3, MS_DEF = 1;
  var msVal = MS_DEF, msListen = [], msTrack = [];
  try {
    var _ms = parseFloat(localStorage.getItem(MS_KEY));
    if (isFinite(_ms) && _ms >= MS_MIN && _ms <= MS_MAX) msVal = Math.round(_ms * 100) / 100;
  } catch (e) {}
  function msMul(n, k) { return Math.round(n * k * 1000) / 1000; }
  function msScaleInterp(expr, k) {
    var out = expr.slice(0, 3);
    for (var i = 3; i < expr.length; i += 2) {
      out.push(expr[i]);
      out.push(msScaleVal(expr[i + 1], k));
    }
    return out;
  }
  function msScaleVal(v, k) {
    if (typeof v === "number") return msMul(v, k);
    if (!Array.isArray(v)) return v;
    if (v[0] === "interpolate" || v[0] === "interpolate-hcl" || v[0] === "interpolate-lab") return msScaleInterp(v, k);
    if (k === 1) return v;
    return ["*", k, v];
  }
  function msSize(expr, extra) {
    var k = msVal * (extra == null || extra === "" ? 1 : Number(extra));
    if (!isFinite(k) || k <= 0) k = 1;
    if (typeof expr === "number") return msMul(expr, k);
    if (!Array.isArray(expr)) return expr;
    if (expr[0] === "interpolate" || expr[0] === "interpolate-hcl" || expr[0] === "interpolate-lab") return msScaleInterp(expr, k);
    return msScaleVal(expr, k);
  }
  function msGet() { return msVal; }
  function msApplyOne(t) {
    if (!t.map || !t.map.getLayer || !t.map.getLayer(t.id)) return;
    var ex = typeof t.extra === "function" ? t.extra() : t.extra;
    var v = msSize(t.base, ex);
    try {
      if (t.kind === "layout") t.map.setLayoutProperty(t.id, t.prop, v);
      else t.map.setPaintProperty(t.id, t.prop, v);
    } catch (e) {}
  }
  function msRefresh() { msTrack.forEach(msApplyOne); }
  function msSet(n) {
    var x = Number(n);
    if (!isFinite(x)) return msVal;
    msVal = Math.max(MS_MIN, Math.min(MS_MAX, Math.round(x * 100) / 100));
    try { localStorage.setItem(MS_KEY, String(msVal)); } catch (e) {}
    msRefresh();
    msListen.slice().forEach((fn) => { try { fn(msVal); } catch (e) {} });
    return msVal;
  }
  function msOnChange(fn) {
    if (typeof fn === "function") msListen.push(fn);
    return fn;
  }
  /* Register a circle-radius / icon-size / text-size so live slider updates re-bake it. Returns scaled expr for addLayer. */
  function msBind(map, layerId, prop, base, opts) {
    opts = opts || {};
    var kind = opts.layout ? "layout" : "paint";
    msTrack = msTrack.filter((t) => { return !(t.map === map && t.id === layerId && t.prop === prop); });
    msTrack.push({ map: map, id: layerId, prop: prop, base: base, kind: kind, extra: opts.extra });
    return msSize(base, typeof opts.extra === "function" ? opts.extra() : opts.extra);
  }
  /* opt210: one shared marker size curve for every point/circle/symbol layer and every LOD band.
   * Always returns an interpolate(zoom) (never ["*", k, interpolate] — MapLibre 4.7.1 drops those).
   * Optional soft cluster boost inside each stop (sqrt of sites/n/point_count), capped (default 1.6x)
   * so overview centroids stay near single-dot size at the band cut — no giant circles on zoom-out.
   * opts: { lo, mid, hi } | { stops: [[z,r],...] } | { cluster: true|{ prop, max, coef } } | { exp: true }
   * Stop values are numbers or expressions (e.g. height). Pass through markerScale.bind for the slider. */
  function size(opts) {
    opts = opts || {};
    var lo = opts.lo != null ? opts.lo : 2.2;
    var mid = opts.mid != null ? opts.mid : 4;
    var hi = opts.hi != null ? opts.hi : 6.5;
    var stops = opts.stops;
    if (!stops) stops = [[2, lo], [8, mid], [14, hi]];
    var cl = opts.cluster;
    var prop = null, cmax = 1.6, ccoef = 0.15;
    if (cl) {
      if (cl === true) prop = "sites";
      else { prop = cl.prop || "sites"; cmax = cl.max != null ? cl.max : 1.6; ccoef = cl.coef != null ? cl.coef : 0.15; }
    }
    var kind = opts.exp ? ["exponential", 1.4] : ["linear"];
    var boost = prop ? ["min", cmax, ["+", 1, ["*", ccoef, ["sqrt", ["max", 0, ["-", ["coalesce", ["get", prop], 1], 1]]]]]] : null;
    var out = ["interpolate", kind, ["zoom"]];
    for (var i = 0; i < stops.length; i++) {
      var z = stops[i][0], r = stops[i][1];
      out.push(z);
      out.push(boost ? ["*", r, boost] : r);
    }
    return out;
  }
  /* opt219: raster/vector source maxzoom = provider's real native max.
   * MapLibre then overzooms (upscales the last tiles) past that zoom instead of requesting
   * missing high-z tiles (404 / empty MVT → layer vanishes). Layer maxzoom stays 24 / unset. */
  function overzoom(src, nativeMax) {
    src = src || {};
    var z = nativeMax == null ? src.maxzoom : nativeMax;
    if (z != null && isFinite(+z)) src.maxzoom = +z;
    return src;
  }
  /* Drop any layer maxzoom cap (keep its minzoom). Call after addLayer for tile overlays. */
  function uncapped(map, ids) {
    (ids || []).forEach((id) => {
      if (!map || !map.getLayer(id)) return;
      try {
        var min = 0;
        try { min = map.getLayer(id).minzoom || 0; } catch (e0) {}
        if (map.setLayerZoomRange) map.setLayerZoomRange(id, min, 24);
      } catch (e) {}
    });
  }
  /* opt207: level-of-detail band picker (Windy-style). cuts = [{ z: 8, id: "ov" }, { z: 24, id: "raw" }]
   * returns the id of the first cut whose z is above the current zoom (stateless; no hysteresis). */
  function lodBand(zoom, cuts) {
    var z = zoom == null ? 0 : zoom, list = cuts || [];
    for (var i = 0; i < list.length; i++) if (z < list[i].z) return list[i].id;
    return list.length ? list[list.length - 1].id : null;
  }
  /* Tiny loading flag helper for layer-row notes ("loading…" while an overview fetches). */
  function lodNote(loading, label) {
    return loading ? (label || "loading…") : "";
  }
  var lod = { band: lodBand, note: lodNote,
    CUT_CELL: [{ z: 8, id: "ov" }, { z: 24, id: "raw" }],
    CUT_PACK: [{ z: 7, id: "ov" }, { z: 24, id: "raw" }],
    CUT_PLAQUES: [{ z: 9, id: "ov" }, { z: 24, id: "raw" }],
    CUT_TOWERS: [{ z: 6, id: "ov" }, { z: 24, id: "raw" }],
    CUT_UNDERSEA: [{ z: 9, id: "ov" }, { z: 24, id: "raw" }],
    CUT_SUN: [{ z: 13, id: "ov" }, { z: 24, id: "raw" }] };
  /* opt223: Map brightness — basemap only (raster OSM/sat/dark + vector OpenFreeMap). */
  var MB_KEY = "sunny-map-brightness", MB_MIN = 0.3, MB_MAX = 1.2, MB_DEF = 1;
  var mbVal = MB_DEF, mbListen = [], mbOrig = {};
  try {
    var _mb = parseFloat(localStorage.getItem(MB_KEY));
    if (isFinite(_mb) && _mb >= MB_MIN && _mb <= MB_MAX) mbVal = Math.round(_mb * 100) / 100;
  } catch (e) {}
  function mbGet() { return mbVal; }
  function mbApplyRaster(map, id) {
    if (!map.getLayer || !map.getLayer(id)) return;
    var b = mbVal;
    var rmax = b <= 1 ? (0.28 + 0.72 * b) : 1;
    var rmin = b <= 1 ? 0 : Math.min(0.32, (b - 1) * 0.45);
    var contrast = (b - 1) * 0.4;
    var sat = (b - 1) * 0.28;
    try {
      map.setPaintProperty(id, "raster-brightness-max", rmax);
      map.setPaintProperty(id, "raster-brightness-min", rmin);
      map.setPaintProperty(id, "raster-contrast", contrast);
      map.setPaintProperty(id, "raster-saturation", sat);
    } catch (e) {}
  }
  function mbCacheOpacity(map, id, prop) {
    var k = id + "|" + prop;
    if (mbOrig[k] != null) return mbOrig[k];
    var cur = 1;
    try {
      var v = map.getPaintProperty(id, prop);
      if (typeof v === "number" && isFinite(v)) cur = v;
    } catch (e) {}
    mbOrig[k] = cur;
    return cur;
  }
  function mbApplyVector(map) {
    if (!map.getStyle) return;
    var layers = (map.getStyle().layers) || [];
    var b = mbVal;
    var factor = b <= 1 ? (0.35 + 0.65 * b) : Math.min(1.15, 0.85 + 0.3 * (b - 1));
    var props = ["fill-opacity", "line-opacity", "background-opacity", "fill-extrusion-opacity"];
    layers.forEach((ly) => {
      if (!ly.id || ly.id.indexOf("vb-") !== 0) return;
      props.forEach((prop) => {
        try {
          var base = mbCacheOpacity(map, ly.id, prop);
          map.setPaintProperty(ly.id, prop, Math.max(0, Math.min(1, base * factor)));
        } catch (e) {}
      });
    });
  }
  function mbRefresh(map) {
    map = map || window.map;
    if (!map) return;
    ["osm", "base-sat", "base-dark"].forEach((id) => { mbApplyRaster(map, id); });
    mbApplyVector(map);
  }
  function mbSet(v) {
    v = parseFloat(v);
    if (!isFinite(v)) v = MB_DEF;
    mbVal = Math.round(Math.max(MB_MIN, Math.min(MB_MAX, v)) * 100) / 100;
    try { localStorage.setItem(MB_KEY, String(mbVal)); } catch (e) {}
    mbRefresh();
    mbListen.slice().forEach((fn) => { try { fn(mbVal); } catch (e) {} });
    return mbVal;
  }
  function mbOnChange(fn) {
    if (typeof fn === "function") mbListen.push(fn);
    return fn;
  }
  var mapBrightness = { KEY: MB_KEY, MIN: MB_MIN, MAX: MB_MAX, DEF: MB_DEF,
    get: mbGet, set: mbSet, onChange: mbOnChange, refresh: mbRefresh };
  /* opt223: shared smooth field raster from a prebaked land/ocean-masked image (WebP/PNG).
   * Input: image URL(s) + geographic bounds. Output: MapLibre image source + linear-resampled
   * raster layer. LOD swaps ov→hi by zoom. Measured point samples stay as circles elsewhere. */
  function field(opts) {
    opts = opts || {};
    var id = opts.id || "field";
    var srcId = id + "-src";
    var lyrId = id + "-raster";
    var urls = opts.urls || {};
    var bounds = opts.bounds || [-180, -90, 180, 90];
    var cutZ = opts.cutZ != null ? opts.cutZ : 5;
    var opacity = opts.opacity != null ? opts.opacity : 0.78;
    var band = null;
    function coords() {
      var w = bounds[0], s = bounds[1], e = bounds[2], n = bounds[3];
      return [[w, n], [e, n], [e, s], [w, s]];
    }
    function pickUrl(z) {
      if (urls.hi && z >= cutZ) return urls.hi;
      return urls.ov || urls.hi;
    }
    function ensure(map) {
      if (!map) return;
      var z = map.getZoom ? map.getZoom() : 0;
      var url = pickUrl(z);
      if (!url) return;
      var want = (urls.hi && z >= cutZ) ? "hi" : "ov";
      if (!map.getSource(srcId)) {
        map.addSource(srcId, { type: "image", url: url, coordinates: coords() });
        band = want;
      } else if (band !== want) {
        try { map.getSource(srcId).updateImage({ url: url, coordinates: coords() }); band = want; } catch (e) {}
      }
      if (!map.getLayer(lyrId)) {
        map.addLayer({
          id: lyrId, type: "raster", source: srcId,
          paint: {
            "raster-opacity": opacity,
            "raster-resampling": "linear",
            "raster-fade-duration": 0
          }
        }, opts.before || before(map));
      } else {
        try { map.setPaintProperty(lyrId, "raster-opacity", opacity); } catch (e) {}
      }
    }
    function syncZoom(map) {
      if (!map || !map.getSource(srcId)) return;
      var z = map.getZoom();
      var want = (urls.hi && z >= cutZ) ? "hi" : "ov";
      if (want === band) return;
      var url = pickUrl(z);
      if (!url) return;
      try { map.getSource(srcId).updateImage({ url: url, coordinates: coords() }); band = want; } catch (e) {}
    }
    return { id: lyrId, src: srcId, ensure: ensure, syncZoom: syncZoom,
      vis: (map, on) => { vis(map, [lyrId], on); } };
  }
  var markerScale = { KEY: MS_KEY, MIN: MS_MIN, MAX: MS_MAX, DEF: MS_DEF,
    get: msGet, set: msSet, onChange: msOnChange, size: msSize, bind: msBind, refresh: msRefresh };
  window.SunnyKit = { legRamp: legRamp, legKeys: legKeys, grouped: grouped, gz: gz, kids: kids, markerScale: markerScale,
    mapBrightness: mapBrightness, field: field,
    size: size, overzoom: overzoom, uncapped: uncapped,
    esc: esc, show: show, card: card, before: before, vis: vis, getStore: getStore, putStore: putStore,
    loadJson: loadJson, tiles: tiles, overpass: overpass, fc: fc,
    zoomGate: zoomGate, setMinZoom: setMinZoom, zoomNote: zoomNote, lod: lod };
})();
