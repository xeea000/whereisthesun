// workspace/whereisthesun/smell-layers.js
/* SUNNY Stinky map (t406u), in Human impact: smell sources as emoji badges (badge-kit.js) with downwind plumes from the current wind.
 * Uses the point layer maker and tap card helpers that world-layers.js shares as SunnyWorldKit. */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers, WK = window.SunnyWorldKit;
  if (!K || !L || !WK) return;
  var pointLayer = WK.pointLayer, cap = WK.cap, place = WK.place, wikiLine = WK.wikiLine, ancSrc = WK.srcOf;
  /* t406u: Stinky map (tools/osm-smells.py, tools/build-smells.js): smell sources from OpenStreetMap in Canada and Wikidata worldwide,
   * each type with a typical strength (1 to 5) given by its type, not measured. Downwind plumes: a fan from each source drawn on the map
   * toward where the current Open-Meteo wind (SunnyWindField) carries it, longer for stronger types and fainter with distance */
  var SMELL = [["landfill", "Landfill or dump", "🗑️", "#a1887f", 4], ["sewage", "Sewage or wastewater plant", "💩", "#8d6e63", 3],
    ["manure", "Pig barn, feedlot or manure store", "🐖", "#c0ca33", 4], ["pulp", "Pulp or paper mill", "🏭", "#90a4ae", 5],
    ["meat", "Slaughterhouse, rendering, fish plant or tannery", "🥩", "#e57373", 4], ["refinery", "Oil refinery or chemical plant", "🛢️", "#ffb300", 3],
    ["compost", "Compost site", "🍂", "#8bc34a", 2], ["sulphur", "Fumarole or sulphur spring", "🥚", "#fff176", 3]];
  var POWER = {};
  SMELL.forEach((s) => { POWER[s[0]] = s[4]; });
  var PLUME_Z = 8, PLUME_MAX = 300;
  /* one fan: centre bearing (degrees from north) toward where the wind goes, half width, from r0 to r1 km */
  var fan = (lon, lat, brg, half, r0, r1) => {
    var pts = [], k = Math.cos(lat * Math.PI / 180), at = (r, b) => {
      var a = b * Math.PI / 180;
      return [lon + r * Math.sin(a) / (111.32 * k), lat + r * Math.cos(a) / 110.57];
    };
    for (var b = brg - half; b <= brg + half + 1e-6; b += half / 6) pts.push(at(r1, b));
    for (var c = brg + half; c >= brg - half - 1e-6; c -= half / 6) pts.push(r0 ? at(r0, c) : [lon, lat]);
    pts.push(pts[0]);
    return [pts];
  };
  var plumeSig = "", plumeWait = 0;
  function plumes(map) {
    var W = window.SunnyWindField, src = map.getSource("smell-plume");
    if (!src || !W) return;
    var on = L.isOn("smells") && map.getZoom() >= PLUME_Z;
    if (on) W.ensure(map);
    var ids = SMELL.map((s) => { return "smell-" + s[0]; }).filter((id) => { return map.getLayer(id); });
    var fs = on ? map.queryRenderedFeatures({ layers: ids }).slice(0, PLUME_MAX) : [];
    var out = [], w = [0, 0], seen = {}, miss = 0;
    fs.forEach((f) => {
      var c = f.geometry.coordinates, key = c[0].toFixed(4) + c[1].toFixed(4);
      if (seen[key]) return;
      if (!W.sample(c[0], c[1], w)) { miss++; return; }
      seen[key] = 1;
      var spd = Math.hypot(w[0], w[1]), brg = Math.atan2(w[0], w[1]) * 180 / Math.PI;
      /* calm air keeps a smell close in all directions; wind stretches it into a narrow fan */
      var len = POWER[f.properties.k] * 0.9 * Math.min(3, 0.6 + spd / 4), half = spd < 0.7 ? 180 : Math.max(12, 34 - spd * 2);
      [[0, 0.34, 0.34], [0.34, 0.67, 0.2], [0.67, 1, 0.09]].forEach((band) => {
        out.push({ type: "Feature", properties: { o: band[2], k: f.properties.k }, geometry: { type: "Polygon", coordinates: fan(c[0], c[1], brg, half, len * band[0], len * band[1]) } });
      });
    });
    var sig = out.length + ":" + (out[0] ? out[0].geometry.coordinates[0][1].join() : "");
    if (sig !== plumeSig) { plumeSig = sig; src.setData(K.fc(out)); }
    /* wind tiles still on their way: look again shortly */
    if (miss && !plumeWait) plumeWait = setTimeout(() => { plumeWait = 0; plumes(map); }, 2500);
  }
  var SMA = 'Smells: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>, ' +
    '<a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a>, wind <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>';
  pointLayer({ id: "smells", file: "smells", name: "Stinky map", icon: "👃", group: "Human impact", kids: true,
    tip: "Landfills, sewage plants, pig barns and manure stores, pulp mills, slaughterhouses, refineries, compost sites and sulphur springs, " +
      "with a rough downwind smell plume from the current wind (OpenStreetMap in Canada, Wikidata worldwide)",
    attrib: SMA, src: ["OpenStreetMap (ODbL)", "https://www.openstreetmap.org/"], srcOf: ancSrc,
    title: (r) => { return r.name || "Smell source"; },
    layers: SMELL.map((s) => { return { id: "smell-" + s[0], codes: [s[0]], color: s[3], emoji: s[2], name: s[1] + " · " + "●".repeat(s[4]) }; }),
    foot: () => {
      return '<div class="ls-row"><small>● strength is typical for the type, estimated, not measured. Plumes (zoom ' + PLUME_Z +
        " and in) are a rough guide: they point where the current wind blows, longer for stronger types and in stronger wind, " +
        "rounder in calm air, and fade with distance; real smells depend on the day</small></div>";
    },
    extraIds: ["smell-plume-fill"],
    extra: (map) => {
      if (!map.getSource("smell-plume")) {
        map.addSource("smell-plume", { type: "geojson", data: K.fc([]) });
        map.addLayer({ id: "smell-plume-fill", type: "fill", source: "smell-plume", minzoom: PLUME_Z,
          paint: { "fill-color": "#b8c934", "fill-opacity": ["get", "o"] } }, "smell-" + SMELL[0][0]);
        var t = 0;
        map.on("idle", () => { if (L.isOn("smells") && Date.now() - t > 1500) { t = Date.now(); plumes(map); } });
        map.on("moveend", () => { if (L.isOn("smells")) plumes(map); });
      }
      plumes(map);
    },
    lines: (r, k) => {
      var s = SMELL.filter((x) => { return x[0] === k; })[0] || SMELL[0];
      return [K.esc(cap(String(r.kind || s[1]).replace(/_/g, " "))), "Typical smell strength " + s[4] + " of 5 (estimated by type)",
        r.op ? "Run by " + K.esc(r.op) : "", place(r), wikiLine(r)];
    } });
})();
