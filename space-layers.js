// workspace/whereisthesun/space-layers.js
/* SUNNY space launch sites (t397u), in Sky & Space, Artificial, from data/world/space.* (tools/build-space.js): spaceports and launch
 * sites, launch pads, space centres and rocket test stands, and rocket and spacecraft factories (Wikidata and OpenStreetMap).
 * Uses the point layer maker and tap card helpers that world-layers.js shares as SunnyWorldKit. */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers, WK = window.SunnyWorldKit;
  if (!K || !L || !WK) return;
  var SPACE = [["port", "Spaceport or launch site", "🌍", "#4fc3f7"], ["pad", "Launch pad or launch complex", "🚀", "#ff7043"],
    ["centre", "Space centre or rocket test stand", "🎛️", "#ba68c8"], ["factory", "Rocket or spacecraft factory", "🏗️", "#ffd54f"]];
  var NAME = {};
  SPACE.forEach((x) => { NAME[x[0]] = x[1]; });
  var SA = 'Space: <a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a>, ' +
    '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>';
  WK.pointLayer({ id: "space", file: "space", name: "Launch sites & rocket factories", icon: "🚀", group: "Sky & Space/Artificial", kids: true,
    tip: "Spaceports, launch pads, space centres, rocket test stands and rocket and spacecraft factories (Wikidata, OpenStreetMap)",
    attrib: SA, src: ["Wikidata", "https://www.wikidata.org/"], srcOf: WK.srcOf,
    layers: SPACE.map((x) => { return { id: "space-" + x[0], codes: [x[0]], color: x[3], emoji: x[2], name: x[1] }; }),
    title: (r) => { return r.name || NAME.pad; },
    lines: (r, k) => {
      return [K.esc(NAME[k] || ""), r.year ? "Since " + K.esc(r.year) : "", r.op ? "Run by " + K.esc(r.op) : "", WK.place(r), WK.wikiLine(r)];
    } });
})();
