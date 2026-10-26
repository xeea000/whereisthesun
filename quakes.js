// workspace/whereisthesun/quakes.js
/* SUNNY opt124: earthquakes. Since 1900: every M6.5+ since 1900 from USGS ComCat (public domain), 51 KB gzipped, cached for good.
 * Recent: the USGS M4.5+ past-week feed, about 16 KB gzipped, fetched at most every 30 minutes while the layer is on.
 * Dot area follows magnitude (each step of 1 is about 32 times the energy) but the radius is capped so great quakes do not cover a country. */
(() => {
  "use strict";
  var L = window.SunnyLayers, K = window.SunnyKit;
  var USGS = ["USGS ComCat (public domain)", "https://earthquake.usgs.gov/earthquakes/search/"];
  var LIVE = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson";
  var rad = (lo) => {
    return ["interpolate", ["linear"], ["zoom"], 1, ["min", 16, ["*", 2.2, ["^", 1.9, ["-", ["get", "m"], lo]]]],
      7, ["min", 34, ["*", 5, ["^", 1.9, ["-", ["get", "m"], lo]]]]];
  };
  var depthColor = ["step", ["get", "d"], "#ff5a36", 70, "#ffc93c", 300, "#5aa9ff"];
  var day = (n) => { var s = String(n); return s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8); };
  var histApply = (map, on) => {
    K.vis(map, ["quake-old"], on);
    if (!on) return;
    K.loadJson("data/world/quakes.json").then((g) => {
      if (!map.getSource("quakes")) {
        var f = [], q = g.q;
        for (var i = 0; i < q.length; i += 5) f.push({ type: "Feature", properties: { i: i / 5, m: q[i + 2] / 10, t: q[i + 3], d: q[i + 4] },
          geometry: { type: "Point", coordinates: [q[i], q[i + 1]] } });
        f.sort((a, b) => { return a.properties.m - b.properties.m; });
        map.addSource("quakes", { type: "geojson", data: K.fc(f), attribution: 'Earthquakes: <a href="' + USGS[1] + '" target="_blank" rel="noopener">USGS</a>' });
      }
      if (!map.getLayer("quake-old")) map.addLayer({ id: "quake-old", type: "circle", source: "quakes", paint: { "circle-radius": rad(6.5),
        "circle-color": depthColor, "circle-opacity": 0.45, "circle-stroke-color": "#3a1a10", "circle-stroke-width": 0.6 } }, K.before(map));
      K.vis(map, ["quake-old"], L.isOn("quakes"));
    }).catch(() => {});
  };
  /* tap: quick facts at once, then the USGS name and event page, a 1-2 KB lookup */
  var card = (map, e, p, live) => {
    var rows = ["Magnitude " + Number(p.m).toFixed(1), live ? new Date(p.t).toLocaleString() : day(p.t), "Depth " + Math.round(p.d) + " km"];
    var pop = K.show(map, e.lngLat, live ? p.place || "Recent earthquake" : "Earthquake", rows, live ? ["USGS", p.url] : USGS);
    if (live) return;
    var d0 = day(p.t), c = e.features[0].geometry.coordinates;
    var u = "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&limit=1&orderby=magnitude&starttime=" + d0 + "&endtime=" + d0 + "T23:59:59" +
      "&latitude=" + c[1] + "&longitude=" + c[0] + "&maxradiuskm=150&minmagnitude=" + (p.m - 0.15).toFixed(2);
    fetch(u).then((r) => { return r.json(); }).then((j) => {
      var f = j.features && j.features[0];
      if (!f || !pop.isOpen()) return;
      pop.remove();
      K.show(map, e.lngLat, f.properties.title || "Earthquake", rows, ["USGS event page", f.properties.url]);
    }).catch(() => {});
  };
  var legend = K.legKeys([["#ff5a36", "dot", "shallow, under 70 km"], ["#ffc93c", "dot", "70 to 300 km deep"], ["#5aa9ff", "dot", "deeper than 300 km"]]) +
    '<div class="ls-row"><small>Bigger dot = bigger magnitude, capped</small></div>';
  L.add({ id: "quakes", name: "Earthquakes since 1900", icon: "🌋", group: "Earth", taps: ["quake-old"], dflt: true, apply: histApply, legend: legend,
    tip: "Every magnitude 6.5 or bigger earthquake since 1900 (USGS), sized by magnitude, coloured by depth",
    attach: (map, on) => {
      map.on("idle", () => { if (L.isOn("quakes") && !map.getLayer("quake-old")) histApply(map, true); });
      map.on("click", "quake-old", (e) => { card(map, e, e.features[0].properties, false); });
      histApply(map, on);
    } });
  var liveAt = 0;
  var liveApply = (map, on) => {
    K.vis(map, ["quake-new"], on);
    if (!on || Date.now() - liveAt < 30 * 60000) return;
    liveAt = Date.now();
    fetch(LIVE).then((r) => { return r.json(); }).then((g) => {
      g.features.forEach((f) => { var p = f.properties; p.m = p.mag; p.d = f.geometry.coordinates[2]; p.age = (Date.now() - p.time) / 3600000; p.t = p.time; });
      if (map.getSource("quakes-live")) { map.getSource("quakes-live").setData(g); return; }
      map.addSource("quakes-live", { type: "geojson", data: g });
      map.addLayer({ id: "quake-new", type: "circle", source: "quakes-live", paint: { "circle-radius": rad(4.5),
        "circle-color": ["step", ["get", "age"], "#ff1744", 24, "#ff9100"], "circle-opacity": 0.75, "circle-stroke-color": "#fff", "circle-stroke-width": 1 } });
      K.vis(map, ["quake-new"], L.isOn("quakeslive"));
    }).catch(() => { liveAt = 0; });
  };
  L.add({ id: "quakeslive", name: "Earthquakes this week", icon: "📳", group: "Earth", taps: ["quake-new"], dflt: true, apply: liveApply,
    legend: K.legKeys([["#ff1744", "dot", "last 24 hours"], ["#ff9100", "dot", "last 7 days"]]),
    tip: "Magnitude 4.5 and up in the past week, live from USGS, refreshed every 30 minutes at most",
    attach: (map, on) => {
      map.on("click", "quake-new", (e) => { card(map, e, e.features[0].properties, true); });
      setInterval(() => { if (L.isOn("quakeslive") && !document.hidden) liveApply(map, true); }, 30 * 60000 + 5000);
      liveApply(map, on);
    } });
})();
