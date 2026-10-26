// workspace/whereisthesun/bar-toggles.js
/* SUNNY bottom bar check boxes. "Labels" under the time mirrors the Settings Labels switch (#toggle-map) both ways. */
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
  var go = () => { pair("bar-labels", "toggle-map"); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
