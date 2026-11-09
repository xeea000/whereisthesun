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
  var K = window.SunnyKit;
  var LEG = { /* opt110 legends */
    wind: K.legKeys([["#ebf5ff", "line", "moving lines follow the wind; brighter, longer = stronger"]]),
    skyglow: K.legRamp("#000,#1b2a55,#c9a64a,#fff6c8", "dark sky", "night lights", "bright"),
    /* opt220: enabled observatory kids only (+ cluster swatch when any on) */
    observatories: () => {
      var rows = [
        ["observatories-scope", "#7b5cff", "telescope, optical or radio (3,737)"],
        ["observatories-detector", "#11a3a3", "detector: neutrino, gravitational wave, cosmic ray (46)"],
        ["observatories-darksky", "#1c2b6b", "Dark Sky Reserve or Park (38)"],
        ["observatories-stargaze", "#ffd34d", "stargazing site or planetarium (137)"]
      ];
      var list = rows.map((r) => { return { id: r[0], dflt: true, color: r[1], name: r[2] }; });
      var html = K.kids.legKeys(list, (k) => { return [k.color, "dot", k.name]; });
      if (!html) return "";
      return html + K.legKeys([["rgba(123,92,255,0.55)", "dot", "group (number inside)"]]);
    },
    craters: K.legKeys([["#ff9a3c", "area", "crater rim at true size"], ["#ff9a3c", "dot", "centre"]]),
    crown: K.legKeys([["rgb(30,170,60)", "area", "Crown land policy area"]])
  };
  function row(def, ctl) {
    if (LEG[def.id]) def.legend = LEG[def.id];
    def.get = ctl.get;
    def.set = ctl.set;
    L.add(def);
  }
  row({ id: "wind", name: "Wind", icon: "💨", group: "Weather", tip: "Wind lines from Open-Meteo, current wind only: they hide while Play runs and do not follow the timeline" }, checkbox("toggle-wind"));
  row({ id: "skyglow", name: "Dark sky", icon: "🌌", group: "Sky & Space", tip: "NASA Black Marble night lights: dark = dark sky" }, checkbox("toggle-skyglow"));
  row({ id: "observatories", name: "Observatories", icon: "🔭", group: "Sky & Space", tip: "Telescopes, detectors, dark-sky places and stargazing sites",
    kids: [["scope", "Telescopes"], ["detector", "Detectors"], ["darksky", "Dark Sky Reserves & Parks"], ["stargaze", "Stargazing sites"]].map((k) => {
      return { id: "observatories-" + k[0], name: k[1], dflt: true }; }),
    kidSet: () => { if (window.SunnyObservatories) window.SunnyObservatories.refresh(); } }, checkbox("toggle-observatories"));
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
