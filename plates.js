// workspace/whereisthesun/plates.js
/* SUNNY opt123: tectonic plates and their motion.
 * Plates and typed boundaries: Bird (2003) PB2002 via github.com/fraxen/tectonicplates (ODC-By), 72 KB gzipped, cached for good.
 * Motion: NNR-MORVEL56 rotation poles (Argus, Gordon and DeMets 2011) on a 3 degree grid, 4 KB gzipped,
 * drawn with the wind particle engine, sped up about a trillion times so it can be seen. */
(() => {
  "use strict";
  var L = window.SunnyLayers, K = window.SunnyKit;
  var SRC = ["Bird 2003 PB2002, fraxen/tectonicplates", "https://github.com/fraxen/tectonicplates"];
  var MV = ["NNR-MORVEL56, Argus et al. 2011", "https://doi.org/10.1029/2011GC003751"];
  var KIND = { sub: ["#ff3b30", "Subduction: one plate dives under"], conv: ["#ff9f1c", "Collision: plates push together"],
    div: ["#2ec4b6", "Spreading: plates pull apart"], tr: ["#c77dff", "Transform: plates slide past"] };
  var names = {}, grid = null;
  var load = () => { return K.loadJson("data/world/plates.geo.json"); };
  var apply = (map, on) => {
    K.vis(map, ["plate-fill", "plate-edge"], on);
    if (!on) return;
    load().then((g) => {
      g.features.forEach((f) => { if (f.properties.t === "plate") names[f.properties.code] = f.properties.name; });
      if (!map.getSource("plates")) map.addSource("plates", { type: "geojson", data: g,
        attribution: 'Plates: <a href="' + SRC[1] + '" target="_blank" rel="noopener">Bird 2003</a>, motion: <a href="' + MV[1] + '" target="_blank" rel="noopener">NNR-MORVEL56</a>' });
      if (!map.getLayer("plate-fill")) map.addLayer({ id: "plate-fill", type: "fill", source: "plates", filter: ["==", ["get", "t"], "plate"],
        paint: { "fill-color": "#8899aa", "fill-opacity": 0.04 } }, K.before(map));
      if (!map.getLayer("plate-edge")) map.addLayer({ id: "plate-edge", type: "line", source: "plates", filter: ["==", ["get", "t"], "edge"],
        paint: { "line-color": ["match", ["get", "k"], "sub", KIND.sub[0], "conv", KIND.conv[0], "div", KIND.div[0], KIND.tr[0]],
          "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1.4, 6, 3] } }, K.before(map));
      K.vis(map, ["plate-fill", "plate-edge"], L.isOn("plates"));
    }).catch(() => {});
  };
  var pname = (c) => { return names[c] || c; };
  var at = (lon, lat) => {
    if (!grid) return null;
    var x = Math.floor((((lon + 180) % 360) + 360) % 360 / grid.step), y = Math.floor((lat - grid.lat0) / grid.step);
    if (y < 0 || y * grid.step + grid.lat0 >= 90) return null;
    var i = y * grid.nx + x;
    return { u: grid.u[i], v: grid.v[i] };
  };
  L.add({ id: "plates", name: "Tectonic plates", icon: "🧩", group: "Earth", taps: ["plate-edge", "plate-fill"], dflt: true,
    tip: "The 52 plates of Bird's PB2002 model and the type of each boundary",
    legend: K.legKeys(Object.keys(KIND).map((k) => { return [KIND[k][0], "line", KIND[k][1]]; })), apply: apply,
    attach: (map, on) => {
      map.on("idle", () => { if (L.isOn("plates") && !map.getLayer("plate-edge")) apply(map, true); });
      map.on("click", "plate-edge", (e) => {
        var p = e.features[0].properties, ab = String(p.pair).split(/[-\/\\]/);
        K.show(map, e.lngLat, KIND[p.k][1].split(":")[0] + " boundary", [K.esc(pname(ab[0]) + " and " + pname(ab[1] || "")),
          K.esc(KIND[p.k][1].split(": ")[1].replace(/^./, (c) => { return c.toUpperCase(); })), "Moving about " + Math.round(p.v) + " mm a year against each other"], SRC);
      });
      map.on("click", "plate-fill", (e) => {
        if (map.queryRenderedFeatures(e.point, { layers: ["plate-edge"] }).length) return;
        var p = e.features[0].properties, s = at(e.lngLat.lng, e.lngLat.lat);
        var rows = [K.esc(p.name) + " plate"];
        if (s) rows.push("Here it moves about " + Math.round(Math.hypot(s.u, s.v)) + " mm a year, toward " + Math.round((Math.atan2(s.u, s.v) * 180 / Math.PI + 360) % 360) + "°");
        K.show(map, e.lngLat, p.name + " plate", rows, MV);
      });
      apply(map, on);
    } });
  /* plate motion streaks */
  var gl = null, cv = null, raf = 0, lastT = 0, mapRef = null;
  var field = { sample: (lon, lat) => { var s = at(lon, lat); return s && (s.u || s.v) ? { u: s.u / 3, v: s.v / 3 } : null; } };
  var tick = (t) => {
    raf = requestAnimationFrame(tick);
    if (document.hidden || !gl) return;
    var dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0.016; lastT = t;
    var dpr = window.devicePixelRatio || 1, w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.frame(mapRef, dt, 0.7, dpr);
  };
  var motion = (map, on) => {
    mapRef = map;
    if (!on) { if (raf) cancelAnimationFrame(raf); raf = 0; if (cv) cv.style.display = "none"; return; }
    K.loadJson("data/world/plate-motion.json").then((g) => {
      grid = g;
      if (!L.isOn("platemotion") || raf) return;
      if (!cv) {
        cv = document.createElement("canvas"); cv.id = "plate-gl-canvas"; cv.setAttribute("aria-hidden", "true");
        cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
        map.getCanvasContainer().appendChild(cv);
        gl = window.SunnyWindGL && window.SunnyWindGL.create(cv, innerWidth < 700 ? 2500 : 5000, field);
      }
      cv.style.display = "";
      lastT = 0; raf = requestAnimationFrame(tick);
    }).catch(() => {});
  };
  L.add({ id: "platemotion", name: "Plate motion", icon: "➡️", group: "Earth", dflt: true, apply: motion,
    tip: "Streaks show where each plate is heading (NNR-MORVEL56), sped up hugely: real plates move 0 to 170 mm a year",
    legend: K.legKeys([["#ffffff", "line", "streak: direction of plate motion, faster = longer"]]),
    attach: (map, on) => { K.loadJson("data/world/plate-motion.json").then((g) => { grid = g; }).catch(() => {}); motion(map, on); } });
})();
