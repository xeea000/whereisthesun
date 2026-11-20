// workspace/whereisthesun/civic-layers.js
/* SUNNY Civic section: national and first-level capitals, plus a worldwide
 * population density picture from GHSL GHS-POP 2020. Every layer starts off. */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers, WK = window.SunnyWorldKit;
  if (!K || !L || !WK) return;
  var popFmt = (n) => {
    n = +n;
    if (!isFinite(n) || n <= 0) return "";
    return "Population " + Math.round(n).toLocaleString("en-US");
  };
  var role = (r, k) => {
    var of = r.of || r.country || "", country = r.country || "";
    if (k === "nat") return of ? "National capital of " + K.esc(of) : "National capital";
    if (of && country && of !== country) return "Capital of " + K.esc(of) + ", " + K.esc(country);
    if (of) return "Capital of " + K.esc(of);
    return "Provincial, state or district capital";
  };
  WK.pointLayer({
    id: "capitals", file: "capitals", name: "Capitals", icon: "⭐", group: "Civic", kids: true,
    tip: "National capitals, and capitals of provinces, states, districts and other first-level divisions (Natural Earth and Wikidata)",
    attrib: 'Capitals: <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>, ' +
      '<a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a>',
    src: ["Natural Earth and Wikidata", "https://www.naturalearthdata.com/"],
    srcOf: (r) => {
      if (r.qid) return ["Wikidata " + r.qid, "https://www.wikidata.org/wiki/" + r.qid];
      return ["Natural Earth populated places", "https://www.naturalearthdata.com/"];
    },
    layers: [
      { id: "cap-nat", codes: ["nat"], color: "#f0c020", emoji: "⭐", name: "National capitals" },
      { id: "cap-adm1", codes: ["adm1"], color: "#5eb4d6", emoji: "🏙️", name: "Provincial & state capitals" }
    ],
    title: (r) => { return r.name || "Capital"; },
    lines: (r, k) => { return [role(r, k), popFmt(r.pop), WK.wikiLine(r)]; }
  });
  var ID = "popdens", SRC = "popdens-src", LYR = "popdens-raster";
  var URL = "data/civic/popdens.webp?v=f8a647bc";
  var OPA = [0.25, 0.4, 0.55, 0.7, 0.85], OPA_KEY = "sunny-popdens-opa";
  var opa = 3;
  try {
    var s = +localStorage.getItem(OPA_KEY);
    if (s >= 0 && s < OPA.length && localStorage.getItem(OPA_KEY) != null) opa = s;
  } catch (e) {}
  var ATTRIB = 'Population density: <a href="https://human-settlement.emergency.copernicus.eu/ghs_pop2023.php" target="_blank" rel="noopener">GHSL GHS-POP</a> 2020 (European Commission, CC BY 4.0)';
  var COORDS = [[-180, 85.05112878], [180, 85.05112878], [180, -85.05112878], [-180, -85.05112878]];
  /* sit above the base map, clouds and other heat pictures, and under dots and labels */
  var UNDER = /^(gibs|iem-vis|vis-fill|msg-clouds|light-cloud|lc-|sky-night|sky-grid|shower-band|osm|base-|vb-|skyglow|forest-|land-ov-|land-fill|land-home)/;
  var pMap = null;
  var GRAD = "#ffe8aa,#ffc846,#ff8c23,#e6371c,#af082d,#730055,#46006e";
  function beforeId(map) {
    var ls = map.getStyle().layers || [], from = 0, i;
    ls.forEach((l, n) => {
      if (UNDER.test(l.id) || l.type === "background" || l.source === "ofm") from = n + 1;
    });
    for (i = from; i < ls.length; i++) if (ls[i].id !== LYR && !UNDER.test(ls[i].id)) return ls[i].id;
    return undefined;
  }
  function keepLow(map) {
    if (!map || !map.getLayer(LYR)) return;
    var b = beforeId(map);
    try { if (b) map.moveLayer(LYR, b); } catch (e) {}
  }
  function setOpa(i) {
    opa = Math.max(0, Math.min(OPA.length - 1, i | 0));
    try { localStorage.setItem(OPA_KEY, String(opa)); } catch (e) {}
    if (pMap && pMap.getLayer(LYR)) {
      try { pMap.setPaintProperty(LYR, "raster-opacity", OPA[opa]); } catch (e2) {}
    }
    var v = document.querySelector(".popdens-opa .hi-year-range-val");
    if (v) v.textContent = Math.round(OPA[opa] * 100) + "%";
  }
  function mountUi() {
    var host = L.ctrlHost ? L.ctrlHost(ID) : null;
    if (!host || host.querySelector(".popdens-opa")) return;
    var box = document.createElement("div");
    box.className = "hi-year-range popdens-opa";
    box.innerHTML = '<span class="hi-year-range-lab">Opacity</span><div class="hi-year-range-track"><div class="hi-year-range-fill"></div>' +
      '<input class="hi-year-lo" type="range" min="0" max="' + (OPA.length - 1) + '" step="1" value="' + opa +
      '" aria-label="Population density opacity"></div>' +
      '<span class="hi-year-range-val">' + Math.round(OPA[opa] * 100) + "%</span>";
    host.appendChild(box);
    box.querySelector("input").addEventListener("input", (e) => { setOpa(+e.target.value); });
  }
  function absUrl(u) {
    try { return new URL(u, window.location.href).href; } catch (e) { return u; }
  }
  function addLayer(map) {
    var url = absUrl(URL);
    if (!map.getSource(SRC)) map.addSource(SRC, { type: "image", url: url, coordinates: COORDS });
    if (!map.getLayer(LYR)) {
      map.addLayer({
        id: LYR, type: "raster", source: SRC,
        paint: { "raster-opacity": OPA[opa], "raster-resampling": "linear", "raster-fade-duration": 0 }
      }, beforeId(map));
      K.uncapped(map, [LYR]);
    }
    keepLow(map);
  }
  function apply(map, on) {
    pMap = map;
    mountUi();
    if (!map) return;
    if (on) {
      try { addLayer(map); } catch (eA) { return; }
    }
    K.vis(map, [LYR], on);
    if (on) keepLow(map);
  }
  L.add({
    id: ID, name: "Population density", icon: "🌡️", group: "Civic", dflt: false, taps: [LYR],
    tip: "People per square kilometre worldwide, 2020, from the European Commission's GHSL GHS-POP 1 km grid",
    apply: apply,
    legend: () => {
      return K.legRamp(GRAD, "1", "100", "10,000+") +
        '<div class="ls-row"><small>People per km² in 2020, log colour scale. GHSL GHS-POP R2023A, 1 km cells, European Commission, CC BY 4.0. ' +
        "The picture is that grid averaged to about 10 km at the equator.</small></div>";
    },
    attach: (map, on) => {
      pMap = map;
      map.on("idle", () => { if (L.isOn(ID) && !map.getLayer(LYR)) apply(map, true); });
      document.addEventListener("sunny-layers-ready", mountUi);
      setTimeout(mountUi, 400);
      apply(map, on);
    }
  });
  window.SunnyTapValue = Object.assign(window.SunnyTapValue || {}, {
    popdens: () => {
      return "People per km² in 2020, from GHSL GHS-POP (1 km grid, shown at about 10 km here)";
    }
  });
})();
