// workspace/whereisthesun/mtg-stores.js
/* SUNNY Fun & Games: Magic: The Gathering WPN stores (opt190/opt191).
 * Data: public Wizards locator scrape + Scryfall sets + tiny Wizards key-art thumbs.
 * Past prereleases: accumulate-merge history (locator has no past API).
 * Off by default. Kids: Prerelease / FNM / hosted past. Schedule panel filters by set. */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers;
  if (!K || !L) return;
  var SRC = "mtg-src", DOT = "mtg-dot", STAR = "mtg-star";
  var DATA = "data/mtg-stores.json?v=ad0f54c3";
  var SETS = "data/mtg-sets.json?v=91fc2e44";
  var meta = null, setCat = null, pMap = null, filterSet = "";
  var panelEl = null, scheduleBtn = null;
  var KIDS = [
    { id: "mtg-pre", name: "Prerelease (WPN partners)", dflt: true, kind: "pre" },
    { id: "mtg-past", name: "Hosted a past prerelease", dflt: true, kind: "past" },
    { id: "mtg-fnm-cmd", name: "FNM · Commander", dflt: true, kind: "fnm", fmt: "Commander" },
    { id: "mtg-fnm-std", name: "FNM · Standard", dflt: true, kind: "fnm", fmt: "Standard" },
    { id: "mtg-fnm-oth", name: "FNM · other formats", dflt: true, kind: "fnm", fmt: "other" }
  ];
  function kidOn(id, dflt) {
    try {
      var v = localStorage.getItem("sunny-L-" + id);
      return v == null ? dflt : v === "1";
    } catch (e) { return dflt; }
  }
  function setByCode(code) {
    if (!setCat || !code) return null;
    for (var i = 0; i < setCat.sets.length; i++) if (setCat.sets[i].code === code) return setCat.sets[i];
    return null;
  }
  function want(s) {
    if (filterSet) {
      var sets = s.prereleaseSets || [];
      if (sets.indexOf(filterSet) < 0) return false;
    }
    var anyKid = false, show = false;
    var list = s.fnmFormats || [];
    KIDS.forEach((k) => {
      if (!kidOn(k.id, k.dflt)) return;
      anyKid = true;
      if (k.kind === "pre") { if (s.partner) show = true; }
      else if (k.kind === "past") {
        if ((s.prereleasePast && s.prereleasePast.length) || (s.pastCount > 0)) show = true;
      }
      else if (k.kind === "fnm" && s.fnm) {
        if (k.fmt === "other") {
          if (!list.length || list.every((f) => { return f !== "Commander" && f !== "Standard"; })) show = true;
        } else if (list.indexOf(k.fmt) >= 0) show = true;
      }
    });
    return anyKid ? show : !!(s.partner);
  }
  function toFeats(stores) {
    return stores.filter(want).map((s) => {
      var sets = (s.prereleaseSets || []).join(",");
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lon, s.lat] },
        properties: {
          id: s.id, name: s.name, addr: s.addr || "", phone: s.phone || "", web: s.web || "",
          partner: s.partner ? 1 : 0, legendary: s.legendary ? 1 : 0,
          fnm: s.fnm ? 1 : 0, prerelease: s.prerelease ? 1 : 0,
          formats: (s.fnmFormats || []).join(", "),
          sets: sets,
          pastCount: (s.prereleasePast || []).length,
          preJson: JSON.stringify(s.prereleaseNext || []),
          pastJson: JSON.stringify(s.prereleasePast || []),
          fnmJson: JSON.stringify(s.fnmNext || [])
        }
      };
    });
  }
  function redraw(map) {
    if (!map.getSource(SRC) || !meta) return;
    map.getSource(SRC).setData(K.fc(toFeats(meta.stores || [])));
    syncFilterChip();
  }
  function ensure(map) {
    if (!map.getSource(SRC)) {
      map.addSource(SRC, {
        type: "geojson", data: K.fc(),
        attribution: '<a href="https://locator.wizards.com/" target="_blank" rel="noopener">Wizards Store &amp; Event Locator</a>'
      });
    }
    if (!map.getLayer(DOT)) {
      map.addLayer({
        id: DOT, type: "circle", source: SRC,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 2.5, 10, 6, 14, 8],
          "circle-color": ["case",
            ["==", ["get", "prerelease"], 1], "#c9a227",
            ["==", ["get", "fnm"], 1], "#5b4fc9",
            "#2f9e6b"],
          "circle-stroke-color": "#101418", "circle-stroke-width": 0.9
        }
      }, K.before(map));
    }
    if (!map.getLayer(STAR)) {
      map.addLayer({
        id: STAR, type: "symbol", source: SRC,
        filter: ["==", ["get", "legendary"], 1],
        layout: { "text-field": "★", "text-size": 12, "text-offset": [0.7, -0.7], "text-allow-overlap": true },
        paint: { "text-color": "#ffd45a", "text-halo-color": "#101418", "text-halo-width": 1 }
      }, K.before(map));
    }
  }
  function loadAll() {
    return Promise.all([
      meta ? Promise.resolve(meta) : K.loadJson(DATA).then((d) => { meta = d; return d; }),
      setCat ? Promise.resolve(setCat) : K.loadJson(SETS).then((d) => { setCat = d; return d; }).catch(() => { setCat = { sets: [] }; return setCat; })
    ]);
  }
  function apply(map, on) {
    K.vis(map, [DOT, STAR], on);
    if (!on) { filterSet = ""; closeSchedule(); return; }
    ensure(map);
    K.vis(map, [DOT, STAR], L.isOn("mtg"));
    loadAll().then(() => { redraw(map); mountScheduleBtn(); }).catch(() => {});
  }
  function chip(text, cls) {
    return '<span class="mtg-chip' + (cls ? " " + cls : "") + '">' + text + "</span>";
  }
  function thumbHtml(set, big) {
    if (!set) return "";
    var src = set.thumb || set.icon;
    if (!src) return '<span class="mtg-thumb mtg-thumb-empty" aria-hidden="true"></span>';
    return '<img class="mtg-thumb' + (big ? " mtg-thumb-lg" : "") + '" src="' + K.esc(src) + '" alt="" loading="lazy" decoding="async" width="' + (big ? 96 : 48) + '" height="' + (big ? 50 : 26) + '"/>';
  }
  function fmtDate(iso) {
    if (!iso) return "";
    var p = iso.split("-");
    if (p.length < 3) return iso;
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months[+p[1] - 1] + " " + (+p[2]) + ", " + p[0];
  }
  function weekendLabel(set) {
    if (!set || !set.prerelease) return "";
    var a = set.prerelease.start, b = set.prerelease.end;
    if (!a) return "";
    if (set.observedDates && set.observedDates.length) {
      return set.observedDates.slice(0, 4).join(" · ");
    }
    return fmtDate(a) + " – " + fmtDate(b);
  }
  function parseJson(s) {
    try { return JSON.parse(s || "[]"); } catch (e) { return []; }
  }
  function cardHtml(p) {
    var pre = parseJson(p.preJson);
    var past = parseJson(p.pastJson);
    var fnm = parseJson(p.fnmJson);
    var chips = [];
    if (p.partner) chips.push(chip("WPN", "mtg-chip-wpn"));
    if (p.legendary) chips.push(chip("★ Legendary", "mtg-chip-leg"));
    if (p.fnm) chips.push(chip("FNM" + (p.formats ? " · " + K.esc(p.formats) : ""), "mtg-chip-fnm"));
    var blocks = [];
    blocks.push('<div class="mtg-chips">' + chips.join("") + "</div>");
    if (past.length) {
      var pastChips = past.slice(0, 2).map((e) => {
        var label = ((e.name || e.set || "Set") + (e.date ? " · " + e.date : "")).trim();
        return chip(K.esc(label), "mtg-chip-host-past");
      });
      blocks.push('<div class="mtg-past-row" title="Last prereleases this store hosted (from locator history)"><span class="mtg-past-label">Past</span>' + pastChips.join("") + "</div>");
    }
    /* Group prerelease rows by set */
    var bySet = {};
    pre.forEach((e) => {
      var code = e.set || "_";
      (bySet[code] = bySet[code] || []).push(e);
    });
    var codes = Object.keys(bySet);
    if (codes.length) {
      blocks.push('<div class="mtg-sec"><button type="button" class="mtg-sec-h" aria-expanded="true">Prerelease ▾</button><div class="mtg-sec-b">');
      codes.forEach((code) => {
        var set = setByCode(code);
        var rows = bySet[code];
        var name = set ? set.name : (rows[0] && rows[0].title) || "Prerelease";
        var dates = rows.map((e) => { return ((e.date || "") + " " + (e.time || "")).trim(); }).filter(Boolean);
        blocks.push('<div class="mtg-pre">');
        blocks.push(thumbHtml(set, false));
        blocks.push('<div class="mtg-pre-body">');
        blocks.push('<div class="mtg-pre-name">' + K.esc(set ? set.name : name) + "</div>");
        if (set && set.released) blocks.push('<div class="mtg-pre-meta">Release ' + K.esc(fmtDate(set.released)) + "</div>");
        if (dates.length) {
          blocks.push('<div class="mtg-dates">' + dates.slice(0, 6).map((d) => { return chip(K.esc(d), "mtg-chip-date"); }).join("") + "</div>");
        }
        if (set && set.wizards) {
          blocks.push('<a class="mtg-link" href="' + K.esc(set.wizards) + '" target="_blank" rel="noopener">Wizards set page ↗</a>');
        }
        blocks.push("</div></div>");
      });
      blocks.push("</div></div>");
    } else if (p.prerelease) {
      blocks.push('<div class="mtg-muted">Prerelease partner — set not named in the locator snapshot.</div>');
    }
    if (fnm.length || p.fnm) {
      blocks.push('<div class="mtg-sec"><button type="button" class="mtg-sec-h" aria-expanded="false">Friday Night Magic ▸</button><div class="mtg-sec-b" hidden>');
      if (p.formats) blocks.push('<div class="mtg-chips">' + String(p.formats).split(", ").filter(Boolean).map((f) => { return chip(K.esc(f), "mtg-chip-fnm"); }).join("") + "</div>");
      fnm.slice(0, 4).forEach((e) => {
        blocks.push('<div class="mtg-row">' + K.esc(e.title || "FNM") +
          '<span class="mtg-row-meta">' + K.esc(((e.date || "") + " " + (e.time || "")).trim()) + "</span></div>");
      });
      blocks.push("</div></div>");
    }
    if (p.addr) blocks.push('<div class="mtg-addr">' + K.esc(p.addr) + "</div>");
    if (p.phone) blocks.push('<div class="mtg-addr">' + K.esc(p.phone) + "</div>");
    if (p.web) blocks.push('<a class="mtg-link" href="' + K.esc(p.web) + '" target="_blank" rel="noopener">Store website ↗</a>');
    var built = meta && meta.built ? meta.built : "";
    return '<div class="mtg-card"><div class="mtg-card-title">' + K.esc(p.name || "Magic store") + "</div>" +
      blocks.join("") +
      '<div class="pf-src">Source: <a href="https://locator.wizards.com/" target="_blank" rel="noopener">Wizards locator</a>' +
      (built ? " · snapshot " + K.esc(built) : "") +
      (past.length ? "; past from locator history snapshots" : "") +
      (setCat && setCat.source ? '; sets <a href="https://scryfall.com/sets" target="_blank" rel="noopener">Scryfall</a>' : "") +
      "</div></div>";
  }
  function bindCardToggles(root) {
    if (!root) return;
    root.querySelectorAll(".mtg-sec-h").forEach((btn) => {
      btn.addEventListener("click", () => {
        var body = btn.nextElementSibling;
        var open = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", open ? "false" : "true");
        btn.textContent = btn.textContent.replace(/[▾▸]/, open ? "▸" : "▾");
        if (body) body.hidden = open;
      });
    });
  }
  function mountScheduleBtn() {
    var input = document.querySelector('.lp-input[data-id="mtg"]');
    if (!input) return;
    var wrap = input.closest(".lp-fold");
    if (!wrap) return;
    if (wrap.querySelector(".mtg-sched-btn")) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "mtg-sched-btn";
    b.textContent = "Prerelease schedule";
    b.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); toggleSchedule(); });
    /* Sit on the fold itself (outside .lp-kids) so the button stays visible without expanding filters. */
    wrap.appendChild(b);
    scheduleBtn = b;
  }
  function closeSchedule() {
    if (panelEl) panelEl.hidden = true;
  }
  function openSchedule() {
    if (!panelEl) buildSchedule();
    panelEl.hidden = false;
    renderSchedule();
  }
  function toggleSchedule() {
    if (!panelEl || panelEl.hidden) openSchedule();
    else closeSchedule();
  }
  function buildSchedule() {
    panelEl = document.createElement("div");
    panelEl.id = "mtg-schedule";
    panelEl.className = "mtg-schedule";
    panelEl.hidden = true;
    panelEl.innerHTML = '<div class="mtg-sched-top"><strong>Prerelease schedule</strong>' +
      '<button type="button" class="mtg-sched-x" aria-label="Close">✕</button></div>' +
      '<div class="mtg-sched-filt"></div><div class="mtg-sched-list"></div>' +
      '<div class="mtg-sched-foot">Tap a set to show only stores running that prerelease. Art from Wizards product pages; dates from Scryfall + locator.</div>';
    document.body.appendChild(panelEl);
    panelEl.querySelector(".mtg-sched-x").addEventListener("click", closeSchedule);
  }
  function setFilter(code) {
    filterSet = code || "";
    if (pMap) redraw(pMap);
    if (!L.isOn("mtg") && filterSet) L && null;
    renderSchedule();
    syncFilterChip();
  }
  function syncFilterChip() {
    var bar = document.getElementById("mtg-filter-bar");
    if (!filterSet) {
      if (bar) bar.hidden = true;
      return;
    }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "mtg-filter-bar";
      bar.className = "mtg-filter-bar";
      document.body.appendChild(bar);
    }
    var set = setByCode(filterSet);
    bar.hidden = false;
    bar.innerHTML = '<span>Showing: <b>' + K.esc(set ? set.name : filterSet) + "</b> prerelease</span>" +
      '<button type="button" class="mtg-clear">Clear</button>';
    bar.querySelector(".mtg-clear").onclick = () => { setFilter(""); };
  }
  function renderSchedule() {
    if (!panelEl || !setCat) return;
    var list = panelEl.querySelector(".mtg-sched-list");
    var filt = panelEl.querySelector(".mtg-sched-filt");
    filt.innerHTML = filterSet
      ? '<button type="button" class="mtg-clear">Clear filter</button>'
      : '<span class="mtg-muted">Upcoming &amp; recent sets</span>';
    var clear = filt.querySelector(".mtg-clear");
    if (clear) clear.onclick = () => { setFilter(""); };
    var today = new Date().toISOString().slice(0, 10);
    list.textContent = "";
    (setCat.sets || []).forEach((set) => {
      /* Skip commander products with zero store events; keep those with events. */
      if (set.type === "commander" && !(set.stores > 0)) return;
      var row = document.createElement("button");
      row.type = "button";
      row.className = "mtg-sched-row" + (filterSet === set.code ? " is-on" : "");
      var stores = set.stores || 0;
      var soon = set.released >= today;
      row.innerHTML = thumbHtml(set, true) +
        '<span class="mtg-sched-main"><span class="mtg-sched-name">' + K.esc(set.name) +
        (soon ? "" : ' <span class="mtg-chip mtg-chip-past">released</span>') + "</span>" +
        '<span class="mtg-sched-meta">Prerelease ' + K.esc(weekendLabel(set) || "—") + "</span>" +
        '<span class="mtg-sched-meta">Release ' + K.esc(fmtDate(set.released)) +
        (stores ? " · " + stores + " CA events in snapshot" : "") + "</span></span>";
      row.addEventListener("click", () => {
        if (!L.isOn("mtg")) {
          /* turn the layer on so the filter is visible */
          var input = document.querySelector('.lp-input[data-id="mtg"]');
          if (input && !input.checked) input.click();
        }
        setFilter(filterSet === set.code ? "" : set.code);
        if (set.stores > 0 && pMap) {
          /* nudge toward Canada so filtered dots are in view */
          try { pMap.easeTo({ center: [-96, 56], zoom: 3.2, duration: 600 }); } catch (e) {}
        }
      });
      list.appendChild(row);
      if (set.wizards) {
        var a = document.createElement("a");
        a.className = "mtg-sched-wiz";
        a.href = set.wizards;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "Wizards page ↗";
        a.addEventListener("click", (ev) => { ev.stopPropagation(); });
        /* place under the row */
        var wrap = document.createElement("div");
        wrap.className = "mtg-sched-wrap" + (filterSet === set.code ? " is-on" : "");
        list.removeChild(row);
        wrap.appendChild(row);
        wrap.appendChild(a);
        list.appendChild(wrap);
      }
    });
  }
  L.add({
    id: "mtg", name: "Magic: The Gathering stores", icon: "🃏", group: "Fun & Games",
    tip: "Wizards Play Network stores in Canada. Upcoming + past prereleases (history) + FNM filters. Snapshot from the public locator.",
    taps: [DOT, STAR], dflt: false, kids: KIDS,
    legend: K.legKeys([
      ["#c9a227", "dot", "Prerelease upcoming"],
      ["#5b4fc9", "dot", "Friday Night Magic"],
      ["#2f9e6b", "dot", "WPN partner store"],
      ["#ffd45a", "dot", "★ Legendary"]
    ]),
    kidSet: () => { if (pMap) redraw(pMap); },
    apply: apply,
    note: (map, on) => {
      if (!on) return "";
      if (!meta) return "loading…";
      if (filterSet) {
        var s = setByCode(filterSet);
        return (s ? s.name : filterSet) + " filter";
      }
      return ((meta.counts && meta.counts.stores) || 0) + " CA stores";
    },
    attach: (map, on) => {
      pMap = map;
      map.on("idle", () => { if (L.isOn("mtg") && !map.getLayer(DOT)) apply(map, true); });
      (window.SunnyHoverName = window.SunnyHoverName || {})[DOT] = (g) => {
        return Promise.resolve([g.properties && g.properties.name || "Magic store", "Magic: The Gathering store"]);
      };
      window.SunnyHoverName[STAR] = window.SunnyHoverName[DOT];
      var open = (e) => {
        var p = e.features[0].properties;
        var ll = e.features[0].geometry.coordinates;
        loadAll().then(() => {
          var pp = K.show(map, ll, "", ["Magic store"], ["Wizards Store & Event Locator", "https://locator.wizards.com/"]);
          if (pp && pp.setHTML) {
            pp.setHTML(cardHtml(p));
            setTimeout(() => {
              bindCardToggles(document.getElementById("ip-peek") || document.querySelector(".mtg-card"));
            }, 0);
          }
        });
      };
      map.on("click", DOT, open);
      map.on("click", STAR, open);
      apply(map, on);
      /* remount schedule button when the blade rebuilds */
      var mo = new MutationObserver(() => { if (L.isOn("mtg")) mountScheduleBtn(); });
      if (document.body) mo.observe(document.body, { childList: true, subtree: true });
    }
  });
  window.SunnyMtg = { setFilter: setFilter, getFilter: () => { return filterSet || ""; }, openSchedule: openSchedule };
})();
