// workspace/whereisthesun/layer-lazy.js
/* SUNNY opt204: layer scripts stay off the critical path. They load once when the Layers
 * panel opens, a saved layer is on, or a share link asks for a layer. Order matches index. */
(() => {
  "use strict";
  var loading = null;
  var ready = false;
  var map = null;
  /* opt241: older layer modules that live in the lazy template keep their own attach(map) and their own
   * saved key. Attach each once, whichever comes last: the map (app-scrub) or the scripts (load). */
  var MODS = [["SunnyCraters", "sunny-craters"], ["SunnyObservatories", "sunny-observatories"],
    ["SunnySkyGlow", "sunny-skyglow"], ["SunnyCrownLand", "sunny-crown"]];
  function attachMods(m) {
    if (m) map = m;
    if (!map) return;
    MODS.forEach((x) => {
      var mod = window[x[0]];
      if (!mod || !mod.attach || mod._sunnyAttached) return;
      mod._sunnyAttached = true;
      try { mod.attach(map); } catch (eA) { console.warn(eA); }
    });
  }
  function needAtBoot() {
    try {
      if (location.hash && /[#&]s=/.test(location.hash)) return true;
    } catch (eH) {}
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("sunny-L-") === 0 && localStorage.getItem(k) === "1") return true;
      }
      if (MODS.some((x) => { return localStorage.getItem(x[1]) === "1"; })) return true;
    } catch (eL) {}
    return false;
  }
  function load() {
    if (ready) return Promise.resolve();
    if (loading) return loading;
    var tpl = document.getElementById("sunny-lazy-layers");
    if (!tpl || !tpl.content) {
      ready = true;
      return Promise.resolve();
    }
    var nodes = tpl.content.querySelectorAll("script[src]");
    var i = 0;
    function one() {
      if (i >= nodes.length) {
        ready = true;
        loading = null;
        attachMods();
        try { document.dispatchEvent(new CustomEvent("sunny-layers-ready")); } catch (eE) {}
        return Promise.resolve();
      }
      var src = nodes[i++].getAttribute("src");
      return new Promise((resolve, reject) => {
        var s = document.createElement("script");
        s.src = src;
        s.async = false;
        s.onload = () => { resolve(); };
        s.onerror = () => { reject(new Error("lazy " + src)); };
        document.body.appendChild(s);
      }).then(one, (err) => {
        console.warn(err);
        return one();
      });
    }
    loading = one();
    return loading;
  }
  function armPanel() {
    var tab = document.getElementById("lp-tab");
    if (!tab || tab._sunnyLazy) return;
    tab._sunnyLazy = true;
    tab.addEventListener("click", () => { load(); }, true);
    tab.addEventListener("pointerdown", () => { load(); }, true);
  }
  window.SunnyLayerLazy = { load: load, ready: () => { return ready; }, attachMods: attachMods, needAtBoot: needAtBoot };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      armPanel();
      if (needAtBoot()) load();
    });
  } else {
    armPanel();
    if (needAtBoot()) load();
  }
})();
