// workspace/whereisthesun/nuclear.js
/* SUNNY opt216: nuclear accidents & incidents (Human impact).
 * Curated IAEA INES example events + published zone sizes. Extent circles/ellipses
 * are approximate published figures (exclusion/evacuation/EURT), labelled approximate —
 * not atmospheric plume models. Year range slider. Off by default; lazy; all zooms. */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers;
  if (!K || !L) return;
  var Y0 = 1952, Y1 = 2011;
  var yearMin = Y0, yearMax = Y1;
  var SRC = "nuclear", DOT = "nuclear-dot", FILL = "nuclear-fill", LINE = "nuclear-line";
  var feats = null, loading = null, pMap = null;
  var ATTRIB = 'Nuclear incidents: curated from <a href="https://www.iaea.org/resources/databases/ines" target="_blank" rel="noopener">IAEA INES</a> examples + published zone sizes (approximate extents)';
  var R_EARTH = 6371;
  var INES_COL = {
    7: "#dc2626", 6: "#ea580c", 5: "#d97706", 4: "#ca8a04", 3: "#65a30d"
  };
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
    try { localStorage.setItem("sunny-nuclear-year", yearMin + "," + yearMax); } catch (e) {}
    syncYearUi();
    if (!silent && pMap) applyFilters(pMap);
  }
  function loadYearRange() {
    try {
      var v = localStorage.getItem("sunny-nuclear-year");
      if (v) {
        var p = v.split(",");
        if (p.length === 2) setYearRange(+p[0], +p[1], true);
      }
    } catch (e) {}
  }
  function syncYearUi() {
    var box = document.querySelector(".nuclear-year-range");
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
      fill.style.background = "linear-gradient(90deg,#65a30d,#d97706,#dc2626)";
    }
  }
  function mountYearUi() {
    var input = document.querySelector('.lp-input[data-id="nuclear"]');
    if (!input) return;
    var wrap = input.closest(".lp-fold");
    if (!wrap || wrap.querySelector(".nuclear-year-range")) return;
    var box = document.createElement("div");
    box.className = "hi-year-range nuclear-year-range";
    box.innerHTML =
      '<div class="hi-year-range-lab">Incident years <span class="hi-year-range-val">' + yearLabel() + "</span></div>" +
      '<div class="hi-year-range-track" aria-hidden="true"><div class="hi-year-range-fill"></div></div>' +
      '<div class="hi-year-range-inputs">' +
      '<input type="range" class="hi-year-lo" min="' + Y0 + '" max="' + Y1 + '" step="1" value="' + yearMin + '" aria-label="Earliest incident year">' +
      '<input type="range" class="hi-year-hi" min="' + Y0 + '" max="' + Y1 + '" step="1" value="' + yearMax + '" aria-label="Latest incident year">' +
      "</div>" +
      '<div class="hi-year-range-ticks" aria-hidden="true"><span>' + Y0 + "</span><span>" + Y1 + "</span></div>" +
      '<div class="hi-year-hint">IAEA INES examples. Rings = approximate published zones (not modelled plumes).</div>';
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
  function circleRing(lon, lat, radiusKm) {
    var ring = [];
    var a = radiusKm / R_EARTH;
    var p1 = lat * Math.PI / 180;
    var l1 = lon * Math.PI / 180;
    for (var i = 0; i <= 64; i++) {
      var b = i / 64 * 2 * Math.PI;
      var p2 = Math.asin(Math.sin(p1) * Math.cos(a) + Math.cos(p1) * Math.sin(a) * Math.cos(b));
      var l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(a) * Math.cos(p1), Math.cos(a) - Math.sin(p1) * Math.sin(p2));
      ring.push([l2 * 180 / Math.PI, p2 * 180 / Math.PI]);
    }
    return ring;
  }
  function ellipseRing(lon, lat, majorKm, minorKm, bearingDeg) {
    var ring = [];
    var br = bearingDeg * Math.PI / 180;
    var a = (majorKm / 2) / R_EARTH;
    var b = (minorKm / 2) / R_EARTH;
    var p0 = lat * Math.PI / 180;
    var l0 = lon * Math.PI / 180;
    for (var i = 0; i <= 64; i++) {
      var t = i / 64 * 2 * Math.PI;
      var x = a * Math.cos(t);
      var y = b * Math.sin(t);
      var dx = x * Math.cos(br) - y * Math.sin(br);
      var dy = x * Math.sin(br) + y * Math.cos(br);
      var p = p0 + dy;
      var l = l0 + dx / Math.cos(p0);
      ring.push([l * 180 / Math.PI, p * 180 / Math.PI]);
    }
    return ring;
  }
  function props(c) {
    return {
      id: c.id, name: c.name, year: c.year, ines: c.ines, place: c.place || "",
      kind: c.kind || "", note: c.extent_note || "", approx: 1
    };
  }
  function toFeats(d) {
    var out = [];
    (d.incidents || []).forEach((c) => {
      var p = props(c);
      out.push({ type: "Feature", properties: p, geometry: { type: "Point", coordinates: [c.lon, c.lat] } });
      var ring = null;
      if (c.major_km && c.minor_km) {
        ring = ellipseRing(c.lon, c.lat, c.major_km, c.minor_km, c.bearing_deg || 0);
      } else if (c.radius_km && c.radius_km > 0) {
        ring = circleRing(c.lon, c.lat, c.radius_km);
      }
      if (ring) {
        out.push({ type: "Feature", properties: p, geometry: { type: "Polygon", coordinates: [ring] } });
      }
    });
    return out;
  }
  function load() {
    if (!loading) {
      loading = K.loadJson("data/human/nuclear.json?v=d09b2d1a").then((d) => {
        feats = toFeats(d);
        return feats;
      });
    }
    return loading;
  }
  function yearFilter() {
    return ["all", [">=", ["get", "year"], yearMin], ["<=", ["get", "year"], yearMax]];
  }
  function filteredInes() {
    return (feats || []).filter((f) => {
      if (f.geometry.type !== "Point") return false;
      var y = +f.properties.year;
      return y >= yearMin && y <= yearMax && +f.properties.ines > 0;
    }).map((f) => { return +f.properties.ines; });
  }
  function applyFilters(map) {
    var f = yearFilter();
    if (map.getLayer(DOT)) map.setFilter(DOT, ["all", ["==", ["geometry-type"], "Point"], f]);
    if (map.getLayer(FILL)) map.setFilter(FILL, ["all", ["==", ["geometry-type"], "Polygon"], f]);
    if (map.getLayer(LINE)) map.setFilter(LINE, ["all", ["==", ["geometry-type"], "Polygon"], f]);
    if (K.magnitude) K.magnitude.request("nuclear");
  }
  function ensure(map) {
    if (!map.getSource(SRC)) {
      map.addSource(SRC, { type: "geojson", data: K.fc(feats), attribution: ATTRIB });
    }
    var f = yearFilter();
    if (!map.getLayer(FILL)) {
      map.addLayer({
        id: FILL, type: "fill", source: SRC,
        filter: ["all", ["==", ["geometry-type"], "Polygon"], f],
        paint: {
          "fill-color": ["match", ["get", "ines"], 7, INES_COL[7], 6, INES_COL[6], 5, INES_COL[5], 4, INES_COL[4], INES_COL[3]],
          "fill-opacity": 0.18
        }
      }, K.before(map));
    }
    if (!map.getLayer(LINE)) {
      map.addLayer({
        id: LINE, type: "line", source: SRC,
        filter: ["all", ["==", ["geometry-type"], "Polygon"], f],
        paint: {
          "line-color": ["match", ["get", "ines"], 7, INES_COL[7], 6, INES_COL[6], 5, INES_COL[5], 4, INES_COL[4], INES_COL[3]],
          "line-width": 1.5, "line-opacity": 0.85, "line-dasharray": [2, 1.2]
        }
      }, K.before(map));
    }
    if (!map.getLayer(DOT)) {
      var rad = K.magnitude.bind(map, DOT, {
        id: "nuclear", prop: "ines", transform: "linear", px: [5, 40], floor: 5,
        domain: [1, 7], values: filteredInes, allValues: filteredInes,
        format: (n) => { return "INES " + Math.round(n); }
      });
      map.addLayer({
        id: DOT, type: "circle", source: SRC,
        filter: ["all", ["==", ["geometry-type"], "Point"], f],
        layout: { "circle-sort-key": K.magnitude.sortKey("ines") },
        paint: {
          "circle-color": ["match", ["get", "ines"], 7, INES_COL[7], 6, INES_COL[6], 5, INES_COL[5], 4, INES_COL[4], INES_COL[3]],
          "circle-radius": rad,
          "circle-radius-transition": { duration: 450, delay: 0 },
          "circle-opacity": 0.9,
          "circle-stroke-color": ["case", ["==", ["get", "magOut"], 1], "#fff6c8", "rgba(10,14,22,0.8)"],
          "circle-stroke-width": K.magnitude.stroke()
        }
      }, K.before(map));
      K.magnitude.refresh("nuclear");
    } else {
      applyFilters(map);
    }
  }
  function card(map, e) {
    var p = e.features[0].properties;
    var ines = +p.ines;
    var plain = ines >= 7 ? "A major nuclear accident happened here."
      : ines >= 5 ? "A serious nuclear accident happened here."
      : "A notable nuclear incident happened here.";
    var rows = [plain, String(p.year) + " · INES level " + p.ines];
    if (p.place) rows.push(p.place);
    if (p.kind) rows.push(p.kind);
    if (p.note) rows.push(p.note);
    rows.push('<span style="color:#9ca3af;font-size:11px">Ring is a published zone, not a modelled plume.</span>');
    K.show(map, e.lngLat, p.name, rows, ["IAEA INES", "https://www.iaea.org/resources/databases/ines"]);
  }
  function apply(map, on) {
    pMap = map;
    if (!on) { K.vis(map, [DOT, FILL, LINE], false); return; }
    load().then(() => {
      ensure(map);
      K.vis(map, [DOT, FILL, LINE], L.isOn("nuclear"));
      mountYearUi();
    }).catch(() => {});
  }
  loadYearRange();
  L.add({
    id: "nuclear", name: "Nuclear incidents", icon: "☢️", group: "Human impact",
    dflt: false, taps: [DOT, FILL, LINE],
    tip: "Major nuclear accidents/incidents (IAEA INES examples). Rings show approximate published zones — not modelled plumes",
    legend: () => {
      return K.legKeys([
        ["#dc2626", "dot", "INES 7 major accident"],
        ["#ea580c", "dot", "INES 6 serious accident"],
        ["#d97706", "dot", "INES 5"],
        ["#ca8a04", "dot", "INES 4"],
        ["#dc2626", "area", "Approximate published zone"]
      ]) + (K.magnitude ? K.magnitude.legend("nuclear") : "") +
        '<div class="ls-row"><small>Extents labelled approximate (exclusion/evacuation/EURT). Not plume models.</small></div>';
    },
    note: () => { return L.isOn("nuclear") ? yearLabel() : ""; },
    apply: apply,
    attach: (map, on) => {
      pMap = map;
      map.on("idle", () => {
        if (!L.isOn("nuclear")) return;
        if (!map.getLayer(DOT)) apply(map, true);
      });
      map.on("click", DOT, (e) => { card(map, e); });
      map.on("click", FILL, (e) => { card(map, e); });
      (window.SunnyHoverName = window.SunnyHoverName || {})[DOT] = (f) =>
        Promise.resolve([f.properties.name, "INES " + f.properties.ines + " · " + f.properties.year]);
      document.addEventListener("sunny-layers-ready", () => { mountYearUi(); });
      setTimeout(mountYearUi, 400);
      apply(map, on);
    }
  });
})();
