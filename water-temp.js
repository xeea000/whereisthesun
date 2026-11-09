// workspace/whereisthesun/water-temp.js
/* SUNNY water temperature: NASA GIBS GHRSST MUR sea surface temperature (free, no key), daily at 1 km, oceans plus the
 * Great Lakes and other large lakes it covers. Tiles from two days back, the newest day GIBS reliably has.
 * The value at one spot comes from the Weather button (Open-Meteo Marine).
 * Gaps: small lakes are not in MUR; Open-Meteo Marine has no lake temperature (null on the Great Lakes). */
(() => {
  "use strict";
  var L = window.SunnyLayers, K = window.SunnyKit;
  var STOPS = [["#2b001a", "0°"], ["#560965", "6°"], ["#204697", "12°"], ["#23a485", "18°"], ["#ffbf00", "24°"], ["#bb1f00", "30°"], ["#6b0200", "32°C+"]];
  var day = () => { return new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10); };
  var low = (map) => {
    var ls = map.getStyle().layers, top = -1;
    ls.forEach((l, i) => { if (/^(gibs|iem-vis|radar|light-cloud|lc-)/.test(l.id)) top = i; });
    var i = ls.findIndex((l) => l.id === "sst"), nxt = ls[top + 1] && ls[top + 1].id;
    if (top >= 0 && i > top + 1 && nxt) { try { map.moveLayer("sst", nxt); } catch (e) {} } /* above clouds, under every dot and line */
  };
  var apply = (map, parentOn) => {
    if (window.SunnyCurrents) window.SunnyCurrents.draw();
    var on = K.kids.layerOn(parentOn, "watertemp-sst", true);
    if (on && !map.getLayer("sst")) {
      try {
        map.addSource("sst", K.overzoom({ type: "raster", tileSize: 256,
          attribution: 'Water temperature: <a href="https://podaac.jpl.nasa.gov/MEaSUREs-MUR" target="_blank" rel="noopener">NASA JPL MUR</a> via GIBS',
          tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GHRSST_L4_MUR_Sea_Surface_Temperature/default/" + day() + "/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png"] }, 7));
        map.addLayer({ id: "sst", type: "raster", source: "sst", paint: { "raster-opacity": 0.6, "raster-fade-duration": 0 } }, K.before(map));
        K.uncapped(map, ["sst"]);
      } catch (e) { setTimeout(() => { if (L.isOn("watertemp")) apply(map, true); }, 2000); return; } /* style not ready yet */
    }
    if (on) low(map);
    K.vis(map, ["sst"], on);
  };
  var curLeg = () => {
    var C = window.SunnyCurrents;
    return C ? K.legRamp(C.stops.map((x) => { return x[1]; }).join(","), "still", "1.5 km/h", "3+ kilometres per hour") +
      '<div class="ls-row"><small>Current arrows point the way the surface water flows (Open-Meteo Marine model, now)</small></div>' : "";
  };
  var wmap = null;
  L.add({ id: "watertemp", name: "Water temperature & currents", icon: "🌡️", group: "Ocean", dflt: true, apply: apply,
    kids: [{ id: "watertemp-sst", name: "Surface temperature", dflt: true }, { id: "watertemp-cur", name: "Currents", dflt: true }],
    kidSet: () => { if (wmap) apply(wmap, L.isOn("watertemp")); },
    legend: K.legRamp(STOPS.map((s) => { return s[0]; }).join(","), "0°C (32°F)", "18°C (64°F)", "32°C (90°F)") + curLeg(),
    tip: "Sea and large-lake surface temperature, NASA MUR, two days back, and surface current arrows (Open-Meteo Marine, now). " +
      "Tap a spot at sea, then Weather, for the numbers there (Open-Meteo Marine gives no lake temperatures, so lakes show the colour only)",
    attach: (map, on) => {
      wmap = map;
      map.on("idle", () => {
        if (!K.kids.layerOn(L.isOn("watertemp"), "watertemp-sst", true)) return;
        if (!map.getLayer("sst")) apply(map, true); else low(map);
      });
      apply(map, on);
    } });
})();
