// workspace/whereisthesun/waves.js
/* SUNNY waves and surf: wave height, period and direction now, from Open-Meteo Marine (free, no key).
 * Viewport grid densifies with zoom. Sample points are pre-filtered with a small Natural Earth
 * water mask (data/wave-water-mask.json) and post-filtered by returned-cell distance and elevation
 * so dry land never gets an arrow (Great Lakes stay via the lakes bits). Place on the request
 * sample when it is water — Open-Meteo elev is for the request, and the nearest marine cell can
 * sit on land. Up to 300 spots per request, even sample, one-hour cache. Gap: model, not breaks. */
(() => {
  "use strict";
  var L = window.SunnyLayers, K = window.SunnyKit;
  var API = "https://marine-api.open-meteo.com/v1/marine";
  var US = /-US$/i.test((navigator.language || "") + "") || navigator.language === "en";
  var RAMP = [[0, "#3b8bd6", "calm"], [1, "#46c3a0", "1 m (3 ft)"], [2, "#f2d24b", "2 m (7 ft)"], [4, "#f28c28", "4 m (13 ft)"], [6, "#d7301f", "6 m+ (20 ft)"]];
  var IDS = ["wave-dot", "wave-arrow"], seen = Object.create(null), busy = false, wait = null;
  var MAX_REQ = 300, TTL = 36e5, MAX_SNAP_KM = 18, OCEAN_ELEV_M = 8;
  var mask = null, maskWait = null;
  var stepOf = (z) => {
    if (z < 3) return 4;
    if (z < 4) return 2.5;
    if (z < 5) return 1.5;
    if (z < 6) return 1;
    if (z < 7) return 0.6;
    if (z < 8) return 0.4;
    if (z < 9) return 0.25;
    if (z < 10) return 0.18;
    if (z < 12) return 0.12;
    if (z < 14) return 0.08;
    return 0.05;
  };
  var key = (c) => { return c[0].toFixed(2) + "," + c[1].toFixed(2); };
  var b64 = (s) => {
    var bin = atob(s), out = new Uint8Array(bin.length), i;
    for (i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  var gunzip = (u8) => {
    if (typeof DecompressionStream === "undefined") return Promise.reject(new Error("no decompress"));
    return new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()
      .then((ab) => { return new Uint8Array(ab); });
  };
  var ensureMask = () => {
    if (mask) return Promise.resolve(mask);
    if (maskWait) return maskWait;
    maskWait = K.loadJson("data/wave-water-mask.json").then((m) => {
      var enc = m.enc === "gzip";
      var decode = (s) => {
        var raw = b64(s || "");
        return enc ? gunzip(raw) : Promise.resolve(raw);
      };
      return Promise.all([decode(m.fetch || m.water), decode(m.strict || m.water), decode(m.lakes || "")]).then((bufs) => {
        mask = { step: m.step, lon0: m.lon0, lat0: m.lat0, cols: m.cols, rows: m.rows,
          fetch: bufs[0], strict: bufs[1], lakes: bufs[2] && bufs[2].length ? bufs[2] : null };
        return mask;
      });
    }).catch(() => { maskWait = null; return null; });
    return maskWait;
  };
  var maskIndex = (lon, lat) => {
    if (!mask) return -1;
    var c = Math.floor((lon - mask.lon0) / mask.step), r = Math.floor((lat - mask.lat0) / mask.step);
    if (c < 0 || r < 0 || c >= mask.cols || r >= mask.rows) return -1;
    return r * mask.cols + c;
  };
  var bitOn = (buf, i) => { return !!(buf && buf[i >> 3] & (1 << (i & 7))); };
  var isFetchWater = (lon, lat) => {
    if (!mask) return true;
    var i = maskIndex(lon, lat);
    return i >= 0 && bitOn(mask.fetch, i);
  };
  var isStrictWater = (lon, lat) => {
    if (!mask) return false;
    var i = maskIndex(lon, lat);
    return i >= 0 && bitOn(mask.strict, i);
  };
  var isLake = (lon, lat) => {
    if (!mask || !mask.lakes) return false;
    var i = maskIndex(lon, lat);
    return i >= 0 && bitOn(mask.lakes, i);
  };
  var distKm = (lon1, lat1, lon2, lat2) => {
    var dy = (lat2 - lat1) * 111, dx = (lon2 - lon1) * 111 * Math.cos(lat1 * Math.PI / 180);
    return Math.sqrt(dx * dx + dy * dy);
  };
  /* Open-Meteo often returns a nearest ocean cell for land; elev is for the request point.
   * Keep arrows on water: place on the request sample when it is water; else use the returned cell. */
  var accept = (reqLon, reqLat, o, cur) => {
    if (!cur || cur.wave_height == null) return null;
    var glon = o.longitude != null ? o.longitude : reqLon, glat = o.latitude != null ? o.latitude : reqLat;
    var elev = o.elevation, d = distKm(reqLon, reqLat, glon, glat);
    if (d > MAX_SNAP_KM) return null;
    if (typeof elev !== "number" || !isFinite(elev)) return null;
    var reqLake = isLake(reqLon, reqLat), gLake = isLake(glon, glat);
    if (reqLake || gLake) {
      if (d > 12) return null;
      if (reqLake) return { lon: reqLon, lat: reqLat };
      return { lon: glon, lat: glat };
    }
    if (elev > OCEAN_ELEV_M) return null;
    if (isStrictWater(reqLon, reqLat)) return { lon: reqLon, lat: reqLat };
    if (isStrictWater(glon, glat)) return { lon: glon, lat: glat };
    /* elev 0 bay / nearshore: only if undilated mask agrees on the returned cell */
    if (elev === 0 && mask && isFetchWater(glon, glat) && isStrictWater(glon, glat)) return { lon: glon, lat: glat };
    return null;
  };
  var cells = (map) => {
    var b = map.getBounds(), s = stepOf(map.getZoom()), out = [];
    var w = Math.max(-180, Math.floor(b.getWest() / s) * s), e = Math.min(180, b.getEast());
    var so = Math.max(-75, Math.floor(b.getSouth() / s) * s), n = Math.min(75, b.getNorth());
    for (var x = w; x <= e + 1e-9; x += s) for (var y = so; y <= n + 1e-9; y += s) {
      var lon = +(x + s / 2).toFixed(3), lat = +(y + s / 2).toFixed(3);
      if (isFetchWater(lon, lat)) out.push([lon, lat]);
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
    var out = [], s = stepOf(map.getZoom()), bucket = Object.create(null), b = map.getBounds(), t = Date.now();
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
    return K.fc(out);
  };
  var draw = (map) => { if (map.getSource("waves")) map.getSource("waves").setData(feats(map)); };
  var fetchView = (map) => {
    if (busy || !L.isOn("waves")) return;
    ensureMask().then(() => {
      if (busy || !L.isOn("waves")) return;
      var t = Date.now(), all = cells(map);
      var need = all.filter((c) => { var v = seen[key(c)]; return !v || t - v.t > TTL; });
      need = takeEven(need, MAX_REQ);
      draw(map);
      if (!need.length) return;
      busy = true;
      var body = "latitude=" + need.map((c) => { return c[1].toFixed(2); }).join(",") +
        "&longitude=" + need.map((c) => { return c[0].toFixed(2); }).join(",") +
        "&current=wave_height,wave_period,wave_direction";
      var req = body.length < 5500
        ? fetch(API + "?" + body)
        : fetch(API, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body });
      req.then((r) => { if (!r.ok) throw new Error("waves " + r.status); return r.json(); }).then((j) => {
        (Array.isArray(j) ? j : [j]).forEach((o, i) => {
          var cur = o && o.current || {}, pt = need[i];
          if (!pt) return;
          var ok = accept(pt[0], pt[1], o || {}, cur);
          if (!ok) {
            seen[key(pt)] = { t: t, h: null, lon: pt[0], lat: pt[1] };
            return;
          }
          seen[key(pt)] = { t: t, h: cur.wave_height, p: cur.wave_period, d: cur.wave_direction,
            r: cur.wave_direction == null ? 0 : (cur.wave_direction + 180) % 360, lon: ok.lon, lat: ok.lat };
        });
        busy = false; draw(map);
        if (all.some((c) => { var v = seen[key(c)]; return !v || t - v.t > TTL; })) {
          setTimeout(() => { fetchView(map); }, 1200);
        }
      }).catch(() => { busy = false; setTimeout(() => { fetchView(map); }, 45000); });
    });
  };
  var color = ["interpolate", ["linear"], ["get", "h"]].concat(...RAMP.map((r) => { return [r[0], r[1]]; }));
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
    if (on) { ensureMask(); fetchView(map); }
  };
  L.add({ id: "waves", name: "Waves and surf", icon: "🌊", group: "Ocean", taps: ["wave-dot"], dflt: true, apply: apply,
    legend: K.legKeys(RAMP.map((r) => { return [r[1], "line", r[2]]; })) +
      '<span class="ls-k">▲ travel direction · bigger = taller · water only</span>',
    tip: "Wave height, period and direction now (Open-Meteo Marine). Ocean and large lakes only; densifies as you zoom",
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
        var note = "Model value for this water cell (" + stepOf(map.getZoom()) + "° grid), kept for an hour";
        K.show(map, e.lngLat, t[0], [t[1], note], ["Open-Meteo Marine", "https://open-meteo.com/en/docs/marine-weather-api"]);
      });
      apply(map, on);
    } });
})();
