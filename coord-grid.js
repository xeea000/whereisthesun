// workspace/whereisthesun/coord-grid.js
/* SUNNY coordinate grid: latitude and longitude lines for the part of the map in view, spaced to suit the zoom,
 * labelled along the left and top edges. Computed in the browser, no download. Equator, tropics and polar circles are drawn thicker. */
(() => {
  "use strict";
  var L = window.SunnyLayers, K = window.SunnyKit;
  var IDS = ["grid-line", "grid-label"], STEPS = [30, 20, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05];
  var SPECIAL = { 0: "Equator", 23.44: "Tropic of Cancer", "-23.44": "Tropic of Capricorn", 66.56: "Arctic Circle", "-66.56": "Antarctic Circle" };
  var step = (map) => {
    var b = map.getBounds(), span = Math.min(b.getEast() - b.getWest(), 360) / (map.getContainer().clientWidth < 600 ? 3 : 6); /* opt158: phones get about 3 lines across */
    return STEPS.find((s) => s <= span) || STEPS[STEPS.length - 1];
  };
  var fmt = (v, ns) => {
    var a = Math.abs(v), t = +a.toFixed(2);
    return t + "°" + (v === 0 ? "" : ns ? (v > 0 ? "N" : "S") : (v > 0 ? "E" : "W"));
  };
  var build = (map) => {
    var b = map.getBounds(), s = step(map), f = [];
    var w = Math.max(b.getWest(), -540), e = Math.min(b.getEast(), 540), so = Math.max(b.getSouth(), -85), no = Math.min(b.getNorth(), 85);
    var dx = (e - w) * 0.03, dy = (no - so) * 0.1, n = 0;
    for (var y = Math.ceil(so / s) * s; y <= no && n < 200; y += s, n++) {
      var yy = +y.toFixed(4), ln = fmt(yy, true);
      f.push({ type: "Feature", properties: { k: yy === 0 ? 2 : 0, n: (yy === 0 ? "Equator " : "Latitude ") + ln }, geometry: { type: "LineString", coordinates: [[w, yy], [e, yy]] } });
      f.push({ type: "Feature", properties: { t: ln }, geometry: { type: "Point", coordinates: [w + dx, yy] } });
    }
    for (var x = Math.ceil(w / s) * s; x <= e && n < 400; x += s, n++) {
      var xx = +x.toFixed(4), wr = ((xx + 540) % 360) - 180, lo = fmt(+wr.toFixed(4), false);
      f.push({ type: "Feature", properties: { k: wr === 0 ? 1 : 0, n: (wr === 0 ? "Prime meridian " : "Longitude ") + lo }, geometry: { type: "LineString", coordinates: [[xx, so], [xx, no]] } });
      f.push({ type: "Feature", properties: { t: lo }, geometry: { type: "Point", coordinates: [xx, no - dy] } });
    }
    Object.keys(SPECIAL).forEach((k) => {
      var v = +k;
      if (v === 0 || v < so || v > no) return;
      f.push({ type: "Feature", properties: { k: 3, n: SPECIAL[k] + " " + fmt(v, true) }, geometry: { type: "LineString", coordinates: [[w, v], [e, v]] } });
    });
    return { type: "FeatureCollection", features: f };
  };
  var draw = (map) => {
    var g = build(map), src = map.getSource("grid");
    if (src) { src.setData(g); return; }
    map.addSource("grid", { type: "geojson", data: g, attribution: "Grid: computed" });
    map.addLayer({ id: "grid-line", type: "line", source: "grid", filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": ["match", ["get", "k"], 0, "rgba(40,60,90,0.45)", 3, "rgba(200,120,30,0.8)", "rgba(200,40,40,0.8)"],
        "line-width": ["match", ["get", "k"], 0, 0.8, 1.6] } }, K.before(map));
    map.addLayer({ id: "grid-label", type: "symbol", source: "grid", filter: ["==", ["geometry-type"], "Point"],
      layout: { "text-field": ["get", "t"], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-allow-overlap": true, "text-ignore-placement": true },
      paint: { "text-color": "#1d2b44", "text-halo-color": "rgba(255,255,255,0.85)", "text-halo-width": 1.4 } });
  };
  var on = false, hooked = false;
  var apply = (map, want) => {
    on = want;
    if (want) {
      try { draw(map); } catch (e) { setTimeout(() => { if (L.isOn("grid")) apply(map, true); }, 2000); return; } /* style not ready yet */
      if (!hooked) { hooked = true; map.on("moveend", () => { if (on) { try { draw(map); } catch (e) {} } }); }
    }
    K.vis(map, IDS, want);
  };
  L.add({ id: "grid", name: "Coordinate grid", icon: "🌐", group: "Earth", apply: apply,
    legend: K.legKeys([["rgba(40,60,90,0.6)", "line", "latitude and longitude lines; spacing follows the zoom"], ["rgba(200,40,40,0.8)", "line", "Equator and prime meridian"],
      ["rgba(200,120,30,0.8)", "line", "tropics and polar circles"]]),
    tip: "Latitude and longitude lines with edge labels. Computed, no download",
    attach: (map, want) => {
      (window.SunnyHoverName = window.SunnyHoverName || {})["grid-line"] = (f) => Promise.resolve([f.properties.n, "coordinate grid"]);
      apply(map, want);
    } });
})();
