// workspace/whereisthesun/volcanoes.js
/* SUNNY opt125: Holocene volcanoes from the Smithsonian Global Volcanism Program, 1,214 volcanoes, 25 KB gzipped, cached for good.
 * Colour = when it last erupted, size = its biggest known eruption (VEI).
 * "Past due" rings: years from the last eruption to now divided by the average gap between eruptions from 1500 on,
 * only for volcanoes with 5 or more eruptions from 1500 on. A rough ratio, not a forecast. */
(() => {
  "use strict";
  var L = window.SunnyLayers, K = window.SunnyKit;
  var SRC = ["Smithsonian GVP, Volcanoes of the World", "https://volcano.si.edu/"];
  var CLS = [["#ff3d00", "erupted since 1900"], ["#ff9e40", "erupted 1500 to 1899"], ["#a1887f", "erupted earlier, in the last 12,000 years"],
    ["#9e9e9e", "no dated eruption"]];
  var feats = null;
  var data = () => {
    return K.loadJson("data/world/volcanoes.json").then((g) => {
      if (!feats) feats = g.v.map((r, i) => { return { type: "Feature", properties: { i: i, c: r[2], vn: r[3], name: r[4], last: r[5], n: r[6], vei: r[7], due: r[8] },
        geometry: { type: "Point", coordinates: [r[0], r[1]] } }; });
      return feats;
    });
  };
  var src = (map) => {
    if (!map.getSource("volcanoes")) map.addSource("volcanoes", { type: "geojson", data: K.fc(feats),
      attribution: 'Volcanoes: <a href="' + SRC[1] + '" target="_blank" rel="noopener">Smithsonian GVP</a>' });
  };
  var apply = (map, on) => {
    K.vis(map, ["volc-dot"], on);
    if (!on) return;
    data().then(() => {
      src(map);
      if (!map.getLayer("volc-dot")) map.addLayer({ id: "volc-dot", type: "circle", source: "volcanoes", paint: {
        "circle-color": ["match", ["get", "c"], 0, CLS[0][0], 1, CLS[1][0], 2, CLS[2][0], CLS[3][0]],
        "circle-radius": K.markerScale.bind(map, "volc-dot", "circle-radius",
          ["interpolate", ["linear"], ["zoom"], 1, ["+", 2, ["*", 0.5, ["max", 0, ["get", "vei"]]]], 8, ["+", 4, ["*", 1.2, ["max", 0, ["get", "vei"]]]]]),
        "circle-stroke-color": "#2b1200", "circle-stroke-width": 1 } });
      K.vis(map, ["volc-dot"], L.isOn("volcanoes"));
    }).catch(() => {});
  };
  var dueApply = (map, on) => {
    K.vis(map, ["volc-due"], on);
    if (!on) return;
    data().then(() => {
      src(map);
      if (!map.getLayer("volc-due")) map.addLayer({ id: "volc-due", type: "circle", source: "volcanoes", filter: [">=", ["get", "due"], 1],
        paint: { "circle-color": "rgba(0,0,0,0)", "circle-radius": K.markerScale.bind(map, "volc-due", "circle-radius",
          ["interpolate", ["linear"], ["zoom"], 1, 6, 8, 13]),
          "circle-stroke-width": 2, "circle-stroke-color": ["step", ["get", "due"], "#ffe066", 2, "#ff9f1c", 5, "#e63946"] } },
        map.getLayer("volc-dot") ? "volc-dot" : undefined);
      K.vis(map, ["volc-due"], L.isOn("volcdue"));
    }).catch(() => {});
  };
  var card = (map, e) => {
    var p = e.features[0].properties, yr = (y) => { return y < 0 ? -y + " BCE" : String(y); };
    var rows = [CLS[p.c][1].replace(/^./, (c) => { return c.toUpperCase(); }) + (p.last != null && p.last !== "null" ? " (last: " + yr(p.last) + ")" : "")];
    if (p.vei >= 0) rows.push("Biggest known eruption: VEI " + p.vei);
    if (p.n > 0) rows.push(p.n + " eruptions since 1500");
    if (p.due >= 0) rows.push("Time since last ÷ average gap: " + p.due + (p.due >= 1 ? " (past its average gap; rough, not a forecast)" : ""));
    K.show(map, e.lngLat, p.name, rows, ["Smithsonian GVP", "https://volcano.si.edu/volcano.cfm?vn=" + p.vn]);
  };
  L.add({ id: "volcanoes", name: "Volcanoes", icon: "🌋", group: "Earth", taps: ["volc-dot"], dflt: true, apply: apply,
    tip: "Volcanoes active in the last 12,000 years (Smithsonian GVP), coloured by last eruption, sized by biggest eruption",
    legend: K.legKeys(CLS.map((c) => { return [c[0], "dot", c[1]]; })) + '<div class="ls-row"><small>Bigger dot = bigger known eruption (VEI)</small></div>',
    attach: (map, on) => {
      map.on("idle", () => { if (L.isOn("volcanoes") && !map.getLayer("volc-dot")) apply(map, true); });
      map.on("click", "volc-dot", (e) => { card(map, e); });
      apply(map, on);
    } });
  L.add({ id: "volcdue", name: "Volcanoes past their average gap", icon: "⏰", group: "Earth", taps: ["volc-due"], dflt: true, apply: dueApply,
    tip: "Rough: years since the last eruption divided by the average gap since 1500, for volcanoes with 5+ eruptions since then. Not a forecast",
    legend: K.legKeys([["#ffe066", "dot", "1 to 2 times its average gap"], ["#ff9f1c", "dot", "2 to 5 times"], ["#e63946", "dot", "over 5 times"]]) +
      '<div class="ls-row"><small>Rough ratio, not a forecast</small></div>',
    attach: (map, on) => {
      map.on("click", "volc-due", (e) => { card(map, e); });
      (window.SunnyHoverName = window.SunnyHoverName || {})["volc-due"] = (f) => Promise.resolve([f.properties.name, "time since last ÷ average gap " + f.properties.due]);
      dueApply(map, on);
    } });
})();
