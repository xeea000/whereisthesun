// workspace/whereisthesun/existing-layers.js
/* SUNNY layers sidebar rows for the layers that were already here before opt94. Each row
 * reads and flips the layer's own control, which keeps saving its state as before. */
(() => {
  "use strict";
  var L = window.SunnyLayers;
  if (!L) return;
  function box(id) {
    return document.getElementById(id);
  }
  function checkbox(id) {
    return {
      get: () => { var t = box(id); return !!(t && t.checked); },
      set: (on) => {
        var t = box(id);
        if (!t || t.checked === on) return;
        t.checked = on;
        t.dispatchEvent(new Event("change", { bubbles: true }));
      }
    };
  }
  function row(def, ctl) {
    def.get = ctl.get;
    def.set = ctl.set;
    L.add(def);
  }
  row({ id: "wind", name: "Wind", icon: "💨", group: "Weather", tip: "Wind lines from Open-Meteo" }, checkbox("toggle-wind"));
  row({ id: "skyglow", name: "Dark sky", icon: "🌌", group: "Sky & Space", tip: "NASA Black Marble night lights: dark = dark sky" }, checkbox("toggle-skyglow"));
  row({ id: "observatories", name: "Observatories", icon: "🔭", group: "Sky & Space", tip: "Telescopes, radio arrays, neutrino detectors" }, checkbox("toggle-observatories"));
  row({ id: "craters", name: "Impact craters", icon: "☄️", group: "Earth", tip: "Confirmed impact structures at true size" }, checkbox("toggle-craters"));
  row({ id: "beaches", name: "Beaches", icon: "🏖️", group: "Outdoors", tip: "Find beaches near you (same as the Find Beaches button)" }, {
    get: () => { return !!(window.SunnyBeachToggle && window.SunnyBeachToggle.isShown()); },
    set: (on) => {
      var b = box("btn-sun");
      if (b && window.SunnyBeachToggle && window.SunnyBeachToggle.isShown() !== on) b.click();
    }
  });
  row({ id: "crown", name: "Crown Land (Ontario)", icon: "🌲", group: "Outdoors", tip: "Ontario Crown land, LIO open data" }, {
    get: () => { return !!(window.SunnyCrownLand && window.SunnyCrownLand.isOn()); },
    set: (on) => { if (window.SunnyCrownLand) window.SunnyCrownLand.set(on); }
  });
})();
