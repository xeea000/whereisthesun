// workspace/whereisthesun/side-buttons.js
/* SUNNY round side buttons (opt75): Crown Land and Craters above Find Beaches.
 * Craters mirrors the Settings switch (#toggle-craters), which owns saving.
 * Find Beaches is never disabled: app.js still writes btn.disabled while busy,
 * and that property is redirected to a visual "busy" class here. */
(function () {
  "use strict";
  function keepBeachesEnabled() {
    var b = document.getElementById("btn-sun");
    if (!b) return;
    b.disabled = false;
    Object.defineProperty(b, "disabled", { configurable: true, get: never, set: markBusy.bind(null, b) });
  }
  function never() {
    return false;
  }
  function markBusy(b, v) {
    b.classList.toggle("is-busy", !!v);
  }
  function syncAll() {
    syncCraters();
    syncCrown();
  }
  function syncCraters() {
    var t = document.getElementById("toggle-craters");
    var b = document.getElementById("btn-craters");
    if (t && b) b.setAttribute("aria-pressed", t.checked ? "true" : "false");
  }
  function onCraters() {
    var t = document.getElementById("toggle-craters");
    if (!t) return;
    t.checked = !t.checked;
    t.dispatchEvent(new Event("change", { bubbles: true }));
    syncCraters();
  }
  function syncCrown() {
    var b = document.getElementById("btn-crown");
    var c = window.SunnyCrownLand;
    if (b && c) b.setAttribute("aria-pressed", c.isOn() ? "true" : "false");
  }
  function onCrown() {
    var c = window.SunnyCrownLand;
    if (c) c.set(!c.isOn());
  }
  function init() {
    keepBeachesEnabled();
    var bc = document.getElementById("btn-craters");
    var bl = document.getElementById("btn-crown");
    var t = document.getElementById("toggle-craters");
    if (bc) bc.addEventListener("click", onCraters);
    if (bl) bl.addEventListener("click", onCrown);
    if (t) t.addEventListener("change", syncCraters);
    document.addEventListener("sunny-crown", syncCrown);
    window.addEventListener("load", syncAll);
    syncCraters();
    syncCrown();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
