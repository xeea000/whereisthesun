// workspace/whereisthesun/ocean-garbage.js
/* SUNNY opt218: ocean garbage patches (Human impact / Ocean).
 * Great Pacific Garbage Patch: approximate extent (Lebreton 2018) — published study
 * region 120–160°W, 20–45°N. Shapefile mirrors unavailable at build time.
 * The Ocean Cleanup live operations: unavailable (no free keyless live feed).
 * Other gyres omitted until a published outline is sourced. Off by default; lazy. */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers;
  if (!K || !L) return;
  var SRC = "ocean-garbage", FILL = "ocean-garbage-fill", LINE = "ocean-garbage-line", DOT = "ocean-garbage-dot";
  var feats = null, loading = null, pMap = null;
  var ATTRIB = 'Ocean garbage: approximate extent (Lebreton 2018) — <a href="https://www.nature.com/articles/s41598-018-22939-w" target="_blank" rel="noopener">Lebreton et al. Sci Rep</a>';
  function toFeats(d) {
    var out = [];
    (d.patches || []).forEach((p) => {
      var props = {
        id: p.id, name: p.name, label: p.label || "approximate extent",
        area: p.area_km2 || 0, note: p.source || "", cleanup: d.cleanup_live || "unavailable"
      };
      out.push({ type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: [p.ring] } });
      var b = p.bbox;
      var lon = (b[0] + b[2]) / 2, lat = (b[1] + b[3]) / 2;
      out.push({ type: "Feature", properties: props, geometry: { type: "Point", coordinates: [lon, lat] } });
    });
    return out;
  }
  function load() {
    if (!loading) {
      loading = K.loadJson("data/human/ocean-garbage.json?v=2ab2548c").then((d) => {
        feats = toFeats(d);
        return feats;
      });
    }
    return loading;
  }
  function ensure(map) {
    if (!map.getSource(SRC)) {
      map.addSource(SRC, { type: "geojson", data: K.fc(feats), attribution: ATTRIB });
    }
    if (!map.getLayer(FILL)) {
      map.addLayer({
        id: FILL, type: "fill", source: SRC,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#f59e0b", "fill-opacity": 0.14 }
      }, K.before(map));
    }
    if (!map.getLayer(LINE)) {
      map.addLayer({
        id: LINE, type: "line", source: SRC,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "line-color": "#fbbf24", "line-width": 1.6, "line-opacity": 0.9, "line-dasharray": [3, 2] }
      }, K.before(map));
    }
    if (!map.getLayer(DOT)) {
      map.addLayer({
        id: DOT, type: "circle", source: SRC,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-color": "#f59e0b",
          "circle-radius": K.markerScale.bind(map, DOT, "circle-radius", K.size({ stops: [[1, 4], [6, 6], [12, 8]] })),
          "circle-opacity": 0.85,
          "circle-stroke-color": "rgba(60,30,0,0.55)",
          "circle-stroke-width": 0.8
        }
      }, K.before(map));
    }
  }
  function card(map, e) {
    var p = e.features[0].properties;
    var rows = [p.label || "approximate extent"];
    if (p.area) rows.push("~" + Math.round(p.area / 1e4) / 100 + " M km² (published study region)");
    rows.push("The Ocean Cleanup live: " + (p.cleanup || "unavailable"));
    if (p.note) rows.push(p.note);
    K.show(map, e.lngLat, p.name, rows,
      ["Lebreton et al. 2018", "https://www.nature.com/articles/s41598-018-22939-w"]);
  }
  function apply(map, on) {
    pMap = map;
    if (!on) { K.vis(map, [FILL, LINE, DOT], false); return; }
    load().then(() => {
      ensure(map);
      K.vis(map, [FILL, LINE, DOT], L.isOn("oceangarbage"));
    }).catch(() => {});
  }
  L.add({
    id: "oceangarbage", name: "Ocean garbage patches", icon: "🫧", group: "Human impact",
    dflt: false, taps: [FILL, LINE, DOT],
    tip: "Great Pacific Garbage Patch approximate extent (Lebreton 2018). Ocean Cleanup live unavailable. Other gyres only when sourced",
    legend: K.legKeys([
      ["#f59e0b", "area", "approximate extent (Lebreton 2018)"]
    ]) + '<div class="ls-row"><small>GPGP study region 120–160°W, 20–45°N. Shapefile unavailable. Ocean Cleanup live: unavailable. Other gyres omitted (unsourced).</small></div>',
    note: () => { return L.isOn("oceangarbage") ? "GPGP approx · Cleanup unavailable" : ""; },
    apply: apply,
    attach: (map, on) => {
      pMap = map;
      map.on("idle", () => {
        if (!L.isOn("oceangarbage")) return;
        if (!map.getLayer(FILL)) apply(map, true);
      });
      map.on("click", FILL, (e) => { card(map, e); });
      map.on("click", DOT, (e) => { card(map, e); });
      (window.SunnyHoverName = window.SunnyHoverName || {})[DOT] = (f) =>
        Promise.resolve([f.properties.name, f.properties.label || ""]);
      apply(map, on);
    }
  });
})();
