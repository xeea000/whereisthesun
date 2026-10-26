// workspace/whereisthesun/ca-cover.js
/* SUNNY estimated cell coverage for Canada, drawn in the browser from the ISED site tiles that ca-cell.js loads (no extra download).
 * Estimate, not official coverage. Formula per site, using only the carriers and technologies switched on:
 *   reach = largest band reach among its transmit frequencies: under 1 GHz (600/700/850 MHz) 8 km, 1-2.7 GHz (PCS/AWS/2100) 3 km,
 *   3-6 GHz (3500 MHz) 1.2 km, 20 GHz+ (mmWave) 0.3 km; then capped by the radio horizon 4.12 km x (sqrt(structure height m) + sqrt(1.5 m handset)),
 *   using 30 m when the height is not given. Drawn as a heatmap whose radius is that reach, so it is strongest at the site, fades to the edge
 *   and adds up where sites overlap; sites within 0.01° merge and the radius stops at 180 px close in (opt167). Zoom 8 and closer. */
(() => {
  "use strict";
  var L = window.SunnyLayers, K = window.SunnyKit, C = window.SunnyCaCell, map = null;
  var REACH = [[1, 8000], [2, 3000], [4, 1200], [8, 300]];
  var TG = [["5g", "5G", [3, 4]], ["lte", "LTE / 4G", [2]], ["3g", "3G (HSPA, CDMA)", [1, 8]], ["2g", "2G and other (GSM, Wi-Fi, WiMax, other)", [0, 5, 6, 7]]];
  var kOn = (id) => { try { return localStorage.getItem("sunny-L-cellcover-" + id) !== "0"; } catch (e) { return true; } };
  var on = () => { return L.isOn("cellcover"); };
  var reachOf = (bands, h) => {
    var r = 0; REACH.forEach((x) => { if (bands & x[0]) r = Math.max(r, x[1]); });
    return Math.min(r, 4120 * (Math.sqrt(h || 30) + Math.sqrt(1.5)));
  };
  var build = () => {
    var techOk = {}, out = [], cell = {};
    TG.forEach((g) => { if (kOn(g[0])) g[2].forEach((t) => { techOk[t] = 1; }); });
    C.all().forEach((f) => {
      var bands = 0;
      f.rad.forEach((x) => { if (techOk[x[1]] && kOn("c" + x[0])) bands |= x[2]; });
      var r = bands ? reachOf(bands, f.properties.h) : 0;
      if (!r) return;
      /* opt167: sites in the same 0.01° cell (about 1 km) merge into one point, so a dense city draws hundreds of points, not thousands */
      var c = f.geometry.coordinates, k = Math.round(c[0] * 100) + ":" + Math.round(c[1] * 100), o = cell[k];
      if (o) { o.properties.n++; o.properties.r = Math.max(o.properties.r, Math.round(r)); return; }
      out.push(cell[k] = { type: "Feature", geometry: f.geometry, properties: { r: Math.round(r), n: 1 } });
    });
    return K.fc(out);
  };
  var PX = 1 / 100600; /* pixels per metre at zoom 0 near 50°N (156,543 m/px x cos 50°) */
  var redraw = () => {
    if (!map || !on() || !map.getSource("ca-cov")) return;
    map.getSource("ca-cov").setData(build());
  };
  var add = () => {
    if (map.getSource("ca-cov")) return;
    map.addSource("ca-cov", { type: "geojson", data: K.fc([]), buffer: 512, attribution: "Cell coverage estimate from ISED site data" });
    map.addLayer({ id: "ca-cov-heat", type: "heatmap", source: "ca-cov", minzoom: 8, paint: {
      /* opt167: radius capped at 180 px (a huge radius per point crashed phones in cities and smeared at tile edges) */
      "heatmap-radius": ["interpolate", ["exponential", 2], ["zoom"], 8, ["min", 180, ["*", ["get", "r"], 256 * PX]], 15, ["min", 180, ["*", ["get", "r"], 32768 * PX]]],
      "heatmap-weight": ["min", 2, ["*", 0.7, ["sqrt", ["get", "n"]]]], "heatmap-intensity": 0.8, "heatmap-opacity": 0.6,
      "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.03, "rgba(215,48,39,0.4)", 0.15, "rgba(254,224,139,0.6)",
        0.4, "rgba(26,152,80,0.7)", 1, "rgba(0,104,55,0.85)"] } }, K.before(map));
  };
  var apply = (m, want) => {
    map = m;
    if (want) { try { add(); } catch (e) { setTimeout(() => { if (on()) apply(m, true); }, 2000); return; } }
    K.vis(m, ["ca-cov-heat"], want);
    C.apply();
    if (want) redraw();
  };
  window.SunnyCaCover = { on: on, redraw: redraw, reach: reachOf };
  L.add({ id: "cellcover", name: "Cell coverage, Canada (estimate)", icon: "📶", group: "Transmission", apply: apply,
    tip: "Estimate, not official coverage. Worked out from ISED site data: band reach capped by the radio horizon from the structure height. Zoom 8+",
    kids: TG.map((g) => { return { id: "cellcover-" + g[0], name: g[1], dflt: true }; })
      .concat(C.brands.map((b, i) => { return { id: "cellcover-c" + i, name: b[0], dflt: true }; })),
    kidSet: redraw,
    legend: K.legKeys([["rgba(26,152,80,0.8)", "area", "strong"], ["rgba(254,224,139,0.8)", "area", "fair"], ["rgba(215,48,39,0.6)", "area", "weak"]]) +
      "<div class=\"lp-note\">Estimate, not official coverage. Reach: under 1 GHz 8 km, 1-2.7 GHz 3 km, 3.5 GHz 1.2 km, mmWave 0.3 km, capped by the radio horizon.</div>",
    attach: (m, want) => { map = m; m.on("idle", () => { if (on() && !m.getLayer("ca-cov-heat")) apply(m, true); }); apply(m, want); } });
})();
