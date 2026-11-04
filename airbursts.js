// workspace/whereisthesun/airbursts.js
/* SUNNY opt215: meteor / bolide airbursts (Sky & Space).
 * Data: NASA JPL CNEOS Fireball API (public domain). Points sized by log impact energy.
 * Tunguska 1908: approximate extent ellipse from published ~2150 km² forest-fall dimensions
 * (labelled approximate; not a surveyed polygon). Year range applies to CNEOS points;
 * Tunguska footprint stays visible whenever the layer is on. Off by default; lazy; all zooms. */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers;
  if (!K || !L) return;
  var Y0 = 1988, Y1 = 2026;
  var yearMin = Y0, yearMax = Y1;
  var SRC = "airbursts", DOT = "airburst-dot", FILL = "airburst-fill", LINE = "airburst-line";
  var feats = null, loading = null, pMap = null;
  var ATTRIB = 'Airbursts: <a href="https://cneos.jpl.nasa.gov/fireballs/" target="_blank" rel="noopener">NASA CNEOS Fireballs</a> (public domain)';
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
    try { localStorage.setItem("sunny-air-year", yearMin + "," + yearMax); } catch (e) {}
    syncYearUi();
    if (!silent && pMap && pMap.getLayer(DOT)) {
      pMap.setFilter(DOT, ["all", ["==", ["geometry-type"], "Point"], yearFilter()]);
      if (K.magnitude) K.magnitude.request("airbursts");
    }
  }
  function loadYearRange() {
    try {
      var v = localStorage.getItem("sunny-air-year");
      if (v) {
        var p = v.split(",");
        if (p.length === 2) setYearRange(+p[0], +p[1], true);
      }
    } catch (e) {}
  }
  function syncYearUi() {
    var box = document.querySelector(".air-year-range");
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
    var input = document.querySelector('.lp-input[data-id="airbursts"]');
    if (!input) return;
    var wrap = input.closest(".lp-fold");
    if (!wrap || wrap.querySelector(".air-year-range")) return;
    var box = document.createElement("div");
    box.className = "hi-year-range air-year-range";
    box.innerHTML =
      '<div class="hi-year-range-lab">CNEOS years <span class="hi-year-range-val">' + yearLabel() + "</span></div>" +
      '<div class="hi-year-range-track" aria-hidden="true"><div class="hi-year-range-fill" style="background:linear-gradient(90deg,#6b5cff,#c4b5fd,#fde68a)"></div></div>' +
      '<div class="hi-year-range-inputs">' +
      '<input type="range" class="hi-year-lo" min="' + Y0 + '" max="' + Y1 + '" step="1" value="' + yearMin + '" aria-label="Earliest airburst year">' +
      '<input type="range" class="hi-year-hi" min="' + Y0 + '" max="' + Y1 + '" step="1" value="' + yearMax + '" aria-label="Latest airburst year">' +
      "</div>" +
      '<div class="hi-year-range-ticks" aria-hidden="true"><span>' + Y0 + "</span><span>" + Y1 + "</span></div>" +
      '<div class="hi-year-hint">NASA CNEOS fireballs. Tunguska approximate extent stays on. Size ≈ log impact energy.</div>';
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
  function toFeats(d) {
    var out = [];
    (d.fireballs || []).forEach((r) => {
      var impact = r[4];
      var energy = r[3];
      /* eng in kt TNT-equivalent for magnitude sizing */
      var eng = impact > 0 ? impact * 1000 : (energy > 0 ? energy : 0);
      var mag = eng > 0 ? Math.log10(eng + 1) : 0;
      var year = r[0] ? +r[0].slice(0, 4) : 0;
      out.push({
        type: "Feature",
        properties: {
          kind: "cneos", date: r[0], year: year, energy: energy, impact: impact, eng: eng,
          alt: r[5], vel: r[6], mag: mag, name: "Fireball " + (r[0] || "")
        },
        geometry: { type: "Point", coordinates: [r[2], r[1]] }
      });
    });
    var t = d.tunguska;
    if (t) {
      out.push({
        type: "Feature",
        properties: {
          kind: "tunguska", date: t.date, year: 1908, name: t.name,
          note: t.note, approx: 1
        },
        geometry: { type: "Polygon", coordinates: [ellipseRing(t.lon, t.lat, t.major_km, t.minor_km, t.bearing_deg)] }
      });
      out.push({
        type: "Feature",
        properties: {
          kind: "tunguska", date: t.date, year: 1908, name: t.name,
          note: t.note, approx: 1, mag: 4, eng: 1e7 /* ~10 Mt */
        },
        geometry: { type: "Point", coordinates: [t.lon, t.lat] }
      });
    }
    return K.magnitude.sort(out.filter((f) => { return f.geometry.type === "Point"; }).concat(out.filter((f) => { return f.geometry.type !== "Point"; })), "eng");
  }
  function filteredEng() {
    return (feats || []).filter((f) => {
      if (f.geometry.type !== "Point") return false;
      if (f.properties.kind === "tunguska") return true;
      var y = +f.properties.year;
      return y >= yearMin && y <= yearMax && +f.properties.eng > 0;
    }).map((f) => { return +f.properties.eng; });
  }
  function allEng() {
    return (feats || []).filter((f) => { return f.geometry.type === "Point" && +f.properties.eng > 0; })
      .map((f) => { return +f.properties.eng; });
  }
  function magOpts() {
    return {
      id: "airbursts", prop: "eng", transform: "log", px: [3, 40],
      domain: [0.1, 1e7], values: filteredEng, allValues: allEng,
      format: (e) => {
        if (!(e > 0)) return "0";
        if (e >= 1e6) return (e / 1e6).toFixed(1) + " Mt";
        if (e >= 1e3) return (e / 1e3).toFixed(1) + " kt";
        return e.toFixed(1) + " kt";
      },
      unit: ""
    };
  }
  function pushDots(map) {
    if (!map.getSource(SRC) || !feats) return;
    if (K.magnitude) {
      K.magnitude.refresh("airbursts");
      var hi = K.magnitude.hiRaw("airbursts") || 0;
      var pts = feats.filter((f) => { return f.geometry.type === "Point"; });
      var polys = feats.filter((f) => { return f.geometry.type !== "Point"; });
      pts = K.magnitude.sort(pts, "eng");
      K.magnitude.markOutliers(pts, "eng", hi);
      map.getSource(SRC).setData(K.fc(pts.concat(polys)));
    } else map.getSource(SRC).setData(K.fc(feats));
  }
  function load() {
    if (!loading) {
      loading = K.loadJson("data/sky/airbursts.json?v=81922116").then((d) => {
        feats = toFeats(d);
        return feats;
      });
    }
    return loading;
  }
  function yearFilter() {
    return ["any",
      ["==", ["get", "kind"], "tunguska"],
      ["all", [">=", ["get", "year"], yearMin], ["<=", ["get", "year"], yearMax]]
    ];
  }
  function ensure(map) {
    if (!map.getSource(SRC)) {
      map.addSource(SRC, { type: "geojson", data: K.fc(feats), attribution: ATTRIB });
    }
    if (!map.getLayer(FILL)) {
      map.addLayer({
        id: FILL, type: "fill", source: SRC,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#c4b5fd", "fill-opacity": 0.22 }
      }, K.before(map));
    }
    if (!map.getLayer(LINE)) {
      map.addLayer({
        id: LINE, type: "line", source: SRC,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "line-color": "#a78bfa", "line-width": 1.4, "line-opacity": 0.9, "line-dasharray": [2, 1] }
      }, K.before(map));
    }
    if (!map.getLayer(DOT)) {
      var rad = K.magnitude.bind(map, DOT, magOpts());
      map.addLayer({
        id: DOT, type: "circle", source: SRC,
        filter: ["all", ["==", ["geometry-type"], "Point"], yearFilter()],
        layout: { "circle-sort-key": K.magnitude.sortKey("eng") },
        paint: {
          "circle-color": [
            "case", ["==", ["get", "kind"], "tunguska"], "#fde68a",
            ["interpolate", ["linear"], ["get", "mag"], 0, "#6b5cff", 1.5, "#a78bfa", 3, "#fde68a"]
          ],
          "circle-radius": rad,
          "circle-radius-transition": { duration: 450, delay: 0 },
          "circle-opacity": 0.85,
          "circle-stroke-color": ["case", ["==", ["get", "magOut"], 1], "#fff6c8", "rgba(20,10,40,0.55)"],
          "circle-stroke-width": K.magnitude.stroke()
        }
      }, K.before(map));
      pushDots(map);
    } else {
      map.setFilter(DOT, ["all", ["==", ["geometry-type"], "Point"], yearFilter()]);
      if (K.magnitude) K.magnitude.request("airbursts");
    }
  }
  function card(map, e) {
    var p = e.features[0].properties;
    var rows = [];
    if (p.kind === "tunguska") {
      rows.push("A huge airburst flattened forest here in 1908.");
      if (p.date) rows.push(String(p.date));
      rows.push(p.note || "Approximate extent");
      rows.push("It exploded in the air — no crater.");
      rows.push('<span style="color:#9ca3af;font-size:11px">Ring is approximate published extent.</span>');
    } else {
      rows.push("A bright fireball exploded in the air here.");
      if (p.date) rows.push(String(p.date));
      if (+p.impact > 0) rows.push("About as strong as " + p.impact + " million tons of TNT.");
      else if (+p.energy > 0) rows.push("Flash energy ~ " + p.energy + " thousand tons of TNT.");
      if (+p.alt > 0) rows.push("About " + p.alt + " km up.");
      if (+p.vel > 0) rows.push("Speed ~ " + p.vel + " km/s.");
      rows.push('<span style="color:#9ca3af;font-size:11px">Energy is estimated from the flash.</span>');
    }
    K.show(map, e.lngLat, p.name || "Airburst", rows,
      p.kind === "tunguska"
        ? ["Tunguska approximate extent", "https://en.wikipedia.org/wiki/Tunguska_event"]
        : ["NASA CNEOS Fireballs", "https://cneos.jpl.nasa.gov/fireballs/"]);
  }
  function apply(map, on) {
    pMap = map;
    if (!on) { K.vis(map, [DOT, FILL, LINE], false); return; }
    load().then(() => {
      ensure(map);
      K.vis(map, [DOT, FILL, LINE], L.isOn("airbursts"));
      pushDots(map);
      mountYearUi();
    }).catch(() => {});
  }
  loadYearRange();
  L.add({
    id: "airbursts", name: "Airbursts & fireballs", icon: "☄️", group: "Sky & Space",
    dflt: false, taps: [DOT, FILL, LINE],
    tip: "NASA CNEOS fireball airbursts (1988–now), sized by impact energy, plus Tunguska 1908 approximate forest-fall extent",
    legend: () => {
      return K.legKeys([
        ["#6b5cff", "dot", "Lower energy fireball"],
        ["#a78bfa", "dot", "Mid energy"],
        ["#fde68a", "dot", "Higher energy / Tunguska"],
        ["#c4b5fd", "area", "Tunguska approximate extent"]
      ]) + (K.magnitude ? K.magnitude.legend("airbursts") : "") +
        '<div class="ls-row"><small>CNEOS PD · Tunguska ellipse ≈ published ~2150 km² butterfly (approximate).</small></div>';
    },
    note: () => { return L.isOn("airbursts") ? yearLabel() + " · +Tunguska" : ""; },
    apply: apply,
    attach: (map, on) => {
      pMap = map;
      map.on("idle", () => {
        if (!L.isOn("airbursts")) return;
        if (!map.getLayer(DOT)) apply(map, true);
      });
      map.on("click", DOT, (e) => { card(map, e); });
      map.on("click", FILL, (e) => { card(map, e); });
      (window.SunnyHoverName = window.SunnyHoverName || {})[DOT] = (f) =>
        Promise.resolve([f.properties.name, f.properties.date || ""]);
      document.addEventListener("sunny-layers-ready", () => { mountYearUi(); });
      setTimeout(mountYearUi, 400);
      apply(map, on);
    }
  });
})();
