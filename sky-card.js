// workspace/whereisthesun/sky-card.js
/* SUNNY "Tonight" card (opt94), worked out on the phone for the map centre:
 *   Moon & meteors  moon phase, moonrise and moonset (SunCalc, BSD), and the next major meteor
 *                   shower peak from the International Meteor Organization calendar.
 *   Satellites      next night passes of the space stations and science satellites (orbits from sats.js).
 *   Night-sky score 0-10 for tonight: Open-Meteo cloud cover (free), the moon, and how dark the
 *                   sky is here from NASA Black Marble night lights. A SUNNY estimate. */
(() => {
  "use strict";
  var K = window.SunnyKit;
  var L = window.SunnyLayers;
  if (!K || !L) return;
  /* IMO meteor shower calendar: usual peak (month, day) and peak rate per hour (ZHR) */
  var SHOWERS = [["Quadrantids", 1, 3, 80], ["Lyrids", 4, 22, 18], ["Eta Aquariids", 5, 6, 50], ["Southern Delta Aquariids", 7, 31, 25],
    ["Perseids", 8, 13, 100], ["Draconids", 10, 8, 10], ["Orionids", 10, 21, 20], ["Northern Taurids", 11, 12, 5],
    ["Leonids", 11, 17, 15], ["Geminids", 12, 14, 150], ["Ursids", 12, 22, 10]];
  var map = null;
  var here = null;
  var sats = [];
  var passes = [];
  var score = null;
  var tileImg = {};
  function fmtTime(d) {
    return d ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—";
  }
  function fmtDay(d) {
    var t = new Date();
    var same = d.toDateString() === t.toDateString();
    return (same ? "" : d.toLocaleDateString([], { weekday: "short" }) + " ") + fmtTime(d);
  }
  function phaseName(p) {
    var n = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];
    return n[Math.round(p * 8) % 8];
  }
  function nextShower() {
    var now = new Date();
    var y = now.getFullYear();
    var best = null;
    [y, y + 1].forEach((yy) => {
      SHOWERS.forEach((s) => {
        var d = new Date(yy, s[1] - 1, s[2]);
        if (d.getTime() > now.getTime() - 864e5 && (!best || d < best.d)) best = { n: s[0], d: d, z: s[3] };
      });
    });
    return best;
  }
  function moonLines() {
    var S = window.SunCalc;
    if (!S || !here) return [];
    var now = new Date();
    var ill = S.getMoonIllumination(now);
    var t = S.getMoonTimes(now, here.lat, here.lng);
    var sh = nextShower();
    var days = Math.round((sh.d - new Date(now.toDateString())) / 864e5);
    return ["🌙 " + phaseName(ill.phase) + ", " + Math.round(ill.fraction * 100) + " % lit · rise " + fmtTime(t.rise) + " · set " + fmtTime(t.set),
      "☄️ " + sh.n + " peak " + (days <= 0 ? "tonight" : days === 1 ? "tomorrow" : "in " + days + " days") + " (up to " + sh.z + "/h)"];
  }
  /* satellites come from sats.js (opt102); passes here use the space stations and science groups */
  function sunEci(date) {
    var d = (date.getTime() / 864e5) - 10957.5;
    var g = (357.529 + 0.98560028 * d) * Math.PI / 180;
    var q = 280.459 + 0.98564736 * d;
    var lam = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * Math.PI / 180;
    var e = (23.439 - 0.00000036 * d) * Math.PI / 180;
    var au = 149597870.7;
    return { x: au * Math.cos(lam), y: au * Math.cos(e) * Math.sin(lam), z: au * Math.sin(e) * Math.sin(lam) };
  }
  function sunlit(p, date) {
    var s = sunEci(date);
    var sl = Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z);
    var dot = (p.x * s.x + p.y * s.y + p.z * s.z) / sl;
    if (dot > 0) return true;
    var perp = Math.sqrt(Math.max(0, p.x * p.x + p.y * p.y + p.z * p.z - dot * dot));
    return perp > 6371;
  }
  function look(rec, date) {
    var sl = window.satellite;
    var pv = sl.propagate(rec, date);
    if (!pv || !pv.position) return null;
    var gmst = sl.gstime(date);
    var gd = sl.eciToGeodetic(pv.position, gmst);
    var out = { lat: sl.degreesLat(gd.latitude), lng: sl.degreesLong(gd.longitude), eci: pv.position };
    if (here) {
      var obs = { latitude: here.lat * Math.PI / 180, longitude: here.lng * Math.PI / 180, height: 0.1 };
      var la = sl.ecfToLookAngles(obs, sl.eciToEcf(pv.position, gmst));
      out.el = la.elevation * 180 / Math.PI;
      out.az = la.azimuth * 180 / Math.PI;
    }
    return out;
  }
  function compass(az) {
    return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(az / 45) % 8];
  }
  function findPasses() {
    passes = [];
    if (!here || !window.SunCalc) return;
    var t0 = Date.now();
    sats = window.SunnySats ? window.SunnySats.major() : [];
    sats.forEach((s) => {
      var cur = null;
      for (var t = t0; t < t0 + 36 * 3600000; t += 30000) {
        var d = new Date(t);
        var a = look(s.rec, d);
        if (a && a.el > 10) {
          if (!cur) cur = { name: s.name, start: d, from: compass(a.az), max: 0, vis: false };
          cur.max = Math.max(cur.max, a.el);
          cur.to = compass(a.az);
          if (window.SunCalc.getPosition(d, here.lat, here.lng).altitude < -6 * Math.PI / 180 && sunlit(a.eci, d)) cur.vis = true;
        } else if (cur) {
          if (cur.vis) passes.push(cur);
          cur = null;
        }
      }
    });
    passes.sort((a, b) => { return a.start - b.start; });
  }
  function satLines() {
    if (!sats.length) return ["🛰️ Loading orbits…"];
    var list = passes.slice(0, 3).map((p) => {
      return "🛰️ " + p.name + " " + fmtDay(p.start) + ", " + p.from + "→" + p.to + ", " + Math.round(p.max) + "° high";
    });
    return list.length ? list : ["🛰️ No visible ISS, Tiangong or Hubble passes in the next 36 h"];
  }
  /* night-sky score */
  function darkness(lat, lng) {
    var key = "lum-" + lat.toFixed(1) + "," + lng.toFixed(1);
    var c = K.getStore(key);
    if (c != null) return Promise.resolve(c);
    var z = 8;
    var n = 256;
    var x = (lng + 180) / 360 * n;
    var r = lat * Math.PI / 180;
    var y = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
    var url = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/" + z + "/" + Math.floor(y) + "/" + Math.floor(x) + ".png";
    var tk = Math.floor(x) + "/" + Math.floor(y);
    if (!tileImg[tk]) tileImg[tk] = new Promise((res, rej) => {
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        var cv = document.createElement("canvas");
        cv.width = cv.height = 256;
        var g = cv.getContext("2d");
        g.drawImage(img, 0, 0);
        res(g);
      };
      img.onerror = rej;
      img.src = url;
    });
    return tileImg[tk].then((g) => {
      var px = g.getImageData(Math.floor((x % 1) * 256), Math.floor((y % 1) * 256), 1, 1).data;
      var lum = Math.round(0.3 * px[0] + 0.59 * px[1] + 0.11 * px[2]);
      K.putStore(key, lum, 365 * 864e5);
      return lum;
    });
  }
  function clouds(lat, lng) {
    var key = "cc-" + lat.toFixed(1) + "," + lng.toFixed(1);
    var c = K.getStore(key);
    if (c) return Promise.resolve(c);
    return fetch("https://api.open-meteo.com/v1/forecast?latitude=" + lat.toFixed(2) + "&longitude=" + lng.toFixed(2) + "&hourly=cloud_cover&forecast_days=2&timezone=GMT&timeformat=unixtime")
      .then((r) => { return r.json(); }).then((j) => {
        var d = { t: j.hourly.time, c: j.hourly.cloud_cover };
        K.putStore(key, d, 3600000);
        return d;
      });
  }
  function computeScore() {
    if (!here || !window.SunCalc) return;
    var S = window.SunCalc;
    var lat = here.lat, lng = here.lng;
    var now = new Date();
    var st = S.getTimes(now, lat, lng);
    var start = st.night && !isNaN(st.night) ? st.night : st.nauticalDusk;
    if (!start || isNaN(start)) start = new Date(now.getTime());
    if (start < now) start = now;
    var mid = new Date(start.getTime() + 2 * 3600000);
    Promise.all([clouds(lat, lng), darkness(lat, lng).catch(() => { return null; })]).then((v) => {
      var cc = v[0], lum = v[1];
      var sum = 0, n = 0;
      for (var i = 0; i < cc.t.length; i++) {
        var t = cc.t[i] * 1000;
        if (t >= start.getTime() - 1800000 && t <= start.getTime() + 4 * 3600000) { sum += cc.c[i]; n++; }
      }
      if (!n) return;
      var cloud = sum / n;
      var ill = S.getMoonIllumination(mid).fraction;
      var up = S.getMoonPosition(mid, lat, lng).altitude > 0;
      var clear = 1 - cloud / 100;
      var moon = 1 - (up ? 0.6 * ill : 0);
      var dark = lum == null ? 1 : 1 - Math.min(1, lum / 160) * 0.85;
      var moonTxt = up ? Math.round(ill * 100) + " % moon up" : "moon down";
      var darkTxt = lum == null ? "" : lum < 15 ? "dark sky" : lum < 60 ? "some light pollution" : "bright city sky";
      score = { v: Math.round(10 * clear * moon * dark), cloud: Math.round(cloud), moon: moonTxt, dark: darkTxt, at: start };
      render();
    }).catch(() => {});
  }
  function scoreLines() {
    if (!score) return ["⭐ Night-sky score: working…"];
    return ["⭐ Night-sky score " + score.v + "/10 from " + fmtTime(score.at) + " · " + score.cloud + " % cloud · " + score.moon + (score.dark ? " · " + score.dark : "")];
  }
  /* Tonight block in the right info panel; every line ends with its source link */
  function a(u, t) {
    return '<a href="' + u + '" target="_blank" rel="noopener">' + t + "</a>";
  }
  function render() {
    var I = window.SunnyInfo;
    if (!I) return;
    var parts = [];
    var srcs = [];
    if (L.isOn("moon")) {
      parts = parts.concat(moonLines());
      srcs.push(a("https://github.com/mourner/suncalc", "SunCalc"), a("https://www.imo.net/", "IMO shower calendar"));
    }
    if (L.isOn("nightscore")) {
      parts = parts.concat(scoreLines());
      srcs.push(a("https://open-meteo.com/en/docs", "Open-Meteo clouds"), a("https://earthobservatory.nasa.gov/features/NightLights", "NASA Black Marble"));
    }
    if (L.isOn("sats")) {
      parts = parts.concat(satLines());
      srcs.push(a("https://celestrak.org/NORAD/elements/", "CelesTrak orbits"));
    }
    if (!parts.length || !here) {
      I.section("tonight", "", "");
      return;
    }
    var html = parts.map((l) => { return "<div>" + K.esc(l) + "</div>"; }).join("") + '<div class="pf-src">Source: ' + srcs.join(" · ") + "</div>";
    I.section("tonight", "Tonight here (map centre)", html);
    if (window.SunnySkyDraw) window.SunnySkyDraw.redraw();
  }
  function moved() {
    var c = map.getCenter();
    if (here && Math.abs(c.lat - here.lat) < 0.3 && Math.abs(c.lng - here.lng) < 0.3) return;
    here = { lat: c.lat, lng: c.lng };
    if (L.isOn("nightscore")) computeScore();
    if (L.isOn("sats")) findPasses();
    render();
  }
  function applyAll() {
    if (!map) return;
    if (L.isOn("sats")) { findPasses(); if (!sats.length) setTimeout(applyAll, 4000); }
    if (L.isOn("nightscore") && !score) computeScore();
    render();
    if (window.SunnySkyDraw) window.SunnySkyDraw.apply();
  }
  function def(id, name, icon, tip, leg) {
    L.add({ id: id, name: name, icon: icon, group: "Sky & Space", tip: tip, apply: applyAll, legend: leg });
  }
  def("moon", "Moon & meteor showers", "🌙", "Moon phase, moonrise and moonset here, and the next meteor shower peak (IMO)",
    '<div class="ls-k">Labels: moonrise / moonset direction and the next meteor shower radiant. Phase and times in the sky card.</div>');
  def("nightscore", "Night-sky score", "⭐", "Tonight's stargazing score 0-10 from clouds (Open-Meteo), the moon and dark-sky data",
    '<div class="sat-leg"><div class="sat-ramp" style="background:linear-gradient(90deg,#d7301f,#fdcc3a,#1a9850)"></div>' +
    '<div class="sat-rl"><span>0 poor</span><span>score tonight</span><span>10 great</span></div></div>');
  window.SunnySky = { sats: () => { return sats; }, look: look, here: () => { return here; }, passes: () => { return passes; },
    nextShower: nextShower, clouds: clouds, darkness: darkness, compass: compass, fmtTime: fmtTime };
  L.add({ id: "skycard-attach", group: "none", attach: (m) => {
    map = m;
    map.on("moveend", () => { setTimeout(moved, 400); });
    setInterval(render, 60000);
    moved();
    applyAll();
  } });
})();
