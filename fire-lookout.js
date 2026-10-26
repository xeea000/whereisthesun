// workspace/whereisthesun/fire-lookout.js
/* SUNNY fire lookout towers for the Towers layer: OpenStreetMap (emergency=fire_lookout, building=fire_lookout, fire tower types,
 * and towers named fire lookout or lookout tower) plus Wikidata "fire lookout tower" items, merged within about 400 m.
 * Built once into data/fire-lookouts.json (2,033 points, 79 in Canada). Own switch under Towers: "Fire lookout towers". */
(() => {
  "use strict";
  var K = window.SunnyKit, map = null, rows = null, hooked = false;
  var SS = { a: ["Fire lookout tower", "#ffea00"], d: ["Disused lookout", "#fff59d"], r: ["Ruins or destroyed", "#8d6e63"] };
  var kidOn = () => { try { return localStorage.getItem("sunny-L-towers-fl") !== "0"; } catch (e) { return true; } };
  var on = () => { return window.SunnyLayers && window.SunnyLayers.isOn("towers") && kidOn(); };
  var color = ["match", ["get", "s"], "a", SS.a[1], "d", SS.d[1], "r", SS.r[1], SS.a[1]];
  var src = (p) => { var r = String(p.r); return r.indexOf("wd:") === 0 ? ["Wikidata " + r.slice(3), "https://www.wikidata.org/wiki/" + r.slice(3)]
    : ["OpenStreetMap", "https://www.openstreetmap.org/" + ({ n: "node", w: "way", r: "relation" }[r[0]] || "node") + "/" + r.slice(1)]; };
  var title = (p) => { return p.n || "Fire lookout tower"; };
  var lines = (p) => { return ["<b>" + K.esc((SS[p.s] || SS.a)[0]) + "</b>", p.h ? "Height " + K.esc(p.h) + " m" : "",
    p.e ? "Elevation " + K.esc(p.e) + " m" : "", p.o ? "Operator " + K.esc(p.o) : "", p.c === "CA" ? "Canada" : K.esc(p.c || "")]; };
  var add = () => {
    if (map.getSource("fire-look")) return;
    map.addSource("fire-look", { type: "geojson", data: K.fc(rows.map((r) => { return { type: "Feature", geometry: { type: "Point", coordinates: [r[1], r[0]] },
      properties: { n: r[2], s: r[3], r: r[4], h: r[5], e: r[6], o: r[7], c: r[8] } }; })), attribution: "Fire lookouts: OpenStreetMap, Wikidata" });
    map.addLayer({ id: "fire-look-dot", type: "circle", source: "fire-look", paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 2.4, 8, 4.5, 14, 7], "circle-color": color,
      "circle-stroke-color": "#b71c1c", "circle-stroke-width": 1.6 } }, K.before(map));
  };
  var apply = () => {
    if (!map) return;
    var want = on();
    if (want && !rows) { rows = []; K.loadJson("data/fire-lookouts.json?v=5c42360a").then((d) => { rows = d; apply(); }).catch(() => { rows = null; }); return; }
    if (want && rows && rows.length) { try { add(); } catch (e) { setTimeout(apply, 2000); return; } }
    K.vis(map, ["fire-look-dot"], want);
  };
  window.SunnyFireLook = {
    legend: K.legKeys(Object.keys(SS).map((k) => [SS[k][1], "dot", SS[k][0]])),
    attach: (m) => {
      map = m;
      if (hooked) return; hooked = true;
      m.on("idle", () => { if (on() && rows && rows.length && !m.getLayer("fire-look-dot")) apply(); });
      m.on("click", "fire-look-dot", (e) => { var p = e.features[0].properties;
        K.show(m, e.features[0].geometry.coordinates, title(p), lines(p), src(p)); });
      (window.SunnyHoverName = window.SunnyHoverName || {})["fire-look-dot"] = (f) => Promise.resolve([title(f.properties), (SS[f.properties.s] || SS.a)[0]]);
      apply();
    },
    apply: apply
  };
})();
