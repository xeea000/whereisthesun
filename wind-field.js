// workspace/whereisthesun/wind-field.js
/* SUNNY fixed wind field (opt70). One geographic grid of Open-Meteo 10 m wind, nodes every
 * 4 degrees of latitude and longitude at fixed positions (multiples of 4), fetched in
 * fixed 32 x 32 degree tiles of 64 nodes, one multi-point request per tile.
 * A tile is fetched once and kept for 45 minutes (memory and localStorage), so panning or
 * zooming never changes the field: new tiles only add data beside the loaded ones, and any
 * node holds the same value whichever tile request brought it. sample(lon, lat) is
 * bilinear in lat/lon between the four surrounding nodes; it returns null until they load.
 * Open-Meteo counts every location in a multi-point request as one call and the free tier takes about
 * 600 a minute, so requests are paced by a small token bucket and the
 * spacing is 4 degrees; a finer grid gets 429 (too many requests) on a continent view. */
(function () {
  "use strict";
  var API = "https://api.open-meteo.com/v1/forecast";
  var STEP = 4;
  var TILE = 8;
  var TTL_MS = 45 * 60000;
  var PARALLEL = 2;
  var RATE = 8;
  var BURST = 320;
  var tokens = BURST;
  var tokenAt = Date.now();
  var pumpTimer = 0;
  var MAX_TILES = 24;
  var LAT_MIN = -78;
  var LAT_MAX = 80;
  var STORE = "sunny-wf4-";
  var tiles = Object.create(null);
  /* opt244: the same tiles by number (ty * NT + tx), so sample() finds a node without building a string key */
  var NT = Math.ceil(360 / STEP / TILE);
  var byNum = [];
  function setTile(k, t) {
    tiles[k] = t;
    var p = k.split("_");
    byNum[Number(p[1]) * NT + Number(p[0])] = t;
  }
  var queue = [];
  var inFlight = 0;
  var lastKey = "";
  function tileKey(tx, ty) {
    return tx + "_" + ty;
  }
  function nodeLon(i) {
    return i * STEP - 180;
  }
  function nodeLat(j) {
    return j * STEP - 90;
  }
  function fresh(t) {
    return t && t.u && Date.now() - t.at < TTL_MS;
  }
  function fromStore(k) {
    try {
      var t = JSON.parse(localStorage.getItem(STORE + k) || "null");
      return fresh(t) ? t : null;
    } catch (eS) {
      return null;
    }
  }
  function toStore(k, t) {
    try { localStorage.setItem(STORE + k, JSON.stringify(t)); } catch (eW) {}
  }
  function readJson(res) {
    if (!res.ok) throw new Error("wind " + res.status);
    return res.json();
  }
  function onTile(k, list) {
    var arr = Array.isArray(list) ? list : [list];
    var t = { at: Date.now(), u: [], v: [] };
    for (var n = 0; n < TILE * TILE; n++) {
      var c = arr[n] && arr[n].current;
      var sp = c ? Number(c.wind_speed_10m) : NaN;
      var dr = c ? Number(c.wind_direction_10m) * Math.PI / 180 : NaN;
      t.u.push(isFinite(sp) && isFinite(dr) ? Math.round(-sp * Math.sin(dr) * 100) / 100 : null);
      t.v.push(isFinite(sp) && isFinite(dr) ? Math.round(-sp * Math.cos(dr) * 100) / 100 : null);
    }
    setTile(k, t);
    toStore(k, t);
  }
  function onFail(k) {
    setTile(k, { at: Date.now(), retryAt: Date.now() + 60000 });
  }
  function done() {
    inFlight--;
    pump();
  }
  function fetchTile(tx, ty) {
    var k = tileKey(tx, ty);
    var lats = [];
    var lons = [];
    for (var a = 0; a < TILE; a++) {
      for (var b = 0; b < TILE; b++) {
        lats.push(nodeLat(ty * TILE + a));
        lons.push(nodeLon(tx * TILE + b));
      }
    }
    /* opt166: Open-Meteo answers 400 to a latitude past the poles or a longitude past 180, so edge nodes are clamped and wrapped */
    lats = lats.map((v) => { return Math.max(-90, Math.min(90, v)); });
    lons = lons.map((v) => { return ((v + 180) % 360 + 360) % 360 - 180; });
    var url = API + "?latitude=" + lats.join(",") + "&longitude=" + lons.join(",") +
      "&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms";
    inFlight++;
    setTile(k, { at: Date.now(), pending: true });
    fetch(url).then(readJson).then(onTile.bind(null, k), onFail.bind(null, k)).then(done);
  }
  function refill() {
    var now = Date.now();
    tokens = Math.min(BURST, tokens + (now - tokenAt) / 1000 * RATE);
    tokenAt = now;
  }
  function pumpLater() {
    pumpTimer = 0;
    pump();
  }
  function pump() {
    refill();
    while (inFlight < PARALLEL && queue.length && tokens >= TILE * TILE) {
      var q = queue.shift();
      if (want(q[0], q[1])) {
        tokens -= TILE * TILE;
        fetchTile(q[0], q[1]);
      }
    }
    if (queue.length && !pumpTimer) pumpTimer = setTimeout(pumpLater, 1000);
  }
  function want(tx, ty) {
    var k = tileKey(tx, ty);
    var t = tiles[k];
    if (t && (t.pending || fresh(t) || (t.retryAt && Date.now() < t.retryAt))) return false;
    var s = fromStore(k);
    if (s) {
      setTile(k, s);
      return false;
    }
    return true;
  }
  function byDist(cx, cy, a, b) {
    return Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy);
  }
  /* queue every tile under the view plus a quarter view of margin, nearest the centre first */
  function ensure(map) {
    var b = map.getBounds();
    var c = map.getCenter();
    var key = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(Math.round).join(",");
    if (key === lastKey && queue.length === 0) return;
    lastKey = key;
    var west = b.getWest();
    var east = b.getEast();
    var mx = (east - west) * 0.25;
    var my = (b.getNorth() - b.getSouth()) * 0.25;
    var span = TILE * STEP;
    var y0 = Math.floor((Math.max(LAT_MIN, b.getSouth() - my) + 90) / span);
    var y1 = Math.floor((Math.min(LAT_MAX, b.getNorth() + my) + 90) / span);
    var x0 = Math.floor((west - mx + 180) / span);
    var x1 = Math.floor((east + mx + 180) / span);
    if (x1 - x0 >= NT) x1 = x0 + NT - 1;
    var cx = (c.lng + 180) / span;
    var cy = (c.lat + 90) / span;
    var list = [];
    var seen = Object.create(null);
    /* opt244: 90 node columns do not divide into whole 8-node tiles (360 / 32 = 11.25), so a span x outside 0..11 is
     * wrapped by its first and last node column, never by x itself (wrapping x gives fractional tile keys node() never reads) */
    for (var ty = y0; ty <= y1; ty++) {
      for (var x = x0; x <= x1; x++) {
        for (var q = 0; q < TILE; q += TILE - 1) {
          var tx = Math.floor((((x * TILE + q) % NI) + NI) % NI / TILE);
          if (seen[tx + "_" + ty]) continue;
          seen[tx + "_" + ty] = 1;
          if (want(tx, ty)) list.push([tx, ty, x]);
        }
      }
    }
    list.sort(byDistX.bind(null, cx, cy));
    queue = list.slice(0, MAX_TILES);
    pump();
  }
  function byDistX(cx, cy, a, b) {
    return byDist(cx, cy, [a[2], a[1]], [b[2], b[1]]);
  }
  /* node (i, j) into nu[q], nv[q]; false where its tile or value is missing. No allocation. */
  var nu = new Float64Array(4), nv = new Float64Array(4);
  var NI = 360 / STEP;
  function node(i, j, q) {
    i = ((i % NI) + NI) % NI;
    if (j < 0) return false;
    var t = byNum[Math.floor(j / TILE) * NT + Math.floor(i / TILE)];
    if (!t || !t.u) return false;
    var k = (j % TILE) * TILE + (i % TILE);
    if (t.u[k] === null || t.u[k] === undefined) return false;
    nu[q] = t.u[k];
    nv[q] = t.v[k];
    return true;
  }
  /* bilinear u/v (m/s, east/north) at lon/lat. With out (any array of 2): writes u, v into it and returns true,
   * or false where the field has not loaded, allocating nothing. Without out: returns {u, v} or null. */
  function sample(lon, lat, out) {
    var x = (lon + 180) / STEP;
    var y = (lat + 90) / STEP;
    var i = Math.floor(x);
    var j = Math.floor(y);
    if (!node(i, j, 0) || !node(i + 1, j, 1) || !node(i, j + 1, 2) || !node(i + 1, j + 1, 3)) return out ? false : null;
    var fx = x - i;
    var fy = y - j;
    var u = (nu[0] * (1 - fx) + nu[1] * fx) * (1 - fy) + (nu[2] * (1 - fx) + nu[3] * fx) * fy;
    var v = (nv[0] * (1 - fx) + nv[1] * fx) * (1 - fy) + (nv[2] * (1 - fx) + nv[3] * fx) * fy;
    if (out) { out[0] = u; out[1] = v; return true; }
    return { u: u, v: v };
  }
  function stats() {
    var n = 0;
    for (var k in tiles) if (tiles[k].u) n++;
    return { tiles: n, queued: queue.length, inFlight: inFlight };
  }
  window.SunnyWindField = { ensure: ensure, sample: sample, stats: stats, STEP: STEP };
})();
