// workspace/whereisthesun/radar-mask.js
/* SUNNY radar coverage hatch (opt67). Draws a faint diagonal hatch everywhere outside
 * NEXRAD range: Canada, Mexico, the oceans, and gaps between radars. Range is a 230 km
 * circle around each CONUS NEXRAD site (data/nexrad-sites.json, from the IEM NEXRAD
 * network list), clipped to the CONUS composite box. Tiles are drawn in the browser
 * through MapLibre addProtocol("sunnymask"), so overlapping circles merge with no seams
 * and the hatch lines run on across tile edges. */
(function () {
  "use strict";
  var RANGE_M = 230000;
  var BOX = { west: -127, east: -65, south: 23, north: 51 };
  var SPACING = 9;
  var R = 6378137;
  var sites = null;
  var sitesPromise = null;
  var registered = false;
  function loadSites() {
    if (!sitesPromise) sitesPromise = fetch("data/nexrad-sites.json").then(readJson).then(keepSites);
    return sitesPromise;
  }
  function readJson(res) {
    if (!res.ok) throw new Error("sites " + res.status);
    return res.json();
  }
  function keepSites(d) {
    sites = d.sites || [];
    return sites;
  }
  /* world pixel at zoom z (256-px tiles) */
  function worldPx(lon, lat, z) {
    var s = 256 * Math.pow(2, z);
    var x = (lon + 180) / 360 * s;
    var sl = Math.sin(lat * Math.PI / 180);
    var y = (0.5 - Math.log((1 + sl) / (1 - sl)) / (4 * Math.PI)) * s;
    return [x, y];
  }
  /* destination point at bearing b (radians) and distance d (m) */
  function dest(lon, lat, b, d) {
    var p1 = lat * Math.PI / 180;
    var l1 = lon * Math.PI / 180;
    var a = d / R;
    var p2 = Math.asin(Math.sin(p1) * Math.cos(a) + Math.cos(p1) * Math.sin(a) * Math.cos(b));
    var l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(a) * Math.cos(p1), Math.cos(a) - Math.sin(p1) * Math.sin(p2));
    return [l2 * 180 / Math.PI, p2 * 180 / Math.PI];
  }
  function drawHatch(ctx, ox, oy) {
    ctx.fillStyle = "rgba(20,28,40,0.35)";
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "rgba(210,220,235,0.9)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    var start = -((ox + oy) % SPACING) - 256;
    for (var k = start; k < 512; k += SPACING) {
      ctx.moveTo(k, 0);
      ctx.lineTo(k + 256, 256);
    }
    ctx.stroke();
  }
  function cutCircle(ctx, site, z, ox, oy) {
    ctx.beginPath();
    for (var i = 0; i <= 48; i++) {
      var q = dest(site[0], site[1], i / 48 * 2 * Math.PI, RANGE_M);
      var p = worldPx(q[0], q[1], z);
      if (i === 0) ctx.moveTo(p[0] - ox, p[1] - oy);
      else ctx.lineTo(p[0] - ox, p[1] - oy);
    }
    ctx.fill();
  }
  function near(site, z, ox, oy) {
    var p = worldPx(site[0], site[1], z);
    var rp = RANGE_M / (2 * Math.PI * R * Math.cos(site[1] * Math.PI / 180)) * 256 * Math.pow(2, z) * 1.1;
    return p[0] + rp > ox && p[0] - rp < ox + 256 && p[1] + rp > oy && p[1] - rp < oy + 256;
  }
  function makeCanvas() {
    if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(256, 256);
    var c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    return c;
  }
  function toBuffer(c) {
    if (c.convertToBlob) return c.convertToBlob({ type: "image/png" }).then(blobBuffer);
    return new Promise(blobExecutor.bind(null, c)).then(blobBuffer);
  }
  function blobExecutor(c, resolve) {
    c.toBlob(resolve, "image/png");
  }
  function blobBuffer(b) {
    return b.arrayBuffer();
  }
  function drawTile(z, x, y) {
    var c = makeCanvas();
    var ctx = c.getContext("2d");
    var ox = x * 256;
    var oy = y * 256;
    drawHatch(ctx, ox, oy);
    var a = worldPx(BOX.west, BOX.north, z);
    var b = worldPx(BOX.east, BOX.south, z);
    ctx.save();
    ctx.beginPath();
    ctx.rect(a[0] - ox, a[1] - oy, b[0] - a[0], b[1] - a[1]);
    ctx.clip();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000";
    for (var i = 0; i < sites.length; i++) {
      if (near(sites[i], z, ox, oy)) cutCircle(ctx, sites[i], z, ox, oy);
    }
    ctx.restore();
    return toBuffer(c);
  }
  function wrap(buf) {
    return { data: buf };
  }
  function loadTile(params) {
    var m = /sunnymask:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!m) return Promise.reject(new Error("mask url"));
    return loadSites().then(drawTile.bind(null, Number(m[1]), Number(m[2]), Number(m[3]))).then(wrap);
  }
  function tiles() {
    var ml = window.maplibregl;
    if (!registered && ml && ml.addProtocol) {
      ml.addProtocol("sunnymask", loadTile);
      registered = true;
    }
    return "sunnymask://{z}/{x}/{y}";
  }
  /* true when [lon, lat] is inside NEXRAD range (used by the point popup) */
  function covered(lon, lat) {
    if (!sites || lon < BOX.west || lon > BOX.east || lat < BOX.south || lat > BOX.north) return false;
    for (var i = 0; i < sites.length; i++) {
      var dLat = (lat - sites[i][1]) * 111320;
      var dLon = (lon - sites[i][0]) * 111320 * Math.cos(lat * Math.PI / 180);
      if (dLat * dLat + dLon * dLon < RANGE_M * RANGE_M) return true;
    }
    return false;
  }
  window.SunnyRadarMask = { tiles: tiles, load: loadSites, covered: covered };
})();
