// workspace/whereisthesun/flight-time.js
/* SUNNY opt121 Travel: flight time from the pin. Colour bands of rough nonstop flight hours from the dropped pin, measured along
 * the curved Earth (great circle), so the bands bend on the flat map. Hours = 0.5 h for take-off and landing + distance / 830 km/h.
 * Drawn from a 2 degree grid worked out on the phone, no data. Hours are in the legend only, with no lettering on the map. */
(() => {
  "use strict";
  var K = window.SunnyKit;
  var L = window.SunnyLayers;
  if (!K || !L) return;
  var BANDS = [[1, "#1a9850"], [2, "#66bd63"], [3, "#a6d96a"], [4, "#d9ef8b"], [6, "#fee08b"], [8, "#fdae61"], [10, "#f46d43"], [12, "#d73027"],
    [15, "#a50026"], [99, "#5e0019"]];
  var STEP = 2, R = 6371, SPEED = 830;
  var last = "";
  var hours = (la1, lo1, la2, lo2) => {
    var r = Math.PI / 180, a = Math.sin((la2 - la1) * r / 2), b = Math.sin((lo2 - lo1) * r / 2);
    var h = a * a + Math.cos(la1 * r) * Math.cos(la2 * r) * b * b;
    return 0.5 + 2 * R * Math.asin(Math.min(1, Math.sqrt(h))) / SPEED;
  };
  var band = (h) => { for (var i = 0; i < BANDS.length; i++) if (h <= BANDS[i][0]) return i; return BANDS.length - 1; };
  var grid = (o) => {
    var f = [];
    var add = (b, a, z, la) => {
      var ring = [[a, la], [z, la], [z, la + STEP], [a, la + STEP], [a, la]];
      f.push({ type: "Feature", properties: { b: b }, geometry: { type: "Polygon", coordinates: [ring] } });
    };
    for (var la = -84; la < 84; la += STEP) {
      var run = -180, cur = -1;
      for (var lo = -180; lo <= 180; lo += STEP) {
        var b = lo < 180 ? band(hours(o.lat, o.lon, la + STEP / 2, lo + STEP / 2)) : -2;
        if (b !== cur) { if (cur >= 0) add(cur, run, lo, la); run = lo; cur = b; }
      }
    }
    return { type: "FeatureCollection", features: f };
  };
  var origin = () => { return typeof sunnyApp_origin !== "undefined" && sunnyApp_origin ? sunnyApp_origin : null; };
  var colour = ["match", ["get", "b"]];
  BANDS.forEach((b, i) => { colour.push(i, b[1]); });
  colour.push("#000");
  function apply(map, on) {
    K.vis(map, ["flight-band"], on);
    var o = origin();
    if (!on || !o) return;
    var key = o.lat.toFixed(2) + "," + o.lon.toFixed(2);
    try {
      if (!map.getSource("flight-band")) map.addSource("flight-band", { type: "geojson", data: grid(o) });
      else if (key !== last) map.getSource("flight-band").setData(grid(o));
      last = key;
      if (!map.getLayer("flight-band")) map.addLayer({ id: "flight-band", type: "fill", source: "flight-band", paint: { "fill-color": colour, "fill-opacity": 0.28, "fill-antialias": false } },
        K.before(map));
    } catch (e) {}
  }
  var leg = K.legKeys(BANDS.map((b, i) => { return [b[1], "area", i === BANDS.length - 1 ? "over 15 h" : (i ? BANDS[i - 1][0] + "–" : "under ") + b[0] + " h"]; }));
  L.add({ id: "flighttime", name: "Flight time from pin", icon: "🕒", group: "Travel", taps: ["flight-band"], dflt: true, apply: apply, legend: leg,
    tip: "Rough nonstop flight hours from your pin along the curved Earth (0.5 h plus 830 km/h). Drop a pin to see it",
    note: (map, on) => { return on && !origin() ? "drop a pin" : ""; },
    attach: (map, on) => {
      map.on("idle", () => { var o = origin(); if (L.isOn("flighttime") && o && o.lat.toFixed(2) + "," + o.lon.toFixed(2) !== last) apply(map, true); });
      map.on("click", "flight-band", (e) => {
        var o = origin();
        if (!o) return;
        var h = hours(o.lat, o.lon, e.lngLat.lat, e.lngLat.lng);
        K.show(map, e.lngLat, "About " + (Math.round(h * 2) / 2) + " h flying", ["Nonstop from your pin, along the great circle", "Rough guide: 0.5 h plus 830 km/h"],
          ["SUNNY estimate", "https://en.wikipedia.org/wiki/Great-circle_distance"]);
      });
      apply(map, on);
    } });
})();
