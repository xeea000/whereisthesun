// workspace/whereisthesun/plus-code.js
/* SUNNY Plus Code (Open Location Code, the open Google standard, Apache-2.0): a short code for the tapped spot, about 14 m across,
 * shown in the tap card with a Copy button. Computed in the browser, no download. */
(() => {
  "use strict";
  var A = "23456789CFGHJMPQRVWX";
  window.SunnyPlusCode = (lat, lng) => {
    var la = Math.min(Math.max(lat, -90), 90) + 90, lo = ((((lng + 180) % 360) + 360) % 360), c = "", r = 20;
    if (la >= 180) la = 180 - 1e-9;
    for (var i = 0; i < 5; i++) {
      var a = Math.floor(la / r), b = Math.floor(lo / r);
      la -= a * r; lo -= b * r; c += A[a] + A[b]; r /= 20;
      if (i === 3) c += "+";
    }
    return c.slice(0, 8) + "+" + c.slice(9);
  };
  document.addEventListener("click", (e) => {
    var b = e.target && e.target.closest && e.target.closest(".pc-copy");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var done = () => { b.textContent = "Copied"; setTimeout(() => { b.textContent = "Copy"; }, 1500); };
    try { navigator.clipboard.writeText(b.dataset.c).then(done, () => { window.prompt("Plus Code", b.dataset.c); }); } catch (x) { window.prompt("Plus Code", b.dataset.c); }
  }, true);
})();
