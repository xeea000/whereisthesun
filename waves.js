// workspace/whereisthesun/waves.js
/* SUNNY waves and surf: wave height, period and direction now, from Open-Meteo Marine (free, no key).
 * Viewport grid gets finer with zoom (~5° world → ~0.08° close in). Up to 300 spots per request,
 * sampled evenly so the first batch fills the view (not just the SW corner). Spots kept one hour.
 * Arrows sized and coloured by height; cell_selection=sea prefers water. Gap: model, not beach breaks. */
(() => {
  "use strict";
  var L = window.SunnyLayers, K = window.SunnyKit;
  var API = "https://marine-api.open-meteo.com/v1/marine";
  var US = /-US$/i.test((navigator.language || "") + "") || navigator.language === "en";
  var RAMP = [[0, "#3b8bd6", "calm"], [1, "#46c3a0", "1 m (3 ft)"], [2, "#f2d24b", "2 m (7 ft)"], [4, "#f28c28", "4 m (13 ft)"], [6, "#d7301f", "6 m+ (20 ft)"]];
  var IDS = ["wave-dot", "wave-arrow"], seen = Object.create(null), busy = false, wait = null;
  var MAX_REQ = 300, TTL = 36e5;
  var stepOf = (z) => {
    if (z < 3) return 5;
    if (z < 4) return 3;
    if (z < 5) return 2;
    if (z < 6) return 1;
    if (z < 7) return 0.75;
    if (z < 8) return 0.5;
    if (z < 9) return 0.35;
    if (z < 10) return 0.25;
    if (z < 12) return 0.15;
    if (z < 14) return 0.1;
    return 0.08;
  };
  var key = (c) => { return c[0].toFixed(2) + "," + c[1].toFixed(2); };
  var cells = (map) => {
    var b = map.getBounds(), s = stepOf(map.getZoom()), out = [];
    var w = Math.max(-180, Math.floor(b.getWest() / s) * s), e = Math.min(180, b.getEast());
    var so = Math.max(-75, Math.floor(b.getSouth() / s) * s), n = Math.min(75, b.getNorth());
    for (var x = w; x <= e + 1e-9; x += s) for (var y = so; y <= n + 1e-9; y += s) {
      out.push([+(x + s / 2).toFixed(3), +(y + s / 2).toFixed(3)]);
    }
    return out;
  };
  var takeEven = (arr, n) => {
    if (arr.length <= n) return arr.slice();
    var out = [], stride = arr.length / n, i;
    for (i = 0; i < n; i++) out.push(arr[Math.min(arr.length - 1, Math.floor(i * stride))]);
    return out;
  };
  var feats = (map) => {
    var out = [], s = stepOf(map.getZoom()), bucket = Object.create(null);
    cells(map).forEach((c) => {
      var v = seen[key(c)];
      if (v && v.h != null) out.push({ type: "Feature", properties: v, geometry: { type: "Point", coordinates: c } });
    });
    /* also show any cached spots in view (from a finer zoom) so zooming out stays useful */
    if (out.length < 40) {
      var b = map.getBounds(), t = Date.now();
      Object.keys(seen).forEach((k) => {
        var v = seen[k];
        if (!v || v.h == null || t - v.t > TTL) return;
        var lon = v.lon, lat = v.lat;
        if (lon == null || lat < b.getSouth() || lat > b.getNorth()) return;
        if (lon < b.getWest() || lon > b.getEast()) return;
        var bk = Math.floor(lon / s) + ":" + Math.floor(lat / s);
        if (bucket[bk]) return;
        bucket[bk] = 1;
        out.push({ type: "Feature", properties: v, geometry: { type: "Point", coordinates: [lon, lat] } });
      });
    }
    return K.fc(out);
  };
  var draw = (map) => { if (map.getSource("waves")) map.getSource("waves").setData(feats(map)); };
  var fetchView = (map) => {
    if (busy || !L.isOn("waves")) return;
    var t = Date.now(), all = cells(map);
    var need = all.filter((c) => { var v = seen[key(c)]; return !v || t - v.t > TTL; });
    need = takeEven(need, MAX_REQ);
    draw(map);
    if (!need.length) return;
    busy = true;
    var body = "latitude=" + need.map((c) => { return c[1].toFixed(2); }).join(",") +
      "&longitude=" + need.map((c) => { return c[0].toFixed(2); }).join(",") +
      "&current=wave_height,wave_period,wave_direction&cell_selection=sea";
    var req = body.length < 5500
      ? fetch(API + "?" + body)
      : fetch(API, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body });
    req.then((r) => { if (!r.ok) throw new Error("waves " + r.status); return r.json(); }).then((j) => {
      (Array.isArray(j) ? j : [j]).forEach((o, i) => {
        var c = o && o.current || {}, pt = need[i];
        if (!pt) return;
        seen[key(pt)] = { t: t, h: c.wave_height, p: c.wave_period, d: c.wave_direction,
          r: c.wave_direction == null ? 0 : (c.wave_direction + 180) % 360, lon: pt[0], lat: pt[1] };
      });
      busy = false; draw(map);
      if (all.some((c) => { var v = seen[key(c)]; return !v || t - v.t > TTL; })) {
        setTimeout(() => { fetchView(map); }, 1200);
      }
    }).catch(() => { busy = false; setTimeout(() => { fetchView(map); }, 30000); });
  };
  var color = ["interpolate", ["linear"], ["get", "h"]].concat(...RAMP.map((r) => { return [r[0], r[1]]; }));
  /* taller waves → bigger ▲; also grows with zoom (MapLibre accepts nested interpolate here) */
  var size = ["interpolate", ["linear"], ["zoom"],
    2, ["interpolate", ["linear"], ["get", "h"], 0, 11, 1, 14, 2, 17, 4, 20, 6, 22],
    7, ["interpolate", ["linear"], ["get", "h"], 0, 14, 1, 18, 2, 22, 4, 26, 6, 30],
    11, ["interpolate", ["linear"], ["get", "h"], 0, 16, 1, 20, 2, 26, 4, 32, 6, 36]];
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
          "circle-radius": ["interpolate", ["linear"], ["get", "h"], 0, 10, 6, 18] } }, K.before(map));
        map.addLayer({ id: "wave-arrow", type: "symbol", source: "waves",
          layout: { "text-field": "▲", "text-font": ["Noto Sans Regular"], "text-size": size, "text-rotate": ["get", "r"],
            "text-allow-overlap": true, "text-ignore-placement": true, "text-rotation-alignment": "map" },
          paint: { "text-color": color, "text-halo-color": "#0b1a2a", "text-halo-width": 1.2 } }, K.before(map));
      } catch (e) { setTimeout(() => { if (L.isOn("waves")) apply(map, true); }, 2000); return; }
    }
    K.vis(map, IDS, on);
    if (on) fetchView(map);
  };
  L.add({ id: "waves", name: "Waves and surf", icon: "🌊", group: "Ocean", taps: ["wave-dot"], dflt: true, apply: apply,
    legend: K.legKeys(RAMP.map((r) => { return [r[1], "line", r[2]]; })) +
      '<span class="ls-k">▲ travel direction · bigger = taller</span>',
    tip: "Wave height, period and direction now (Open-Meteo Marine). Grid densifies as you zoom; only the view is loaded",
    attach: (map, on) => {
      var hw = (window.SunnyHoverName = window.SunnyHoverName || {});
      hw["wave-dot"] = hw["wave-arrow"] = (f) => { return Promise.resolve(text(f.properties)); };
      map.on("moveend", () => { clearTimeout(wait); wait = setTimeout(() => { fetchView(map); }, 500); });
      map.on("idle", () => {
        if (!L.isOn("waves")) return;
        if (!map.getSource("waves")) { apply(map, true); return; }
        var ls = map.getStyle().layers.map((l) => { return l.id; }), b = K.before(map);
        if (b && ls.indexOf(b) !== ls.indexOf("wave-arrow") + 1) IDS.forEach((id) => { try { map.moveLayer(id, b); } catch (e) {} });
      });
      map.on("click", "wave-dot", (e) => {
        var p = e.features[0].properties, t = text(p);
        var note = "Model value near this spot (" + stepOf(map.getZoom()) + "° grid), kept for an hour";
        K.show(map, e.lngLat, t[0], [t[1], note], ["Open-Meteo Marine", "https://open-meteo.com/en/docs/marine-weather-api"]);
      });
      apply(map, on);
    } });
})();
