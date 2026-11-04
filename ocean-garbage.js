// workspace/whereisthesun/ocean-garbage.js
/* SUNNY opt220: ocean plastic / garbage (Human impact).
 * Kids (subset; zero on → show nothing):
 *   Measured samples — NOAA NCEI Marine Microplastics (~22.5k), coloured by concentration class
 *   Model surface — van Sebille/Maximenko/Lebreton geomean abundance heatmap (labelled model)
 *   Gyre zones — five subtropical accumulation contours from model ≥p92 (labelled model)
 *   River outflows — Meijer 2021 recalibrated top emitters (sized by tons/yr)
 *   Beach samples — NOAA NCEI beach microplastics
 * LOD: thinned overview under z5, mid z5–7, full z8+; lazy per kid; parent off by default.
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
    model_ov: "data/human/plastic/model-ov.json?v=54067019",
    model_mid: "data/human/plastic/model-mid.json?v=9539f2f2",
    rivers_ov: "data/human/plastic/rivers-ov.json?v=8b52cc3d",
    rivers_mid: "data/human/plastic/rivers-mid.json?v=f9738546",
    rivers_full: "data/human/plastic/rivers-full.json?v=c7764ca7",
    gyres: "data/human/plastic/gyres.json?v=ecd3b77b",
    beach: "data/human/plastic/beach.json?v=36a6d603"
  };
  var S_SRC = "og-samples", S_LYR = "og-samples-dot";
  var M_SRC = "og-model", M_HEAT = "og-model-heat", M_DOT = "og-model-dot";
  var G_SRC = "og-gyres", G_FILL = "og-gyres-fill", G_LINE = "og-gyres-line";
  var R_SRC = "og-rivers", R_LYR = "og-rivers-dot";
  var B_SRC = "og-beach", B_LYR = "og-beach-dot";
  var pMap = null;
  var sampleBand = null, modelBand = null, riverBand = null;
  var sampleCache = {}, modelCache = {}, riverCache = {}, beachCache = null, gyreCache = null;
  var sampleLoad = {}, modelLoad = {}, riverLoad = {}, beachLoad = null, gyreLoad = null;
  var loadingNote = false;
  var ATTRIB =
    'Ocean plastic: <a href="https://www.ncei.noaa.gov/products/microplastics" target="_blank" rel="noopener">NOAA NCEI</a> · ' +
    '<a href="https://doi.org/10.1088/1748-9326/10/12/124006" target="_blank" rel="noopener">van Sebille 2015</a> · ' +
    '<a href="https://doi.org/10.1126/sciadv.aaz5803" target="_blank" rel="noopener">Meijer 2021</a>';
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
    var input = document.querySelector('.lp-input[data-id="oceangarbage"]');
    if (!input) return;
    var wrap = input.closest(".lp-fold");
    if (!wrap || wrap.querySelector(".og-class-range")) return;
    var box = document.createElement("div");
    box.className = "hi-year-range og-class-range";
    box.innerHTML =
      '<div class="hi-year-range-lab">Min concentration <span class="hi-year-range-val">' + classLabel() + "</span></div>" +
      '<div class="hi-year-range-track" aria-hidden="true"><div class="hi-year-range-fill"></div></div>' +
      '<div class="hi-year-range-inputs">' +
      '<input type="range" class="hi-year-lo" min="0" max="4" step="1" value="' + minClass + '" aria-label="Minimum concentration class">' +
      "</div>" +
      '<div class="hi-year-range-ticks" aria-hidden="true"><span>Very Low</span><span>Very High</span></div>' +
      '<div class="hi-year-hint">Ordinal class filter for measured &amp; beach samples. Model / gyres / rivers ignore this.</div>';
    wrap.appendChild(box);
    box.querySelector(".hi-year-lo").addEventListener("input", () => {
      setMinClass(+box.querySelector(".hi-year-lo").value);
    });
    syncClassUi();
  }
  function classFilter() {
    return [">=", ["get", "c"], minClass];
  }
  function bandOf(z) { return K.lod.band(z, CUT); }
  function unpackSample(row) {
    return {
      type: "Feature",
      properties: { c: row[2], m: row[3] != null ? row[3] : null, y: row[4] != null ? row[4] : null,
        name: CLASS[row[2]] || "sample" },
      geometry: { type: "Point", coordinates: [row[0] / 100, row[1] / 100] }
    };
  }
  function unpackModel(row) {
    return {
      type: "Feature",
      properties: { w: (row[2] || 0) / 100, name: "model surface" },
      geometry: { type: "Point", coordinates: [row[0] / 10, row[1] / 10] }
    };
  }
  function unpackRiver(row) {
    var ton = (row[2] || 0) / 100;
    return {
      type: "Feature",
      properties: {
        ton: ton, rank: row[3] || 0, logt: ton > 0 ? Math.log10(ton) : 0,
        name: "River outflow #" + (row[3] || "?")
      },
      geometry: { type: "Point", coordinates: [row[0] / 100, row[1] / 100] }
    };
  }
  function unpackBeach(row) {
    return {
      type: "Feature",
      properties: {
        c: row[2], place: row[3] || "", m: row[4] != null ? row[4] : null,
        name: row[3] || (CLASS[row[2]] || "beach")
      },
      geometry: { type: "Point", coordinates: [row[0] / 100, row[1] / 100] }
    };
  }
  function fetchBand(kind, band) {
    var key = kind + "_" + (kind === "model" && band === "full" ? "mid" : band);
    var url = URLS[key];
    if (!url) return Promise.resolve(null);
    var cache = kind === "samples" ? sampleCache : kind === "model" ? modelCache : riverCache;
    var loads = kind === "samples" ? sampleLoad : kind === "model" ? modelLoad : riverLoad;
    if (cache[band]) return Promise.resolve(cache[band]);
    if (!loads[band]) {
      loadingNote = true;
      loads[band] = K.loadJson(url).then((d) => {
        var feats;
        if (kind === "samples") feats = (d.pts || []).map(unpackSample);
        else if (kind === "model") feats = (d.pts || []).map(unpackModel);
        else feats = (d.pts || []).map(unpackRiver);
        cache[band] = feats;
        loadingNote = false;
        return feats;
      }).catch((e) => { loadingNote = false; throw e; });
    }
    return loads[band];
  }
  function fetchGyres() {
    if (gyreCache) return Promise.resolve(gyreCache);
    if (!gyreLoad) {
      gyreLoad = K.loadJson(URLS.gyres).then((d) => {
        gyreCache = (d.patches || []).map((p) => {
          return {
            type: "Feature",
            properties: {
              id: p.id, name: p.name, label: p.label || "model",
              area: p.area_km2_approx || 0, note: "model contour"
            },
            geometry: { type: "Polygon", coordinates: [p.ring] }
          };
        });
        return gyreCache;
      });
    }
    return gyreLoad;
  }
  function fetchBeach() {
    if (beachCache) return Promise.resolve(beachCache);
    if (!beachLoad) {
      beachLoad = K.loadJson(URLS.beach).then((d) => {
        beachCache = (d.pts || []).map(unpackBeach);
        return beachCache;
      });
    }
    return beachLoad;
  }
  function ensureSamples(map, feats) {
    if (!map.getSource(S_SRC)) {
      map.addSource(S_SRC, { type: "geojson", data: K.fc(feats), attribution: ATTRIB });
    } else {
      map.getSource(S_SRC).setData(K.fc(feats));
    }
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
          "circle-opacity": 0.82,
          "circle-stroke-color": "rgba(10,14,20,0.45)",
          "circle-stroke-width": 0.6
        }
      }, K.before(map));
    }
  }
  function ensureModel(map, feats) {
    if (!map.getSource(M_SRC)) {
      map.addSource(M_SRC, { type: "geojson", data: K.fc(feats), attribution: ATTRIB });
    } else {
      map.getSource(M_SRC).setData(K.fc(feats));
    }
    if (!map.getLayer(M_HEAT)) {
      map.addLayer({
        id: M_HEAT, type: "heatmap", source: M_SRC,
        paint: {
          "heatmap-weight": ["interpolate", ["linear"], ["get", "w"], 0, 0.05, 1, 1],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 1, 0.55, 6, 1.1, 10, 1.4],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 1, 18, 4, 28, 8, 22, 12, 16],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 1, 0.7, 8, 0.55, 12, 0.35],
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(0,0,0,0)",
            0.15, "rgba(56,189,248,0.25)",
            0.35, "rgba(251,191,36,0.45)",
            0.55, "rgba(249,115,22,0.65)",
            0.8, "rgba(239,68,68,0.8)",
            1, "rgba(190,18,60,0.9)"
          ]
        }
      }, K.before(map));
    }
    if (!map.getLayer(M_DOT)) {
      map.addLayer({
        id: M_DOT, type: "circle", source: M_SRC,
        minzoom: 7,
        paint: {
          "circle-color": "#f97316",
          "circle-radius": K.markerScale.bind(map, M_DOT, "circle-radius",
            K.size({ stops: [[7, 1.5], [10, 2.2], [14, 3]] })),
          "circle-opacity": ["interpolate", ["linear"], ["get", "w"], 0, 0.15, 1, 0.55],
          "circle-stroke-width": 0
        }
      }, K.before(map));
    }
  }
  function ensureGyres(map, feats) {
    if (!map.getSource(G_SRC)) {
      map.addSource(G_SRC, { type: "geojson", data: K.fc(feats), attribution: ATTRIB });
    } else {
      map.getSource(G_SRC).setData(K.fc(feats));
    }
    if (!map.getLayer(G_FILL)) {
      map.addLayer({
        id: G_FILL, type: "fill", source: G_SRC,
        paint: { "fill-color": "#f59e0b", "fill-opacity": 0.12 }
      }, K.before(map));
    }
    if (!map.getLayer(G_LINE)) {
      map.addLayer({
        id: G_LINE, type: "line", source: G_SRC,
        paint: {
          "line-color": "#fbbf24", "line-width": 1.5, "line-opacity": 0.9,
          "line-dasharray": [3, 2]
        }
      }, K.before(map));
    }
  }
  function ensureRivers(map, feats) {
    if (!map.getSource(R_SRC)) {
      map.addSource(R_SRC, { type: "geojson", data: K.fc(feats), attribution: ATTRIB });
    } else {
      map.getSource(R_SRC).setData(K.fc(feats));
    }
    if (!map.getLayer(R_LYR)) {
      map.addLayer({
        id: R_LYR, type: "circle", source: R_SRC,
        paint: {
          "circle-color": "#a78bfa",
          "circle-radius": K.markerScale.bind(map, R_LYR, "circle-radius",
            K.size({ stops: [
              [1, ["+", 1.8, ["*", 1.4, ["get", "logt"]]]],
              [6, ["+", 2.6, ["*", 1.8, ["get", "logt"]]]],
              [12, ["+", 3.5, ["*", 2.2, ["get", "logt"]]]]
            ] })),
          "circle-opacity": 0.78,
          "circle-stroke-color": "rgba(40,20,60,0.5)",
          "circle-stroke-width": 0.7
        }
      }, K.before(map));
    }
  }
  function ensureBeach(map, feats) {
    if (!map.getSource(B_SRC)) {
      map.addSource(B_SRC, { type: "geojson", data: K.fc(feats), attribution: ATTRIB });
    } else {
      map.getSource(B_SRC).setData(K.fc(feats));
    }
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
          "circle-opacity": 0.85,
          "circle-stroke-color": "#0f172a",
          "circle-stroke-width": 1
        }
      }, K.before(map));
    }
  }
  function kidVis(map, parentOn) {
    var showS = K.kids.layerOn(parentOn, "oceangarbage-samples", true);
    var showM = K.kids.layerOn(parentOn, "oceangarbage-model", true);
    var showG = K.kids.layerOn(parentOn, "oceangarbage-gyres", true);
    var showR = K.kids.layerOn(parentOn, "oceangarbage-rivers", true);
    var showB = K.kids.layerOn(parentOn, "oceangarbage-beach", true);
    K.vis(map, [S_LYR], showS);
    K.vis(map, [M_HEAT, M_DOT], showM);
    K.vis(map, [G_FILL, G_LINE], showG);
    K.vis(map, [R_LYR], showR);
    K.vis(map, [B_LYR], showB);
  }
  function syncLod(map) {
    if (!L.isOn("oceangarbage")) return;
    var band = bandOf(map.getZoom());
    var tasks = [];
    if (K.kids.isOn("oceangarbage-samples", true) && sampleBand !== band) {
      tasks.push(fetchBand("samples", band).then((feats) => {
        ensureSamples(map, feats); sampleBand = band;
      }));
    }
    if (K.kids.isOn("oceangarbage-model", true)) {
      var mb = band === "full" ? "mid" : band;
      if (modelBand !== mb) {
        tasks.push(fetchBand("model", mb).then((feats) => {
          ensureModel(map, feats); modelBand = mb;
        }));
      }
    }
    if (K.kids.isOn("oceangarbage-gyres", true) && !gyreCache) {
      tasks.push(fetchGyres().then((feats) => { ensureGyres(map, feats); }));
    }
    if (K.kids.isOn("oceangarbage-rivers", true) && riverBand !== band) {
      tasks.push(fetchBand("rivers", band).then((feats) => {
        ensureRivers(map, feats); riverBand = band;
      }));
    }
    if (K.kids.isOn("oceangarbage-beach", true) && !beachCache) {
      tasks.push(fetchBeach().then((feats) => { ensureBeach(map, feats); }));
    }
    if (!tasks.length) {
      kidVis(map, true);
      return;
    }
    Promise.all(tasks).then(() => { kidVis(map, true); }).catch(() => { kidVis(map, true); });
  }
  function cardSample(map, e) {
    var p = e.features[0].properties;
    var rows = [CLASS[p.c] || "sample"];
    if (p.m != null && p.m !== "") rows.push("Measurement: " + p.m);
    if (p.y) rows.push("Year: " + p.y);
    rows.push("NOAA NCEI measured sample");
    K.show(map, e.lngLat, "Microplastics sample", rows,
      ["NOAA NCEI Marine Microplastics", "https://www.ncei.noaa.gov/products/microplastics"]);
  }
  function cardGyre(map, e) {
    var p = e.features[0].properties;
    var rows = [p.label || "model contour", "Approximate · derived from model ≥p92"];
    if (p.area) rows.push("~" + Math.round(p.area / 1e3) + "k km² (model hull, approx)");
    K.show(map, e.lngLat, p.name, rows,
      ["van Sebille et al. 2015", "https://doi.org/10.1088/1748-9326/10/12/124006"]);
  }
  function cardRiver(map, e) {
    var p = e.features[0].properties;
    var rows = [
      "~" + (p.ton >= 10 ? Math.round(p.ton) : Math.round(p.ton * 10) / 10) + " t/yr (calibrated model)",
      "Rank #" + p.rank + " of river outfalls"
    ];
    K.show(map, e.lngLat, "River plastic outflow", rows,
      ["Meijer et al. 2021", "https://doi.org/10.1126/sciadv.aaz5803"]);
  }
  function cardBeach(map, e) {
    var p = e.features[0].properties;
    var rows = [CLASS[p.c] || "beach", p.place || ""];
    if (p.m != null && p.m !== "") rows.push("Measurement: " + p.m);
    K.show(map, e.lngLat, "Beach microplastics", rows,
      ["NOAA NCEI", "https://www.ncei.noaa.gov/products/microplastics"]);
  }
  function apply(map, on) {
    pMap = map;
    if (!on) {
      K.vis(map, [S_LYR, M_HEAT, M_DOT, G_FILL, G_LINE, R_LYR, B_LYR], false);
      return;
    }
    mountClassUi();
    syncLod(map);
  }
  var legend =
    K.legKeys([
      [CLASS_COL[0], "dot", "Very Low"],
      [CLASS_COL[1], "dot", "Low"],
      [CLASS_COL[2], "dot", "Medium"],
      [CLASS_COL[3], "dot", "High"],
      [CLASS_COL[4], "dot", "Very High"],
      ["#f59e0b", "area", "Gyre zone (model)"],
      ["#f97316", "area", "Model surface heatmap"],
      ["#a78bfa", "dot", "River outflow (t/yr)"]
    ]) +
    '<div class="ls-row"><small>Measured: NOAA NCEI Marine Microplastics (CC BY). Model surface &amp; gyres: geomean of van Sebille / Maximenko / Lebreton 2015 (labelled model). Rivers: Meijer 2021 recalibrated. Beach: NOAA NCEI beach subset. Ocean Cleanup live ops: unavailable. Progressive LOD — overview under z5.</small></div>';
  loadClass();
  L.add({
    id: "oceangarbage", name: "Ocean garbage & plastic", icon: "🫧", group: "Human impact",
    dflt: false, kids: KIDS,
    taps: [S_LYR, M_HEAT, M_DOT, G_FILL, G_LINE, R_LYR, B_LYR],
    tip: "Measured microplastics, modelled surface accumulation, five gyre zones, river outflows, beach samples — real open data only",
    legend: legend,
    note: () => {
      if (!L.isOn("oceangarbage")) return "";
      if (!K.kids.anyOn(KIDS)) return "no kids on";
      var bits = [];
      if (K.kids.isOn("oceangarbage-samples", true)) bits.push("samples " + classLabel());
      if (K.kids.isOn("oceangarbage-model", true)) bits.push("model");
      if (K.kids.isOn("oceangarbage-gyres", true)) bits.push("gyres");
      if (K.kids.isOn("oceangarbage-rivers", true)) bits.push("rivers");
      if (K.kids.isOn("oceangarbage-beach", true)) bits.push("beach");
      if (loadingNote) return K.lod.note(true);
      return bits.join(" · ");
    },
    apply: apply,
    kidSet: () => { if (pMap) { syncLod(pMap); kidVis(pMap, L.isOn("oceangarbage")); } },
    attach: (map, on) => {
      pMap = map;
      map.on("zoomend", () => { if (L.isOn("oceangarbage")) syncLod(map); });
      map.on("idle", () => {
        if (!L.isOn("oceangarbage")) return;
        if (K.kids.isOn("oceangarbage-samples", true) && !map.getLayer(S_LYR)) syncLod(map);
      });
      map.on("click", S_LYR, (e) => { cardSample(map, e); });
      map.on("click", G_FILL, (e) => { cardGyre(map, e); });
      map.on("click", R_LYR, (e) => { cardRiver(map, e); });
      map.on("click", B_LYR, (e) => { cardBeach(map, e); });
      (window.SunnyHoverName = window.SunnyHoverName || {})[S_LYR] = (f) =>
        Promise.resolve(["Sample", CLASS[f.properties.c] || ""]);
      (window.SunnyHoverName = window.SunnyHoverName || {})[R_LYR] = (f) =>
        Promise.resolve(["River outflow", "#" + f.properties.rank + " · " + f.properties.ton + " t/yr"]);
      (window.SunnyHoverName = window.SunnyHoverName || {})[B_LYR] = (f) =>
        Promise.resolve([f.properties.place || "Beach", CLASS[f.properties.c] || ""]);
      (window.SunnyHoverName = window.SunnyHoverName || {})[G_FILL] = (f) =>
        Promise.resolve([f.properties.name, "model"]);
      document.addEventListener("sunny-layers-ready", () => { mountClassUi(); });
      setTimeout(mountClassUi, 400);
      apply(map, on);
    }
  });
})();
