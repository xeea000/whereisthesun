// workspace/whereisthesun/play-pin.js
/* SUNNY seamless clouds and radar through zoom (opt97). While Play is on (or the radar canvas is
 * showing) a pan or zoom never clears the overlay and never stops Play: the frames keep the view they
 * were made for ("pin"), and the play layers get a CSS transform so they follow the map, scaled. After the
 * map settles, the new view's frames load in the background, nearest the playhead first (low-res
 * first, the existing hi-res fade follows). Once the frame at the playhead and the next are in,
 * the layers swap to the new view and a snapshot of the outgoing picture fades out on top (short crossfade).
 * A new gesture cancels the pending swap. Already held frames come from the existing caches.
 * mapBbox3857, radarTileZ and the zoom-matched image size read the pinned view through here. */
(() => {
  "use strict";
  var pin = null;
  var gen = 0;
  var timer = 0;
  var stats = { swaps: 0, starts: 0 };
  var ids = ["cloud-play-layer", "radar-play-layer"];
  var layers = () => { return ids.map((id) => { return document.getElementById(id); }).filter(Boolean); };
  var raw = () => {
    var p = pin;
    pin = null;
    try { return { box: mapBbox3857(), z: map.getZoom(), b: map.getBounds() }; } finally { pin = p; }
  };
  var same = (a, b) => {
    var x = roundPlayBbox(a), y = roundPlayBbox(b);
    return x.minx === y.minx && x.miny === y.miny && x.maxx === y.maxx && x.maxy === y.maxy;
  };
  var clouds = () => { return !radarOn(); };
  var wants = () => {
    if (overlayNone || tabHidden) return false;
    return radarOn() ? !!radarCanvasOn : !!(playMode && !playUseOpenMeteo);
  };
  var rect = () => {
    var c = map.getContainer();
    var nw = map.project([pin.b.getWest(), pin.b.getNorth()]);
    var se = map.project([pin.b.getEast(), pin.b.getSouth()]);
    return { x: nw.x, y: nw.y, w: se.x - nw.x, h: se.y - nw.y, W: c.clientWidth, H: c.clientHeight };
  };
  var underlay = (show) => {
    if (!clouds() || !playMode) return;
    try { setMapLibreCloudsHidden(!show); } catch (e) {}
  };
  var follow = () => {
    if (!pin) return;
    var r = rect();
    var t = "translate(" + r.x.toFixed(1) + "px," + r.y.toFixed(1) + "px) scale(" + (r.w / r.W).toFixed(5) + "," + (r.h / r.H).toFixed(5) + ")";
    layers().forEach((el) => { el.style.transformOrigin = "0 0"; el.style.transform = t; });
    underlay(!(r.x <= 1 && r.y <= 1 && r.x + r.w >= r.W - 1 && r.y + r.h >= r.H - 1));
  };
  var start = () => {
    if (!wants()) return false;
    gen++;
    clearTimeout(timer);
    if (!pin) { pin = raw(); stats.starts++; }
    follow();
    return true;
  };
  var withPin = (p, fn) => {
    var old = pin;
    pin = p;
    try { return fn(); } finally { pin = old; }
  };
  var near = () => {
    var n = radarOn() ? radarPast.length : cloudTimes.length;
    var i0 = Math.max(0, Math.floor(playheadFrac + 1e-9));
    var out = [];
    for (var k = 0; k < Math.min(n, 6); k++) out.push(Math.min(n - 1, i0 + k) === i0 + k ? i0 + k : (i0 + k) % n);
    return out;
  };
  var ready = (p) => {
    var idx = near().slice(0, 2);
    return withPin(p, () => {
      return idx.every((i) => {
        if (radarOn()) { var r = radarCompPeek(i); return !!(r && r.done); }
        return !window.SunnyDataSaver.keepCloud(clampIndex(i)) || !!cachedPlayRec(i);
      });
    });
  };
  var kick = (p) => {
    withPin(p, () => {
      near().forEach((i) => {
        try {
          if (radarOn()) radarCompBuild(i);
          else kickLoadCloudIndex(i);
        } catch (e) {}
      });
    });
  };
  var paintNow = () => { try { if (radarOn()) paintContinuousRadar(); else paintContinuousClouds(); } catch (e) {} };
  var ghost = () => {
    var r = rect();
    var out = [];
    layers().forEach((el) => {
      if (el.hidden || getComputedStyle(el).display === "none") return;
      var g = document.createElement("canvas");
      g.width = Math.round(r.W);
      g.height = Math.round(r.H);
      g.className = "play-ghost";
      var ctx = g.getContext("2d");
      [].slice.call(el.querySelectorAll("canvas,img")).concat(el.tagName === "CANVAS" ? [el] : []).forEach((c) => {
        var cs = getComputedStyle(c);
        if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return;
        if (c.tagName === "IMG" && !c.naturalWidth) return;
        try { ctx.globalAlpha = +cs.opacity || 1; ctx.drawImage(c, r.x, r.y, r.w, r.h); } catch (e) {}
      });
      g.style.cssText = "position:absolute;left:0;top:0;width:" + r.W + "px;height:" + r.H + "px;pointer-events:none;transition:opacity .35s;opacity:" + (getComputedStyle(el).opacity || 1);
      g.style.zIndex = getComputedStyle(el).zIndex;
      el.parentNode.insertBefore(g, el.nextSibling);
      out.push(g);
    });
    return out;
  };
  var swap = () => {
    paintNow();
    var gs = ghost();
    pin = null;
    layers().forEach((el) => { el.style.transform = ""; });
    paintNow();
    underlay(false);
    stats.swaps++;
    requestAnimationFrame(() => { gs.forEach((g) => { g.style.opacity = "0"; }); });
    setTimeout(() => { gs.forEach((g) => { g.remove(); }); }, 450);
  };
  var settle = () => {
    if (!pin) return;
    var g = ++gen;
    clearTimeout(timer);
    var tries = 0;
    var step = () => {
      if (g !== gen || !pin) return;
      if (!wants()) { pin = null; layers().forEach((el) => { el.style.transform = ""; }); return; }
      if (map.isMoving() || map.isZooming()) { timer = setTimeout(step, 150); return; }
      var t = raw();
      if (same(t.box, pin.box) && Math.abs(t.z - pin.z) < 0.01) { pin = null; follow(); layers().forEach((el) => { el.style.transform = ""; }); underlay(false); return; }
      if (ready(t)) { swap(); return; }
      if (tries++ % 13 === 0) kick(t);
      timer = setTimeout(step, 150);
    };
    timer = setTimeout(step, 120);
  };
  var zoom = () => { return pin ? pin.z : map.getZoom(); };
  window.SunnyPlayPin = { start: start, follow: follow, settle: settle, active: () => { return !!pin; }, box: () => { return pin ? pin.box : null; }, zoom: zoom, stats: stats };
})();
