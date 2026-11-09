// workspace/whereisthesun/beach-toggle.js
/* SUNNY beaches shown or hidden (opt91, t384u). Find beaches and All beaches (in the Beaches layer's controls)
 * run the normal search and show the beach markers; switching the Beaches layer off hides the markers,
 * the chosen-beach dot and the results sheet. */
(function () {
  "use strict";
  var LAYERS = ["beaches-fill", "beaches-line", "beaches-dot", "beaches-sun"];
  var shown = false;
  function setLayers(on) {
    var m = window.map;
    if (!m || !m.getLayer) return;
    var want = on ? "visible" : "none";
    LAYERS.forEach((id) => {
      if (m.getLayer(id) && m.getLayoutProperty(id, "visibility") !== want) m.setLayoutProperty(id, "visibility", want);
    });
  }
  function mark(on) {
    shown = on;
    setLayers(on);
    document.body.classList.toggle("beaches-hidden", !on);
    if (window.SunnyLayers && window.SunnyLayers.refresh) window.SunnyLayers.refresh();
  }
  function show() {
    mark(true);
  }
  function hide() {
    mark(false);
    var sheet = document.getElementById("sunny-sheet");
    if (sheet) sheet.hidden = true;
  }
  function enforce() {
    if (!shown) setLayers(false);
  }
  function hook() {
    if (!window.map || !window.map.on) return setTimeout(hook, 500);
    window.map.on("idle", enforce);
    enforce();
  }
  function init() {
    ["btn-sun", "btn-all"].forEach((id) => {
      var b = document.getElementById(id);
      if (b) b.addEventListener("click", show, true);
    });
    hook();
    document.body.classList.add("beaches-hidden");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  window.SunnyBeachToggle = { isShown: () => { return shown; }, hide: hide };
})();
