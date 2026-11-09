// workspace/whereisthesun/side-buttons.js
/* SUNNY side controls (opt75). Find Beaches is never disabled: app.js still writes btn.disabled
 * while busy, and that property is redirected to a visual "busy" class here. The round layer
 * buttons that used to sit here were removed in t382u; those layers switch in the Layers panel. */
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
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", keepBeachesEnabled);
  else keepBeachesEnabled();
})();
