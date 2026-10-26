// workspace/whereisthesun/hover-box.js
/* SUNNY opt101: hover info box for mouse users. Layers register a short label and a card.
 * Hover shows the label (hover-tips.js); keeping still 2 s opens the card under the cursor.
 * Leaving the feature closes it unless the mouse is in the box. The title bar drags it. */
(function () {
  "use strict";
  var labels = {}, cards = [], box = null, timer = 0, inBox = false, drag = null, last = null;
  var fine = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var mx = -1, my = -1;
  document.addEventListener("pointermove", (e) => { mx = e.clientX; my = e.clientY; }, true);
  function hit() { if (!box) return false; var r = box.getBoundingClientRect(); return mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom; }
  function close() { if (box && !inBox && !drag && !hit()) { box.remove(); box = null; } }
  function open(x, y, html) {
    if (box) box.remove();
    box = document.createElement("div");
    box.id = "hover-box";
    box.style.cssText = "position:fixed;z-index:9998;width:260px;border-radius:10px;background:rgba(20,24,32,.95);color:#fff;font:12px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.45);overflow:hidden";
    box.innerHTML = '<div class="hb-bar" title="Drag to move" style="cursor:move;padding:3px 8px;background:rgba(255,255,255,.12);font-size:11px;user-select:none">⠿ Info</div><div class="hb-body" style="padding:6px 10px 8px">' + html + "</div>";
    document.body.appendChild(box);
    box.style.left = Math.max(4, Math.min(x - 20, innerWidth - 264)) + "px";
    box.style.top = Math.max(4, Math.min(y + 4, innerHeight - box.offsetHeight - 4)) + "px";
    box.addEventListener("mouseenter", () => { inBox = true; });
    box.addEventListener("mouseleave", () => { inBox = false; if (!drag) setTimeout(() => { if (!inBox && !overNow()) close(); }, 50); });
    box.querySelector(".hb-bar").addEventListener("pointerdown", (e) => {
      drag = { dx: e.clientX - box.offsetLeft, dy: e.clientY - box.offsetTop };
      e.target.setPointerCapture(e.pointerId); e.preventDefault();
    });
    box.querySelector(".hb-bar").addEventListener("pointermove", (e) => {
      if (!drag) return;
      box.style.left = Math.max(0, Math.min(innerWidth - 40, e.clientX - drag.dx)) + "px"; box.style.top = Math.max(0, Math.min(innerHeight - 24, e.clientY - drag.dy)) + "px";
    });
    box.querySelector(".hb-bar").addEventListener("pointerup", () => { drag = null; });
  }
  function feats(m, p) {
    var ids = Object.keys(labels).filter((id) => m.getLayer(id));
    if (!ids.length) return [];
    try { return m.queryRenderedFeatures([[p.x - 4, p.y - 4], [p.x + 4, p.y + 4]], { layers: ids }); } catch (e) { return []; }
  }
  function overNow() { return last && last.fs.length; }
  function hook() {
    var m = window.map;
    if (!m || !m.on) return setTimeout(hook, 500);
    m.on("mousemove", (e) => {
      var fs = feats(m, e.point);
      last = { fs: fs };
      clearTimeout(timer);
      if (!fs.length) { setTimeout(() => { if (!inBox && !overNow()) close(); }, 400); return; }
      var x = e.originalEvent.clientX, y = e.originalEvent.clientY;
      timer = setTimeout(() => {
        var c = cards.find((k) => fs.some((f) => k.ids[f.layer.id]));
        if (c && !inBox && !drag) open(x, y, c.fn(fs));
      }, 2000);
    });
    m.getCanvas().addEventListener("mouseleave", () => { clearTimeout(timer); last = null; setTimeout(close, 80); });
  }
  window.SunnyHoverBox = {
    label: (id) => labels[id],
    add: (map, fn) => { Object.assign(labels, map); cards.push({ ids: map, fn: fn }); }
  };
  if (fine) window.addEventListener("load", hook);
})();
