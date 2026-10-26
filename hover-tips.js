// workspace/whereisthesun/hover-tips.js
/* SUNNY desktop hover tooltips (opt100). Only on mouse devices (hover:hover and pointer:fine).
 * opt102: other modules may supply a label via window.SunnyHoverExt(feature, update).
 * Shows name and type of the map feature or button under the mouse, from data already loaded (no fetch). */
(() => {
  "use strict";
  if (!window.matchMedia || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  var SKIP = { ofm: 1, "iem-vis": 1, "sky-grid": 1 }, SKIPL = { "sky-night": 1 };
  var tip = document.createElement("div");
  tip.id = "hover-tip";
  tip.style.cssText = "position:fixed;z-index:9999;pointer-events:none;display:none;max-width:260px;padding:4px 8px;" +
    "border-radius:6px;background:rgba(20,24,32,.92);color:#fff;font:12px/1.35 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.35)";
  var esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var nice = (s) => String(s || "")
    .replace(/^(w|pack)-/, "").replace(/[-_]+/g, " ").replace(/\b(dot|dots|sym|pts|fill|line|layer)\b/g, "").trim().replace(/^./, (c) => c.toUpperCase());
  var show = (x, y, html) => {
    tip.innerHTML = html; tip.style.display = "block";
    var w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(4, Math.min(x - w / 2, innerWidth - w - 4)) + "px";
    tip.style.top = (y - h - 12 < 4 ? Math.min(y + 18, innerHeight - h - 4) : y - h - 12) + "px";
  };
  var hide = () => { tip.style.display = "none"; cur = ""; };
  var cur = "", lx = 0, ly = 0; /* opt102: async labels (SunnyHoverExt) only refresh the tip still under the mouse */
  var label = (f) => {
    var ex = window.SunnyHoverExt && window.SunnyHoverExt(f, (html) => { if (cur === f.layer.id + ":" + (f.properties || {}).i) show(lx, ly, html); });
    if (ex) return ex;
    var hb = window.SunnyHoverBox && window.SunnyHoverBox.label(f.layer.id);
    if (hb) return "<b>" + esc(hb) + "</b>";
    var p = f.properties || {};
    var name = p.name || p.n || p.title || p.NAME || p.Name || p.label || p.nm || "";
    if (f.layer.id === "famous-star") return "<b>" + esc(name) + "</b><br><small>Famous</small>";
    var type = (window.SunnyLayers && window.SunnyLayers.nameOf && window.SunnyLayers.nameOf(f.layer.id)) || nice(f.layer.id) || nice(f.source); /* opt105 */
    if (p.point_count) return "<b>" + p.point_count + " places</b><br><small>" + esc(type) + " · zoom in</small>";
    var kind = p.k || p.cat || p.type || ""; if (String(kind).length < 3) kind = "";
    if (!name && kind) { name = nice(kind); kind = ""; }
    return "<b>" + esc(name || type) + "</b>" + (name ? "<br><small>" + esc(type + (kind && kind !== name ? " · " + nice(kind) : "")) + "</small>" : "");
  };
  var hook = () => {
    var m = window.map;
    if (!m || !m.on || !m.getCanvas) return setTimeout(hook, 500);
    document.body.appendChild(tip);
    var cv = m.getCanvas(), dragging = false, raf = 0;
    m.on("dragstart", () => { dragging = true; hide(); });
    m.on("dragend", () => { dragging = false; });
    m.on("mousemove", (e) => {
      if (dragging || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        var fs = [];
        try { fs = m.queryRenderedFeatures([[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]]); } catch (x) { fs = []; }
        var f = fs.find((g) => !SKIP[g.source] && !SKIPL[g.layer.id] && g.layer && g.layer.type !== "raster");
        if (!f && window.SunnyAurora) {
          var ll = m.unproject(e.point), v = window.SunnyAurora.at(ll.lng, ll.lat);
          if (v >= 5) { cv.style.cursor = "pointer"; return show(e.originalEvent.clientX, e.originalEvent.clientY, "<b>Aurora chance " + Math.round(v) + " %</b><br><small>NOAA aurora forecast</small>"); }
        }
        if (!f) { hide(); cv.style.cursor = ""; return; }
        cv.style.cursor = "pointer";
        cur = f.layer.id + ":" + (f.properties || {}).i; lx = e.originalEvent.clientX; ly = e.originalEvent.clientY;
        show(e.originalEvent.clientX, e.originalEvent.clientY, label(f));
      });
    });
    cv.addEventListener("mouseleave", () => { hide(); cv.style.cursor = ""; });
    m.on("movestart", hide);
  };
  /* Buttons: give a title from aria-label or text, so the browser shows its own tooltip. */
  var titles = () => {
    document.querySelectorAll("button,[role=button],.maplibregl-ctrl button").forEach((b) => {
      if (b.title) return;
      var t = b.getAttribute("aria-label") || (b.textContent || "").trim();
      if (t && t.length < 40) b.title = t;
      else if (!t && b.dataset && b.dataset.tip) b.title = b.dataset.tip;
    });
  };
  window.addEventListener("load", () => { hook(); titles(); setInterval(titles, 3000); });
})();
