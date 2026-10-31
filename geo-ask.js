// workspace/whereisthesun/geo-ask.js
/* SUNNY opt202: one shared GPS gate. Before every navigator.geolocation call, show a short
 * explainer card (confirm location / Not now). Skip the card when Permissions API state is granted.
 * "Not now" is session-only. Location is used client-side for map, weather and beaches (Open-Meteo
 * and similar receive coordinates from the browser), so the card does not claim device-only storage. */
(() => {
  "use strict";
  var KEY = "sunny-geo-notnow";
  var card = null;
  var waiting = null;
  function sessionSkip() {
    try { return sessionStorage.getItem(KEY) === "1"; } catch (e) { return false; }
  }
  function setSessionSkip() {
    try { sessionStorage.setItem(KEY, "1"); } catch (e) {}
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
    el.addEventListener("click", (ev) => {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      var act = t.getAttribute("data-act");
      if (act === "allow") finish("allow");
      else if (act === "deny") { setSessionSkip(); finish("skip"); }
    });
    document.body.appendChild(el);
    card = el;
    return el;
  }
  function finish(choice) {
    if (card) { card.hidden = true; card.classList.remove("is-on"); }
    var cb = waiting;
    waiting = null;
    if (cb) cb(choice);
  }
  function showCard() {
    return new Promise((resolve) => {
      waiting = resolve;
      var el = ensureCard();
      el.hidden = false;
      requestAnimationFrame(() => { el.classList.add("is-on"); });
      var btn = el.querySelector(".geo-ask-allow");
      if (btn) try { btn.focus(); } catch (e) {}
    });
  }
  /* Resolves "allow" (caller then runs geolocation) or "skip" (tap-the-map fallback). */
  function ask(opts) {
    opts = opts || {};
    if (!navigator.geolocation) return Promise.resolve("skip");
    if (sessionSkip()) return Promise.resolve("skip");
    return permGranted().then((ok) => {
      if (ok) return "allow";
      return showCard();
    });
  }
  window.SunnyGeo = { ask: ask, sessionSkip: sessionSkip };
})();
