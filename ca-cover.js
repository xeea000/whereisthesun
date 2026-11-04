// workspace/whereisthesun/ca-cover.js
/* SUNNY estimated cell coverage for Canada, drawn in the browser from the ISED site tiles that ca-cell.js loads (no extra download
 * at high zoom). At low zoom (under 8) it uses the same cluster-centroid real-site overview (opt208 LOD) so coverage reads as organic
 * blobs along towns and corridors, not a grid. Estimate, not official coverage. Formula per site, using only the carriers and technologies switched on:
 *   reach = largest band reach among its transmit frequencies: under 1 GHz (600/700/850 MHz) 8 km, 1-2.7 GHz (PCS/AWS/2100) 3 km,
 *   3-6 GHz (3500 MHz) 1.2 km, 20 GHz+ (mmWave) 0.3 km; then capped by the radio horizon 4.12 km x (sqrt(structure height m) + sqrt(1.5 m handset)),
 *   using 30 m when the height is not given. Drawn as a heatmap whose radius is that reach (detail) or a density overview (far out);
 *   sites within 0.01° merge and the radius stops at 180 px close in (opt167). */
(() => {
  "use strict";
  var L = window.SunnyLayers, K = window.SunnyKit, C = window.SunnyCaCell, map = null;
  var REACH = [[1, 8000], [2, 3000], [4, 1200], [8, 300]];
  var TG = [["5g", "5G", [3, 4]], ["lte", "LTE / 4G", [2]], ["3g", "3G (HSPA, CDMA)", [1, 8]], ["2g", "2G and other (GSM, Wi-Fi, WiMax, other)", [0, 5, 6, 7]]];
  /* opt199: tech + carrier kids via SunnyKit.kids */
  var CELL_KIDS = TG.map((g) => { return { id: "cellcover-" + g[0], dflt: true }; })
    .concat(C.brands.map((b, i) => { return { id: "cellcover-c" + i, dflt: true }; }));
  var kOn = (id) => { return K.kids.isOn(["cellcover", id].join("-"), true); };
  var on = () => { return L.isOn("cellcover"); };
  var reachOf = (bands, h) => {
    var r = 0; REACH.forEach((x) => { if (bands & x[0]) r = Math.max(r, x[1]); });
    return Math.min(r, 4120 * (Math.sqrt(h || 30) + Math.sqrt(1.5)));
  };
  var techOkBits = () => {
    var ok = {};
    TG.forEach((g) => { if (kOn(g[0])) g[2].forEach((t) => { ok[t] = 1; }); });
    return ok;
  };
  /* Detail: per-site merge at 0.01° from loaded tiles (or overview features with rad stubs). */
  var buildRaw = () => {
    var techOk = techOkBits(), out = [], cell = {};
    C.all().forEach((f) => {
      var bands = 0;
      (f.rad || []).forEach((x) => { if (techOk[x[1]] && kOn("c" + x[0])) bands |= x[2]; });
      /* overview stub: rad is [[0,0,bd]] — treat as all brands in bitmask if kids match */
      if (!bands && f.properties && f.properties.ov) {
        var b = f.properties.b || 0, t = f.properties.t || 0, bd = f.properties.bd || 0, brandOk = false, techHit = false;
        C.brands.forEach((br, i) => { if ((b >> i) & 1 && kOn("c" + i)) brandOk = true; });
        Object.keys(techOk).forEach((ti) => { if ((t >> (+ti)) & 1) techHit = true; });
        if (brandOk && techHit) bands = bd;
      }
      var r = bands ? reachOf(bands, f.properties.h) : 0;
      if (!r) return;
      var c = f.geometry.coordinates, k = Math.round(c[0] * 100) + ":" + Math.round(c[1] * 100), o = cell[k];
      if (o) { o.properties.n++; o.properties.r = Math.max(o.properties.r, Math.round(r)); return; }
      out.push(cell[k] = { type: "Feature", geometry: f.geometry, properties: { r: Math.round(r), n: 1 } });
    });
    return K.fc(out);
  };
  /* Overview: thinned real sites (opt208); filter by brand/tech kids; weight by local site count. */
  var buildOv = () => {
    var ov = C.overview && C.overview();
    if (!ov) return K.fc([]);
    var techOk = techOkBits(), out = [], rows = ov.pts || ov.cells || [];
    rows.forEach((row) => {
      var lat = row[0], lon = row[1], n = row[2], h = row[3], b = row[4], t = row[5], bd = row[6], r0 = row[7];
      var brandOk = false, techHit = false;
      C.brands.forEach((br, i) => { if ((b >> i) & 1 && kOn("c" + i)) brandOk = true; });
      Object.keys(techOk).forEach((ti) => { if ((t >> (+ti)) & 1) techHit = true; });
      if (!brandOk || !techHit) return;
      var r = r0 || reachOf(bd, h);
      if (!r || n < 2) return; /* lone thinned sites: skip (polka); keep corridor/town weight */
      out.push({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] },
        properties: { r: Math.round(r), n: n, ov: 1 } });
    });
    return K.fc(out);
  };
  var PX = 1 / 100600; /* pixels per metre at zoom 0 near 50°N (156,543 m/px x cos 50°) */
  /* opt210: one continuous radius curve across the z8 LOD cut — density floor far out, metre reach closer.
   * Both ov and raw features carry r and n, so the same expression works on either band. */
  /* Soft continuous radius: density far out, mild reach closer; <~25% per half-zoom, seamless at z8 cut. */
  var RAD_ALL = ["interpolate", ["linear"], ["zoom"],
    0, ["min", 18, ["+", 2.5, ["*", 1.4, ["sqrt", ["coalesce", ["get", "n"], 1]]]]],
    3, ["min", 24, ["+", 3.2, ["*", 1.7, ["sqrt", ["coalesce", ["get", "n"], 1]]]]],
    6, ["min", 32, ["+", 4.5, ["*", 2.0, ["sqrt", ["coalesce", ["get", "n"], 1]]],
      ["min", 8, ["*", ["coalesce", ["get", "r"], 8000], 80 * PX]]]],
    8, ["min", 40, ["+", 5.5, ["*", 2.2, ["sqrt", ["coalesce", ["get", "n"], 1]]],
      ["min", 14, ["*", ["coalesce", ["get", "r"], 8000], 140 * PX]]]],
    10, ["min", 52, ["+", 7, ["*", 2.4, ["sqrt", ["coalesce", ["get", "n"], 1]]],
      ["min", 22, ["*", ["coalesce", ["get", "r"], 8000], 220 * PX]]]],
    12, ["min", 64, ["+", 9, ["*", 2.6, ["sqrt", ["coalesce", ["get", "n"], 1]]],
      ["min", 32, ["*", ["coalesce", ["get", "r"], 8000], 320 * PX]]]],
    15, ["min", 80, ["+", 12, ["*", 2.8, ["sqrt", ["coalesce", ["get", "n"], 1]]],
      ["min", 48, ["*", ["coalesce", ["get", "r"], 8000], 480 * PX]]]]];
  var redraw = () => {
    if (!map || !on() || !map.getSource("ca-cov")) return;
    K.vis(map, ["ca-cov-heat"], K.kids.parentShow(true, CELL_KIDS));
    if (!K.kids.anyOn(CELL_KIDS)) { map.getSource("ca-cov").setData(K.fc([])); return; }
    var id = K.lod.band(map.getZoom(), K.lod.CUT_CELL);
    map.getSource("ca-cov").setData(id === "ov" ? buildOv() : buildRaw());
  };
  var add = () => {
    if (map.getSource("ca-cov")) return;
    map.addSource("ca-cov", { type: "geojson", data: K.fc([]), buffer: 512, attribution: "Cell coverage estimate from ISED site data" });
    map.addLayer({ id: "ca-cov-heat", type: "heatmap", source: "ca-cov", paint: {
      "heatmap-radius": RAD_ALL,
      "heatmap-weight": ["min", 3, ["+", 0.15, ["*", 0.55, ["sqrt", ["coalesce", ["get", "n"], 1]]]]], "heatmap-intensity": 0.85, "heatmap-opacity": 0.58,
      "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.03, "rgba(215,48,39,0.4)", 0.15, "rgba(254,224,139,0.6)",
        0.4, "rgba(26,152,80,0.7)", 1, "rgba(0,104,55,0.85)"] } }, K.before(map));
  };
  var apply = (m, want) => {
    map = m;
    if (want) { try { add(); } catch (e) { setTimeout(() => { if (on()) apply(m, true); }, 2000); return; } }
    /* opt220: every tech/carrier kid off → hide heatmap */
    K.vis(m, ["ca-cov-heat"], K.kids.parentShow(want, CELL_KIDS));
    C.apply();
    if (want) redraw();
  };
  window.SunnyCaCover = { on: on, redraw: redraw, reach: reachOf };
  L.add({ id: "cellcover", name: "Cell coverage, Canada (estimate)", icon: "📶", group: "Transmission", apply: apply,
    tip: "Estimate, not official coverage. Worked out from ISED site data: band reach capped by the radio horizon from the structure height. Overview at far zooms, sites when closer.",
    note: (m, isOn) => {
      if (!isOn) return "";
      if (C.loading && C.loading()) return K.lod.note(true);
      return "";
    },
    kids: TG.map((g) => { return { id: "cellcover-" + g[0], name: g[1], dflt: true }; })
      .concat(C.brands.map((b, i) => { return { id: "cellcover-c" + i, name: b[0], dflt: true }; })),
    kidSet: redraw,
    legend: () => {
      if (!K.kids.anyOn(CELL_KIDS)) return "";
      return K.legKeys([["rgba(26,152,80,0.8)", "area", "strong"], ["rgba(254,224,139,0.8)", "area", "fair"], ["rgba(215,48,39,0.6)", "area", "weak"]]) +
        "<div class=\"lp-note\">Estimate, not official coverage. Reach: under 1 GHz 8 km, 1-2.7 GHz 3 km, 3.5 GHz 1.2 km, mmWave 0.3 km, capped by the radio horizon.</div>";
    },
    attach: (m, want) => {
      map = m;
      m.on("idle", () => { if (on() && !m.getLayer("ca-cov-heat")) apply(m, true); });
      m.on("zoomend", () => { if (on()) redraw(); });
      apply(m, want);
    } });
})();
