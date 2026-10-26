// workspace/whereisthesun/sky-layers.js
/* SUNNY opt94 sky layers.
 *   Aurora   NOAA SWPC OVATION aurora forecast (30-minute nowcast), public domain. Fetched at
 *            most once per 30 minutes; the trimmed grid is kept on the phone in between.
 *   Eclipses upcoming central solar eclipse paths, data/eclipses.json from NASA GSFC path
 *            tables (Fred Espenak), public domain. Static, cached for good. */
(() => {
  "use strict";
  var K = window.SunnyKit;
  var L = window.SunnyLayers;
  if (!K || !L) return;
  var AUR_URL = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";
  var AUR_IDS = ["aurora-dot"];
  var aurLoading = null;
  var aurTime = "";
  function aurData() {
    var c = K.getStore("aurora");
    if (c) return Promise.resolve(c);
    if (!aurLoading) {
      aurLoading = fetch(AUR_URL).then((r) => { return r.json(); }).then((j) => {
        var pts = [];
        (j.coordinates || []).forEach((p) => {
          if (p[2] >= 4) pts.push([p[0] > 180 ? p[0] - 360 : p[0], p[1], p[2]]);
        });
        var d = { time: j["Forecast Time"] || "", pts: pts };
        K.putStore("aurora", d, 30 * 60000);
        aurLoading = null;
        return d;
      });
      aurLoading.catch(() => { aurLoading = null; });
    }
    return aurLoading;
  }
  /* opt100: smooth heat band. 1-degree grid sampled bilinearly into a Web Mercator canvas (no dots). */
  var aurGrid = null;
  function aurAt(lon, lat) {
    if (!aurGrid) return 0;
    var x = ((lon % 360) + 360) % 360, y = lat + 90, x0 = Math.floor(x), y0 = Math.max(0, Math.min(179, Math.floor(y)));
    var fx = x - x0, fy = y - y0, g = (i, j) => aurGrid[(j) * 360 + (i % 360)] || 0;
    return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy;
  }
  /* opt101: vivid, stretched ramp; Dev sliders (aurora-dev.js) set contrast and brightness. */
  var RAMP = [[0, [0, 255, 90, 0]], [8, [0, 255, 90, 215]], [25, [255, 255, 0, 235]], [50, [255, 30, 0, 245]], [100, [255, 0, 220, 255]]];
  function aurTune() {
    var g = (k, d) => { var v = parseFloat(localStorage.getItem(k)); return isNaN(v) ? d : v; };
    return { c: g("sunny.aurContrast", 50), b: g("sunny.aurBright", 50) };
  }
  var TUNE = aurTune();
  function aurColor(v) {
    if (v < 0.5) return null;
    var edge = Math.min(1, v / 6);
    v = 100 * Math.pow(v / 100, 0.35 + (100 - TUNE.c) / 100);
    var col = aurRamp(v), k = 0.6 + TUNE.b / 62.5;
    return [Math.min(255, col[0] * k), Math.min(255, col[1] * k), Math.min(255, col[2] * k), Math.min(255, col[3] * k) * edge];
  }
  function aurRamp(v) {
    for (var i = 1; i < RAMP.length; i++) if (v <= RAMP[i][0]) {
      var a = RAMP[i - 1], b = RAMP[i], t = (v - a[0]) / (b[0] - a[0]);
      return a[1].map((c, k) => c + (b[1][k] - c) * t);
    }
    return RAMP[RAMP.length - 1][1];
  }
  var MAXLAT = 85.0511;
  function aurImage(d) {
    aurTime = d.time;
    aurGrid = new Float32Array(360 * 181);
    d.pts.forEach((p) => { aurGrid[(Math.round(p[1]) + 90) * 360 + ((Math.round(p[0]) + 360) % 360)] = p[2]; });
    var W = 720, H = 720, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var cx = cv.getContext("2d"), im = cx.createImageData(W, H);
    for (var y = 0; y < H; y++) {
      var lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / H))) * 180 / Math.PI;
      for (var x = 0; x < W; x++) {
        var c = aurColor(aurAt(-180 + (x + 0.5) * 360 / W, lat));
        if (!c) continue;
        var o = (y * W + x) * 4; im.data[o] = c[0]; im.data[o + 1] = c[1]; im.data[o + 2] = c[2]; im.data[o + 3] = c[3];
      }
    }
    cx.putImageData(im, 0, 0);
    window.SunnyAurora.canvas = cv;
    return cv.toDataURL("image/png");
  }
  function aurAdd(map, url) {
    var co = [[-180, MAXLAT], [180, MAXLAT], [180, -MAXLAT], [-180, -MAXLAT]];
    if (map.getSource("aurora")) map.getSource("aurora").updateImage({ url: url, coordinates: co });
    else map.addSource("aurora", { type: "image", url: url, coordinates: co });
    if (!map.getLayer("aurora-dot")) {
      map.addLayer({ id: "aurora-dot", type: "raster", source: "aurora", paint: { "raster-opacity": 0, "raster-resampling": "linear", "raster-fade-duration": 0 } }, K.before(map));
    }
  }
  var lastD = null, redrawQ = 0, mapRef = null;
  /* opt101: the band is painted by aurora-top.js on a canvas above clouds and radar; the map layer stays invisible. */
  function aurTop(map) { if (window.SunnyAuroraTop) window.SunnyAuroraTop.draw(map); }
  function redraw() {
    TUNE = aurTune();
    if (redrawQ || !lastD || !mapRef) return;
    redrawQ = requestAnimationFrame(() => { redrawQ = 0; try { aurAdd(mapRef, aurImage(lastD)); } catch (e) {} });
  }
  window.SunnyAurora = { at: (lon, lat) => (L.isOn("aurora") && aurGrid ? aurAt(lon, lat) : 0), time: () => aurTime, redraw: redraw };
  function aurApply(map, on) {
    K.vis(map, AUR_IDS, on);
    aurTop(map);
    if (!on) return;
    aurData().then((d) => {
      if (!L.isOn("aurora")) return;
      lastD = d; mapRef = map;
      try { aurAdd(map, aurImage(d)); aurTop(map); } catch (e) {}
      K.vis(map, AUR_IDS, L.isOn("aurora"));
    }).catch(() => {});
  }
  L.add({ id: "aurora", name: "Aurora forecast", icon: "🟢", group: "Sky & Space", taps: AUR_IDS,
    legend: K.legRamp("#00ff5a,#ffff00,#ff1e00,#ff00dc", "low", "chance overhead", "high"),
    tip: "NOAA 30-minute aurora forecast: chance of seeing the northern lights overhead",
    apply: aurApply,
    attach: (map, on) => {
      map.on("styledata", () => { try { aurTop(map); } catch (e) {} });
      map.on("idle", () => { if (L.isOn("aurora") && !map.getLayer("aurora-dot")) aurApply(map, true); });
      setInterval(() => { if (L.isOn("aurora")) aurApply(map, true); }, 30 * 60000);
      map.on("click", (e) => {
        var v = window.SunnyAurora.at(e.lngLat.lng, e.lngLat.lat);
        if (v < 5) return;
        K.show(map, e.lngLat, "Aurora chance " + Math.round(v) + " %", ["Chance of aurora overhead", aurTime ? "Forecast for " + K.esc(aurTime) + " UTC" : ""], ["NOAA SWPC OVATION aurora forecast", "https://www.swpc.noaa.gov/products/aurora-30-minute-forecast"]);
      });
      aurApply(map, on);
    } });
  var ECL_IDS = ["eclipse-fill", "eclipse-line", "eclipse-centre"];
  function eclGeo(d) {
    var now = Date.now();
    var feats = [];
    d.eclipses.forEach((e) => {
      if (new Date(e.date + " 23:59 UTC").getTime() < now) return;
      var p = { date: e.date, kind: e.kind, dur: e.maxDuration };
      feats.push({ type: "Feature", properties: p, geometry: { type: "Polygon", coordinates: [e.path] } });
      feats.push({ type: "Feature", properties: p, geometry: { type: "LineString", coordinates: e.centre } });
    });
    return K.fc(feats);
  }
  function eclUrl(date) {
    var M = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
    var m = /(\d{4}) (\w{3}) (\d{1,2})/.exec(date || "");
    return m ? "https://eclipse.gsfc.nasa.gov/SEsearch/SEsearchmap.php?Ecl=" + m[1] + M[m[2]] + ("0" + m[3]).slice(-2) : "https://eclipse.gsfc.nasa.gov/solar.html";
  }
  function eclApply(map, on) {
    K.vis(map, ECL_IDS, on);
    if (!on) return;
    K.loadJson("data/eclipses.json").then((d) => {
      if (!map.getSource("eclipses")) {
        map.addSource("eclipses", { type: "geojson", data: eclGeo(d), attribution: 'Eclipses: <a href="https://eclipse.gsfc.nasa.gov/" target="_blank" rel="noopener">NASA GSFC</a> (F. Espenak)' });
      }
      var col = ["match", ["get", "kind"], "Total", "#b06cff", "Annular", "#ff8c2b", "#ff5fb0"];
      if (!map.getLayer("eclipse-fill")) map.addLayer({ id: "eclipse-fill", type: "fill", source: "eclipses", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": col, "fill-opacity": 0.16 } }, K.before(map));
      if (!map.getLayer("eclipse-line")) map.addLayer({ id: "eclipse-line", type: "line", source: "eclipses", filter: ["==", ["geometry-type"], "Polygon"], paint: { "line-color": col, "line-width": 0.8, "line-opacity": 0.7 } }, K.before(map));
      if (!map.getLayer("eclipse-centre")) map.addLayer({ id: "eclipse-centre", type: "line", source: "eclipses", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": col, "line-width": 1.4, "line-dasharray": [2, 2] } }, K.before(map));
      K.vis(map, ECL_IDS, L.isOn("eclipses"));
    }).catch(() => {});
  }
  L.add({ id: "eclipses", name: "Eclipse paths", icon: "🌑", group: "Sky & Space", taps: ["eclipse-fill"],
    tip: "Where upcoming total, annular and hybrid solar eclipses are central (NASA)",
    apply: eclApply,
    attach: (map, on) => {
      map.on("idle", () => { if (L.isOn("eclipses") && !map.getLayer("eclipse-fill")) eclApply(map, true); });
      var eclCard = (feats) => {
        var fs = feats.slice(0, 3).map((f) => { return f.properties; }), p = fs[0];
        return [p.kind + " solar eclipse", [K.esc(p.date), "Longest " + K.esc(p.dur) + " on the centre line",
          fs.length > 1 ? "Also here: " + fs.slice(1).map((q) => { return K.esc(q.date); }).join(", ") : ""], ["NASA GSFC eclipse page", eclUrl(p.date)]];
      };
      map.on("click", "eclipse-fill", (e) => { var c = eclCard(e.features); K.show(map, e.lngLat, c[0], c[1], c[2]); });
      if (window.SunnyHoverBox) window.SunnyHoverBox.add({ "eclipse-centre": "Eclipse centre line", "eclipse-fill": "Eclipse path", "eclipse-line": "Eclipse path" },
        (fs) => { var p = fs.filter((f) => f.layer.id === "eclipse-fill"), c = eclCard(p.length ? p : fs); return K.card(c[0], c[1], c[2]); });
      eclApply(map, on);
    } });
})();
