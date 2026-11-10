// workspace/whereisthesun/label-tiers.js
/* SUNNY t389u: one table for every base-map place label (Roads, Dark and the Labels overlay on Satellite).
 * Each row is one zoom tier: far out only continents, then countries sized by land area, then provinces, states and
 * national capitals, then provincial capitals, then cities, towns, and villages only close in. Colours come from one
 * palette per theme: soft off-white on Dark and Satellite, dark grey on Roads, never pure white, with a light halo.
 * Labels follow the Map brightness slider. The Labels switch shows or hides them with the other overlay ids. */
(function () {
  "use strict";
  /* Latin script only: English name first (as the Labels overlay always had), then the Latin form, then the plain name */
  var NAME = ["coalesce", ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];
  var BOLD = ["Noto Sans Bold"], REG = ["Noto Sans Regular"];
  /* Land area classes by ISO code (km², Natural Earth / CIA World Factbook): xl over 2.5 million, l over 1 million,
   * m over 230,000, xs under 25,000; every other country is s. The tiles carry a rank but no area. */
  var AREA = {
    xl: ["RU", "CA", "US", "CN", "BR", "AU", "IN", "AR", "KZ"],
    l: ["DZ", "CD", "GL", "SA", "MX", "ID", "SD", "LY", "IR", "MN", "PE", "TD", "NE", "AO", "ML", "ZA", "CO", "ET", "BO",
      "MR", "EG"],
    m: ["TZ", "NG", "VE", "NA", "MZ", "PK", "TR", "CL", "ZM", "MM", "AF", "SO", "SS", "CF", "UA", "MG", "BW", "KE", "FR",
      "YE", "TH", "ES", "TM", "CM", "PG", "SE", "UZ", "MA", "IQ", "PY", "ZW", "NO", "JP", "DE", "CG", "FI", "VN", "MY",
      "CI", "PL", "OM", "IT", "PH", "EC", "BF", "NZ", "GA", "GN", "GB", "UG", "GH", "RO", "LA"],
    xs: ["DJ", "BZ", "SV", "IL", "SI", "FJ", "KW", "SZ", "TL", "BS", "ME", "VU", "QA", "GM", "JM", "XK", "LB", "CY", "PS",
      "PR", "BN", "TT", "CV", "WS", "LU", "KM", "MU", "FO", "ST", "KI", "BH", "DM", "TO", "FM", "SG", "LC", "AD", "PW",
      "SC", "AG", "BB", "VC", "GD", "MT", "MV", "KN", "LI", "MH", "SM", "TV", "NR", "MC", "VA", "GI", "HK", "MO", "BM",
      "KY", "AW", "CW", "AX", "IM", "JE", "GG", "VG", "VI", "AI", "MS", "TC", "BL", "MF", "SX", "PM", "WF", "NU", "CK",
      "TK", "PN", "SH", "IO", "NF", "CX", "CC"]
  };
  var CONTINENTS = ["Africa", "Antarctica", "Asia", "Europe", "North America", "South America", "Australia"];
  var cls = (list) => { return ["match", ["get", "class"], list, true, false]; };
  var iso = (list) => { return ["match", ["coalesce", ["get", "iso_a2"], ""], list, true, false]; };
  var country = (c) => {
    if (c !== "s") return ["all", cls(["country"]), iso(AREA[c])];
    return ["all", cls(["country"]), ["!", iso(AREA.xl.concat(AREA.l, AREA.m, AREA.xs))]];
  };
  var cap = (v) => { return ["==", ["coalesce", ["get", "capital"], 0], v]; };
  var notCap = ["!", ["match", ["coalesce", ["get", "capital"], 0], [2, 4], true, false]];
  var rank = (op, n) => { return [op, ["coalesce", ["get", "rank"], 99], n]; };
  /* The tier table. min/max: zoom range; size: [zoom, px] stops; role: palette colour; first row wins collisions. */
  var TIERS = [
    { id: "continent", min: 0, max: 2.2, role: "continent", font: REG, size: [[0, 10], [2, 12]], upper: true, space: 0.45,
      filter: ["all", cls(["continent"]), ["match", ["coalesce", ["get", "name:en"], ["get", "name"]], CONTINENTS, true, false]] },
    { id: "country-xl", min: 2, max: 7, role: "country", font: BOLD, size: [[2, 14], [5, 21]], upper: true, space: 0.12, filter: country("xl") },
    { id: "capital", min: 4, role: "major", font: BOLD, size: [[4, 11.5], [8, 14], [12, 17]], filter: ["all", cls(["city"]), cap(2)] },
    { id: "country-l", min: 2.5, max: 7.5, role: "country", font: BOLD, size: [[2.5, 12.5], [5, 17]], upper: true, space: 0.12, filter: country("l") },
    { id: "country-m", min: 3, max: 8, role: "country", font: BOLD, size: [[3, 11.5], [6, 15]], upper: true, space: 0.12, filter: country("m") },
    { id: "country-s", min: 3.8, max: 8.5, role: "country", font: BOLD, size: [[3.8, 10.5], [7, 13]], upper: true, space: 0.12, filter: country("s") },
    { id: "country-xs", min: 4.8, max: 9, role: "country", font: BOLD, size: [[4.8, 10], [8, 12]], upper: true, space: 0.12, filter: country("xs") },
    { id: "state", min: 4, max: 9, role: "region", font: REG, size: [[4, 9.5], [8, 12]], upper: true, space: 0.1,
      filter: cls(["state", "province"]) },
    { id: "capital-region", min: 4, role: "place", font: BOLD, size: [[4, 10.5], [9, 13.5], [12, 16]],
      filter: ["all", cls(["city", "town"]), cap(4)] },
    { id: "city-major", min: 5, role: "place", font: REG, size: [[5, 10.5], [10, 14], [13, 17]], filter: ["all", cls(["city"]), notCap, rank("<=", 3)] },
    { id: "city", min: 6, role: "place", font: REG, size: [[6, 10], [11, 13.5], [14, 16]], filter: ["all", cls(["city"]), notCap, rank(">", 3)] },
    { id: "town", min: 8, role: "minor", font: REG, size: [[8, 10], [13, 13.5]], filter: ["all", cls(["town"]), ["!", cap(4)]] },
    { id: "village", min: 11, role: "minor", font: REG, size: [[11, 10.5], [14, 13]], filter: cls(["village"]) },
    /* every other place class (hamlets, suburbs, neighbourhoods, localities…) only close in */
    { id: "hamlet", min: 12, role: "minor", font: REG, size: [[12, 10], [15, 12.5]],
      filter: ["!", cls(["continent", "country", "state", "province", "city", "town", "village"])] }
  ];
  /* One palette per theme. No pure white; Dark and Satellite get a soft dark halo, Roads a light one.
   * roadLine tints the Labels overlay road lines. t390u: Roads and Dark are about 12% dimmer than t389u for a calmer map.
   * t391u: country names in a darker grey, all caps; continents lighter, thinner and wider spaced; road dim 0.6 to 0.5 and darker road lines. */
  /* t390u: one road dim for every vector theme (Roads and Dark): road lines, the overlay roads and their casing are drawn
   * at this share of their style opacity. Satellite keeps full roads so they stay visible over photos. */
  var ROAD_DIM = 0.5;
  var VECTOR = { roads: true, dark: true };
  var PAL = {
    dark: { country: "#aca79d", continent: "#86827b", major: "#c9c4ba", place: "#b9b4ab", minor: "#9e9a92", region: "#908c85", halo: "rgba(12,14,18,0.8)", haloW: 1.2,
      road: "#8a867f", water: "#6f88a2", poi: "#8f8b84", roadLine: "rgb(96,93,89)" },
    satellite: { country: "#e4dfd5", continent: "#cbc6bb", major: "#eeeae0", place: "#e5e1d7", minor: "#d3cfc5", region: "#d0cbc0", halo: "rgba(8,10,14,0.86)", haloW: 1.5,
      road: "#e5e1d7", water: "#cfe0f2", poi: "#d3cfc5", roadLine: "rgba(240,235,225,0.85)" },
    roads: { country: "#2e3238", continent: "#8a847e", major: "#3c4046", place: "#464a50", minor: "#5e636a", region: "#7a746e", halo: "rgba(248,246,241,0.82)", haloW: 1.2,
      road: "#686c72", water: "#4f6d97", poi: "#6e7278", roadLine: "#e2dbce" }
  };
  var PREFIX = "ov-place-";
  /* Bottom tier first: a layer added or moved later sits on top, and the top layer wins collisions */
  var ORDER = TIERS.slice().reverse();
  var ids = ORDER.map((t) => { return PREFIX + t.id; });
  var mode = "roads";
  function size(stops) {
    var e = ["interpolate", ["linear"], ["zoom"]];
    stops.forEach((s) => { e.push(s[0], s[1]); });
    return e;
  }
  function pal() { return PAL[mode] || PAL.roads; }
  function opacity() {
    var K = window.SunnyKit, b = K && K.mapBrightness ? K.mapBrightness.get() : 1;
    return b >= 1 ? 1 : Math.round((0.6 + 0.4 * b) * 100) / 100;
  }
  function paintOf(t) {
    var p = pal();
    return { "text-color": p[t.role], "text-halo-color": p.halo, "text-halo-width": p.haloW, "text-halo-blur": 0.4, "text-opacity": opacity() };
  }
  function spec(t, vis) {
    var lay = { visibility: vis, "text-field": NAME, "text-transform": t.upper ? "uppercase" : "none", "text-font": t.font, "text-size": size(t.size),
      "text-max-width": 8, "text-padding": 4, "text-letter-spacing": t.space || 0, "symbol-sort-key": ["coalesce", ["get", "rank"], 99] };
    var s = { id: PREFIX + t.id, type: "symbol", source: "ofm", "source-layer": "place", minzoom: t.min, filter: t.filter,
      layout: lay, paint: paintOf(t) };
    if (t.max) s.maxzoom = t.max;
    return s;
  }
  /* Adds every tier once, bottom tier first, so the first rows of the table sit on top */
  function add(map, before, vis) {
    ORDER.forEach((t, i) => {
      if (map.getLayer(ids[i])) return;
      try { map.addLayer(spec(t, vis || "none"), before && map.getLayer(before) ? before : undefined); } catch (e) {}
    });
    hook();
  }
  function repaint(map) {
    map = map || window.map;
    if (!map || !map.getLayer) return;
    ORDER.forEach((t, i) => {
      if (!map.getLayer(ids[i])) return;
      var p = paintOf(t);
      Object.keys(p).forEach((k) => { try { map.setPaintProperty(ids[i], k, p[k]); } catch (e) {} });
    });
    var r = pal();
    if (map.getLayer("ov-road-name")) {
      try {
        map.setPaintProperty("ov-road-name", "text-color", r.road);
        map.setPaintProperty("ov-road-name", "text-halo-color", r.halo);
      } catch (e) {}
    }
    if (map.getLayer("ov-road")) try { map.setPaintProperty("ov-road", "line-color", r.roadLine); } catch (e) {}
    var dim = VECTOR[mode] ? ROAD_DIM : 1;
    ["ov-road", "ov-road-casing"].forEach((id) => {
      if (map.getLayer(id)) try { map.setPaintProperty(id, "line-opacity", dim); } catch (e) {}
    });
  }
  function theme(map, m) {
    mode = PAL[m] ? m : "roads";
    repaint(map);
  }
  /* The base styles' own road, water and point names keep their layout and take this palette's colours */
  var ROLE = { transportation_name: "road", water_name: "water", waterway: "water", poi: "poi", aerodrome_label: "poi",
    mountain_peak: "poi", park: "poi" };
  function restyle(layer, m) {
    var p = PAL[m];
    if (p && VECTOR[m] && layer.type === "line" && layer["source-layer"] === "transportation") {
      var o = (layer.paint || {})["line-opacity"];
      if (o === undefined || typeof o === "number") layer.paint = Object.assign({}, layer.paint, { "line-opacity": (o === undefined ? 1 : o) * ROAD_DIM });
      return layer;
    }
    if (!p || layer.type !== "symbol" || !ROLE[layer["source-layer"]] || (layer.layout || {})["icon-image"]) return layer;
    layer.paint = Object.assign({}, layer.paint, { "text-color": p[ROLE[layer["source-layer"]]], "text-halo-color": p.halo,
      "text-halo-width": p.haloW });
    return layer;
  }
  var hooked = false;
  function hook() {
    var K = window.SunnyKit;
    if (hooked || !K || !K.mapBrightness || !K.mapBrightness.onChange) return;
    hooked = true;
    K.mapBrightness.onChange(() => { repaint(); });
  }
  /* t390u: one credit line for the OpenFreeMap tiles, with links, shown behind the map's "i" button */
  var OFM_CREDIT = '<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> · ' +
    '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>';
  window.SunnyLabelTiers = { OFM_CREDIT: OFM_CREDIT, TIERS: TIERS, PAL: PAL, AREA: AREA, ROAD_DIM: ROAD_DIM, ids: ids, add: add, theme: theme, restyle: restyle, repaint: repaint,
    mode: () => { return mode; } };
})();
