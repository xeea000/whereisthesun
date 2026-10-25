// workspace/whereisthesun/observatories.js
/* SUNNY sightseeing layer (opt90): telescopes and observatories worldwide.
 * Data: data/observatories.json, built once by tools/build-observatories.js from
 * OpenStreetMap (ODbL), plus Wikidata (CC0) radio arrays and neutrino, gravitational-wave
 * and cosmic-ray detectors via tools/build-astro-extra.js (opt91). Fetched only when the switch is first turned on. Sites cluster
 * when zoomed out; each site is a small telescope icon. Tap for name, type, size,
 * operator and link. Toggle: Settings, Sightseeing, Observatories. */
(function () {
  "use strict";
  var KEY = "sunny-observatories";
  var SRC = "observatories";
  var IDS = ["obs-cluster", "obs-point"];
  var ATTRIB = 'Observatories: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> (ODbL), <a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a> (CC0)';
  var data = null;
  var loading = null;
  var map = null;
  var popup = null;
  function toGeo(d) {
    var feats = [];
    for (var i = 0; i < d.sites.length; i++) {
      var s = d.sites[i];
      feats.push({ type: "Feature", properties: s, geometry: { type: "Point", coordinates: [s.lon, s.lat] } });
    }
    return { type: "FeatureCollection", features: feats };
  }
  function readJson(res) {
    if (!res.ok) throw new Error("observatories " + res.status);
    return res.json();
  }
  function keep(d) {
    data = toGeo(d);
    return data;
  }
  function load() {
    if (!loading) loading = fetch("data/observatories.json?d=opt95").then(readJson).then(keep);
    return loading;
  }
  /* a 22 px detector glyph for neutrino, gravitational-wave and cosmic-ray sites: teal disc, white rings */
  function detectorIcon() {
    var c = document.createElement("canvas");
    c.width = 44;
    c.height = 44;
    var g = c.getContext("2d");
    g.fillStyle = "#11a3a3";
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(22, 22, 20, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.strokeStyle = "#fff";
    g.lineWidth = 2.5;
    [6, 12].forEach(ring.bind(null, g));
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(22, 22, 2.5, 0, Math.PI * 2);
    g.fill();
    return g.getImageData(0, 0, 44, 44);
  }
  function ring(g, r) {
    g.beginPath();
    g.arc(22, 22, r, 0, Math.PI * 2);
    g.stroke();
  }
  /* a 22 px telescope glyph: tube on a tripod, white on violet */
  function icon() {
    var c = document.createElement("canvas");
    c.width = 44;
    c.height = 44;
    var g = c.getContext("2d");
    g.fillStyle = "#7b5cff";
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(22, 22, 20, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = "#fff";
    g.save();
    g.translate(22, 18);
    g.rotate(-0.5);
    g.fillRect(-12, -4, 22, 8);
    g.fillRect(10, -5, 4, 10);
    g.restore();
    g.lineWidth = 2.5;
    g.strokeStyle = "#fff";
    g.beginPath();
    g.moveTo(22, 20);
    g.lineTo(15, 34);
    g.moveTo(22, 20);
    g.lineTo(29, 34);
    g.stroke();
    return g.getImageData(0, 0, 44, 44);
  }
  function beforeId() {
    var ids = ["beaches-fill", "beaches-line", "beaches-dot"];
    for (var i = 0; i < ids.length; i++) if (map.getLayer(ids[i])) return ids[i];
    return undefined;
  }
  function addLayers() {
    if (!map.hasImage("obs-icon")) map.addImage("obs-icon", icon(), { pixelRatio: 2 });
    if (!map.hasImage("obs-detector")) map.addImage("obs-detector", detectorIcon(), { pixelRatio: 2 });
    if (!map.getSource(SRC)) map.addSource(SRC, { type: "geojson", data: data, attribution: ATTRIB, cluster: true, clusterRadius: 36, clusterMaxZoom: 7 });
    var before = beforeId();
    if (!map.getLayer("obs-cluster")) {
      map.addLayer({ id: "obs-cluster", type: "circle", source: SRC, filter: ["has", "point_count"],
        paint: { "circle-color": "rgba(123,92,255,0.55)", "circle-stroke-color": "#fff", "circle-stroke-width": 1.2,
          "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 2, 7, 50, 13, 500, 20] } }, before);
    }
    if (!map.getLayer("obs-point")) {
      map.addLayer({ id: "obs-point", type: "symbol", source: SRC, filter: ["!", ["has", "point_count"]],
        layout: { "icon-image": ["match", ["get", "cat"], ["neutrino", "gravitational-wave", "cosmic-ray"], "obs-detector", "obs-icon"], "icon-size": 1, "icon-allow-overlap": true } }, before);
    }
  }
  function keepOrder() {
    var before = beforeId();
    if (!before || !map.getLayer("obs-point")) return;
    var ids = map.getStyle().layers.map(layerId);
    if (ids.indexOf(before) === ids.indexOf("obs-point") + 1) return;
    IDS.forEach(moveOne.bind(null, before));
  }
  function layerId(l) {
    return l.id;
  }
  function moveOne(before, id) {
    map.moveLayer(id, before);
  }
  function setVisible(on) {
    IDS.forEach(setOne.bind(null, on));
    if (!on && popup) popup.remove();
  }
  function setOne(on, id) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }
  function isOn() {
    var t = document.getElementById("toggle-observatories");
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
  var CAT_TEXT = { optical: "Optical", radio: "Radio astronomy", neutrino: "Neutrino detector",
    "gravitational-wave": "Gravitational-wave detector", "cosmic-ray": "Cosmic-ray detector" };
  var KIND_NO_CAT = { planetarium: 1, "dark-sky": 1, "observing-site": 1 };
  function kindText(p) {
    if (p.cat && p.cat !== "optical" && p.cat !== "radio") return CAT_TEXT[p.cat];
    if (p.kind === "observatory") return "Observatory";
    if (p.kind === "array") return "Telescope site";
    if (p.kind === "planetarium") return "Planetarium";
    if (p.kind === "dark-sky") return "Dark-sky site";
    if (p.kind === "observing-site") return "Stargazing site";
    return "Telescope";
  }
  function popupHtml(p) {
    var rows = ["<b>" + esc(p.name || "Unnamed " + kindText(p).toLowerCase()) + "</b>", kindText(p)];
    if ((p.cat === "radio" || p.cat === "optical") && !KIND_NO_CAT[p.kind]) rows.push("Kind: " + CAT_TEXT[p.cat]);
    if (p.type) rows.push("Type: " + esc(p.type));
    if (p.note) rows.push("<i>" + esc(p.note) + "</i>");
    if (p.diameter_m && p.diameter_m !== "null") rows.push("Largest dish/mirror: " + esc(p.diameter_m) + " m");
    if (p.scopes > 1) rows.push(esc(p.scopes) + " telescopes mapped here");
    if (p.operator) rows.push("Operator: " + esc(p.operator));
    if (p.link) rows.push('<a href="' + esc(p.link) + '" target="_blank" rel="noopener">More info</a>');
    return '<div class="pf-now"><span class="pf-facts">' + rows.join("<br>") + "</span></div>" + srcHtml(p);
  }
  function srcHtml(p) {
    var a = '" target="_blank" rel="noopener">';
    var s = p.qid ? '<a href="https://www.wikidata.org/wiki/' + esc(p.qid) + a + "Wikidata " + esc(p.qid) + "</a>"
      : p.link ? '<a href="' + esc(p.link) + a + "Site record</a>"
      : '<a href="https://www.openstreetmap.org/#map=17/' + (+p.lat).toFixed(5) + "/" + (+p.lon).toFixed(5) + a + "OpenStreetMap</a>";
    return '<div class="pf-src">Source: ' + s + "</div>";
  }
  function onClick(e) {
    var f = e.features && e.features[0];
    if (!f) return;
    if (!popup) popup = new window.maplibregl.Popup({ closeButton: true, maxWidth: "260px", className: "pf-popup", offset: 12 });
    popup.setLngLat(f.geometry.coordinates).setHTML(popupHtml(f.properties)).addTo(map);
  }
  function onCluster(e) {
    var f = e.features && e.features[0];
    if (!f) return;
    map.easeTo({ center: f.geometry.coordinates, zoom: map.getZoom() + 2 });
  }
  function onIdle() {
    if (!isOn()) {
      setVisible(false);
      return;
    }
    if (!map.getLayer("obs-point")) apply();
    else keepOrder();
  }
  function onToggle() {
    try { localStorage.setItem(KEY, isOn() ? "1" : "0"); } catch (eS) {}
    apply();
  }
  function attach(m) {
    map = m;
    var t = document.getElementById("toggle-observatories");
    if (t) {
      try { t.checked = localStorage.getItem(KEY) === "1"; } catch (eR) {}
      t.addEventListener("change", onToggle);
    }
    map.on("click", "obs-point", onClick);
    map.on("click", "obs-cluster", onCluster);
    map.on("load", apply);
    map.on("idle", onIdle);
    apply();
  }
  window.SunnyObservatories = { attach: attach, popupHtml: popupHtml };
})();
