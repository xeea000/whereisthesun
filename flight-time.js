// workspace/whereisthesun/flight-time.js
/* SUNNY Travel: flight time from the pin. Colour bands of rough nonstop flight hours from the pin, measured along the curved Earth
 * (great circle), so the bands bend on the flat map. Hours = 0.5 h for take-off and landing + distance / 830 km/h.
 * Drawn on the phone for the current view, one pixel at a time, with a thin line between bands, and redrawn when the map stops
 * or the pin moves, so edges stay sharp at every zoom. The pin is the dropped beach pin when that is in use, else your spot. No data. */
(() => {
  "use strict";
  var K = window.SunnyKit;
  var L = window.SunnyLayers;
  if (!K || !L) return;
  var BANDS = [[1, "#1a9850"], [2, "#66bd63"], [3, "#a6d96a"], [4, "#d9ef8b"], [6, "#fee08b"], [8, "#fdae61"], [10, "#f46d43"], [12, "#d73027"],
    [15, "#a50026"], [99, "#5e0019"]];
  var R = 6371, SPEED = 830, D = Math.PI / 180;
  var RGB = BANDS.map((b) => { var n = parseInt(b[1].slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; });
  var cv = null, mapRef = null;
  var hours = (la1, lo1, la2, lo2) => {
    var a = Math.sin((la2 - la1) * D / 2), b = Math.sin((lo2 - lo1) * D / 2);
    var h = a * a + Math.cos(la1 * D) * Math.cos(la2 * D) * b * b;
    return 0.5 + 2 * R * Math.asin(Math.min(1, Math.sqrt(h))) / SPEED;
  };
  var band = (h) => { for (var i = 0; i < BANDS.length; i++) if (h <= BANDS[i][0]) return i; return BANDS.length - 1; };
  var origin = () => {
    var p = window.SunnyBeachRef && window.SunnyBeachRef.pin && window.SunnyBeachRef.pin();
    if (p) return p;
    return typeof sunnyApp_origin !== "undefined" && sunnyApp_origin ? sunnyApp_origin : null;
  };
  var merc = (lat) => { return Math.log(Math.tan(Math.PI / 4 + lat * D / 2)); };
  var draw = (map, o) => {
    var bd = map.getBounds(), w = bd.getWest(), e = bd.getEast(), n = Math.min(85, bd.getNorth()), s = Math.max(-85, bd.getSouth());
    if (e - w > 360) { w = map.getCenter().lng - 180; e = w + 360; }
    var W = Math.min(1024, Math.round(map.getCanvas().clientWidth)), H = Math.min(1024, Math.round(map.getCanvas().clientHeight));
    if (!cv) cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    var g = cv.getContext("2d"), img = g.createImageData(W, H), px = img.data, yn = merc(n), ys = merc(s), prev = new Int8Array(W), cos0 = Math.cos(o.lat * D);
    for (var y = 0; y < H; y++) {
      var la = (2 * Math.atan(Math.exp(yn - (y + 0.5) / H * (yn - ys))) - Math.PI / 2) / D, cl = Math.cos(la * D), a = Math.sin((la - o.lat) * D / 2), aa = a * a;
      var left = -1;
      for (var x = 0; x < W; x++) {
        var lo = w + (x + 0.5) / W * (e - w), b = Math.sin((lo - o.lon) * D / 2);
        var k = band(0.5 + 2 * R * Math.asin(Math.min(1, Math.sqrt(aa + cos0 * cl * b * b))) / SPEED), c = RGB[k], i = (y * W + x) * 4;
        var edge = (left >= 0 && left !== k) || (y && prev[x] !== k);
        px[i] = edge ? 40 : c[0]; px[i + 1] = edge ? 40 : c[1]; px[i + 2] = edge ? 40 : c[2]; px[i + 3] = edge ? 150 : 72;
        left = k; prev[x] = k;
      }
    }
    g.putImageData(img, 0, 0);
    var co = [[w, n], [e, n], [e, s], [w, s]], url = cv.toDataURL("image/png"), src = map.getSource("flight-band");
    if (src) src.updateImage({ url: url, coordinates: co });
    else map.addSource("flight-band", { type: "image", url: url, coordinates: co });
    if (!map.getLayer("flight-band")) map.addLayer({ id: "flight-band", type: "raster", source: "flight-band", paint: { "raster-opacity": 1, "raster-fade-duration": 0 } },
      K.before(map));
  };
  function apply(map, on) {
    mapRef = map;
    K.vis(map, ["flight-band"], on);
    var o = origin();
    if (!on) return;
    if (!o) { K.vis(map, ["flight-band"], false); return; }
    try { draw(map, o); K.vis(map, ["flight-band"], true); } catch (e) {}
  }
  var leg = K.legKeys(BANDS.map((b, i) => { return [b[1], "area", i === BANDS.length - 1 ? "over 15 h" : (i ? BANDS[i - 1][0] + "–" : "under ") + b[0] + " h"]; }));
  L.add({ id: "flighttime", name: "Flight time from pin", icon: "🕒", group: "Travel", dflt: true, apply: apply, legend: leg,
    tip: "Rough nonstop flight hours from your pin along the curved Earth (0.5 h plus 830 km/h). Drop a pin to see it",
    note: (map, on) => { return on && !origin() ? "drop a pin" : ""; },
    attach: (map, on) => {
      map.on("moveend", () => { if (L.isOn("flighttime")) apply(map, true); });
      document.addEventListener("sunny-origin", () => { if (mapRef && L.isOn("flighttime")) apply(mapRef, true); });
      apply(map, on);
    } });
  window.SunnyFlightHours = hours;
})();
