// workspace/whereisthesun/lagmeter.js
/* SUNNY Lag-O-Meter (opt79): the classic network meter from vendor/lag-o-meter-1.4.1, top right where the data usage line
 * was. Its ticks, ping and bar colour come from reading version.json every 5 seconds, which the service worker always
 * fetches from the network, so each reading is a real round trip to the site. On by default; the Settings switch
 * "Show Lag-O-Meter" turns it off (saved). */
import { mountLagOMeter } from "./vendor/lag-o-meter-1.4.1/lag-o-meter.js";
var KEY = "sunny-lag-meter";
var CHECK_MS = 5000;
var sw = document.getElementById("toggle-lag-meter");
var saved = null;
try { saved = localStorage.getItem(KEY); } catch (eLs) {}
var on = saved !== "0";
var meter = mountLagOMeter({ corner: "top-right", x: 8, y: 6, visible: on, storageKey: "sunny-lag", onRecheck: check, settings: { zIndex: 5 } });
function noop() {}
/* Reads version.json once past every cache and hands the request to the meter. */
function check() {
  if (document.hidden) return;
  meter.connection.track(fetch("version.json?lag=" + Date.now(), { cache: "no-store" })).catch(noop);
}
function onSwitch() {
  on = sw.checked;
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (eSet) {}
  if (on) meter.show();
  else meter.hide();
}
if (sw) {
  sw.checked = on;
  sw.addEventListener("change", onSwitch);
}
/* High visibility (owner 2026-10-22): off by default, saved; brightens the whole meter on a solid dark background. */
var BRIGHT_KEY = "sunny-lag-bright";
var BRIGHT_PROPS = ["background", "filter", "outline", "border-radius"];
/* Clears one style property; this is the element's style. */
function dropProp(k) {
  this.removeProperty(k);
}
var brightSw = document.getElementById("toggle-lag-bright");
function setBright(on) {
  var el = meter.element;
  if (on) { el.style.setProperty("background", "rgba(0,0,0,.9)"); el.style.setProperty("filter", "brightness(2.4) saturate(1.5) contrast(1.2)");
    el.style.setProperty("outline", "2px solid rgba(0,0,0,.9)"); el.style.setProperty("border-radius", "3px"); }
  else BRIGHT_PROPS.forEach(dropProp, el.style);
}
function onBright() {
  try { localStorage.setItem(BRIGHT_KEY, brightSw.checked ? "1" : "0"); } catch (eB2) {}
  setBright(brightSw.checked);
}
var bright = false;
try { bright = localStorage.getItem(BRIGHT_KEY) === "1"; } catch (eB) {}
setBright(bright);
if (brightSw) {
  brightSw.checked = bright;
  brightSw.addEventListener("change", onBright);
}
check();
setInterval(check, CHECK_MS);
