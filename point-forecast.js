// workspace/whereisthesun/point-forecast.js
/* SUNNY point forecast (opt67), the Windy-style "tap anywhere" picker. A tap on open map
 * (not a beach, not while Settings is open) drops a pin; its card has a Weather button that fetches the weather right
 * there now and a 24-hour strip: temperature line, cloud cover band, rain bars.
 * Data: Open-Meteo hourly forecast, free, no key. United States locales get °F and mph. */
(function () {
  "use strict";
  var API = "https://api.open-meteo.com/v1/forecast";
  var BEACH_LAYERS = ["beaches-fill", "beaches-line", "beaches-dot", "craters-fill", "craters-dot", "obs-point", "obs-cluster"];
  var US = /-US$/i.test((navigator.language || "") + "") || navigator.language === "en";
  var popup = null;
  var gen = 0;
  var cache = Object.create(null);
  function esc(s) {
    return String(s).replace(/[&<>"]/g, escChar);
  }
  function escChar(c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  }
  function url(lat, lon) {
    return API + "?latitude=" + lat.toFixed(3) + "&longitude=" + lon.toFixed(3) +
      "&hourly=temperature_2m,cloud_cover,precipitation,precipitation_probability,wind_speed_10m,wind_direction_10m" +
      "&forecast_hours=25&past_hours=0&timezone=auto" +
      (US ? "&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch" : "&wind_speed_unit=kmh");
  }
  function readJson(res) {
    if (!res.ok) throw new Error("forecast " + res.status);
    return res.json();
  }
  function compass(deg) {
    return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(((deg % 360) + 360) % 360 / 45) % 8];
  }
  function hourLabel(iso) {
    var h = Number(iso.slice(11, 13));
    if (!US) return h + "h";
    return (h % 12 || 12) + (h < 12 ? "a" : "p");
  }
  /* 24-hour strip: cloud band on top, rain bars at the bottom, temperature line between */
  function chart(h) {
    var W = 228;
    var H = 64;
    var n = Math.min(25, h.temperature_2m.length);
    var t = h.temperature_2m.slice(0, n);
    var lo = Math.min.apply(null, t);
    var hi = Math.max.apply(null, t);
    var span = Math.max(1, hi - lo);
    var dx = W / (n - 1);
    var out = ['<svg class="pf-chart" viewBox="0 0 ' + W + " " + (H + 12) + '" width="' + W + '" height="' + (H + 12) + '" aria-hidden="true">'];
    var i;
    for (i = 0; i < n - 1; i++) {
      var cc = (h.cloud_cover[i] || 0) / 100;
      out.push('<rect x="' + (i * dx).toFixed(1) + '" y="0" width="' + (dx + 0.3).toFixed(1) + '" height="8" fill="rgba(220,228,240,' + (0.08 + 0.8 * cc).toFixed(2) + ')"/>');
      var pr = Math.min(1, (h.precipitation[i] || 0) / (US ? 0.2 : 5));
      if (pr > 0) out.push('<rect x="' + (i * dx + 1).toFixed(1) + '" y="' + (H - 16 * pr).toFixed(1) + '" width="' + (dx - 2).toFixed(1) + '" height="' + (16 * pr).toFixed(1) + '" fill="#4ea3ff"/>');
    }
    var pts = [];
    for (i = 0; i < n; i++) pts.push((i * dx).toFixed(1) + "," + (14 + (1 - (t[i] - lo) / span) * (H - 34)).toFixed(1));
    out.push('<polyline points="' + pts.join(" ") + '" fill="none" stroke="#ffc94a" stroke-width="2" stroke-linejoin="round"/>');
    for (i = 0; i < n; i += 6) {
      out.push('<text x="' + Math.min(W - 10, i * dx + 1).toFixed(1) + '" y="' + (H + 10) + '">' + esc(hourLabel(h.time[i])) + "</text>");
    }
    out.push('<text x="' + (W - 2) + '" y="22" text-anchor="end">' + Math.round(hi) + "°</text>");
    out.push("</svg>");
    return out.join("");
  }
  function card(d) {
    var h = d.hourly;
    var u = d.hourly_units || {};
    var rain = Math.max.apply(null, h.precipitation_probability.slice(0, 24).map(Number));
    return '<div class="pf-now"><span class="pf-temp">' + Math.round(h.temperature_2m[0]) + "°</span>" +
      '<span class="pf-facts">Cloud ' + Math.round(h.cloud_cover[0]) + "%<br>Wind " + Math.round(h.wind_speed_10m[0]) + " " +
      esc((u.wind_speed_10m || "").replace("mp/h", "mph")) + " " + compass(h.wind_direction_10m[0]) + "<br>Rain chance up to " + rain + "% (24 h)</span></div>" +
      chart(h) + '<div class="pf-src">Source: <a href="https://open-meteo.com/en/docs" target="_blank" rel="noopener">Open-Meteo forecast</a></div>';
  }
  function show(lngLat, html) {
    popup.setLngLat(lngLat).setHTML(html);
    if (!popup.isOpen()) popup.addTo(popup._sunnyMap);
  }
  function onData(lngLat, my, d) {
    if (my !== gen) return;
    show(lngLat, card(d));
  }
  function onFail(lngLat, my, k, err) {
    delete cache[k]; /* a failed fetch is never kept, so the next press tries again */
    if (my !== gen) return;
    var busy = /429/.test(String(err && err.message));
    show(lngLat, wxBtn(busy ? "Weather service busy (free limit reached). Try again in a minute." : "Forecast unavailable right now."));
  }
  function wxBtn(note) {
    return '<div class="pf-src">' + esc(note) + "</div>";
  }
  function load(lngLat, my, tries) {
    var k = lngLat.lat.toFixed(2) + "," + lngLat.lng.toFixed(2);
    show(lngLat, '<div class="pf-src">Loading forecast…</div>');
    if (!cache[k]) cache[k] = fetch(url(lngLat.lat, lngLat.lng)).then(readJson);
    cache[k].then(onData.bind(null, lngLat, my), (err) => {
      if (tries > 0 && my === gen) { delete cache[k]; setTimeout(() => { if (my === gen) load(lngLat, my, tries - 1); }, 4000); return; }
      onFail(lngLat, my, k, err);
    });
  }
  /* opt146: a tap drops a pin only; the card's Weather button fetches the forecast on demand */
  function onClick(map, skip, e) {
    if (skip && skip()) return;
    var pop = document.getElementById("settings-pop");
    if (pop && !pop.hidden) return;
    var layers = BEACH_LAYERS.concat(window.SunnyLayers ? window.SunnyLayers.tapIds() : []).filter(map.getLayer.bind(map));
    if (layers.length && map.queryRenderedFeatures(e.point, { layers: layers }).length) return;
    var my = ++gen;
    var ll = e.lngLat;
    show(ll, '<div class="pf-src">Dropped pin</div>');
  }
  function onDoc(e) {
    var b = e.target && e.target.closest && e.target.closest(".pf-wx");
    if (!b || !popup) return;
    var ll = (b.getAttribute("data-ll") || "").split(",").map(Number);
    if (ll.length === 2 && isFinite(ll[0]) && isFinite(ll[1])) load({ lat: ll[0], lng: ll[1] }, ++gen, 1);
  }
  function attach(map, skip) {
    if (!map || !window.maplibregl || !window.maplibregl.Popup) return;
    popup = new window.maplibregl.Popup({ closeButton: true, maxWidth: "260px", className: "pf-popup", offset: 10 });
    popup._sunnyMap = map;
    map.on("click", onClick.bind(null, map, skip));
    document.addEventListener("click", onDoc, true);
  }
  window.SunnyPoint = { attach: attach };
})();
