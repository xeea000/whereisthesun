// workspace/whereisthesun/app-play-buffers.js
/* SUNNY app, part 4 of 14: full-resolution cloud images and Play buffers.
 * Names here are page-wide and shared by every app-*.js file; startSunny in app.js runs each part's step in order. */
"use strict";
var swGateOpen, swGateUrl, cloudTweenSource;
  function loadHiResImageSrc(url, cacheKey) {
    var key = cacheKey || url;
    if (tabHidden) return Promise.resolve({ ok: false, url: url, img: null, key: key, cached: false });
    var hit = playHiResLruGet(key);
    if (hit) {
      hit.cached = true;
      return Promise.resolve(hit);
    }
    if (playHiResPending[key]) return playHiResPending[key];
    var p = new Promise((resolve) => {
      if (tabHidden) {
        resolve({ ok: false, url: url, img: null, key: key, cached: false });
        return;
      }
      var img = new Image();
      var settled = false;
      function finish(ok) {
        if (settled) return;
        settled = true;
        delete playHiResPending[key];
        var rec = { ok: !!ok, url: url, img: img, key: key, cached: false, hires: true };
        if (ok) playHiResLruSet(key, rec);
        resolve(rec);
      }
      img.onload = () => { finish(true); };
      img.onerror = () => { finish(false); };
      try { img.crossOrigin = "anonymous"; } catch (e1) {}
      img.src = url;
      setTimeout(() => {
        if (!settled) finish(img.naturalWidth > 0);
      }, 20000);
    });
    playHiResPending[key] = p;
    return p;
  }
  function cachedHiResRec(idx) {
    if (playUseOpenMeteo || !cloudTimes.length || !playHiResWorthwhile()) return null;
    var iso = cloudTimes[clampIndex(idx)];
    if (!iso) return null;
    try {
      var meta = gibsWmsHiResMeta(iso, sunnyApp_origin ? sunnyApp_origin.lon : null);
      var rec = playHiResLruGet(meta.key);
      return rec && rec.ok && rec.img && rec.img.naturalWidth ? rec : null;
    } catch (eR) {
      return null;
    }
  }
  function countHiResPending() {
    var n = 0, k;
    for (k in playHiResPending) {
      if (Object.prototype.hasOwnProperty.call(playHiResPending, k) && playHiResPending[k]) n += 1;
    }
    return n;
  }
  function kickLoadHiResIndex(idx) {
    try {
      if (playUseOpenMeteo || !cloudTimes.length || !playHiResWorthwhile()) return;
      if (!window.SunnyDataSaver.keepCloud(clampIndex(idx)) || window.SunnyDataSaver.mapMoving()) return;
      var isoN = cloudTimes[clampIndex(idx)];
      if (!isoN) return;
      var metaN = gibsWmsHiResMeta(isoN, sunnyApp_origin ? sunnyApp_origin.lon : null);
      /* Already cached or in-flight — free */
      if ((playHiResCache[metaN.key] && playHiResCache[metaN.key].ok) || playHiResPending[metaN.key]) return;
      /* opt51: while playing, never let hi-res exceed soft concurrency (cap 2) */
      if (playAnimating && countHiResPending() >= 2) return;
      playHiResInFlight = countHiResPending() + 1;
      loadHiResImageSrc(metaN.url, metaN.key).then((rec) => {
        playHiResInFlight = countHiResPending();
        if (!rec || !rec.ok) return;
        try {
          if (playAnimating || playCanvasSession) paintContinuousClouds();
        } catch (eP) {}
      });
    } catch (eKick) {}
  }
  function ensurePlayLayer() {
    var layer = document.getElementById("cloud-play-layer");
    if (!layer || !map) return null;
    try {
      /* Sibling of canvas-container so markers/popups (z-index 5) stay above Play */
      var host = map.getContainer && map.getContainer();
      if (host && layer.parentNode !== host) {
        host.appendChild(layer);
        layer.style.position = "absolute";
        layer.style.inset = "0";
        layer.style.width = "100%";
        layer.style.height = "100%";
        layer.style.zIndex = "2";
        layer.style.pointerEvents = "none";
      }
    } catch (ePl) {}
    ensureMotionCanvas(layer);
    return layer;
  }
  function playBufEl(which) {
    var layer = ensurePlayLayer();
    if (!layer) return null;
    return layer.querySelector(which === "b" ? ".cloud-play-b" : ".cloud-play-a");
  }
  function setPlayLayerOpacity() {
    var layer = document.getElementById("cloud-play-layer");
    if (!layer) return;
    var op = gibsEffectiveOpacity();
    layer.style.setProperty("--cloud-play-op", String(op));
    var front = playBufEl(playFrontBuf);
    if (front && front.classList.contains("is-front")) {
      front.style.opacity = String(op);
    }
  }
  function setMapLibreCloudsHidden(hidden) {
    if (overlayXfadeActive) return;
    var m = cloudTargetMap();
    if (!m) return;
    var i, id;
    if (hidden) {
      var idsHide = [GIBS_LAYER, "iem-vis", "msg-clouds"];
      for (i = 0; i < idsHide.length; i++) {
        id = idsHide[i];
        if (!m.getLayer(id)) continue;
        try { m.setLayoutProperty(id, "visibility", "none"); } catch (eV) {}
        if (id === GIBS_LAYER) applyCloudPaint(GIBS_LAYER, 0);
      }
      return;
    }
    /* opt26/opt27: only restore GIBS here — never force-show iem (hires via applyHires) */
    if (m.getLayer(GIBS_LAYER)) {
      try { m.setLayoutProperty(GIBS_LAYER, "visibility", "visible"); } catch (eG) {}
      applyCloudPaint(GIBS_LAYER, gibsEffectiveOpacity());
    }
    /* msg-clouds.js mirrors gibs on its timer; show it again when clouds are on */
    if (m.getLayer("msg-clouds") && m.getLayer(GIBS_LAYER)) {
      try {
        var vis = m.getLayoutProperty(GIBS_LAYER, "visibility") || "visible";
        m.setLayoutProperty("msg-clouds", "visibility", vis);
      } catch (eM) {}
    }
  }
  function showPlayOverlay() {
    if (window.SunnyHandoff) window.SunnyHandoff.cancel();
    var layer = ensurePlayLayer();
    if (!layer) return;
    layer.hidden = false;
    layer.classList.add("is-active");
    if (!playGestureActive) layer.classList.remove("is-map-locked");
    layer.setAttribute("aria-hidden", "false");
    setPlayLayerOpacity();
  }
  function hidePlayOverlay() {
    var layer = document.getElementById("cloud-play-layer");
    if (!layer) return;
    layer.classList.remove("is-active");
    layer.classList.remove("is-map-locked");
    try { layer.style.opacity = ""; } catch (eOpReset) {}
    layer.hidden = true;
    layer.setAttribute("aria-hidden", "true");
    try { hideMotionCanvas(); } catch (eHM) {}
    var imgs = layer.querySelectorAll("img");
    var i;
    for (i = 0; i < imgs.length; i++) {
      imgs[i].classList.remove("is-front");
      imgs[i].classList.remove("is-incoming");
      /* keep src so the layer does not flash empty if re-entered; do not clear */
    }
  }
  function clearPlayFrameStatusIfOurs() {
    try {
      var el = statusEl || document.getElementById("status");
      if (!el) return;
      var cur = el.textContent || "";
      if (cur === "Downloading cloud frame…" || cur === "Blending frames…" ||
          cur === "Caching cloud frames…") {
        setStatus("");
        cachingFramesHint = false;
      }
    } catch (eSt) {}
  }
  function clearPlayFrameHints() {
    if (blendingHintTimer) {
      clearTimeout(blendingHintTimer);
      blendingHintTimer = 0;
    }
    if (loadingFrameHint || blendingFrameHint) {
      loadingFrameHint = false;
      blendingFrameHint = false;
      clearPlayFrameStatusIfOurs();
    }
  }
  function showDownloadingHint(show) {
    /* opt43: only for slow WMS download/decode — never for flow compute */
    if (show && !loadingFrameHint) {
      loadingFrameHint = true;
      blendingFrameHint = false;
      if (blendingHintTimer) { clearTimeout(blendingHintTimer); blendingHintTimer = 0; }
      setStatus("Downloading cloud frame…");
    } else if (!show && loadingFrameHint) {
      loadingFrameHint = false;
      clearPlayFrameStatusIfOurs();
    }
  }
  function scheduleBlendingHint(fromCachedDownload) {
    /* Use only when download was cached and motion blend runs >200ms */
    if (blendingHintTimer) { clearTimeout(blendingHintTimer); blendingHintTimer = 0; }
    if (!fromCachedDownload) return;
    blendingHintTimer = setTimeout(() => {
      blendingHintTimer = 0;
      if (!playMotionActive || loadingFrameHint) return;
      blendingFrameHint = true;
      setStatus("Blending frames…");
    }, BLEND_HINT_MS);
  }
  function clearBlendingHint() {
    if (blendingHintTimer) {
      clearTimeout(blendingHintTimer);
      blendingHintTimer = 0;
    }
    if (blendingFrameHint) {
      blendingFrameHint = false;
      clearPlayFrameStatusIfOurs();
    }
  }
  function addGibsStatic(url) {
    var m = cloudTargetMap();
    if (!m) return;
    var before = cloudStackBefore();
    if (!m.getSource(GIBS_SRC)) {
      m.addSource(GIBS_SRC, {
        type: "raster",
        tiles: [url],
        bounds: gibsBounds(url),
        tileSize: window.SunnyDataSaver.low() ? 512 : 256, /* Low data: one zoom level coarser */
        maxzoom: window.SunnyDataSaver && window.SunnyDataSaver.low() ? 5 : 7,
        attribution: "NASA GIBS / NOAA GOES"
      });
    }
    if (!m.getLayer(GIBS_LAYER)) {
      m.addLayer({
        id: GIBS_LAYER,
        type: "raster",
        source: GIBS_SRC,
        paint: cloudRasterPaint(gibsEffectiveOpacity())
      }, before);
    } else {
      applyCloudPaint(GIBS_LAYER, gibsEffectiveOpacity());
      try { m.moveLayer(GIBS_LAYER, before); } catch (eOrd) {}
    }
    lastGibsUrl = url;
    lastGibsHostLayer = gibsHostLayerKey(url);
    cloudSourcesReady = true;
    restackCloudRasters();
  }
  /* opt167: only ask GIBS for tiles inside the satellite's view disk (outside it every tile is a 404) */
  function gibsBounds(url) {
    return /GOES-West/.test(url) ? [-180, -81, -56, 81] : [-156, -81, -20, 81]; /* east of -20° Meteosat (msg-clouds.js) has the better view */
  }
  function rebuildStaticGibs(url) {
    var m = cloudTargetMap();
    if (!m) return;
    var before = cloudStackBefore();
    if (m.getLayer(GIBS_LAYER)) m.removeLayer(GIBS_LAYER);
    if (m.getSource(GIBS_SRC)) m.removeSource(GIBS_SRC);
    m.addSource(GIBS_SRC, {
      type: "raster",
      tiles: [url],
      bounds: gibsBounds(url),
      tileSize: window.SunnyDataSaver.low() ? 512 : 256,
      maxzoom: window.SunnyDataSaver && window.SunnyDataSaver.low() ? 5 : 7,
      attribution: "NASA GIBS / NOAA GOES"
    });
    m.addLayer({
      id: GIBS_LAYER,
      type: "raster",
      source: GIBS_SRC,
      paint: cloudRasterPaint(gibsEffectiveOpacity())
    }, before);
    lastGibsUrl = url;
    lastGibsHostLayer = gibsHostLayerKey(url);
    restackCloudRasters();
  }
  function setStaticGibsTiles(url) {
    var m = cloudTargetMap();
    if (!m) return false;
    var src = m.getSource(GIBS_SRC);
    if (!src) {
      addGibsStatic(url);
      return true;
    }
    var host = gibsHostLayerKey(url);
    if (host !== lastGibsHostLayer) {
      rebuildStaticGibs(url);
      return true;
    }
    if (typeof src.setTiles === "function") {
      try {
        var cur = src.tiles && src.tiles[0];
        if (cur === url) {
          applyCloudPaint(GIBS_LAYER, gibsEffectiveOpacity());
          return true;
        }
      } catch (eCur) {}
      /* NEVER clearTiles on the visible source — accept brief stale tiles. */
      src.setTiles([url]);
      lastGibsUrl = url;
      applyCloudPaint(GIBS_LAYER, gibsEffectiveOpacity());
      try { m.triggerRepaint(); } catch (eRep) {}
      return true;
    }
    try {
      src.tiles = [url];
      lastGibsUrl = url;
      m.triggerRepaint();
      return true;
    } catch (eTiles) {
      return false;
    }
  }
  function openSwGate() {
    swGateOpen = true;
    return presentStaticGibsNow(swGateUrl);
  }
  function presentStaticGibs(url) {
    if (swGateOpen) return presentStaticGibsNow(url);
    var first = swGateUrl === null;
    swGateUrl = url;
    if (!first) return Promise.resolve(true);
    return window.SunnySwReady(1500).then(openSwGate);
  }
  function presentStaticGibsNow(url) {
    var m = cloudTargetMap();
    if (!m || tabHidden) return Promise.resolve(false);
    if (!cloudSourcesReady || !m.getSource(GIBS_SRC)) {
      addGibsStatic(url);
      return Promise.resolve(true);
    }
    if (url === lastGibsUrl) {
      applyCloudPaint(GIBS_LAYER, gibsEffectiveOpacity());
      restackCloudRasters();
      return Promise.resolve(true);
    }
    /* opt50: fade-in over pop — keep prior tiles visible; MapLibre raster-fade softens new tiles */
    var targetOp = gibsEffectiveOpacity();
    try {
      m.setPaintProperty(GIBS_LAYER, "raster-fade-duration", HI_RES_FADE_MS);
      m.setPaintProperty(GIBS_LAYER, "raster-opacity", overlayNone ? 0 : targetOp);
    } catch (eFd) {}
    setStaticGibsTiles(url);
    restackCloudRasters();
    return Promise.resolve(true);
  }
  function testWmsCors() {
    if (playCorsOk != null) return Promise.resolve(playCorsOk);
    if (window.SunnyLightClouds.on()) return Promise.resolve(playCorsOk = true); /* opt88: no satellite probe */
    return new Promise((resolve) => {
      var iso = cloudTimes.length ? cloudTimes[cloudTimes.length - 1] : goesLatestIsoSync();
      var url = gibsWmsUrl(iso, sunnyApp_origin ? sunnyApp_origin.lon : -79);
      /* <img> display does not need CORS; probe plain load first. */
      var img = new Image();
      var done = false;
      function finish(ok, note) {
        if (done) return;
        done = true;
        playCorsOk = !!ok;
        if (!ok) {
          playUseOpenMeteo = true;
          try { console.warn("GIBS WMS image load failed; Play falls back to Open-Meteo cloud grid.", note || ""); } catch (eW) {}
        } else {
          try { console.info("GIBS WMS Play frames OK (opt8 smooth image overlay)"); } catch (eI) {}
        }
        resolve(playCorsOk);
      }
      img.onload = () => { finish(true); };
      img.onerror = () => {
        /* Retry once with crossOrigin=anonymous (some CDNs differ) */
        var img2 = new Image();
        img2.onload = () => { finish(true); };
        img2.onerror = () => { finish(false, "onerror"); };
        try { img2.crossOrigin = "anonymous"; } catch (eC) {}
        img2.src = url + "&_corsprobe2=" + Date.now();
      };
      img.src = url + "&_corsprobe=" + Date.now();
      setTimeout(() => {
        if (!done) finish(!!(img.naturalWidth > 0), "timeout");
      }, 8000);
    });
  }
  function loadImageSrc(url, preferCors, cacheKey) {
    var key = cacheKey || url;
    if (tabHidden) return Promise.resolve({ ok: false, url: url, img: null, key: key, cached: false });
    var hit = playLruGet(key);
    if (hit) {
      hit.cached = true;
      return Promise.resolve(hit);
    }
    if (playLoadPending[key]) return playLoadPending[key];
    var p = new Promise((resolve) => {
      if (tabHidden) {
        resolve({ ok: false, url: url, img: null, key: key, cached: false });
        return;
      }
      var img = new Image();
      var settled = false;
      function finish(ok) {
        if (settled) return;
        settled = true;
        delete playLoadPending[key];
        var rec = { ok: !!ok, url: url, img: img, key: key, cached: false };
        if (ok) playLruSet(key, rec);
        resolve(rec);
      }
      var retried = false;
      img.onload = () => { finish(true); };
      img.onerror = () => {
        /* opt60: frames always load CORS (GIBS sends ACAO:*) so the GPU engine can use
           them. One CORS retry with a cache-busting param in case a non-CORS
           response for the same URL was cached without the ACAO header. Never plain
           (a tainted frame would force the whole engine to its 2D fallback). */
        if (!retried && !settled) {
          retried = true;
          img.src = url + (url.indexOf("?") >= 0 ? "&" : "?") + "_cors=1";
          return;
        }
        finish(false);
      };
      try { img.crossOrigin = "anonymous"; } catch (e1) {}
      if (window.SunnyLightClouds.handles(url)) {
        /* opt88 Light clouds: draw this frame from Open-Meteo cloud cover instead */
        window.SunnyLightClouds.frameUrl(url).then((du) => {
          if (!du) return finish(false);
          url = du;
          img.src = du;
        });
      } else img.src = url;
      setTimeout(() => {
        if (!settled) finish(img.naturalWidth > 0);
      }, 15000);
    });
    playLoadPending[key] = p;
    return p;
  }
  function cancelPlayFadeRafOnly() {
    if (playFadeRaf) {
      try { cancelAnimationFrame(playFadeRaf); } catch (eC) {}
      playFadeRaf = 0;
    }
    playMotionActive = false;
    try { clearPlayFrameHints(); } catch (eHint) {}
    /* opt37: drop leftover blur if a fade was aborted (hoisted clearPlayBufFilter) */
    try {
      clearPlayBufFilter(playBufEl("a"));
      clearPlayBufFilter(playBufEl("b"));
    } catch (eClr) {}
  }
  function cancelPlayFade() {
    /* Hard cancel — hides canvas (exit/gesture/scrub). */
    cancelPlayFadeRafOnly();
    try { hideMotionCanvas(); } catch (eMot) {}
    playCanvasSession = false;
  }
  function cancelPlayFadeKeepCanvas() {
    /* opt46: between Play segments — stop RAF but keep last motion frame up. */
    cancelPlayFadeRafOnly();
  }
  function clearPlayBufFilter(el) {
    if (!el || !el.style) return;
    try { el.style.filter = ""; } catch (eF) {}
  }
  /* --- opt41/opt42 motion lerp (optical flow warp + pixel blend) --- */
  /* opt59: size Play canvases to the element's CSS box × DPR (sane cap) — never flow res */
  function ensureMotionCanvas(layer) {
    if (!layer) return null;
    var c = layer.querySelector(".cloud-play-motion");
    if (!c) {
      c = document.createElement("canvas");
      c.className = "cloud-play-motion";
      c.setAttribute("aria-hidden", "true");
      layer.appendChild(c);
    }
    return c;
  }
  function motionCanvasEl() {
    var layer = ensurePlayLayer();
    return layer ? ensureMotionCanvas(layer) : null;
  }
  function setPlayMotionAttr(on) {
    var layer = document.getElementById("cloud-play-layer");
    if (!layer) return;
    if (on) layer.setAttribute("data-motion", "1");
    else layer.removeAttribute("data-motion");
  }
  function hideMotionCanvas() {
    var c = document.querySelector("#cloud-play-layer .cloud-play-motion");
    if (c) {
      c.classList.remove("is-on");
      try { c.style.opacity = "0"; } catch (eH) {}
    }
    setPlayMotionAttr(false);
    playCanvasSession = false;
  }
  /* opt51: write-path contexts use alpha; willReadFrequently ONLY where getImageData runs */
  function canvas2dWrite(c) {
    if (!c) return null;
    var ctx = null;
    try {
      ctx = c.getContext("2d", { alpha: true });
    } catch (eW) {
      try { ctx = c.getContext("2d"); } catch (e2) { ctx = null; }
    }
    if (ctx) {
      try { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; } catch (eS) {}
    }
    return ctx;
  }
  function showMotionCanvas(op) {
    var c = motionCanvasEl();
    if (!c) return null;
    c.classList.add("is-on");
    c.style.opacity = String(op == null ? gibsEffectiveOpacity() : op);
    setPlayMotionAttr(true);
    playCanvasSession = true;
    return c;
  }
  function settleMotionToFront() {
    /* opt46: on Pause/stop — park final frame on the front <img>, then hide canvas. */
    var targetOp = gibsEffectiveOpacity();
    var front = playBufEl(playFrontBuf);
    var iso = cloudTimes.length ? cloudTimes[clampIndex(cloudIndex)] : null;
    try {
      if (iso && !playUseOpenMeteo) {
        var meta = gibsWmsFrameMeta(iso, sunnyApp_origin ? sunnyApp_origin.lon : null);
        var rec = playLruGet(meta.key);
        try {
          var hiMeta = gibsWmsHiResMeta(iso, sunnyApp_origin ? sunnyApp_origin.lon : null);
          var hiRec = playHiResLruGet(hiMeta.key);
          if (hiRec && hiRec.ok && hiRec.url) rec = hiRec;
        } catch (eHiSettle) {}
        if (rec && rec.url && front) {
          if (front.src !== rec.url) front.src = rec.url;
          front.style.opacity = String(targetOp);
          clearPlayBufFilter(front);
          front.classList.add("is-front");
          front.classList.remove("is-incoming");
          playLastFrameKey = meta.key;
        }
      } else if (front && front.naturalWidth) {
        front.style.opacity = String(targetOp);
        clearPlayBufFilter(front);
        front.classList.add("is-front");
      }
      var otherId = playFrontBuf === "a" ? "b" : "a";
      var other = playBufEl(otherId);
      if (other) {
        other.style.opacity = "0";
        clearPlayBufFilter(other);
        other.classList.remove("is-front");
        other.classList.remove("is-incoming");
      }
    } catch (eSet) {}
    hideMotionCanvas();
  }
  /* opt60: shared engine glue. */
  function tweenApi() {
    return (typeof window !== "undefined" && window.SunnyTween) ? window.SunnyTween : null;
  }
  function sharedTweenEstimator() {
    var T = tweenApi();
    if (!T) return null;
    if (!tweenEstimator) {
      tweenEstimator = T.createMotionEstimator({ workerUrl: "motion-worker.js?v=opt75", cap: 96, estWidth: 256 });
    }
    return tweenEstimator;
  }
  function nowMs() {
    return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  }
  function cloudTweenLayer() {
    var T = tweenApi();
    if (!T) return null;
    var c = motionCanvasEl();
    if (!c) return null;
    if (cloudTween && cloudTween.renderer.canvas() !== c && c.isConnected) {
      /* canvas replaced (e.g. layer rebuilt) — rebuild renderer on the new element */
      cloudTween = null;
    }
    if (!cloudTween) {
      cloudTween = T.createAnimatedRasterLayer({
        canvas: c,
        motion: TWEEN_MOTION,
        estimator: sharedTweenEstimator(),
        source: cloudTweenSource,
        renderer: { maxSide: PLAY_CANVAS_MAX_SIDE, maxPixels: PLAY_CANVAS_MAX_PIXELS, cloudKey: true }
      });
      exposeTweenDebug();
    }
    return cloudTween;
  }
  function exposeTweenDebug() {
    try {
      window.__sunnyTween = () => {
        return {
          clouds: cloudTween ? JSON.parse(JSON.stringify(cloudTween.stats)) : null,
          radar: radarTween ? JSON.parse(JSON.stringify(radarTween.stats)) : null,
          steer: steerState.last ? { u: steerState.last.u, v: steerState.last.v, at: steerState.key, err: steerState.err } : { err: steerState.err }
        };
      };
    } catch (eD) {}
  }
function sunnyStep04() {
  /* opt78: on a first visit, satellite tiles wait (max 1.5 s) until the service worker
   * controls the page, so it keeps them and the next visit does not download them again. */
  swGateOpen = false;
  swGateUrl = null;
  /* Cloud source adapter — the ONLY cloud-specific part of animation. */
  cloudTweenSource = {
    channel: "cloud",
    cols: 4,
    rows: 3,
    maxMagUv: 0.12,
    count: () => { return cloudTimes.length; },
    keep: (i) => { return window.SunnyDataSaver.keepCloud(i); },
    images: (i) => {
      var rec = cachedPlayRec(i);
      var hi = null;
      try { hi = cachedHiResRec(i); } catch (eH) { hi = null; }
      var fade = 0;
      if (hi) {
        var view = playCurrentViewSuffix();
        if (cloudHiFade.view !== view) { cloudHiFade.view = view; cloudHiFade.t0 = nowMs(); }
        fade = Math.max(0, Math.min(1, (nowMs() - cloudHiFade.t0) / HI_RES_FADE_MS));
      }
      return { base: rec ? rec.img : null, hi: hi ? hi.img : null, hiFade: fade, key: rec ? rec.key : null };
    },
    kick: (i) => {
      kickLoadCloudIndex(i);
      try { kickLoadHiResIndex(i); } catch (eK) {}
    },
    pairKey: (i0, i1) => {
      var a = cachedPlayRec(i0), b = cachedPlayRec(i1);
      return (a && b) ? (a.key + "=>" + b.key) : null;
    },
    prior: (i0, i1) => {
      var ta = Date.parse(cloudTimes[clampIndex(i0)]), tb = Date.parse(cloudTimes[clampIndex(i1)]);
      return steeringPriorUv(ta, tb);
    }
  };
}
