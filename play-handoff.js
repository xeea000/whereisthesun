// workspace/whereisthesun/play-handoff.js
/* SUNNY Pause handoff (opt63). On Pause the Play picture stays on screen while the static
 * cloud tiles load out of sight (opacity 0). Once every tile is in, the static layer fades
 * in and the Play picture fades out together, so no square-by-square loading is visible.
 * A new Play press cancels a handoff that is still waiting. */
(function () {
  "use strict";
  var FADE_MS = 260;
  var MAX_WAIT_MS = 4000;
  var cur = null;
  function setOpacity(map, layerId, op, ms) {
    try {
      map.setPaintProperty(layerId, "raster-opacity-transition", { duration: ms, delay: 0 });
      map.setPaintProperty(layerId, "raster-opacity", op);
    } catch (eOp) {}
  }
  function tilesReady(h) {
    try {
      return h.map.isSourceLoaded(h.srcId) && h.map.areTilesLoaded();
    } catch (eReady) {
      return true;
    }
  }
  function clearOverlayStyle(el) {
    if (!el) return;
    el.style.transition = "";
  }
  function finish(h) {
    if (cur !== h) return;
    cur = null;
    clearOverlayStyle(h.overlay);
    try { h.map.off("sourcedata", h.onData); } catch (eOff) {}
    setOpacity(h.map, h.layerId, h.targetOp(), 0);
    h.done();
  }
  function reveal(h) {
    if (cur !== h || h.revealed) return;
    h.revealed = true;
    clearTimeout(h.maxTimer);
    setOpacity(h.map, h.layerId, h.targetOp(), FADE_MS);
    if (h.overlay) {
      h.overlay.style.transition = "opacity " + FADE_MS + "ms linear";
      h.overlay.style.opacity = "0";
    }
    h.fadeTimer = setTimeout(finish.bind(null, h), FADE_MS + 30);
  }
  function check(h) {
    if (cur === h && tilesReady(h)) reveal(h);
  }
  function cancel() {
    var h = cur;
    if (!h) return;
    cur = null;
    clearTimeout(h.maxTimer);
    clearTimeout(h.fadeTimer);
    try { h.map.off("sourcedata", h.onData); } catch (eOff) {}
    clearOverlayStyle(h.overlay);
    if (h.overlay) h.overlay.style.opacity = "";
  }
  /* opts: map, srcId, layerId, overlay (element), targetOp (function), done (function) */
  function hold(opts) {
    cancel();
    var h = {
      map: opts.map, srcId: opts.srcId, layerId: opts.layerId, overlay: opts.overlay,
      targetOp: opts.targetOp, done: opts.done, revealed: false, maxTimer: 0, fadeTimer: 0
    };
    if (!h.map || !h.map.getLayer || !h.map.getLayer(h.layerId)) {
      h.done();
      return;
    }
    cur = h;
    setOpacity(h.map, h.layerId, 0, 0);
    h.onData = check.bind(null, h);
    h.map.on("sourcedata", h.onData);
    h.maxTimer = setTimeout(reveal.bind(null, h), MAX_WAIT_MS);
    setTimeout(h.onData, 150);
  }
  function isActive() {
    return !!cur;
  }
  window.SunnyHandoff = { hold: hold, cancel: cancel, active: isActive };
})();
