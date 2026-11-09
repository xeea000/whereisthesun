// workspace/whereisthesun/sun-card.js
/* SUNNY Sun block (t388u), the kids of "Sun & golden hour" that are about the map centre:
 *   Sun path & shadow  the sun's path across the sky for the current date drawn round the map centre
 *                      (further out = lower in the sky), the sun direction now, the shadow direction,
 *                      and sunrise and sunset directions. Worked out from the clock, no download.
 *   Sunset score       0-10 for the next sunset from Open-Meteo cloud layers (free, no key):
 *                      10 x (1 - low cloud) x (0.4 + 0.6 x closeness of mid or high cloud to 50 %).
 *   UV burn timer      minutes until unprotected skin burns = skin MED / (1.5 x UV index), Open-Meteo UV.
 *                      MED (the dose that reddens skin): fair 250 J/m2, medium 300 J/m2. One UV index point
 *                      is 0.025 W/m2 of sunburn-weighted light, so 1.5 J/m2 a minute. */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers;
  if (!K || !L) return;
  var R = Math.PI / 180, map = null, here = null, wx = null, timer = null, gen = 0;
  var KID = { bands: "goldenhour-bands", path: "goldenhour-path", sunset: "goldenhour-sunset", uv: "goldenhour-uv" };
  var COL = window.SunnySunCol || {};
  var SKIN = [["fair", 250], ["medium", 300]];
  var on = (k) => { return K.kids.layerOn(L.isOn("goldenhour"), KID[k], true); };
  var compass = (az) => { return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(((az % 360) + 360) % 360 / 45) % 8]; };
  var hm = (d) => { return d && !isNaN(d) ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"; };
  /* SunCalc 2.1 gives degrees: altitude above the horizon, azimuth from north, clockwise */
  var pos = (t, lat, lng) => {
    var p = window.SunCalc.getPosition(new Date(t), lat, lng);
    return { alt: p.altitude, az: ((p.azimuth % 360) + 360) % 360 };
  };
  /* golden hour edges for the evening: sun crossing 6 degrees and -4 degrees on the way down, sampled every 2 minutes */
  var evening = (lat, lng) => {
    var d0 = new Date(); d0.setHours(0, 0, 0, 0);
    var out = { gold: null, end: null }, prev = pos(d0.getTime(), lat, lng).alt;
    for (var t = d0.getTime() + 12e4; t <= d0.getTime() + 864e5; t += 12e4) {
      var a = pos(t, lat, lng).alt;
      if (prev >= 6 && a < 6) out.gold = new Date(t);
      if (prev >= -4 && a < -4) out.end = new Date(t);
      prev = a;
    }
    var st = window.SunCalc.getTimes(new Date(), lat, lng).sunset;
    out.set = st && !isNaN(st) ? st : null;
    return out;
  };
  var fetchWx = (lat, lng) => {
    var key = "sunwx-" + lat.toFixed(1) + "," + lng.toFixed(1), c = K.getStore(key);
    if (c) return Promise.resolve(c);
    return fetch("https://api.open-meteo.com/v1/forecast?latitude=" + lat.toFixed(2) + "&longitude=" + lng.toFixed(2) +
      "&current=uv_index&hourly=uv_index,cloud_cover_low,cloud_cover_mid,cloud_cover_high&forecast_days=2&timezone=GMT&timeformat=unixtime")
      .then((r) => { return r.json(); }).then((j) => {
        var d = { uv: j.current ? j.current.uv_index : null, h: j.hourly };
        K.putStore(key, d, 3600000);
        return d;
      });
  };
  var hourAt = (h, t) => {
    var best = -1, gap = 1e12;
    for (var i = 0; i < h.time.length; i++) { var g = Math.abs(h.time[i] * 1000 - t); if (g < gap) { gap = g; best = i; } }
    return gap <= 5400000 ? best : -1;
  };
  var nextSunset = (lat, lng) => {
    var S = window.SunCalc, now = Date.now();
    for (var k = 0; k < 2; k++) {
      var s = S.getTimes(new Date(now + k * 864e5), lat, lng).sunset;
      if (s && !isNaN(s) && s.getTime() > now) return s;
    }
    return null;
  };
  /* 10 x (1 - low/100) x (0.4 + 0.6 x (1 - |mid or high - 50| / 50)) */
  var sunsetScore = (h, t) => {
    var i = hourAt(h, t);
    if (i < 0) return null;
    var low = h.cloud_cover_low[i], mh = Math.max(h.cloud_cover_mid[i], h.cloud_cover_high[i]);
    if (low == null || mh == null) return null;
    return { v: Math.round(10 * (1 - low / 100) * (0.4 + 0.6 * (1 - Math.abs(mh - 50) / 50))), low: Math.round(low), mh: Math.round(mh) };
  };
  var uvMax = (h) => {
    var now = Date.now(), m = null;
    for (var i = 0; i < h.time.length; i++) {
      var t = h.time[i] * 1000;
      if (t >= now - 36e5 && t <= now + 18 * 36e5 && h.uv_index[i] != null) m = Math.max(m == null ? 0 : m, h.uv_index[i]);
    }
    return m;
  };
  var burn = (uv) => { return SKIN.map((s) => { return Math.round(s[1] / (1.5 * uv)) + " min (" + s[0] + " skin)"; }).join(" · "); };
  var lines = () => {
    var lat = here.lat, lng = here.lng, out = [], p = pos(Date.now(), lat, lng), ev = evening(lat, lng);
    if (on("path")) {
      out.push(p.alt > 0 ? "☀️ Sun " + Math.round(p.alt) + "° high in the " + compass(p.az) + " (" + Math.round(p.az) + "°); shadows point " +
        compass(p.az + 180) + " (" + Math.round((p.az + 180) % 360) + "°)" : "☀️ Sun below the horizon (" + Math.round(p.alt) + "°)");
    }
    out.push("🌅 Golden hour " + hm(ev.gold) + " to " + hm(ev.end) + " · sunset " + hm(ev.set));
    if (on("sunset")) {
      var ss = nextSunset(lat, lng), sc = wx && ss ? sunsetScore(wx.h, ss.getTime()) : null;
      out.push(!ss ? "🌇 No sunset here in the next two days" : !wx ? "🌇 Sunset score: working…" : !sc ? "🌇 Sunset score: no cloud forecast for " + hm(ss) :
        "🌇 Sunset score " + sc.v + "/10 at " + hm(ss) + " · low cloud " + sc.low + " % · mid or high cloud " + sc.mh + " %");
    }
    if (on("uv")) {
      var m = wx ? uvMax(wx.h) : null;
      out.push(!wx ? "🧴 UV burn timer: working…" : wx.uv == null ? "🧴 No UV forecast here" : wx.uv < 1 ? "🧴 UV index " + wx.uv.toFixed(1) +
        " now: sunburn unlikely" + (m >= 1 ? "; peak " + m.toFixed(1) + " in the next 18 hours burns in " + burn(m) : "") :
        "🧴 UV index " + wx.uv.toFixed(1) + " now: unprotected skin burns in about " + burn(wx.uv));
    }
    return out;
  };
  var render = () => {
    var I = window.SunnyInfo;
    if (!I) return;
    if (!L.isOn("goldenhour") || !here || !window.SunCalc) { I.section("sun", "", ""); return; }
    var srcs = ['<a href="https://github.com/mourner/suncalc">SunCalc</a>'];
    if (on("sunset") || on("uv")) srcs.push('<a href="https://open-meteo.com/en/docs">Open-Meteo clouds and UV</a>');
    I.section("sun", "Sun here (map centre)", lines().map((l) => { return "<div>" + K.esc(l) + "</div>"; }).join("") +
      '<div class="pf-src">Source: ' + srcs.join(" · ") + "</div>");
  };
  /* sky dome round the map centre: distance from the centre = (90 - altitude) / 90 x 30 % of the shorter screen side */
  var dome = (az, alt) => {
    var c = map.project(map.getCenter()), cv = map.getCanvas(), r = 0.3 * Math.min(cv.clientWidth, cv.clientHeight) * (90 - Math.max(0, alt)) / 90;
    var a = (az - map.getBearing()) * R, q = map.unproject([c.x + r * Math.sin(a), c.y - r * Math.cos(a)]);
    return [q.lng, q.lat];
  };
  var pathGeo = () => {
    var c = map.getCenter(), d0 = new Date(); d0.setHours(0, 0, 0, 0);
    var f = [], seg = [], p = pos(Date.now(), c.lat, c.lng), mid = [c.lng, c.lat];
    for (var t = d0.getTime(); t <= d0.getTime() + 864e5; t += 6e5) {
      var s = pos(t, c.lat, c.lng);
      if (s.alt > 0) seg.push(dome(s.az, s.alt));
      else if (seg.length) { f.push({ k: "path", g: seg }); seg = []; }
    }
    if (seg.length) f.push({ k: "path", g: seg });
    var tm = window.SunCalc.getTimes(new Date(), c.lat, c.lng);
    [tm.sunrise, tm.sunset].forEach((d) => { if (d && !isNaN(d)) f.push({ k: "rise", g: [mid, dome(pos(d.getTime(), c.lat, c.lng).az, 0)] }); });
    if (p.alt > 0) {
      f.push({ k: "now", g: [mid, dome(p.az, p.alt)] });
      f.push({ k: "shadow", g: [mid, dome(p.az + 180, p.alt)] });
    }
    return K.fc(f.map((x) => { return { type: "Feature", properties: { k: x.k }, geometry: { type: "LineString", coordinates: x.g } }; }));
  };
  var draw = () => {
    var show = on("path");
    if (show) {
      try {
        var g = pathGeo();
        if (map.getSource("sun-path")) map.getSource("sun-path").setData(g);
        else {
          map.addSource("sun-path", { type: "geojson", data: g, attribution: "Sun path: computed from the sun's position (SunCalc)" });
          map.addLayer({ id: "sun-path-line", type: "line", source: "sun-path", layout: { "line-cap": "round" }, paint: {
            "line-color": ["match", ["get", "k"], "now", COL.now, "shadow", COL.shadow, "rise", COL.rise, COL.path],
            "line-width": ["match", ["get", "k"], "now", 4, "shadow", 4, 2.5], "line-dasharray": [2, 1] } });
        }
      } catch (e) { return; } /* style not ready yet; the idle hook draws it */
    }
    K.vis(map, ["sun-path-line"], show);
  };
  var refresh = () => {
    if (!map) return;
    draw();
    clearInterval(timer); timer = null;
    if (L.isOn("goldenhour")) timer = setInterval(() => { draw(); render(); }, 60000);
    if (L.isOn("goldenhour") && here && (on("sunset") || on("uv")) && !wx) {
      var g = ++gen;
      fetchWx(here.lat, here.lng).then((d) => { if (g === gen) { wx = d; render(); } }).catch(() => {});
    }
    render();
  };
  var moved = () => {
    var c = map.getCenter();
    if (on("path")) draw();
    if (here && Math.abs(c.lat - here.lat) < 0.3 && Math.abs(c.lng - here.lng) < 0.3) return;
    here = { lat: c.lat, lng: c.lng }; wx = null;
    refresh();
  };
  var tap = (e) => {
    var c = map.getCenter(), p = pos(Date.now(), c.lat, c.lng), k = e.features[0].properties.k;
    var t = { now: "Sun direction now", shadow: "Shadow direction now", rise: "Sunrise and sunset directions", path: "Sun path" }[k];
    K.show(map, e.lngLat, t, [p.alt > 0 ? "Sun " + Math.round(p.alt) + "° high in the " + compass(p.az) + "; shadows point " + compass(p.az + 180) :
      "Sun below the horizon", "From the map centre. Further from the centre = lower in the sky"], ["Computed with SunCalc", "https://github.com/mourner/suncalc"]);
  };
  window.SunnySun = { refresh: refresh, kid: KID, col: COL };
  L.add({ id: "sun-attach", group: "none", taps: ["sun-path-line"], attach: (m) => {
    map = m;
    map.on("moveend", moved);
    map.on("rotateend", draw);
    map.on("idle", () => { if (on("path") && !map.getLayer("sun-path-line")) draw(); });
    map.on("click", "sun-path-line", tap);
    (window.SunnyHoverName = window.SunnyHoverName || {})["sun-path-line"] = (f) => {
      return Promise.resolve([{ now: "Sun direction now", shadow: "Shadow direction", rise: "Sunrise / sunset direction", path: "Sun path" }[f.properties.k], "from the map centre"]); };
    moved();
  } });
})();
