// workspace/whereisthesun/hover-box.js
/* SUNNY opt101: hover info box for mouse users. Layers register a short label and a card.
 * Hover shows the label (hover-tips.js); keeping still 2 s opens the card under the cursor.
 * Leaving the feature closes it unless the mouse is in the box. The title bar drags it.
 * opt104: works for every tappable layer. Layers without their own hover card get the same card a tap
 * would open: a synthetic click runs while capture is on, and info-panel.js hands each popup here. It fades out. */
(function () {
  "use strict";
  var labels = {}, cards = [], box = null, timer = 0, inBox = false, drag = null, last = null;
  var fine = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var mx = -1, my = -1;
  document.addEventListener("pointermove", (e) => { mx = e.clientX; my = e.clientY; }, true);
  function hit() { if (!box) return false; var r = box.getBoundingClientRect(); return mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom; }
  var cap = false, caps = [];
  function close() {
    if (!box || inBox || drag || hit()) return;
    var b = box; box = null; caps = [];
    b.style.transition = "opacity .35s"; b.style.opacity = "0"; setTimeout(() => { b.remove(); }, 380);
  }
  function capHtml() { return caps.map((p) => { return p._sHtml || ""; }).filter(Boolean).join('<hr style="border:0;border-top:1px solid rgba(255,255,255,.15)">'); }
  function open(x, y, html) {
    if (box) box.remove();
    box = document.createElement("div");
    box.id = "hover-box";
    box.style.cssText = "position:fixed;z-index:9998;width:260px;border-radius:10px;background:rgba(20,24,32,.95);color:#fff;font:12px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.45);overflow:hidden";
    box.innerHTML = '<div class="hb-bar" title="Drag to move" style="cursor:move;padding:3px 8px;background:rgba(255,255,255,.12);font-size:11px;user-select:none">⠿ Info</div><div class="hb-body" style="padding:6px 10px 8px">' + html + "</div>";
    document.body.appendChild(box);
    var bw = box.offsetWidth || 260, bh = box.offsetHeight;
    box.style.left = Math.max(4, Math.min(x - bw / 2, innerWidth - bw - 4)) + "px";
    if (y - Math.max(bh, 120) - 12 < 4) box.style.top = Math.max(4, Math.min(y + 18, innerHeight - bh - 4)) + "px";
    else { box.style.top = "auto"; box.style.bottom = (innerHeight - y + 12) + "px"; box.style.maxHeight = (y - 16) + "px"; box.style.overflow = "auto"; }
    box.addEventListener("mouseenter", () => { inBox = true; });
    box.addEventListener("mouseleave", () => { inBox = false; if (!drag) setTimeout(() => { if (!inBox && !overNow()) close(); }, 50); });
    box.querySelector(".hb-bar").addEventListener("pointerdown", (e) => {
      drag = { dx: e.clientX - box.offsetLeft, dy: e.clientY - box.offsetTop };
      e.target.setPointerCapture(e.pointerId); e.preventDefault();
    });
    box.querySelector(".hb-bar").addEventListener("pointermove", (e) => {
      if (!drag) return;
      box.style.left = Math.max(0, Math.min(innerWidth - 40, e.clientX - drag.dx)) + "px";
      box.style.bottom = "auto"; box.style.top = Math.max(0, Math.min(innerHeight - 24, e.clientY - drag.dy)) + "px";
    });
    box.querySelector(".hb-bar").addEventListener("pointerup", () => { drag = null; });
  }
  function tapIds() { return window.SunnyLayers ? window.SunnyLayers.tapIds() : []; }
  function feats(m, p) {
    var ids = Object.keys(labels).concat(tapIds(), ["beaches-dot", "beaches-sun"]).filter((id, i, a) => a.indexOf(id) === i && m.getLayer(id));
    if (!ids.length) return [];
    var fs = [];
    try { fs = m.queryRenderedFeatures([[p.x - 4, p.y - 4], [p.x + 4, p.y + 4]], { layers: ids }); } catch (e) { return []; }
    /* a dot or line under the pointer beats the area it sits in */
    var dots = fs.filter((f) => { return f.layer.type === "circle" || f.layer.type === "symbol"; });
    var sharp = fs.filter((f) => { return f.layer.type !== "fill" && f.layer.type !== "raster"; });
    return dots.length ? dots : sharp.length ? sharp : fs;
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
        if (inBox || drag) return;
        var pk = document.getElementById("ip-peek"); if (pk && !pk.hidden) return; /* opt155: a tapped card is open, so no second hover card */
        var c = cards.find((k) => fs.some((f) => k.ids[f.layer.id]));
        if (c) return open(x, y, c.fn(fs));
        caps = []; cap = true;
        var pt = e.point;
        try { m.fire("click", { type: "click", point: pt, lngLat: m.unproject(pt), originalEvent: e.originalEvent, target: m }); } catch (er) {}
        cap = false;
        if (caps.length) { var keep = caps; open(x, y, capHtml()); caps = keep; }
      }, window.SunnyHoverDelay ? window.SunnyHoverDelay() : 2000); /* opt106: Advanced setting */
    });
    m.on("click", () => { if (!cap) { clearTimeout(timer); close(); } }); /* opt155: a real click replaces the hover card */
    m.getCanvas().addEventListener("mouseleave", () => { clearTimeout(timer); last = null; setTimeout(close, 80); });
  }
  window.SunnyHoverBox = {
    capturing: () => cap,
    capture: (p) => {
      if (caps.indexOf(p) < 0) { if (!cap) return; caps.push(p); }
      var b = box && box.querySelector(".hb-body");
      if (b) b.innerHTML = capHtml();
    },
    label: (id) => labels[id],
    add: (map, fn) => { Object.assign(labels, map); cards.push({ ids: map, fn: fn }); }
  };
  if (fine) window.addEventListener("load", hook);
})();
