// workspace/whereisthesun/app-radar.js
/* SUNNY app, part 12 of 14: radar composites, radar warm-up and radar tweening.
 * Names here are page-wide and shared by every app-*.js file; startSunny in app.js runs each part's step in order. */
"use strict";
var radarTweenSource;
  function radarTileZ() {
    /* 256-px tiles: MapLibre zoom z (512-px) ≈ tile zoom z+1; composite resolution cap */
    var z = Math.round((map ? map.getZoom() : 3) + 1);
    return Math.max(0, Math.min(window.SunnyRadar.MAX_ZOOM, z));
  }
  function radarCompKey(i) {
    var fr = radarPast[clampRadarIndex(i)];
    if (!fr || !fr.path || !radarHost) return null;
    var box = roundPlayBbox(mapBbox3857());
    return fr.path + "|" + radarTileZ() + "|" + box.minx + "," + box.miny + "," + box.maxx + "," + box.maxy;
  }
  function radarCompTouch(key) {
    var k = radarCompOrder.indexOf(key);
    if (k >= 0) radarCompOrder.splice(k, 1);
    radarCompOrder.push(key);
    while (radarCompOrder.length > RADAR_COMP_CAP) {
      var drop = radarCompOrder.shift();
      delete radarComp[drop];
    }
  }
  function radarComposite(i, build) {
    var key = radarCompKey(i);
    if (!key) return null;
    var rec = radarComp[key];
    if (rec) { radarCompTouch(key); return rec; }
    if (!build) return null;
    var fr = radarPast[clampRadarIndex(i)];
    var z = radarTileZ();
    var box = mapBbox3857();
    var W = 20037508.342789244 * 2;
    var n = Math.pow(2, z);
    var tileM = W / n;
    var pxM = tileM / 256;
    var cw = Math.max(1, Math.round((box.maxx - box.minx) / pxM));
    var ch = Math.max(1, Math.round((box.maxy - box.miny) / pxM));
    var sc = Math.min(1, RADAR_COMP_MAX_SIDE / Math.max(cw, ch));
    cw = Math.max(16, Math.round(cw * sc));
    ch = Math.max(16, Math.round(ch * sc));
    var tx0 = Math.floor((box.minx + W / 2) / tileM), tx1 = Math.floor((box.maxx + W / 2) / tileM);
    var ty0 = Math.floor((W / 2 - box.maxy) / tileM), ty1 = Math.floor((W / 2 - box.miny) / tileM);
    ty0 = Math.max(0, ty0); ty1 = Math.min(n - 1, ty1);
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 64) return null;
    var canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    var ctx = canvas2dWrite(canvas);
    rec = { key: key, canvas: canvas, done: false, failed: 0, total: 0, loaded: 0 };
    radarComp[key] = rec;
    radarCompTouch(key);
    if (!ctx) { rec.done = true; return rec; }
    /* opt65: one WMS GetMap covers the whole view (IEM NEXRAD), drawn to the canvas */
    rec.total = 1;
    var img = new Image();
    img.crossOrigin = "anonymous";
    function onViewLoad() {
      try { ctx.drawImage(img, 0, 0, cw, ch); if (window.SunnyRadarKey) window.SunnyRadarKey.keyCanvas(ctx, cw, ch); } catch (eD) {}
      rec.loaded++;
      rec.done = true;
      try { if (radarCanvasOn || playAnimating) paintContinuousRadar(); } catch (eP) {}
    }
    function onViewError() {
      rec.failed++;
      rec.done = true;
    }
    img.onload = onViewLoad;
    img.onerror = onViewError;
    img.src = window.SunnyRadar.viewUrl(fr.path, box, cw, ch);
    return rec;
  }
  function radarCompPeek(i) {
    return radarComposite(i, false);
  }
  function radarCompBuild(i) {
    return radarComposite(i, true);
  }
  function radarAnyLoaded() {
    for (var i = 0; i < radarPast.length; i++) {
      var r = radarComposite(i, false);
      if (r && r.done && r.loaded) return true;
    }
    return false;
  }
  function radarWarmActive() {
    return radarOn() && playAnimating;
  }
  function radarPlayheadIndex() {
    return clampRadarIndex(Math.floor(playheadFrac + 1e-9));
  }
  function radarCount() {
    return radarPast.length;
  }
  function warmRadarComposites() {
    /* opt66: nearest the playhead first, a few in parallel (radar-warm.js) */
    window.SunnyRadarWarm.start({ count: radarCount, center: radarPlayheadIndex, peek: radarCompPeek, build: radarCompBuild, active: radarWarmActive });
  }
  function radarTweenLayer() {
    var T = tweenApi();
    if (!T) return null;
    var c = radarPlayCanvasEl();
    if (!c) return null;
    if (radarTween && radarTween.renderer.canvas() !== c && c.isConnected) radarTween = null;
    if (!radarTween) {
      radarTween = T.createAnimatedRasterLayer({
        canvas: c,
        motion: TWEEN_MOTION,
        estimator: sharedTweenEstimator(),
        source: radarTweenSource,
        renderer: { maxSide: PLAY_CANVAS_MAX_SIDE, maxPixels: PLAY_CANVAS_MAX_PIXELS }
      });
      exposeTweenDebug();
    }
    return radarTween;
  }
  function showRadarCanvas() {
    var el = radarPlayLayerEl();
    if (!el) return;
    el.style.opacity = String(RADAR_OPACITY);
    if (el.style.display !== "block") el.style.display = "block";
    if (!radarCanvasOn) {
      radarCanvasOn = true;
      try { if (map.getLayer(RADAR_LAYER)) map.setLayoutProperty(RADAR_LAYER, "visibility", "none"); } catch (eV) {}
    }
  }
  function hideRadarCanvas(restore) {
    var el = document.getElementById("radar-play-layer");
    if (el) el.style.display = "none";
    if (!radarCanvasOn) return;
    radarCanvasOn = false;
    if (restore && radarOn() && radarPast.length && radarHost) {
      try { applyRadarFrameAt(clampRadarIndex(Math.floor(playheadFrac + 1e-9)), { blend: false }); } catch (eA) {}
      try { if (map.getLayer(RADAR_LAYER)) map.setLayoutProperty(RADAR_LAYER, "visibility", "visible"); } catch (eV) {}
    }
  }
  /* continuous radar playhead → shared engine; false = caller falls back to MapLibre step */
  function paintContinuousRadar() {
    if (!radarOn() || !radarPast.length || !radarHost || tabHidden || mapGesturing || overlayXfadeActive) {
      if (radarCanvasOn && (mapGesturing || !radarOn())) hideRadarCanvas(radarOn());
      return false;
    }
    if (!radarCanvasOn && !playAnimating) return false;
    var layer = radarTweenLayer();
    if (!layer) return false;
    var max = radarSliderMax();
    /* opt66: paint from whole-view frames only (nearest loaded one while others load); until the
       first frame is in, the current radar image stays on the map untouched — never tile steps */
    if (!radarCanvasOn && !radarAnyLoaded()) return false;
    if (!radarCanvasOn) showRadarCanvas(); /* size the canvas before the first render */
    if (layer.paintAt(playheadFrac, max)) return true;
    if (radarCanvasOn) hideRadarCanvas(false);
    return false;
  }
  function setRadarFrame(i) {
    if (!radarOn()) return Promise.resolve(false);
    if (!radarPast.length || !radarHost) {
      return fetchAndApplyRadar({ quiet: false }).then((ok) => {
        if (!ok) return false;
        return applyRadarFrameAt(i);
      });
    }
    return Promise.resolve(applyRadarFrameAt(i));
  }
  function fetchAndApplyRadar(opts) {
    opts = opts || {};
    if (!radarOn() || !map) return Promise.resolve(false);
    var gen = ++radarFetchGen;
    function onRadarManifest(data) {
      if (gen !== radarFetchGen || !radarOn()) return false;
      var past = (data && data.radar && Array.isArray(data.radar.past)) ? data.radar.past.slice() : [];
      if (!past.length || !data.host) throw new Error("radar frame");
      radarHost = data.host;
      var keepTime = null;
      if (!opts.jumpLatest && radarPast.length && radarIndex < radarSliderMax()) {
        keepTime = radarPast[radarIndex] && radarPast[radarIndex].time;
      }
      radarPastAll = past;
      radarPast = radarPastForRange(past);
      /* opt58: keepMs (wall-time) wins — never snap to latest on overlay toggle */
      if (opts.jumpLatest) {
        radarIndex = radarSliderMax();
      } else if (opts.keepMs != null && isFinite(Number(opts.keepMs))) {
        radarIndex = nearestRadarIndexByMs(Number(opts.keepMs));
      } else if (keepTime != null) {
        var k, match = -1, older = 0;
        for (k = 0; k < radarPast.length; k++) {
          if (radarPast[k] && radarPast[k].time === keepTime) {
            match = k;
            break;
          }
          if (radarPast[k] && radarPast[k].time <= keepTime) older = k;
        }
        radarIndex = match >= 0 ? match : older;
      } else if (radarIndex > radarSliderMax()) {
        radarIndex = radarSliderMax();
      } else if (!radarPast.length) {
        radarIndex = 0;
      }
      if (opts.keepLoopMs != null && isFinite(Number(opts.keepLoopMs)) && loopStartInited && radarPast.length) {
        loopStartFrac = nearestRadarIndexByMs(Number(opts.keepLoopMs));
        persistLoopStart();
      }
      if (radarPast.length && playheadFrac < loopStartFrac) {
        /* playhead remapped in syncRadarTimelineUi from radarIndex */
      }
      var frame = radarPast[clampRadarIndex(radarIndex)] || pickRadarFrame(data);
      if (!frame || !frame.path) throw new Error("radar frame");
      radarPath = frame.path;
      ensureRadarLayer(radarTileUrl(data.host, frame.path), { fadeMs: 0 });
      syncRadarTimelineUi();
      return true;
    }
    function onRadarFail() {
      if (!opts.quiet && statusEl && radarOn()) {
        try {
          statusEl.textContent = "Radar unavailable right now.";
        } catch (eSt) {}
      }
      return false;
    }
    return window.SunnyRadar.fetchManifest().then(onRadarManifest).catch(onRadarFail);
  }
  function overlayXfadeEase(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  }
  function getLayerRasterOpacity(layerId) {
    if (!map || !map.getLayer(layerId)) return 0;
    try {
      var vis = map.getLayoutProperty(layerId, "visibility");
      if (vis === "none") return 0;
    } catch (eVis) {}
    try {
      var v = Number(map.getPaintProperty(layerId, "raster-opacity"));
      return isFinite(v) ? v : 0;
    } catch (eOp) {
      return 0;
    }
  }
  function setLayerRasterOpacity(layerId, op) {
    if (!map || !map.getLayer(layerId)) return;
    try { map.setPaintProperty(layerId, "raster-opacity", op); } catch (eSet) {}
  }
  function playOverlayIsVisible() {
    var layer = document.getElementById("cloud-play-layer");
    return !!(layer && !layer.hidden && layer.classList.contains("is-active"));
  }
  function getPlayOverlayFade() {
    var layer = document.getElementById("cloud-play-layer");
    if (!layer || layer.hidden || !layer.classList.contains("is-active")) return 0;
    var s = layer.style.opacity;
    if (s !== "" && s != null) {
      var n = Number(s);
      if (isFinite(n)) return n;
    }
    return 1;
  }
  function setPlayOverlayFade(op) {
    var layer = document.getElementById("cloud-play-layer");
    if (!layer) return;
    try { layer.style.opacity = String(op); } catch (eFade) {}
  }
  function cancelOverlayXfade() {
    overlayXfadeGen += 1;
    overlayXfadeActive = false;
    if (overlayXfadeRaf) {
      try { cancelAnimationFrame(overlayXfadeRaf); } catch (eC) {}
      overlayXfadeRaf = 0;
    }
  }
  function freezeCloudPlayVisual() {
    /* Stop Play ticking but keep the last overlay frame for the crossfade. */
    playSession += 1;
    playBusy = false;
    playAnimating = false;
    cancelPlayRaf();
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    setPlayButtonPlaying(false);
    try { cancelPlayFadeRafOnly(); } catch (eCf) {}
    try { settleMotionToFront(); } catch (eSm) {}
    try { cancelPlayTimelineWarm(); } catch (eTw) {}
    try { forceClearPlayGesture("overlay-xfade"); } catch (eFg) {}
    playMode = false;
    playHoldStaticUntilFirst = false;
  }
  function captureCloudOpacityForRadar() {
    if (cloudOpacitySavedForRadar == null) {
      var fromEl = cloudOpacityEl ? Number(cloudOpacityEl.value) : Math.round(cloudOpacity * 100);
      if (!isFinite(fromEl) || fromEl < 0) fromEl = 90;
      if (fromEl <= 0) {
        try {
          var sOp = localStorage.getItem(OPACITY_KEY);
          if (sOp != null && isFinite(Number(sOp)) && Number(sOp) > 0) fromEl = Number(sOp);
          else fromEl = 90;
        } catch (eBk) {
          fromEl = 90;
        }
        if (cloudOpacityEl) cloudOpacityEl.value = String(Math.round(fromEl));
        cloudOpacity = fromEl / 100;
      }
      cloudOpacitySavedForRadar = Math.max(0, Math.min(100, Math.round(fromEl)));
    }
  }
  function restoreCloudOpacityValue() {
    var restore = cloudOpacitySavedForRadar != null ? cloudOpacitySavedForRadar : (
      cloudOpacityEl ? Number(cloudOpacityEl.value) : Math.round(cloudOpacity * 100)
    );
    if (!isFinite(restore) || restore < 0) restore = 90;
    cloudOpacity = Math.max(0, Math.min(1, restore / 100));
    if (cloudOpacityEl) cloudOpacityEl.value = String(Math.round(restore));
    return restore;
  }
  function showCloudRastersForXfade(startOp) {
    var m = cloudTargetMap();
    if (!m) return;
    if (m.getLayer(GIBS_LAYER)) {
      try { m.setLayoutProperty(GIBS_LAYER, "visibility", "visible"); } catch (eG) {}
      try { m.setPaintProperty(GIBS_LAYER, "raster-opacity", startOp); } catch (eOp) {}
      try { m.setPaintProperty(GIBS_LAYER, "raster-fade-duration", OVERLAY_XFADE_MS); } catch (eFd) {}
    }
  }
  function runOverlayXfade(spec) {
    cancelOverlayXfade();
    var gen = overlayXfadeGen;
    overlayXfadeActive = true;
    var start = 0;
    var ms = spec.ms || OVERLAY_XFADE_MS;
    var cloudFromG = spec.cloudFromG;
    var cloudFromI = spec.cloudFromI;
    var cloudToG = spec.cloudToG;
    var cloudToI = spec.cloudToI;
    var radarFrom = spec.radarFrom;
    var radarTo = spec.radarTo;
    var playFrom = spec.playFrom;
    var playTo = spec.playTo;
    var fadePlay = spec.fadePlay;
    function applyAt(e) {
      setLayerRasterOpacity(GIBS_LAYER, cloudFromG + (cloudToG - cloudFromG) * e);
      if (map && map.getLayer("iem-vis")) {
        setLayerRasterOpacity("iem-vis", cloudFromI + (cloudToI - cloudFromI) * e);
      }
      if (radarTo != null || radarFrom > 0) {
        if (map && map.getLayer(RADAR_LAYER)) {
          setLayerRasterOpacity(RADAR_LAYER, radarFrom + (radarTo - radarFrom) * e);
        }
      }
      if (fadePlay) setPlayOverlayFade(playFrom + (playTo - playFrom) * e);
    }
    applyAt(0);
    function step(now) {
      if (gen !== overlayXfadeGen) return;
      if (!start) start = now;
      var t = Math.max(0, Math.min(1, (now - start) / ms));
      applyAt(overlayXfadeEase(t));
      if (t < 1) {
        overlayXfadeRaf = requestAnimationFrame(step);
        return;
      }
      overlayXfadeRaf = 0;
      overlayXfadeActive = false;
      if (typeof spec.onDone === "function") spec.onDone();
    }
    overlayXfadeRaf = requestAnimationFrame(step);
  }
  function muteCloudsForRadar() {
    /* Keep slider value visible; disable it; hide rasters; stop cloud Play. */
    captureCloudOpacityForRadar();
    freezeCloudPlayVisual();
    setCloudSliderDisabled(true);
    setMapLibreCloudsHidden(true);
    try { applyCloudSolidMode(); } catch (eSol) {}
    try { hidePlayOverlay(); } catch (eHide) {}
  }
  function unmuteCloudsAfterRadar() {
    restoreCloudOpacityValue();
    cloudOpacitySavedForRadar = null;
    setCloudSliderDisabled(false);
    setMapLibreCloudsHidden(false);
    try { applyCloudOpacity(); } catch (eApp) {}
    try {
      if (!tabHidden && cloudTimes.length) setCloudFrame(cloudIndex);
    } catch (eFrame) {}
  }
  function setOverlayMode(mode, opts) {
    opts = opts || {};
    if (mode !== "clouds" && mode !== "radar") return;
    var prev = overlayMode;
    if (mode === prev && !opts.force) {
      syncOverlaySeg();
      return;
    }
    /* opt58: capture wall-time BEFORE mode flip (GOES ISO vs RainViewer sec) */
    var keepMs = NaN;
    var keepLoopMs = NaN;
    try { keepMs = currentPlayheadMs(); } catch (eKm) {}
    try { keepLoopMs = loopStartInited ? loopStartMs() : NaN; } catch (eKl) {}
    /* Boot restore (force+silent) stays instant; user clicks crossfade. */
    var instant = !!(opts.force && (opts.silent || opts.deferFetch)) || !!opts.instant || !map;
    if (mode !== prev) cancelOverlayXfade();
    if (mode !== "radar") { try { hideRadarCanvas(true); } catch (eRcm) {} }
    overlayMode = mode;
    timeTicksSig = "";
    syncOverlaySeg();
    saveSetting(OVERLAY_KEY, mode);
    saveSetting(RADAR_KEY, mode === "radar" ? "1" : "0");
    if (mode === "radar") {
      captureCloudOpacityForRadar();
      freezeCloudPlayVisual();
      setCloudSliderDisabled(true);
      if (btnPlay) btnPlay.setAttribute("aria-label", "Play radar animation");
      if (!opts.silent) setStatus("Radar on — Play loops rain.");
      function kickRadarFetch() {
        /* Never jumpLatest on overlay toggle — map keepMs onto radar timeline */
        fetchAndApplyRadar({
          quiet: !!opts.silent,
          jumpLatest: false,
          keepMs: keepMs,
          keepLoopMs: keepLoopMs
        }).then((ok) => {
          if (!radarOn()) return;
          if (ok && !tabHidden) startRadarRefresh();
          if (!opts.silent && !ok) setStatus("Radar unavailable right now.");
        });
      }
      if (instant) {
        muteCloudsForRadar();
        if (opts.deferFetch) afterMapBasicsReady(kickRadarFetch);
        else kickRadarFetch();
      } else {
        var fadePlay = playOverlayIsVisible();
        var cloudFromG = getLayerRasterOpacity(GIBS_LAYER);
        var cloudFromI = getLayerRasterOpacity("iem-vis");
        var radarFrom = getLayerRasterOpacity(RADAR_LAYER);
        var playFrom = fadePlay ? getPlayOverlayFade() : 0;
        if (map && map.getLayer(RADAR_LAYER)) {
          try { map.setLayoutProperty(RADAR_LAYER, "visibility", "visible"); } catch (eVisR) {}
        }
        try {
          if (map && map.getLayer(RADAR_LAYER)) {
            map.setPaintProperty(RADAR_LAYER, "raster-fade-duration", OVERLAY_XFADE_MS);
          }
        } catch (eFdR) {}
        runOverlayXfade({
          cloudFromG: cloudFromG,
          cloudFromI: cloudFromI,
          cloudToG: 0,
          cloudToI: 0,
          radarFrom: radarFrom,
          radarTo: RADAR_OPACITY,
          playFrom: playFrom,
          playTo: 0,
          fadePlay: fadePlay,
          ms: OVERLAY_XFADE_MS,
          onDone: () => {
            if (!radarOn()) return;
            muteCloudsForRadar();
          }
        });
        kickRadarFetch();
      }
    } else {
      stopRadarPlayOnly();
      stopRadarRefresh();
      radarFetchGen += 1; /* invalidate in-flight radar so it cannot re-add during fade-out */
      if (btnPlay) btnPlay.setAttribute("aria-label", "Play cloud animation");
      if (!opts.silent) setStatus("Clouds on.");
      function applyCloudPlayheadKeep() {
        /* Map preserved wall-time onto GOES index space; leave loop splitter mapped */
        if (isFinite(keepMs) && cloudTimes.length) {
          playheadFrac = nearestCloudIndexByMs(keepMs);
          cloudIndex = clampIndex(Math.round(playheadFrac));
        }
        if (isFinite(keepLoopMs) && cloudTimes.length && loopStartInited) {
          loopStartFrac = nearestCloudIndexByMs(keepLoopMs);
          persistLoopStart();
        }
        if (cloudTimes.length && playheadFrac < loopStartFrac) playheadFrac = loopStartFrac;
        cloudIndex = clampIndex(Math.round(playheadFrac));
        try { syncSliderUi(); } catch (eSu) {}
        try { updatePlayheadLabel(); } catch (eUl) {}
      }
      if (instant) {
        applyCloudPlayheadKeep();
        hideRadarLayer();
        unmuteCloudsAfterRadar();
      } else {
        var restore = restoreCloudOpacityValue();
        var targetG = Math.max(0, Math.min(1, restore / 100));
        try { if (typeof gibsEffectiveOpacity === "function") targetG = gibsEffectiveOpacity(); } catch (eTg) {}
        var radarFromC = getLayerRasterOpacity(RADAR_LAYER);
        var cloudFromGc = getLayerRasterOpacity(GIBS_LAYER);
        var cloudFromIc = getLayerRasterOpacity("iem-vis");
        var fadePlayC = playOverlayIsVisible();
        var playFromC = fadePlayC ? getPlayOverlayFade() : 0;
        setCloudSliderDisabled(false);
        showCloudRastersForXfade(cloudFromGc);
        applyCloudPlayheadKeep();
        try {
          if (map && map.getLayer(RADAR_LAYER)) {
            map.setPaintProperty(RADAR_LAYER, "raster-fade-duration", OVERLAY_XFADE_MS);
          }
        } catch (eFdC) {}
        runOverlayXfade({
          cloudFromG: cloudFromGc,
          cloudFromI: cloudFromIc,
          cloudToG: targetG,
          cloudToI: 0,
          radarFrom: radarFromC,
          radarTo: 0,
          playFrom: playFromC,
          playTo: fadePlayC ? 1 : 0,
          fadePlay: fadePlayC,
          ms: OVERLAY_XFADE_MS,
          onDone: () => {
            if (radarOn()) return;
            hideRadarLayer();
            unmuteCloudsAfterRadar();
          }
        });
      }
    }
    rebuildTimeTicks();
  }
  function setRadarEnabled(on) {
    /* Compat shim — setOverlayMode is the main entry */
    setOverlayMode(on ? "radar" : "clouds", { force: true });
  }
  function cancelPlayRaf() {
    if (playRafId) {
      try { cancelAnimationFrame(playRafId); } catch (eC) {}
      playRafId = 0;
    }
    playRafLastMs = 0;
  }
  function hidePlayImgsForCanvas() {
    var a = playBufEl("a"), b = playBufEl("b");
    if (a) {
      a.style.opacity = "0";
      clearPlayBufFilter(a);
      a.classList.remove("is-front");
      a.classList.remove("is-incoming");
    }
    if (b) {
      b.style.opacity = "0";
      clearPlayBufFilter(b);
      b.classList.remove("is-front");
      b.classList.remove("is-incoming");
    }
  }
  function cachedPlayRec(idx) {
    if (playUseOpenMeteo || !cloudTimes.length) return null;
    var iso = cloudTimes[clampIndex(idx)];
    if (!iso) return null;
    try {
      var meta = gibsWmsFrameMeta(iso, sunnyApp_origin ? sunnyApp_origin.lon : null);
      var rec = playLruGet(meta.key);
      return rec && rec.ok && rec.img && rec.img.naturalWidth ? rec : null;
    } catch (eR) {
      return null;
    }
  }
  function paintContinuousClouds() {
    if (tabHidden || radarOn()) return;
    if (playUseOpenMeteo) {
      var omIdx = clampIndex(Math.floor(playheadFrac));
      if (omIdx !== playPrefetchAt && cloudTimes[omIdx]) {
        playPrefetchAt = omIdx;
        presentPlayFrame(cloudTimes[omIdx]);
      }
      return;
    }
    /* opt60: continuous playhead → shared engine (GPU advection tween, linear fallback) */
    var layer = cloudTweenLayer();
    if (!layer) return;
    var canvas = showMotionCanvas(gibsEffectiveOpacity());
    if (!canvas) return;
    hidePlayImgsForCanvas();
    playMotionActive = true;
    playCanvasSession = true;
    var max = sliderMax();
    var painted = layer.paintAt(playheadFrac, max);
    if (painted) {
      releasePlayStaticHold();
      var i0 = Math.max(0, Math.min(max, Math.floor(playheadFrac)));
      var t = playheadFrac - i0;
      var recF = cachedPlayRec(t > 0.5 && i0 < max ? i0 + 1 : i0) || cachedPlayRec(i0);
      if (recF) playLastFrameKey = recF.key;
      /* paused/held: finish the full-res fade-in without a playhead tick */
      if (!playAnimating && !cloudHiFadeRaf && cloudHiFade.t0 && nowMs() - cloudHiFade.t0 < HI_RES_FADE_MS + 50) {
        cloudHiFadeRaf = requestAnimationFrame(() => {
          cloudHiFadeRaf = 0;
          if (playCanvasSession && !playAnimating) paintContinuousClouds();
        });
      }
    }
  }
function sunnyStep12() {
  radarTweenSource = {
    channel: "radar",
    cols: 4,
    rows: 3,
    maxMagUv: 0.12,
    count: () => { return radarPast.length; },
    images: (i) => {
      var rec = radarComposite(i, false);
      return { base: rec && rec.done && rec.loaded > 0 ? rec.canvas : null, hi: null, hiFade: 0 };
    },
    kick: (i) => { radarComposite(i, true); },
    pairKey: (i0, i1) => {
      var a = radarCompKey(i0), b = radarCompKey(i1);
      return (a && b) ? a + "=>" + b : null;
    },
    prior: (i0, i1) => {
      var a = radarPast[clampRadarIndex(i0)], b = radarPast[clampRadarIndex(i1)];
      if (!a || !b) return null;
      return steeringPriorUv(Number(a.time) * 1000, Number(b.time) * 1000);
    }
  };
}
