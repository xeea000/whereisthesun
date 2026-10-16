// workspace/whereisthesun/radar-key.js
/* SUNNY weak-echo filter (opt69). NEXRAD n0q shows clear-air returns (insects, dust, ground
 * clutter) below about 20 dBZ as light blue/grey rings around each radar. This makes every
 * pixel whose colour is an IEM n0q palette entry under 20 dBZ fully transparent, so only
 * light rain (green) and stronger shows. Palette: pyIEM composite_n0q.txt (0.5 dBZ steps).
 * Used for static map tiles (addProtocol "sunnydbz") and the whole-view Play frames. */
(function () {
  "use strict";
  var WEAK_HEX = "415b9e,435e9f,4361a2,4568a6,4761a0,486faa,4a76ae,4b64a1,4bd690,4d7db2,4f67a2,4f84b6,518bbb,52d6a2,5699c3,576da4,599fc7,59d6b3,5b70a6,5ba6cb,5eadcf,5f73a7,60b4d4,62bbd8,6376a8,65c2dc,6779a9,67c9e0,68d6d7,6ad0e4,6c7daa,6fd6e8,7080ab,7483ac,7886ae,7c89af,808cb0,85718f,85728f,86738d,87758b,87768b,887789,8892b2,897987,897a87,8a7b85,8b7d84,8b7e84,8c7f82,8c95b3,8d8180,8d8280,8e837e,8f847c,8f857c,90877b,9098b4,918879,918979,919ab4,928b77,938d75,949bb5,949db4,969153,97a0b4,989457,9aa2b4,9b975b,9d9a60,9da5b4,a09d64,a0a8b4,a3a068,a4abb4,a5a36d,a8a671,aaa976,aab0b4,adac7a,adb3b4,b0af7e,b0b6b4,b2b283,b3b9b4,b6bbb4,b7b88c,b9beb4,babb90,bdbe94,bdc1b4,bfc199,c0c4b4,c2c49d,c3c7b4,c4c7a2,c6c9b4,c7caa6,c9ccb4,cacdaa,ccd0af,cfd2b4,d2d4b4";
  var weak = new Set();
  var registered = false;
  function buildSet() {
    var parts = WEAK_HEX.split(",");
    for (var i = 0; i < parts.length; i++) weak.add(parseInt(parts[i], 16));
  }
  buildSet();
  function keyPixels(d) {
    for (var i = 0; i < d.length; i += 4) {
      if (d[i + 3] && weak.has((d[i] << 16) | (d[i + 1] << 8) | d[i + 2])) d[i + 3] = 0;
    }
  }
  /* filter a 2D canvas in place (Play frames are drawn 1:1, so palette colours are exact) */
  function keyCanvas(ctx, w, h) {
    try {
      var img = ctx.getImageData(0, 0, w, h);
      keyPixels(img.data);
      ctx.putImageData(img, 0, 0);
    } catch (eK) {}
  }
  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(w, h);
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  function blobExecutor(c, resolve) {
    c.toBlob(resolve, "image/png");
  }
  function blobBuffer(b) {
    return b.arrayBuffer();
  }
  function keyBitmap(bmp) {
    var c = makeCanvas(bmp.width, bmp.height);
    var ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    keyCanvas(ctx, bmp.width, bmp.height);
    if (bmp.close) bmp.close();
    if (c.convertToBlob) return c.convertToBlob({ type: "image/png" }).then(blobBuffer);
    return new Promise(blobExecutor.bind(null, c)).then(blobBuffer);
  }
  function readBlob(res) {
    if (!res.ok) throw new Error("radar tile " + res.status);
    return res.blob();
  }
  function wrap(buf) {
    return { data: buf };
  }
  function loadTile(params, abort) {
    var url = "https://" + params.url.slice("sunnydbz://".length);
    return fetch(url, { signal: abort && abort.signal, mode: "cors" }).then(readBlob)
      .then(createImageBitmap).then(keyBitmap).then(wrap);
  }
  function tileUrl(url) {
    var ml = window.maplibregl;
    if (!registered && ml && ml.addProtocol && typeof createImageBitmap === "function") {
      ml.addProtocol("sunnydbz", loadTile);
      registered = true;
    }
    if (!registered || url.indexOf("https://") !== 0) return url;
    return "sunnydbz://" + url.slice("https://".length);
  }
  window.SunnyRadarKey = { keyPixels: keyPixels, keyCanvas: keyCanvas, tileUrl: tileUrl };
})();
