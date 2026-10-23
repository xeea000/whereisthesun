// workspace/whereisthesun/lagmeter.js
/* SUNNY Lag-O-Meter (opt79): the classic network meter from vendor/lag-o-meter-1.7.0, top right where the data usage line
 * was. Its ticks, ping and bar colour come from reading version.json every 5 seconds, which the service worker always
 * fetches from the network, so each reading is a real round trip to the site. On by default; the Settings switch
 * "Show Lag-O-Meter" turns it off (saved). */
import { mountLagOMeter, mountLagControls } from "./vendor/lag-o-meter-1.7.0/lag-o-meter.js";
var KEY = "sunny-lag-meter";
var CHECK_MS = 5000;
/* Show Lag-O-Meter and High visibility as first saved, used until the meter's own settings are saved. */
function oldPref(key, onValue) {
  try { return localStorage.getItem(key) === onValue; } catch (eLs) { return false; }
}
var fallback = { show: !oldPref(KEY, "0"), bright: oldPref("sunny-lag-bright", "1") };
var meter = mountLagOMeter({ corner: "top-right", x: 8, y: 6, visible: fallback.show, storageKey: "sunny-lag", onRecheck: check, settings: { zIndex: 5 } });
function noop() {}
/* Reads version.json once past every cache and hands the request to the meter. */
function check() {
  if (document.hidden) return;
  meter.connection.track(fetch("version.json?lag=" + Date.now(), { cache: "no-store" })).catch(noop);
}
/* The meter's own settings in Settings: Show Lag-O-Meter, High visibility, Scale and Pin side, from the shared meter. */
var box = document.getElementById("lag-controls");
if (box) mountLagControls(box, meter, { key: "sunny-lag-prefs", fallback: fallback, classes: { group: "set-row", title: "set-title", check: "sun-opt", row: "sun-opt" } });
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
