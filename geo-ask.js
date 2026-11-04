// workspace/whereisthesun/geo-ask.js
/* SUNNY opt202/opt205: one shared GPS gate. Before every navigator.geolocation call, show a short
 * explainer card (confirm location / Not now). Skip the card when Permissions API state is granted.
 * "Not now" is session-only. Location is used client-side for map, weather and beaches (Open-Meteo
 * and similar receive coordinates from the browser), so the card does not claim device-only storage.
 * opt205: single in-flight ask (card + OS prompt at most once per page); hold SW auto-reload while
 * the card is up or after the user confirms, so a mid-prompt service-worker swap cannot reload. */
(() => {
  "use strict";
  var KEY = "sunny-geo-notnow";
  var card = null;
  var waiting = null;
  var inflight = null;
  var allowedThisPage = false;
  var holdUntil = 0;
  var holdListeners = [];
  var HOLD_AFTER_CONFIRM_MS = 60000;
  function sessionSkip() {
    try { return sessionStorage.getItem(KEY) === "1"; } catch (e) { return false; }
  }
  function setSessionSkip() {
    try { sessionStorage.setItem(KEY, "1"); } catch (e) {}
  }
  function notifyHold() {
    var fns = holdListeners.slice();
    for (var i = 0; i < fns.length; i++) {
      try { fns[i](); } catch (eN) {}
    }
  }
  function setHoldMs(ms) {
    var until = Date.now() + Math.max(0, ms || 0);
    if (until > holdUntil) holdUntil = until;
    notifyHold();
  }
  function clearHold() {
    holdUntil = 0;
    notifyHold();
  }
  function holdReload() {
    /* Card up, timer after confirm, or this page already confirmed location — never
     * let an SW takeover reload mid-flow or right after results land. */
    if (waiting || (card && !card.hidden)) return true;
    if (allowedThisPage) return true;
    return Date.now() < holdUntil;
  }
  function removeHoldListener(fn) {
    var next = [];
    for (var i = 0; i < holdListeners.length; i++) {
      if (holdListeners[i] !== fn) next.push(holdListeners[i]);
    }
    holdListeners = next;
  }
  function noop() {}
  function makeUnsub(fn) {
    return () => { removeHoldListener(fn); };
  }
  function onHoldChange(fn) {
    if (typeof fn !== "function") return noop;
    holdListeners.push(fn);
    return makeUnsub(fn);
  }
  function permGranted() {
    if (!navigator.permissions || !navigator.permissions.query) return Promise.resolve(false);
    return navigator.permissions.query({ name: "geolocation" }).then((r) => {
      return r && r.state === "granted";
    }).catch(() => { return false; });
  }
  function ensureCard() {
    if (card) return card;
    var el = document.createElement("div");
    el.id = "geo-ask";
    el.className = "geo-ask";
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-labelledby", "geo-ask-title");
    el.innerHTML =
      '<div class="geo-ask-card">' +
      '<p id="geo-ask-title" class="geo-ask-title">Use your location?</p>' +
      '<p class="geo-ask-body">SUNNY uses your location to find the nearest clear sky and sunny beaches.</p>' +
      '<div class="geo-ask-actions">' +
      '<button type="button" class="geo-ask-allow" data-act="allow">Allow location</button>' +
      '<button type="button" class="geo-ask-deny" data-act="deny">Not now</button>' +
      "</div></div>";
    el.addEventListener("click", onCardClick);
    document.body.appendChild(el);
    card = el;
    return el;
  }
  function onCardClick(ev) {
    var t = ev.target;
    if (!t || !t.getAttribute) return;
    var act = t.getAttribute("data-act");
    if (!act) return;
    try { ev.preventDefault(); } catch (eP) {}
    try { ev.stopPropagation(); } catch (eS) {}
    if (act === "allow") {
      allowedThisPage = true;
      setHoldMs(HOLD_AFTER_CONFIRM_MS);
      finish("allow");
    } else if (act === "deny") {
      setSessionSkip();
      clearHold();
      finish("skip");
    }
  }
  function finish(choice) {
    if (card) { card.hidden = true; card.classList.remove("is-on"); }
    var cb = waiting;
    waiting = null;
    notifyHold();
    if (cb) cb(choice);
  }
  function chainWaiting(resolve) {
    var prev = waiting;
    waiting = (choice) => {
      try { prev(choice); } catch (ePrev) {}
      resolve(choice);
    };
  }
  function showCard() {
    if (waiting) {
      return new Promise(chainWaiting);
    }
    return new Promise(openCard);
  }
  function openCard(resolve) {
    waiting = resolve;
    setHoldMs(HOLD_AFTER_CONFIRM_MS);
    var el = ensureCard();
    el.hidden = false;
    requestAnimationFrame(paintCardOn);
    var btn = el.querySelector(".geo-ask-allow");
    if (btn) try { btn.focus(); } catch (e) {}
    notifyHold();
  }
  function paintCardOn() {
    if (card) card.classList.add("is-on");
  }
  /* Resolves "allow" (caller then runs geolocation) or "skip" (tap-the-map fallback). */
  function ask(opts) {
    opts = opts || {};
    if (!navigator.geolocation) return Promise.resolve("skip");
    if (sessionSkip()) return Promise.resolve("skip");
    if (allowedThisPage) return Promise.resolve("allow");
    if (inflight) return inflight;
    inflight = permGranted().then(afterPerm).catch(askFail).then(clearInflight);
    return inflight;
  }
  function afterPerm(ok) {
    if (ok) {
      allowedThisPage = true;
      setHoldMs(HOLD_AFTER_CONFIRM_MS);
      return "allow";
    }
    return showCard().then(afterChoice);
  }
  function afterChoice(choice) {
    if (choice === "allow") {
      allowedThisPage = true;
      setHoldMs(HOLD_AFTER_CONFIRM_MS);
    }
    return choice;
  }
  function askFail() {
    return "skip";
  }
  function clearInflight(choice) {
    inflight = null;
    return choice;
  }
  function releaseHold() {
    clearHold();
  }
  function isAllowedThisPage() {
    return allowedThisPage;
  }
  window.SunnyGeo = {
    ask: ask,
    sessionSkip: sessionSkip,
    holdReload: holdReload,
    onHoldChange: onHoldChange,
    releaseHold: releaseHold,
    allowedThisPage: isAllowedThisPage
  };
})();
