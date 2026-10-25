// workspace/whereisthesun/beach-icons.js
/* SUNNY beach icons (opt95, ring design). Outer ring: 12 segments for the next 12 hours, clockwise from
 * 12 o'clock, coloured by a blend of cloud cover and daylight (clear day blue, overcast day white, clear
 * night black, overcast night dark grey; dawn and dusk ramp with SunCalc at the beach). Inner disc: direct
 * sun, yellow when clear, greyer with cloud, black when the sun is down. Centre: weather glyph from the
 * Open-Meteo weather_code. Red pin at 12 = now; orange pin = sunset, yellow pin = sunrise, at their times.
 * One hourly Open-Meteo request per batch of beaches (cached 30 min). Pictures are cached by state key.
 * Weather glyphs: Meteocons (MIT) sprite. Unticking "Detailed beach icons" draws only the disc and glyph. */
(() => {
  "use strict";
  var PX = 2;
  var TTL = 30 * 60 * 1000;
  var MODE_KEY = "sunny-beach-icon";
  var mode = "advanced";
  try { mode = localStorage.getItem(MODE_KEY) === "simple" ? "simple" : "advanced"; } catch (e) {}
  var wx = {};
  var pending = {};
  var lastKey = "";
  var lastList = [];
  var made = {};
  var DC = [47, 143, 255], DO = [240, 240, 240], NC = [0, 0, 0], NO = [58, 58, 58];
  var mix = (a, b, t) => [0, 1, 2].map((i) => { return a[i] + (b[i] - a[i]) * t; });
  var rgb = (c) => { return "rgb(" + c.map(Math.round).join(",") + ")"; };
  var bin = (lat, lon) => { return Math.round(lat * 20) + "," + Math.round(lon * 20); };
  var getMap = () => { return typeof map !== "undefined" ? map : null; };
  /* Daylight 0..1 at time t: full from 45 min after sunrise to 45 min before sunset. */
  var light = (t, lat, lon) => {
    if (!window.SunCalc) return 1;
    var s = window.SunCalc.getTimes(new Date(t), lat, lon);
    var r = +s.sunrise, ss = +s.sunset, w = 45 * 60000;
    if (isNaN(r) || isNaN(ss)) return window.SunCalc.getPosition(new Date(t), lat, lon).altitude > 0 ? 1 : 0;
    if (t >= r + w && t <= ss - w) return 1;
    if (t <= r - w || t >= ss + w) return 0;
    return t < (r + ss) / 2 ? (t - (r - w)) / (2 * w) : ((ss + w) - t) / (2 * w);
  };
  /* Standard WMO code to Meteocons day/night icon. */
  var GLYPH = (code, day) => {
    if (code == null) return "";
    var d = day ? "day" : "night";
    if (code >= 96) return "thunderstorms-" + d + "-rain";
    if (code >= 95) return "thunderstorms-" + d;
    if (code === 85 || code === 86) return "partly-cloudy-" + d + "-snow";
    if (code >= 80) return "partly-cloudy-" + d + "-rain";
    if (code === 71) return "partly-cloudy-" + d + "-snow";
    if (code >= 71) return "snow";
    if (code === 61) return "partly-cloudy-" + d + "-rain";
    if (code >= 61) return "rain";
    if (code === 51) return "partly-cloudy-" + d + "-drizzle";
    if (code >= 51) return "drizzle";
    if (code >= 45) return "fog-" + d;
    if (code === 3) return "cloudy";
    if (code === 2) return "overcast-" + d;
    if (code === 1) return "partly-cloudy-" + d;
    return "clear-" + d;
  };
  /* Meteocons sprite (MIT, Bas Milius), loaded once; each symbol becomes an Image for canvas drawing. */
  var ICONS = {};
  var spriteReady = false;
  var loadSprite = () => {
    fetch("vendor/meteocons/sprite.svg?v=opt95").then((r) => { return r.text(); }).then((t) => {
      var doc = new DOMParser().parseFromString(t, "image/svg+xml");
      var syms = [].slice.call(doc.querySelectorAll("symbol"));
      var left = syms.length;
      syms.forEach((sy) => {
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="' +
          sy.getAttribute("viewBox") + '">' + sy.innerHTML + "</svg>";
        var im = new Image();
        im.onload = im.onerror = () => { if (--left === 0) { spriteReady = true; lastKey = ""; paint(lastList); } };
        im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
        ICONS[sy.id.slice(3)] = im;
      });
    }).catch(() => {});
  };
  var codeFromCloud = (c) => { return c < 20 ? 0 : c < 50 ? 1 : c < 85 ? 2 : 3; };
  /* State for one beach: clouds per hour, daylight per hour, glyph, sun up, sunrise/sunset slots. */
  var state = (b) => {
    var w = wx[bin(b.lat, b.lon)];
    var cl = null, code = null;
    var now = Date.now();
    if (w && now - w.t < TTL) {
      var i0 = Math.max(0, Math.floor((now - w.start) / 3600000));
      cl = w.cl.slice(i0, i0 + 12);
      code = w.code[i0];
      if (cl.length < 12) cl = null;
    }
    if (!cl) {
      var c = b.cloud;
      if (c == null && window.sunnyCachedWx) c = (window.sunnyCachedWx(b.lat, b.lon) || {}).cloud;
      if (c == null || c < 0) return null;
      cl = []; for (var k = 0; k < 12; k++) cl.push(c);
      code = codeFromCloud(c);
    }
    var lt = [];
    for (var h = 0; h < 12; h++) lt.push(Math.round(light(now + (h + 0.5) * 3600000, b.lat, b.lon) * 10) / 10);
    var up = window.SunCalc ? window.SunCalc.getPosition(new Date(now), b.lat, b.lon).altitude > 0 : lt[0] > 0;
    var ev = [];
    if (window.SunCalc) {
      [0, 1].forEach((d) => {
        var s = window.SunCalc.getTimes(new Date(now + d * 86400000), b.lat, b.lon);
        [["s", +s.sunset], ["r", +s.sunrise]].forEach((e) => {
          var q = Math.round((e[1] - now) / 900000);
          if (!isNaN(q) && q >= 0 && q < 48) ev.push(e[0] + q);
        });
      });
    }
    return { cl: cl.map((x) => { return Math.round(x / 10) * 10; }), lt: lt, g: GLYPH(code, up), up: up, ev: ev };
  };
  var keyOf = (s) => { return s ? mode.charAt(0) + (spriteReady ? "L" : "") + s.cl.join(".") + "|" + s.lt.join(".") + "|" + s.g + "|" + (s.up ? 1 : 0) + "|" + s.ev.join(".") : "bx-u"; };
  var pin = (g, ang, sc, col) => {
    g.save();
    g.translate(32, 32); g.rotate(ang); g.translate(0, -26.5); g.scale(sc, sc);
    g.beginPath();
    g.moveTo(0, -5); g.arc(0, -2, 3, -Math.PI / 2, 0.03);
    g.bezierCurveTo(3, 0.5, 1.2, 3, 0, 9); g.bezierCurveTo(-1.2, 3, -3, 0.5, -3, -2);
    g.arc(0, -2, 3, Math.PI, Math.PI * 1.5);
    g.closePath();
    g.fillStyle = col; g.fill();
    g.lineWidth = 0.9 / sc; g.strokeStyle = "#111"; g.stroke();
    g.beginPath(); g.arc(0, -2, 1.1, 0, 7); g.fillStyle = "rgba(255,255,255,.85)"; g.fill();
    g.restore();
  };
  var draw = (s) => {
    var full = mode !== "simple";
    var c = document.createElement("canvas");
    c.width = c.height = 64 * PX;
    var g = c.getContext("2d");
    g.scale(PX, PX);
    if (!s) {
      g.beginPath(); g.arc(32, 32, 13, 0, 7); g.fillStyle = "#8a8a8a"; g.fill();
      g.lineWidth = 1.5; g.strokeStyle = "#111"; g.stroke();
      return g.getImageData(0, 0, c.width, c.height);
    }
    if (full) {
      g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fillStyle = "#151515"; g.fill();
      s.cl.forEach((cc, i) => {
        g.beginPath();
        g.arc(32, 32, 25, -Math.PI / 2 + i * Math.PI / 6 + 0.035, -Math.PI / 2 + (i + 1) * Math.PI / 6 - 0.035);
        g.lineWidth = 7; g.strokeStyle = rgb(mix(mix(NC, NO, cc / 100), mix(DC, DO, cc / 100), s.lt[i])); g.stroke();
      });
    }
    var r = full ? 17 : 20;
    g.beginPath(); g.arc(32, 32, r, 0, 7);
    g.fillStyle = s.up ? rgb(mix([255, 200, 58], [110, 110, 110], s.cl[0] / 100)) : "#000";
    g.fill(); g.lineWidth = full ? 1 : 1.8; g.strokeStyle = "#111"; g.stroke();
    var ic = ICONS[s.g];
    if (ic && ic.complete && ic.naturalWidth) {
      var w = full ? 34 : 40;
      g.shadowColor = "rgba(0,0,0,.9)"; g.shadowBlur = 2.5;
      g.drawImage(ic, 32 - w / 2, 32 - w / 2, w, w);
      g.drawImage(ic, 32 - w / 2, 32 - w / 2, w, w);
      g.shadowBlur = 0;
    }
    if (full) {
      pin(g, 0, 1, "#e8342e");
      s.ev.forEach((e) => { pin(g, (+e.slice(1) / 4) * Math.PI / 6, 0.85, e.charAt(0) === "s" ? "#ff8a3d" : "#ffd54a"); });
    }
    return g.getImageData(0, 0, c.width, c.height);
  };
  var image = (m, s) => {
    var k = keyOf(s);
    if (!made[k] && !m.hasImage(k)) { m.addImage(k, draw(s), { pixelRatio: PX }); made[k] = 1; }
    return k;
  };
  /* One Open-Meteo call for all visible beaches that lack fresh hourly data (cap 50 points). */
  var fetchBatch = (list) => {
    var now = Date.now(), need = [], seen = {};
    list.forEach((b) => {
      var k = bin(b.lat, b.lon);
      if (seen[k] || pending[k] || (wx[k] && now - wx[k].t < TTL)) return;
      seen[k] = 1; need.push([k, b.lat, b.lon]);
    });
    need = need.slice(0, 50);
    if (!need.length) return;
    need.forEach((n) => { pending[n[0]] = 1; });
    var u = "https://api.open-meteo.com/v1/forecast?latitude=" + need.map((n) => { return n[1].toFixed(3); }).join(",") +
      "&longitude=" + need.map((n) => { return n[2].toFixed(3); }).join(",") +
      "&hourly=cloud_cover,weather_code&forecast_hours=14&past_hours=1&timezone=GMT&timeformat=unixtime";
    fetch(u).then((r) => { return r.json(); }).then((j) => {
      (Array.isArray(j) ? j : [j]).forEach((row, i) => {
        if (!row || !row.hourly || !need[i]) return;
        wx[need[i][0]] = { t: Date.now(), start: row.hourly.time[0] * 1000, cl: row.hourly.cloud_cover, code: row.hourly.weather_code };
      });
      lastKey = ""; paint(lastList);
    }).catch(() => {}).then(() => { need.forEach((n) => { delete pending[n[0]]; }); });
  };
  var ensure = (m) => {
    if (!m.getSource("beach-suns")) m.addSource("beach-suns", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    if (!m.getLayer("beaches-sun") && m.getLayer("beaches-dot")) {
      m.addLayer({ id: "beaches-sun", type: "symbol", source: "beach-suns",
        layout: { "icon-image": ["get", "i"], "icon-allow-overlap": true, "icon-ignore-placement": true,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 2, 0.35, 6, 0.5, 9, 0.62, 13, 0.75] } }, "beaches-dot");
      m.setPaintProperty("beaches-dot", "circle-opacity", 0);
      m.setPaintProperty("beaches-dot", "circle-stroke-opacity", 0);
      var vis = m.getLayoutProperty("beaches-dot", "visibility");
      if (vis) m.setLayoutProperty("beaches-sun", "visibility", vis);
    }
  };
  var paint = (list) => {
    var m = getMap();
    if (!m) return;
    lastList = list || [];
    try {
      ensure(m);
      var feats = lastList.map((b) => {
        return { type: "Feature", properties: { id: String(b.id), i: image(m, state(b)) }, geometry: { type: "Point", coordinates: [b.lon, b.lat] } };
      });
      var key = feats.map((f) => { return f.properties.id + f.properties.i; }).join("|");
      if (key !== lastKey) { lastKey = key; m.getSource("beach-suns").setData({ type: "FeatureCollection", features: feats }); }
      fetchBatch(lastList);
    } catch (e) {}
  };
  var setMode = (v) => {
    mode = v === "simple" ? "simple" : "advanced";
    try { localStorage.setItem(MODE_KEY, mode); } catch (e) {}
    lastKey = ""; paint(lastList);
  };
  /* "Detailed beach icons" checkbox: under Beaches in the left sidebar and mirrored in Settings. */
  var boxes = [];
  var addBox = (parent, before, cls) => {
    var l = document.createElement("label");
    l.className = cls;
    l.innerHTML = '<input type="checkbox"> Detailed beach icons';
    var cb = l.querySelector("input");
    cb.checked = mode !== "simple";
    cb.addEventListener("change", () => {
      setMode(cb.checked ? "advanced" : "simple");
      boxes.forEach((o) => { o.checked = cb.checked; });
    });
    parent.insertBefore(l, before || null);
    boxes.push(cb);
  };
  var buildSwitch = () => {
    var row = [].slice.call(document.querySelectorAll("#layers-panel .lp-row")).filter((r) => { return /Beaches/.test(r.textContent); })[0];
    var sun = document.getElementById("toggle-sunny");
    if (!row || !sun) { setTimeout(buildSwitch, 800); return; }
    if (boxes.length) return;
    addBox(row.parentNode, row.nextSibling, "lp-bicon");
    addBox(sun.closest(".set-row"), null, "sun-opt");
  };
  var credit = () => {
    var b = document.getElementById("set-build");
    if (!b || document.getElementById("set-credits")) return;
    var p = document.createElement("p");
    p.id = "set-credits";
    p.className = "set-credits";
    p.innerHTML = 'About: weather icons are <a href="https://github.com/basmilius/weather-icons" target="_blank" rel="noopener">Meteocons</a> by Bas Milius ' +
      '(<a href="vendor/meteocons/LICENSE" target="_blank" rel="noopener">MIT licence</a>). Forecasts from Open-Meteo.';
    b.parentNode.insertBefore(p, b);
  };
  var boot = () => { buildSwitch(); credit(); loadSprite(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setInterval(() => {
    var m = getMap();
    if (!m || !m.getLayer || !m.getLayer("beaches-sun") || !m.getLayer("beaches-dot")) return;
    var v = m.getLayoutProperty("beaches-dot", "visibility") || "visible";
    if ((m.getLayoutProperty("beaches-sun", "visibility") || "visible") !== v) m.setLayoutProperty("beaches-sun", "visibility", v);
  }, 2500);
  setInterval(() => { paint(lastList); }, 5 * 60000);
  window.SunnyBeachIcons = { paint: paint, setMode: setMode, state: state, draw: draw };
})();
