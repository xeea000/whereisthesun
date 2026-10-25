// workspace/whereisthesun/beach-toggle.js
/* SUNNY Find Beaches toggle (opt91): first tap runs the normal beach search and shows
 * beaches (button pressed); next tap hides beach markers, the chosen-beach dot and the
 * results sheet (button released). Runs in the capture phase so a "hide" tap never
 * reaches the search handler. */
(function () {
  "use strict";
  var LAYERS = ["beaches-fill", "beaches-line", "beaches-dot"];
  var shown = false;
  function setLayers(on) {
    var m = window.map;
    if (!m || !m.getLayer) return;
    function one(id) {
      var want = on ? "visible" : "none";
      if (m.getLayer(id) && m.getLayoutProperty(id, "visibility") !== want) m.setLayoutProperty(id, "visibility", want);
    }
    LAYERS.forEach(one);
  }
  function mark(b) {
    b.setAttribute("aria-pressed", shown ? "true" : "false");
    b.classList.toggle("is-on", shown);
    document.body.classList.toggle("beaches-hidden", !shown);
  }
  function onTap(e) {
    var b = e.currentTarget;
    if (shown) {
      e.stopImmediatePropagation();
      e.preventDefault();
      shown = false;
      setLayers(false);
      var sheet = document.getElementById("sunny-sheet");
      if (sheet) sheet.hidden = true;
    } else {
      shown = true;
      setLayers(true);
    }
    mark(b);
  }
  function onAll() {
    var b = document.getElementById("btn-sun");
    shown = true;
    setLayers(true);
    if (b) mark(b);
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
    var b = document.getElementById("btn-sun");
    if (!b) return;
    b.addEventListener("click", onTap, true);
    var all = document.getElementById("btn-all");
    if (all) all.addEventListener("click", onAll, true);
    hook();
    document.body.classList.add("beaches-hidden");
    b.setAttribute("aria-pressed", "false");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  function isShown() {
    return shown;
  }
  window.SunnyBeachToggle = { isShown: isShown };
})();
