// workspace/whereisthesun/hover-tips.js
/* SUNNY desktop hover tooltips (opt100). Only on mouse devices (hover:hover and pointer:fine).
 * opt102: other modules may supply a label via window.SunnyHoverExt(feature, update).
 * Shows name and type of the map feature or button under the mouse, from data already loaded (no fetch). */
(() => {
  "use strict";
  if (!window.matchMedia || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  var SKIP = { ofm: 1, "iem-vis": 1, "sky-grid": 1 }, SKIPL = { "sky-night": 1, "sky-grid-line": 1 };
  var tip = document.createElement("div");
  tip.id = "hover-tip";
  tip.style.cssText = "position:fixed;z-index:9999;pointer-events:none;display:none;max-width:260px;padding:4px 8px;" +
    "border-radius:6px;background:rgba(20,24,32,.92);color:#fff;font:12px/1.35 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.35)";
  var esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var nice = (s) => String(s || "")
    .replace(/^(w|pack)-/, "").replace(/[-_]+/g, " ").replace(/\b(dot|dots|sym|pts|fill|line|layer)\b/g, "").trim().replace(/^./, (c) => c.toUpperCase());
  var PK = { sub: "Subduction edge", conv: "Collision edge", div: "Spreading edge", tr: "Transform edge" };
  /* layers whose features carry the name under their own keys, or whose id makes a poor type word */
  var OWN = {
    "plate-edge": (p) => [PK[p.k] || "Plate edge", (p.pair || "").replace("-", " / ") + (p.v ? " · " + p.v + " mm a year" : "")],
    "pipe-line": (p) => [p.n || (p.s ? p.s + " pipeline" : "Pipeline") + " (no name in OSM)", p.o ? "Operator " + p.o : "Undersea pipeline"],
    "pipe-hit": (p) => [p.n || (p.s ? p.s + " pipeline" : "Pipeline") + " (no name in OSM)", p.o ? "Operator " + p.o : "Undersea pipeline"],
    "sat-trk": (p) => [p.name || "Satellite", "Orbit track"],
    "volc-due": (p) => [p.name || "Volcano", "Volcano · eruption may be due"],
    "acc-ring": (p) => [p.name || p.n || "Accelerator ring", "Particle accelerator"],
    "craton-line": (p) => [p.n || "Craton", "Craton · " + (p.t || "")],
    "craton-fill": (p) => [p.n || "Craton", "Craton · " + (p.t || "")],
    "quake-old": (p) => ["M " + (+p.m).toFixed(1) + " earthquake", String(p.t).slice(0, 4) + (p.d ? " · " + p.d + " km deep" : "")],
    "eclipse-centre": (p) => [(p.kind || "") + " solar eclipse " + (p.date || ""), "Centre line" + (p.dur ? " · " + p.dur : "")],
    "eclipse-fill": (p) => [(p.kind || "") + " solar eclipse " + (p.date || ""), "Eclipse path" + (p.dur ? " · up to " + p.dur : "")],
    "eclipse-line": (p) => [(p.kind || "") + " solar eclipse " + (p.date || ""), "Eclipse path" + (p.dur ? " · up to " + p.dur : "")],
    "obs-cluster": (p) => [p.point_count + " places", "Observatories · zoom in"],
    "storm-track": (p) => [(p.n || "Storm") + (p.y ? " " + p.y : ""), "Storm track"]
  };
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
    var reg = window.SunnyHoverName && window.SunnyHoverName[f.layer.id], key = f.layer.id + ":" + (f.properties || {}).i;
    if (reg) { /* async name from the layer's detail file; the hint shows until it arrives */
      reg(f).then((r) => { if (r && cur === key) show(lx, ly, "<b>" + esc(r[0]) + "</b><br><small>" + esc(r[1]) + "</small>"); }).catch(() => {});
      return "<b>" + esc((window.SunnyLayers && window.SunnyLayers.nameOf && window.SunnyLayers.nameOf(f.layer.id)) || nice(f.layer.id)) + "</b>";
    }
    var own = OWN[f.layer.id] && OWN[f.layer.id](f.properties || {});
    if (own) return "<b>" + esc(own[0]) + "</b><br><small>" + esc(own[1]) + "</small>";
    var hb = window.SunnyHoverBox && window.SunnyHoverBox.label(f.layer.id);
    var p = f.properties || {};
    var name = p.name || p.n || p.title || p.NAME || p.Name || p.label || p.nm || "";
    if (typeof name !== "string" || name.length < 2) name = "";
    /* the item's own name first; the layer's short label is only a type hint, or the title when there is no name */
    if (hb) return name ? "<b>" + esc(name) + "</b><br><small>" + esc(hb) + "</small>" : "<b>" + esc(hb) + "</b>";
    if (f.layer.id === "famous-star") return "<b>" + esc(name) + "</b><br><small>Famous</small>";
    var type = (window.SunnyLayers && window.SunnyLayers.nameOf && window.SunnyLayers.nameOf(f.layer.id)) || nice(f.layer.id) || nice(f.source); /* opt105 */
    if (p.point_count) return "<b>" + p.point_count + " places</b><br><small>" + esc(type) + " · zoom in</small>";
    var kind = p.k || p.cat || p.type || ""; if (String(kind).length < 3) kind = "";
    if (!name) kind = ""; /* a bare code ("found", "div") is not a name */
    return "<b>" + esc(name || type) + "</b>" + (name ? "<br><small>" + esc(type + (kind && kind !== name ? " · " + nice(kind) : "")) + "</small>" : "");
  };
  var hook = () => {
    var m = window.map;
    if (!m || !m.on || !m.getCanvas) return setTimeout(hook, 500);
    document.body.appendChild(tip);
    var cv = m.getCanvas(), dragging = false, raf = 0;
    m.on("dragstart", () => { dragging = true; hide(); });
    m.on("dragend", () => { dragging = false; });
    var le = null; /* the last move wins: a move during a pending frame is not dropped */
    m.on("mousemove", (ev) => {
      le = ev;
      if (dragging || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        var e = le;
        var fs = [];
        try { fs = m.queryRenderedFeatures([[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]]); } catch (x) { fs = []; }
        if (window.SunnyTapSnap) fs = window.SunnyTapSnap.near(m, e.point, fs);
        var ok = fs.filter((g) => g.layer && !SKIP[g.source] && !SKIPL[g.layer.id] && g.layer.type !== "raster");
        var f = ok.find((g) => /circle|symbol/.test(g.layer.type)) || ok.find((g) => g.layer.type === "line") || ok[0]; /* dots win over lines, lines over areas */
        if (f && f.layer.id === "famous-star") { /* opt166: the star stands for the dot under it; name that dot, as a tap does */
          var dot = ok.find((g) => g !== f && g.layer.type === "circle"); if (dot) f = dot;
        }
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
  window.SunnyHoverTip = { label: label };
  window.SunnyHoverName = window.SunnyHoverName || {};
  window.addEventListener("load", () => { hook(); titles(); setInterval(titles, 3000); });
})();
