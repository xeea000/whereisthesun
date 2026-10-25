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
  function aurGeo(d) {
    aurTime = d.time;
    return K.fc(d.pts.map((p) => {
      return { type: "Feature", properties: { v: p[2] }, geometry: { type: "Point", coordinates: [p[0], p[1]] } };
    }));
  }
  function aurAdd(map, geo) {
    if (map.getSource("aurora")) map.getSource("aurora").setData(geo);
    else map.addSource("aurora", { type: "geojson", data: geo, attribution: 'Aurora: <a href="https://www.swpc.noaa.gov/products/aurora-30-minute-forecast" target="_blank" rel="noopener">NOAA SWPC OVATION</a>' });
    if (!map.getLayer("aurora-dot")) {
      map.addLayer({ id: "aurora-dot", type: "circle", source: "aurora", paint: {
        "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 1, 2.5, 4, 14, 7, 110],
        "circle-color": ["interpolate", ["linear"], ["get", "v"], 4, "#2bd66b", 20, "#c6f03a", 40, "#ffb02e", 70, "#ff3d6e"],
        "circle-opacity": ["interpolate", ["linear"], ["get", "v"], 4, 0.18, 30, 0.42, 70, 0.6],
        "circle-blur": 0.8 } }, K.before(map));
    }
  }
  function aurApply(map, on) {
    K.vis(map, AUR_IDS, on);
    if (!on) return;
    aurData().then((d) => {
      if (!L.isOn("aurora")) return;
      try { aurAdd(map, aurGeo(d)); } catch (e) {}
      K.vis(map, AUR_IDS, L.isOn("aurora"));
    }).catch(() => {});
  }
  L.add({ id: "aurora", name: "Aurora forecast", icon: "🟢", group: "Sky & Space", taps: AUR_IDS,
    tip: "NOAA 30-minute aurora forecast: chance of seeing the northern lights overhead",
    apply: aurApply,
    attach: (map, on) => {
      map.on("idle", () => { if (L.isOn("aurora") && !map.getLayer("aurora-dot")) aurApply(map, true); });
      setInterval(() => { if (L.isOn("aurora")) aurApply(map, true); }, 30 * 60000);
      map.on("click", "aurora-dot", (e) => {
        var f = e.features[0];
        K.show(map, e.lngLat, "Aurora chance " + f.properties.v + " %", ["Chance of aurora overhead", aurTime ? "Forecast for " + K.esc(aurTime) + " UTC" : ""], ["NOAA SWPC OVATION aurora forecast", "https://www.swpc.noaa.gov/products/aurora-30-minute-forecast"]);
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
      map.on("click", "eclipse-fill", (e) => {
        var fs = e.features.slice(0, 3).map((f) => { return f.properties; });
        var p = fs[0];
        K.show(map, e.lngLat, p.kind + " solar eclipse", [K.esc(p.date), "Longest " + K.esc(p.dur) + " on the centre line",
          fs.length > 1 ? "Also here: " + fs.slice(1).map((q) => { return K.esc(q.date); }).join(", ") : ""], ["NASA GSFC eclipse page", eclUrl(p.date)]);
      });
      eclApply(map, on);
    } });
})();
