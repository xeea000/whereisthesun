// workspace/whereisthesun/observatories.js
/* SUNNY sightseeing layer (opt90): telescopes and observatories worldwide.
 * Data: data/obs (points file plus detail shards, opt96) split from data/observatories.json, built once by tools/build-observatories.js from
 * OpenStreetMap (ODbL), plus Wikidata (CC0) radio arrays and neutrino, gravitational-wave
 * and cosmic-ray detectors via tools/build-astro-extra.js (opt91). Fetched only when the switch is first turned on. Sites cluster
 * when zoomed out; each site is a dot coloured by class (telescope, detector, Dark Sky place, stargazing site). Tap for name, type, size,
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
  var meta = null;
  var BASE = "data/obs/sites";
  /* opt96: only the tiny points file loads; a tap fetches that site's detail shard */
  function toGeo(d) {
    meta = d;
    return { type: "FeatureCollection", features: window.SunnyPoints.toFeatures(d).map((f) => { f.properties.cat = f.properties.k; return f; }) };
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
    if (!loading) loading = fetch(BASE + ".p.json?d=opt137").then(readJson).then(keep);
    return loading;
  }
  function beforeId() {
    var ids = ["beaches-fill", "beaches-line", "beaches-dot"];
    for (var i = 0; i < ids.length; i++) if (map.getLayer(ids[i])) return ids[i];
    return undefined;
  }
  function addLayers() {
    if (!map.getSource(SRC)) map.addSource(SRC, { type: "geojson", data: data, attribution: ATTRIB, cluster: window.SunnyKit.grouped(), clusterRadius: 36, clusterMaxZoom: 7 });
    var before = beforeId();
    if (!map.getLayer("obs-cluster")) {
      map.addLayer({ id: "obs-cluster", type: "circle", source: SRC, filter: ["has", "point_count"],
        paint: { "circle-color": "rgba(123,92,255,0.55)", "circle-stroke-color": "#fff", "circle-stroke-width": 1.2,
          "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 2, 7, 50, 13, 500, 20] } }, before);
    }
    if (!map.getLayer("obs-point")) {
      map.addLayer({ id: "obs-point", type: "circle", source: SRC, filter: pointFilter(),
        paint: { "circle-color": ["match", ["get", "cat"]].concat(CLS.map((c) => { return [c[0], c[2]]; }).flat(), ["#7b5cff"]),
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 3, 8, 6], "circle-stroke-color": "#fff", "circle-stroke-width": 1 } }, before);
    }
  }
  /* four classes, each with its own switch under the Observatories row (sunny-L-observatories-<class>) */
  var CLS = [["scope", "Telescope (optical or radio)", "#7b5cff"], ["detector", "Detector (neutrino, gravitational wave, cosmic ray)", "#11a3a3"],
    ["darksky", "Dark Sky Reserve or Park", "#1c2b6b"], ["stargaze", "Stargazing site or planetarium", "#ffd34d"]];
  /* opt199: kids via SunnyKit.kids (loaded before first refresh) */
  var OBS_KIDS = CLS.map((c) => { return { id: "observatories-" + c[0], dflt: true, code: c[0] }; });
  function pointFilter() {
    var KK = window.SunnyKit && window.SunnyKit.kids;
    var codes = KK ? KK.activeCodes(OBS_KIDS, (k) => { return k.code; }) : CLS.map((c) => { return c[0]; });
    var cat = KK ? KK.inFilter(["get", "cat"], codes) : ["in", ["get", "cat"], ["literal", codes]];
    return ["all", ["!", ["has", "point_count"]], cat];
  }
  function refresh() {
    if (map && map.getLayer("obs-point")) map.setFilter("obs-point", pointFilter());
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
    var ll = f.geometry.coordinates;
    var pp = new window.maplibregl.Popup({ closeButton: true, maxWidth: "260px", className: "pf-popup", offset: 12 });
    pp.setLngLat(ll).setHTML(window.SunnyPoints.skeleton("Observatory")).addTo(map);
    window.SunnyPoints.detail(BASE, meta, f.properties.i, "opt96").then((d) => {
      d.lon = ll[0];
      d.lat = ll[1];
      if (pp.isOpen()) pp.setHTML(popupHtml(d));
    }).catch(() => { if (pp.isOpen()) pp.setHTML('<div class="pf-now">Could not load details. Tap again when online.</div>'); });
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
    window.SunnyLeafName = window.SunnyLeafName || {}; /* opt172: names for small-cluster hover */
    window.SunnyLeafName[SRC] = (q) => { return meta ? window.SunnyPoints.detail(BASE, meta, q.i, "opt96").then((d) => d.name || "") : Promise.resolve(""); };
    var prev = window.SunnyHoverExt; /* hover shows the site's own name, the class as a hint */
    window.SunnyHoverExt = (f, upd) => {
      if (!f.layer || f.layer.id !== "obs-point") return prev ? prev(f, upd) : null;
      var c = CLS.find((x) => { return x[0] === f.properties.cat; }), hint = c ? c[1].split(" (")[0] : "Observatory";
      if (meta) window.SunnyPoints.detail(BASE, meta, f.properties.i, "opt96").then((d) => {
        upd("<b>" + esc(d.name || hint) + "</b><br><small>" + esc(hint + (d.type && d.type !== hint ? " · " + d.type : "")) + "</small>"); }).catch(() => {});
      return "<b>" + esc(hint) + "</b>";
    };
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
  window.SunnyObservatories = { attach: attach, popupHtml: popupHtml, refresh: refresh, CLS: CLS };
})();
