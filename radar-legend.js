// workspace/whereisthesun/radar-legend.js
/* SUNNY radar colour legend (opt67). A compact bar under the zoom buttons, shown only
 * while Radar is selected. Colours follow the NEXRAD n0q base reflectivity scale (dBZ),
 * starting at 20 dBZ (weaker echoes are hidden, opt69), with plain words underneath: light, moderate, heavy, hail. */
(function () {
  "use strict";
  var el = null;
  var GRADIENT = "linear-gradient(90deg,#43d67e 0%,#11d118 12%,#01a501 26%,#097310 38%," +
    "#fdf802 56%,#e5bc00 63%,#fd9500 70%,#fd0000 78%,#d40000 84%,#bc0000 88%,#f800fd 94%,#9854c6 100%)";
  function build() {
    el = document.createElement("div");
    el.className = "radar-legend";
    el.setAttribute("aria-label", "Radar colours: light to heavy rain");
    el.innerHTML = '<div class="rl-bar" style="background:' + GRADIENT + '"></div>' +
      '<div class="rl-lab"><span>Light</span><span>Moderate</span><span>Heavy</span><span>Hail</span></div>';
    el.hidden = true;
    document.body.appendChild(el);
  }
  function sync() {
    var b = document.querySelector('#overlay-seg [data-overlay="radar"]');
    if (!el) build();
    el.hidden = !(b && b.getAttribute("aria-pressed") === "true");
  }
  function init() {
    sync();
    var b = document.querySelector('#overlay-seg [data-overlay="radar"]');
    if (b && window.MutationObserver) new MutationObserver(sync).observe(b, { attributes: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  window.SunnyRadarLegend = { sync: sync };
})();
