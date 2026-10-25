// workspace/whereisthesun/craters.js
/* SUNNY sightseeing layer (opt74): confirmed meteorite impact structures.
 * Data: data/impact-craters.json, from Wikipedia "List of impact structures on Earth"
 * (CC BY-SA 4.0, compiled largely from the Earth Impact Database, PASSC). Each crater is a
 * geodesic circle of its true diameter, so it scales with zoom, plus a 6 px centre dot so
 * small ones stay visible. Drawn above the cloud and radar map layers and below the beach
 * markers. Tap for name, diameter and age. Toggle: Settings, Sightseeing, Impact craters. */
(function () {
  "use strict";
  var KEY = "sunny-craters";
  var SRC = "craters";
  var ATTRIB = 'Craters: <a href="https://en.wikipedia.org/wiki/List_of_impact_structures_on_Earth" target="_blank" rel="noopener">Wikipedia</a> (CC BY-SA), Earth Impact Database';
  var R = 6371;
  var data = null;
  var loading = null;
  var map = null;
  var popup = null;
  function circle(lon, lat, radiusKm) {
    var ring = [];
    var a = radiusKm / R;
    var p1 = lat * Math.PI / 180;
    var l1 = lon * Math.PI / 180;
    for (var i = 0; i <= 64; i++) {
      var b = i / 64 * 2 * Math.PI;
      var p2 = Math.asin(Math.sin(p1) * Math.cos(a) + Math.cos(p1) * Math.sin(a) * Math.cos(b));
      var l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(a) * Math.cos(p1), Math.cos(a) - Math.sin(p1) * Math.sin(p2));
      ring.push([l2 * 180 / Math.PI, p2 * 180 / Math.PI]);
    }
    return ring;
  }
  function props(c) {
    return { name: c.name, diameter_km: c.diameter_km, age: c.age, country: c.country || "" };
  }
  function toGeo(d) {
    var feats = [];
    for (var i = 0; i < d.craters.length; i++) {
      var c = d.craters[i];
      feats.push({ type: "Feature", properties: props(c), geometry: { type: "Polygon", coordinates: [circle(c.lon, c.lat, c.diameter_km / 2)] } });
      feats.push({ type: "Feature", properties: props(c), geometry: { type: "Point", coordinates: [c.lon, c.lat] } });
    }
    return { type: "FeatureCollection", features: feats };
  }
  function readJson(res) {
    if (!res.ok) throw new Error("craters " + res.status);
    return res.json();
  }
  function keep(d) {
    data = toGeo(d);
    return data;
  }
  function load() {
    if (!loading) loading = fetch("data/impact-craters.json").then(readJson).then(keep);
    return loading;
  }
  function beforeId() {
    var ids = ["beaches-fill", "beaches-line", "beaches-dot"];
    for (var i = 0; i < ids.length; i++) if (map.getLayer(ids[i])) return ids[i];
    return undefined;
  }
  function addLayers() {
    if (!map.getSource(SRC)) map.addSource(SRC, { type: "geojson", data: data, attribution: ATTRIB });
    var before = beforeId();
    if (!map.getLayer("craters-fill")) {
      map.addLayer({ id: "craters-fill", type: "fill", source: SRC, filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#ff9a3c", "fill-opacity": 0.12 } }, before);
    }
    if (!map.getLayer("craters-line")) {
      map.addLayer({ id: "craters-line", type: "line", source: SRC, filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "line-color": "#ff9a3c", "line-width": 1.2, "line-opacity": 0.9 } }, before);
    }
    if (!map.getLayer("craters-dot")) {
      map.addLayer({ id: "craters-dot", type: "circle", source: SRC, filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-radius": 3, "circle-color": "#ff9a3c", "circle-stroke-color": "rgba(40,20,0,0.6)", "circle-stroke-width": 0.8 } }, before);
    }
  }
  /* keep the crater layers directly under the beach markers, above any weather layer */
  function keepOrder() {
    var before = beforeId();
    if (!before || !map.getLayer("craters-dot")) return;
    var ids = map.getStyle().layers.map(layerId);
    if (ids.indexOf(before) === ids.indexOf("craters-dot") + 1) return;
    ["craters-fill", "craters-line", "craters-dot"].forEach(moveOne.bind(null, before));
  }
  function layerId(l) {
    return l.id;
  }
  function moveOne(before, id) {
    map.moveLayer(id, before);
  }
  function setVisible(on) {
    ["craters-fill", "craters-line", "craters-dot"].forEach(setOne.bind(null, on));
  }
  function setOne(on, id) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }
  function isOn() {
    var t = document.getElementById("toggle-craters");
    return !!(t && t.checked);
  }
  function apply() {
    if (!map) return;
    if (!isOn()) {
      setVisible(false);
      return;
    }
    load().then(applyLoaded).catch(noop);
  }
  function applyLoaded() {
    if (!isOn()) return;
    try { addLayers(); } catch (eA) { return; }
    setVisible(true);
  }
  function noop() {}
  function esc(s) {
    return String(s).replace(/[&<>"]/g, escChar);
  }
  function escChar(c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  }
  function onClick(e) {
    var f = e.features && e.features[0];
    if (!f) return;
    var p = f.properties;
    var html = '<div class="pf-now"><span class="pf-facts"><b>' + esc(p.name) + "</b> impact crater<br>" +
      esc(p.diameter_km) + " km across<br>Age: " + esc(p.age) + (p.country ? "<br>" + esc(p.country) : "") +
      '</span></div><div class="pf-src">Source: <a href="https://en.wikipedia.org/wiki/Special:Search?search=' + encodeURIComponent(p.name + " crater") +
      '" target="_blank" rel="noopener">Wikipedia</a> · <a href="https://en.wikipedia.org/wiki/List_of_impact_structures_on_Earth" target="_blank" rel="noopener">impact list</a></div>';
    if (!popup) popup = new window.maplibregl.Popup({ closeButton: true, maxWidth: "260px", className: "pf-popup", offset: 8 });
    popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
  }
  function onIdle() {
    if (!isOn()) {
      setVisible(false);
      return;
    }
    if (!map.getLayer("craters-dot")) apply();
    else keepOrder();
  }
  function onToggle() {
    try { localStorage.setItem(KEY, isOn() ? "1" : "0"); } catch (eS) {}
    apply();
  }
  function attach(m) {
    map = m;
    var t = document.getElementById("toggle-craters");
    if (t) {
      try { t.checked = localStorage.getItem(KEY) === "1"; } catch (eR) {}
      t.addEventListener("change", onToggle);
    }
    map.on("click", "craters-fill", onClick);
    map.on("click", "craters-dot", onClick);
    map.on("load", apply);
    map.on("idle", onIdle);
    apply();
  }
  window.SunnyCraters = { attach: attach };
})();
