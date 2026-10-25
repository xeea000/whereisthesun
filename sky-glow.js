// workspace/whereisthesun/sky-glow.js
/* SUNNY light pollution layer (opt91): NASA GIBS VIIRS Black Marble 2016 night lights,
 * public domain, keyless, CORS open. Bright = light-polluted sky, black = dark sky.
 * Raster at 70 % opacity under beaches, with a small legend. Off by default; the Settings
 * switch #toggle-skyglow saves the choice and the side button mirrors it. */
(function () {
  "use strict";
  var KEY = "sunny-skyglow";
  var SRC = "skyglow";
  var ID = "skyglow-raster";
  var URL = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png";
  var ATTRIB = 'Night lights: <a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">NASA GIBS</a> VIIRS Black Marble 2016 (public domain)';
  var map = null;
  var legend = null;
  function isOn() {
    var t = document.getElementById("toggle-skyglow");
    return !!(t && t.checked);
  }
  function beforeId() {
    var ids = ["obs-cluster", "craters-fill", "beaches-fill"];
    for (var i = 0; i < ids.length; i++) if (map.getLayer(ids[i])) return ids[i];
    return undefined;
  }
  function addLayer() {
    if (!map.getSource(SRC)) map.addSource(SRC, { type: "raster", tiles: [URL], tileSize: 256, maxzoom: 8, attribution: ATTRIB });
    if (!map.getLayer(ID)) map.addLayer({ id: ID, type: "raster", source: SRC, paint: { "raster-opacity": 0.7, "raster-fade-duration": 0 } }, beforeId());
  }
  function makeLegend() {
    legend = document.createElement("div");
    legend.id = "skyglow-legend";
    legend.innerHTML = '<span>Dark sky</span><i></i><span>Bright</span>';
    document.body.appendChild(legend);
  }
  function apply() {
    var on = isOn();
    if (!legend) makeLegend();
    legend.hidden = !on;
    if (!map) return;
    if (on) {
      try { addLayer(); } catch (eA) { return; }
    }
    if (map.getLayer(ID)) map.setLayoutProperty(ID, "visibility", on ? "visible" : "none");
  }
  function onToggle() {
    try { localStorage.setItem(KEY, isOn() ? "1" : "0"); } catch (eS) {}
    apply();
  }
  function onIdle() {
    if (isOn() !== !!(map.getLayer(ID) && map.getLayoutProperty(ID, "visibility") !== "none")) apply();
  }
  function attach(m) {
    map = m;
    map.on("load", apply);
    map.on("idle", onIdle);
    apply();
  }
  function init() {
    var t = document.getElementById("toggle-skyglow");
    if (t) {
      try { t.checked = localStorage.getItem(KEY) === "1"; } catch (eR) {}
      t.addEventListener("change", onToggle);
    }
    apply();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  window.SunnySkyGlow = { attach: attach, isOn: isOn };
})();
