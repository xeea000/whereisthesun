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
  /* Band 2 is darker than IEM visible. Lift only values above the ocean floor so
   * cloud tops brighten, then key with a lower threshold than GeoColor. The same
   * numbers are used on every tile so adjacent tiles match. */
  var VIS_FLOOR = 80;
  var VIS_LIFT = 1.7;
  var VIS_LO = 0.31;
  var VIS_HI = 0.56;
  function liftVis(d) {
    var i, v, floor = VIS_FLOOR;
    for (i = 0; i < d.length; i += 4) {
      v = d[i];
      if (v > floor) {
        v = Math.round(floor + (v - floor) * VIS_LIFT);
        if (v > 255) v = 255;
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
      }
    }
  }
  function keyPixelsBand2(d) {
    var span = VIS_HI - VIS_LO, j, t, k;
    for (j = 0; j < d.length; j += 4) {
      t = (d[j] / 255 - VIS_LO) / span;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      k = t * t * (3 - 2 * t);
      d[j + 3] = Math.round(k * d[j + 3]);
    }
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
  function tileLon(z, x) {
    return ((x + 0.5) / Math.pow(2, z)) * 360 - 180;
  }
  function parseXyz(url) {
    var g = /GoogleMapsCompatible_Level[0-9]+\/([0-9]+)\/([0-9]+)\/([0-9]+)\.png/.exec(url);
    if (g) return { z: Number(g[1]), y: Number(g[2]), x: Number(g[3]) };
    var m = /\/([0-9]+)\/([0-9]+)\/([0-9]+)\.png/.exec(url);
    if (!m) return null;
    return { z: Number(m[1]), x: Number(m[2]), y: Number(m[3]) };
  }
  function iemRawUrl(z, x, y) {
    var layer = tileLon(z, x) <= -105 ? "goes-west-vis-1km" : "goes-east-vis-1km";
    return "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/" + layer + "/" + z + "/" + x + "/" + y + ".png";
  }
  function blurAlpha(alpha, w, h, radius) {
    var out = new Uint8ClampedArray(w * h);
    var tmp = new Uint16Array(w * h);
    var r = radius < 1 ? 1 : radius;
    var x, y, i, s, n, k, row;
    for (y = 0; y < h; y++) {
      row = y * w;
      s = 0;
      n = 0;
      for (k = 0; k <= r && k < w; k++) { s += alpha[row + k]; n++; }
      for (x = 0; x < w; x++) {
        tmp[row + x] = s / n;
        if (x - r >= 0) { s -= alpha[row + x - r]; n--; }
        if (x + r + 1 < w) { s += alpha[row + x + r + 1]; n++; }
      }
    }
    for (x = 0; x < w; x++) {
      s = 0;
      n = 0;
      for (k = 0; k <= r && k < h; k++) { s += tmp[k * w + x]; n++; }
      for (y = 0; y < h; y++) {
        out[y * w + x] = s / n;
        if (y - r >= 0) { s -= tmp[(y - r) * w + x]; n--; }
        if (y + r + 1 < h) { s += tmp[(y + r + 1) * w + x]; n++; }
      }
    }
    return out;
  }
  function applyIemFootprintMask(fillData, maskData, w, h) {
    var a = new Uint8ClampedArray(w * h);
    var i, p;
    for (i = 0, p = 3; i < w * h; i++, p += 4) a[i] = maskData[p];
    var soft = blurAlpha(a, w, h, 12);
    for (i = 0, p = 3; i < w * h; i++, p += 4) {
      fillData[p] = Math.round(fillData[p] * (255 - soft[i]) / 255);
    }
  }
  function keyAndMask(fillBmp, maskBmp) {
    var c = makeCanvas(fillBmp.width, fillBmp.height);
    var ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(fillBmp, 0, 0);
    var img = ctx.getImageData(0, 0, fillBmp.width, fillBmp.height);
    liftVis(img.data);
    keyPixelsBand2(img.data);
    if (maskBmp && (maskBmp.width !== fillBmp.width || maskBmp.height !== fillBmp.height)) {
      var mc = makeCanvas(fillBmp.width, fillBmp.height);
      var mctx = mc.getContext("2d", { willReadFrequently: true });
      mctx.drawImage(maskBmp, 0, 0, fillBmp.width, fillBmp.height);
      applyIemFootprintMask(img.data, mctx.getImageData(0, 0, fillBmp.width, fillBmp.height).data, fillBmp.width, fillBmp.height);
    } else if (maskBmp) {
      var mc2 = makeCanvas(maskBmp.width, maskBmp.height);
      var mctx2 = mc2.getContext("2d", { willReadFrequently: true });
      mctx2.drawImage(maskBmp, 0, 0);
      applyIemFootprintMask(img.data, mctx2.getImageData(0, 0, maskBmp.width, maskBmp.height).data, fillBmp.width, fillBmp.height);
    }
    ctx.putImageData(img, 0, 0);
    if (fillBmp.close) fillBmp.close();
    if (maskBmp && maskBmp.close) maskBmp.close();
    return canvasToBuffer(c);
  }
  function gibsBand2FallbackUrl(url) {
    var xyz = parseXyz(url);
    if (!xyz || xyz.z > 7) return "";
    var iso = window.goesLastGoodIso || (typeof goesLatestIsoSync === "function" ? goesLatestIsoSync() : "");
    if (!iso) return "";
    var west = tileLon(xyz.z, xyz.x) <= -105;
    var layer = west ? "GOES-West_ABI_Band2_Red_Visible_1km" : "GOES-East_ABI_Band2_Red_Visible_1km";
    return "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/" + layer + "/default/" + iso +
      "/GoogleMapsCompatible_Level7/" + xyz.z + "/" + xyz.y + "/" + xyz.x + ".png";
  }
  function loadFillBitmap(url, signal, left) {
    return fetchKeyedBlob(url, signal, left).then(createImageBitmap).catch((err) => {
      var fb = /realearth\.ssec\.wisc\.edu/.test(url) ? gibsBand2FallbackUrl(url) : "";
      if (!fb) throw err;
      return fetchKeyedBlob(fb, signal, 12).then(createImageBitmap);
    });
  }
  function loadKeyedTile(params, abort) {
    var url = "https://" + params.url.slice("sunnykey://".length);
    var signal = abort && abort.signal;
    /* opt294: a missing GIBS slot (404, no CORS) shifts TIME by 10 minutes, up to 12 times, until a real picture is returned */
    var wantMask = url.indexOf("iemmask=1") !== -1;
    var p = loadFillBitmap(url, signal, 12);
    var isBand2 = url.indexOf("Band2_Red_Visible") !== -1;
    if (!wantMask) {
      return p.then((bmp) => {
        if (!isBand2) return keyBitmap(bmp);
        var c = makeCanvas(bmp.width, bmp.height);
        var ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(bmp, 0, 0);
        var img = ctx.getImageData(0, 0, bmp.width, bmp.height);
        liftVis(img.data);
        keyPixelsBand2(img.data);
        ctx.putImageData(img, 0, 0);
        if (bmp.close) bmp.close();
        return canvasToBuffer(c);
      }).then(wrapData);
    }
    return p.then((bmp) => {
      var xyz = parseXyz(url);
      if (!xyz) {
        if (!isBand2) return keyBitmap(bmp);
        return keyAndMask(bmp, null);
      }
      return fetch(iemRawUrl(xyz.z, xyz.x, xyz.y), { mode: "cors", signal: signal }).then((res) => {
        if (!res.ok) return null;
        return res.blob();
      }).then((blob) => {
        if (!blob || blob.size < 400) return keyAndMask(bmp, null);
        return createImageBitmap(blob).then((mask) => keyAndMask(bmp, mask));
      }).catch(() => keyAndMask(bmp, null));
    }).then(wrapData);
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
