// workspace/whereisthesun/wind-play-fade.js
/* SUNNY wind fade during Play (opt68). Wind particles show current wind only, not the
 * timeline time, so the wind layer (GPU and fallback canvas) fades out over 300 ms when
 * Play starts and back in when Play stops. With the Wind checkbox off the layer is
 * already hidden, so nothing changes. */
(function () {
  "use strict";
  function sync() {
    var btn = document.getElementById("btn-play");
    var layer = document.getElementById("wind-layer");
    if (!btn || !layer) return;
    layer.classList.toggle("wind-play-hidden", btn.getAttribute("aria-pressed") === "true");
  }
  function init() {
    var btn = document.getElementById("btn-play");
    if (btn && window.MutationObserver) new MutationObserver(sync).observe(btn, { attributes: true, attributeFilter: ["aria-pressed"] });
    sync();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
