// workspace/whereisthesun/info-panel.js
/* SUNNY right-side info panel (opt95). A triangle tab on the right edge folds it out, mirroring the
 * layers sidebar on the left. Nothing floats over the map any more: every MapLibre popup any layer
 * opens is shown here as a card instead. Cards opened by the same tap stack into one merged card,
 * so stacked layers (geology under Crown Land, say) all show their details together.
 * Other parts add text blocks with SunnyInfo.section(id, title, html) (the Tonight block uses it).
 * Closed by default, remembers open or closed, and shows a small dot when there is new info. */
(() => {
  "use strict";
  var panel, body, cardsEl, secEl, tab, dot;
  var cards = [];
  var tapGen = 0;
  var lastGen = -1;
  var sections = {};
  var KEY = "sunny-ip-open";
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt) e.textContent = txt;
    return e;
  }
  function isOpen() {
    return panel && panel.classList.contains("is-open");
  }
  function setOpen(on) {
    if (!panel) build();
    panel.classList.toggle("is-open", on);
    tab.textContent = on ? "›" : "‹";
    tab.appendChild(dot);
    tab.setAttribute("aria-expanded", on ? "true" : "false");
    if (on) dot.hidden = true;
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) {}
  }
  function news() {
    if (!isOpen()) dot.hidden = false;
  }
  function build() {
    panel = el("aside", "ip-panel");
    panel.id = "ip-panel";
    panel.setAttribute("aria-label", "Info");
    tab = el("button", "ip-tab");
    tab.id = "ip-tab";
    tab.type = "button";
    tab.setAttribute("aria-label", "Show or hide the info panel");
    dot = el("span", "ip-dot");
    dot.hidden = true;
    var head = el("div", "ip-head", "Info");
    body = el("div", "ip-body");
    cardsEl = el("div", "ip-cards");
    secEl = el("div", "ip-secs");
    var hint = el("div", "ip-hint", "Tap anything on the map to see its details here.");
    body.appendChild(cardsEl);
    body.appendChild(hint);
    body.appendChild(secEl);
    panel.appendChild(tab);
    panel.appendChild(head);
    panel.appendChild(body);
    document.body.appendChild(panel);
    tab.addEventListener("click", () => { setOpen(!isOpen()); });
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}
    setOpen(saved === "1");
    document.addEventListener("pointerdown", (e) => {
      if (!panel.contains(e.target)) tapGen++;
    }, true);
  }
  function renderCards() {
    cardsEl.textContent = "";
    var live = cards.filter((c) => { return c.html; });
    if (!live.length) return;
    var box = el("div", "ip-card");
    var x = el("button", "ip-x", "×");
    x.type = "button";
    x.setAttribute("aria-label", "Close");
    x.addEventListener("click", () => { cards.slice().forEach((c) => { c.p.remove(); }); });
    box.appendChild(x);
    live.forEach((c, i) => {
      var part = el("div", "ip-part");
      if (i) part.classList.add("ip-more");
      part.innerHTML = c.html;
      part.querySelectorAll("a").forEach((a) => { a.target = "_blank"; a.rel = "noopener"; });
      box.appendChild(part);
    });
    cardsEl.appendChild(box);
  }
  function put(p) {
    if (!panel) build();
    if (lastGen !== tapGen) {
      cards.forEach((c) => { if (c.p !== p) c.p._sOpen = false; });
      cards = cards.filter((c) => { return c.p === p; });
      lastGen = tapGen;
    }
    var hit = cards.filter((c) => { return c.p === p; })[0];
    if (hit) hit.html = p._sHtml;
    else cards.push({ p: p, html: p._sHtml });
    renderCards();
    if (Date.now() - (window.sunnyPinTapAt || 0) > 1500) setOpen(true);
  }
  function drop(p) {
    cards = cards.filter((c) => { return c.p !== p; });
    if (cardsEl) renderCards();
  }
  function patch() {
    var P = window.maplibregl && window.maplibregl.Popup && window.maplibregl.Popup.prototype;
    if (!P || P._sunny) return;
    P._sunny = true;
    Object.assign(P, {
      setHTML(h) {
        this._sHtml = h;
        if (this._sOpen) put(this);
        return this;
      },
      setText(t) {
        return this.setHTML(String(t).replace(/[&<>]/g, (c) => { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }));
      },
      setDOMContent(n) {
        var d = document.createElement("div");
        d.appendChild(n);
        return this.setHTML(d.innerHTML);
      },
      addTo(map) {
        this._map = map;
        this._sOpen = true;
        put(this);
        return this;
      },
      isOpen() {
        return !!this._sOpen;
      },
      remove() {
        this._sOpen = false;
        drop(this);
        if (this.fire && window.maplibregl.Event) this.fire(new window.maplibregl.Event("close"));
        return this;
      },
      setMaxWidth() {
        return this;
      }
    });
  }
  function section(id, title, html) {
    if (!panel) build();
    var s = sections[id];
    if (!html) {
      if (s) { s.remove(); delete sections[id]; }
      return;
    }
    if (!s) {
      s = el("section", "ip-sec");
      sections[id] = s;
      secEl.appendChild(s);
    }
    var next = (title ? "<h3>" + title + "</h3>" : "") + html;
    if (s._h === next) return;
    var first = s._h == null;
    s._h = next;
    s.innerHTML = next;
    s.querySelectorAll("a").forEach((a) => { a.target = "_blank"; a.rel = "noopener"; });
    if (first) news();
  }
  function srcLink(text, url) {
    return '<div class="pf-src">Source: <a href="' + String(url).replace(/"/g, "&quot;") + '" target="_blank" rel="noopener">' + text + "</a></div>";
  }
  patch();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { patch(); if (!panel) build(); });
  else build();
  window.SunnyInfo = { section: section, open: setOpen, isOpen: isOpen, src: srcLink };
})();
