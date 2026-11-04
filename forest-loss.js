// workspace/whereisthesun/forest-loss.js
/* SUNNY opt221: worldwide tree cover loss / logging impact (Human impact).
 * Bandwidth: z < LIVE_Z uses stitched CC-BY overviews (~150 KB all kids); z ≥ LIVE_Z
 * uses live GFW tiles (tileSize 512, source maxzoom, raw-tile LRU + Cache API, abort,
 * concurrency cap). Kids: loss-by-year, drivers (composite on real loss pixels; replaces
 * plain loss), intact forests (outline/hatch). Off by default; lazy; all zooms. */
(() => {
  "use strict";
  var K = window.SunnyKit;
  var L = window.SunnyLayers;
  if (!K || !L || !window.maplibregl) return;
  var Y0 = 2001, Y1 = 2024;
  var yearMin = Y0, yearMax = Y1;
  var OPAC = 0.78;
  var LIVE_Z = 6;
  var LIVE_MAXZOOM = 8;
  var TILE_SIZE = 512;
  var CONCUR = 4;
  var pMap = null;
  var PROTO_COMP = "gfwcomp";
  var PROTO_LOSS = "gfwloss";
  var PROTO_IFL = "gfwifl";
  var OV_LOSS_SRC = "forest-ov-loss-src", OV_LOSS_LYR = "forest-ov-loss-lyr";
  var OV_DRV_SRC = "forest-ov-drv-src", OV_DRV_LYR = "forest-ov-drv-lyr";
  var OV_IFL_SRC = "forest-ov-ifl-src", OV_IFL_LYR = "forest-ov-ifl-lyr";
  var LOSS_SRC = "forest-loss-src", LOSS_LYR = "forest-loss-lyr";
  var DRV_SRC = "forest-drv-src", DRV_LYR = "forest-drv-lyr";
  var IFL_SRC = "forest-ifl-src", IFL_LYR = "forest-ifl-lyr";
  var OV_URL = {
    loss: "data/human/forest-ov/ov-loss.webp?v=456dd6da",
    drv: "data/human/forest-ov/ov-drv.webp?v=524a491b",
    ifl: "data/human/forest-ov/ov-ifl.webp?v=0b1f542c"
  };
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
  /* —— shared fetch: concurrency + Cache API + memory LRU —— */
  var inflight = 0;
  var waitQ = [];
  var memCache = new Map();
  var MEM_MAX = 64;
  var CACHE_NAME = "sunny-gfw-v1";
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
  function fetchBuf(url, signal) {
    var key = url;
    var hit = memGet(key);
    if (hit) return Promise.resolve(hit.slice(0));
    return gate().then(() => {
      var done = (buf) => { memSet(key, buf); release(); return buf.slice(0); };
      var fail = (e) => { release(); throw e; };
      var fromNet = () => {
        return fetch(url, { signal: signal, mode: "cors" }).then((r) => {
          if (!r.ok) throw new Error("gfw " + r.status);
          return r.arrayBuffer();
        }).then((buf) => {
          if (typeof caches !== "undefined") {
            try {
              caches.open(CACHE_NAME).then((c) => {
                c.put(url, new Response(buf.slice(0), { headers: { "Content-Type": "image/png" } }));
              }).catch(() => {});
            } catch (eC) {}
          }
          return done(buf);
        }).catch(fail);
      };
      if (typeof caches === "undefined") return fromNet();
      return caches.open(CACHE_NAME).then((c) => {
        return c.match(url).then((resp) => {
          if (!resp) return fromNet();
          return resp.arrayBuffer().then(done).catch(fromNet);
        });
      }).catch(fromNet);
    });
  }
  function fetchBmp(url, signal) {
    return fetchBuf(url, signal).then((buf) => {
      return createImageBitmap(new Blob([buf], { type: "image/png" }));
    });
  }
  function canvasFromBitmap(bmp) {
    var c = typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(bmp.width, bmp.height)
      : Object.assign(document.createElement("canvas"), { width: bmp.width, height: bmp.height });
    var ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    return { c: c, ctx: ctx, img: ctx.getImageData(0, 0, c.width, c.height) };
  }
  function blobToBuffer(c) {
    var done = (c.convertToBlob)
      ? c.convertToBlob({ type: "image/png" })
      : new Promise((res) => { c.toBlob((b) => { res(b); }, "image/png"); });
    return done.then((blob) => { return blob.arrayBuffer(); }).then((out) => { return { data: out }; });
  }
  function rawLossUrl(z, x, y) {
    return "https://tiles.globalforestwatch.org/umd_tree_cover_loss/v1.11/tcd_30/" + z + "/" + x + "/" + y + ".png";
  }
  function rawDrvUrl(z, x, y) {
    return "https://tiles.globalforestwatch.org/tsc_tree_cover_loss_drivers/v2023/tcd_30/" + z + "/" + x + "/" + y + ".png";
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
  function parseZxy(url, proto) {
    var u = url.replace(proto + "://", "https://dummy/");
    var m = u.match(/\/(\d+)\/(\d+)\/(\d+)/);
    var q = {};
    u.replace(/[?&]([^=]+)=([^&]+)/g, (_, k, v) => { q[k] = v; });
    return {
      z: m ? +m[1] : 0, x: m ? +m[2] : 0, y: m ? +m[3] : 0,
      y0: +(q.y0 || yearMin), y1: +(q.y1 || yearMax)
    };
  }
  function lossLiveUrl() {
    return PROTO_LOSS + "://v/{z}/{x}/{y}?y0=" + yearMin + "&y1=" + yearMax;
  }
  function drvCompUrl() {
    return PROTO_COMP + "://v/{z}/{x}/{y}?y0=" + yearMin + "&y1=" + yearMax;
  }
  function iflLiveUrl() {
    return PROTO_IFL + "://tiles.globalforestwatch.org/ifl_intact_forest_landscapes/v2025/default/{z}/{x}/{y}.png";
  }
  var protoReady = false;
  function ensureProtocol() {
    if (protoReady || !maplibregl.addProtocol) return;
    maplibregl.addProtocol(PROTO_LOSS, (req, abort) => {
      var p = parseZxy(req.url, PROTO_LOSS);
      var signal = abort && abort.signal;
      var ckey = "loss-out:" + p.z + "/" + p.x + "/" + p.y + ":" + p.y0 + "-" + p.y1;
      var hit = memGet(ckey);
      if (hit) return Promise.resolve({ data: hit.slice(0) });
      return fetchBmp(rawLossUrl(p.z, p.x, p.y), signal).then((bmp) => {
        var pack = canvasFromBitmap(bmp);
        var d = pack.img.data;
        var out = pack.ctx.createImageData(pack.c.width, pack.c.height);
        var o = out.data;
        for (var i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 20 || !d[i]) continue;
          var year = 2000 + d[i];
          if (year < p.y0 || year > p.y1) continue;
          var rgb = yearColor(year);
          o[i] = rgb[0]; o[i + 1] = rgb[1]; o[i + 2] = rgb[2]; o[i + 3] = 200;
        }
        pack.ctx.putImageData(out, 0, 0);
        return blobToBuffer(pack.c).then((res) => {
          memSet(ckey, res.data);
          return res;
        });
      });
    });
    maplibregl.addProtocol(PROTO_COMP, (req, abort) => {
      var p = parseZxy(req.url, PROTO_COMP);
      var signal = abort && abort.signal;
      var ckey = "drv-out:" + p.z + "/" + p.x + "/" + p.y + ":" + p.y0 + "-" + p.y1;
      var hit = memGet(ckey);
      if (hit) return Promise.resolve({ data: hit.slice(0) });
      return Promise.all([
        fetchBmp(rawLossUrl(p.z, p.x, p.y), signal),
        fetchBmp(rawDrvUrl(p.z, p.x, p.y), signal)
      ]).then((bmps) => {
        var loss = canvasFromBitmap(bmps[0]);
        var drv = canvasFromBitmap(bmps[1]);
        var ld = loss.img.data, dd = drv.img.data;
        var out = loss.ctx.createImageData(loss.c.width, loss.c.height);
        var o = out.data;
        for (var i = 0; i < ld.length; i += 4) {
          if (ld[i + 3] < 20 || !ld[i]) continue;
          var year = 2000 + ld[i];
          if (year < p.y0 || year > p.y1) continue;
          var cls = dd[i + 1];
          var rgb = (dd[i + 3] >= 20 && DRV_RGB[cls]) ? DRV_RGB[cls] : DRV_UNK;
          o[i] = rgb[0]; o[i + 1] = rgb[1]; o[i + 2] = rgb[2]; o[i + 3] = 210;
        }
        loss.ctx.putImageData(out, 0, 0);
        return blobToBuffer(loss.c).then((res) => {
          memSet(ckey, res.data);
          return res;
        });
      });
    });
    maplibregl.addProtocol(PROTO_IFL, (req, abort) => {
      var href = req.url.replace(PROTO_IFL + "://", "https://");
      var signal = abort && abort.signal;
      var ckey = "ifl-out:" + href;
      var hit = memGet(ckey);
      if (hit) return Promise.resolve({ data: hit.slice(0) });
      return fetchBmp(href, signal).then((bmp) => {
        var pack = canvasFromBitmap(bmp);
        var d = pack.img.data;
        var w = pack.c.width, h = pack.c.height;
        var mask = new Uint8Array(w * h);
        var i, x, y, idx;
        for (i = 0, idx = 0; i < d.length; i += 4, idx++) {
          mask[idx] = d[i + 3] > 40 ? 1 : 0;
          d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
        }
        for (y = 0; y < h; y++) {
          for (x = 0; x < w; x++) {
            idx = y * w + x;
            if (!mask[idx]) continue;
            var edge = false;
            if (x === 0 || !mask[idx - 1]) edge = true;
            else if (x === w - 1 || !mask[idx + 1]) edge = true;
            else if (y === 0 || !mask[idx - w]) edge = true;
            else if (y === h - 1 || !mask[idx + w]) edge = true;
            var hatch = ((x + y) % 5 === 0);
            if (!edge && !hatch) continue;
            i = idx * 4;
            d[i] = 70; d[i + 1] = 110; d[i + 2] = 80;
            d[i + 3] = edge ? 200 : 100;
          }
        }
        pack.ctx.putImageData(pack.img, 0, 0);
        return blobToBuffer(pack.c).then((res) => {
          memSet(ckey, res.data);
          return res;
        });
      });
    });
    protoReady = true;
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
    if (!silent && pMap) refreshLiveTiles(pMap);
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
        ? ("Overview below z" + LIVE_Z + " (full period, ~150 KB). Year filter + live detail from z" + LIVE_Z + ".")
        : "Year filter on live tiles. Drivers drawn only on real loss pixels.";
    }
  }
  function mountYearUi() {
    var input = document.querySelector('.lp-input[data-id="forest"]');
    if (!input) return;
    var wrap = input.closest(".lp-fold");
    if (!wrap || wrap.querySelector(".forest-year-range")) return;
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
    wrap.appendChild(box);
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
  function ensureOv(map, kind) {
    var srcId = kind === "loss" ? OV_LOSS_SRC : kind === "drv" ? OV_DRV_SRC : OV_IFL_SRC;
    var lyrId = kind === "loss" ? OV_LOSS_LYR : kind === "drv" ? OV_DRV_LYR : OV_IFL_LYR;
    var url = OV_URL[kind];
    /* Image sources: no attribution field (MapLibre drops the source). Credit lives in the legend. */
    if (!map.getSource(srcId)) {
      map.addSource(srcId, {
        type: "image", url: url,
        coordinates: [
          [-180, 85.05112878], [180, 85.05112878],
          [180, -85.05112878], [-180, -85.05112878]
        ]
      });
    }
    if (!map.getLayer(lyrId)) {
      map.addLayer({
        id: lyrId, type: "raster", source: srcId, minzoom: 0, maxzoom: LIVE_Z + 0.01,
        paint: { "raster-opacity": OPAC, "raster-fade-duration": 0 }
      }, K.before(map));
    }
  }
  function ensureLiveLoss(map) {
    ensureProtocol();
    if (!map.getSource(LOSS_SRC)) {
      map.addSource(LOSS_SRC, {
        type: "raster", tiles: [lossLiveUrl()], tileSize: TILE_SIZE,
        minzoom: LIVE_Z, maxzoom: LIVE_MAXZOOM,
        attribution: 'Tree cover loss: <a href="https://www.globalforestwatch.org/" target="_blank" rel="noopener">Hansen/UMD/GFW</a> (CC BY 4.0)'
      });
    }
    if (!map.getLayer(LOSS_LYR)) {
      map.addLayer({
        id: LOSS_LYR, type: "raster", source: LOSS_SRC, minzoom: LIVE_Z,
        paint: { "raster-opacity": OPAC, "raster-fade-duration": 0 }
      }, K.before(map));
    }
  }
  function ensureLiveDrv(map) {
    ensureProtocol();
    if (!map.getSource(DRV_SRC)) {
      map.addSource(DRV_SRC, {
        type: "raster", tiles: [drvCompUrl()], tileSize: TILE_SIZE,
        minzoom: LIVE_Z, maxzoom: LIVE_MAXZOOM,
        attribution: 'Loss drivers: Curtis et al. 2018 / GFW (CC BY 4.0), on Hansen loss pixels only'
      });
    }
    if (!map.getLayer(DRV_LYR)) {
      map.addLayer({
        id: DRV_LYR, type: "raster", source: DRV_SRC, minzoom: LIVE_Z,
        paint: { "raster-opacity": OPAC, "raster-fade-duration": 0 }
      }, K.before(map));
    }
  }
  function ensureLiveIfl(map) {
    ensureProtocol();
    if (!map.getSource(IFL_SRC)) {
      map.addSource(IFL_SRC, {
        type: "raster", tiles: [iflLiveUrl()], tileSize: TILE_SIZE,
        minzoom: LIVE_Z, maxzoom: LIVE_MAXZOOM,
        attribution: 'Intact Forest Landscapes: Potapov / IFL via GFW (CC BY 4.0)'
      });
    }
    if (!map.getLayer(IFL_LYR)) {
      map.addLayer({
        id: IFL_LYR, type: "raster", source: IFL_SRC, minzoom: LIVE_Z,
        paint: { "raster-opacity": 0.85, "raster-fade-duration": 0 }
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
    setTiles(map, LOSS_SRC, lossLiveUrl());
    setTiles(map, DRV_SRC, drvCompUrl());
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
      if (showLossOnly) ensureLiveLoss(map);
      if (showDrv) ensureLiveDrv(map);
      if (showIfl) ensureLiveIfl(map);
      K.vis(map, [OV_LOSS_LYR, OV_DRV_LYR, OV_IFL_LYR], false);
      K.vis(map, [LOSS_LYR], showLossOnly);
      K.vis(map, [DRV_LYR], showDrv);
      K.vis(map, [IFL_LYR], showIfl);
    } else {
      if (showLossOnly) ensureOv(map, "loss");
      if (showDrv) ensureOv(map, "drv");
      if (showIfl) ensureOv(map, "ifl");
      K.vis(map, [LOSS_LYR, DRV_LYR, IFL_LYR], false);
      K.vis(map, [OV_LOSS_LYR], showLossOnly);
      K.vis(map, [OV_DRV_LYR], showDrv);
      K.vis(map, [OV_IFL_LYR], showIfl);
    }
    syncYearUi();
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
  /* opt222: legend rows only for enabled forest kids (cred text from opt221 overview) */
  function legend() {
    if (!K.kids.anyOn(KIDS)) return "";
    var bits = [];
    if (K.kids.isOn("forest-loss", true) || K.kids.isOn("forest-drv", true)) {
      bits.push(K.legRamp("linear-gradient(90deg,#d96bb8,#e07070,#f0a030,#ffe66a)", String(Y0), "loss year", String(Y1)));
    }
    if (K.kids.isOn("forest-drv", true)) {
      bits.push(K.legKeys([
        ["#dc2828", "area", DRV_LABEL[1]],
        ["#f2c828", "area", DRV_LABEL[2]],
        ["#e87814", "area", DRV_LABEL[3]],
        ["#963cc8", "area", DRV_LABEL[4]],
        ["#787882", "area", DRV_LABEL[5]],
        ["#c45a8c", "area", "Loss, driver unknown"]
      ]));
    }
    if (K.kids.isOn("forest-ifl", true)) {
      bits.push(K.legKeys([["#466e50", "area", "Intact forest (outline/hatch)"]]));
    }
    bits.push('<div class="forest-cred">Overview &lt; z' + LIVE_Z + ' from local CC-BY stitch (~150 KB). Live GFW detail from z' + LIVE_Z + ' (tileSize ' + TILE_SIZE + ', maxzoom ' + LIVE_MAXZOOM + '). Hansen · Curtis · Potapov/IFL · GFW/WRI · CC BY 4.0. Drivers on real loss pixels only.</div>');
    return bits.join("");
  }
  loadYearRange();
  L.add({
    id: "forest", name: "Forests & logging", icon: "🌲", group: "Human impact",
    dflt: false, kids: KIDS,
    tip: "Tree cover loss and logging drivers worldwide. Light overview far out; live detail when you zoom in",
    legend: legend,
    note: () => {
      if (!L.isOn("forest")) return "";
      var bits = [];
      var live = pMap && isLive(pMap);
      bits.push(live ? "live z≥" + LIVE_Z : "overview");
      if (K.kids.isOn("forest-drv", true)) bits.push("drivers " + (live ? yearLabel() : "full"));
      else if (K.kids.isOn("forest-loss", true)) bits.push("loss " + (live ? yearLabel() : "full"));
      if (K.kids.isOn("forest-ifl", true)) bits.push("intact");
      return bits.join(" · ");
    },
    apply: apply,
    kidSet: () => { if (pMap) kidVis(pMap, L.isOn("forest")); },
    attach: (map, on) => {
      pMap = map;
      ensureProtocol();
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
