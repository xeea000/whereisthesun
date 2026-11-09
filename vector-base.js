// workspace/whereisthesun/vector-base.js
/* SUNNY vector base map (opt88, Data saver "Vector base map"). Roads and Dark draw from
 * OpenFreeMap vector tiles (free, no key) instead of OSM and CARTO picture tiles. Vector tiles
 * are smaller and stay sharp at every zoom. Layers come from the OpenFreeMap Liberty and Dark
 * styles, minus icons, patterns and the shaded relief pictures. The tile source id "ofm" is the
 * same one the Labels overlay uses, so both share one set of tiles. Satellite stays a picture map. */
(function () {
  "use strict";
  /* opt246: one table of base themes. Their style files start downloading when this script runs, and only the
   * theme on screen gets its layers; another theme's layers are added the first time it is picked. */
  var STYLES = { roads: "https://tiles.openfreemap.org/styles/liberty", dark: "https://tiles.openfreemap.org/styles/dark" };
  var GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
  var CHUNK = 20;
  var ids = {};
  var styleJson = {};
  var added = {};
  var done = {};
  var ready = false;
  var wanted = "roads";
  Object.keys(STYLES).forEach((m) => { ids[m] = []; });
  function enabled() {
    return !!(window.SunnyDataSaver && window.SunnyDataSaver.on("vector"));
  }
  function active(mode) {
    return enabled() && (mode === "roads" || mode === "dark");
  }
  function usable(layer) {
    if (layer.source && layer.source !== "openmaptiles") return false;
    var lay = layer.layout || {};
    var paint = layer.paint || {};
    if (lay["icon-image"] || paint["fill-pattern"] || paint["line-pattern"]) return false;
    return true;
  }
  function styleOf(mode) {
    if (!styleJson[mode]) {
      styleJson[mode] = getJson(STYLES[mode]);
      styleJson[mode].catch(() => { delete styleJson[mode]; });
    }
    return styleJson[mode];
  }
  function nextTurn(fn) {
    if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 200 });
    else setTimeout(fn, 0);
  }
  /* A theme's layers go in CHUNK at a time, hidden, so no single task is long; apply() shows them when all are in */
  function addLayers(map, mode, style) {
    var before = map.getLayer("osm") ? "osm" : undefined;
    var list = style.layers.filter(usable);
    return new Promise((resolve) => {
      var i = 0;
      function some() {
        var end = Math.min(list.length, i + CHUNK);
        for (; i < end; i++) {
          var copy = Object.assign({}, list[i], { id: "vb-" + mode + "-" + list[i].id });
          if (copy.source) copy.source = "ofm";
          copy.layout = Object.assign({}, copy.layout, { visibility: "none" });
          try {
            map.addLayer(copy, before);
            ids[mode].push(copy.id);
          } catch (e) {}
        }
        if (i < list.length) nextTurn(some);
        else resolve();
      }
      some();
    });
  }
  function ensureTheme(map, mode) {
    if (!STYLES[mode]) return Promise.resolve();
    if (!added[mode]) {
      added[mode] = styleOf(mode).then((style) => addLayers(map, mode, style)).then(() => { done[mode] = true; });
      added[mode].catch(() => { delete added[mode]; });
    }
    return added[mode];
  }
  function apply(mode) {
    wanted = mode;
    var map = window.map;
    if (!ready || !map) return;
    if (active(mode) && !done[mode]) {
      ensureTheme(map, mode).then(() => { if (wanted === mode) apply(mode); }).catch(fallback);
      return;
    }
    Object.keys(STYLES).forEach((m) => {
      var vis = active(mode) && m === mode ? "visible" : "none";
      ids[m].forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
      });
    });
    if (window.SunnyKit && window.SunnyKit.mapBrightness) try { window.SunnyKit.mapBrightness.refresh(map); } catch (e) {}
  }
  function getJson(url) {
    return fetch(url).then((r) => r.json());
  }
  function install(map) {
    try {
      map.setGlyphs(GLYPHS);
    } catch (e) {}
    var OFM = "https://tiles.openfreemap.org/planet", low = window.SunnyDataSaver && window.SunnyDataSaver.low();
    /* Low data: tiles stop at zoom 12 and are drawn larger beyond it */
    var src = low ? getJson(OFM).then((j) => { return { type: "vector", tiles: j.tiles, minzoom: 0, maxzoom: 12, attribution: "OpenFreeMap · OSM" }; })
      .catch(() => { return { type: "vector", url: OFM, attribution: "OpenFreeMap · OSM" }; }) : Promise.resolve({ type: "vector", url: OFM, attribution: "OpenFreeMap · OSM" });
    return src.then((o) => { if (!map.getSource("ofm")) map.addSource("ofm", o); return ensureTheme(map, wanted); }).then(() => {
      ready = true;
      apply(wanted);
    });
  }
  function start(map) {
    if (!enabled() || !map) return;
    if (map.isStyleLoaded()) install(map).catch(fallback);
    else map.once("load", () => install(map).catch(fallback));
  }
  /* If OpenFreeMap fails, go back to the picture map for this visit */
  function fallback() {
    ready = false;
    window.SunnyVectorBase.active = () => false;
    try {
      window.applyBaseMap();
    } catch (e) {}
  }
  if (enabled()) Object.keys(STYLES).forEach(styleOf);
  window.SunnyVectorBase = { start: start, apply: apply, active: active };
})();
