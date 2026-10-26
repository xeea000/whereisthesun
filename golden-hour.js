// workspace/whereisthesun/golden-hour.js
/* SUNNY golden hour bands: where on Earth the sun sits low right now, worked out from the clock (no download).
 * Golden hour: sun between 4° below and 6° above the horizon (a common photographer's band). Blue hour: 6° to 4° below.
 * Redrawn every minute while on, in 1° columns. */
(() => {
  "use strict";
  var L = window.SunnyLayers, K = window.SunnyKit;
  var IDS = ["gold-fill"], BANDS = [[-6, -4, "#4a6fd1", "Blue hour"], [-4, 6, "#ffb347", "Golden hour"]];
  var R = Math.PI / 180, timer = null;
  var sunAt = (t) => {
    var d = t / 864e5 - 10957.5, g = (357.529 + 0.98560028 * d) * R, q = 280.459 + 0.98564736 * d;
    var lam = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * R, e = (23.439 - 3.6e-7 * d) * R;
    var dec = Math.asin(Math.sin(e) * Math.sin(lam)), ra = Math.atan2(Math.cos(e) * Math.sin(lam), Math.cos(lam)) / R;
    var gmst = (18.697374558 + 24.06570982441908 * d) % 24 * 15;
    return { dec: dec, lon0: ra - gmst };
  };
  var band = (s, lat, lon) => {
    var el = Math.asin(Math.sin(lat * R) * Math.sin(s.dec) + Math.cos(lat * R) * Math.cos(s.dec) * Math.cos((lon - s.lon0) * R)) / R;
    for (var i = 0; i < BANDS.length; i++) if (el >= BANDS[i][0] && el < BANDS[i][1]) return i;
    return -1;
  };
  var build = (t) => {
    var s = sunAt(t), out = [];
    for (var lon = -180; lon < 180; lon++) {
      var start = -85, cur = band(s, -84.5, lon + 0.5);
      for (var lat = -85; lat <= 85; lat++) {
        var b = lat < 85 ? band(s, lat + 0.5, lon + 0.5) : -2;
        if (b === cur) continue;
        if (cur >= 0) out.push({ type: "Feature", properties: { b: cur }, geometry: { type: "Polygon",
          coordinates: [[[lon, start], [lon + 1, start], [lon + 1, lat], [lon, lat], [lon, start]]] } });
        start = lat; cur = b;
      }
    }
    return K.fc(out);
  };
  var now = () => { return Date.now(); };
  var draw = (map) => {
    var g = build(now());
    if (map.getSource("gold")) { map.getSource("gold").setData(g); return; }
    map.addSource("gold", { type: "geojson", data: g, attribution: "Golden hour: computed from the sun's position" });
    map.addLayer({ id: "gold-fill", type: "fill", source: "gold",
      paint: { "fill-color": ["match", ["get", "b"], 0, BANDS[0][2], BANDS[1][2]], "fill-opacity": 0.35, "fill-antialias": false } }, K.before(map));
  };
  /* the band sits right above the clouds and under every dot, line and other tint */
  var low = (map) => {
    var ls = map.getStyle().layers, top = -1;
    ls.forEach((l, i) => { if (/^(gibs|iem-vis|radar|light-cloud|lc-)/.test(l.id)) top = i; });
    var i = ls.findIndex((l) => l.id === "gold-fill"), nxt = ls[top + 1] && ls[top + 1].id;
    if (top >= 0 && i > top + 1 && nxt) { try { map.moveLayer("gold-fill", nxt); } catch (e) {} }
  };
  var apply = (map, on) => {
    clearInterval(timer); timer = null;
    if (on) {
      try { draw(map); low(map); } catch (e) { setTimeout(() => { if (L.isOn("goldenhour")) apply(map, true); }, 2000); return; } /* style not ready yet */
      timer = setInterval(() => { try { draw(map); } catch (e) {} }, 60000);
    }
    K.vis(map, IDS, on);
  };
  var hoverName = (f) => {
    var b = BANDS[f.properties.b];
    return Promise.resolve([b[3] + " now", "sun " + b[0] + "° to " + b[1] + "°"]);
  };
  L.add({ id: "goldenhour", name: "Golden hour", icon: "🌅", group: "Sky & Space", taps: ["gold-fill"], dflt: true, apply: apply,
    legend: K.legKeys(BANDS.slice().reverse().map((c) => { return [c[2], "area", c[3] + " (sun " + c[0] + "° to " + c[1] + "°)"]; })),
    tip: "Where the sun is low right now: golden hour (sun 4° below to 6° above the horizon) and blue hour (6° to 4° below). Computed, no download",
    attach: (map, on) => {
      (window.SunnyHoverName = window.SunnyHoverName || {})["gold-fill"] = hoverName;
      map.on("click", "gold-fill", (e) => { var b = BANDS[e.features[0].properties.b];
        K.show(map, e.lngLat, b[3] + " here now", ["Sun " + b[0] + "° to " + b[1] + "° above the horizon", "Computed from the sun's position; updates each minute"],
          ["Computed from the sun position", ""]); });
      map.on("idle", () => { if (!L.isOn("goldenhour")) return; if (!map.getLayer("gold-fill")) apply(map, true); else low(map); });
      apply(map, on);
    } });
})();
