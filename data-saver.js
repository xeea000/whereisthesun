// workspace/whereisthesun/data-saver.js
/* SUNNY Data saver switches (opt88). Five Windy-style ways to use less mobile data, each with
 * its own switch in Settings, all on by default and saved on the device. Turning one off puts
 * that part back exactly as it was before opt88. A change reloads the page so nothing mixes.
 *   light   Play draws clouds from Open-Meteo cloud cover numbers instead of satellite photos
 *   fewer   Play downloads every 2nd cloud frame and every 3rd radar frame and blends between
 *   zoom    smaller cloud and radar pictures when zoomed out, and no second full-size set
 *   vector  OpenFreeMap vector base map instead of picture tiles for Roads and Dark
 *   visible no extra tiles outside the view, and no new overlay downloads while the map moves */
(function () {
  "use strict";
  var LIST = [
    { id: "light", label: "Light clouds", tip: "Play shows Open-Meteo model cloud cover (a few KB) instead of satellite photos" },
    { id: "fewer", label: "Fewer frames", tip: "Play downloads every 2nd cloud and every 3rd radar frame and blends between them" },
    { id: "zoom", label: "Zoom-matched images", tip: "Smaller cloud and radar pictures when zoomed out" },
    { id: "vector", label: "Vector base map", tip: "OpenFreeMap vector map instead of picture tiles (Roads and Dark)" },
    { id: "visible", label: "Visible tiles only", tip: "No tiles outside the view, and no overlay downloads while the map moves" }
  ];
  var PREFIX = "sunny-ds-";
  var CLOUD_STEP_MS = 20 * 60000;
  var RADAR_STEP_MS = 15 * 60000;
  function on(id) {
    try {
      return localStorage.getItem(PREFIX + id) !== "0";
    } catch (e) {
      return true;
    }
  }
  function set(id, value) {
    try {
      localStorage.setItem(PREFIX + id, value ? "1" : "0");
    } catch (e) {}
  }
  /* Frame times kept by Fewer frames: a fixed clock grid, so the same frames stay kept as time moves on */
  /* Low data (bottom bar): Play keeps hourly cloud and half-hourly radar frames, base maps stop at zoom 12,
   * cloud pictures are half size and live layers refresh 4 times slower */
  function low() { try { return localStorage.getItem("sunny-lowdata") === "1"; } catch (e) { return false; } }
  function keepMs(ms, stepMs, isLast) {
    if ((!on("fewer") && !low()) || isLast || !isFinite(ms)) return true;
    if (low()) stepMs = stepMs * (stepMs === CLOUD_STEP_MS ? 3 : 2);
    return Math.round(ms / 60000) % Math.round(stepMs / 60000) === 0;
  }
  function keepCloud(i) {
    var list = window.cloudTimes || [];
    if (!list.length) return true;
    var k = Math.max(0, Math.min(list.length - 1, i));
    return keepMs(Date.parse(list[k]), CLOUD_STEP_MS, k === list.length - 1 || k === 0);
  }
  function keepRadar(i) {
    var list = window.radarPast || [];
    if (!list.length) return true;
    var k = Math.max(0, Math.min(list.length - 1, i));
    var fr = list[k];
    return keepMs(fr ? Number(fr.time) * 1000 : NaN, RADAR_STEP_MS, k === list.length - 1 || k === 0);
  }
  /* Zoom-matched picture scale: full size from zoom 5, down to half at zoom 2 and below */
  function imageScale() {
    if (low()) return 0.5;
    if (!on("zoom")) return 1;
    var z = 5;
    try {
      z = window.SunnyPlayPin && window.map ? window.SunnyPlayPin.zoom() : window.map && window.map.getZoom ? window.map.getZoom() : 5;
    } catch (e) {}
    if (z >= 5) return 1;
    return Math.max(0.5, 1 - (5 - z) / 6);
  }
  function mapMoving() {
    if (!on("visible")) return false;
    try {
      return !!(window.map && (window.map.isMoving() || window.map.isZooming()));
    } catch (e) {
      return false;
    }
  }
  function onSwitch(ev) {
    set(ev.target.getAttribute("data-ds"), ev.target.checked);
    location.reload();
  }
  function addRow(row, item) {
    var lab = document.createElement("label");
    lab.className = "ov switch";
    lab.title = item.tip;
    var input = document.createElement("input");
    input.type = "checkbox";
    input.id = "ds-" + item.id;
    input.setAttribute("data-ds", item.id);
    input.checked = on(item.id);
    input.addEventListener("change", onSwitch);
    var knob = document.createElement("span");
    knob.className = "knob";
    knob.setAttribute("aria-hidden", "true");
    lab.appendChild(input);
    lab.appendChild(knob);
    lab.appendChild(document.createTextNode(item.label));
    row.appendChild(lab);
  }
  function buildPanel() {
    var pop = document.getElementById("settings-pop");
    if (!pop || document.getElementById("ds-group")) return;
    var sec = document.createElement("section");
    sec.className = "set-group";
    sec.id = "ds-group";
    var h = document.createElement("h3");
    h.className = "set-title";
    h.textContent = "Data saver";
    sec.appendChild(h);
    var row = document.createElement("div");
    row.className = "set-row ds-row";
    row.style.cssText = "flex-wrap:wrap;justify-content:flex-start;gap:10px 16px";
    LIST.forEach(addRow.bind(null, row));
    sec.appendChild(row);
    var lag = document.getElementById("lag-controls");
    pop.insertBefore(sec, lag || null);
  }
  window.SunnyDataSaver = { low: low, slow: (n) => { return !low() || n % 4 === 0; },
    on: on, keepCloud: keepCloud, keepRadar: keepRadar, imageScale: imageScale, mapMoving: mapMoving };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", buildPanel);
  else buildPanel();
})();
