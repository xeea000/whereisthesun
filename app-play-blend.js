// workspace/whereisthesun/app-play-blend.js
/* SUNNY app, part 5 of 14: Play blending, steering wind and frame prefetch.
 * Names here are page-wide and shared by every app-*.js file; startSunny in app.js runs each part's step in order. */
"use strict";
var steerState, STEER_TTL_MS, STEER_FAIL_TTL_MS, omPlayGrid, omPlayPromise;
  function hidePlayBuffersUnderCanvas(img) {
    var a = playBufEl("a"), b = playBufEl("b");
    [a, b].forEach((el) => {
      if (!el) return;
      el.style.opacity = "0";
      clearPlayBufFilter(el);
      el.classList.remove("is-front");
      el.classList.remove("is-incoming");
    });
    if (img) img.classList.add("is-front");
  }
  /* One-shot A→B blend (segment-driven path / non-continuous) through the SAME engine
     renderer as continuous Play — no separate per-layer canvas blend code. */
  function rafEngineBlend(back, front, gen, resolve) {
    var targetOp = gibsEffectiveOpacity();
    var layer = cloudTweenLayer();
    var canvas = layer ? showMotionCanvas(targetOp) : null;
    if (!layer || !canvas || !back || !back.naturalWidth) {
      if (!playAnimating) { hideMotionCanvas(); rafCrossfade(back, front, gen, resolve); }
      else resolve(false);
      return;
    }
    playMotionActive = true;
    playCanvasSession = true;
    hidePlayBuffersUnderCanvas(null);
    var start = nowMs();
    var dur = playFadeMs();
    function step(now) {
      playFadeRaf = 0;
      if (gen !== playLoadGen) {
        playMotionActive = false;
        clearBlendingHint();
        if (!playAnimating) hideMotionCanvas();
        resolve(false);
        return;
      }
      var t = Math.min(1, (now - start) / dur);
      var ok = layer.paintImages(front && front.naturalWidth ? front : back, front && front.naturalWidth ? back : null, playEase(t));
      if (!ok && !playAnimating) {
        playMotionActive = false;
        hideMotionCanvas();
        rafCrossfade(back, front, gen, resolve);
        return;
      }
      if (t < 1) {
        playFadeRaf = requestAnimationFrame(step);
        return;
      }
      playMotionActive = false;
      clearBlendingHint();
      back.classList.add("is-front");
      if (front) front.classList.remove("is-front");
      if (!playAnimating) {
        back.style.opacity = String(targetOp);
        hideMotionCanvas();
      }
      releasePlayStaticHold();
      resolve(true);
    }
    playFadeRaf = requestAnimationFrame(step);
  }
  function paintStaticToMotionCanvas(img, gen, resolve) {
    /* bootstrap / no-pair — one frame onto the engine canvas (no dissolve) */
    var layer = cloudTweenLayer();
    var canvas = layer ? showMotionCanvas(gibsEffectiveOpacity()) : null;
    if (!layer || !canvas || !img || !img.naturalWidth || !layer.paintImages(img, null, 0)) {
      if (!playAnimating) { hideMotionCanvas(); rafCrossfade(img, null, gen, resolve); }
      else resolve(false);
      return;
    }
    hidePlayBuffersUnderCanvas(img);
    releasePlayStaticHold();
    clearPlayFrameHints();
    resolve(true);
  }
  function beginPlayTransition(back, front, gen, backKey, resolve) {
    /* opt60: while animating → shared engine canvas; scrub one-shots → img opacity */
    clearPlayFrameHints();
    if (!back || !back.naturalWidth) {
      resolve(false);
      return;
    }
    if (!front || !front.naturalWidth) {
      if (playAnimating) paintStaticToMotionCanvas(back, gen, resolve);
      else rafCrossfade(back, front, gen, resolve);
      return;
    }
    if (playAnimating) rafEngineBlend(back, front, gen, resolve);
    else rafCrossfade(back, front, gen, resolve);
  }
  function steerViewKey() {
    if (!map) return "";
    var c = map.getCenter();
    return (Math.round(c.lat * 2) / 2).toFixed(1) + "," + (Math.round(c.lng * 2) / 2).toFixed(1);
  }
  function fetchSteering(key) {
    if (steerState.pending) return steerState.pending;
    var b = map.getBounds();
    var cLat = (b.getNorth() + b.getSouth()) / 2, cLon = (b.getEast() + b.getWest()) / 2;
    var dLat = Math.min(2, (b.getNorth() - b.getSouth()) / 4), dLon = Math.min(2, (b.getEast() - b.getWest()) / 4);
    var pts = [[cLat, cLon], [cLat + dLat, cLon], [cLat - dLat, cLon], [cLat, cLon + dLon], [cLat, cLon - dLon]];
    var url = METEO_URL + "?latitude=" + pts.map((p) => { return p[0].toFixed(3); }).join(",") +
      "&longitude=" + pts.map((p) => { return p[1].toFixed(3); }).join(",") +
      "&hourly=wind_speed_700hPa,wind_direction_700hPa&past_days=1&forecast_days=1&wind_speed_unit=ms&timezone=GMT";
    steerState.pending = fetch(url).then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then((data) => {
      var arr = Array.isArray(data) ? data : [data];
      var times = arr[0] && arr[0].hourly && arr[0].hourly.time;
      if (!times || !times.length) throw new Error("no hourly");
      var out = [];
      for (var k = 0; k < times.length; k++) {
        var su = 0, sv = 0, n = 0;
        for (var j = 0; j < arr.length; j++) {
          var h = arr[j] && arr[j].hourly;
          if (!h) continue;
          var sp = h.wind_speed_700hPa && h.wind_speed_700hPa[k];
          var dr = h.wind_direction_700hPa && h.wind_direction_700hPa[k];
          if (sp == null || dr == null || !isFinite(sp) || !isFinite(dr)) continue;
          var rad = dr * Math.PI / 180; /* meteorological "from" */
          su += -sp * Math.sin(rad);
          sv += -sp * Math.cos(rad);
          n++;
        }
        if (n) out.push({ ms: Date.parse(times[k] + "Z"), u: su / n, v: sv / n });
      }
      if (!out.length) throw new Error("empty");
      steerState.key = key;
      steerState.data = { lat: cLat, hours: out };
      steerState.t = Date.now();
      steerState.err = "";
      steerState.pending = null;
      try { if (cloudTween) cloudTween.resetLocks(); if (radarTween) radarTween.resetLocks(); } catch (eR) {}
      return steerState.data;
    }).catch((e) => {
      steerState.key = key;
      steerState.data = null;
      steerState.t = Date.now();
      steerState.err = String(e && e.message || e);
      steerState.pending = null;
      return null;
    });
    return steerState.pending;
  }
  function steerWindAt(ms) {
    var hrs = steerState.data && steerState.data.hours;
    if (!hrs || !hrs.length) return null;
    if (ms <= hrs[0].ms) return hrs[0];
    for (var i = 1; i < hrs.length; i++) {
      if (hrs[i].ms >= ms) {
        var a = hrs[i - 1], b = hrs[i], f = (ms - a.ms) / Math.max(1, b.ms - a.ms);
        return { u: a.u + (b.u - a.u) * f, v: a.v + (b.v - a.v) * f };
      }
    }
    return hrs[hrs.length - 1];
  }
  /* A→B displacement in UV of the current view (x right, y down) or null */
  function steeringPriorUv(msA, msB) {
    if (!map || !isFinite(msA) || !isFinite(msB) || msB === msA) return null;
    var key = steerViewKey();
    var fresh = steerState.key === key && (Date.now() - steerState.t) < (steerState.data ? STEER_TTL_MS : STEER_FAIL_TTL_MS);
    if (!fresh) { fetchSteering(key); if (steerState.key !== key) return null; }
    var w = steerWindAt((msA + msB) / 2);
    if (!w) return null;
    steerState.last = w;
    var box = mapBbox3857();
    var cosPhi = Math.max(0.2, Math.cos((steerState.data.lat || 0) * Math.PI / 180));
    var dt = (msB - msA) / 1000;
    return {
      dx: (w.u * dt / cosPhi) / Math.max(1, box.maxx - box.minx),
      dy: -(w.v * dt / cosPhi) / Math.max(1, box.maxy - box.miny)
    };
  }
  function rafCrossfade(back, front, gen, resolve) {
    /* opt39: true linear crossfade — outgoing targetOp*(1−e), incoming targetOp*e.
       Both buffers stay visible so opacities sum ≈ targetOp (no basemap flash under
       normal; screen blend is the chosen mode for soft Play).
       opt37 blur kept on incoming only: blurMax*(1−e) → 0. */
    var targetOp = gibsEffectiveOpacity();
    var start = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    var dur = playFadeMs(); /* shared pace with radar via playFadeMs */
    var blurMax = PLAY_BLUR_PX;
    if (front) {
      front.style.opacity = String(targetOp);
      clearPlayBufFilter(front);
      front.classList.add("is-front");
      front.classList.remove("is-incoming");
    }
    back.style.opacity = "0";
    back.style.filter = "blur(" + blurMax + "px)";
    back.classList.remove("is-front");
    back.classList.add("is-incoming");
    function step(now) {
      playFadeRaf = 0;
      if (gen !== playLoadGen) {
        try { back.classList.remove("is-incoming"); } catch (eI) {}
        clearPlayBufFilter(back);
        clearPlayBufFilter(front);
        resolve(false);
        return;
      }
      var t = Math.min(1, (now - start) / dur);
      var e = playEase(t);
      /* true lerp: front fades out, back fades in */
      if (front) front.style.opacity = String(targetOp * (1 - e));
      back.style.opacity = String(targetOp * e);
      back.style.filter = "blur(" + (blurMax * (1 - e)).toFixed(2) + "px)";
      if (t < 1) {
        playFadeRaf = requestAnimationFrame(step);
      } else {
        back.style.opacity = String(targetOp);
        clearPlayBufFilter(back);
        back.classList.add("is-front");
        back.classList.remove("is-incoming");
        if (front) {
          front.style.opacity = "0";
          clearPlayBufFilter(front);
          front.classList.remove("is-front");
          front.classList.remove("is-incoming");
        }
        releasePlayStaticHold();
        resolve(true);
      }
    }
    playFadeRaf = requestAnimationFrame(step);
  }
  function crossfadePlayImage(url, cacheKey) {
    return new Promise((resolve) => {
      var backId = playFrontBuf === "a" ? "b" : "a";
      var back = playBufEl(backId);
      var front = playBufEl(playFrontBuf);
      if (!back) {
        resolve(false);
        return;
      }
      var gen = ++playLoadGen;
      /* opt46: between Play segments keep last motion frame; hard-cancel otherwise */
      if (playAnimating && playCanvasSession) cancelPlayFadeKeepCanvas();
      else cancelPlayFade();
      clearPlayFrameHints();
      frameWaitStarted = Date.now();
      playFrameFromCache = false;
      /* Arm download hint only when not already in LRU (prefetch honesty) */
      var keyProbe = cacheKey || url;
      var alreadyCached = !!(keyProbe && playImgCache[keyProbe] && playImgCache[keyProbe].ok);
      var stuckTimer = 0;
      if (!alreadyCached) {
        stuckTimer = setTimeout(() => {
          if (gen === playLoadGen) showDownloadingHint(true);
        }, FRAME_LOAD_STUCK_MS);
      }
      function reveal() {
        if (stuckTimer) clearTimeout(stuckTimer);
        showDownloadingHint(false);
        if (gen !== playLoadGen) {
          resolve(false);
          return;
        }
        if (!back.naturalWidth) {
          /* HOLD the shown image — never clear to empty */
          resolve(false);
          return;
        }
        setPlayLayerOpacity();
        /* opt43: motion if flow cached; else opacity (no ~800ms A-hold) */
        beginPlayTransition(back, front, gen, cacheKey || back.src, (ok) => {
          if (ok) {
            playFrontBuf = backId;
            playLastFrameKey = cacheKey || back.src || playLastFrameKey;
            try { prefetchFlowAhead(cloudIndex); } catch (ePf) {}
            try { prefetchPlayIndices(cloudIndex); } catch (ePi) {}
          }
          resolve(ok);
        });
      }
      loadImageSrc(url, false, cacheKey).then((rec) => {
        if (gen !== playLoadGen) {
          if (stuckTimer) clearTimeout(stuckTimer);
          resolve(false);
          return;
        }
        if (!rec || !rec.ok) {
          if (stuckTimer) clearTimeout(stuckTimer);
          showDownloadingHint(false);
          /* HOLD the shown image — never clear */
          resolve(false);
          return;
        }
        playFrameFromCache = !!(rec.cached || alreadyCached);
        if (playFrameFromCache) {
          /* Cache hit: never show download hint */
          if (stuckTimer) clearTimeout(stuckTimer);
          showDownloadingHint(false);
        }
        if (back.src === rec.url && back.complete && back.naturalWidth) {
          reveal();
          return;
        }
        var settled = false;
        function onReady() {
          if (settled) return;
          settled = true;
          back.onload = null;
          back.onerror = null;
          reveal();
        }
        back.onload = onReady;
        back.onerror = () => {
          if (settled) return;
          settled = true;
          back.onload = null;
          back.onerror = null;
          if (stuckTimer) clearTimeout(stuckTimer);
          showDownloadingHint(false);
          resolve(false);
        };
        /* Keep back behind until loaded — do not blank front */
        if (back.classList.contains("is-front")) back.classList.remove("is-front");
        back.style.opacity = "0";
        back.src = rec.url;
        if (back.complete && back.naturalWidth) onReady();
      });
    });
  }
  function playIndexAtOffset(fromIndex, nSteps) {
    var end = sliderMax();
    var loopStart = playLoopStartIndex();
    var step = playFrameStep();
    var idx = fromIndex + nSteps * step;
    if (idx > end) {
      if (playLoopOn()) {
        var win = Math.max(1, end - loopStart);
        idx = loopStart + ((idx - end - 1) % win);
      } else {
        idx = end;
      }
    }
    if (idx < 0) {
      idx = playLoopOn() ? loopStart : 0;
    }
    return idx;
  }
  function prefetchPlayIndices(fromIndex) {
    if (tabHidden || !cloudTimes.length || playUseOpenMeteo || window.SunnyDataSaver.mapMoving()) return;
    var lon = sunnyApp_origin ? sunnyApp_origin.lon : null;
    var n;
    var pending = [];
    for (n = 1; n <= PLAY_PREFETCH; n++) {
      var idx = playIndexAtOffset(fromIndex, n);
      if (idx === fromIndex || !window.SunnyDataSaver.keepCloud(idx)) continue;
      var iso = cloudTimes[idx];
      var meta = gibsWmsFrameMeta(iso, lon);
      if (!playImgCache[meta.key] && !playLoadPending[meta.key]) {
        pending.push(loadImageSrc(meta.url, false, meta.key));
      }
    }
    /* After images warm (or immediately if already cached), prefetch flow pairs */
    if (pending.length) {
      Promise.all(pending).then(() => {
        try { prefetchFlowAhead(fromIndex); } catch (eP) {}
      }).catch(() => {
        try { prefetchFlowAhead(fromIndex); } catch (eP2) {}
      });
    } else {
      try { prefetchFlowAhead(fromIndex); } catch (eP3) {}
    }
  }
  /* opt52: after first paint (2 rAF) + idle — map shell/tiles win the network */
  function afterMapBasicsReady(fn) {
    function go() {
      try { fn(); } catch (eAf) {}
    }
    try {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (typeof requestIdleCallback === "function") {
            requestIdleCallback(() => { go(); }, { timeout: 900 });
          } else {
            setTimeout(go, 50);
          }
        });
      });
    } catch (eRaf) {
      setTimeout(go, 120);
    }
  }
  function prefetchFlowWorkerScript() {
    /* Warm HTTP/SW cache only — Worker still constructed lazily on Play. */
    try {
      if (document.querySelector('link[data-sunny-flow-prefetch]')) return;
      var link = document.createElement("link");
      link.rel = "prefetch";
      link.as = "script";
      link.href = "motion-worker.js?v=opt75";
      link.setAttribute("data-sunny-flow-prefetch", "1");
      document.head.appendChild(link);
    } catch (ePf) {}
  }
  function cancelIdleGoesWarm() {
    if (idleGoesWarmTimer) {
      clearTimeout(idleGoesWarmTimer);
      idleGoesWarmTimer = null;
    }
  }
  function scheduleIdleGoesWarm() {
    cancelIdleGoesWarm();
    if (tabHidden || playMode || mapGesturing || scrubbing || radarOn()) return;
    if (!cloudTimes.length || playUseOpenMeteo) return;
    idleGoesWarmTimer = setTimeout(() => {
      idleGoesWarmTimer = null;
      warmIdleGoesCache();
    }, IDLE_GOES_WARM_MS);
  }
  function lowDataLink() {
    /* opt76: Save-Data or a slow/cellular link: skip background warming */
    var c = navigator.connection;
    if (!c) return false;
    return !!(c.saveData || c.type === "cellular" || /2g|3g/.test(c.effectiveType || ""));
  }
  function warmIdleGoesCache() {
    /* opt38: quiet 2–4 nearby GOES WMS into playImgCache while idle */
    if (tabHidden || playMode || mapGesturing || scrubbing || radarOn()) return;
    if (!cloudTimes.length || playUseOpenMeteo || lowDataLink()) return;
    try {
      if (map && (map.isMoving() || map.isZooming())) return;
    } catch (eIdle) {}
    var lon = sunnyApp_origin ? sunnyApp_origin.lon : null;
    var from = cloudIndex;
    var offsets = [-2, -1, 1, 2];
    var warmed = 0;
    var oi;
    for (oi = 0; oi < offsets.length && warmed < IDLE_GOES_WARM_COUNT; oi++) {
      var idx = clampIndex(from + offsets[oi]);
      if (idx === from || !window.SunnyDataSaver.keepCloud(idx)) continue;
      var iso = cloudTimes[idx];
      if (!iso) continue;
      var meta = gibsWmsFrameMeta(iso, lon);
      if (!playImgCache[meta.key] && !playLoadPending[meta.key]) {
        loadImageSrc(meta.url, false, meta.key);
        warmed += 1;
      }
    }
  }
  function fetchOpenMeteoCloudGrid() {
    if (omPlayGrid) return Promise.resolve(omPlayGrid);
    if (omPlayPromise) return omPlayPromise;
    var b = map.getBounds();
    var west = b.getWest();
    var east = b.getEast();
    var south = b.getSouth();
    var north = b.getNorth();
    /* coarse grid for morphing heatmap */
    var cols = 24;
    var rows = 16;
    var lats = [];
    var lons = [];
    var r, c;
    for (r = 0; r < rows; r++) {
      lats.push(south + (north - south) * (r + 0.5) / rows);
    }
    for (c = 0; c < cols; c++) {
      lons.push(west + (east - west) * (c + 0.5) / cols);
    }
    /* Open-Meteo multi-point: batch as comma lists (limited); sample subset */
    var sampleLats = [];
    var sampleLons = [];
    for (r = 0; r < rows; r += 2) {
      for (c = 0; c < cols; c += 2) {
        sampleLats.push(lats[r].toFixed(3));
        sampleLons.push(lons[c].toFixed(3));
      }
    }
    var url = METEO_URL +
      "?latitude=" + sampleLats.join(",") +
      "&longitude=" + sampleLons.join(",") +
      "&hourly=cloud_cover&past_days=1&forecast_days=1&timezone=UTC";
    omPlayPromise = fetch(url).then(readJsonSafe).then((data) => {
      /* normalize to array-of-series */
      var series = Array.isArray(data) ? data : [data];
      omPlayGrid = { cols: cols, rows: rows, lats: lats, lons: lons, series: series, sampleStep: 2 };
      return omPlayGrid;
    }).catch(() => {
      omPlayPromise = null;
      return null;
    });
    return omPlayPromise;
  }
  function paintOpenMeteoFrame(iso) {
    return fetchOpenMeteoCloudGrid().then((grid) => {
      if (!grid) return false;
      var canvas = document.createElement("canvas");
      var sz = playImageSize();
      canvas.width = sz.w;
      canvas.height = sz.h;
      var ctx = canvas2dWrite(canvas);
      if (!ctx) return false;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, sz.w, sz.h);
      var targetMs = new Date(iso).getTime();
      var series = grid.series;
      var step = grid.sampleStep || 2;
      var si = 0;
      var r, c;
      for (r = 0; r < grid.rows; r += step) {
        for (c = 0; c < grid.cols; c += step) {
          var s = series[si++];
          if (!s || !s.hourly || !s.hourly.time) continue;
          var times = s.hourly.time;
          var covers = s.hourly.cloud_cover || [];
          var best = 0;
          var bestDiff = Infinity;
          var t;
          for (t = 0; t < times.length; t++) {
            var diff = Math.abs(new Date(times[t]).getTime() - targetMs);
            if (diff < bestDiff) { bestDiff = diff; best = covers[t] || 0; }
          }
          var x0 = Math.floor(c / grid.cols * sz.w);
          var y0 = Math.floor((1 - (r + step) / grid.rows) * sz.h);
          var bw = Math.ceil(step / grid.cols * sz.w) + 1;
          var bh = Math.ceil(step / grid.rows * sz.h) + 1;
          var v = Math.max(0, Math.min(255, Math.round(best * 2.2)));
          ctx.fillStyle = "rgb(" + v + "," + v + "," + v + ")";
          ctx.fillRect(x0, y0, bw, bh);
        }
      }
      var dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      return crossfadePlayImage(dataUrl);
    });
  }
  function presentPlayFrame(iso) {
    if (tabHidden) return Promise.resolve(false);
    showPlayOverlay();
    /* opt23: keep MapLibre under overlay until cover completes when holding/gesture */
    if (!playHoldStaticUntilFirst) setMapLibreCloudsHidden(true);
    if (playUseOpenMeteo) {
      return paintOpenMeteoFrame(iso);
    }
    var meta = gibsWmsFrameMeta(iso, sunnyApp_origin ? sunnyApp_origin.lon : null);
    return crossfadePlayImage(meta.url, meta.key).then((ok) => {
      if (ok) rememberGoesGood(iso);
      if (!ok && playCorsOk === false) {
        playUseOpenMeteo = true;
        return paintOpenMeteoFrame(iso);
      }
      return ok;
    });
  }
  function enterPlayMode() {
    cancelIdleGoesWarm();
    playMode = true;
    refreshPlayCacheCaps();
    omPlayGrid = null;
    omPlayPromise = null;
    ensurePlayLayer();
    showPlayOverlay();
    /* opt21: keep last static GIBS visible under play layer until first cover completes */
    playHoldStaticUntilFirst = true;
    setPlayLayerOpacity();
  }
  function exitPlayMode() {
    playMode = false;
    playHoldStaticUntilFirst = false;
    cancelPlayTimelineWarm();
    forceClearPlayGesture("exit");
    playLoadGen += 1;
    cancelPlayFade();
    softShowPlayOverlayAfterGesture();
    /* opt35: never leave MapLibre clouds muted or overlay map-locked after Play */
    setMapLibreCloudsHidden(false);
    /* opt28: Pause mid-timeline keeps that frame; NOW only if playhead is at end */
    if (cloudTimes.length) presentStaticGibs(gibsTiles(goesIsoForStaticRestore(), sunnyApp_origin ? sunnyApp_origin.lon : null));
    /* opt63: keep the Play picture up until the static tiles have all loaded, then crossfade */
    if (window.SunnyHandoff && map) {
      window.SunnyHandoff.hold({ map: map, srcId: GIBS_SRC, layerId: GIBS_LAYER, overlay: document.getElementById("cloud-play-layer"), targetOp: gibsEffectiveOpacity, done: hidePlayOverlay });
    } else hidePlayOverlay();
    restackCloudRasters();
    if (overlayVisible()) {
      restackOverlay();
      healLabels();
      armLabelsIdleHeal();
    }
    /* opt26: hires only via NOW+zoom rules / ready dates — not forced visible on exit */
    try { applyHires(); } catch (eAh) {}
  }
  function softHidePlayOverlayForGesture() {
    var layer = ensurePlayLayer();
    if (!layer) return;
    layer.classList.add("is-map-locked");
  }
  function softShowPlayOverlayAfterGesture() {
    var layer = ensurePlayLayer();
    if (!layer) return;
    layer.classList.remove("is-map-locked");
  }
  function clearPlayGestureWatch() {
    if (playGestureWatchTimer) {
      clearTimeout(playGestureWatchTimer);
      playGestureWatchTimer = null;
    }
  }
  /* opt35: stuck pan/zoom lock must not freeze the Play ticker forever */
  function forceClearPlayGesture(reason) {
    void reason;
    clearPlayGestureWatch();
    if (playMoveTimer) { clearTimeout(playMoveTimer); playMoveTimer = null; }
    playGestureActive = false;
    softShowPlayOverlayAfterGesture();
  }
function sunnyStep05() {
  /* Steering-level wind prior (Open-Meteo 700 hPa, free/no key).
     Clouds/echoes are advected roughly with the mid-level flow; this gives the motion
     estimator a physically sensible starting vector and a fallback field. */
  steerState = { key: "", data: null, t: 0, pending: null, err: "", last: null };
  STEER_TTL_MS = 30 * 60 * 1000;
  STEER_FAIL_TTL_MS = 10 * 60 * 1000;
  /* --- Open-Meteo fallback heatmap (only if WMS Image CORS fails) --- */
  omPlayGrid = null;
  omPlayPromise = null;
}
