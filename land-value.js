// workspace/whereisthesun/land-value.js
/* SUNNY Land value, in Human impact. Heatmap of real assessed or appraised LAND value per m² of land:
 *   Quebec      every municipal assessment roll (MAMH, rôle d'évaluation foncière 2026, CC BY 4.0): land value ÷ land area, per census DA
 *   Vancouver   City of Vancouver property tax report 2026 (BC Assessment land values, July 1 2025) ÷ parcel area, per census DA
 *   United States FHFA Working Paper 19-01 v4 (Davis, Larson, Oliner, Shui): single-family land price per acre, 2022, census tracts,
 *               county average where the tract has no estimate
 * and, on its own switch and its own scale, 2021 Census median value of dwellings (Statistics Canada, per home, not land).
 * No value is drawn where no source covers the ground. Far out: one prebaked Web Mercator image (data/land/ov-*.png);
 * zoom 7 and in: 2° vector tiles (data/land/t/*.json) with each area's own value on tap.
 * Draws under every dot, badge and smell plume so the Stinky map reads on top; the ramp avoids the plume's yellow-green.
 * Tools: tools/build-land.py. */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers, P = window.SunnyPoints;
  if (!K || !L) return;
  var ID = "landvalue", man = null, map = null, rows = {}, asked = {}, pending = 0;
  var OPA = [0.25, 0.4, 0.55, 0.7, 0.85], OPA_KEY = "sunny-land-opa";
  var opa = 2;
  try { var s = +localStorage.getItem(OPA_KEY); if (s >= 0 && s < OPA.length && localStorage.getItem(OPA_KEY) != null) opa = s; } catch (e) {}
  /* literal data URLs so tools/data-hashes.js can stamp ?v= */
  var URLS = {
    man: "data/land/manifest.json?v=c28fdfef",
    ovLand: "data/land/ov-land.png?v=89bcbadb",
    ovHome: "data/land/ov-home.png?v=166f4c00",
    smells: "data/world/smells.p.json?v=b5b05e4a"
  };
  var SRC = {
    q: ["Rôle d'évaluation foncière du Québec 2026 (MAMH, CC BY 4.0)", "https://www.donneesquebec.ca/recherche/dataset/roles-d-evaluation-fonciere-du-quebec"],
    v: ["City of Vancouver property tax report 2026 (BC Assessment)", "https://opendata.vancouver.ca/explore/dataset/property-tax-report/"],
    t: ["FHFA Working Paper 19-01, land prices 2022", "https://www.fhfa.gov/research/papers/wp1901"],
    c: ["FHFA Working Paper 19-01, land prices 2022", "https://www.fhfa.gov/research/papers/wp1901"],
    h: ["Statistics Canada 2021 Census Profile", "https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/prof/index.cfm?Lang=E"]
  };
  var landOn = () => { return K.kids.layerOn(L.isOn(ID), ID + "-land", true); };
  var homeOn = () => { return K.kids.layerOn(L.isOn(ID), ID + "-home", false); };
  var money = (v, cur) => {
    if (!(v > 0) && v !== 0) return "no data";
    var s = v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + " M" : v >= 1e4 ? Math.round(v / 1e3) + "k" : v >= 100 ? String(Math.round(v)) : v.toFixed(v >= 10 ? 0 : 1);
    return "$" + s + (cur ? " " + cur : "");
  };
  var step = (br, prop) => {
    var e = ["step", ["get", prop], man.ramp[0]];
    br.forEach((b, i) => { e.push(b, man.ramp[i + 1]); });
    return e;
  };
  /* under every SUNNY dot, badge, plume and the base map labels: the first circle or symbol layer in the style */
  var under = () => {
    var ls = map.getStyle().layers;
    for (var i = 0; i < ls.length; i++) if ((ls[i].type === "circle" || ls[i].type === "symbol" || /plume/.test(ls[i].id)) && !/^land-/.test(ls[i].id)) return ls[i].id;
    return undefined;
  };
  var ov = {};
  var field = (kind) => {
    if (!ov[kind]) ov[kind] = K.field({ id: "land-ov-" + kind, urls: { ov: kind === "land" ? URLS.ovLand : URLS.ovHome }, bounds: man.ov.bounds, opacity: OPA[opa] });
    return ov[kind];
  };
  /* decode one tile row: [id, kind, v, ..., polys]; rings are 1e-4° ints, first point absolute then deltas */
  var poly = (enc) => {
    return enc.map((rings) => {
      return rings.map((d) => {
        var out = [], x = 0, y = 0;
        for (var i = 0; i < d.length; i += 2) { x += d[i]; y += d[i + 1]; out.push([x / 1e4, y / 1e4]); }
        return out;
      });
    });
  };
  var feat = (r) => {
    var kind = r[1], g = r[r.length - 1];
    return { type: "Feature", id: undefined, properties: { id: r[0], k: kind, v: r[2], hv: "qvh".indexOf(kind) >= 0 ? r[6] : null, r: JSON.stringify(r.slice(2, -1)) },
      geometry: { type: "MultiPolygon", coordinates: poly(g) } };
  };
  var setData = () => {
    if (!map || !map.getSource("land-vec")) return;
    var seen = {}, out = [];
    Object.keys(rows).forEach((k) => { rows[k].forEach((f) => { if (!seen[f.properties.id]) { seen[f.properties.id] = 1; out.push(f); } }); });
    map.getSource("land-vec").setData(K.fc(out));
  };
  var tileUrl = (k) => { return "data/land/" + (k === "big" ? "big" : "t/" + k) + ".json?v=" + (man && man.v || "t407a"); };
  var tile = (k) => {
    if (asked[k]) return; asked[k] = 1; pending++;
    K.loadJson(tileUrl(k)).then((rs) => {
      rows[k] = rs.map(feat); pending--; setData(); L.refresh && L.refresh();
    }).catch(() => { delete asked[k]; pending--; });
  };
  var viewTiles = () => {
    if (!man || map.getZoom() < man.liveZ) return;
    var b = map.getBounds(), T = man.tile;
    if (man.big) tile("big");
    man.tiles.forEach((k) => {
      var p = k.split("_").map(Number);
      if (p[0] < b.getNorth() && p[0] + T > b.getSouth() && p[1] < b.getEast() && p[1] + T > b.getWest()) tile(k);
    });
  };
  var addVec = () => {
    if (map.getSource("land-vec")) return;
    map.addSource("land-vec", { type: "geojson", data: K.fc([]), attribution: ATTRIB });
    /* census home values first, land values over them: where both exist the land value (the closer measure) wins */
    map.addLayer({ id: "land-home", type: "fill", source: "land-vec", minzoom: man.liveZ, filter: ["!=", ["typeof", ["get", "hv"]], "null"],
      paint: { "fill-color": step(man.home.breaks, "hv"), "fill-opacity": OPA[opa], "fill-antialias": false } }, under());
    /* FHFA county averages use 70% opacity: they stand in for tracts with no estimate of their own */
    map.addLayer({ id: "land-fill", type: "fill", source: "land-vec", minzoom: man.liveZ, filter: ["!=", ["get", "k"], "h"],
      paint: { "fill-color": step(man.land.breaks, "v"), "fill-opacity": ["*", OPA[opa], ["case", ["==", ["get", "k"], "c"], 0.7, 1]], "fill-antialias": false } }, under());
  };
  var sync = () => {
    if (!map || !man) return;
    var on = L.isOn(ID), lo = map.getZoom() < man.liveZ;
    ["home", "land"].forEach((kind) => {
      var want = on && lo && (kind === "land" ? landOn() : homeOn());
      var f = field(kind);
      if (want) { f.ensure(map); try { map.moveLayer(f.id, under()); } catch (e) {} }
      f.vis(map, want);
    });
    if (on) { addVec(); viewTiles(); }
    K.vis(map, ["land-fill"], on && landOn());
    K.vis(map, ["land-home"], on && homeOn());
    if (on) {
      try {
        if (map.getLayer("land-fill")) map.moveLayer("land-fill", under());
        if (map.getLayer("land-home")) map.moveLayer("land-home", map.getLayer("land-fill") ? "land-fill" : under());
      } catch (eM) {}
    }
  };
  var setOpa = (i) => {
    opa = Math.max(0, Math.min(OPA.length - 1, i | 0));
    try { localStorage.setItem(OPA_KEY, String(opa)); } catch (e) {}
    if (!map) return;
    ["land", "home"].forEach((k) => { if (ov[k] && map.getLayer(ov[k].id)) map.setPaintProperty(ov[k].id, "raster-opacity", OPA[opa]); });
    if (map.getLayer("land-fill")) map.setPaintProperty("land-fill", "fill-opacity", ["*", OPA[opa], ["case", ["==", ["get", "k"], "c"], 0.7, 1]]);
    if (map.getLayer("land-home")) map.setPaintProperty("land-home", "fill-opacity", OPA[opa]);
    var v = document.querySelector(".land-opa .hi-year-range-val"); if (v) v.textContent = Math.round(OPA[opa] * 100) + "%";
  };
  /* ordinal opacity slider, same control as the ocean garbage class slider */
  var mountUi = () => {
    var host = L.ctrlHost ? L.ctrlHost(ID) : null;
    if (!host || host.querySelector(".land-opa")) return;
    var box = document.createElement("div");
    box.className = "hi-year-range land-opa";
    box.innerHTML = '<span class="hi-year-range-lab">Opacity</span><div class="hi-year-range-track"><div class="hi-year-range-fill"></div>' +
      '<input class="hi-year-lo" type="range" min="0" max="' + (OPA.length - 1) + '" step="1" value="' + opa + '" aria-label="Land value opacity"></div>' +
      '<span class="hi-year-range-val">' + Math.round(OPA[opa] * 100) + "%</span>";
    host.appendChild(box);
    box.querySelector("input").addEventListener("input", (e) => { setOpa(+e.target.value); });
  };
  /* nearest strong smell source (Stinky map types with strength 4 or 5) from the Stinky map's own points file */
  var STRONG = { landfill: "Landfill or dump", manure: "Pig barn, feedlot or manure store", pulp: "Pulp or paper mill", meat: "Slaughterhouse, rendering, fish plant or tannery" };
  var smells = null;
  var nearSmell = (lng, lat) => {
    if (!P) return Promise.resolve("");
    smells = smells || K.loadJson(URLS.smells).then((d) => { return P.toFeatures(d); });
    return smells.then((fs) => {
      var best = null, bd = 1e9, k = Math.cos(lat * Math.PI / 180);
      fs.forEach((f) => {
        if (!STRONG[f.properties.k]) return;
        var c = f.geometry.coordinates, dx = (c[0] - lng) * 111.32 * k, dy = (c[1] - lat) * 110.57, d = Math.sqrt(dx * dx + dy * dy);
        if (d < bd) { bd = d; best = f; }
      });
      if (!best || bd > 25) return "";
      return "Nearest strong smell source: " + K.esc(STRONG[best.properties.k]) + ", " + (bd < 10 ? bd.toFixed(1) : Math.round(bd)) + " km away <small>(Stinky map; OpenStreetMap)</small>";
    }).catch(() => { return ""; });
  };
  var FX = (y) => { return man.fx[y] || man.fx[2025]; };
  var lines = (k, r, home) => {
    var v = home ? r[4] : r[0];
    if (v == null || v === "") return ["No data at this spot", "No assessment roll, land-price estimate or census home value covers this ground"];
    if (k === "h" || home) return ["Median value of dwellings <b>" + money(v, "CAD") + "</b>", "Owners' own estimate of the whole home (land and building), 2021 Census",
      "<small>Not land value; on its own colour scale</small>"];
    if (k === "q" || k === "v") {
      return ["Land <b>" + money(v, "CAD") + " per m²</b> (" + money(v / FX(+String(r[3]).slice(0, 4)), "USD") + ")",
        "Typical lot " + money(r[1], "CAD") + " per m² (median of " + r[2] + " roll entries)",
        "Assessed land value ÷ land area, market date " + K.esc(r[3]),
        "<small>Average over all assessed land in this census area; roads and untaxed land are not counted</small>"];
    }
    var how = k === "c" ? r[4] : r[3];
    return ["Land <b>" + money(r[1], "USD") + " per m²</b> (" + money(v, "CAD") + ")",
      "About " + money(r[1] * 4046.86, "USD") + " per acre" + (r[2] ? ", land share " + Math.round(r[2] * 100) + "%" + (how ? " (2015 base)" : "") : ""),
      k === "c" ? "County average, shown where the tract has no estimate of its own" + (r[3] ? ": " + K.esc(r[3]) : "") : "Census tract estimate",
      how ? "Pooled 2012–2022 estimate, moved to 2022 with FHFA's own " + how + " land price change" : "2022 estimate",
      "<small>Single-family lots only, from home appraisals (FHFA, experimental)</small>"];
  };
  var title = (k) => { return { q: "Land value, Quebec", v: "Land value, Vancouver", t: "Land value, US", c: "Land value, US", h: "Home value (census)" }[k] || "Land value"; };
  var ATTRIB = 'Land value: <a href="https://www.donneesquebec.ca/recherche/dataset/roles-d-evaluation-fonciere-du-quebec" target="_blank" rel="noopener">MAMH (CC BY 4.0)</a>, ' +
    '<a href="https://opendata.vancouver.ca/" target="_blank" rel="noopener">City of Vancouver</a>, <a href="https://www.fhfa.gov/research/papers/wp1901" target="_blank" rel="noopener">FHFA</a>, ' +
    '<a href="https://www.statcan.gc.ca/" target="_blank" rel="noopener">Statistics Canada</a>';
  var tap = (e) => {
    var f = e.features[0], p = f.properties, r = JSON.parse(p.r), home = f.layer.id === "land-home", k = home ? "h" : p.k;
    if (e.originalEvent && e.originalEvent._sunnyLand) return; /* both fills hit: one card */
    if (e.originalEvent) e.originalEvent._sunnyLand = 1;
    var ls = lines(k, r, home);
    var pp = K.show(map, e.lngLat, title(k), ls, SRC[k]);
    nearSmell(e.lngLat.lng, e.lngLat.lat).then((s) => { if (s && pp && pp.isOpen()) pp.setHTML(K.card(title(k), ls.concat([s]), SRC[k])); });
  };
  var legend = () => {
    if (!man) return "";
    var r = man.ramp.join(","), out = "";
    if (landOn()) out += K.legRamp(r, "under $2", "$250", "$25k+ per m² of land (CAD)");
    if (homeOn()) out += K.legRamp(r, "under $100k", "$600k", "$4M+ per home (CAD, census)");
    return out + '<div class="ls-row"><small>Land per m²: Quebec 2026 assessment rolls (market dates 2022–2025), City of Vancouver 2026 roll (1 July 2025), US FHFA 2022 single-family land. ' +
      "Home value: 2021 Census of Canada, per dwelling, not land. Not adjusted for inflation; US$ at the Bank of Canada yearly average. " +
      "No data (blank) where no source covers the land</small></div>";
  };
  window.SunnyTapValue = Object.assign(window.SunnyTapValue || {}, {
    landvalue: (ll) => {
      if (!L.isOn(ID) || !man) return "";
      if (map && map.getZoom() >= man.liveZ) return "No data at this spot — no assessment roll, land-price estimate or census home value covers this ground";
      return "Picture of land value at this zoom. Zoom in to 7 or closer for each area's figure. Blank areas have no data.";
    }
  });
  L.add({ id: ID, name: "Land value", icon: "💰", group: "Human impact", dflt: false, taps: ["land-fill", "land-home"], apply: () => { sync(); },
    kids: [{ id: ID + "-land", name: "Land value per m² (Quebec, Vancouver, US)", dflt: true }, { id: ID + "-home", name: "Home value, 2021 Census (Canada)", dflt: false }],
    kidSet: () => { sync(); }, legend: legend,
    tip: "Real assessed or appraised land value per square metre, from open assessment rolls and FHFA land prices; census home values on their own switch. Blank where there is no data",
    note: () => { return pending ? "Loading land values…" : (man && map && map.getZoom() < man.liveZ && L.isOn(ID) ? "Zoom in for each area's value" : ""); },
    attach: (m) => {
      map = m;
      K.loadJson(URLS.man).then((d) => { man = d; sync(); }).catch(() => {});
      m.on("moveend", () => { if (L.isOn(ID)) sync(); });
      m.on("idle", () => { if (L.isOn(ID) && man && !m.getLayer("land-fill")) sync(); });
      ["land-fill", "land-home"].forEach((id) => { m.on("click", id, tap); });
      document.addEventListener("sunny-layers-ready", mountUi);
      setTimeout(mountUi, 400);
    } });
})();
