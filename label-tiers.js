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
  /* t392u: one importance order drives colour and size. A rank nearer the start of RANKS is brighter (Dark, Satellite) or darker (Roads)
   * and never smaller at any zoom: country > province/state > national capital > provincial capital > large city > city >
   * town > village > hamlet/suburb > street names. SHADE is each rank's step from the palette's top colour to its bottom.
   * Continents sit outside the order: they show alone, far out, in their own softer style. */
  var RANKS = ["country", "state", "capital", "capital-region", "city-major", "city", "town", "village", "hamlet", "street"];
  var SHADE = { country: 0, state: 0.03, capital: 0.06, "capital-region": 0.09, "city-major": 0.12, city: 0.15, town: 0.18,
    village: 0.24, hamlet: 0.32, street: 0.75 };
  /* Text size floor and ceiling (px). A label starts at its floor the moment its tier shows and grows GROW px per zoom
   * level up to its ceiling. Floors and ceilings never rise down the order. Sources (t393u): screen text no smaller than
   * about 9-10 px and ranked groups at least 2 px apart (Axis Maps labelling guide); a few size groups with weight and
   * case doing the rest, as in OpenMapTiles OSM Bright and Positron (capitals and large cities 14, other places 10,
   * road names 10, countries bold caps growing with zoom, regions in letter-spaced caps). Countries also scale with land area. */
  var GROW = 1;
  var SIZE = { "country-xl": [17, 22], "country-l": [16, 20], "country-m": [15, 18], "country-s": [15, 17], "country-xs": [15, 16],
    state: [13, 15], capital: [13, 15], "capital-region": [12, 14], "city-major": [12, 14], city: [11, 13], town: [11, 12.5],
    village: [10, 12], hamlet: [10, 11], street: [10, 11], continent: [10, 12], feature: [10.5, 12.5] };
  /* The tier table. min/max: zoom range; rank: place in RANKS; first row wins collisions.
   * t394u, after comparing Windy, Google Maps and Apple Maps (labels/recon/FINDINGS.md; their zoom N is this map's N-1):
   * every name is one fixed label at its tile point, never moved to follow the view; country names end around zoom 6,
   * where province and state names take over; province and state names show from zoom 4 to 7 in letter-spaced
   * capitals and are gone at city zooms. */
  var TIERS = [
    { id: "continent", min: 0, max: 2.2, rank: "continent", font: REG, upper: true, space: 0.45,
      filter: ["all", cls(["continent"]), ["match", ["coalesce", ["get", "name:en"], ["get", "name"]], CONTINENTS, true, false]] },
    { id: "country-xl", min: 2, max: 6, rank: "country", font: BOLD, upper: true, space: 0.12, filter: country("xl") },
    { id: "capital", min: 4, rank: "capital", font: BOLD, filter: ["all", cls(["city"]), cap(2)] },
    { id: "country-l", min: 2.5, max: 6, rank: "country", font: BOLD, upper: true, space: 0.12, filter: country("l") },
    { id: "country-m", min: 3, max: 6.5, rank: "country", font: BOLD, upper: true, space: 0.12, filter: country("m") },
    { id: "country-s", min: 3.8, max: 6.5, rank: "country", font: BOLD, upper: true, space: 0.12, filter: country("s") },
    { id: "country-xs", min: 4.8, max: 7, rank: "country", font: BOLD, upper: true, space: 0.12, filter: country("xs") },
    { id: "state", min: 4, max: 7, rank: "state", font: REG, upper: true, space: 0.2, filter: cls(["state", "province"]) },
    { id: "capital-region", min: 4, rank: "capital-region", font: BOLD, filter: ["all", cls(["city", "town"]), cap(4)] },
    { id: "city-major", min: 5, rank: "city-major", font: REG, filter: ["all", cls(["city"]), notCap, rank("<=", 3)] },
    { id: "city", min: 6, rank: "city", font: REG, filter: ["all", cls(["city"]), notCap, rank(">", 3)] },
    { id: "town", min: 8, rank: "town", font: REG, filter: ["all", cls(["town"]), ["!", cap(4)]] },
    { id: "village", min: 11, rank: "village", font: REG, filter: cls(["village"]) },
    /* every other place class (hamlets, suburbs, neighbourhoods, localities…) only close in */
    { id: "hamlet", min: 12, rank: "hamlet", font: REG,
      filter: ["!", cls(["continent", "country", "state", "province", "city", "town", "village"])] }
  ];
  var STREET_MIN = 12;
  /* One palette per theme: top and bottom of the importance ramp, plus the continent, water and point colours.
   * No pure white; Dark and Satellite get a soft dark halo, Roads a light one. roadLine tints the Labels overlay roads.
   * t392u: countries a step dimmer than t391u; towns and villages brighter; streets and road lines fainter. */
  /* t390u: one road dim for every vector theme (Roads and Dark): road lines, the overlay roads and their casing are drawn
   * at this share of their style opacity. Satellite keeps full roads so they stay visible over photos. */
  var ROAD_DIM = 0.4;
  var VECTOR = { roads: true, dark: true };
  var PAL = {
    dark: { top: "#aba69c", bottom: "#75726c", continent: "#86827b", halo: "rgba(12,14,18,0.8)", haloW: 1.2,
      water: "#6f88a2", poi: "#8f8b84", roadLine: "rgb(84,82,78)" },
    satellite: { top: "#e2ddd3", bottom: "#b4afa6", continent: "#cbc6bb", halo: "rgba(8,10,14,0.86)", haloW: 1.5,
      road: "#e5e1d7", water: "#cfe0f2", poi: "#d3cfc5", roadLine: "rgba(240,235,225,0.85)" },
    roads: { top: "#383c42", bottom: "#8a8d92", continent: "#8a847e", halo: "rgba(248,246,241,0.82)", haloW: 1.2,
      water: "#4f6d97", poi: "#6e7278", roadLine: "#e2dbce" }
  };
  var PREFIX = "ov-place-";
  /* Bottom tier first: a layer added or moved later sits on top, and the top layer wins collisions */
  var ORDER = TIERS.slice().reverse();
  var ids = ORDER.map((t) => { return PREFIX + t.id; });
  var mode = "roads";
  function hex(c) { return [1, 3, 5].map((i) => { return parseInt(c.substr(i, 2), 16); }); }
  /* colour of a rank in a theme: SHADE of the way from the palette top to its bottom */
  function colourOf(r, m) {
    var p = PAL[m] || PAL.roads;
    if (r === "continent") return p.continent;
    if (r === "street" && p.road) return p.road;
    var a = hex(p.top), b = hex(p.bottom), t = SHADE[r] || 0;
    return "#" + a.map((v, i) => { return ("0" + Math.round(v + (b[i] - v) * t).toString(16)).slice(-2); }).join("");
  }
  /* size in px of a size key at zoom z for a label that starts showing at zoom start */
  function sizeAt(key, start, z) {
    var fc = SIZE[key];
    return Math.max(fc[0], Math.min(fc[1], fc[0] + GROW * (z - start)));
  }
  function textSize(key, start) {
    var fc = SIZE[key];
    start = start || 0;
    return ["interpolate", ["linear"], ["zoom"], start, fc[0], start + (fc[1] - fc[0]) / GROW, fc[1]];
  }
  /* country rows read their area class size, every other row its rank size */
  function sizeKey(t) { return SIZE[t.id] ? t.id : t.rank; }
  function pal() { return PAL[mode] || PAL.roads; }
  function opacity() {
    var K = window.SunnyKit, b = K && K.mapBrightness ? K.mapBrightness.get() : 1;
    return b >= 1 ? 1 : Math.round((0.6 + 0.4 * b) * 100) / 100;
  }
  function paintOf(t) {
    var p = pal();
    return { "text-color": colourOf(t.rank, mode), "text-halo-color": p.halo, "text-halo-width": p.haloW, "text-halo-blur": 0.4,
      "text-opacity": opacity() };
  }
  function spec(t, vis) {
    var lay = { visibility: vis, "text-field": NAME, "text-transform": t.upper ? "uppercase" : "none", "text-font": t.font, "text-size": textSize(sizeKey(t), t.min),
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
        map.setPaintProperty("ov-road-name", "text-color", colourOf("street", mode));
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
  /* The base styles' own road, water and point names keep their layout and take this palette's colours and sizes:
   * street names at the bottom of the order, water and point names at the feature size */
  var ROLE = { transportation_name: "street", water_name: "water", waterway: "water", poi: "poi", aerodrome_label: "poi",
    mountain_peak: "poi", park: "poi" };
  function restyle(layer, m) {
    var p = PAL[m];
    if (p && VECTOR[m] && layer.type === "line" && layer["source-layer"] === "transportation") {
      var o = (layer.paint || {})["line-opacity"];
      if (o === undefined || typeof o === "number") layer.paint = Object.assign({}, layer.paint, { "line-opacity": (o === undefined ? 1 : o) * ROAD_DIM });
      return layer;
    }
    var role = ROLE[layer["source-layer"]];
    if (!p || layer.type !== "symbol" || !role || (layer.layout || {})["icon-image"]) return layer;
    var street = role === "street";
    layer.paint = Object.assign({}, layer.paint, { "text-color": street ? colourOf("street", m) : p[role], "text-halo-color": p.halo,
      "text-halo-width": p.haloW });
    layer.layout = Object.assign({}, layer.layout, { "text-size": street ? textSize("street", STREET_MIN) : textSize("feature", layer.minzoom || 0) });
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
  window.SunnyLabelTiers = { OFM_CREDIT: OFM_CREDIT, TIERS: TIERS, RANKS: RANKS, SIZE: SIZE, PAL: PAL, AREA: AREA, ROAD_DIM: ROAD_DIM,
    STREET_MIN: STREET_MIN, ids: ids, add: add, theme: theme, restyle: restyle, repaint: repaint, colourOf: colourOf, sizeAt: sizeAt,
    textSize: textSize, sizeKey: sizeKey, mode: () => { return mode; } };
})();
