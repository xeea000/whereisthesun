// workspace/whereisthesun/oil-spills.js
/* SUNNY opt214: oil spill incidents (Human impact).
 * Data: NOAA ORR IncidentNews incidents.csv (United States federal public domain). Oil threat
 * rows with coordinates. Dot size area∝max potential gallons (relative); year range slider.
 * Off by default; lazy; every zoom. Unknown volume = small fixed size. */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers;
  if (!K || !L) return;
  var Y0 = 1968, Y1 = 2026;
  var yearMin = Y0, yearMax = Y1;
  var SRC = "oil-spills", LYR = "oil-spill-dot";
  var feats = null, loading = null, pMap = null;
  var ATTRIB = 'Oil spills: <a href="https://incidentnews.noaa.gov/" target="_blank" rel="noopener">NOAA IncidentNews</a> (US public domain)';
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
    try { localStorage.setItem("sunny-oil-year", yearMin + "," + yearMax); } catch (e) {}
    syncYearUi();
    if (!silent && pMap) { applyFilter(pMap); magKick(); }
  }
  function loadYearRange() {
    try {
      var v = localStorage.getItem("sunny-oil-year");
      if (v) {
        var p = v.split(",");
        if (p.length === 2) setYearRange(+p[0], +p[1], true);
      }
    } catch (e) {}
  }
  function syncYearUi() {
    var box = document.querySelector(".oil-year-range");
    if (!box) return;
    var lo = box.querySelector(".hi-year-lo");
    var hi = box.querySelector(".hi-year-hi");
    var val = box.querySelector(".hi-year-range-val");
    if (lo) lo.value = String(yearMin);
    if (hi) hi.value = String(yearMax);
    if (val) val.textContent = yearLabel();
    var fill = box.querySelector(".hi-year-range-fill");
    if (fill) {
      var span = Y1 - Y0 || 1;
      fill.style.left = ((yearMin - Y0) / span * 100) + "%";
      fill.style.width = ((yearMax - yearMin) / span * 100) + "%";
    }
  }
  function mountYearUi() {
    var input = document.querySelector('.lp-input[data-id="oilspills"]');
    if (!input) return;
    var wrap = input.closest(".lp-fold");
    if (!wrap || wrap.querySelector(".oil-year-range")) return;
    var box = document.createElement("div");
    box.className = "hi-year-range oil-year-range";
    box.innerHTML =
      '<div class="hi-year-range-lab">Spill years <span class="hi-year-range-val">' + yearLabel() + "</span></div>" +
      '<div class="hi-year-range-track" aria-hidden="true"><div class="hi-year-range-fill"></div></div>' +
      '<div class="hi-year-range-inputs">' +
      '<input type="range" class="hi-year-lo" min="' + Y0 + '" max="' + Y1 + '" step="1" value="' + yearMin + '" aria-label="Earliest spill year">' +
      '<input type="range" class="hi-year-hi" min="' + Y0 + '" max="' + Y1 + '" step="1" value="' + yearMax + '" aria-label="Latest spill year">' +
      "</div>" +
      '<div class="hi-year-range-ticks" aria-hidden="true"><span>' + Y0 + "</span><span>" + Y1 + "</span></div>" +
      '<div class="hi-year-hint">NOAA IncidentNews oil incidents with coordinates. Size ∝ volume (max potential); area scales with barrels (when known).</div>';
    wrap.appendChild(box);
    var onSlide = () => {
      var loEl = box.querySelector(".hi-year-lo");
      var hiEl = box.querySelector(".hi-year-hi");
      var lo = +loEl.value, hi = +hiEl.value;
      if (lo > hi) {
        if (document.activeElement === loEl) hi = lo;
        else lo = hi;
      }
      setYearRange(lo, hi);
    };
    box.querySelector(".hi-year-lo").addEventListener("input", onSlide);
    box.querySelector(".hi-year-hi").addEventListener("input", onSlide);
    syncYearUi();
  }
  function toFeats(d) {
    var out = d.spills.map((r) => {
      var gal = r[5];
      return {
        type: "Feature",
        properties: {
          id: r[0], name: r[1], year: r[2], gal: gal > 0 ? gal : 0,
          loc: r[6], com: r[7]
        },
        geometry: { type: "Point", coordinates: [r[4], r[3]] }
      };
    });
    return K.magnitude.sort(out, "gal");
  }
  function filteredGals() {
    return (feats || []).filter((f) => {
      var y = +f.properties.year;
      return y >= yearMin && y <= yearMax && +f.properties.gal > 0;
    }).map((f) => { return +f.properties.gal; });
  }
  function allGals() {
    return (feats || []).map((f) => { return +f.properties.gal; }).filter((g) => { return g > 0; });
  }
  function magOpts() {
    return {
      id: "oilspills", prop: "gal", transform: "linear", px: [4, 72], floor: 4,
      domain: [0, 336000009],
      values: filteredGals, allValues: allGals,
      format: (g) => {
        var b = g / 42;
        if (!(b > 0)) return "0";
        if (b >= 1e6) return (b / 1e6).toFixed(b >= 1e7 ? 0 : 1) + "M";
        if (b >= 1e3) return (b / 1e3).toFixed(b >= 1e4 ? 0 : 1) + "k";
        return String(Math.round(b));
      },
      unit: "bbl",
      legendValues: (vmax) => {
        var bmax = vmax / 42;
        var ticks = [1e5, 4e5, 1e6, 3e6].filter((b) => { return b < bmax * 0.95; }).map((b) => { return b * 42; });
        ticks.push(vmax);
        return ticks;
      },
      onDomain: () => { /* legend refreshes via layers-panel on change */ }
    };
  }
  function magKick() {
    if (K.magnitude) K.magnitude.request("oilspills");
  }
  function pushData(map) {
    if (!map.getSource(SRC) || !feats) return;
    var pack = null;
    if (K.magnitude) {
      /* mark outliers vs current domain after refresh */
      K.magnitude.refresh("oilspills");
      var hi = K.magnitude.hiRaw("oilspills") || 0;
      var sorted = K.magnitude.sort(feats, "gal");
      K.magnitude.markOutliers(sorted, "gal", hi);
      map.getSource(SRC).setData(K.fc(sorted));
      return;
    }
    map.getSource(SRC).setData(K.fc(feats));
  }
  function load() {
    if (!loading) {
      loading = K.loadJson("data/human/oil-spills.json?v=d8e013fa").then((d) => {
        feats = toFeats(d);
        return feats;
      });
    }
    return loading;
  }
  function yearFilter() {
    return ["all", [">=", ["get", "year"], yearMin], ["<=", ["get", "year"], yearMax]];
  }
  function applyFilter(map) {
    if (map.getLayer(LYR)) map.setFilter(LYR, yearFilter());
    magKick();
  }
  function ensure(map) {
    if (!map.getSource(SRC)) {
      map.addSource(SRC, { type: "geojson", data: K.fc(feats), attribution: ATTRIB });
    }
    if (!map.getLayer(LYR)) {
      var rad = K.magnitude.bind(map, LYR, magOpts());
      map.addLayer({
        id: LYR, type: "circle", source: SRC, filter: yearFilter(),
        layout: { "circle-sort-key": K.magnitude.sortKey("gal") },
        paint: {
          "circle-color": [
            "interpolate", ["linear"], ["get", "year"],
            1968, "#5c3a1e", 1990, "#a05a20", 2010, "#d97820", 2026, "#ffb347"
          ],
          "circle-radius": rad,
          "circle-radius-transition": { duration: 450, delay: 0 },
          "circle-opacity": 0.78,
          "circle-stroke-color": ["case", ["==", ["get", "magOut"], 1], "#fff6c8", "rgba(40,20,0,0.55)"],
          "circle-stroke-width": K.magnitude.stroke()
        }
      }, K.before(map));
      pushData(map);
    } else {
      applyFilter(map);
    }
  }
  function fmtGal(g) {
    if (!(g > 0)) return "volume unknown";
    var b = g / 42;
    var btxt = b >= 1e6 ? (b / 1e6).toFixed(2) + "M bbl" : b >= 1e3 ? (b / 1e3).toFixed(1) + "k bbl" : Math.round(b) + " bbl";
    return btxt + " max potential (" + (g >= 1e6 ? (g / 1e6).toFixed(1) + "M" : Math.round(g)) + " gal)";
  }
  function card(map, e) {
    var p = e.features[0].properties;
    var rows = [];
    rows.push("Oil spilled into the water here.");
    if (p.year) rows.push(String(p.year));
    if (p.loc) rows.push(p.loc);
    if (p.com) rows.push(p.com);
    rows.push(fmtGal(+p.gal));
    rows.push("NOAA responded to this incident.");
    rows.push('<span style="color:#9ca3af;font-size:11px">Reported amount; not every spill is here.</span>');
    K.show(map, e.lngLat, p.name || "Oil spill", rows,
      ["NOAA IncidentNews #" + p.id, "https://incidentnews.noaa.gov/incident/" + p.id]);
  }
  function apply(map, on) {
    pMap = map;
    if (!on) { K.vis(map, [LYR], false); return; }
    load().then(() => {
      ensure(map);
      K.vis(map, [LYR], L.isOn("oilspills"));
      pushData(map);
      mountYearUi();
    }).catch(() => {});
  }
  loadYearRange();
  L.add({
    id: "oilspills", name: "Oil spills", icon: "🛢️", group: "Human impact",
    dflt: false, taps: [LYR],
    tip: "Oil incidents from NOAA IncidentNews (mostly US/response cases). Dot size by gallons (relative when enabled); filter by year",
    legend: () => {
      return K.legKeys([
        ["#5c3a1e", "dot", "1960s–80s"],
        ["#a05a20", "dot", "1990s"],
        ["#d97820", "dot", "2000s"],
        ["#ffb347", "dot", "2010s–now"]
      ]) + (K.magnitude ? K.magnitude.legend("oilspills") : "") +
        '<div class="ls-row"><small>Bigger ∝ barrels (area). Data = NOAA max potential gallons ÷ 42. Halo = near-max.</small></div>';
    },
    note: () => { return L.isOn("oilspills") ? yearLabel() : ""; },
    apply: apply,
    attach: (map, on) => {
      pMap = map;
      map.on("idle", () => {
        if (!L.isOn("oilspills")) return;
        if (!map.getLayer(LYR)) apply(map, true);
      });
      map.on("click", LYR, (e) => { card(map, e); });
      (window.SunnyHoverName = window.SunnyHoverName || {})[LYR] = (f) =>
        Promise.resolve([f.properties.name, (f.properties.year || "") + " · " + fmtGal(+f.properties.gal)]);
      document.addEventListener("sunny-layers-ready", () => { mountYearUi(); });
      setTimeout(mountYearUi, 400);
      apply(map, on);
    }
  });
})();
