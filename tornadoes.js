// workspace/whereisthesun/tornadoes.js
/* SUNNY tornado tracks: every EF3/F3 or stronger American tornado 1950-2024 (NOAA SPC Severe Weather Database, public domain),
 * drawn from touchdown to lift-off and coloured by rating; EF5 tornadoes carry a star. 56 KB gzipped, cached for good.
 * Gap: United States only; waterspouts are not in this database. */
(() => {
  "use strict";
  var L = window.SunnyLayers, K = window.SunnyKit;
  var SRC = ["NOAA SPC Severe Weather Database", "https://www.spc.noaa.gov/wcm/"];
  var EF = [[3, "#ffb347", "EF3 / F3"], [4, "#e53935", "EF4 / F4"], [5, "#b0006d", "EF5 / F5 (star)"]];
  var color = ["match", ["get", "m"], 3, EF[0][1], 4, EF[1][1], "#b0006d"];
  var IDS = ["torn-line", "torn-hit", "torn-dot", "torn-star"], TAPS = ["torn-hit", "torn-dot"];
  var feats = (g) => {
    return g.t.map((r, i) => {
      var a = [r[10] / 100, r[9] / 100], b = [r[12] / 100, r[11] / 100], same = a[0] === b[0] && a[1] === b[1];
      return { type: "Feature", properties: { i: i, m: r[0] }, geometry: same ? { type: "Point", coordinates: a } : { type: "LineString", coordinates: [a, b] } };
    });
  };
  var data = null;
  var apply = (map, on) => {
    K.vis(map, IDS, on);
    if (!on) return;
    K.loadJson("data/world/tornadoes.json").then((g) => {
      data = g;
      if (!map.getSource("torn")) map.addSource("torn", { type: "geojson", data: K.fc(feats(g)),
        attribution: 'Tornadoes: <a href="' + SRC[1] + '" target="_blank" rel="noopener">NOAA SPC</a>' });
      if (!map.getLayer("torn-line")) map.addLayer({ id: "torn-line", type: "line", source: "torn", filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-cap": "round" }, paint: { "line-color": color, "line-opacity": 0.85,
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, ["-", ["get", "m"], 2], 9, ["*", 2, ["get", "m"]]] } }, K.before(map));
      if (!map.getLayer("torn-hit")) map.addLayer({ id: "torn-hit", type: "line", source: "torn", filter: ["==", ["geometry-type"], "LineString"],
        paint: { "line-color": "#000", "line-width": 16, "line-opacity": 0 } }, K.before(map)); /* wide see-through strip so a thin track is easy to tap */
      if (!map.getLayer("torn-dot")) map.addLayer({ id: "torn-dot", type: "circle", source: "torn", filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-color": color, "circle-radius": 2.5, "circle-stroke-color": "#101418", "circle-stroke-width": 0.6 } }, K.before(map));
      if (!map.getLayer("torn-star")) map.addLayer({ id: "torn-star", type: "symbol", source: "torn", filter: ["==", ["get", "m"], 5],
        layout: { "text-field": "★", "text-font": ["Noto Sans Regular"], "text-size": 14, "text-allow-overlap": true, "symbol-placement": "point" },
        paint: { "text-color": "#ffd34d", "text-halo-color": "#000", "text-halo-width": 1 } });
      K.vis(map, IDS, L.isOn("tornadoes"));
    }).catch(() => {});
  };
  var title = (r) => {
    var d = new Date(Date.UTC(r[1], r[2] - 1, r[3])).toLocaleDateString([], { dateStyle: "medium", timeZone: "UTC" });
    return (r[1] < 2007 ? "F" : "EF") + r[0] + " tornado, " + d;
  };
  var hoverName = (f) => {
    var r = data && data.t[f.properties.i];
    return Promise.resolve(r ? [title(r), r[4] + " tornado track"] : ["Tornado track", ""]);
  };
  var card = (map, e) => {
    var r = data && data.t[e.features[0].properties.i];
    if (!r) return;
    K.show(map, e.lngLat, title(r), [r[4] + ", United States",
      "Path " + r[7] + " mi (" + Math.round(r[7] * 1.609) + " km) long, " + r[8] + " yd (" + Math.round(r[8] * 0.914) + " m) wide",
      r[5] + " killed, " + r[6] + " injured"], SRC);
  };
  L.add({ id: "tornadoes", name: "Tornado tracks (US)", icon: "🌪️", group: "Weather", taps: TAPS, dflt: true, apply: apply,
    legend: K.legKeys(EF.map((c) => { return [c[1], "line", c[2]]; })),
    tip: "Every EF3 or stronger US tornado 1950-2024, touchdown to lift-off (NOAA SPC). F scale before 2007",
    attach: (map, on) => {
      map.on("idle", () => { if (L.isOn("tornadoes") && !map.getLayer("torn-line")) apply(map, true); });
      var hn = window.SunnyHoverName = window.SunnyHoverName || {};
      TAPS.forEach((id) => { hn[id] = hoverName; map.on("click", id, (e) => { card(map, e); }); });
      apply(map, on);
    } });
})();
