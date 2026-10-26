// workspace/whereisthesun/waves.js
/* SUNNY waves and surf: wave height, period and direction now, from Open-Meteo Marine (free, no key).
 * Only the visible area is asked for, on a grid that gets finer as you zoom in (10° world view down to 1°),
 * at most 120 spots per request; each spot is kept for an hour. Arrows point where the waves travel.
 * Gap: model values offshore, not surf reports at a beach break. */
(() => {
  "use strict";
  var L = window.SunnyLayers, K = window.SunnyKit;
  var API = "https://marine-api.open-meteo.com/v1/marine";
  var US = /-US$/i.test((navigator.language || "") + "") || navigator.language === "en";
  var RAMP = [[0, "#3b8bd6", "calm"], [1, "#46c3a0", "1 m (3 ft)"], [2, "#f2d24b", "2 m (7 ft)"], [4, "#f28c28", "4 m (13 ft)"], [6, "#d7301f", "6 m+ (20 ft)"]];
  var IDS = ["wave-dot", "wave-arrow"], seen = Object.create(null), busy = false, wait = null;
  var step = (z) => { return z < 3 ? 10 : z < 5 ? 5 : z < 7 ? 2 : 1; };
  var cells = (map) => {
    var b = map.getBounds(), s = step(map.getZoom()), out = [];
    var w = Math.max(-180, Math.floor(b.getWest() / s) * s), e = Math.min(180, b.getEast());
    var so = Math.max(-75, Math.floor(b.getSouth() / s) * s), n = Math.min(75, b.getNorth());
    for (var x = w; x <= e; x += s) for (var y = so; y <= n; y += s) out.push([x + s / 2, y + s / 2]);
    return out;
  };
  var key = (c) => { return c[0].toFixed(1) + "," + c[1].toFixed(1); };
  var feats = (map) => {
    var out = [];
    cells(map).forEach((c) => {
      var v = seen[key(c)];
      if (v && v.h != null) out.push({ type: "Feature", properties: v, geometry: { type: "Point", coordinates: c } });
    });
    return K.fc(out);
  };
  var draw = (map) => { if (map.getSource("waves")) map.getSource("waves").setData(feats(map)); };
  var fetchView = (map) => {
    if (busy || !L.isOn("waves")) return;
    var t = Date.now(), need = cells(map).filter((c) => { var v = seen[key(c)]; return !v || t - v.t > 36e5; }).slice(0, 120);
    draw(map);
    if (!need.length) return;
    busy = true;
    var u = API + "?latitude=" + need.map((c) => { return c[1].toFixed(2); }).join(",") + "&longitude=" + need.map((c) => { return c[0].toFixed(2); }).join(",") +
      "&current=wave_height,wave_period,wave_direction";
    fetch(u).then((r) => { if (!r.ok) throw new Error("waves " + r.status); return r.json(); }).then((j) => {
      (Array.isArray(j) ? j : [j]).forEach((o, i) => {
        var c = o && o.current || {};
        seen[key(need[i])] = { t: t, h: c.wave_height, p: c.wave_period, d: c.wave_direction, r: c.wave_direction == null ? 0 : (c.wave_direction + 180) % 360 };
      });
      busy = false; draw(map);
      if (cells(map).some((c) => { return !seen[key(c)]; })) setTimeout(() => { fetchView(map); }, 1500);
    }).catch(() => { busy = false; setTimeout(() => { fetchView(map); }, 30000); }); /* busy service: try again later, nothing is guessed */
  };
  var color = ["interpolate", ["linear"], ["get", "h"]].concat(...RAMP.map((r) => { return [r[0], r[1]]; }));
  var text = (p) => {
    var h = US ? (p.h * 3.281).toFixed(1) + " ft" : p.h.toFixed(1) + " m";
    var from = p.d == null ? "" : " from " + ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(p.d / 45) % 8];
    return ["Waves " + h + (p.p != null ? " every " + Math.round(p.p) + " s" : ""), from ? "swell" + from : "wave model"];
  };
  var apply = (map, on) => {
    if (on && !map.getSource("waves")) {
      try {
        map.addSource("waves", { type: "geojson", data: K.fc([]),
          attribution: 'Waves: <a href="https://open-meteo.com/en/docs/marine-weather-api" target="_blank" rel="noopener">Open-Meteo Marine</a>' });
        map.addLayer({ id: "wave-dot", type: "circle", source: "waves", paint: { "circle-color": "#000", "circle-opacity": 0,
          "circle-radius": 10 } }, K.before(map));
        map.addLayer({ id: "wave-arrow", type: "symbol", source: "waves",
          layout: { "text-field": "▲", "text-font": ["Noto Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 1, 13, 6, 20], "text-rotate": ["get", "r"],
            "text-allow-overlap": true, "text-rotation-alignment": "map" },
          paint: { "text-color": color, "text-halo-color": "#0b1a2a", "text-halo-width": 1.2 } }, K.before(map)); /* coloured arrows, unlike any dot layer */
      } catch (e) { setTimeout(() => { if (L.isOn("waves")) apply(map, true); }, 2000); return; } /* style not ready yet */
    }
    K.vis(map, IDS, on);
    if (on) fetchView(map);
  };
  L.add({ id: "waves", name: "Waves and surf", icon: "🌊", group: "Ocean", taps: ["wave-dot"], dflt: true, apply: apply,
    legend: K.legKeys(RAMP.map((r) => { return [r[1], "line", r[2]]; })) + '<span class="ls-k">▲ points where the waves travel</span>',
    tip: "Wave height, period and direction now (Open-Meteo Marine model). Only the area on screen is loaded",
    attach: (map, on) => {
      var hw = (window.SunnyHoverName = window.SunnyHoverName || {});
      hw["wave-dot"] = hw["wave-arrow"] = (f) => { return Promise.resolve(text(f.properties)); };
      map.on("moveend", () => { clearTimeout(wait); wait = setTimeout(() => { fetchView(map); }, 600); });
      map.on("idle", () => {
        if (!L.isOn("waves")) return;
        if (!map.getSource("waves")) { apply(map, true); return; }
        var ls = map.getStyle().layers.map((l) => { return l.id; }), b = K.before(map);
        if (b && ls.indexOf(b) !== ls.indexOf("wave-arrow") + 1) IDS.forEach((id) => { try { map.moveLayer(id, b); } catch (e) {} }); /* above tints and dots */
      });
      map.on("click", "wave-dot", (e) => {
        var p = e.features[0].properties, t = text(p);
        var note = "Model value for this " + step(map.getZoom()) + "° square, kept for an hour";
        K.show(map, e.lngLat, t[0], [t[1], note], ["Open-Meteo Marine", "https://open-meteo.com/en/docs/marine-weather-api"]);
      });
      apply(map, on);
    } });
})();
