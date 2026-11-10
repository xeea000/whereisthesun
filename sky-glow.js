// workspace/whereisthesun/sky-glow.js
/* SUNNY light pollution layer (opt91): NASA GIBS VIIRS Black Marble 2016 night lights,
 * public domain, keyless, CORS open. Bright = light-polluted sky, black = dark sky.
 * Raster at 70 % opacity under beaches, with a small legend. Off by default; the Dark sky
 * layer row saves the choice (t396u: no hidden switch). */
(function () {
  "use strict";
  var K = window.SunnyKit;
  var KEY = "sunny-skyglow";
  var SRC = "skyglow";
  var ID = "skyglow-raster";
  /* opt241: same NASA layer and date through GIBS WMS as JPEG (about 8 KB a tile instead of about 90 KB as PNG) */
  var URL = "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=VIIRS_Black_Marble" +
    "&STYLES=&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/jpeg&TIME=2016-01-01";
  var ATTRIB = 'Night lights: <a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">NASA GIBS</a> VIIRS Black Marble 2016 (public domain)';
  var map = null;
  var legend = null;
  function isOn() {
    try { return localStorage.getItem(KEY) === "1"; } catch (eR) { return false; }
  }
  /* the night-lights tint sits above the base map, the cloud pictures, the night shade and the night-sky squares (they hid it),
   * and under every other overlay */
  var COVER = /^(gibs|iem-vis|light-cloud|lc-|sky-night|sky-grid|shower-band)/;
  function beforeId() {
    var ls = map.getStyle().layers || [], from = 0;
    ls.forEach((l, i) => { if (COVER.test(l.id) || l.type === "background" || l.source === "ofm") from = i + 1; });
    for (var i = from; i < ls.length; i++) if (ls[i].id !== ID && !COVER.test(ls[i].id)) return ls[i].id;
    return undefined;
  }
  function keepLow() {
    if (!map || !map.getLayer(ID)) return;
    var ls = map.getStyle().layers, me = ls.findIndex((l) => l.id === ID), b = beforeId();
    var bi = b ? ls.findIndex((l) => l.id === b) : ls.length;
    var low = ls.some((l, i) => { return i > me && (COVER.test(l.id) || l.type === "background" || l.source === "ofm"); });
    if (low || bi !== me + 1) map.moveLayer(ID, b);
  }
  function addLayer() {
    var ts = window.SunnyDataSaver && window.SunnyDataSaver.low() ? 512 : 256;
    if (!map.getSource(SRC)) map.addSource(SRC, K.overzoom({ type: "raster", tiles: [URL], tileSize: ts, attribution: ATTRIB }, 8));
    if (!map.getLayer(ID)) map.addLayer({ id: ID, type: "raster", source: SRC, paint: { "raster-opacity": 0.7, "raster-fade-duration": 0 } }, beforeId());
    K.uncapped(map, [ID]);
    if (!map._sgLow) { map._sgLow = true; map.on("idle", keepLow); }
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
    apply();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  window.SunnySkyGlow = { attach: attach, isOn: isOn, apply: apply };
})();
