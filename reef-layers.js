// workspace/whereisthesun/reef-layers.js
/* SUNNY reefs (t397u), in Ocean, from data/world/reefs.* (tools/build-reefs.js):
 *   Coral bleaching watch  NOAA Coral Reef Watch regional reef stations, coloured by that day's bleaching alert level (a snapshot)
 *   Reefs & underwater     coral reefs, atolls, blue holes, kelp and seagrass, cold seeps and other notable reefs (Wikidata), emoji badges
 * Uses the point layer maker and tap card helpers that world-layers.js shares as SunnyWorldKit. */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers, WK = window.SunnyWorldKit;
  if (!K || !L || !WK) return;
  var NOAA = "https://coralreefwatch.noaa.gov/product/vs/";
  /* NOAA bleaching alert area levels (7-day maximum), 0 to 7 */
  var ALERT = [["No stress", "#c6e9f7"], ["Bleaching watch", "#fff176"], ["Bleaching warning", "#ffb74d"], ["Alert level 1", "#f4511e"],
    ["Alert level 2", "#c62828"], ["Alert level 3", "#8e24aa"], ["Alert level 4", "#5e35b1"], ["Alert level 5", "#311b92"]];
  var KIDS = [[[0], "No stress"], [[1], "Bleaching watch"], [[2], "Bleaching warning"], [[3, 4], "Alert level 1 or 2 (bleaching likely)"],
    [[5, 6, 7], "Alert level 3 to 5 (severe, deaths likely)"]];
  var crwOf = (r) => {
    var p = String(r.crw || "").split("|");
    return { date: p[0], sst: +p[1], ssta: +p[2], dhw: +p[3], alert: +p[4] || 0, page: p[5] };
  };
  var CRWA = 'Coral bleaching: <a href="' + NOAA + '" target="_blank" rel="noopener">NOAA Coral Reef Watch</a> (public domain)';
  WK.pointLayer({ id: "bleaching", file: "reefs", name: "Coral bleaching watch", icon: "🌡️", group: "Ocean", kids: true,
    tip: "NOAA Coral Reef Watch reef regions coloured by their coral bleaching alert from ocean heat; a snapshot from the day the map was built",
    attrib: CRWA, src: ["NOAA Coral Reef Watch", NOAA + "map.php"],
    srcOf: (r) => { var c = crwOf(r); return ["NOAA Coral Reef Watch", c.page ? NOAA + "gauges/" + c.page : NOAA + "map.php"]; },
    layers: KIDS.map((g, i) => {
      return { id: "crw-" + i, codes: g[0].map((n) => { return "crw" + n; }), color: ALERT[g[0][g[0].length - 1]][1], r: 3.4, name: g[1] };
    }),
    foot: () => { return '<div class="ls-row"><small>Alert from the last 7 days of sea heat, as of the map build; tap a region for the date</small></div>'; },
    lines: (r) => {
      var c = crwOf(r);
      return [ALERT[c.alert][0] + " (bleaching alert, 7-day maximum)",
        isNaN(c.sst) ? "" : "Sea surface " + c.sst.toFixed(1) + " °C, " + (c.ssta >= 0 ? "+" : "") + c.ssta.toFixed(1) + " °C from normal",
        isNaN(c.dhw) ? "" : "Heat stress " + c.dhw.toFixed(1) + " degree heating weeks (4 or more: bleaching likely, 8 or more: deaths likely)",
        c.date ? "As of " + K.esc(c.date) + " (snapshot; the NOAA page has today's)" : ""];
    } });
  var REEF = [["coral", "Coral reef (barrier, fringing or sponge)", "🪸", "#ff8a80"], ["atoll", "Atoll", "🏝️", "#4dd0e1"],
    ["reef", "Other reef with a Wikipedia article", "🪨", "#90a4ae"], ["hole", "Blue hole or sea cave", "🕳️", "#1e88e5"],
    ["kelp", "Kelp forest or seagrass meadow", "🌿", "#66bb6a"], ["seep", "Cold seep or brine pool", "🫧", "#b39ddb"]];
  var NAME = {};
  REEF.forEach((x) => { NAME[x[0]] = x[1]; });
  var RA = 'Reefs: <a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a>';
  WK.pointLayer({ id: "reefs", file: "reefs", name: "Reefs & underwater", icon: "🪸", group: "Ocean", kids: true,
    tip: "Coral reefs, atolls, blue holes, kelp forests, cold seeps and other notable reefs (Wikidata)",
    attrib: RA, src: ["Wikidata", "https://www.wikidata.org/"], srcOf: WK.srcOf,
    layers: REEF.map((x) => { return { id: "reef-" + x[0], codes: [x[0]], color: x[3], emoji: x[2], name: x[1] }; }),
    title: (r) => { return r.name || "Reef"; },
    lines: (r, k) => { return [K.esc(NAME[k] || "Reef"), WK.place(r), WK.wikiLine(r)]; } });
})();
