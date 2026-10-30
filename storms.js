// workspace/whereisthesun/storms.js
/* SUNNY opt126: tropical cyclones (hurricanes, typhoons, cyclones).
 * Tracks: every storm that reached category 3 or more, seasons 1980 on, NOAA IBTrACS (public domain), 57 KB gzipped, cached for good.
 * Active: GDACS tropical cyclone list for the past two weeks, about 20 KB, fetched at most once an hour while the layer is on. */
(() => {
  "use strict";
  var L = window.SunnyLayers, K = window.SunnyKit;
  var IB = ["NOAA IBTrACS", "https://www.ncei.noaa.gov/products/international-best-track-archive"];
  var CAT = [["#7ec8e3", "tropical storm"], ["#ffe066", "category 1"], ["#ffb347", "category 2"], ["#ff7043", "category 3"], ["#e53935", "category 4"],
    ["#b0006d", "category 5"]];
  var color = ["match", ["get", "c"], 0, CAT[0][0], 1, CAT[1][0], 2, CAT[2][0], 3, CAT[3][0], 4, CAT[4][0], 5, CAT[5][0], "#90a4ae"];
  var cat = (kt) => { return kt < 64 ? 0 : kt < 83 ? 1 : kt < 96 ? 2 : kt < 113 ? 3 : kt < 137 ? 4 : 5; };
  var lines = (g) => {
    var f = [];
    g.s.forEach((s, id) => {
      var t = s[3], x = t[0], y = t[1], run = [[x / 10, y / 10]], c = t[2];
      var put = () => {
        if (run.length > 1) f.push({ type: "Feature", properties: { i: id, n: s[0], y: s[1], m: s[2], c: c }, geometry: { type: "LineString", coordinates: run } });
      };
      for (var i = 3; i < t.length; i += 3) {
        var dx = t[i], nx = x + dx, ny = y + t[i + 1];
        if (Math.abs(dx) > 1800) { put(); run = []; } else if (t[i + 2] !== c) { put(); run = [run[run.length - 1]]; c = t[i + 2]; }
        run.push([nx / 10, ny / 10]); x = nx; y = ny;
      }
      put();
    });
    return f;
  };
  var trackApply = (map, on) => {
    K.vis(map, ["storm-track"], on);
    if (!on) return;
    K.loadJson("data/world/storms.json").then((g) => {
      if (!map.getSource("storms")) map.addSource("storms", { type: "geojson", data: K.fc(lines(g)),
        attribution: 'Storm tracks: <a href="' + IB[1] + '" target="_blank" rel="noopener">NOAA IBTrACS</a>' });
      if (!map.getLayer("storm-track")) map.addLayer({ id: "storm-track", type: "line", source: "storms", layout: { "line-cap": "round" },
        paint: { "line-color": color, "line-opacity": 0.7,
          "line-width": ["interpolate", ["linear"], ["zoom"], 1, ["+", 0.4, ["*", 0.3, ["get", "c"]]], 6, ["+", 1, ["*", 0.8, ["get", "c"]]]] } },
        K.before(map));
      K.vis(map, ["storm-track"], L.isOn("stormtracks"));
    }).catch(() => {});
  };
  var legend = K.legKeys(CAT.map((c) => { return [c[0], "line", c[1]]; }).concat([["#90a4ae", "line", "weaker, before or after"]]));
  L.add({ id: "stormtracks", name: "Hurricane and typhoon tracks", icon: "🌀", group: "Weather", taps: ["storm-track"], dflt: true, apply: trackApply, legend: legend,
    tip: "Paths of every tropical cyclone that reached category 3 or more, 1980 on (NOAA IBTrACS), coloured by strength along the way",
    attach: (map, on) => {
      map.on("idle", () => { if (L.isOn("stormtracks") && !map.getLayer("storm-track")) trackApply(map, true); });
      map.on("click", "storm-track", (e) => {
        var p = e.features[0].properties;
        K.show(map, e.lngLat, (p.n === "Not_named" || p.n === "Not Named" ? "Unnamed storm" : p.n) + " (" + p.y + ")",
          ["Peak wind " + p.m + " kt (" + Math.round(p.m * 1.852) + " km/h), " + CAT[cat(p.m)][1], "Here: " + (CAT[p.c] ? CAT[p.c][1] : "weaker than a tropical storm")], IB);
      });
      trackApply(map, on);
    } });
  var liveAt = 0;
  var liveApply = (map, on) => {
    K.vis(map, ["storm-now", "storm-now-label"], on);
    if (!on || Date.now() - liveAt < 3600000) return;
    liveAt = Date.now();
    var d = (n) => { return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10); };
    fetch("https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC&alertlevel=green;orange;red&fromdate=" + d(-14) + "&todate=" + d(1))
      .then((r) => { return r.json(); }).then((g) => {
        var f = (g.features || []).filter((x) => { return x.properties.iscurrent === "true"; }).map((x) => {
          var p = x.properties, kmh = (p.severitydata && p.severitydata.severity) || 0;
          return { type: "Feature", geometry: x.geometry, properties: { name: p.name.replace("Tropical Cyclone ", ""), kmh: Math.round(kmh), c: cat(kmh / 1.852),
            alert: p.alertlevel, url: p.url && p.url.report, to: p.todate, land: p.country || "" } };
        });
        if (map.getSource("tc-now")) { map.getSource("tc-now").setData(K.fc(f)); return; }
        map.addSource("tc-now", { type: "geojson", data: K.fc(f), attribution: 'Active storms: <a href="https://www.gdacs.org/" target="_blank" rel="noopener">GDACS</a>' });
        map.addLayer({ id: "storm-now", type: "circle", source: "tc-now", paint: { "circle-color": color,
          "circle-radius": K.markerScale.bind(map, "storm-now", "circle-radius", ["+", 7, ["*", 2, ["get", "c"]]]),
          "circle-stroke-color": "#fff", "circle-stroke-width": 2, "circle-opacity": 0.85 } });
        map.addLayer({ id: "storm-now-label", type: "symbol", source: "tc-now", layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"],
          "text-size": K.markerScale.bind(map, "storm-now-label", "text-size", 11, { layout: true }), "text-offset": [0, 1.6] },
          paint: { "text-color": "#fff", "text-halo-color": "#000", "text-halo-width": 1.2 } });
        K.vis(map, ["storm-now", "storm-now-label"], L.isOn("stormsnow"));
      }).catch(() => { liveAt = 0; });
  };
  L.add({ id: "stormsnow", name: "Active tropical storms", icon: "🌀", group: "Weather", taps: ["storm-now"], dflt: true, apply: liveApply,
    legend: K.legKeys(CAT.map((c) => { return [c[0], "dot", c[1]]; })),
    tip: "Tropical storms, hurricanes and typhoons happening now (GDACS), refreshed at most once an hour",
    attach: (map, on) => {
      map.on("click", "storm-now", (e) => {
        var p = e.features[0].properties;
        K.show(map, e.lngLat, p.name, ["Max wind " + p.kmh + " km/h, " + CAT[p.c][1], "GDACS alert: " + p.alert + (p.land ? " · " + K.esc(p.land) : ""),
          "Updated " + new Date(p.to + "Z").toLocaleString([], { dateStyle: "medium", timeStyle: "short" })], ["GDACS report", p.url]);
      });
      map.on("idle", () => { if (L.isOn("stormsnow") && !map.getLayer("storm-now") && !liveAt) liveApply(map, true); });
      var sn = 0;
      setInterval(() => { if (L.isOn("stormsnow") && !document.hidden && window.SunnyDataSaver.slow(++sn)) liveApply(map, true); }, 3600000 + 5000);
      liveApply(map, on);
    } });
})();
