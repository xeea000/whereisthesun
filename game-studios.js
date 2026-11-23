// workspace/whereisthesun/game-studios.js
/* SUNNY Fun & Games: game development studios of the world (t436u, t437u, t439u).
 * Built by tools/build-game-studios.py from Wikidata (CC0), the Wikipedia list of video game
 * developers and OpenStreetMap offices (ODbL). Tiers come only from stated facts: an employee
 * count with its year, a parent company, or an outsourcing description. Nothing is guessed. */
(() => {
  "use strict";
  var K = window.SunnyKit, WK = window.SunnyWorldKit;
  if (!K || !WK) return;
  var TIER = {
    pub: "Publisher or holding company", aaa: "AAA / major studio", mid: "Mid-size studio", indie: "Indie / small studio",
    out: "Outsourcing & co-development", unk: "Size unknown", closed: "Closed studio", former: "Former location"
  };
  var link = (u, t) => { return '<a href="' + K.esc(u) + '" target="_blank" rel="noopener">' + K.esc(t) + "</a>"; };
  var wd = (q, t) => { return q ? link("https://www.wikidata.org/wiki/" + q, t) : K.esc(t); };
  var host = (u) => { return String(u || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, ""); };
  function lines(r, k) {
    var where = [r.city, r.country].filter(Boolean).map(K.esc).join(", ");
    var out = [];
    if (k === "former") {
      out.push(K.esc(r.note || "Former location"));
    } else {
      out.push("<b>" + TIER[k] + "</b>" + (r.why ? " · " + K.esc(r.why) : ""));
    }
    if (where) out.push(where + (r.prec === "c" ? " <small>(city-level pin)</small>" : ""));
    if (r.parent) out.push((k === "former" ? "Company: " : "Part of ") + wd(r.pq, r.parent));
    if (k !== "former" && r.note) out.push(K.esc(r.note));
    if (r.founded) out.push("Founded " + K.esc(r.founded));
    if (r.formerly) out.push("Formerly " + K.esc(String(r.formerly).split("|").join(", ")));
    if (r.games) out.push("Games include: " + K.esc(String(r.games).split("|").join(", ")));
    if (r.web) out.push(link(r.web, host(r.web)));
    out.push(WK.wikiLine(r));
    return out;
  }
  WK.pointLayer({
    id: "gamedev", file: "gamedev", name: "Game dev studios", icon: "🎮", group: "Fun & Games", kids: true,
    tip: "Video game developers, publishers and outsourcing houses worldwide, sized from Wikidata employee counts and parent companies",
    attrib: 'Game studios: <a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a>, ' +
      '<a href="https://en.wikipedia.org/wiki/List_of_video_game_developers" target="_blank" rel="noopener">Wikipedia</a>, ' +
      '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    src: ["Wikidata", "https://www.wikidata.org/"],
    srcOf: (r) => {
      if (/^https?:/.test(r.src || "")) return ["Public record", r.src];
      if (r.qid) return ["Wikidata " + r.qid, "https://www.wikidata.org/wiki/" + r.qid];
      if (/^osm:/.test(r.src || "")) return ["OpenStreetMap", "https://www.openstreetmap.org/" + r.src.slice(4)];
      return ["Wikipedia list of video game developers", "https://en.wikipedia.org/wiki/List_of_video_game_developers"];
    },
    layers: [
      { id: "gd-pub", codes: ["pub"], color: "#a855f7", emoji: "🏢", name: "Publishers & holding companies" },
      { id: "gd-aaa", codes: ["aaa"], color: "#e5484d", emoji: "🎮", name: "AAA / major" },
      { id: "gd-mid", codes: ["mid"], color: "#f59e0b", emoji: "🕹️", name: "Mid-size" },
      { id: "gd-indie", codes: ["indie"], color: "#22a55a", emoji: "👾", name: "Indie / small" },
      { id: "gd-out", codes: ["out"], color: "#2b9fd8", emoji: "🛠️", name: "Outsourcing & co-dev" },
      { id: "gd-unk", codes: ["unk"], color: "#8a94a3", emoji: "❔", name: "Size unknown" },
      { id: "gd-closed", codes: ["closed"], color: "#5b6270", emoji: "🪦", name: "Closed studios", dflt: false },
      { id: "gd-former", codes: ["former"], color: "#9aa3ad", emoji: "📦", name: "Former locations", dflt: false, opacity: 0.55 }
    ],
    foot: () => {
      return '<div class="ls-row"><small>Publishers: game publishers and holding groups at their head offices. ' +
        "AAA: 250+ staff, or owned by a major publisher. Mid-size: 50–249 staff. Indie: under 50 staff. " +
        "Staff counts are Wikidata's latest. Outsourcing: art, porting, localisation, QA and co-development houses. " +
        "No stated size goes to Size unknown. Former locations are faded and come with their years.</small></div>";
    },
    title: (r) => { return r.name || "Game studio"; },
    lines: lines
  });
})();
