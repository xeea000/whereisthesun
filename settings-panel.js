// workspace/whereisthesun/settings-panel.js
/* SUNNY Settings popover (opt62). One small button in the bottom bar opens it. Closes on a tap
 * outside, on Escape, or on the button again. The controls inside keep their ids, so app.js
 * still wires and saves them exactly as before. */
(function () {
  "use strict";
  var btn = document.getElementById("btn-settings");
  var pop = document.getElementById("settings-pop");
  if (!btn || !pop) return;
  function setOpen(open) {
    pop.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.classList.toggle("settings-open", open);
  }
  function onButton(ev) {
    ev.stopPropagation();
    setOpen(pop.hidden);
  }
  function onDocPointer(ev) {
    if (pop.hidden) return;
    if (pop.contains(ev.target) || btn.contains(ev.target)) return;
    setOpen(false);
  }
  function onKey(ev) {
    if (ev.key === "Escape" && !pop.hidden) {
      setOpen(false);
      btn.focus();
    }
  }
  btn.addEventListener("click", onButton);
  document.addEventListener("pointerdown", onDocPointer, true);
  document.addEventListener("keydown", onKey);
  window.SunnySettings = { open: setOpen.bind(null, true), close: setOpen.bind(null, false) };
})();
