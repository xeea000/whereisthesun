// workspace/whereisthesun/places-layers.js
/* SUNNY place layers (t397u) from data/world/<set>.* (tools/osm-canada.py, tools/build-places.js): OpenStreetMap in Canada plus,
 * per set, worldwide Wikidata or brand places. Each kind is an emoji badge with its own switch. Kinds come only from the tags
 * people mapped. Uses the point layer maker and tap card helpers that world-layers.js shares as SunnyWorldKit. */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers, WK = window.SunnyWorldKit;
  if (!K || !L || !WK) return;
  var OWA = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>';
  var WDA = '<a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a>';
  var tidy = (s) => { return K.esc(String(s || "").replace(/_/g, " ").replace(/;/g, ", ")); };
  /* one layer per set: o.kinds [[code, label, emoji, colour]], o.extra (r) -> a card line from the set's extra column */
  function placeLayer(o) {
    var NAME = {};
    o.kinds.forEach((x) => { NAME[x[0]] = x[1]; });
    WK.pointLayer({ id: o.id, file: o.file || o.id, name: o.name, icon: o.icon, group: o.group, kids: true, tip: o.tip, foot: o.foot,
      attrib: o.attrib, src: ["OpenStreetMap (ODbL)", "https://www.openstreetmap.org/"], srcOf: WK.srcOf,
      layers: o.kinds.map((x) => { return { id: o.id + "-" + x[0], codes: [x[0]], color: x[3], emoji: x[2], name: x[1] }; }),
      title: (r) => { return r.name || o.untitled || o.name; },
      lines: (r, k) => {
        return [K.esc(NAME[k] || ""), r.op && r.op !== r.name ? "Brand or operator: " + K.esc(r.op) : "", o.extra ? o.extra(r, k) : "",
          WK.place(r), WK.wikiLine(r)];
      } });
  }
  placeLayer({ id: "fun", name: "Zoos, theme parks & climbing", icon: "🎢", group: "Fun & Games", untitled: "Place",
    tip: "Zoos and aquariums and theme parks worldwide (Wikidata); in Canada also arcades, paintball, climbing and bouldering gyms, " +
      "outdoor crags and boulders (OpenStreetMap)",
    attrib: "Fun: " + OWA + ", " + WDA,
    kinds: [["zoo", "Zoo or aquarium", "🦁", "#e0a040"], ["park", "Theme or amusement park", "🎢", "#ff5fa2"], ["arcade", "Arcade (Canada)", "🕹️", "#a070ff"],
      ["paint", "Paintball field or shop (Canada)", "🎯", "#ff7043"], ["cgym", "Climbing gym (Canada)", "🧗", "#4fc3f7"],
      ["bgym", "Bouldering gym (Canada)", "🧱", "#26a69a"], ["crag", "Outdoor climbing, crag (Canada)", "⛰️", "#9ccc65"],
      ["rock", "Outdoor bouldering (Canada)", "🪨", "#bcaaa4"]],
    extra: (r, k) => { return r.extra && k !== "zoo" && k !== "park" ? "Sport: " + tidy(r.extra) : ""; } });
  window.SunnyPlaces = placeLayer;
})();
