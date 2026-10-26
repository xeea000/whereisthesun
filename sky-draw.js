// workspace/whereisthesun/sky-draw.js
/* SUNNY sky drawings on the map (opt95), all worked out on the phone, no extra downloads except
 * the night-sky grid (one Open-Meteo call for 16 points per view, kept an hour):
 *   Satellites  icon at the live position, ground track for the last 45 min (faint) and next 90 min
 *               (bright), the next visible pass over you in yellow with a line from you to its peak.
 *   Moon        moon marker at the sub-lunar point (where it is straight overhead), day/night line,
 *               and moonrise and moonset direction lines from the map centre.
 *   Meteors     the next shower's radiant direction from the map centre, with the peak date.
 *   Night sky   a 4 x 4 coloured grid of tonight's stargazing score over the view (red poor, green good). */
(() => {
  "use strict";
  var K = window.SunnyKit;
  var L = window.SunnyLayers;
  if (!K || !L) return;
  var D2R = Math.PI / 180;
  /* IMO radiants: right ascension and declination in degrees */
  var RADIANT = { Quadrantids: [230, 49], Lyrids: [271, 34], "Eta Aquariids": [338, -1], "Southern Delta Aquariids": [340, -16], Perseids: [48, 58],
    Draconids: [262, 54], Orionids: [95, 16], "Northern Taurids": [58, 22], Leonids: [152, 22], Geminids: [112, 33], Ursids: [217, 76] };
  var map = null;
  var labels = [];
  var gridKey = "";
  function S() {
    return window.SunnySky;
  }
  function gmst(d) {
    return (280.46061837 + 360.98564736629 * (d.getTime() / 864e5 - 10957.5)) % 360;
  }
  function wrap(lon) {
    return ((lon + 540) % 360) - 180;
  }
  function sunRaDec(d) {
    var n = d.getTime() / 864e5 - 10957.5;
    var g = (357.529 + 0.98560028 * n) * D2R;
    var lam = (280.459 + 0.98564736 * n + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R;
    var e = 23.439 * D2R;
    return { ra: Math.atan2(Math.cos(e) * Math.sin(lam), Math.cos(lam)) / D2R, dec: Math.asin(Math.sin(e) * Math.sin(lam)) / D2R };
  }
  /* low-precision moon position, same series as SunCalc */
  function moonRaDec(d) {
    var n = d.getTime() / 864e5 - 10957.5;
    var Lm = (218.316 + 13.176396 * n) * D2R;
    var M = (134.963 + 13.064993 * n) * D2R;
    var F = (93.272 + 13.22935 * n) * D2R;
    var l = Lm + 6.289 * D2R * Math.sin(M);
    var b = 5.128 * D2R * Math.sin(F);
    var e = 23.4397 * D2R;
    var ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
    var dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
    return { ra: ra / D2R, dec: dec / D2R };
  }
  function subPoint(rd, d) {
    return [wrap(rd.ra - gmst(d)), rd.dec];
  }
  function night(d) {
    var sp = subPoint(sunRaDec(d), d);
    var dec = sp[1] === 0 ? 0.01 : sp[1];
    var ring = [];
    for (var lon = -180; lon <= 180; lon += 2) {
      ring.push([lon, Math.atan(-Math.cos((lon - sp[0]) * D2R) / Math.tan(dec * D2R)) / D2R]);
    }
    var pole = dec > 0 ? -85 : 85;
    ring.push([180, pole], [-180, pole], ring[0]);
    return { type: "Feature", properties: { k: "night" }, geometry: { type: "Polygon", coordinates: [ring] } };
  }
  function dest(lat, lng, az, km) {
    var dr = km / 6371;
    var p1 = lat * D2R;
    var b = az * D2R;
    var p2 = Math.asin(Math.sin(p1) * Math.cos(dr) + Math.cos(p1) * Math.sin(dr) * Math.cos(b));
    var l2 = lng * D2R + Math.atan2(Math.sin(b) * Math.sin(dr) * Math.cos(p1), Math.cos(dr) - Math.sin(p1) * Math.sin(p2));
    return [wrap(l2 / D2R), p2 / D2R];
  }
  function ray(h, az, km, k) {
    var pts = [];
    for (var i = 0; i <= 10; i++) pts.push(dest(h.lat, h.lng, az, km * i / 10));
    return { type: "Feature", properties: { k: k }, geometry: { type: "LineString", coordinates: pts } };
  }
  /* split a track where it crosses the date line */
  function lines(pts, k) {
    var out = [];
    var cur = [];
    pts.forEach((p, i) => {
      if (i && Math.abs(p[0] - pts[i - 1][0]) > 180) {
        if (cur.length > 1) out.push(cur);
        cur = [];
      }
      cur.push(p);
    });
    if (cur.length > 1) out.push(cur);
    return out.map((c) => { return { type: "Feature", properties: { k: k }, geometry: { type: "LineString", coordinates: c } }; });
  }
  function radiantAzAlt(rd, h, d) {
    var ha = (gmst(d) + h.lng - rd[0]) * D2R;
    var la = h.lat * D2R;
    var de = rd[1] * D2R;
    var alt = Math.asin(Math.sin(la) * Math.sin(de) + Math.cos(la) * Math.cos(de) * Math.cos(ha));
    var az = Math.atan2(-Math.sin(ha), Math.tan(de) * Math.cos(la) - Math.sin(la) * Math.cos(ha));
    return { az: (az / D2R + 360) % 360, alt: alt / D2R };
  }
  function label(ll, html, cls) {
    var el = document.createElement("div");
    el.className = "sky-lbl " + (cls || "");
    el.innerHTML = html;
    labels.push(new window.maplibregl.Marker({ element: el, anchor: "left", offset: [6, 0] }).setLngLat(ll).addTo(map));
  }
  function clearLabels() {
    labels.forEach((m) => { m.remove(); });
    labels = [];
  }
  function satFeats(h, now) {
    var out = [];
    var sky = S();
    /* opt102: live tracks are drawn by sats.js; here only the next pass arc */
    var p = sky.passes()[0];
    if (p && h) {
      var s2 = sky.sats().filter((x) => { return x.name === p.name; })[0];
      var arc = [];
      var top = null;
      for (var t2 = p.start.getTime() - 60000; s2 && t2 < p.start.getTime() + 15 * 60000; t2 += 20000) {
        var a2 = sky.look(s2.rec, new Date(t2));
        if (!a2 || a2.el < 10) {
          if (arc.length) break;
          continue;
        }
        arc.push([a2.lng, a2.lat]);
        if (!top || a2.el > top.el) top = a2;
      }
      out = out.concat(lines(arc, "pass"));
      if (top) {
        out.push({ type: "Feature", properties: { k: "pass-link" }, geometry: { type: "LineString", coordinates: [[h.lng, h.lat], [top.lng, top.lat]] } });
        label([top.lng, top.lat], "🛰️ " + K.esc(p.name) + " " + K.esc(sky.fmtTime(p.start)) + ", " + Math.round(p.max) + "° high", "sky-pass");
      }
    }
    return out;
  }
  function redraw() {
    var sky = S();
    if (!map || !sky) return;
    clearLabels();
    var now = new Date();
    var h = sky.here();
    var f = [];
    if (L.isOn("moon")) {
      f.push(night(now));
      var mp = subPoint(moonRaDec(now), now);
      f.push({ type: "Feature", properties: { k: "moon" }, geometry: { type: "Point", coordinates: mp } });
      label(mp, "🌙 Moon overhead here", "sky-moon");
      if (h && window.SunCalc) {
        var mt = window.SunCalc.getMoonTimes(now, h.lat, h.lng);
        [["rise", mt.rise, "Moonrise"], ["set", mt.set, "Moonset"]].forEach((r) => {
          if (!r[1]) return;
          var az = window.SunCalc.getMoonPosition(r[1], h.lat, h.lng).azimuth / D2R + 180;
          var g = ray(h, az, 350, "moon-" + r[0]);
          f.push(g);
          label(g.geometry.coordinates[10], K.esc(r[2]) + " " + K.esc(sky.fmtTime(r[1])) + " " + sky.compass(az), "sky-moon");
        });
        var sh = sky.nextShower();
        var rd = sh && RADIANT[sh.n];
        if (rd) {
          var t2 = new Date(now);
          t2.setHours(26, 0, 0, 0);
          var aa = radiantAzAlt(rd, h, t2);
          var g2 = ray(h, aa.az, 280, "radiant");
          f.push(g2);
          var when = sh.d.toLocaleDateString([], { month: "short", day: "numeric" });
          label(g2.geometry.coordinates[10], "☄️ " + K.esc(sh.n) + " radiant, peak " + K.esc(when) + "<br>" + sky.compass(aa.az) + ", " +
            Math.max(0, Math.round(aa.alt)) + "° up at 2 AM", "sky-met");
        }
      }
    }
    if (L.isOn("sats") && sky.sats().length) f = f.concat(satFeats(h, now));
    try {
      if (!map.getSource("sky-draw")) {
        map.addSource("sky-draw", { type: "geojson", data: K.fc(f) });
        map.addLayer({ id: "sky-night", type: "fill", source: "sky-draw", filter: ["==", ["get", "k"], "night"], paint: { "fill-color": "#000820", "fill-opacity": 0.28 } }, K.before(map));
        map.addLayer({ id: "sky-lines", type: "line", source: "sky-draw", filter: ["==", ["geometry-type"], "LineString"],
          paint: { "line-width": ["match", ["get", "k"], "pass", 4, "sat-next", 2, 1.6],
            "line-color": ["match", ["get", "k"], "pass", "#ffd34d", "pass-link", "#ffd34d", "sat-next", "#7fb6ff", "sat-past", "#7fb6ff", "radiant", "#ff8fd0", "#e9e4c8"],
            "line-opacity": ["match", ["get", "k"], "sat-past", 0.4, 0.9],
            "line-dasharray": ["match", ["get", "k"], "pass-link", ["literal", [2, 2]], "moon-rise", ["literal", [3, 2]], "moon-set", ["literal", [1, 2]], ["literal", [1, 0]]] } });
        map.addLayer({ id: "sky-moon", type: "circle", source: "sky-draw", filter: ["==", ["get", "k"], "moon"],
          paint: { "circle-radius": 9, "circle-color": "#f4f1de", "circle-stroke-color": "#333", "circle-stroke-width": 1.5 } });
      } else {
        map.getSource("sky-draw").setData(K.fc(f));
      }
    } catch (e) {}
  }
  /* night-sky score grid */
  function scoreOf(cc, lum, lat, lng) {
    var Sc = window.SunCalc;
    var now = new Date();
    var st = Sc.getTimes(now, lat, lng);
    var start = st.night && !isNaN(st.night) ? st.night : st.nauticalDusk;
    if (!start || isNaN(start) || start < now) start = now;
    var sum = 0;
    var n = 0;
    for (var i = 0; i < cc.t.length; i++) {
      var t = cc.t[i] * 1000;
      if (t >= start.getTime() - 1800000 && t <= start.getTime() + 4 * 3600000) { sum += cc.c[i]; n++; }
    }
    if (!n) return null;
    var mid = new Date(start.getTime() + 2 * 3600000);
    var up = Sc.getMoonPosition(mid, lat, lng).altitude > 0;
    var moon = 1 - (up ? 0.6 * Sc.getMoonIllumination(mid).fraction : 0);
    var dark = lum == null ? 1 : 1 - Math.min(1, lum / 160) * 0.85;
    return { v: Math.round(10 * (1 - sum / n / 100) * moon * dark), cl: Math.round(sum / n), mn: up ? Math.round(100 * Sc.getMoonIllumination(mid).fraction) : 0,
      lt: lum == null ? "" : lum < 15 ? "dark sky" : lum < 60 ? "some light pollution" : "bright city sky" };
  }
  /* opt107: fixed world-aligned squares (they no longer slide with the view), sized by zoom, at every zoom.
   * Each square's clouds are fetched once an hour and reused while panning. */
  var cellStore = {};
  /* Open-Meteo answers 429 when its free per-minute quota is used up: retry after 5, 15 and 45 s, and meanwhile any coarser square
   * already loaded that covers this one lends its clouds, so the squares always show */
  var retryT = 0;
  function fetchClouds(need, n) {
    return fetch("https://api.open-meteo.com/v1/forecast?latitude=" + need.map((c) => { return c.lat.toFixed(2); }).join(",") +
      "&longitude=" + need.map((c) => { return c.lng.toFixed(2); }).join(",") + "&hourly=cloud_cover&forecast_days=2&timezone=GMT&timeformat=unixtime")
      .then((r) => { if (r.status === 429) throw new Error("429"); return r.json(); }).then((j) => {
        (Array.isArray(j) ? j : [j]).forEach((x, k) => {
          if (!x || !x.hourly) return;
          var v = { t: x.hourly.time, c: x.hourly.cloud_cover };
          cellStore[need[k].k] = v; K.putStore("ns-" + need[k].k, v, 3600000);
        });
      }).catch(() => {
        clearTimeout(retryT); /* 5, 15, 45 s, then once a minute while the layer is on */
        retryT = setTimeout(() => { if (L.isOn("nightscore")) fetchClouds(need, n + 1).then(() => { gridKey = ""; grid(); }); }, Math.min(60000, 5000 * Math.pow(3, n)));
      });
  }
  function stale(k) { try { var v = JSON.parse(localStorage.getItem("sunny-c-ns-" + k)); return v && v.t > Date.now() - 864e5 ? v.d : null; } catch (e) { return null; } }
  function coarse(c) {
    var own = stale(c.k);
    if (own) return own;
    var best = null, bd = 1e9, keys = Object.keys(cellStore);
    try { for (var j = 0; j < localStorage.length; j++) { var lk = localStorage.key(j); if (lk.indexOf("sunny-c-ns-") === 0) keys.push(lk.slice(11)); } } catch (e) {}
    keys.forEach((k) => {
      var p = k.split(":").map(Number), d = p[0];
      if (d > c.e - c.w && d < bd && c.lng >= p[1] && c.lng < p[1] + d && c.lat >= p[2] && c.lat < p[2] + d) { var v = cellStore[k] || stale(k); if (v) { best = v; bd = d; } }
    });
    return best;
  }
  function step() { var z = map.getZoom(); return z < 3 ? 10 : z < 5 ? 4 : z < 7 ? 2 : z < 9 ? 1 : 0.5; }
  function grid() {
    if (!map || !L.isOn("nightscore") || !window.SunCalc) {
      K.vis(map, ["sky-grid", "sky-grid-line"], false);
      return;
    }
    K.vis(map, ["sky-grid", "sky-grid-line"], true);
    var b = map.getBounds(), d = step();
    var w = Math.max(-180, Math.floor(b.getWest() / d) * d), e = Math.min(180, Math.ceil(b.getEast() / d) * d);
    var s = Math.max(-80, Math.floor(b.getSouth() / d) * d), n = Math.min(80, Math.ceil(b.getNorth() / d) * d);
    while ((e - w) / d * ((n - s) / d) > 60) d *= 2; /* at most about 60 squares per view */
    w = Math.floor(w / d) * d; s = Math.floor(s / d) * d;
    var key = [w, s, e, n, d].join(",");
    if (key === gridKey) return;
    gridKey = key;
    var cells = [];
    for (var x = w; x < e; x += d) for (var y = s; y < n; y += d) cells.push({ w: x, e: x + d, s: y, n: y + d, lat: y + d / 2, lng: x + d / 2, k: d + ":" + x + ":" + y });
    var need = cells.filter((c) => { return !cellStore[c.k] && !K.getStore("ns-" + c.k); });
    var cp = !need.length ? Promise.resolve() : fetchClouds(need, 0);
    cp.then(() => {
      return Promise.all(cells.map((c) => { return S().darkness(c.lat, c.lng).catch(() => { return null; }); })).then((lums) => {
        if (key !== gridKey) return;
        var f = cells.map((c, k) => {
          var cc = cellStore[c.k] || K.getStore("ns-" + c.k) || coarse(c), v = cc ? scoreOf(cc, lums[k], c.lat, c.lng) : null;
          return { type: "Feature", properties: v ? v : { v: -1 }, geometry: { type: "Polygon", coordinates: [[[c.w, c.s], [c.e, c.s], [c.e, c.n], [c.w, c.n], [c.w, c.s]]] } };
        });
        if (!map.getSource("sky-grid")) {
          map.addSource("sky-grid", { type: "geojson", data: K.fc(f) });
          map.addLayer({ id: "sky-grid", type: "fill", source: "sky-grid", /* unknown squares (v -1, no cloud data yet) are light grey, never red */
            paint: { "fill-color": ["case", ["<", ["get", "v"], 0], "#9aa0a6", ["interpolate", ["linear"], ["get", "v"], 0, "#d7301f", 5, "#fdcc3a", 10, "#1a9850"]],
              "fill-opacity": ["case", ["<", ["get", "v"], 0], 0.12, 0.35], "fill-antialias": false } }, K.before(map));
          map.addLayer({ id: "sky-grid-line", type: "line", source: "sky-grid", filter: [">=", ["get", "v"], 0], paint: { "line-color": "#fff", "line-opacity": 0.2, "line-width": 0.6 } }, K.before(map));
          map.on("click", "sky-grid", (ev) => {
            var q = ev.features[0].properties, v = q.v;
            K.show(map, ev.lngLat, v < 0 ? "Night-sky score: no data yet" : "Night-sky score " + v + "/10", v < 0 ?
              ["The cloud forecast for this square has not loaded (Open-Meteo busy). It retries every minute"] :
              [q.cl + " % cloud, " + (q.mn ? "moon " + q.mn + " % lit and up" : "no moon") + (q.lt ? ", " + q.lt : ""), "Green is good stargazing, red is poor"], ["Open-Meteo clouds + NASA Black Marble (SUNNY estimate)", "https://open-meteo.com/en/docs"]);
          });
        } else {
          map.getSource("sky-grid").setData(K.fc(f));
        }
      });
    }).catch(() => { gridKey = ""; });
  }
  /* score squares and meteor bands sit just above the cloud pictures and under the data layers */
  function above() {
    var ls = map.getStyle().layers, top = -1;
    ls.forEach((l, i) => { if (/^(gibs|iem-vis|light-cloud|lc-)/.test(l.id)) top = i; });
    if (top < 0) return;
    var nxt = ls[top + 1] && ls[top + 1].id;
    ["sky-grid", "sky-grid-line", "shower-band"].forEach((id) => {
      var i = ls.findIndex((l) => l.id === id);
      if (i >= 0 && (i < top || i > top + 3)) { try { map.moveLayer(id, nxt); } catch (e) {} } /* and under every dot */
    });
  }
  function apply() {
    if (!map) return;
    K.vis(map, ["sky-night", "sky-moon"], L.isOn("moon"));
    redraw();
    grid();
  }
  L.add({ id: "skydraw-attach", group: "none", taps: ["sky-grid"], attach: (m) => {
    map = m;
    map.on("moveend", () => { setTimeout(grid, 500); });
    map.on("idle", above);
    setInterval(() => { if (L.isOn("sats") || L.isOn("moon")) redraw(); }, 20000);
    setTimeout(apply, 1500);
  }, apply: apply });
  window.SunnySkyDraw = { redraw: redraw, apply: apply };
})();
