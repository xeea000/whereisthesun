// workspace/whereisthesun/ocean-garbage.js
/* SUNNY opt223: ocean plastic / garbage (Human impact).
 * Kids (subset; zero on → show nothing):
 *   Measured samples — NOAA NCEI Marine Microplastics (~22.5k), coloured by concentration class
 *   Model surface — smooth ocean-masked interpolated field (WebP via SunnyKit.field), labelled model
 *   Gyre zones — five subtropical ocean-only model contours (labelled model)
 *   River outflows — Meijer 2021 recalibrated top emitters (sized by tons/yr)
 *   Beach samples — NOAA NCEI beach microplastics
 * LOD: thinned overview under z5, mid z5–7, full z8+ for points; model field ov→2x at z5.
 * Coarse (all kids) budget << 1 MB. Ordinal concentration slider filters sample/beach class. */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers;
  if (!K || !L) return;
  var CLASS = ["Very Low", "Low", "Medium", "High", "Very High"];
  var CLASS_COL = ["#94a3b8", "#38bdf8", "#fbbf24", "#f97316", "#ef4444"];
  var minClass = 0;
  var KIDS = [
    { id: "oceangarbage-samples", name: "Measured samples (NOAA)", dflt: true },
    { id: "oceangarbage-model", name: "Model surface (labelled)", dflt: true },
    { id: "oceangarbage-gyres", name: "Five gyre zones (model)", dflt: true },
    { id: "oceangarbage-rivers", name: "River plastic outflows", dflt: true },
    { id: "oceangarbage-beach", name: "Beach samples (NOAA)", dflt: true }
  ];
  var CUT = [{ z: 5, id: "ov" }, { z: 8, id: "mid" }, { z: 24, id: "full" }];
  /* literal data URLs so tools/data-hashes.js can stamp ?v= */
  var URLS = {
    samples_ov: "data/human/plastic/samples-ov.json?v=2e68b283",
    samples_mid: "data/human/plastic/samples-mid.json?v=9c285c23",
    samples_full: "data/human/plastic/samples-full.json?v=c6ed7f7e",
    model_ov: "data/human/plastic/model-field.webp?v=dc4d53c4",
    model_hi: "data/human/plastic/model-field-2x.webp?v=e2c738ac",
    rivers_ov: "data/human/plastic/rivers-ov.json?v=8b52cc3d",
    rivers_mid: "data/human/plastic/rivers-mid.json?v=f9738546",
    rivers_full: "data/human/plastic/rivers-full.json?v=c7764ca7",
    gyres: "data/human/plastic/gyres.json?v=c12662c7",
    beach: "data/human/plastic/beach.json?v=36a6d603"
  };
  var S_SRC = "og-samples", S_LYR = "og-samples-dot";
  var G_SRC = "og-gyres", G_FILL = "og-gyres-fill", G_LINE = "og-gyres-line";
  var R_SRC = "og-rivers", R_LYR = "og-rivers-dot";
  var B_SRC = "og-beach", B_LYR = "og-beach-dot";
  var modelField = K.field({
    id: "og-model",
    urls: { ov: URLS.model_ov, hi: URLS.model_hi },
    bounds: [-180, -90, 180, 90],
    cutZ: 5,
    opacity: 0.92
  });
  var pMap = null, riverFeats = null;
  var sampleBand = null, riverBand = null;
  var sampleCache = {}, riverCache = {}, beachCache = null, gyreCache = null;
  var sampleLoad = {}, riverLoad = {}, beachLoad = null, gyreLoad = null;
  var loadingNote = false;
  var ATTRIB =
    'Ocean plastic: <a href="https://www.ncei.noaa.gov/products/microplastics" target="_blank" rel="noopener">NOAA NCEI</a> · ' +
    '<a href="https://doi.org/10.1088/1748-9326/10/12/124006" target="_blank" rel="noopener">van Sebille 2015</a> · ' +
    '<a href="https://doi.org/10.1126/sciadv.aaz5803" target="_blank" rel="noopener">Meijer 2021</a>';
  function grey(t) {
    return '<span style="color:#9ca3af;font-size:11px">' + t + "</span>";
  }
  function classLabel() {
    return minClass <= 0 ? "all classes" : ("≥ " + CLASS[minClass]);
  }
  function setMinClass(v, silent) {
    minClass = Math.max(0, Math.min(4, v | 0));
    try { localStorage.setItem("sunny-og-class", String(minClass)); } catch (e) {}
    syncClassUi();
    if (!silent && pMap) {
      if (pMap.getLayer(S_LYR)) pMap.setFilter(S_LYR, classFilter());
      if (pMap.getLayer(B_LYR)) pMap.setFilter(B_LYR, classFilter());
    }
  }
  function loadClass() {
    try {
      var v = localStorage.getItem("sunny-og-class");
      if (v != null) setMinClass(+v, true);
    } catch (e) {}
  }
  function syncClassUi() {
    var box = document.querySelector(".og-class-range");
    if (!box) return;
    var inp = box.querySelector(".hi-year-lo");
    var val = box.querySelector(".hi-year-range-val");
    if (inp) inp.value = String(minClass);
    if (val) val.textContent = classLabel();
    var fill = box.querySelector(".hi-year-range-fill");
    if (fill) {
      fill.style.left = (minClass / 4 * 100) + "%";
      fill.style.width = ((4 - minClass) / 4 * 100) + "%";
    }
  }
  function mountClassUi() {
    var host = (L && L.ctrlHost) ? L.ctrlHost("oceangarbage") : null;
    if (!host) {
      var fold = document.querySelector('.lp-fold[data-layer="oceangarbage"]');
      host = fold && fold.querySelector(".lp-ctrls");
    }
    if (!host || host.querySelector(".og-class-range")) return;
    var box = document.createElement("div");
    box.className = "hi-year-range og-class-range";
    box.innerHTML =
      '<span class="hi-year-range-lab">Class</span>' +
      '<div class="hi-year-range-track"><div class="hi-year-range-fill"></div>' +
      '<input class="hi-year-lo" type="range" min="0" max="4" step="1" aria-label="Minimum concentration class"></div>' +
      '<span class="hi-year-range-val"></span>';
    host.appendChild(box);
    box.querySelector(".hi-year-lo").addEventListener("input", (e) => { setMinClass(+e.target.value); });
    syncClassUi();
  }
  function classFilter() {
    return [">=", ["get", "c"], minClass];
  }
  function unpackSample(row) {
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [row[0] / 100, row[1] / 100] },
      properties: {
        c: row[2] | 0,
        m: row[3] != null ? row[3] : null,
        y: row[4] != null ? row[4] : null,
        name: "Ocean plastic sample"
      }
    };
  }
  function unpackRiver(row) {
    var ton = (row[2] || 0) / 100;
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [row[0] / 100, row[1] / 100] },
      properties: {
        ton: ton,
        rank: row[3] || 0,
        logt: ton > 0 ? Math.log10(ton) : 0,
        name: "River plastic outflow"
      }
    };
  }
  function unpackBeach(row) {
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [row[0] / 100, row[1] / 100] },
      properties: {
        c: row[2] | 0,
        place: row[3] || "",
        m: row[4] != null ? row[4] : null,
        name: row[3] || "Beach plastic sample"
      }
    };
  }
  function fetchBand(kind, band) {
    var key = kind + "_" + band;
    var cache = kind === "samples" ? sampleCache : riverCache;
    var loads = kind === "samples" ? sampleLoad : riverLoad;
    if (cache[band]) return Promise.resolve(cache[band]);
    if (loads[band]) return loads[band];
    loadingNote = true;
    var url = URLS[key];
    loads[band] = K.loadJson(url).then((d) => {
      var feats;
      if (kind === "samples") feats = (d.pts || []).map(unpackSample);
      else feats = (d.pts || []).map(unpackRiver);
      cache[band] = feats;
      loadingNote = false;
      try { L.refresh && L.refresh(); } catch (e) {}
      return feats;
    }).catch((e) => { loadingNote = false; delete loads[band]; throw e; });
    return loads[band];
  }
  function fetchGyres() {
    if (gyreCache) return Promise.resolve(gyreCache);
    if (gyreLoad) return gyreLoad;
    loadingNote = true;
    gyreLoad = K.loadJson(URLS.gyres).then((d) => {
      gyreCache = {
        type: "FeatureCollection",
        features: (d.patches || []).map((p) => {
          return {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [p.ring] },
            properties: {
              id: p.id, name: p.name, label: p.label || "model",
              area: p.area_km2_approx || 0, note: "model contour"
            }
          };
        })
      };
      loadingNote = false;
      try { L.refresh && L.refresh(); } catch (e) {}
      return gyreCache;
    }).catch((e) => { loadingNote = false; gyreLoad = null; throw e; });
    return gyreLoad;
  }
  function fetchBeach() {
    if (beachCache) return Promise.resolve(beachCache);
    if (beachLoad) return beachLoad;
    loadingNote = true;
    beachLoad = K.loadJson(URLS.beach).then((d) => {
      beachCache = (d.pts || []).map(unpackBeach);
      loadingNote = false;
      try { L.refresh && L.refresh(); } catch (e) {}
      return beachCache;
    }).catch((e) => { loadingNote = false; beachLoad = null; throw e; });
    return beachLoad;
  }
  function put(map, src, feats) {
    var fc = { type: "FeatureCollection", features: feats || [] };
    if (map.getSource(src)) map.getSource(src).setData(fc);
    else map.addSource(src, { type: "geojson", data: fc, attribution: ATTRIB });
  }
  function ensureSamples(map, feats) {
    put(map, S_SRC, feats);
    if (!map.getLayer(S_LYR)) {
      map.addLayer({
        id: S_LYR, type: "circle", source: S_SRC, filter: classFilter(),
        paint: {
          "circle-color": [
            "match", ["get", "c"],
            0, CLASS_COL[0], 1, CLASS_COL[1], 2, CLASS_COL[2], 3, CLASS_COL[3], 4, CLASS_COL[4],
            "#94a3b8"
          ],
          "circle-radius": K.markerScale.bind(map, S_LYR, "circle-radius",
            K.size({ stops: [[1, 2.2], [4, 3], [8, 4.2], [12, 5.5]] })),
          "circle-opacity": 0.92,
          "circle-stroke-color": "rgba(10,14,22,0.78)",
          "circle-stroke-width": 1.05
        }
      }, K.before(map));
    } else {
      map.setFilter(S_LYR, classFilter());
    }
  }
  function ensureGyres(map, fc) {
    if (map.getSource(G_SRC)) map.getSource(G_SRC).setData(fc);
    else map.addSource(G_SRC, { type: "geojson", data: fc, attribution: ATTRIB });
    if (!map.getLayer(G_FILL)) {
      map.addLayer({
        id: G_FILL, type: "fill", source: G_SRC,
        paint: { "fill-color": "#f97316", "fill-opacity": 0.18 }
      }, K.before(map));
      map.addLayer({
        id: G_LINE, type: "line", source: G_SRC,
        paint: {
          "line-color": "#9a3412",
          "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1.2, 6, 2.2, 10, 2.8],
          "line-opacity": 0.9
        }
      }, K.before(map));
    }
  }
  function riverTons() {
    return (riverFeats || []).map((f) => { return +f.properties.ton; }).filter((n) => { return n > 0; });
  }
  function ensureRivers(map, feats) {
    riverFeats = K.magnitude.sort(feats || [], "ton");
    put(map, R_SRC, riverFeats);
    if (!map.getLayer(R_LYR)) {
      var rad = K.magnitude.bind(map, R_LYR, {
        id: "oceangarbage-rivers", prop: "ton", transform: "linear", px: [3, 64], floor: 3,
        domain: [0.01, 5e5], values: riverTons, allValues: riverTons,
        format: (n) => {
          if (!(n > 0)) return "0";
          if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
          return n.toFixed(n >= 10 ? 0 : 1);
        },
        unit: "t/yr"
      });
      map.addLayer({
        id: R_LYR, type: "circle", source: R_SRC,
        layout: { "circle-sort-key": K.magnitude.sortKey("ton") },
        paint: {
          "circle-color": [
            "interpolate", ["linear"], ["get", "ton"],
            100, "#67e8f9", 2000, "#a78bfa", 20000, "#f59e0b", 100000, "#ef4444"
          ],
          "circle-radius": rad,
          "circle-radius-transition": { duration: 450, delay: 0 },
          "circle-opacity": 0.9,
          "circle-stroke-color": ["case", ["==", ["get", "magOut"], 1], "#fff6c8", "rgba(10,14,22,0.78)"],
          "circle-stroke-width": K.magnitude.stroke()
        }
      }, K.before(map));
    }
    K.magnitude.refresh("oceangarbage-rivers");
    K.magnitude.markOutliers(riverFeats, "ton", K.magnitude.hiRaw("oceangarbage-rivers") || 0);
    map.getSource(R_SRC).setData(K.fc(riverFeats));
  }
  function ensureBeach(map, feats) {
    put(map, B_SRC, feats);
    if (!map.getLayer(B_LYR)) {
      map.addLayer({
        id: B_LYR, type: "circle", source: B_SRC, filter: classFilter(),
        paint: {
          "circle-color": [
            "match", ["get", "c"],
            0, CLASS_COL[0], 1, CLASS_COL[1], 2, CLASS_COL[2], 3, CLASS_COL[3], 4, CLASS_COL[4],
            "#94a3b8"
          ],
          "circle-radius": K.markerScale.bind(map, B_LYR, "circle-radius",
            K.size({ stops: [[1, 2.5], [6, 4], [12, 6]] })),
          "circle-opacity": 0.92,
          "circle-stroke-color": "rgba(10,14,22,0.85)",
          "circle-stroke-width": 1.15
        }
      }, K.before(map));
    } else {
      map.setFilter(B_LYR, classFilter());
    }
  }
  function sync(map) {
    if (!map) return;
    var parentOn = L.isOn("oceangarbage");
    var showS = K.kids.layerOn(parentOn, "oceangarbage-samples", true);
    var showM = K.kids.layerOn(parentOn, "oceangarbage-model", true);
    var showG = K.kids.layerOn(parentOn, "oceangarbage-gyres", true);
    var showR = K.kids.layerOn(parentOn, "oceangarbage-rivers", true);
    var showB = K.kids.layerOn(parentOn, "oceangarbage-beach", true);
    K.vis(map, [S_LYR], showS);
    modelField.vis(map, showM);
    K.vis(map, [G_FILL, G_LINE], showG);
    K.vis(map, [R_LYR], showR);
    K.vis(map, [B_LYR], showB);
    if (!parentOn) return;
    var band = K.lod.band(map.getZoom(), CUT);
    var tasks = [];
    if (K.kids.isOn("oceangarbage-samples", true)) {
      var sb = band;
      if (sampleBand !== sb) {
        tasks.push(fetchBand("samples", sb).then((feats) => {
          ensureSamples(map, feats); sampleBand = sb;
        }));
      } else if (showS) ensureSamples(map, sampleCache[sb] || []);
    }
    if (K.kids.isOn("oceangarbage-model", true)) {
      modelField.ensure(map);
      modelField.syncZoom(map);
    }
    if (K.kids.isOn("oceangarbage-gyres", true)) {
      tasks.push(fetchGyres().then((fc) => { ensureGyres(map, fc); }));
    }
    if (K.kids.isOn("oceangarbage-rivers", true)) {
      var rb = band;
      if (riverBand !== rb) {
        tasks.push(fetchBand("rivers", rb).then((feats) => {
          ensureRivers(map, feats); riverBand = rb;
        }));
      } else if (showR) ensureRivers(map, riverCache[rb] || []);
    }
    if (K.kids.isOn("oceangarbage-beach", true)) {
      tasks.push(fetchBeach().then((feats) => { ensureBeach(map, feats); }));
    }
    if (tasks.length) Promise.all(tasks).catch(() => {});
  }
  function densText(d) {
    if (!(d > 0)) return null;
    if (d >= 1000) return "About " + Math.round(d) + " pieces per m³";
    if (d >= 10) return "About " + Math.round(d * 10) / 10 + " pieces per m³";
    return "About " + Math.round(d * 100) / 100 + " pieces per m³";
  }
  function cardSample(map, e) {
    var p = e.features[0].properties;
    var rows = ["Someone measured plastic in the water here."];
    rows.push("Amount: " + (CLASS[p.c] || "unknown"));
    var dens = densText(+p.m);
    if (dens) rows.push(dens);
    if (p.y) rows.push("Year: " + p.y);
    rows.push(grey("One sample at one time — seas change."));
    K.show(map, e.lngLat, "Ocean plastic sample", rows,
      ["NOAA NCEI Marine Microplastics", "https://www.ncei.noaa.gov/products/microplastics"]);
  }
  function cardGyre(map, e) {
    var p = e.features[0].properties;
    var rows = ["One of the ocean's big plastic gathering zones."];
    if (p.area) rows.push("Rough size ~" + Math.round(p.area / 1e3) + " thousand km²");
    rows.push(grey("Drawn from a model, not a fence in the water."));
    K.show(map, e.lngLat, p.name || "Gyre zone", rows,
      ["van Sebille et al. 2015 (model)", "https://doi.org/10.1088/1748-9326/10/12/124006"]);
  }
  function cardRiver(map, e) {
    var p = e.features[0].properties;
    var ton = +p.ton || 0;
    var rows = ["This river sends a lot of plastic to the sea."];
    rows.push("About " + (ton >= 10 ? Math.round(ton) : Math.round(ton * 10) / 10) + " tons a year (model).");
    if (+p.rank > 0 && +p.rank <= 318) rows.push("Among the top 1% of rivers worldwide.");
    else if (+p.rank > 0) rows.push("Rank #" + p.rank + " of modelled rivers.");
    rows.push(grey("Model estimate for the 2010s, not a measurement."));
    K.show(map, e.lngLat, "River plastic outflow", rows,
      ["Meijer et al. 2021", "https://doi.org/10.1126/sciadv.aaz5803"]);
  }
  function cardBeach(map, e) {
    var p = e.features[0].properties;
    var rows = ["Someone measured plastic on this beach."];
    if (p.place) rows.push(p.place);
    rows.push("Amount: " + (CLASS[p.c] || "unknown"));
    var dens = densText(+p.m);
    if (dens) rows.push(dens);
    rows.push(grey("One sample at one time — beaches change."));
    K.show(map, e.lngLat, p.name || "Beach plastic sample", rows,
      ["NOAA NCEI Marine Microplastics", "https://www.ncei.noaa.gov/products/microplastics"]);
  }
  function apply(map, on) {
    pMap = map;
    if (!on) {
      K.vis(map, [S_LYR, G_FILL, G_LINE, R_LYR, B_LYR], false);
      modelField.vis(map, false);
      return;
    }
    sync(map);
    mountClassUi();
  }
  loadClass();
  L.add({
    id: "oceangarbage", name: "Ocean garbage", icon: "🧴", group: "Human impact",
    dflt: false, taps: [S_LYR, G_FILL, G_LINE, R_LYR, B_LYR],
    tip: "Ocean plastic: NOAA measurements, a smooth model surface, five gyre zones, river outflows, and beach samples",
    kids: KIDS,
    legend: () => {
      return K.legKeys([
        ["#38bdf8", "dot", "Measured sample (low→high)"],
        ["#f97316", "area", "Model surface / gyre zone"],
        ["#22d3ee", "dot", "River outflow (bigger = more tons/yr)"],
        ["#f472b6", "dot", "Beach sample"]
      ]) + (K.magnitude && K.kids.isOn("oceangarbage-rivers", true) ? K.magnitude.legend("oceangarbage-rivers") : "") +
        '<div class="ls-row"><small>Model surface is a smooth ocean-masked field (not dots). Gyres are ocean-only model contours. Samples are real measurements.</small></div>';
    },
    note: () => {
      if (!L.isOn("oceangarbage")) return "";
      var bits = [classLabel()];
      if (loadingNote) bits.push("loading…");
      return bits.join(" · ");
    },
    apply: apply,
    kidSet: () => {
      if (pMap) {
        sync(pMap);
        if (K.magnitude) K.magnitude.request("oceangarbage-rivers");
      }
    },
    attach: (map, on) => {
      pMap = map;
      map.on("idle", () => {
        if (!L.isOn("oceangarbage")) return;
        if (!map.getLayer(S_LYR) && K.kids.isOn("oceangarbage-samples", true)) apply(map, true);
        else sync(map);
      });
      map.on("zoomend", () => { if (L.isOn("oceangarbage")) sync(map); });
      map.on("click", S_LYR, (e) => { cardSample(map, e); });
      map.on("click", G_FILL, (e) => { cardGyre(map, e); });
      map.on("click", G_LINE, (e) => { cardGyre(map, e); });
      map.on("click", R_LYR, (e) => { cardRiver(map, e); });
      map.on("click", B_LYR, (e) => { cardBeach(map, e); });
      (window.SunnyHoverName = window.SunnyHoverName || {})[S_LYR] = (f) =>
        Promise.resolve(["Plastic sample", CLASS[f.properties.c] || ""]);
      (window.SunnyHoverName = window.SunnyHoverName || {})[R_LYR] = (f) =>
        Promise.resolve(["River outflow", "~" + Math.round(f.properties.ton) + " t/yr"]);
      (window.SunnyHoverName = window.SunnyHoverName || {})[B_LYR] = (f) =>
        Promise.resolve(["Beach sample", CLASS[f.properties.c] || ""]);
      (window.SunnyHoverName = window.SunnyHoverName || {})[G_FILL] = (f) =>
        Promise.resolve([f.properties.name, "model zone"]);
      document.addEventListener("sunny-layers-ready", () => { mountClassUi(); });
      if (on) apply(map, true);
    }
  });
})();
