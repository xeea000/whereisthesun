// workspace/whereisthesun/crown-land.js
/* SUNNY Crown Land overlay (opt75). Ontario only.
 * Source: Ontario Ministry of Natural Resources, Land Information Ontario (LIO),
 * "Crown Land Use Policy Area (Provincial)" (CLUPA Provincial), LIO_Open06 MapServer layer 5.
 * Licence: Open Government Licence - Ontario. Free, keyless, CORS-enabled ArcGIS REST export.
 * Drawn as a semi-transparent green raster under the crater and beach layers.
 * Tap the map while it is on to see the designation (ArcGIS identify).
 * Note from the publisher: not an authoritative source for Crown, private or park boundaries. */
(function () {
  "use strict";
  var KEY = "sunny-crown";
  var SRC = "crown-land";
  var LAYER = "crown-land";
  var BASE = "https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open06/MapServer";
  var ATTRIB = 'Crown land (Ontario): <a href="https://geohub.lio.gov.on.ca/datasets/lio::crown-land-use-policy-area-provincial/about" target="_blank" rel="noopener">LIO CLUPA</a>, ' +
    '<a href="https://www.ontario.ca/page/open-government-licence-ontario" target="_blank" rel="noopener">OGL-Ontario</a>';
  var STYLE = [{ id: 5, source: { type: "mapLayer", mapLayerId: 5 }, drawingInfo: { renderer: { type: "simple",
    symbol: { type: "esriSFS", style: "esriSFSSolid", color: [30, 170, 60, 160],
      outline: { type: "esriSLS", style: "esriSLSSolid", color: [20, 110, 40, 220], width: 0.6 } } } } }];
  var map = null;
  var on = false;
  var popup = null;
  function tileUrl() {
    return BASE + "/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image&dynamicLayers=" +
      encodeURIComponent(JSON.stringify(STYLE));
  }
  function beforeId() {
    var ids = ["craters-fill", "beaches-fill", "beaches-line", "beaches-dot"];
    for (var i = 0; i < ids.length; i++) if (map.getLayer(ids[i])) return ids[i];
    return undefined;
  }
  function addLayer() {
    if (!map.getSource(SRC)) {
      map.addSource(SRC, { type: "raster", tiles: [tileUrl()], tileSize: 256, minzoom: 3, maxzoom: 14,
        bounds: [-95.2, 41.6, -74.3, 56.9], attribution: ATTRIB });
    }
    if (!map.getLayer(LAYER)) map.addLayer({ id: LAYER, type: "raster", source: SRC, paint: { "raster-opacity": 0.85 } }, beforeId());
  }
  function apply() {
    if (!map || !map.isStyleLoaded()) return;
    if (on) addLayer();
    if (map.getLayer(LAYER)) map.setLayoutProperty(LAYER, "visibility", on ? "visible" : "none");
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, escChar);
  }
  function escChar(c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  }
  function readJson(res) {
    return res.json();
  }
  function noop() {}
  function isOn() {
    return on;
  }
  function showHit(lngLat, data) {
    var r = data && data.results && data.results[0];
    if (!r) return;
    var a = r.attributes || {};
    var html = '<div class="pf-now"><span class="pf-facts"><b>' + esc(a.NAME_ENG) + "</b><br>" + esc(a.DESIGNATION_ENG) +
      (a.POLICY_IDENT ? "<br>Policy " + esc(a.POLICY_IDENT) : "") + '</span></div><div class="pf-src">Ontario CLUPA (LIO), OGL-Ontario</div>';
    if (!popup) popup = new window.maplibregl.Popup({ closeButton: true, maxWidth: "260px", className: "pf-popup", offset: 8 });
    popup.setLngLat(lngLat).setHTML(html).addTo(map);
  }
  function onClick(e) {
    if (!on || map.queryRenderedFeatures(e.point).some(isMarker)) return;
    var b = map.getBounds();
    var c = map.getCanvas();
    var q = "geometry=" + e.lngLat.lng + "," + e.lngLat.lat + "&geometryType=esriGeometryPoint&sr=4326&layers=all:5&tolerance=2" +
      "&mapExtent=" + [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(",") +
      "&imageDisplay=" + c.clientWidth + "," + c.clientHeight + ",96&returnGeometry=false&f=json";
    fetch(BASE + "/identify?" + q).then(readJson).then(showHit.bind(null, e.lngLat)).catch(noop);
  }
  function isMarker(f) {
    return /^(beaches|craters)-/.test(f.layer.id);
  }
  function set(v) {
    on = !!v;
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (eS) {}
    apply();
    document.dispatchEvent(new CustomEvent("sunny-crown", { detail: on }));
  }
  function attach(m) {
    map = m;
    try { on = localStorage.getItem(KEY) === "1"; } catch (eR) {}
    map.on("load", apply);
    map.on("styledata", apply);
    map.on("click", onClick);
    apply();
  }
  window.SunnyCrownLand = { attach: attach, set: set, isOn: isOn };
})();
