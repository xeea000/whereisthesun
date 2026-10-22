// workspace/whereisthesun/lagmeter.js
/* SUNNY Lag-O-Meter (opt79): the classic network meter from vendor/lag-o-meter-1.5.0, top right where the data usage line
 * was. Its ticks, ping and bar colour come from reading version.json every 5 seconds, which the service worker always
 * fetches from the network, so each reading is a real round trip to the site. On by default; the Settings switch
 * "Show Lag-O-Meter" turns it off (saved). */
import { mountLagOMeter } from "./vendor/lag-o-meter-1.5.0/lag-o-meter.js";
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
var brightSw = document.getElementById("toggle-lag-bright");
function setBright(on) {
  meter.setBright(on);
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
/* The build under the settings (2026-10-22): the opt name and hash that tools/write-version.js stamps into version.json. */
var buildLine = document.getElementById("set-build");
function showBuild(v) {
  if (buildLine && v && v.build) buildLine.textContent = "Build " + v.build + (v.hash ? " · " + v.hash.slice(0, 7) : "") + (v.at ? " · " + v.at : "");
}
function readJson(r) {
  return r.ok ? r.json() : null;
}
fetch("version.json?b=" + Date.now(), { cache: "no-store" }).then(readJson).then(showBuild).catch(noop);
check();
setInterval(check, CHECK_MS);
