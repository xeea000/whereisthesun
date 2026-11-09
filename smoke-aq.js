// workspace/whereisthesun/smoke-aq.js
/* SUNNY smoke and air quality (t388u), the "Smoke & air quality" kid of Wildfires:
 *   Map    NASA GIBS MODIS Terra + Aqua aerosol optical depth (smoke, dust and haze from space), daily,
 *          the day before (the newest day GIBS has in full). No key. Gaps where clouds hide the ground.
 *   Spot   the Weather card adds PM2.5, the United States air quality index and pollen at the tapped spot from Open-Meteo Air Quality
 *          (free, no key; CAMS model). Pollen is forecast for Europe only and reads "none" elsewhere. */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers;
  if (!K || !L) return;
  var KID = "fires-smoke", ID = "smoke-aod";
  var RAMP = ["#fffcc7", "#ffe576", "#ffc648", "#ff9528", "#ff621b", "#f52810", "#d3070c", "#9b000e"];
  var AQI = [[50, "good"], [100, "moderate"], [150, "unhealthy for sensitive groups"], [200, "unhealthy"], [300, "very unhealthy"], [1e9, "hazardous"]];
  var POLLEN = [["alder_pollen", "alder"], ["birch_pollen", "birch"], ["grass_pollen", "grass"], ["mugwort_pollen", "mugwort"],
    ["olive_pollen", "olive"], ["ragweed_pollen", "ragweed"]];
  var cache = {};
  var on = () => { return K.kids.layerOn(L.isOn("fires"), KID, true); };
  var day = () => { return new Date(Date.now() - 864e5).toISOString().slice(0, 10); };
  var low = (map) => {
    var ls = map.getStyle().layers, top = -1;
    ls.forEach((l, i) => { if (/^(gibs|iem-vis|radar|light-cloud|lc-)/.test(l.id)) top = i; });
    var i = ls.findIndex((l) => l.id === ID), nxt = ls[top + 1] && ls[top + 1].id;
    if (top >= 0 && i > top + 1 && nxt) { try { map.moveLayer(ID, nxt); } catch (e) {} } /* above clouds, under every dot and line */
  };
  var apply = (map, parentOn) => {
    var show = K.kids.layerOn(parentOn, KID, true);
    if (show && !map.getLayer(ID)) {
      try {
        map.addSource(ID, K.overzoom({ type: "raster", tileSize: 256,
          attribution: 'Smoke and haze: <a href="https://worldview.earthdata.nasa.gov/" target="_blank" rel="noopener">NASA MODIS aerosol optical depth</a> via GIBS',
          tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Combined_Value_Added_AOD/default/" + day() + "/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png"] }, 6));
        map.addLayer({ id: ID, type: "raster", source: ID, paint: { "raster-opacity": 0.55, "raster-fade-duration": 0 } }, K.before(map));
        K.uncapped(map, [ID]);
      } catch (e) { return; } /* style not ready yet; the idle hook adds it */
    }
    if (show) low(map);
    K.vis(map, [ID], show);
  };
  var aqiWord = (v) => { for (var i = 0; i < AQI.length; i++) if (v <= AQI[i][0]) return AQI[i][1]; return ""; };
  var row = (lat, lon) => {
    var k = lat.toFixed(2) + "," + lon.toFixed(2);
    if (!cache[k]) cache[k] = fetch("https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" + lat.toFixed(3) + "&longitude=" + lon.toFixed(3) +
      "&current=pm2_5,us_aqi,aerosol_optical_depth," + POLLEN.map((p) => { return p[0]; }).join(",")).then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).catch(() => { delete cache[k]; return null; });
    return cache[k].then((j) => {
      var c = j && j.current;
      if (!c) return "";
      var out = [];
      if (c.pm2_5 != null) out.push("PM2.5 " + c.pm2_5.toFixed(1) + " micrograms per cubic metre");
      if (c.us_aqi != null) out.push("US air quality index " + Math.round(c.us_aqi) + " (" + aqiWord(c.us_aqi) + ")");
      if (c.aerosol_optical_depth != null) out.push("haze (aerosol optical depth) " + c.aerosol_optical_depth.toFixed(2));
      var pol = POLLEN.filter((p) => { return c[p[0]] != null; }).map((p) => { return p[1] + " " + Math.round(c[p[0]]); });
      out.push(pol.length ? "pollen in grains per cubic metre: " + pol.join(", ") : "pollen: no forecast here (Europe only)");
      return '<div class="pf-sea">Air: ' + K.esc(out.join(" · ")) + ' <span class="pf-src">(<a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" ' +
        'rel="noopener">Open-Meteo Air Quality</a>)</span></div>';
    });
  };
  window.SunnySmoke = { apply: apply, on: on, row: row, ramp: RAMP, kid: KID, low: low };
  L.add({ id: "smoke-attach", group: "none", attach: (map) => {
    map.on("idle", () => { if (on() && !map.getLayer(ID)) apply(map, true); });
    apply(map, L.isOn("fires"));
  } });
})();
