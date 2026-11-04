// workspace/whereisthesun/forest-loss.js
/* SUNNY opt213: worldwide tree cover loss / logging impact (Human impact).
 * Kids (subset; zero on → show nothing):
 *   Tree cover loss — Hansen/UMD via GFW true-color tiles, year range slider
 *   Loss drivers — Curtis et al. 2018 classes painted only on real loss pixels
 *                   (composite of UMD loss × driver tiles; replaces plain loss colour)
 *   Intact forests — Intact Forest Landscapes outline + hatch (outline + hatch, not solid fill)
 * Off by default; lazy-loaded; visible at every zoom. Free, keyless, CC BY 4.0. */
(() => {
  "use strict";
  var K = window.SunnyKit;
  var L = window.SunnyLayers;
  if (!K || !L || !window.maplibregl) return;
  var Y0 = 2001, Y1 = 2024;
  var yearMin = Y0, yearMax = Y1;
  var OPAC = 0.78;
  var pMap = null;
  var PROTO_COMP = "gfwcomp";
  var PROTO_IFL = "gfwifl";
  var LOSS_SRC = "forest-loss-src", LOSS_LYR = "forest-loss-lyr";
  var DRV_SRC = "forest-drv-src", DRV_LYR = "forest-drv-lyr";
  var IFL_SRC = "forest-ifl-src", IFL_LYR = "forest-ifl-lyr";
  var KIDS = [
    { id: "forest-loss", name: "Tree cover loss by year", dflt: true },
    { id: "forest-drv", name: "Loss drivers (logging…)", dflt: true },
    { id: "forest-ifl", name: "Intact forests", dflt: true }
  ];
  /* Curtis 2018 classes — palette distinct from live vegetation green. */
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
  function lossUrl() {
    return "https://production-api.globalforestwatch.org/v1/true-color-tiles/loss/{z}/{x}/{y}" +
      "?thresh=30&startYear=" + yearMin + "&endYear=" + yearMax;
  }
  function drvCompUrl() {
    return PROTO_COMP + "://v/{z}/{x}/{y}?y0=" + yearMin + "&y1=" + yearMax;
  }
  function iflUrl() {
    return PROTO_IFL + "://tiles.globalforestwatch.org/ifl_intact_forest_landscapes/v2025/default/{z}/{x}/{y}.png";
  }
  function rawLossUrl(z, x, y) {
    return "https://tiles.globalforestwatch.org/umd_tree_cover_loss/v1.11/tcd_30/" + z + "/" + x + "/" + y + ".png";
  }
  function rawDrvUrl(z, x, y) {
    return "https://tiles.globalforestwatch.org/tsc_tree_cover_loss_drivers/v2023/tcd_30/" + z + "/" + x + "/" + y + ".png";
  }
  function canvasFromBitmap(bmp) {
    var c = typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(bmp.width, bmp.height)
      : Object.assign(document.createElement("canvas"), { width: bmp.width, height: bmp.height });
    var ctx = c.getContext("2d");
    ctx.drawImage(bmp, 0, 0);
    return { c: c, ctx: ctx, img: ctx.getImageData(0, 0, c.width, c.height) };
  }
  function blobToBuffer(c) {
    var done = (c.convertToBlob)
      ? c.convertToBlob({ type: "image/png" })
      : new Promise((res) => { c.toBlob((b) => { res(b); }, "image/png"); });
    return done.then((blob) => { return blob.arrayBuffer(); }).then((out) => { return { data: out }; });
  }
  function fetchBmp(url, signal) {
    return fetch(url, { signal: signal, mode: "cors" }).then((r) => {
      if (!r.ok) throw new Error("gfw " + r.status);
      return r.arrayBuffer();
    }).then((buf) => {
      return createImageBitmap(new Blob([buf], { type: "image/png" }));
    });
  }
  function parseCompUrl(url) {
    var u = url.replace(PROTO_COMP + "://", "https://dummy/");
    var m = u.match(/\/(\d+)\/(\d+)\/(\d+)/);
    var q = {};
    u.replace(/[?&]([^=]+)=([^&]+)/g, (_, k, v) => { q[k] = v; });
    return {
      z: m ? +m[1] : 0, x: m ? +m[2] : 0, y: m ? +m[3] : 0,
      y0: +(q.y0 || yearMin), y1: +(q.y1 || yearMax)
    };
  }
  var protoReady = false;
  function ensureProtocol() {
    if (protoReady || !maplibregl.addProtocol) return;
    maplibregl.addProtocol(PROTO_COMP, (req, abort) => {
      var p = parseCompUrl(req.url);
      var signal = abort && abort.signal;
      return Promise.all([
        fetchBmp(rawLossUrl(p.z, p.x, p.y), signal),
        fetchBmp(rawDrvUrl(p.z, p.x, p.y), signal)
      ]).then((bmps) => {
        var loss = canvasFromBitmap(bmps[0]);
        var drv = canvasFromBitmap(bmps[1]);
        var ld = loss.img.data, dd = drv.img.data;
        var out = loss.ctx.createImageData(loss.c.width, loss.c.height);
        var o = out.data;
        var y0 = p.y0, y1 = p.y1;
        for (var i = 0; i < ld.length; i += 4) {
          if (ld[i + 3] < 20 || !ld[i]) { continue; }
          var year = 2000 + ld[i];
          if (year < y0 || year > y1) continue;
          var cls = dd[i + 1];
          var rgb = (dd[i + 3] >= 20 && DRV_RGB[cls]) ? DRV_RGB[cls] : DRV_UNK;
          o[i] = rgb[0]; o[i + 1] = rgb[1]; o[i + 2] = rgb[2]; o[i + 3] = 210;
        }
        loss.ctx.putImageData(out, 0, 0);
        return blobToBuffer(loss.c);
      });
    });
    maplibregl.addProtocol(PROTO_IFL, (req, abort) => {
      var href = req.url.replace(PROTO_IFL + "://", "https://");
      return fetchBmp(href, abort && abort.signal).then((bmp) => {
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
        return blobToBuffer(pack.c);
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
    if (!silent && pMap) refreshYearTiles(pMap);
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
      '<div class="forest-year-hint">Applies to Tree cover loss and Loss drivers. Intact forests are full-period outline/hatch.</div>';
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
  function setTilesOrRebuild(map, srcId, lyrId, url, ensureFn) {
    var src = map.getSource(srcId);
    if (src && typeof src.setTiles === "function") {
      try { src.setTiles([url]); return; } catch (e) {}
    }
    if (map.getLayer(lyrId)) {
      try {
        map.removeLayer(lyrId);
        if (map.getSource(srcId)) map.removeSource(srcId);
      } catch (e2) {}
      ensureFn(map);
    }
  }
  function refreshYearTiles(map) {
    setTilesOrRebuild(map, LOSS_SRC, LOSS_LYR, lossUrl(), ensureLoss);
    setTilesOrRebuild(map, DRV_SRC, DRV_LYR, drvCompUrl(), ensureDrv);
    kidVis(map, L.isOn("forest"));
  }
  function ensureLoss(map) {
    if (!map.getSource(LOSS_SRC)) {
      map.addSource(LOSS_SRC, K.overzoom({
        type: "raster", tiles: [lossUrl()], tileSize: 256, minzoom: 0,
        attribution: 'Tree cover loss: <a href="https://www.globalforestwatch.org/" target="_blank" rel="noopener">Hansen/UMD/GFW</a> (CC BY 4.0)'
      }, 12));
    }
    if (!map.getLayer(LOSS_LYR)) {
      map.addLayer({
        id: LOSS_LYR, type: "raster", source: LOSS_SRC, minzoom: 0,
        paint: { "raster-opacity": OPAC, "raster-fade-duration": 0 }
      }, K.before(map));
      K.uncapped(map, [LOSS_LYR]);
    }
  }
  function ensureDrv(map) {
    ensureProtocol();
    if (!map.getSource(DRV_SRC)) {
      map.addSource(DRV_SRC, K.overzoom({
        type: "raster", tiles: [drvCompUrl()], tileSize: 256, minzoom: 0,
        attribution: 'Loss drivers: <a href="https://www.globalforestwatch.org/" target="_blank" rel="noopener">Curtis et al. 2018 / WRI/GFW</a> (CC BY 4.0), painted on Hansen loss pixels only'
      }, 12));
    }
    if (!map.getLayer(DRV_LYR)) {
      map.addLayer({
        id: DRV_LYR, type: "raster", source: DRV_SRC, minzoom: 0,
        paint: { "raster-opacity": OPAC, "raster-fade-duration": 0 }
      }, K.before(map));
      K.uncapped(map, [DRV_LYR]);
    }
  }
  function ensureIfl(map) {
    ensureProtocol();
    if (!map.getSource(IFL_SRC)) {
      map.addSource(IFL_SRC, K.overzoom({
        type: "raster", tiles: [iflUrl()], tileSize: 256, minzoom: 0,
        attribution: 'Intact Forest Landscapes: <a href="https://intactforests.org/" target="_blank" rel="noopener">Potapov et al. / IFL</a> via GFW (CC BY 4.0)'
      }, 12));
    }
    if (!map.getLayer(IFL_LYR)) {
      map.addLayer({
        id: IFL_LYR, type: "raster", source: IFL_SRC, minzoom: 0,
        paint: { "raster-opacity": 0.85, "raster-fade-duration": 0 }
      }, K.before(map));
      K.uncapped(map, [IFL_LYR]);
    }
  }
  function kidVis(map, parentOn) {
    var showLoss = K.kids.layerOn(parentOn, "forest-loss", true);
    var showDrv = K.kids.layerOn(parentOn, "forest-drv", true);
    var showIfl = K.kids.layerOn(parentOn, "forest-ifl", true);
    /* Drivers on → composite only; plain loss layer hidden. */
    var showLossOnly = showLoss && !showDrv;
    if (showLossOnly) ensureLoss(map);
    if (showDrv) ensureDrv(map);
    if (showIfl) ensureIfl(map);
    K.vis(map, [LOSS_LYR], showLossOnly);
    K.vis(map, [DRV_LYR], showDrv);
    K.vis(map, [IFL_LYR], showIfl);
  }
  function apply(map, on) {
    pMap = map;
    if (!on) {
      K.vis(map, [LOSS_LYR, DRV_LYR, IFL_LYR], false);
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
    '<div class="forest-cred">Hansen et al. 2013 · Curtis et al. 2018 · Potapov IFL · GFW/WRI · CC BY 4.0. Drivers drawn only on real 30&nbsp;m loss pixels (no grid blocks). Gross canopy loss (≥30% density), not net deforestation.</div>';
  loadYearRange();
  L.add({
    id: "forest", name: "Forests & logging", icon: "🌲", group: "Human impact",
    dflt: false, kids: KIDS,
    tip: "Where trees are being felled worldwide: tree cover loss by year, dominant loss driver (forestry = logging) on real loss pixels only, and intact forest outlines",
    legend: legend,
    note: () => {
      if (!L.isOn("forest")) return "";
      var bits = [];
      if (K.kids.isOn("forest-drv", true)) bits.push("drivers " + yearLabel());
      else if (K.kids.isOn("forest-loss", true)) bits.push("loss " + yearLabel());
      if (K.kids.isOn("forest-ifl", true)) bits.push("intact");
      return bits.length ? bits.join(" · ") : "no kids on";
    },
    apply: apply,
    kidSet: () => { if (pMap) kidVis(pMap, L.isOn("forest")); },
    attach: (map, on) => {
      pMap = map;
      ensureProtocol();
      map.on("idle", () => {
        if (!L.isOn("forest")) return;
        var showLoss = K.kids.isOn("forest-loss", true);
        var showDrv = K.kids.isOn("forest-drv", true);
        if (showLoss && !showDrv && !map.getLayer(LOSS_LYR)) ensureLoss(map);
        if (showDrv && !map.getLayer(DRV_LYR)) ensureDrv(map);
        if (K.kids.isOn("forest-ifl", true) && !map.getLayer(IFL_LYR)) ensureIfl(map);
        kidVis(map, true);
      });
      document.addEventListener("sunny-layers-ready", () => { mountYearUi(); });
      setTimeout(mountYearUi, 400);
      apply(map, on);
    }
  });
})();
