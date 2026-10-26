// workspace/whereisthesun/plus-code.js
/* SUNNY Plus Code (Open Location Code, the open Google standard, Apache-2.0): a short code for the tapped spot, about 14 m across,
 * shown in the tap card with a Copy button. Computed in the browser, no download. */
(() => {
  "use strict";
  var A = "23456789CFGHJMPQRVWX";
  /* integer method from the reference library, so results match its encoding test vectors (10-digit codes) */
  window.SunnyPlusCode = (lat, lng) => {
    lat = Math.min(Math.max(lat, -90), 90);
    if (lat === 90) lat -= 0.000125;
    lng = ((lng + 180) % 360 + 360) % 360 - 180;
    var la = Math.floor(Math.floor(Math.round((lat + 90) * 2.5e7 * 1e6) / 1e6) / 3125);
    var lo = Math.floor(Math.floor(Math.round((lng + 180) * 8.192e6 * 1e6) / 1e6) / 1024), c = "";
    for (var i = 0; i < 5; i++) {
      c = A[la % 20] + A[lo % 20] + c;
      la = Math.floor(la / 20); lo = Math.floor(lo / 20);
    }
    return c.slice(0, 8) + "+" + c.slice(8);
  };
  document.addEventListener("click", (e) => {
    var b = e.target && e.target.closest && e.target.closest(".pc-copy");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var done = () => { b.textContent = "Copied"; setTimeout(() => { b.textContent = "Copy"; }, 1500); };
    try { navigator.clipboard.writeText(b.dataset.c).then(done, () => { window.prompt("Plus Code", b.dataset.c); }); } catch (x) { window.prompt("Plus Code", b.dataset.c); }
  }, true);
})();
