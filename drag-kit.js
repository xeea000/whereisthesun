// workspace/whereisthesun/drag-kit.js
/* SUNNY t370u: one small shared gesture helper for the tap card and both side panels.
 * Card: long-press (400 ms, finger held still) on its header, title row or footer, then drag to move it.
 *   Moving more than 8 px before the hold ends cancels, so a swipe still scrolls; buttons, links and
 *   inputs never start a drag; a second finger cancels. A mouse drags the same handles at once.
 *   The spot you choose is kept for this session and clamped to the visible screen.
 * Panels: the edge tab is the grip. Tap still opens/closes. Drag up/down moves the panel up/down;
 *   drag outward/inward makes an open panel wider/narrower (dragging out also opens a closed one). */
(() => {
  "use strict";
  var HOLD_MS = 400, SLOP = 8, MOVE = 6, PAD = 6;
  var SS = window.sessionStorage;
  var get = (k) => { try { return JSON.parse(SS.getItem("sunny-drag-" + k) || "null"); } catch (e) { return null; } };
  var put = (k, v) => { try { SS.setItem("sunny-drag-" + k, JSON.stringify(v)); } catch (e) {} };
  var view = () => {
    var v = window.visualViewport;
    return v ? { x: v.offsetLeft, y: v.offsetTop, w: v.width, h: v.height } : { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
  };
  var clamp = (n, a, b) => { return Math.max(a, Math.min(b, n)); };
  var INTERACTIVE = "a,button,input,select,textarea,summary,label,[role=button],[contenteditable]";
  var CARD_HANDLES = ".tp-ll, .mtg-card-head, .pk-foot";
  /* tap card: user-chosen spot, clamped to the visible screen */
  var cardPos = get("card");
  function placeCard(peek) {
    if (!peek || !cardPos) return false;
    var v = view();
    peek.style.maxHeight = Math.round(Math.min(v.h - 2 * PAD, v.h * (v.w <= 700 ? 0.3 : 0.42))) + "px"; /* same caps as peek-place */
    var w = peek.offsetWidth, h = peek.offsetHeight;
    var left = clamp(cardPos.left, v.x + PAD, v.x + v.w - w - PAD);
    var top = clamp(cardPos.top, v.y + PAD, v.y + v.h - Math.min(h, v.h - 2 * PAD) - PAD);
    peek.style.left = Math.round(left) + "px";
    peek.style.top = Math.round(top) + "px";
    return true;
  }
  /* side panels: saved width and vertical shift */
  var SIDES = { "lp-tab": { panel: ".lp-panel", dir: 1, key: "lp" }, "ip-tab": { panel: ".ip-panel", dir: -1, key: "ip" } };
  function limits() {
    var v = view();
    return { minW: 96, maxW: Math.round(Math.min(v.w * 0.72, v.w - 72)) };
  }
  function applyPanel(side, panel) {
    var s = get(side.key);
    if (!s || !panel) return;
    var L = limits();
    if (s.w) { var w = clamp(s.w, L.minW, L.maxW); panel.style.width = w + "px"; panel.style.maxWidth = w + "px"; }
    if (s.dy != null) {
      var cs = panel.style; cs.top = ""; cs.bottom = "";
      var r = getComputedStyle(panel), t0 = parseFloat(r.top) || 0, b0 = parseFloat(r.bottom) || 0;
      var dy = clamp(s.dy, PAD - t0, b0 - PAD);
      cs.top = t0 + dy + "px"; cs.bottom = b0 - dy + "px";
    }
  }
  function applyAll() {
    Object.keys(SIDES).forEach((id) => { applyPanel(SIDES[id], document.querySelector(SIDES[id].panel)); });
    var peek = document.getElementById("ip-peek");
    if (peek && !peek.hidden) placeCard(peek);
  }
  /* one gesture tracker for card and panel tabs */
  var g = null; /* {id, kind, x0, y0, timer, active, el, side, start} */
  var swallowClick = false;
  function end() {
    if (!g) return;
    clearTimeout(g.timer);
    if (g.active) {
      document.body.classList.remove("sk-dragging");
      if (g.el) g.el.classList.remove("is-dragging");
      if (g.kind === "card") put("card", cardPos);
      if (g.kind === "panel") put(g.side.key, g.save);
      swallowClick = true; setTimeout(() => { swallowClick = false; }, 0);
    }
    try { if (g.cap && g.cap.hasPointerCapture(g.id)) g.cap.releasePointerCapture(g.id); } catch (e) {}
    g = null;
  }
  function activate() {
    if (!g) return;
    g.active = true;
    document.body.classList.add("sk-dragging");
    if (g.el) g.el.classList.add("is-dragging");
    try { g.cap.setPointerCapture(g.id); } catch (e) {}
    if (g.kind === "card") {
      var r = g.el.getBoundingClientRect();
      g.start = { left: r.left, top: r.top };
    } else {
      var p = g.panel, cs = getComputedStyle(p);
      g.start = { w: p.getBoundingClientRect().width, top: parseFloat(cs.top) || 0, bottom: parseFloat(cs.bottom) || 0, open: p.classList.contains("is-open") };
      var s = get(g.side.key) || {};
      g.save = { w: s.w || null, dy: s.dy || 0 };
      g.dy0 = g.save.dy;
    }
  }
  function onDown(e) {
    if (g) { end(); return; } /* a second finger cancels */
    if (e.button > 0) return;
    var t = e.target;
    var tab = t.closest && t.closest("#lp-tab, #ip-tab");
    if (tab) {
      var side = SIDES[tab.id], panel = document.querySelector(side.panel);
      if (!panel) return;
      g = { id: e.pointerId, kind: "panel", x0: e.clientX, y0: e.clientY, el: panel, panel: panel, side: side, cap: tab, active: false };
      return; /* a handle: drag starts after a small move, no hold needed */
    }
    var peek = t.closest && t.closest("#ip-peek");
    if (!peek || peek.hidden) return;
    if (t.closest(INTERACTIVE)) return;
    var handle = t === peek || t.closest(CARD_HANDLES);
    if (!handle) return; /* card body content stays a scroll area */
    g = { id: e.pointerId, kind: "card", x0: e.clientX, y0: e.clientY, el: peek, cap: peek, active: false, mouse: e.pointerType === "mouse" };
    if (!g.mouse) g.timer = setTimeout(activate, HOLD_MS);
  }
  function onMove(e) {
    if (!g || e.pointerId !== g.id) return;
    var dx = e.clientX - g.x0, dy = e.clientY - g.y0, far = Math.abs(dx) + Math.abs(dy);
    if (!g.active) {
      if (g.kind === "card" && !g.mouse) { if (far > SLOP) end(); return; } /* moved before the hold: it was a scroll */
      if (far < MOVE) return;
      activate();
    }
    if (e.cancelable) e.preventDefault();
    if (g.kind === "card") {
      cardPos = { left: g.start.left + dx, top: g.start.top + dy };
      placeCard(g.el);
      return;
    }
    var L = limits(), side = g.side, p = g.panel;
    var horiz = Math.abs(dx) > Math.abs(dy);
    if (horiz || g.axis === "x") {
      g.axis = g.axis || "x";
      var out = dx * side.dir;
      if (!g.start.open) {
        if (out > MOVE) { var tb = document.getElementById(side.key + "-tab"); if (tb) tb.click(); g.start.open = true; g.start.w = p.getBoundingClientRect().width; g.x0 = e.clientX; }
        return;
      }
      var w = clamp(Math.round(g.start.w + out), L.minW, L.maxW);
      p.style.width = w + "px"; p.style.maxWidth = w + "px"; g.save.w = w;
    } else {
      g.axis = g.axis || "y";
      var d = clamp(g.dy0 + dy, -(g.start.top - g.dy0 - PAD), g.start.bottom + g.dy0 - PAD);
      var t0 = g.start.top - g.dy0, b0 = g.start.bottom + g.dy0;
      p.style.top = t0 + d + "px"; p.style.bottom = b0 - d + "px"; g.save.dy = d;
    }
  }
  /* a still finger held on a handle must not start a native scroll once the hold has fired */
  document.addEventListener("touchmove", (e) => { if (g && g.active && e.cancelable) e.preventDefault(); }, { passive: false, capture: true });
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("pointermove", onMove, { capture: true, passive: false });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach((n) => { document.addEventListener(n, (e) => { if (g && e.pointerId === g.id) end(); }, true); });
  document.addEventListener("click", (e) => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); swallowClick = false; } }, true);
  window.addEventListener("blur", end);
  var reQ = 0;
  var re = () => { if (!reQ) reQ = requestAnimationFrame(() => { reQ = 0; applyAll(); }); }; /* one settle per frame */
  window.addEventListener("resize", re);
  window.addEventListener("orientationchange", () => { setTimeout(re, 250); });
  if (window.visualViewport) window.visualViewport.addEventListener("resize", re);
  var boot = () => { if (document.querySelector(".lp-panel") || document.querySelector(".ip-panel")) applyAll(); else setTimeout(boot, 800); };
  boot();
  window.SunnyDrag = { placeCard: placeCard, hasCardPos: () => !!cardPos, applyPanels: applyAll,
    reset: () => { cardPos = null; ["card", "lp", "ip"].forEach((k) => { try { SS.removeItem("sunny-drag-" + k); } catch (e) {} });
      document.querySelectorAll(".lp-panel, .ip-panel").forEach((p) => { p.style.width = p.style.maxWidth = p.style.top = p.style.bottom = ""; }); } };
})();
