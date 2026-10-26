// workspace/whereisthesun/bar-toggles.js
/* SUNNY bottom bar check boxes. "Labels" under the time mirrors the Settings Labels switch (#toggle-map) both ways.
 * "Low data" (sunny-lowdata, off by default) reloads the page so every part reads it from the start; see data-saver.js. */
(() => {
  "use strict";
  var pair = (barId, setId) => {
    var b = document.getElementById(barId), s = document.getElementById(setId);
    if (!b || !s) return;
    b.checked = s.checked;
    b.addEventListener("change", () => { if (s.checked !== b.checked) s.click(); b.checked = s.checked; });
    s.addEventListener("change", () => { b.checked = s.checked; });
    setTimeout(() => { b.checked = s.checked; }, 3000);
  };
  var low = () => {
    var b = document.getElementById("bar-low");
    if (!b) return;
    try { b.checked = localStorage.getItem("sunny-lowdata") === "1"; } catch (e) {}
    b.addEventListener("change", () => { try { localStorage.setItem("sunny-lowdata", b.checked ? "1" : "0"); } catch (e) {} location.reload(); });
  };
  var go = () => { pair("bar-labels", "toggle-map"); low(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
