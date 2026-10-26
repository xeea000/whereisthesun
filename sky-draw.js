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
    return Math.round(10 * (1 - sum / n / 100) * moon * dark);
  }
  function grid() {
    if (!map || !L.isOn("nightscore") || map.getZoom() < 4 || !window.SunCalc) {
      K.vis(map, ["sky-grid", "sky-grid-line"], false);
      return;
    }
    K.vis(map, ["sky-grid", "sky-grid-line"], true);
    var b = map.getBounds();
    var w = b.getWest(), e = b.getEast(), s = b.getSouth(), n = b.getNorth();
    var key = [w, s, e, n].map((v) => { return v.toFixed(1); }).join(",");
    if (key === gridKey) return;
    gridKey = key;
    var cells = [];
    for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) {
      cells.push({ w: w + (e - w) * i / 4, e: w + (e - w) * (i + 1) / 4, s: s + (n - s) * j / 4, n: s + (n - s) * (j + 1) / 4 });
    }
    cells.forEach((c) => { c.lat = (c.s + c.n) / 2; c.lng = (c.w + c.e) / 2; });
    var ck = "grid-" + key;
    var cached = K.getStore(ck);
    var cp = cached ? Promise.resolve(cached) : fetch("https://api.open-meteo.com/v1/forecast?latitude=" + cells.map((c) => { return c.lat.toFixed(2); }).join(",") +
      "&longitude=" + cells.map((c) => { return c.lng.toFixed(2); }).join(",") + "&hourly=cloud_cover&forecast_days=2&timezone=GMT&timeformat=unixtime")
      .then((r) => { return r.json(); }).then((j) => {
        var arr = (Array.isArray(j) ? j : [j]).map((x) => { return { t: x.hourly.time, c: x.hourly.cloud_cover }; });
        K.putStore(ck, arr, 3600000);
        return arr;
      });
    cp.then((arr) => {
      return Promise.all(cells.map((c) => { return S().darkness(c.lat, c.lng).catch(() => { return null; }); })).then((lums) => {
        if (key !== gridKey) return;
        var f = cells.map((c, k) => {
          var v = arr[k] ? scoreOf(arr[k], lums[k], c.lat, c.lng) : null;
          return { type: "Feature", properties: { v: v == null ? -1 : v }, geometry: { type: "Polygon", coordinates: [[[c.w, c.s], [c.e, c.s], [c.e, c.n], [c.w, c.n], [c.w, c.s]]] } };
        });
        if (!map.getSource("sky-grid")) {
          map.addSource("sky-grid", { type: "geojson", data: K.fc(f) });
          map.addLayer({ id: "sky-grid", type: "fill", source: "sky-grid", maxzoom: 8, filter: [">=", ["get", "v"], 0],
            paint: { "fill-color": ["interpolate", ["linear"], ["get", "v"], 0, "#d7301f", 5, "#fdcc3a", 10, "#1a9850"], "fill-opacity": 0.3 } }, K.before(map));
          map.addLayer({ id: "sky-grid-line", type: "line", source: "sky-grid", maxzoom: 8, paint: { "line-color": "#fff", "line-opacity": 0.25, "line-width": 1 } }, K.before(map));
          map.on("click", "sky-grid", (ev) => {
            var v = ev.features[0].properties.v;
            K.show(map, ev.lngLat, "Night-sky score " + v + "/10", ["Tonight in this square: clouds, the moon and how dark the sky is",
              "Green is good stargazing, red is poor"], ["Open-Meteo clouds + NASA Black Marble (SUNNY estimate)", "https://open-meteo.com/en/docs"]);
          });
        } else {
          map.getSource("sky-grid").setData(K.fc(f));
        }
      });
    }).catch(() => {});
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
    setInterval(() => { if (L.isOn("sats") || L.isOn("moon")) redraw(); }, 20000);
    setTimeout(apply, 1500);
  }, apply: apply });
  window.SunnySkyDraw = { redraw: redraw, apply: apply };
})();
