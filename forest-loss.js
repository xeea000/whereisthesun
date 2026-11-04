// workspace/whereisthesun/forest-loss.js
/* SUNNY opt232: Forests & logging — phone gets OUR compact tiles, not raw GFW.
 * z < LIVE_Z: year-encoded local overview (~160 KB), slider recolours (0 network).
 * z ≥ LIVE_Z: prebuilt WebP-LA pack (year|drv<<5) from data/human/forest-pack/;
 * slider recolours from decoded cache (0 network). Outside pack coverage, parent-fill
 * from z6 world pack. Above packMaxZoom: live GFW loss-only (no 256 KB driver/IFL).
 * Kids: loss-by-year, drivers, intact. Off by default; lazy. Hansen/Curtis/IFL · CC BY. */
(() => {
  "use strict";
  var K = window.SunnyKit;
  var L = window.SunnyLayers;
  if (!K || !L || !window.maplibregl) return;
  var Y0 = 2001, Y1 = 2024;
  var yearMin = Y0, yearMax = Y1;
  var OPAC = 0.78;
  var LIVE_Z = 6;
  var LIVE_MAXZOOM = 12;
  var PACK_FALLBACK_Z = 6;
  var TILE_SIZE = 256;
  var CONCUR = 4;
  var pMap = null;
  var PROTO_PACK = "fpack";
  var PROTO_LOSS = "gfwloss";
  var OV_RAW_URL = "data/human/forest-ov/ov-raw.png?v=6848514b";
  var OV_IFL_URL = "data/human/forest-ov/ov-ifl.png?v=61c99620";
  var PACK_BASE = "data/human/forest-pack";
  var PACK_MANIFEST_URL = PACK_BASE + "/manifest.json";
  var OV_LOSS_SRC = "forest-ov-loss-src", OV_LOSS_LYR = "forest-ov-loss-lyr";
  var OV_DRV_SRC = "forest-ov-drv-src", OV_DRV_LYR = "forest-ov-drv-lyr";
  var OV_IFL_SRC = "forest-ov-ifl-src", OV_IFL_LYR = "forest-ov-ifl-lyr";
  var LOSS_SRC = "forest-loss-src", LOSS_LYR = "forest-loss-lyr";
  var DRV_SRC = "forest-drv-src", DRV_LYR = "forest-drv-lyr";
  var IFL_SRC = "forest-ifl-src", IFL_LYR = "forest-ifl-lyr";
  var OV_COORDS = [
    [-180, 85.05112878], [180, 85.05112878],
    [180, -85.05112878], [-180, -85.05112878]
  ];
  var KIDS = [
    { id: "forest-loss", name: "Tree cover loss by year", dflt: true },
    { id: "forest-drv", name: "Loss drivers (logging…)", dflt: true },
    { id: "forest-ifl", name: "Intact forests", dflt: true }
  ];
  var DRV_RGB = {
    1: [220, 40, 40],
    2: [242, 200, 40],
    3: [232, 120, 20],
    4: [150, 60, 200],
    5: [120, 120, 130]
  };
  var DRV_UNK = [196, 90, 140];
  var DRV_LABEL = {
    1: "Commodity / agri business",
    2: "Shifting agriculture",
    3: "Forestry (logging)",
    4: "Wildfire",
    5: "Urbanization"
  };
  var inflight = 0;
  var waitQ = [];
  var memCache = new Map();
  var MEM_MAX = 160;
  var packManifest = null;
  var packMaxZoom = 9;
  var ovRaw = null;
  var ovRawW = 0, ovRawH = 0;
  var ovReady = null;
  var emptyTileP = null;
  function memGet(key) {
    if (!memCache.has(key)) return null;
    var v = memCache.get(key);
    memCache.delete(key);
    memCache.set(key, v);
    return v;
  }
  function memSet(key, buf) {
    if (memCache.has(key)) memCache.delete(key);
    memCache.set(key, buf);
    while (memCache.size > MEM_MAX) {
      memCache.delete(memCache.keys().next().value);
    }
  }
  function gate() {
    return new Promise((res) => {
      var run = () => { inflight++; res(); };
      if (inflight < CONCUR) run();
      else waitQ.push(run);
    });
  }
  function release() {
    inflight--;
    if (waitQ.length) waitQ.shift()();
  }
  function yearColor(year) {
    var t = (year - Y0) / (Y1 - Y0 || 1);
    if (t < 0.33) {
      var u = t / 0.33;
      return [217, 107 + ((112 - 107) * u) | 0, 184 + ((112 - 184) * u) | 0];
    }
    if (t < 0.66) {
      var u2 = (t - 0.33) / 0.33;
      return [217 + ((240 - 217) * u2) | 0, 112 + ((160 - 112) * u2) | 0, 112 + ((48 - 112) * u2) | 0];
    }
    var u3 = (t - 0.66) / 0.34;
    return [240 + ((255 - 240) * u3) | 0, 160 + ((230 - 160) * u3) | 0, 48 + ((106 - 48) * u3) | 0];
  }
  function lossYearRaw(r, b, z) {
    if (z >= 9) {
      if (b >= 1 && b <= 24) return 2000 + b;
      if (r >= 1 && r <= 24) return 2000 + r;
      return 0;
    }
    if (r >= 1 && r <= 24) return 2000 + r;
    if (b >= 1 && b <= 24) return 2000 + b;
    return 0;
  }
  function emptyTile() {
    if (emptyTileP) return emptyTileP;
    emptyTileP = (async () => {
      var c = typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(TILE_SIZE, TILE_SIZE)
        : Object.assign(document.createElement("canvas"), { width: TILE_SIZE, height: TILE_SIZE });
      var ctx = c.getContext("2d");
      ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
      var blob = c.convertToBlob
        ? await c.convertToBlob({ type: "image/png" })
        : await new Promise((res) => { c.toBlob(res, "image/png"); });
      return await blob.arrayBuffer();
    })();
    return emptyTileP;
  }
  function blobToBuffer(c) {
    var done = (c.convertToBlob)
      ? c.convertToBlob({ type: "image/png" })
      : new Promise((res) => { c.toBlob((b) => { res(b); }, "image/png"); });
    return done.then((blob) => { return blob.arrayBuffer(); }).then((out) => { return { data: out }; });
  }
  function loadManifest() {
    if (packManifest) return Promise.resolve(packManifest);
    return fetch(PACK_MANIFEST_URL, { cache: "force-cache" }).then((r) => {
      if (!r.ok) throw new Error("manifest");
      return r.json();
    }).then((m) => {
      packManifest = m;
      if (m && m.packMaxZoom) packMaxZoom = m.packMaxZoom | 0;
      return m;
    }).catch(() => {
      packManifest = { regions: [], packMaxZoom: PACK_FALLBACK_Z };
      packMaxZoom = PACK_FALLBACK_Z;
      return packManifest;
    });
  }
  function lonX(lon, z) { return Math.floor((lon + 180) / 360 * Math.pow(2, z)); }
  function latY(lat, z) {
    var s = Math.sin(lat * Math.PI / 180);
    return Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * Math.pow(2, z));
  }
  function tileCovered(z, x, y) {
    var regs = (packManifest && packManifest.regions) || [];
    for (var i = 0; i < regs.length; i++) {
      var r = regs[i];
      if (z < r.z0 || z > r.z1) continue;
      var b = r.bbox;
      var x0 = lonX(b[0], z), x1 = lonX(b[2], z);
      var y0 = latY(b[3], z), y1 = latY(b[1], z);
      if (y0 > y1) { var t = y0; y0 = y1; y1 = t; }
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return true;
    }
    return false;
  }
  function resolvePack(z, x, y) {
    var tz = z, tx = x, ty = y;
    while (tz > PACK_FALLBACK_Z && !tileCovered(tz, tx, ty)) {
      tz--; tx >>= 1; ty >>= 1;
    }
    return { z: tz, x: tx, y: ty, dz: z - tz, ox: x - (tx << (z - tz)), oy: y - (ty << (z - tz)) };
  }
  function fetchBuf(url, signal) {
    return gate().then(() => {
      return fetch(url, { signal: signal, mode: "cors", cache: "force-cache" }).then((r) => {
        if (r.status === 404) { release(); return null; }
        if (!r.ok) { release(); throw new Error("pack " + r.status); }
        return r.arrayBuffer().then((buf) => { release(); return buf; });
      }).catch((e) => { release(); throw e; });
    });
  }
  /* Decoded packed tile: { w, h, L: Uint8Array length w*h, A: Uint8Array } */
  function decodePackBuf(buf) {
    return createImageBitmap(new Blob([buf], { type: "image/webp" })).then((bmp) => {
      var c = typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(bmp.width, bmp.height)
        : Object.assign(document.createElement("canvas"), { width: bmp.width, height: bmp.height });
      var ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0);
      var img = ctx.getImageData(0, 0, c.width, c.height);
      var n = c.width * c.height;
      var L = new Uint8Array(n), A = new Uint8Array(n);
      var d = img.data;
      for (var i = 0, p = 0; i < d.length; i += 4, p++) {
        L[p] = d[i];
        A[p] = d[i + 3];
      }
      bmp.close && bmp.close();
      return { w: c.width, h: c.height, L: L, A: A };
    });
  }
  function getPackedRaw(z, x, y, kind, signal) {
    var key = "raw:" + kind + ":" + z + "/" + x + "/" + y;
    var hit = memGet(key);
    if (hit) return Promise.resolve(hit);
    var url = (kind === "ifl")
      ? (PACK_BASE + "/ifl/" + z + "/" + x + "/" + y + ".webp")
      : (PACK_BASE + "/" + z + "/" + x + "/" + y + ".webp");
    return fetchBuf(url, signal).then((buf) => {
      if (!buf) {
        var empty = { w: TILE_SIZE, h: TILE_SIZE, L: new Uint8Array(TILE_SIZE * TILE_SIZE), A: new Uint8Array(TILE_SIZE * TILE_SIZE) };
        memSet(key, empty);
        return empty;
      }
      return decodePackBuf(buf).then((dec) => { memSet(key, dec); return dec; });
    });
  }
  function samplePacked(dec, zReq, xReq, yReq, resolved) {
    var dz = resolved.dz;
    if (!dz) return dec;
    var scale = 1 << dz;
    var w = TILE_SIZE, h = TILE_SIZE;
    var L = new Uint8Array(w * h), A = new Uint8Array(w * h);
    var ox = (xReq - (resolved.x << dz)) * (dec.w / scale);
    var oy = (yReq - (resolved.y << dz)) * (dec.h / scale);
    var sw = dec.w / scale, sh = dec.h / scale;
    for (var yy = 0; yy < h; yy++) {
      var sy = Math.min(dec.h - 1, (oy + yy * sh / h) | 0);
      for (var xx = 0; xx < w; xx++) {
        var sx = Math.min(dec.w - 1, (ox + xx * sw / w) | 0);
        var si = sy * dec.w + sx;
        var di = yy * w + xx;
        L[di] = dec.L[si];
        A[di] = dec.A[si];
      }
    }
    return { w: w, h: h, L: L, A: A };
  }
  function paintPacked(dec, mode, y0, y1) {
    var c = typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(dec.w, dec.h)
      : Object.assign(document.createElement("canvas"), { width: dec.w, height: dec.h });
    var ctx = c.getContext("2d");
    var out = ctx.createImageData(dec.w, dec.h);
    var o = out.data;
    var lo = y0 - 2000, hi = y1 - 2000;
    if (mode === "ifl") {
      var w = dec.w, h = dec.h;
      var mask = dec.A;
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var idx = y * w + x;
          if (!mask[idx] || !dec.L[idx]) continue;
          var edge = (x === 0 || !mask[idx - 1] || x === w - 1 || !mask[idx + 1] || y === 0 || !mask[idx - w] || y === h - 1 || !mask[idx + w]);
          var hatch = ((x + y) % 5 === 0);
          if (!edge && !hatch) continue;
          var j = idx * 4;
          o[j] = 70; o[j + 1] = 110; o[j + 2] = 80;
          o[j + 3] = edge ? 200 : 100;
        }
      }
    } else {
      for (var p = 0, i = 0; p < dec.L.length; p++, i += 4) {
        if (!dec.A[p]) continue;
        var v = dec.L[p];
        var off = v & 31;
        if (!off || off < lo || off > hi) continue;
        var rgb;
        if (mode === "drv") {
          var cls = (v >> 5) & 7;
          rgb = (cls >= 1 && DRV_RGB[cls]) ? DRV_RGB[cls] : DRV_UNK;
          o[i + 3] = 210;
        } else {
          rgb = yearColor(2000 + off);
          o[i + 3] = 200;
        }
        o[i] = rgb[0]; o[i + 1] = rgb[1]; o[i + 2] = rgb[2];
      }
    }
    ctx.putImageData(out, 0, 0);
    return blobToBuffer(c);
  }
  function packTile(mode, z, x, y, y0, y1, signal) {
    return loadManifest().then(() => {
      /* Loss past pack max → live GFW loss-only for sharpness. Drv/IFL always from pack (overzoom). */
      if (z > packMaxZoom && mode === "loss") return null;
      var useZ = Math.min(z, packMaxZoom);
      var shift = z - useZ;
      var ux = x >> shift, uy = y >> shift;
      var res = resolvePack(useZ, ux, uy);
      var kind = (mode === "ifl") ? "ifl" : "loss";
      var ckey = "out:" + mode + ":" + z + "/" + x + "/" + y + ":" + y0 + "-" + y1;
      var hit = memGet(ckey);
      if (hit) return Promise.resolve({ data: hit.slice(0) });
      return getPackedRaw(res.z, res.x, res.y, kind, signal).then((dec) => {
        var sampled = samplePacked(dec, z, x, y, res);
        return paintPacked(sampled, mode, y0, y1).then((out) => {
          memSet(ckey, out.data);
          return out;
        });
      });
    });
  }
  function rawLossUrl(z, x, y) {
    return "https://tiles.globalforestwatch.org/umd_tree_cover_loss/v1.11/tcd_30/" + z + "/" + x + "/" + y + ".png";
  }
  function fetchBmp(url, signal) {
    return gate().then(() => {
      return fetch(url, { signal: signal, mode: "cors" }).then((r) => {
        if (!r.ok) { release(); throw new Error("gfw " + r.status); }
        return r.arrayBuffer().then((buf) => {
          release();
          return createImageBitmap(new Blob([buf], { type: "image/png" }));
        });
      }).catch((e) => { release(); throw e; });
    });
  }
  function liveLossOnly(z, x, y, y0, y1, signal) {
    var ckey = "live-loss:" + z + "/" + x + "/" + y + ":" + y0 + "-" + y1;
    var hit = memGet(ckey);
    if (hit) return Promise.resolve({ data: hit.slice(0) });
    return fetchBmp(rawLossUrl(z, x, y), signal).then((bmp) => {
      var c = typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(bmp.width, bmp.height)
        : Object.assign(document.createElement("canvas"), { width: bmp.width, height: bmp.height });
      var ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0);
      var img = ctx.getImageData(0, 0, c.width, c.height);
      var d = img.data;
      var out = ctx.createImageData(c.width, c.height);
      var o = out.data;
      for (var i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 20) continue;
        var year = lossYearRaw(d[i], d[i + 2], z);
        if (!year || year < y0 || year > y1) continue;
        var rgb = yearColor(year);
        o[i] = rgb[0]; o[i + 1] = rgb[1]; o[i + 2] = rgb[2]; o[i + 3] = 200;
      }
      ctx.putImageData(out, 0, 0);
      return blobToBuffer(c).then((res) => { memSet(ckey, res.data); return res; });
    });
  }
  function parseZxy(url, proto) {
    var u = url.replace(proto + "://", "https://dummy/");
    var m = u.match(/\/(\d+)\/(\d+)\/(\d+)/);
    var q = {};
    u.replace(/[?&]([^=]+)=([^&]+)/g, (_, k, v) => { q[k] = v; });
    return {
      z: m ? +m[1] : 0, x: m ? +m[2] : 0, y: m ? +m[3] : 0,
      y0: +(q.y0 || yearMin), y1: +(q.y1 || yearMax), mode: q.mode || "loss"
    };
  }
  function packUrl(mode) {
    return PROTO_PACK + "://v/{z}/{x}/{y}?mode=" + mode + "&y0=" + yearMin + "&y1=" + yearMax;
  }
  function liveUrl() {
    return PROTO_LOSS + "://v/{z}/{x}/{y}?y0=" + yearMin + "&y1=" + yearMax;
  }
  var protoReady = false;
  function ensureProtocol() {
    if (protoReady || !maplibregl.addProtocol) return;
    maplibregl.addProtocol(PROTO_PACK, (req, abort) => {
      var p = parseZxy(req.url, PROTO_PACK);
      var signal = abort && abort.signal;
      return packTile(p.mode, p.z, p.x, p.y, p.y0, p.y1, signal).then((res) => {
        if (res) return res;
        /* above pack: loss live only; drv/ifl → empty (overzoom handles lower) */
        if (p.mode === "loss") return liveLossOnly(p.z, p.x, p.y, p.y0, p.y1, signal);
        return emptyTile().then((data) => { return { data: data }; });
      }).catch(() => emptyTile().then((data) => { return { data: data }; }));
    });
    maplibregl.addProtocol(PROTO_LOSS, (req, abort) => {
      var p = parseZxy(req.url, PROTO_LOSS);
      return liveLossOnly(p.z, p.x, p.y, p.y0, p.y1, abort && abort.signal)
        .catch(() => emptyTile().then((data) => { return { data: data }; }));
    });
    protoReady = true;
  }
  function loadOvRaw() {
    if (ovReady) return ovReady;
    ovReady = new Promise((res, rej) => {
      var img = new Image();
      img.onload = () => {
        var c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        var ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        ovRaw = ctx.getImageData(0, 0, c.width, c.height);
        ovRawW = c.width; ovRawH = c.height;
        res(ovRaw);
      };
      img.onerror = () => { rej(new Error("ov-raw")); };
      img.src = OV_RAW_URL;
    });
    return ovReady;
  }
  function paintOverview(mode, y0, y1) {
    if (!ovRaw) return { url: null, count: 0 };
    var c = document.createElement("canvas");
    c.width = ovRawW; c.height = ovRawH;
    var ctx = c.getContext("2d");
    var out = ctx.createImageData(ovRawW, ovRawH);
    var s = ovRaw.data, d = out.data;
    var count = 0;
    var lo = y0 - 2000, hi = y1 - 2000;
    for (var i = 0; i < s.length; i += 4) {
      if (!s[i + 3]) continue;
      var off = s[i];
      if (off < lo || off > hi) continue;
      var year = 2000 + off;
      var rgb;
      if (mode === "drv") {
        var cls = s[i + 1];
        rgb = DRV_RGB[cls] || DRV_UNK;
        d[i + 3] = 210;
      } else {
        rgb = yearColor(year);
        d[i + 3] = 200;
      }
      d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
      count++;
    }
    ctx.putImageData(out, 0, 0);
    return { url: c.toDataURL("image/png"), count: count };
  }
  function pushOvImage(map, srcId, lyrId, url) {
    if (!url) return;
    if (!map.getSource(srcId)) {
      map.addSource(srcId, { type: "image", url: url, coordinates: OV_COORDS.slice() });
    } else {
      try { map.getSource(srcId).updateImage({ url: url, coordinates: OV_COORDS.slice() }); } catch (e) {}
    }
    if (!map.getLayer(lyrId)) {
      map.addLayer({
        id: lyrId, type: "raster", source: srcId, minzoom: 0, maxzoom: LIVE_Z + 0.01,
        paint: { "raster-opacity": OPAC, "raster-fade-duration": 0 }
      }, K.before(map));
    }
  }
  function refreshOverview(map) {
    return loadOvRaw().then(() => {
      var showLoss = K.kids.layerOn(true, "forest-loss", true);
      var showDrv = K.kids.layerOn(true, "forest-drv", true);
      var showLossOnly = showLoss && !showDrv;
      if (showLossOnly) {
        var painted = paintOverview("loss", yearMin, yearMax);
        pushOvImage(map, OV_LOSS_SRC, OV_LOSS_LYR, painted.url);
      }
      if (showDrv) {
        var paintedD = paintOverview("drv", yearMin, yearMax);
        pushOvImage(map, OV_DRV_SRC, OV_DRV_LYR, paintedD.url);
      }
    }).catch(() => {});
  }
  function ensureOvIfl(map) {
    if (!map.getSource(OV_IFL_SRC)) {
      map.addSource(OV_IFL_SRC, { type: "image", url: OV_IFL_URL, coordinates: OV_COORDS.slice() });
    }
    if (!map.getLayer(OV_IFL_LYR)) {
      map.addLayer({
        id: OV_IFL_LYR, type: "raster", source: OV_IFL_SRC, minzoom: 0, maxzoom: LIVE_Z + 0.01,
        paint: { "raster-opacity": 0.85, "raster-fade-duration": 0 }
      }, K.before(map));
    }
  }
  function yearLabel() {
    if (yearMin === Y0 && yearMax === Y1) return Y0 + "–" + Y1;
    if (yearMin === yearMax) return String(yearMin);
    return yearMin + "–" + yearMax;
  }
  function setYearRange(lo, hi, silent) {
    lo = Math.max(Y0, Math.min(Y1, lo | 0));
    hi = Math.max(Y0, Math.min(Y1, hi | 0));
    if (lo > hi) { var t = lo; lo = hi; hi = t; }
    yearMin = lo; yearMax = hi;
    try { localStorage.setItem("sunny-forest-year", yearMin + "," + yearMax); } catch (e) {}
    syncYearUi();
    if (silent || !pMap) return;
    if (isLive(pMap)) refreshLiveTiles(pMap);
    else refreshOverview(pMap);
  }
  function loadYearRange() {
    try {
      var v = localStorage.getItem("sunny-forest-year");
      if (v) {
        var p = v.split(",");
        if (p.length === 2) setYearRange(+p[0], +p[1], true);
      }
    } catch (e) {}
  }
  function syncYearUi() {
    var box = document.querySelector(".forest-year-range");
    if (!box) return;
    var lo = box.querySelector(".forest-year-lo");
    var hi = box.querySelector(".forest-year-hi");
    var val = box.querySelector(".forest-year-range-val");
    if (lo) lo.value = String(yearMin);
    if (hi) hi.value = String(yearMax);
    if (val) val.textContent = yearLabel();
    var fill = box.querySelector(".forest-year-range-fill");
    if (fill) {
      var span = Y1 - Y0;
      fill.style.left = ((yearMin - Y0) / span * 100) + "%";
      fill.style.width = ((yearMax - yearMin) / span * 100) + "%";
    }
    var hint = box.querySelector(".forest-year-hint");
    if (hint) {
      hint.textContent = (pMap && pMap.getZoom() < LIVE_Z)
        ? ("Overview below z" + LIVE_Z + " (~160 KB). Year filter recolours it. Compact tiles from z" + LIVE_Z + ".")
        : ("Compact local tiles (year+driver packed). Slider recolours from cache. Live loss-only past z" + packMaxZoom + ".");
    }
  }
  function mountYearUi() {
    var host = (L && L.ctrlHost) ? L.ctrlHost("forest") : null;
    if (!host) {
      var input = document.querySelector('.lp-input[data-id="forest"]');
      if (!input) return;
      var wrap = input.closest(".lp-fold");
      host = wrap && (wrap.querySelector(".lp-ctrls") || wrap);
    }
    if (!host || host.querySelector(".forest-year-range")) return;
    var box = document.createElement("div");
    box.className = "forest-year-range";
    box.innerHTML =
      '<div class="forest-year-range-lab">Loss years <span class="forest-year-range-val">' + yearLabel() + "</span></div>" +
      '<div class="forest-year-range-track" aria-hidden="true"><div class="forest-year-range-fill"></div></div>' +
      '<div class="forest-year-range-inputs">' +
      '<input type="range" class="forest-year-lo" min="' + Y0 + '" max="' + Y1 + '" step="1" value="' + yearMin + '" aria-label="Earliest loss year">' +
      '<input type="range" class="forest-year-hi" min="' + Y0 + '" max="' + Y1 + '" step="1" value="' + yearMax + '" aria-label="Latest loss year">' +
      "</div>" +
      '<div class="forest-year-range-ticks" aria-hidden="true"><span>' + Y0 + "</span><span>" + Y1 + "</span></div>" +
      '<div class="forest-year-hint"></div>';
    host.appendChild(box);
    var onSlide = () => {
      var loEl = box.querySelector(".forest-year-lo");
      var hiEl = box.querySelector(".forest-year-hi");
      var lo = +loEl.value, hi = +hiEl.value;
      if (lo > hi) {
        if (document.activeElement === loEl) hi = lo;
        else lo = hi;
      }
      setYearRange(lo, hi);
    };
    box.querySelector(".forest-year-lo").addEventListener("input", onSlide);
    box.querySelector(".forest-year-hi").addEventListener("input", onSlide);
    syncYearUi();
  }
  function isLive(map) {
    return map.getZoom() >= LIVE_Z;
  }
  function ensurePackSrc(map, srcId, lyrId, mode, opac) {
    ensureProtocol();
    if (!map.getSource(srcId)) {
      map.addSource(srcId, {
        type: "raster", tiles: [packUrl(mode)], tileSize: TILE_SIZE,
        minzoom: LIVE_Z, maxzoom: LIVE_MAXZOOM,
        attribution: 'Tree cover: <a href="https://www.globalforestwatch.org/" target="_blank" rel="noopener">Hansen/UMD/GFW</a> (CC BY 4.0), SUNNY compact tiles'
      });
    }
    if (!map.getLayer(lyrId)) {
      map.addLayer({
        id: lyrId, type: "raster", source: srcId, minzoom: LIVE_Z,
        paint: { "raster-opacity": opac, "raster-fade-duration": 0 }
      }, K.before(map));
    }
  }
  function setTiles(map, srcId, url) {
    var src = map.getSource(srcId);
    if (src && typeof src.setTiles === "function") {
      try { src.setTiles([url]); } catch (e) {}
    }
  }
  function refreshLiveTiles(map) {
    if (!isLive(map)) { syncYearUi(); return; }
    setTiles(map, LOSS_SRC, packUrl("loss"));
    setTiles(map, DRV_SRC, packUrl("drv"));
    setTiles(map, IFL_SRC, packUrl("ifl"));
    syncYearUi();
  }
  function kidVis(map, parentOn) {
    var showLoss = K.kids.layerOn(parentOn, "forest-loss", true);
    var showDrv = K.kids.layerOn(parentOn, "forest-drv", true);
    var showIfl = K.kids.layerOn(parentOn, "forest-ifl", true);
    var showLossOnly = showLoss && !showDrv;
    var live = isLive(map);
    if (!parentOn) {
      K.vis(map, [OV_LOSS_LYR, OV_DRV_LYR, OV_IFL_LYR, LOSS_LYR, DRV_LYR, IFL_LYR], false);
      return;
    }
    if (live) {
      if (showLossOnly) ensurePackSrc(map, LOSS_SRC, LOSS_LYR, "loss", OPAC);
      if (showDrv) ensurePackSrc(map, DRV_SRC, DRV_LYR, "drv", OPAC);
      if (showIfl) ensurePackSrc(map, IFL_SRC, IFL_LYR, "ifl", 0.85);
      K.vis(map, [OV_LOSS_LYR, OV_DRV_LYR, OV_IFL_LYR], false);
      K.vis(map, [LOSS_LYR], showLossOnly);
      K.vis(map, [DRV_LYR], showDrv);
      K.vis(map, [IFL_LYR], showIfl);
      refreshLiveTiles(map);
    } else {
      K.vis(map, [LOSS_LYR, DRV_LYR, IFL_LYR], false);
      if (showIfl) ensureOvIfl(map);
      refreshOverview(map).then(() => {
        K.vis(map, [OV_LOSS_LYR], showLossOnly);
        K.vis(map, [OV_DRV_LYR], showDrv);
        K.vis(map, [OV_IFL_LYR], showIfl);
        syncYearUi();
      });
    }
  }
  function apply(map, on) {
    pMap = map;
    if (!on) {
      K.vis(map, [OV_LOSS_LYR, OV_DRV_LYR, OV_IFL_LYR, LOSS_LYR, DRV_LYR, IFL_LYR], false);
      return;
    }
    kidVis(map, true);
    mountYearUi();
  }
  var legend =
    K.legRamp("linear-gradient(90deg,#d96bb8,#e07070,#f0a030,#ffe66a)", String(Y0), "loss year", String(Y1)) +
    K.legKeys([
      ["#dc2828", "area", DRV_LABEL[1]],
      ["#f2c828", "area", DRV_LABEL[2]],
      ["#e87814", "area", DRV_LABEL[3]],
      ["#963cc8", "area", DRV_LABEL[4]],
      ["#787882", "area", DRV_LABEL[5]],
      ["#c45a8c", "area", "Loss, driver unknown"],
      ["#466e50", "area", "Intact forest (outline/hatch)"]
    ]) +
    '<div class="forest-cred">Overview &lt; z' + LIVE_Z + ' local (~160 KB). Live band uses SUNNY compact WebP tiles (year+driver packed, CC BY rebuild of Hansen/Curtis/IFL) — heavy GFW PNGs never hit the phone. Slider recolours from cache. Past pack max, loss-only live fallback. CC BY 4.0.</div>';
  loadYearRange();
  loadManifest();
  window.__sunnyForestTest = {
    overviewCount: (y0, y1, mode) => {
      return loadOvRaw().then(() => {
        return paintOverview(mode || "loss", y0, y1).count;
      });
    },
    liveCount: (z, x, y, y0, y1) => {
      ensureProtocol();
      return packTile("loss", z, x, y, y0, y1, null).then(() => {
        return getPackedRaw(resolvePack(Math.min(z, packMaxZoom), x, y).z,
          resolvePack(Math.min(z, packMaxZoom), x, y).x,
          resolvePack(Math.min(z, packMaxZoom), x, y).y, "loss", null).then((dec) => {
          var res = resolvePack(Math.min(z, packMaxZoom), x, y);
          var s = samplePacked(dec, z, x, y, res);
          var n = 0, lo = y0 - 2000, hi = y1 - 2000;
          for (var p = 0; p < s.L.length; p++) {
            if (!s.A[p]) continue;
            var off = s.L[p] & 31;
            if (off >= lo && off <= hi) n++;
          }
          return n;
        });
      });
    },
    years: () => { return { min: yearMin, max: yearMax }; },
    setYears: (lo, hi) => { setYearRange(lo, hi); },
    packMaxZoom: () => packMaxZoom
  };
  L.add({
    id: "forest", name: "Forests & logging", icon: "🌲", group: "Human impact",
    dflt: false, kids: KIDS,
    tip: "Tree cover loss and logging drivers. Compact local tiles — light far out, sharp when you zoom, no raw GFW on your phone",
    legend: legend,
    note: () => {
      if (!L.isOn("forest")) return "";
      var bits = [];
      var live = pMap && isLive(pMap);
      bits.push(live ? "pack z≥" + LIVE_Z : "overview");
      if (K.kids.isOn("forest-drv", true)) bits.push("drivers " + yearLabel());
      else if (K.kids.isOn("forest-loss", true)) bits.push("loss " + yearLabel());
      if (K.kids.isOn("forest-ifl", true)) bits.push("intact");
      return bits.join(" · ");
    },
    apply: apply,
    kidSet: () => { if (pMap) kidVis(pMap, L.isOn("forest")); },
    attach: (map, on) => {
      pMap = map;
      ensureProtocol();
      loadOvRaw();
      loadManifest();
      map.on("zoomend", () => {
        if (!L.isOn("forest")) return;
        kidVis(map, true);
      });
      document.addEventListener("sunny-layers-ready", () => { mountYearUi(); });
      setTimeout(mountYearUi, 400);
      apply(map, on);
    }
  });
})();
