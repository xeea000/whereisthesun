// workspace/whereisthesun/cloud-key.js
/* SUNNY cloud-only look (opt63). GOES GeoColor has an opaque background: a dark purple
 * night backdrop with city lights, or land and ocean by day. This turns that background
 * transparent so only clouds sit over the base map. The same rule runs in two places:
 *   - here, on every static map tile, through the "sunnykey://" tile address;
 *   - in the Play shader in frame-tween.js (window.SunnyCloudKey.LO and HI).
 * Rule: alpha = smoothstep(LO, HI, darkest colour channel). Clouds are white or grey
 * (all channels high); the night backdrop, city lights, land and ocean each have at
 * least one low channel.
 * opt70: city lights in the night backdrop are bright but warm (yellow/orange), so a pixel
 * is also dropped when it is warm (red or green above blue by WARM_LO..WARM_HI) or has
 * strong colour (max minus min channel CHROMA_LO..CHROMA_HI). Bluish-white night clouds
 * stay. The Play shader in frame-tween.js uses the same numbers. */
(function () {
  "use strict";
  var LO = 0.28;
  var HI = 0.78;
  var WARM_LO = 0.04;
  var WARM_HI = 0.12;
  var CHROMA_LO = 0.22;
  var CHROMA_HI = 0.35;
  var registered = false;
  function smoothRange(lo, hi, x) {
    var t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
  }
  function smooth(x) {
    return smoothRange(LO, HI, x);
  }
  var TABLE = new Uint8ClampedArray(256);
  var WARM = new Uint8ClampedArray(256);
  var CHROMA = new Uint8ClampedArray(256);
  for (var i = 0; i < 256; i++) {
    TABLE[i] = Math.round(255 * smooth(i / 255));
    WARM[i] = Math.round(255 * (1 - smoothRange(WARM_LO, WARM_HI, i / 255)));
    CHROMA[i] = Math.round(255 * (1 - smoothRange(CHROMA_LO, CHROMA_HI, i / 255)));
  }
  function keyPixels(d) {
    for (var j = 0; j < d.length; j += 4) {
      var r = d[j], g = d[j + 1], b = d[j + 2];
      var mn = Math.min(r, g, b);
      var mx = Math.max(r, g, b);
      var k = TABLE[mn] * WARM[Math.max(0, Math.max(r, g) - b)] * CHROMA[mx - mn] / 65025;
      d[j + 3] = Math.round(k * d[j + 3] / 255);
    }
    return d;
  }
  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  function toBlobExecutor(c, resolve) {
    c.toBlob(resolve, "image/png");
  }
  function canvasToBuffer(c) {
    if (c.convertToBlob) return c.convertToBlob({ type: "image/png" }).then(blobToBuffer);
    return new Promise(toBlobExecutor.bind(null, c)).then(blobToBuffer);
  }
  function blobToBuffer(blob) {
    return blob.arrayBuffer();
  }
  function keyBitmap(bmp) {
    var c = makeCanvas(bmp.width, bmp.height);
    var ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    var img = ctx.getImageData(0, 0, bmp.width, bmp.height);
    keyPixels(img.data);
    ctx.putImageData(img, 0, 0);
    if (bmp.close) bmp.close();
    return canvasToBuffer(c);
  }
  function wrapData(buf) {
    return { data: buf };
  }
  function readBlob(res) {
    if (!res.ok) throw new Error("tile " + res.status);
    return res.blob();
  }
  function shiftGoesTime(url, stepsBack) {
    var m = /([0-9]{4}-[0-9]{2}-[0-9]{2})T([0-9]{2}):([0-9]{2}):00Z/.exec(url);
    if (!m) return "";
    var t = Date.parse(m[0]);
    if (!isFinite(t)) return "";
    var d = new Date(t - stepsBack * 600000);
    function pad(n) { return n < 10 ? "0" + n : String(n); }
    var iso = d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) +
      "T" + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":00Z";
    return url.replace(m[0], iso);
  }
  function blobOk(blob) {
    return !!(blob && blob.size > 2000);
  }
  function fetchKeyedBlob(url, signal, left) {
    return fetch(url, { signal: signal, mode: "cors" }).then(readBlob).then((blob) => {
      if (blobOk(blob) || left <= 0) return blob;
      var prev = shiftGoesTime(url, 1);
      return prev ? fetchKeyedBlob(prev, signal, left - 1) : blob;
    }).catch(() => {
      if (left <= 0) throw new Error("tile");
      var prev = shiftGoesTime(url, 1);
      if (!prev) throw new Error("tile");
      return fetchKeyedBlob(prev, signal, left - 1);
    });
  }
  function loadKeyedTile(params, abort) {
    var url = "https://" + params.url.slice("sunnykey://".length);
    var signal = abort && abort.signal;
    /* opt294: a missing GIBS slot (404, no CORS) shifts TIME by 10 minutes, up to 12 times, until a real picture is returned */
    return fetchKeyedBlob(url, signal, 12).then(createImageBitmap).then(keyBitmap).then(wrapData);
  }
  function register() {
    if (registered) return true;
    var ml = window.maplibregl;
    if (!ml || !ml.addProtocol || typeof createImageBitmap !== "function") return false;
    try {
      ml.addProtocol("sunnykey", loadKeyedTile);
      registered = true;
    } catch (eReg) {
      registered = false;
    }
    return registered;
  }
  function tileUrl(url) {
    if (!register() || url.indexOf("https://") !== 0) return url;
    return "sunnykey://" + url.slice("https://".length);
  }
  window.SunnyCloudKey = { LO: LO, HI: HI, keyPixels: keyPixels, tileUrl: tileUrl };
})();
