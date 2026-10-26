// workspace/whereisthesun/aurora-top.js
/* SUNNY opt101: paints the aurora band on its own canvas above clouds and radar (which are DOM
 * layers over the map), below pins, cards and panels. Redrawn on every map render. */
(function () {
  var MAXLAT = 85.0511, cv = null, hooked = null;
  function draw(map) {
    map = map || window.map;
    if (!map || !map.getContainer) return;
    if (!cv) {
      cv = document.createElement("canvas");
      cv.id = "aurora-top";
      cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none";
      map.getContainer().appendChild(cv);
    }
    if (hooked !== map) { hooked = map; map.on("render", () => draw(map)); map.on("resize", () => draw(map)); }
    var r = window.devicePixelRatio || 1, w = map.getContainer().clientWidth, h = map.getContainer().clientHeight;
    if (cv.width !== Math.round(w * r) || cv.height !== Math.round(h * r)) { cv.width = Math.round(w * r); cv.height = Math.round(h * r); }
    var cx = cv.getContext("2d"), src = window.SunnyAurora && window.SunnyAurora.canvas;
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.clearRect(0, 0, cv.width, cv.height);
    var on = map.getLayer("aurora-dot") && map.getLayoutProperty("aurora-dot", "visibility") !== "none";
    if (!src || !on) return;
    cx.setTransform(r, 0, 0, r, 0, 0);
    cx.imageSmoothingEnabled = true;
    var a = map.project([-180, MAXLAT]), b = map.project([180, -MAXLAT]), ww = b.x - a.x;
    if (ww <= 0) return;
    for (var k = -2; k <= 2; k++) {
      var x = a.x + k * ww;
      if (x + ww < 0 || x > w) continue;
      cx.drawImage(src, x, a.y, ww, b.y - a.y);
    }
  }
  window.SunnyAuroraTop = { draw: draw };
})();
