// workspace/whereisthesun/peek-place.js
/* SUNNY opt99 smart peek card placement. The card goes in the biggest free band of the screen that
 * does not cover the HUD, zoom and Locate buttons, Find beaches, the timeline (Play, Clouds/Radar),
 * the left and right panel tabs or the beach list. It prefers the band away from the tap pin, caps its
 * height to the band (the body scrolls), and pans the map if the pin would still sit under the card. */
(() => {
  "use strict";
  var SEL = [".hud", ".hud *", ".timeline", ".controls", "#btn-locate", ".maplibregl-ctrl-bottom-left", "#ip-tab", "#lp-tab", "#sunny-sheet", "#overlay-seg"];
  var GAP = 8;
  var shown = (e) => {
    if (!e || e.hidden) return null;
    var s = getComputedStyle(e);
    if (s.display === "none" || s.visibility === "hidden") return null;
    var r = e.getBoundingClientRect();
    return r.width > 2 && r.height > 2 ? r : null;
  };
  /* free vertical bands for a card spanning x0..x1 */
  var bands = (x0, x1, vh) => {
    var cut = [];
    SEL.forEach((q) => {
      document.querySelectorAll(q).forEach((e) => {
        var r = shown(e);
        if (r && r.right > x0 && r.left < x1 && r.bottom > 0 && r.top < vh) cut.push([Math.max(0, r.top - GAP), Math.min(vh, r.bottom + GAP)]);
      });
    });
    cut.sort((a, b) => { return a[0] - b[0]; });
    var out = [], y = GAP;
    cut.forEach((c) => {
      if (c[0] > y) out.push([y, c[0]]);
      y = Math.max(y, c[1]);
    });
    if (vh - GAP > y) out.push([y, vh - GAP]);
    return out;
  };
  var last = null;
  var place = (peek, map, ll, again) => {
    if (!peek || peek.hidden) return;
    last = [peek, map, ll];
    var vw = window.innerWidth, vh = window.innerHeight;
    var w = Math.min(360, vw - 2 * 38);
    var x0 = (vw - w) / 2;
    peek.style.width = w + "px";
    peek.style.left = x0 + "px";
    peek.style.transform = "none";
    peek.style.bottom = "auto";
    var list = bands(x0, x0 + w, vh).filter((b) => { return b[1] - b[0] >= 90; });
    if (!list.length) list = [[GAP, vh * 0.5]];
    var pt = ll && map ? map.project(ll) : null;
    var py = pt ? pt.y : -1;
    /* biggest band, preferring one that does not hold the pin */
    var score = (b) => { return (b[1] - b[0]) * (pt && py >= b[0] && py <= b[1] ? 0.45 : 1); };
    list.sort((a, b) => { return score(b) - score(a); });
    var band = list[0];
    var maxH = Math.min(band[1] - band[0], Math.round(vh * 0.42));
    peek.style.maxHeight = maxH + "px";
    var h = Math.min(peek.scrollHeight, maxH);
    /* sit at the edge of the band nearest the screen edge, away from the pin */
    var top = (band[0] + band[1]) / 2 < vh / 2 ? band[0] : band[1] - h;
    peek.style.top = Math.round(top) + "px";
    if (!pt || again) return;
    var pinTop = py - 40, pinBot = py + 6;
    if (pinBot > top && pinTop < top + h) {
      var free = top > vh / 2 ? (top - 60) / 2 + 40 : (top + h + vh - 100) / 2 + 40;
      map.panBy([0, py - free], { duration: 350 });
    }
  };
  /* the HUD text and window size change after a card opens: place again, without panning */
  var re = () => { if (last) place(last[0], last[1], last[2], true); };
  window.addEventListener("resize", re);
  var hud = () => {
    var h = document.querySelector(".hud");
    if (h && window.ResizeObserver) new ResizeObserver(re).observe(h);
    else if (!h) setTimeout(hud, 1000);
  };
  hud();
  window.SunnyPeekPlace = place;
})();
