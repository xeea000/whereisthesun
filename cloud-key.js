// workspace/whereisthesun/cloud-key.js
/* SUNNY cloud-only look (opt63). GOES GeoColor has an opaque background: a dark purple
 * night backdrop with city lights, or land and ocean by day. This turns that background
 * transparent so only clouds sit over the base map. The same rule runs in two places:
 *   - here, on every static map tile, through the "sunnykey://" tile address;
 *   - in the Play shader in frame-tween.js (window.SunnyCloudKey.LO and HI).
 * Rule: alpha = smoothstep(LO, HI, darkest colour channel). Clouds are white or grey
 * (all channels high); the night backdrop, city lights, land and ocean each have at
 * least one low channel. */
(function () {
  "use strict";
  var LO = 0.28;
  var HI = 0.78;
  var registered = false;
  function smooth(x) {
    var t = Math.max(0, Math.min(1, (x - LO) / (HI - LO)));
    return t * t * (3 - 2 * t);
  }
  var TABLE = new Uint8ClampedArray(256);
  for (var i = 0; i < 256; i++) TABLE[i] = Math.round(255 * smooth(i / 255));
  function keyPixels(d) {
    for (var j = 0; j < d.length; j += 4) {
      var mn = d[j] < d[j + 1] ? d[j] : d[j + 1];
      if (d[j + 2] < mn) mn = d[j + 2];
      d[j + 3] = Math.round(TABLE[mn] * d[j + 3] / 255);
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
  function loadKeyedTile(params, abort) {
    var url = "https://" + params.url.slice("sunnykey://".length);
    var signal = abort && abort.signal;
    return fetch(url, { signal: signal, mode: "cors" }).then(readBlob)
      .then(createImageBitmap).then(keyBitmap).then(wrapData);
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
