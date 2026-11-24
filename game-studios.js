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
  /* opt308 (t442u): badge size by real headcount (default) or by real reported game revenue, log10 steps.
   * hl / rl in the points file are 10 x log10 of the headcount / revenue in USD; 0 means not known. */
  var L = window.SunnyLayers, MODE_KEY = "sunny-gamedev-scale";
  var mode = "head";
  try { if (localStorage.getItem(MODE_KEY) === "rev") mode = "rev"; } catch (e0) {}
  var HEAD = [[0, 0.85], [10, 1], [20, 1.3], [30, 1.65], [40, 2]], HEAD_NONE = 0.8;
  var REV = [[60, 1], [70, 1.3], [80, 1.65], [90, 2.05], [100, 2.5]], REV_NONE = 0.6;
  var curve = (pts, prop, none) => {
    var e = ["interpolate", ["linear"], ["get", prop]];
    pts.forEach((p) => { e.push(p[0], p[1]); });
    return ["case", [">", ["coalesce", ["get", prop], 0], 0], e, none];
  };
  var scale = () => { return mode === "rev" ? curve(REV, "rl", REV_NONE) : curve(HEAD, "hl", HEAD_NONE); };
  var fade = () => { return mode === "rev" ? ["case", [">", ["coalesce", ["get", "rl"], 0], 0], 1, 0.5] : 1; };
  var money = (m) => {
    m = +m;
    return m >= 1000 ? "$" + (Math.round(m / 100) / 10).toLocaleString("en-US") + " billion" : "$" + (Math.round(m * 10) / 10).toLocaleString("en-US") + " million";
  };
  function sizeLegend() {
    var dot = (f) => {
      var d = Math.round(16 * f);
      return '<span style="display:inline-block;width:' + d + "px;height:" + d + 'px;border-radius:50%;background:#c6c2b6;vertical-align:middle;margin:0 3px 0 6px"></span>';
    };
    if (mode === "rev") {
      return '<div class="ls-row gd-scale-leg"><small>Size by game revenue:' + dot(1) + "$1M" + dot(1.3) + "$10M" + dot(1.65) + "$100M" + dot(2.05) + "$1B" + dot(2.5) +
        "$10B+<br>Reported revenue from Wikipedia and Wikidata only. Studios with none recorded stay small and faded.</small></div>";
    }
    return '<div class="ls-row gd-scale-leg"><small>Size by headcount:' + dot(1) + "10" + dot(1.3) + "100" + dot(1.65) + "1k" + dot(2) +
      "10k+<br>Wikidata staff counts only. Unknown headcount stays base size.</small></div>";
  }
  function setMode(m) {
    mode = m === "rev" ? "rev" : "head";
    try { localStorage.setItem(MODE_KEY, mode); } catch (e1) {}
    if (layer.restyle) layer.restyle();
    var box = document.querySelector(".gd-scale");
    if (box) [].forEach.call(box.querySelectorAll("button"), (b) => { b.classList.toggle("is-on", b.dataset.m === mode); });
    var d = L && L.defs ? L.defs().find((x) => { return x.id === "gamedev"; }) : null;
    if (d && d._legEl && typeof d.legend === "function") d._legEl.innerHTML = d.legend() || "";
    document.dispatchEvent(new Event("change"));
  }
  function mountUi() {
    var hostEl = L && L.ctrlHost ? L.ctrlHost("gamedev") : null;
    if (!hostEl || hostEl.querySelector(".gd-scale")) return;
    var row = document.createElement("div");
    row.className = "lp-row lp-seg gd-scale";
    row.innerHTML = '<span class="hi-year-range-lab">Scale by</span><span class="lp-segs">' +
      '<button type="button" class="lp-ov" data-m="head">Headcount</button><button type="button" class="lp-ov" data-m="rev">Game revenue</button></span>';
    hostEl.appendChild(row);
    [].forEach.call(row.querySelectorAll("button"), (b) => {
      b.classList.toggle("is-on", b.dataset.m === mode);
      b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); setMode(b.dataset.m); });
    });
  }
  document.addEventListener("sunny-layers-ready", mountUi);
  setTimeout(mountUi, 400);
  window.SunnyGameScale = { get: () => { return mode; }, set: setMode };
  var host = (u) => { return String(u || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, ""); };
  function lines(r, k) {
    var where = [r.city, r.country].filter(Boolean).map(K.esc).join(", ");
    var out = [];
    if (k === "former") {
      out.push(K.esc(r.note || "Former location"));
    } else {
      var why = String(r.why || "").replace(/(^| · )[\d,]+ employees \([^)]*\)/, "");
      out.push("<b>" + TIER[k] + "</b>" + (why ? " · " + K.esc(why) : ""));
    }
    if (r.emp !== "" && r.emp != null) out.push("Headcount <b>" + (+r.emp).toLocaleString("en-US") + "</b> " + (r.empy ? "(" + K.esc(r.empy) + ", Wikidata)" : "(year not stated, Wikidata)"));
    if (r.rev !== "" && r.rev != null) {
      out.push("Game revenue <b>" + money(r.rev) + "</b>" + (r.revg ? " · " + K.esc(String(r.revg).split("|").join(", ")) : ""));
      out.push("<small>Revenue source: " + (r.revu ? link(r.revu, r.revs) : K.esc(r.revs)) + "</small>");
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
  var layer = {
    id: "gamedev", file: "gamedev", v: "opt309", scale: scale, fade: fade, /* bump when tools/build-game-studios.py output changes */ name: "Game dev studios", icon: "🎮", group: "Fun & Games", kids: true,
    tip: "Video game developers, publishers and outsourcing houses worldwide, sized by real headcount or reported game revenue",
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
      return '<div class="ls-row"><small>Publishers: game publishers with 3+ subsidiaries on Wikidata or 1,000+ staff, and groups that own 3+ studios on this map, at their head offices. ' +
        "AAA: 250+ staff, or owned by a major publisher. Mid-size: 50–249 staff. Indie: under 50 staff. " +
        "Staff counts are Wikidata's latest. Outsourcing: art, porting, localisation, QA and co-development houses. " +
        "No stated size goes to Size unknown. Former locations are faded and come with their years.</small></div>" + sizeLegend();
    },
    title: (r) => { return r.name || "Game studio"; },
    lines: lines
  };
  WK.pointLayer(layer);
})();
