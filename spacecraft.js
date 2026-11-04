// workspace/whereisthesun/spacecraft.js
/* SUNNY opt217: spacecraft & debris events (Sky & Space).
 * Curated documented reentries, breakups, and debris fields from public agency reports.
 * Circles/ellipses = approximate published recovery/debris scales when sourced, labelled
 * approximate. On-orbit events are points only. Year range. Off by default; lazy; all zooms. */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers;
  if (!K || !L) return;
  var Y0 = 1967, Y1 = 2018;
  var yearMin = Y0, yearMax = Y1;
  var SRC = "spacecraft", DOT = "spacecraft-dot", FILL = "spacecraft-fill", LINE = "spacecraft-line";
  var feats = null, loading = null, pMap = null;
  var ATTRIB = 'Spacecraft debris: curated from NASA / ESA / Roscosmos / government reentry & accident reports (approximate fields labelled)';
  var R_EARTH = 6371;
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
    try { localStorage.setItem("sunny-sc-year", yearMin + "," + yearMax); } catch (e) {}
    syncYearUi();
    if (!silent && pMap) applyFilters(pMap);
  }
  function loadYearRange() {
    try {
      var v = localStorage.getItem("sunny-sc-year");
      if (v) {
        var p = v.split(",");
        if (p.length === 2) setYearRange(+p[0], +p[1], true);
      }
    } catch (e) {}
  }
  function syncYearUi() {
    var box = document.querySelector(".sc-year-range");
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
      fill.style.background = "linear-gradient(90deg,#64748b,#94a3b8,#e2e8f0)";
    }
  }
  function mountYearUi() {
    var host = (L && L.ctrlHost) ? L.ctrlHost("spacecraft") : null;
    if (!host) {
      var input = document.querySelector('.lp-input[data-id="spacecraft"]');
      if (!input) return;
      var wrap = input.closest(".lp-fold");
      host = wrap && (wrap.querySelector(".lp-ctrls") || wrap);
    }
    if (!host || host.querySelector(".sc-year-range")) return;
    var box = document.createElement("div");
    box.className = "hi-year-range sc-year-range";
    box.innerHTML =
      '<div class="hi-year-range-lab">Event years <span class="hi-year-range-val">' + yearLabel() + "</span></div>" +
      '<div class="hi-year-range-track" aria-hidden="true"><div class="hi-year-range-fill"></div></div>' +
      '<div class="hi-year-range-inputs">' +
      '<input type="range" class="hi-year-lo" min="' + Y0 + '" max="' + Y1 + '" step="1" value="' + yearMin + '" aria-label="Earliest event year">' +
      '<input type="range" class="hi-year-hi" min="' + Y0 + '" max="' + Y1 + '" step="1" value="' + yearMax + '" aria-label="Latest event year">' +
      "</div>" +
      '<div class="hi-year-range-ticks" aria-hidden="true"><span>' + Y0 + "</span><span>" + Y1 + "</span></div>" +
      '<div class="hi-year-hint">Documented reentries &amp; breakups. Rings = approximate published debris/recovery scales.</div>';
    host.appendChild(box);
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
      id: c.id, name: c.name, year: c.year, place: c.place || "",
      kind: c.kind || "", note: c.extent_note || "", approx: (c.radius_km || c.major_km) ? 1 : 0
    };
  }
  function toFeats(d) {
    var out = [];
    (d.events || []).forEach((c) => {
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
      loading = K.loadJson("data/sky/spacecraft.json?v=c54a5d2c").then((d) => {
        feats = toFeats(d);
        return feats;
      });
    }
    return loading;
  }
  function yearFilter() {
    return ["all", [">=", ["get", "year"], yearMin], ["<=", ["get", "year"], yearMax]];
  }
  function applyFilters(map) {
    var f = yearFilter();
    if (map.getLayer(DOT)) map.setFilter(DOT, ["all", ["==", ["geometry-type"], "Point"], f]);
    if (map.getLayer(FILL)) map.setFilter(FILL, ["all", ["==", ["geometry-type"], "Polygon"], f]);
    if (map.getLayer(LINE)) map.setFilter(LINE, ["all", ["==", ["geometry-type"], "Polygon"], f]);
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
        paint: { "fill-color": "#94a3b8", "fill-opacity": 0.16 }
      }, K.before(map));
    }
    if (!map.getLayer(LINE)) {
      map.addLayer({
        id: LINE, type: "line", source: SRC,
        filter: ["all", ["==", ["geometry-type"], "Polygon"], f],
        paint: { "line-color": "#cbd5e1", "line-width": 1.3, "line-opacity": 0.85, "line-dasharray": [2, 1.2] }
      }, K.before(map));
    }
    if (!map.getLayer(DOT)) {
      map.addLayer({
        id: DOT, type: "circle", source: SRC,
        filter: ["all", ["==", ["geometry-type"], "Point"], f],
        paint: {
          "circle-color": "#e2e8f0",
          "circle-radius": K.markerScale.bind(map, DOT, "circle-radius",
            K.size({ stops: [[2, 3.5], [8, 5.5], [14, 7]] })),
          "circle-opacity": 0.94,
          "circle-stroke-color": "rgba(15,23,42,0.65)",
          "circle-stroke-width": 0.9
        }
      }, K.before(map));
    } else {
      applyFilters(map);
    }
  }
  function card(map, e) {
    var p = e.features[0].properties;
    var kind = (p.kind || "").toLowerCase();
    var lead = kind.indexOf("reent") >= 0 ? "A spacecraft came down near here."
      : kind.indexOf("break") >= 0 || kind.indexOf("debris") >= 0 ? "A spacecraft broke up near here."
      : "A documented spacecraft event happened near here.";
    var rows = [lead, String(p.year)];
    if (p.place) rows.push(p.place);
    if (p.kind) rows.push(p.kind);
    if (p.note) rows.push(p.note);
    rows.push('<span style="color:#9ca3af;font-size:11px">Recovery area is approximate when shown.</span>');
    K.show(map, e.lngLat, p.name, rows, ["Documented spacecraft event", "https://www.nasa.gov/"]);
  }
  function apply(map, on) {
    pMap = map;
    if (!on) { K.vis(map, [DOT, FILL, LINE], false); return; }
    load().then(() => {
      ensure(map);
      K.vis(map, [DOT, FILL, LINE], L.isOn("spacecraft"));
      mountYearUi();
    }).catch(() => {});
  }
  loadYearRange();
  L.add({
    id: "spacecraft", name: "Spacecraft & debris", icon: "🛰️", group: "Sky & Space",
    dflt: false, taps: [DOT, FILL, LINE],
    tip: "Documented spacecraft reentries, breakups, and debris fields. Rings are approximate published recovery scales when known",
    legend: K.legKeys([
      ["#e2e8f0", "dot", "Event location"],
      ["#94a3b8", "area", "Approximate debris / recovery field"]
    ]) + '<div class="ls-row"><small>Curated public reports. On-orbit collisions = point only.</small></div>',
    note: () => { return L.isOn("spacecraft") ? yearLabel() : ""; },
    apply: apply,
    attach: (map, on) => {
      pMap = map;
      map.on("idle", () => {
        if (!L.isOn("spacecraft")) return;
        if (!map.getLayer(DOT)) apply(map, true);
      });
      map.on("click", DOT, (e) => { card(map, e); });
      map.on("click", FILL, (e) => { card(map, e); });
      (window.SunnyHoverName = window.SunnyHoverName || {})[DOT] = (f) =>
        Promise.resolve([f.properties.name, String(f.properties.year)]);
      document.addEventListener("sunny-layers-ready", () => { mountYearUi(); });
      setTimeout(mountYearUi, 400);
      apply(map, on);
    }
  });
})();
