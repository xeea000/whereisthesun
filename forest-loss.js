// workspace/whereisthesun/forest-loss.js
/* SUNNY opt211: worldwide tree cover loss / logging impact (Human impact).
 * Kids (subset; zero on → show nothing):
 *   Tree cover loss — Hansen/UMD via GFW true-color tiles, year range slider
 *   Loss drivers — Curtis et al. 2018 classes (forestry = logging), recolored from
 *                   GFW data tiles (G channel = class)
 *   Intact forests — Intact Forest Landscapes (Potapov / intactforests.org) via GFW
 * Off by default; lazy-loaded; visible at every zoom. Free, keyless, CC BY 4.0. */
(() => {
  "use strict";
  var K = window.SunnyKit;
  var L = window.SunnyLayers;
  if (!K || !L || !window.maplibregl) return;
  var Y0 = 2001, Y1 = 2024;
  var yearMin = Y0, yearMax = Y1;
  var OPAC = 0.72;
  var pMap = null;
  var PROTO = "gfwdrv";
  var LOSS_SRC = "forest-loss-src", LOSS_LYR = "forest-loss-lyr";
  var DRV_SRC = "forest-drv-src", DRV_LYR = "forest-drv-lyr";
  var IFL_SRC = "forest-ifl-src", IFL_LYR = "forest-ifl-lyr";
  var KIDS = [
    { id: "forest-loss", name: "Tree cover loss by year", dflt: true },
    { id: "forest-drv", name: "Loss drivers (logging…)", dflt: true },
    { id: "forest-ifl", name: "Intact forests", dflt: true }
  ];
  /* Curtis 2018 / GFW driver class → RGB (G channel of data tile). Forestry highlighted. */
  var DRV_RGB = {
    1: [229, 85, 24],
    2: [242, 183, 1],
    3: [59, 179, 0],
    4: [212, 0, 0],
    5: [49, 130, 189]
  };
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
  function drvUrl() {
    return PROTO + "://tiles.globalforestwatch.org/tsc_tree_cover_loss_drivers/v2023/tcd_30/{z}/{x}/{y}.png";
  }
  function iflUrl() {
    return "https://tiles.globalforestwatch.org/ifl_intact_forest_landscapes/v2025/default/{z}/{x}/{y}.png";
  }
  var protoReady = false;
  function ensureProtocol() {
    if (protoReady || !maplibregl.addProtocol) return;
    maplibregl.addProtocol(PROTO, (req, abort) => {
      var href = req.url.replace(PROTO + "://", "https://");
      return fetch(href, { signal: abort && abort.signal, mode: "cors" }).then((r) => {
        if (!r.ok) throw new Error("gfwdrv " + r.status);
        return r.arrayBuffer();
      }).then((buf) => {
        return createImageBitmap(new Blob([buf], { type: "image/png" })).then((bmp) => {
          var c = typeof OffscreenCanvas !== "undefined"
            ? new OffscreenCanvas(bmp.width, bmp.height)
            : Object.assign(document.createElement("canvas"), { width: bmp.width, height: bmp.height });
          var ctx = c.getContext("2d");
          ctx.drawImage(bmp, 0, 0);
          var img = ctx.getImageData(0, 0, c.width, c.height);
          var d = img.data;
          for (var i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 20) { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; continue; }
            var g = d[i + 1];
            var rgb = DRV_RGB[g];
            if (!rgb) { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; continue; }
            d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
            d[i + 3] = 200;
          }
          ctx.putImageData(img, 0, 0);
          var done = (c.convertToBlob)
            ? c.convertToBlob({ type: "image/png" })
            : new Promise((res) => { c.toBlob((b) => { res(b); }, "image/png"); });
          return done.then((blob) => { return blob.arrayBuffer(); }).then((out) => {
            return { data: out };
          });
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
    if (!silent && pMap) refreshLossTiles(pMap);
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
      '<div class="forest-year-hint">Applies to Tree cover loss. Drivers &amp; intact forests are full-period.</div>';
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
  function refreshLossTiles(map) {
    var src = map.getSource(LOSS_SRC);
    if (src && typeof src.setTiles === "function") {
      try { src.setTiles([lossUrl()]); } catch (e) {}
    } else if (map.getLayer(LOSS_LYR)) {
      try {
        map.removeLayer(LOSS_LYR);
        if (map.getSource(LOSS_SRC)) map.removeSource(LOSS_SRC);
      } catch (e2) {}
      ensureLoss(map);
      kidVis(map, L.isOn("forest"));
    }
  }
  function ensureLoss(map) {
    if (!map.getSource(LOSS_SRC)) {
      map.addSource(LOSS_SRC, {
        type: "raster", tiles: [lossUrl()], tileSize: 256, minzoom: 0, maxzoom: 12,
        attribution: 'Tree cover loss: <a href="https://www.globalforestwatch.org/" target="_blank" rel="noopener">Hansen/UMD/GFW</a> (CC BY 4.0)'
      });
    }
    if (!map.getLayer(LOSS_LYR)) {
      map.addLayer({
        id: LOSS_LYR, type: "raster", source: LOSS_SRC, minzoom: 0,
        paint: { "raster-opacity": OPAC, "raster-fade-duration": 0 }
      }, K.before(map));
    }
  }
  function ensureDrv(map) {
    ensureProtocol();
    if (!map.getSource(DRV_SRC)) {
      map.addSource(DRV_SRC, {
        type: "raster", tiles: [drvUrl()], tileSize: 256, minzoom: 0, maxzoom: 12,
        attribution: 'Loss drivers: <a href="https://www.globalforestwatch.org/" target="_blank" rel="noopener">Curtis et al. 2018 / WRI/GFW</a> (CC BY 4.0)'
      });
    }
    if (!map.getLayer(DRV_LYR)) {
      map.addLayer({
        id: DRV_LYR, type: "raster", source: DRV_SRC, minzoom: 0,
        paint: { "raster-opacity": OPAC, "raster-fade-duration": 0 }
      }, K.before(map));
    }
  }
  function ensureIfl(map) {
    if (!map.getSource(IFL_SRC)) {
      map.addSource(IFL_SRC, {
        type: "raster", tiles: [iflUrl()], tileSize: 256, minzoom: 0, maxzoom: 12,
        attribution: 'Intact Forest Landscapes: <a href="https://intactforests.org/" target="_blank" rel="noopener">Potapov et al. / IFL</a> via GFW (CC BY 4.0)'
      });
    }
    if (!map.getLayer(IFL_LYR)) {
      map.addLayer({
        id: IFL_LYR, type: "raster", source: IFL_SRC, minzoom: 0,
        paint: { "raster-opacity": 0.55, "raster-fade-duration": 0 }
      }, K.before(map));
    }
  }
  function kidVis(map, parentOn) {
    var showLoss = K.kids.layerOn(parentOn, "forest-loss", true);
    var showDrv = K.kids.layerOn(parentOn, "forest-drv", true);
    var showIfl = K.kids.layerOn(parentOn, "forest-ifl", true);
    if (showLoss) ensureLoss(map);
    if (showDrv) ensureDrv(map);
    if (showIfl) ensureIfl(map);
    K.vis(map, [LOSS_LYR], showLoss);
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
      ["#e55518", "area", DRV_LABEL[1]],
      ["#f2b701", "area", DRV_LABEL[2]],
      ["#3bb300", "area", DRV_LABEL[3]],
      ["#d40000", "area", DRV_LABEL[4]],
      ["#3182bd", "area", DRV_LABEL[5]],
      ["#5c8c50", "area", "Intact forest landscape"]
    ]) +
    '<div class="forest-cred">Hansen et al. 2013 · Curtis et al. 2018 · Potapov IFL · GFW/WRI · CC BY 4.0. Gross canopy loss (≥30% density), not net deforestation.</div>';
  loadYearRange();
  L.add({
    id: "forest", name: "Forests & logging", icon: "🌲", group: "Human impact",
    dflt: false, kids: KIDS,
    tip: "Where trees are being felled worldwide: tree cover loss by year, dominant loss driver (forestry = logging), and remaining intact forest landscapes",
    legend: legend,
    note: () => {
      if (!L.isOn("forest")) return "";
      var bits = [];
      if (K.kids.isOn("forest-loss", true)) bits.push("loss " + yearLabel());
      if (K.kids.isOn("forest-drv", true)) bits.push("drivers");
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
        if (K.kids.isOn("forest-loss", true) && !map.getLayer(LOSS_LYR)) ensureLoss(map);
        if (K.kids.isOn("forest-drv", true) && !map.getLayer(DRV_LYR)) ensureDrv(map);
        if (K.kids.isOn("forest-ifl", true) && !map.getLayer(IFL_LYR)) ensureIfl(map);
        kidVis(map, true);
      });
      document.addEventListener("sunny-layers-ready", () => { mountYearUi(); });
      setTimeout(mountYearUi, 400);
      apply(map, on);
    }
  });
})();
