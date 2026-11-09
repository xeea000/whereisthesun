// workspace/whereisthesun/mtg-stores.js
/* SUNNY Fun & Games: Magic: The Gathering WPN stores (opt190–opt198).
 * Data: public Wizards locator scrape + Scryfall sets + tiny Wizards key-art thumbs.
 * Past prereleases: accumulate-merge history (locator has no past API).
 * Busyness: Quiet→Packed estimate; ONE ordinal range slider (not boolean kids) +
 * map dots coloured by level. Kids: Prerelease / FNM / hosted past — visibility via
 * SunnyKit.kids (opt199: zero subset kids on → show nothing). */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers;
  if (!K || !L) return;
  var SRC = "mtg-src", DOT = "mtg-dot", STAR = "mtg-star";
  var DATA = "data/mtg-stores.json?v=4be140c0";
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
  var BUSY_LEVELS = ["Quiet", "Steady", "Lively", "Busy", "Packed"];
  var BUSY_COLORS = ["#3d9b6e", "#4a9bb8", "#c9a227", "#d4782e", "#d44545"];
  var busyMin = 0, busyMax = 4; /* inclusive ordinal range; default full */
  function setByCode(code) {
    if (!setCat || !code) return null;
    for (var i = 0; i < setCat.sets.length; i++) if (setCat.sets[i].code === code) return setCat.sets[i];
    return null;
  }
  function busyRankOf(s) {
    if (s && s.busy && typeof s.busy.rank === "number") return s.busy.rank;
    return -1;
  }
  function inBusyRange(rank) {
    if (rank < 0) return busyMin === 0 && busyMax === 4; /* unknown: only when full range */
    return rank >= busyMin && rank <= busyMax;
  }
  /* t382u: a listed prerelease whose day has gone by is a past one. The snapshot's "next" list is split by the viewer's local
   * date, so the Past switch and the card's Past row hold what already happened and Prerelease holds what is ahead. */
  function localDay() {
    var d = new Date();
    var two = (n) => { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
  }
  function splitPre(s) {
    var today = localDay();
    var next = [];
    var gone = [];
    (s.prereleaseNext || []).forEach((e) => {
      var day = String(e.iso || "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day < today) gone.push({ set: e.set, name: (setByCode(e.set) || {}).name, date: e.date, dateIso: day });
      else next.push(e);
    });
    gone.sort((a, b) => { return a.dateIso < b.dateIso ? 1 : a.dateIso > b.dateIso ? -1 : 0; });
    return { next: next, past: gone.concat(s.prereleasePast || []) };
  }
  function want(s) {
    if (filterSet) {
      var sets = s.prereleaseSets || [];
      if (sets.indexOf(filterSet) < 0) return false;
    }
    if (!inBusyRange(busyRankOf(s))) return false;
    var list = s.fnmFormats || [];
    /* opt199: SunnyKit.kids — zero subset kids checked → show nothing (no partner fallback) */
    return K.kids.matchAny(KIDS, (k) => {
      if (k.kind === "pre") return !!s.partner;
      if (k.kind === "past") return splitPre(s).past.length > 0;
      if (k.kind === "fnm" && s.fnm) {
        if (k.fmt === "other") {
          return !list.length || list.every((f) => { return f !== "Commander" && f !== "Standard"; });
        }
        return list.indexOf(k.fmt) >= 0;
      }
      return false;
    });
  }
  /* t382u: the star key shows only when the snapshot has a Legendary store to star */
  function anyLegendary() {
    return !!(meta && (meta.stores || []).some((x) => { return x.legendary; }));
  }
  function toFeats(stores) {
    return stores.filter(want).map((s) => {
      var sets = (s.prereleaseSets || []).join(",");
      var pre = splitPre(s);
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lon, s.lat] },
        properties: {
          id: s.id, name: s.name, addr: s.addr || "", phone: s.phone || "", web: s.web || "",
          partner: s.partner ? 1 : 0, legendary: s.legendary ? 1 : 0,
          fnm: s.fnm ? 1 : 0, prerelease: s.prerelease ? 1 : 0,
          formats: (s.fnmFormats || []).join(", "),
          sets: sets,
          pastCount: pre.past.length,
          busyLevel: (s.busy && s.busy.level) || "",
          busyRank: (s.busy && typeof s.busy.rank === "number") ? s.busy.rank : -1,
          busyJson: JSON.stringify(s.busy || null),
          preJson: JSON.stringify(pre.next),
          pastJson: JSON.stringify(pre.past),
          fnmJson: JSON.stringify(s.fnmNext || [])
        }
      };
    });
  }
  function redraw(map) {
    if (!map.getSource(SRC) || !meta) return;
    map.getSource(SRC).setData(K.fc(toFeats(meta.stores || [])));
    K.vis(map, [DOT, STAR], K.kids.parentShow(L.isOn("mtg"), KIDS));
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
          "circle-radius": K.markerScale.bind(map, DOT, "circle-radius",
            ["interpolate", ["linear"], ["zoom"], 3, 2.5, 10, 6, 14, 8]),
          "circle-color": ["match", ["get", "busyRank"],
            0, "#3d9b6e",
            1, "#4a9bb8",
            2, "#c9a227",
            3, "#d4782e",
            4, "#d44545",
            "#6a7380"],
          "circle-stroke-color": "#101418", "circle-stroke-width": 0.9
        }
      }, K.before(map));
    }
    if (!map.getLayer(STAR)) {
      map.addLayer({
        id: STAR, type: "symbol", source: SRC,
        filter: ["==", ["get", "legendary"], 1],
        layout: { "text-field": "★", "text-size": K.markerScale.bind(map, STAR, "text-size", 12, { layout: true }),
          "text-offset": [0.7, -0.7], "text-allow-overlap": true },
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
    /* opt220: parent on with every subset kid off → hide shared layers */
    var show = K.kids.parentShow(on, KIDS);
    K.vis(map, [DOT, STAR], show);
    if (!on) { filterSet = ""; closeSchedule(); return; }
    ensure(map);
    K.vis(map, [DOT, STAR], K.kids.parentShow(L.isOn("mtg"), KIDS));
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
  /* t369u: prerelease events grouped by the event's own local day: one day row, then indented time rows */
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function preDay(e) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(e.iso || ""); /* local wall time as listed; never re-zoned */
    if (!m) return { key: e.date || "", label: e.date || "Date not listed", sort: e.date || "" };
    var y = +m[1], mo = +m[2], d = +m[3];
    var wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
    return { key: m[1] + m[2] + m[3], label: DAYS[wd] + ", " + MONTHS[mo - 1] + " " + d, sort: m[1] + m[2] + m[3] + m[4] + m[5] };
  }
  /* t377u: each row links to the exact Wizards page its facts came from; only these two shapes are ever linked */
  var STORE_OK = /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\/[^\s"'<>]*$/i; /* hand-checked store event page (data/mtg-official.json) */
  var SRC_OK = /^https:\/\/locator\.wizards\.com\/en\/(?:event|store)\/\d{1,12}$/;
  function srcLink(e, storeId) {
    var u = SRC_OK.test(e.src || "") ? e.src : "", lab = "Source", tip = "Wizards event listing";
    if (!u && /^\d{1,12}$/.test(String(storeId || ""))) { u = "https://locator.wizards.com/en/store/" + storeId; lab = "Wizards store listing"; tip = lab; }
    if (!u) return "";
    var out = '<a class="mtg-src" href="' + K.esc(u) + '" target="_blank" rel="noopener noreferrer" title="' + tip + '">' + lab + " ↗</a>";
    var o = e.off || {};
    if (STORE_OK.test(o.url || "")) {
      out += '<a class="mtg-src" href="' + K.esc(o.url) + '" target="_blank" rel="noopener noreferrer" title="' + K.esc((o.match === "conflict" ? "Store page differs: " : "Store page agrees: ") + (o.evidence || "")) + '">Store page ↗</a>';
    }
    return out;
  }
  function preRow(e, storeId) {
    var bits = [];
    if (e.format && e.format !== "Other" && e.format !== "Not listed") bits.push(chip(K.esc(e.format), "mtg-chip-fmt"));
    if (e.teams) {
      var sure = /^Two-Headed Giant( · store page)?$/.test(e.teams) || /^Teams of \d+$/.test(e.teams);
      bits.push('<span class="mtg-chip mtg-chip-fmt mtg-chip-team' + (sure ? "" : " mtg-chip-unsure") + '" title="' + K.esc(e.teamEv || "") + '">' + K.esc(e.teams) + "</span>");
    }
    (e.notes || []).forEach((n) => { bits.push(chip(K.esc(n), "mtg-chip-note")); });
    if (e.fee) bits.push(chip(K.esc(e.fee) + " entry" + (e.feeStore ? " (Wizards) · store page " + K.esc(e.feeStore) : ""), "mtg-chip-note"));
    if (!bits.length) bits.push('<span class="mtg-muted">Format not listed</span>');
    return '<div class="mtg-prow"><span class="mtg-pwhen">' + K.esc(e.time || "Time not listed") + "</span>" + bits.join("") + srcLink(e, storeId) + "</div>";
  }
  function preDays(rows, storeId) {
    var list = rows.map((e, i) => { var d = preDay(e); return { e: e, d: d, i: i }; });
    list.sort((a, b) => { return a.d.sort < b.d.sort ? -1 : a.d.sort > b.d.sort ? 1 : a.i - b.i; });
    var out = [], cur = null;
    list.forEach((x) => {
      if (!cur || cur.key !== x.d.key) { cur = { key: x.d.key, label: x.d.label, rows: [] }; out.push(cur); }
      cur.rows.push(x.e);
    });
    return out.map((g) => {
      return '<div class="mtg-pday"><div class="mtg-pday-h">' + K.esc(g.label) + "</div>" + g.rows.map((e) => { return preRow(e, storeId); }).join("") + "</div>";
    }).join("");
  }
  function cardHtml(p) {
    var pre = parseJson(p.preJson);
    var past = parseJson(p.pastJson);
    var fnm = parseJson(p.fnmJson);
    var chips = [];
    if (p.partner) chips.push(chip("WPN", "mtg-chip-wpn"));
    if (p.legendary) chips.push(chip("★ Legendary", "mtg-chip-leg"));
    if (p.fnm) chips.push(chip("FNM" + (p.formats ? " · " + K.esc(p.formats) : ""), "mtg-chip-fnm"));
    var busy = null;
    try { busy = JSON.parse(p.busyJson || "null"); } catch (e) { busy = null; }
    if (busy && busy.level) {
      chips.push(chip(K.esc(busy.level), "mtg-chip-busy mtg-chip-busy-" + (busy.rank != null ? busy.rank : "x")));
    }
    var blocks = [];
    blocks.push('<div class="mtg-chips">' + chips.join("") + "</div>");
    if (past.length) {
      var pastChips = past.slice(0, 2).map((e) => {
        var label = ((e.name || e.set || "Set") + (e.date ? " · " + e.date : "")).trim();
        return chip(K.esc(label), "mtg-chip-host-past");
      });
      blocks.push('<div class="mtg-past-row" title="Last prereleases this store hosted (from Wizards locator listings)"><span class="mtg-past-label">Past</span>' + pastChips.join("") + "</div>");
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
        blocks.push('<div class="mtg-pre">');
        blocks.push(thumbHtml(set, false));
        blocks.push('<div class="mtg-pre-body">');
        blocks.push('<div class="mtg-pre-name">' + K.esc(name) + (set && set.released ? '<span class="mtg-pre-rel"> · ' + K.esc(fmtDate(set.released)) + "</span>" : "") + "</div>");
        blocks.push(preDays(rows.slice(0, 8), p.id));
        if (set && set.wizards) {
          blocks.push('<a class="mtg-link" href="' + K.esc(set.wizards) + '" target="_blank" rel="noopener">Wizards set page ↗</a>');
        }
        blocks.push("</div></div>");
      });
      blocks.push("</div></div>");
    } else if (p.prerelease && !past.length) {
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
    if (p.web) blocks.push('<a class="mtg-link" href="' + K.esc(p.web) + '" target="_blank" rel="noopener">Store website ↗</a>');
    var built = meta && meta.built ? meta.built : "";
    var call = p.phone && K.callBtn ? K.callBtn(p.phone, p.name) : "";
    return '<div class="mtg-card"><div class="mtg-card-head"><div class="mtg-card-title">' + K.esc(p.name || "Magic store") + "</div>" + call + "</div>" +
      blocks.join("") +
      '<div class="pf-src">Source: <a href="https://locator.wizards.com/" target="_blank" rel="noopener">Wizards locator</a>' +
      (built ? " · snapshot " + K.esc(built) : "") +
      (past.length ? "; past = listed prereleases whose day has gone by" : "") +
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
  function busyLabel() {
    if (busyMin === 0 && busyMax === 4) return "Quiet–Packed";
    if (busyMin === busyMax) return BUSY_LEVELS[busyMin];
    return BUSY_LEVELS[busyMin] + "–" + BUSY_LEVELS[busyMax];
  }
  function setBusyRange(lo, hi, silent) {
    lo = Math.max(0, Math.min(4, lo | 0));
    hi = Math.max(0, Math.min(4, hi | 0));
    if (lo > hi) { var t = lo; lo = hi; hi = t; }
    busyMin = lo; busyMax = hi;
    try {
      localStorage.setItem("sunny-mtg-busy-range", busyMin + "," + busyMax);
    } catch (e) {}
    syncBusyRangeUi();
    if (!silent && pMap) redraw(pMap);
  }
  function loadBusyRange() {
    try {
      var v = localStorage.getItem("sunny-mtg-busy-range");
      if (v) {
        var p = v.split(",");
        if (p.length === 2) setBusyRange(+p[0], +p[1], true);
      }
    } catch (e) {}
  }
  function syncBusyRangeUi() {
    var box = document.querySelector(".mtg-busy-range");
    if (!box) return;
    var lo = box.querySelector(".mtg-busy-lo");
    var hi = box.querySelector(".mtg-busy-hi");
    var val = box.querySelector(".mtg-busy-range-val");
    if (lo) lo.value = String(busyMin);
    if (hi) hi.value = String(busyMax);
    if (val) val.textContent = busyLabel();
    var fill = box.querySelector(".mtg-busy-range-fill");
    if (fill) {
      fill.style.left = (busyMin / 4 * 100) + "%";
      fill.style.width = ((busyMax - busyMin) / 4 * 100) + "%";
    }
  }
  function mountScheduleBtn() {
    var wrap = (L && L.ctrlHost) ? L.ctrlHost("mtg") : null;
    if (!wrap) {
      var input = document.querySelector('.lp-input[data-id="mtg"]');
      if (!input) return;
      var fold = input.closest(".lp-fold");
      wrap = fold && (fold.querySelector(".lp-ctrls") || fold);
    }
    if (!wrap) return;
    if (!wrap.querySelector(".mtg-sched-btn")) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "mtg-sched-btn";
      b.textContent = "Prerelease schedule";
      b.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); toggleSchedule(); });
      wrap.appendChild(b);
      scheduleBtn = b;
    }
    if (!wrap.querySelector(".mtg-busy-range")) {
      var box = document.createElement("div");
      box.className = "mtg-busy-range";
      box.innerHTML =
        '<div class="mtg-busy-range-lab">Busyness <span class="mtg-busy-range-val">' + busyLabel() + "</span></div>" +
        '<div class="mtg-busy-range-track" aria-hidden="true"><div class="mtg-busy-range-fill"></div></div>' +
        '<div class="mtg-busy-range-inputs">' +
        '<input type="range" class="mtg-busy-lo" min="0" max="4" step="1" value="' + busyMin + '" aria-label="Minimum busyness">' +
        '<input type="range" class="mtg-busy-hi" min="0" max="4" step="1" value="' + busyMax + '" aria-label="Maximum busyness">' +
        "</div>" +
        '<div class="mtg-busy-range-ticks" aria-hidden="true">' +
        BUSY_LEVELS.map((n, i) => { return '<span style="color:' + BUSY_COLORS[i] + '">' + n[0] + "</span>"; }).join("") +
        "</div>";
      wrap.appendChild(box);
      var onSlide = () => {
        var loEl = box.querySelector(".mtg-busy-lo");
        var hiEl = box.querySelector(".mtg-busy-hi");
        var lo = +loEl.value, hi = +hiEl.value;
        if (lo > hi) {
          if (document.activeElement === loEl) hi = lo;
          else lo = hi;
        }
        setBusyRange(lo, hi);
      };
      box.querySelector(".mtg-busy-lo").addEventListener("input", onSlide);
      box.querySelector(".mtg-busy-hi").addEventListener("input", onSlide);
      syncBusyRangeUi();
    }
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
    tip: "Wizards Play Network stores in Canada. Prereleases (upcoming + past history), FNM, and a Quiet→Busy estimate (StatsCan + nearby WPN density — not attendance).",
    taps: [DOT, STAR], dflt: false, kids: KIDS,
    legend: () => {
      if (!K.kids.anyOn(KIDS)) return "";
      return K.legKeys([
        ["#3d9b6e", "dot", "Quiet"],
        ["#4a9bb8", "dot", "Steady"],
        ["#c9a227", "dot", "Lively"],
        ["#d4782e", "dot", "Busy"],
        ["#d44545", "dot", "Packed"]
      ].concat(anyLegendary() ? [["#ffd45a", "dot", "★ Legendary"]] : []));
    },
    kidSet: () => { if (pMap) redraw(pMap); },
    apply: apply,
    note: (map, on) => {
      if (!on) return "";
      if (!meta) return "loading…";
      var bits = [];
      if (filterSet) {
        var s = setByCode(filterSet);
        bits.push((s ? s.name : filterSet) + " filter");
      }
      if (!(busyMin === 0 && busyMax === 4)) bits.push(busyLabel());
      if (bits.length) return bits.join(" · ");
      return ((meta.counts && meta.counts.stores) || 0) + " CA stores";
    },
    attach: (map, on) => {
      pMap = map;
      loadBusyRange();
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
  window.SunnyMtg = {
    setFilter: setFilter,
    getFilter: () => { return filterSet || ""; },
    openSchedule: openSchedule,
    getBusyRange: () => { return [busyMin, busyMax]; },
    setBusyRange: (lo, hi) => { setBusyRange(lo, hi); }
  };
})();
