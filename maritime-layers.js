// workspace/whereisthesun/maritime-layers.js
/* SUNNY ports and boats (t397u), in Travel, from data/world/maritime.* (tools/osm-maritime.py, tools/build-maritime.js): seaports and
 * harbours, marinas, boat launches, shipyards and dry docks; OpenStreetMap in Canada, Wikidata worldwide.
 * Uses the point layer maker and tap card helpers that world-layers.js shares as SunnyWorldKit. */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers, WK = window.SunnyWorldKit;
  if (!K || !L || !WK) return;
  var SEA = [["port", "Seaport or harbour", "⚓", "#4fc3f7"], ["marina", "Marina", "⛵", "#81d4fa"], ["ramp", "Boat launch (Canada)", "🛶", "#a5d6a7"],
    ["yard", "Shipyard", "🚢", "#ffb74d"], ["dry", "Dry dock or floating dock", "🔧", "#ce93d8"]];
  var NAME = {};
  SEA.forEach((x) => { NAME[x[0]] = x[1]; });
  var MA = 'Ports: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>, ' +
    '<a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a>';
  WK.pointLayer({ id: "maritime", file: "maritime", name: "Ports, marinas & shipyards", icon: "⚓", group: "Travel", kids: true,
    tip: "Seaports and harbours, marinas, boat launches, shipyards and dry docks (OpenStreetMap in Canada, Wikidata worldwide)",
    attrib: MA, src: ["OpenStreetMap (ODbL)", "https://www.openstreetmap.org/"], srcOf: WK.srcOf,
    layers: SEA.map((x) => { return { id: "sea-" + x[0], codes: [x[0]], color: x[3], emoji: x[2], name: x[1] }; }),
    title: (r) => { return r.name || NAME.port; },
    lines: (r, k) => { return [K.esc(NAME[k] || ""), r.op ? "Run by " + K.esc(r.op) : "", WK.place(r), WK.wikiLine(r)]; } });
})();
