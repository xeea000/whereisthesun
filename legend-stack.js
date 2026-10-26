// workspace/whereisthesun/legend-stack.js
/* SUNNY opt108 legend stack: a small fold-up panel listing every layer that is on, with its colours.
 * A layer gives its own legend html (legend:); a layer without one gets a swatch read from its map paint. */
(() => {
  "use strict";
  var get = (k, d) => { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
  var put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  var KEYS = ["circle-color", "fill-color", "line-color", "icon-color", "text-color", "fill-extrusion-color"];
  /* every colour string inside a paint value or expression, first few only */
  var colours = (v, out) => {
    if (typeof v === "string" && /^(#|rgb|hsl)/.test(v)) out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => { colours(x, out); });
    return out;
  };
  var shapeOf = (t) => { return t === "line" ? "line" : t === "fill" ? "area" : t === "raster" ? "area" : "dot"; };
  var auto = (map, d) => {
    var ids = (d.taps || []).filter((id) => { return map.getLayer(id); }), cs = [], shape = "dot";
    ids.forEach((id) => {
      var l = map.getLayer(id);
      shape = shapeOf(l.type);
      KEYS.filter((k) => { return k.indexOf(l.type === "symbol" ? "icon" : l.type + "-") === 0; }).forEach((k) => {
        try { var v = map.getPaintProperty(id, k); if (v) colours(v, cs); } catch (e) {}
      });
    });
    cs = cs.filter((c, i) => { return cs.indexOf(c) === i; }).slice(0, 6);
    if (!cs.length) cs = ["#9aa4b2"];
    return cs.map((c) => { return '<i class="ls-sw ls-' + shape + '" style="background:' + c + '"></i>'; }).join("");
  };
  function init(map) {
    var L = window.SunnyLayers;
    if (!L || !L.list || !map || document.getElementById("legend-stack")) return;
    var box = document.createElement("div");
    box.id = "legend-stack"; box.className = "legend-stack";
    box.innerHTML = '<button type="button" class="ls-head"></button><div class="ls-body"></div>';
    document.body.appendChild(box);
    var head = box.firstChild, body = box.lastChild, open = get("sunny-leg-open", window.innerWidth < 700 ? "0" : "1") === "1", last = "";
    var draw = () => {
      var on = L.list();
      box.hidden = !on.length;
      head.textContent = "Legend (" + on.length + ") " + (open ? "▾" : "▸");
      body.hidden = !open;
      if (!open) return;
      var html = on.map((d) => {
        var inner = d.legend ? '<div class="ls-own">' + d.legend + "</div>" : '<span class="ls-auto">' + auto(map, d) + "</span>";
        return '<div class="ls-row"><b>' + (d.icon || "") + " " + d.name + "</b>" + inner + "</div>";
      }).join("");
      if (window.SunnyFamousOn && window.SunnyFamousOn()) html += '<div class="ls-row"><b style="color:#ffd34d">★</b> famous: 30+ Wikipedia languages, or hand-picked</div>';
      if (html !== last) { body.innerHTML = html; last = html; }
    };
    head.addEventListener("click", () => { open = !open; put("sunny-leg-open", open ? "1" : "0"); last = ""; draw(); });
    var t = null, soon = () => { clearTimeout(t); t = setTimeout(draw, 150); };
    document.addEventListener("change", soon);
    map.on("idle", soon);
    draw();
  }
  window.SunnyLegend = (m) => { if (m.loaded()) init(m); else m.once("load", () => { init(m); }); };
})();
