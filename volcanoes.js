// workspace/whereisthesun/volcanoes.js
/* SUNNY opt125: Holocene volcanoes from the Smithsonian Global Volcanism Program, 1,214 volcanoes, 25 KB gzipped, cached for good.
 * Colour = when it last erupted, size = its biggest known eruption (VEI).
 * "Past due" rings: years from the last eruption to now divided by the average gap between eruptions from 1500 on,
 * only for volcanoes with 5 or more eruptions from 1500 on. A rough ratio, not a forecast.
 * Recent eruptions (t388u): magenta with a white ring = an eruption continuing, or one that ended in the 12 months before
 * the data was built (GVP eruptions from 1960 on); the legend gives that build date. */
(() => {
  "use strict";
  var L = window.SunnyLayers, K = window.SunnyKit;
  var SRC = ["Smithsonian GVP, Volcanoes of the World", "https://volcano.si.edu/"];
  var CLS = [["#ff3d00", "erupted since 1900"], ["#ff9e40", "erupted 1500 to 1899"], ["#a1887f", "erupted earlier, in the last 12,000 years"],
    ["#9e9e9e", "no dated eruption"]];
  var RECENT = "#e6007e", built = "";
  var feats = null;
  var data = () => {
    return K.loadJson("data/world/volcanoes.json").then((g) => {
      built = g.built || "";
      if (!feats) feats = g.v.map((r, i) => { return { type: "Feature", properties: { i: i, c: r[2], vn: r[3], name: r[4], last: r[5], n: r[6], vei: r[7], due: r[8],
        rc: r[9] || 0, rd: r[10] || "" }, geometry: { type: "Point", coordinates: [r[0], r[1]] } }; });
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
      if (!map.getLayer("volc-dot")) map.addLayer({ id: "volc-dot", type: "circle", source: "volcanoes", layout: { "circle-sort-key": ["get", "rc"] }, paint: {
        "circle-color": ["case", [">", ["get", "rc"], 0], RECENT, ["match", ["get", "c"], 0, CLS[0][0], 1, CLS[1][0], 2, CLS[2][0], CLS[3][0]]],
        "circle-radius": K.markerScale.bind(map, "volc-dot", "circle-radius",
          ["interpolate", ["linear"], ["zoom"], 1, ["+", 2, ["*", 0.5, ["max", 0, ["get", "vei"]]]], 8, ["+", 4, ["*", 1.2, ["max", 0, ["get", "vei"]]]]]),
        "circle-stroke-color": ["case", [">", ["get", "rc"], 0], "#fff", "#2b1200"], "circle-stroke-width": ["case", [">", ["get", "rc"], 0], 2, 1] } });
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
    var ymd = (d) => { return d ? new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }) : "?"; };
    if (p.rc === 1) rows.unshift("Erupting: an eruption continuing from " + ymd(p.rd) + " (GVP records as of " + built + ")");
    if (p.rc === 2) rows.unshift("Recent eruption, ended " + ymd(p.rd) + " (GVP records as of " + built + ")");
    if (p.vei >= 0) rows.push("Biggest known eruption: VEI " + p.vei);
    if (p.n > 0) rows.push(p.n + " eruptions since 1500");
    if (p.due >= 0) rows.push("Time since last ÷ average gap: " + p.due + (p.due >= 1 ? " (past its average gap; rough, not a forecast)" : ""));
    K.show(map, e.lngLat, p.name, rows, ["Smithsonian GVP", "https://volcano.si.edu/volcano.cfm?vn=" + p.vn]);
  };
  L.add({ id: "volcanoes", name: "Volcanoes", icon: "🌋", group: "Earth", taps: ["volc-dot"], dflt: true, apply: apply,
    tip: "Volcanoes active in the last 12,000 years (Smithsonian GVP), coloured by last eruption (magenta: erupting or erupted in the 12 months " +
      "before the data build), sized by biggest eruption",
    legend: () => {
      return K.legKeys([[RECENT, "dot", "erupting, or an eruption ended in the 12 months before " + (built || "the data build")]]
        .concat(CLS.map((c) => { return [c[0], "dot", c[1]]; }))) + '<div class="ls-row"><small>Bigger dot = bigger known eruption (VEI)</small></div>';
    },
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
