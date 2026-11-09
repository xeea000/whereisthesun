// workspace/whereisthesun/bar-toggles.js
/* SUNNY bottom bar check boxes. "Labels" under the time mirrors the Settings Labels switch (#toggle-map) both ways.
 * "Low data" (sunny-lowdata, off by default) reloads the page so every part reads it from the start; see data-saver.js. */
(() => {
  "use strict";
  /* key: the saved setting both boxes show. The Settings switch is set from it only once the app starts, so the bar
   * reads it directly; otherwise the bar showed the default for the first seconds after load. */
  var pair = (barId, setId, key) => {
    var b = document.getElementById(barId), s = document.getElementById(setId);
    if (!b || !s) return;
    var v = null;
    try { v = localStorage.getItem(key); } catch (e) {}
    b.checked = v === "1" || v === "0" ? v === "1" : s.checked;
    b.addEventListener("change", () => { if (s.checked !== b.checked) s.click(); b.checked = s.checked; });
    s.addEventListener("change", () => { b.checked = s.checked; });
  };
  var low = () => {
    var b = document.getElementById("bar-low");
    if (!b) return;
    try { b.checked = localStorage.getItem("sunny-lowdata") === "1"; } catch (e) {}
    b.addEventListener("change", () => { try { localStorage.setItem("sunny-lowdata", b.checked ? "1" : "0"); } catch (e) {} location.reload(); });
  };
  var go = () => { pair("bar-labels", "toggle-map", "sunny-labels"); low(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
