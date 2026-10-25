// workspace/whereisthesun/light-clouds.js
/* SUNNY Light clouds (opt88, Data saver "Light clouds"). Play frames are drawn on the phone
 * from Open-Meteo hourly cloud cover (model data, free, no key) instead of downloading a
 * satellite picture for every 10-minute step. One request fetches every timeline hour for a
 * coarse grid of points over the view. Each frame is the cloud cover at its time, straight-line
 * between the two nearest hours, smoothed up to the picture size. Nothing is added that the
 * numbers do not say. The picture is grey on black, so the Play cloud key (cloud-key.js) turns
 * black see-through and grey into cloud, the same as satellite frames. */
(function () {
  "use strict";
  var API = "https://api.open-meteo.com/v1/forecast";
  var POINTS = 200;
  var R = 6378137;
  var grids = {};
  var gridOrder = [];
  var label = null;
  function on() {
    return !!(window.SunnyDataSaver && window.SunnyDataSaver.on("light"));
  }
  function handles(url) {
    return on() && /gibs\.earthdata\.nasa\.gov\/wms\//.test(String(url));
  }
  function param(url, name) {
    var m = new RegExp("[?&]" + name + "=([^&]*)").exec(url);
    return m ? decodeURIComponent(m[1]) : "";
  }
  function latOf(y) {
    var lat = Math.atan(Math.sinh(y / R)) * 180 / Math.PI;
    return Math.max(-85, Math.min(85, lat));
  }
  function lonOf(x) {
    var lon = x / R * 180 / Math.PI;
    return ((lon + 540) % 360) - 180;
  }
  function gridShape(box) {
    var aspect = Math.max(0.2, Math.min(5, (box[2] - box[0]) / Math.max(1, box[3] - box[1])));
    var cols = Math.max(4, Math.round(Math.sqrt(POINTS * aspect)));
    var rows = Math.max(4, Math.round(POINTS / cols));
    return { cols: cols, rows: rows };
  }
  function seriesOf(data) {
    return Array.isArray(data) ? data : [data];
  }
  function fetchGrid(boxText) {
    if (grids[boxText]) return grids[boxText];
    var box = boxText.split(",").map(Number);
    var shape = gridShape(box);
    var lats = [];
    var lons = [];
    for (var r = 0; r < shape.rows; r++) {
      for (var c = 0; c < shape.cols; c++) {
        lats.push(latOf(box[3] - (r + 0.5) / shape.rows * (box[3] - box[1])).toFixed(2));
        lons.push(lonOf(box[0] + (c + 0.5) / shape.cols * (box[2] - box[0])).toFixed(2));
      }
    }
    var url = API + "?latitude=" + lats.join(",") + "&longitude=" + lons.join(",") +
      "&hourly=cloud_cover&past_days=1&forecast_days=1&timezone=UTC";
    var p = fetch(url).then((res) => {
      if (!res.ok) throw new Error("Open-Meteo " + res.status);
      return res.json();
    }).then((data) => {
      return { cols: shape.cols, rows: shape.rows, series: seriesOf(data) };
    }).catch(() => {
      delete grids[boxText];
      return null;
    });
    grids[boxText] = p;
    gridOrder.push(boxText);
    while (gridOrder.length > 4) delete grids[gridOrder.shift()];
    return p;
  }
  /* Cloud cover 0..100 at time ms, straight-line between the two nearest hours */
  function coverAt(s, ms) {
    var h = s && s.hourly;
    if (!h || !h.time || !h.cloud_cover) return 0;
    var t0 = Date.parse(h.time[0] + "Z");
    var f = (ms - t0) / 3600000;
    var i = Math.max(0, Math.min(h.time.length - 1, Math.floor(f)));
    var j = Math.min(h.time.length - 1, i + 1);
    var w = Math.max(0, Math.min(1, f - i));
    var a = h.cloud_cover[i] || 0;
    var b = h.cloud_cover[j] == null ? a : h.cloud_cover[j];
    return a + (b - a) * w;
  }
  function paint(grid, ms, w, h) {
    var small = document.createElement("canvas");
    small.width = grid.cols;
    small.height = grid.rows;
    var sctx = small.getContext("2d");
    var img = sctx.createImageData(grid.cols, grid.rows);
    for (var k = 0; k < grid.cols * grid.rows; k++) {
      var c = coverAt(grid.series[k], ms) / 100;
      var v = Math.round(235 * Math.pow(c, 0.7));
      img.data[k * 4] = v;
      img.data[k * 4 + 1] = v;
      img.data[k * 4 + 2] = Math.min(255, v + 6);
      img.data[k * 4 + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);
    var out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    var ctx = out.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(small, 0, 0, w, h);
    return out.toDataURL("image/jpeg", 0.8);
  }
  /* A GIBS WMS frame address in, the same frame drawn from cloud cover numbers out (data: URL) */
  function frameUrl(url) {
    var boxText = param(url, "BBOX");
    var ms = Date.parse(param(url, "TIME"));
    var w = Math.max(16, Math.min(1024, Number(param(url, "WIDTH")) || 512));
    var h = Math.max(16, Math.min(1024, Number(param(url, "HEIGHT")) || 512));
    showLabel();
    return fetchGrid(boxText).then((grid) => {
      return grid && isFinite(ms) ? paint(grid, ms, w, h) : null;
    });
  }
  function showLabel() {
    if (label) return;
    label = document.createElement("div");
    label.id = "lc-label";
    label.textContent = "Clouds: Open-Meteo model cloud cover";
    label.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 58px);" +
      "font:11px system-ui,sans-serif;color:#fff;opacity:.7;text-shadow:0 1px 2px #000;pointer-events:none;z-index:30";
    label.hidden = true;
    document.body.appendChild(label);
    setInterval(syncLabel, 700);
  }
  function syncLabel() {
    var playing = !!window.playMode && !(typeof window.radarOn === "function" && window.radarOn());
    label.hidden = !playing;
  }
  window.SunnyLightClouds = { on: on, handles: handles, frameUrl: frameUrl };
})();
