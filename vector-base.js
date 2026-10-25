// workspace/whereisthesun/vector-base.js
/* SUNNY vector base map (opt88, Data saver "Vector base map"). Roads and Dark draw from
 * OpenFreeMap vector tiles (free, no key) instead of OSM and CARTO picture tiles. Vector tiles
 * are smaller and stay sharp at every zoom. Layers come from the OpenFreeMap Liberty and Dark
 * styles, minus icons, patterns and the shaded relief pictures. The tile source id "ofm" is the
 * same one the Labels overlay uses, so both share one set of tiles. Satellite stays a picture map. */
(function () {
  "use strict";
  var STYLES = { roads: "https://tiles.openfreemap.org/styles/liberty", dark: "https://tiles.openfreemap.org/styles/dark" };
  var GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
  var ids = { roads: [], dark: [] };
  var ready = false;
  var wanted = "roads";
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
  function addLayers(map, mode, style) {
    var before = map.getLayer("osm") ? "osm" : undefined;
    style.layers.filter(usable).forEach((layer) => {
      var copy = JSON.parse(JSON.stringify(layer));
      copy.id = "vb-" + mode + "-" + layer.id;
      if (copy.source) copy.source = "ofm";
      copy.layout = copy.layout || {};
      copy.layout.visibility = "none";
      try {
        map.addLayer(copy, before);
        ids[mode].push(copy.id);
      } catch (e) {}
    });
  }
  function apply(mode) {
    wanted = mode;
    var map = window.map;
    if (!ready || !map) return;
    ["roads", "dark"].forEach((m) => {
      var vis = active(mode) && m === mode ? "visible" : "none";
      ids[m].forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
      });
    });
  }
  function getJson(url) {
    return fetch(url).then((r) => r.json());
  }
  function install(map) {
    try {
      map.setGlyphs(GLYPHS);
    } catch (e) {}
    if (!map.getSource("ofm")) map.addSource("ofm", { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: "OpenFreeMap · OSM" });
    return Promise.all([getJson(STYLES.roads), getJson(STYLES.dark)]).then((styles) => {
      addLayers(map, "roads", styles[0]);
      addLayers(map, "dark", styles[1]);
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
  window.SunnyVectorBase = { start: start, apply: apply, active: active };
})();
