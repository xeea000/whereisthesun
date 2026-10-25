// workspace/whereisthesun/app-play-clock.js
/* SUNNY app, part 13 of 14: Play clock, playhead, saved settings and view restore.
 * Names here are page-wide and shared by every app-*.js file; startSunny in app.js runs each part's step in order. */
"use strict";
  function kickLoadCloudIndex(idx) {
    try {
      if (playUseOpenMeteo || !cloudTimes.length) return;
      var isoN = cloudTimes[clampIndex(idx)];
      if (!isoN) return;
      var metaN = gibsWmsFrameMeta(isoN, sunnyApp_origin ? sunnyApp_origin.lon : null);
      loadImageSrc(metaN.url, false, metaN.key);
    } catch (eKick) {}
  }
  function kickContinuousPrefetch() {
    if (radarOn() || playUseOpenMeteo || !cloudTimes.length) return;
    var i0 = clampIndex(Math.floor(playheadFrac));
    var i1 = clampIndex(i0 + 1);
    var i2 = clampIndex(i1 + 1);
    kickLoadCloudIndex(i0);
    kickLoadCloudIndex(i1);
    kickLoadCloudIndex(i2);
    /* opt51: hi-res only floor/ceil (+1) — never distant frames while playing */
    try { kickLoadHiResIndex(i0); } catch (eH0) {}
    try { kickLoadHiResIndex(i1); } catch (eH1) {}
    try { kickLoadHiResIndex(i2); } catch (eH2) {}
    if (i0 === playPrefetchAt) return;
    playPrefetchAt = i0;
    try { prefetchPlayIndices(i0); } catch (eP) {}
  }
  function updatePlayheadLabel() {
    if (typeof radarOn === "function" && radarOn() && radarPast && radarPast.length) {
      radarIndex = clampRadarIndex(Math.floor(playheadFrac + 1e-9));
      var frame = radarPast[radarIndex];
      var atNowR = playheadFrac >= radarSliderMax() - 1e-6;
      if (timeLabel) timeLabel.textContent = formatRadarLabel(frame) + (atNowR ? " · NOW" : "");
      return;
    }
    if (!cloudTimes.length) return;
    cloudIndex = clampIndex(Math.floor(playheadFrac + 1e-9));
    var iso = cloudTimes[cloudIndex];
    var atNow = playheadFrac >= sliderMax() - 1e-6;
    if (timeLabel && iso) timeLabel.textContent = formatFrameLabel(iso) + (atNow ? " · NOW" : "");
  }
  function playClockTick(now) {
    playRafId = 0;
    if (!playAnimating) return;
    if (tabHidden) return;
    if (scrubbing || playGestureActive) {
      playRafLastMs = now;
      playRafId = requestAnimationFrame(playClockTick);
      return;
    }
    if (!playRafLastMs) playRafLastMs = now;
    var dt = now - playRafLastMs;
    if (dt < 0) dt = 0;
    if (dt > 80) dt = 80;
    playRafLastMs = now;
    var speed = getPlaySpeed();
    if (!speed || speed <= 0) speed = 1;
    playheadFrac += (dt / PLAY_PACE_MS) * speed;
    var end = activeSliderMax();
    var loopStart = activeLoopStart();
    if (playheadFrac >= end) {
      if (playLoopOn()) {
        playTimelineWarmed = true;
        var over = playheadFrac - end;
        playheadFrac = loopStart + over;
        if (playheadFrac >= end) playheadFrac = loopStart;
        playPrefetchAt = -1;
      } else {
        playheadFrac = end;
        if (radarOn()) radarIndex = radarSliderMax();
        else cloudIndex = sliderMax();
        syncSliderUi();
        updatePlayheadLabel();
        if (!radarOn()) paintContinuousClouds();
        playTimelineWarmed = true;
        stopPlay();
        try { setStatus("At latest — enable Loop or scrub back"); } catch (eEnd) {}
        return;
      }
    }
    playheadFrac = clampFrac(playheadFrac);
    if (radarOn()) {
      var ri = clampRadarIndex(Math.floor(playheadFrac + 1e-9));
      paintContinuousRadar(); /* opt66: no MapLibre tile stepping during Play */
      radarIndex = ri;
    } else {
      cloudIndex = clampIndex(Math.floor(playheadFrac + 1e-9));
      paintContinuousClouds();
      kickContinuousPrefetch();
    }
    syncSliderUi();
    updatePlayheadLabel();
    playRafId = requestAnimationFrame(playClockTick);
  }
  function currentPlayheadMs() {
    if (typeof radarOn === "function" && radarOn() && radarPast && radarPast.length) {
      var fr = radarPast[clampRadarIndex(Math.round(playheadFrac))];
      return fr && fr.time != null ? Number(fr.time) * 1000 : NaN;
    }
    if (cloudTimes.length) {
      var iso = cloudTimes[clampIndex(Math.round(playheadFrac))];
      return goesIsoMs(iso);
    }
    return NaN;
  }
  function setHoursBack(hours, opts) {
    opts = opts || {};
    var h = Number(hours);
    if (h !== 6 && h !== 12 && h !== 24) h = 24;
    if (h === HOURS_BACK && !opts.force) {
      syncRangeSeg();
      return;
    }
    var keepMs = currentPlayheadMs();
    var keepLoopMs = loopStartMs();
    HOURS_BACK = h;
    try { localStorage.setItem(RANGE_KEY, String(h)); } catch (eH) {}
    syncRangeSeg();
    timeTicksSig = "";
    cloudTimes = buildCloudTimes();
    refreshPlayCacheCaps();
    if (isFinite(keepMs) && cloudTimes.length) {
      playheadFrac = nearestCloudIndexByMs(keepMs);
    } else {
      playheadFrac = sliderMax();
    }
    if (isFinite(keepLoopMs) && cloudTimes.length) {
      loopStartFrac = nearestCloudIndexByMs(keepLoopMs);
      loopStartInited = true;
      persistLoopStart();
    } else {
      loopStartFrac = clampLoopStart(loopStartFrac);
    }
    if (playheadFrac < loopStartFrac) playheadFrac = loopStartFrac;
    cloudIndex = clampIndex(Math.round(playheadFrac));
    playPrefetchAt = -1;
    if (radarPastAll && radarPastAll.length) applyRadarPastKeep(keepMs);
    syncSliderUi();
    rebuildTimeTicks();
    if (radarOn()) {
      if (radarPast.length) applyRadarFrameAt(clampRadarIndex(Math.round(playheadFrac)));
    } else if (playAnimating) {
      try { kickContinuousPrefetch(); } catch (eK) {}
    } else if (cloudTimes.length && !tabHidden) {
      setCloudFrame(cloudIndex);
    }
  }
  function stopRadarPlayOnly() {
    radarPlaySession += 1;
    radarPlayBusy = false;
    playAnimating = false;
    cancelPlayRaf();
    try { hideRadarCanvas(true); } catch (eHrc) {}
    setRadarFadeDuration(0);
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    setPlayButtonPlaying(false);
    syncPlayheadThumb();
  }
  function stopCloudPlayOnly() {
    playSession += 1;
    playBusy = false;
    playAnimating = false;
    cancelPlayRaf();
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    setPlayButtonPlaying(false);
    syncPlayheadThumb();
    try { cancelPlayFadeRafOnly(); } catch (eCf) {}
    if (!playCanvasSession) { try { settleMotionToFront(); } catch (eSm) {} } /* opt63: keep keyed canvas */
    if (playMode) exitPlayMode();
    else {
      forceClearPlayGesture("stop");
      try { hidePlayOverlay(); } catch (eHideStop) {}
      setMapLibreCloudsHidden(false);
      if (cloudTimes.length) {
        try {
          var isoStop = goesIsoForStaticRestore();
          presentStaticGibs(gibsTiles(isoStop, sunnyApp_origin ? sunnyApp_origin.lon : null));
        } catch (ePs) {}
      }
      try { applyHires(); } catch (eAhStop) {}
    }
  }
  function startRadarPlay(opts) {
    opts = opts || {};
    var resume = !!opts.resume;
    if (!radarOn()) return;
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    cancelPlayRaf();
    radarPlayBusy = false;
    if (!radarPast.length) {
      fetchAndApplyRadar({ quiet: false, jumpLatest: false }).then((ok) => {
        if (!ok || !radarPast.length) {
          playAnimating = false;
          setPlayButtonPlaying(false);
          if (statusEl) setStatus("Radar unavailable right now.");
          return;
        }
        startRadarPlay({ resume: resume });
      });
      return;
    }
    var end = radarSliderMax();
    var cur = clampFrac(playheadFrac);
    if (Math.abs(cur - radarIndex) > 1.5) cur = radarIndex;
    /* opt49: from Now/end jump to loop-start splitter (even Loop off — play window then stop) */
    if (cur >= end - 1e-6) playheadFrac = radarLoopStartIndex();
    else playheadFrac = cur;
    radarIndex = clampRadarIndex(Math.floor(playheadFrac));
    stopRadarRefresh();
    playAnimating = true;
    setPlayButtonPlaying(true);
    setRadarFadeDuration(playFadeMs());
    radarPlaySession += 1;
    try { warmRadarComposites(); } catch (eWrc) {}
    syncSliderUi();
    playRafLastMs = 0;
    playRafId = requestAnimationFrame(playClockTick);
  }
  /* === END RAINVIEWER RADAR (opt16) + overlay mode (opt19) === */
  function saveSetting(key, val) {
    try { localStorage.setItem(key, val); } catch (eSave) {}
  }
  function saveLastViewDebounced() {
    if (viewSaveTimer) clearTimeout(viewSaveTimer);
    viewSaveTimer = setTimeout(() => {
      viewSaveTimer = null;
      try {
        var c = map.getCenter();
        var z = map.getZoom();
        if (!c || !isFinite(c.lat) || !isFinite(c.lng) || !isFinite(z)) return;
        localStorage.setItem(VIEW_KEY, JSON.stringify({
          lat: Math.round(c.lat * 1e5) / 1e5,
          lon: Math.round(c.lng * 1e5) / 1e5,
          zoom: Math.round(z * 100) / 100
        }));
      } catch (eView) {}
    }, 400);
  }
  function restorePersistedSettingsAfterMapReady() {
    if (settingsRestored) return;
    settingsRestored = true;
    try {
      if (cloudOpacityEl) {
        cloudOpacity = Math.max(0, Math.min(1, Number(cloudOpacityEl.value) / 100));
        applyCloudOpacity();
      }
    } catch (e1) {}
    try {
      setBasemapMode(basemapMode);
    } catch (e2) {}
    try {
      if (overlayVisible()) {
        restackOverlay();
        healLabels();
        armLabelsIdleHeal();
      } else applyOverlay();
    } catch (e3) {}
    try {
      setOverlayMode(overlayMode, { force: true, silent: true, deferFetch: true });
    } catch (eRadarR) {}
    try {
      var raw = localStorage.getItem(VIEW_KEY);
      if (raw) {
        var ov = JSON.parse(raw);
        if (ov && isFinite(ov.lat) && isFinite(ov.lon) && isFinite(ov.zoom)) {
          map.jumpTo({ center: [Number(ov.lon), Number(ov.lat)], zoom: Number(ov.zoom) });
        }
      }
    } catch (e4) {}
  }
  function saveLastLocate(lat, lon) {
    try {
      localStorage.setItem(LOCATE_KEY, JSON.stringify({ lat: lat, lon: lon, t: Date.now() }));
    } catch (eLoc) {}
  }
  function formatLocateAccuracy(meters) {
    if (!isFinite(meters) || meters <= 0) return "";
    if (meters < 1000) return " (±" + Math.round(meters) + " m)";
    var km = meters / 1000;
    var rounded = km >= 10 ? Math.round(km) : (Math.round(km * 10) / 10);
    return " (±" + rounded + " km)";
  }
  /* opt34: Locate me + boot locate wait for a fresh device GPS fix via
     watchPosition. Reject stale OS last-known fixes; never use network/IP
     geolocation fallback. Refuse WiFi/BSSID-only guesses immediately on
     first fresh WiFi-like fix (laptops have no GNSS — don't wait ~22s).
     Boot locate is quiet (no "Waiting for device GPS…" HUD). Only auto
     loadAround when the fix looks like real GNSS, else require map tap.
     Never re-pin from readLastLocate. */
  function clearLocateWatch() {
    if (locateWatchId != null) {
      try { navigator.geolocation.clearWatch(locateWatchId); } catch (eClr) {}
      locateWatchId = null;
    }
    if (locateDeadlineTimer != null) {
      clearTimeout(locateDeadlineTimer);
      locateDeadlineTimer = null;
    }
  }
  /* WiFi/IP databases omit altitude/speed/heading (null). Phones
     with a GNSS chip expose at least one of those, or a tight
     accuracy. Use typeof==='number' — isFinite(null) is true in JS. */
  function finiteCoord(v) {
    return typeof v === "number" && isFinite(v);
  }
  function looksLikeDeviceGps(pos) {
    var c = pos && pos.coords;
    if (!c) return false;
    var acc = c.accuracy;
    var accOk = finiteCoord(acc) && acc > 0;
    if (finiteCoord(c.altitude) || finiteCoord(c.altitudeAccuracy)) return true;
    if ((finiteCoord(c.speed) || finiteCoord(c.heading)) && accOk && acc <= 80) return true;
    /* Some phones omit altitude briefly — treat tight accuracy as GPS. */
    if (accOk && acc <= 50) return true;
    return false;
  }
  function wifiLocateRefuseMessage() {
    return "No GPS chip detected — WiFi location may be wrong (often an old address). Tap the map to drop a pin where you are.";
  }
  function applyLocateFix(pos, opts) {
    opts = opts || {};
    var lat = pos.coords.latitude;
    var lon = pos.coords.longitude;
    var acc = pos.coords.accuracy;
    saveLastLocate(lat, lon);
    var note;
    if (isFinite(acc) && acc > 20000) {
      note = "Location is very approximate" + formatLocateAccuracy(acc);
    } else {
      note = "Located via GPS" + formatLocateAccuracy(acc);
    }
    setStatus(note);
    /* Always use fresh callback coords (the user can be far from home). */
    loadAround(lat, lon);
  }
  function locate(opts) {
    opts = opts || {};
    var boot = !!opts.boot;
    if (!navigator.geolocation) {
      waitingForTap = true;
      setStatus(boot
        ? "Tap the map to set your spot."
        : "Can't get your location. Tap the map to drop a pin.");
      return;
    }
    clearLocateWatch();
    /* Quiet on boot — only show waiting HUD when user taps Locate. */
    if (!boot) setStatus("Waiting for device GPS…");
    var FRESH_MAX_AGE_MS = 60000;
    var ACCEPT_ACCURACY_M = 250;
    var WIFI_REFUSE_ACCURACY_M = 500;
    var WALL_MS = 8000;
    var bestGps = null;
    var sawWifiLike = false;
    var sawStale = false;
    var settled = false;
    function failMsg(kind) {
      if (kind === "wifi") return wifiLocateRefuseMessage();
      if (boot) return "Tap the map to set your spot.";
      if (kind === "stale") return "GPS didn't refresh. Tap the map to drop a pin.";
      return "Couldn't get a fresh GPS fix. Tap the map to drop a pin.";
    }
    function finishFail(msg) {
      if (settled) return;
      settled = true;
      clearLocateWatch();
      waitingForTap = true;
      setStatus(msg);
    }
    function finishOk(pos) {
      if (settled) return;
      settled = true;
      clearLocateWatch();
      applyLocateFix(pos, { fresh: true });
    }
    function onWatchPos(pos) {
      if (settled) return;
      var age = Date.now() - pos.timestamp;
      if (!isFinite(age) || age < 0 || age > FRESH_MAX_AGE_MS) {
        sawStale = true;
        if (!boot) {
          var ageSec = isFinite(age) && age >= 0 ? Math.round(age / 1000) : "?";
          setStatus("Waiting for device GPS… (last fix ~" + ageSec + "s old)");
        }
        return;
      }
      var acc = pos.coords.accuracy;
      var accNum = isFinite(acc) && acc > 0 ? acc : Infinity;
      var hasAlt = finiteCoord(pos.coords.altitude) || finiteCoord(pos.coords.altitudeAccuracy);
      /* Fresh WiFi/network-like → refuse immediately (laptop has no GNSS). */
      if (!looksLikeDeviceGps(pos) || (!hasAlt && accNum > WIFI_REFUSE_ACCURACY_M)) {
        sawWifiLike = true;
        finishFail(failMsg("wifi"));
        return;
      }
      if (!bestGps || accNum < bestGps.acc) {
        bestGps = { pos: pos, acc: accNum };
      }
      if (accNum <= ACCEPT_ACCURACY_M) {
        finishOk(pos);
        return;
      }
      if (!boot) setStatus("Waiting for device GPS…" + formatLocateAccuracy(acc));
    }
    function onWatchErr() {
      if (settled) return;
      /* Permission denied / hard error — do not fall back to network geolocation. */
      finishFail(failMsg("err"));
    }
    locateWatchId = navigator.geolocation.watchPosition(
      onWatchPos,
      onWatchErr,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
    locateDeadlineTimer = setTimeout(() => {
      if (settled) return;
      if (bestGps) {
        finishOk(bestGps.pos);
      } else if (sawWifiLike) {
        finishFail(failMsg("wifi"));
      } else if (sawStale) {
        finishFail(failMsg("stale"));
      } else {
        finishFail(failMsg("none"));
      }
    }, WALL_MS);
  }
  function stopPlay() {
    /* Pause button: fully stop. Do not resume after an in-flight scrub. */
    scrubWasPlaying = false;
    if (radarOn()) {
      stopRadarPlayOnly();
      if (radarOn() && !tabHidden) startRadarRefresh();
      return;
    }
    stopCloudPlayOnly();
  }
  function startPlay(opts) {
    opts = opts || {};
    var resume = !!opts.resume;
    playBusy = false;
    radarPlayBusy = false;
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    cancelPlayRaf();
    if (scrubbing) {
      scrubbing = false;
      scrubWasPlaying = false;
    }
    if (playGestureActive) forceClearPlayGesture("startPlay");
    if (radarOn()) {
      startRadarPlay({ resume: resume });
      return;
    }
    if (!cloudTimes.length) {
      playAnimating = false;
      setStatus("Cloud frames not ready yet.");
      setPlayButtonPlaying(false);
      return;
    }
    var end = sliderMax();
    var cur = clampFrac(playheadFrac);
    if (Math.abs(cur - cloudIndex) > 1.5) cur = cloudIndex;
    /* opt49: jump to loop-start splitter only when starting from end/Now; else resume. */
    if (cur >= end - 1e-6) playheadFrac = playLoopStartIndex();
    else playheadFrac = cur;
    cloudIndex = clampIndex(Math.floor(playheadFrac));
    playAnimating = true;
    setPlayButtonPlaying(true);
    if (!playMode) enterPlayMode();
    else {
      playHoldStaticUntilFirst = true;
      showPlayOverlay();
    }
    var session = ++playSession;
    syncSliderUi();
    playPrefetchAt = -1;
    kickContinuousPrefetch();
    try { startPlayTimelineWarm(); } catch (eTw) {}
    paintContinuousClouds();
    playRafLastMs = 0;
    playRafId = requestAnimationFrame(playClockTick);
    clearCachingFramesHint();
    testWmsCors().then(() => {
      if (playSession !== session || !playAnimating) return;
    });
    if (!playUseOpenMeteo) {
      try {
        var startIdx = cloudIndex;
        var warmRace = warmNearbyFrames(startIdx, PLAY_BOOT_WARM_MIN);
        var warmCap = new Promise((resolve) => {
          setTimeout(() => { resolve(0); }, PLAY_BOOT_WARM_MS);
        });
        Promise.race([warmRace, warmCap]).then(() => {
          if (playSession !== session || !playAnimating) return;
          kickContinuousPrefetch();
        }).catch(() => {});
      } catch (eBoot) {}
    }
  }
  function togglePlay() {
    /* opt45/opt47: if animating → always stop; else start. Never "pressed but no timer → resume". */
    if (playAnimating) {
      stopPlay();
      return;
    }
    startPlay();
  }
  function showGoesBootTip(iso) {
    applyGoesLatestToTimeline(iso);
    if (!playMode && !tabHidden && !radarOn()) {
      var urlNow = gibsTiles(iso || goesLatestIsoSync(), sunnyApp_origin ? sunnyApp_origin.lon : -79);
      presentStaticGibs(urlNow);
      setCloudFrame(cloudIndex);
    }
  }
  function showGoesFallbackTip() {
    /* probe failed — fall back to conservative wall tip once */
    if (!playMode && !tabHidden && !radarOn()) {
      var fb = goesLatestIsoSync();
      applyGoesLatestToTimeline(fb);
      presentStaticGibs(gibsTiles(fb, sunnyApp_origin ? sunnyApp_origin.lon : -79));
      setCloudFrame(cloudIndex);
    }
  }
  function resolveGoesForOrigin() {
    return resolveGoesLatestIso(sunnyApp_origin ? sunnyApp_origin.lon : -79);
  }
function sunnyStep13() {
  map.on("movestart", () => {
    mapGesturing = true;
    try { if (radarCanvasOn) hideRadarCanvas(true); } catch (eRc) {}
    try { windOnGestureStart(); } catch (eWg) {}
    cancelIdleGoesWarm();
    if (playMode) beginPlayMapLock();
  });
  map.on("zoomstart", () => {
    mapGesturing = true;
    try { if (radarCanvasOn) hideRadarCanvas(true); } catch (eRz) {}
    try { windOnGestureStart(); } catch (eWz) {}
    cancelIdleGoesWarm();
    if (playMode) beginPlayMapLock();
  });
  map.on("zoomend", () => {
    mapGesturing = false;
    if (playMode) {
      endPlayMapLock();
      applyCloudRasterResampling();
      return;
    }
    /* static: never leave a stale play overlay covering tiles */
    try {
      var pl = document.getElementById("cloud-play-layer");
      if (pl && !playMode) {
        pl.classList.remove("is-map-locked");
        if (!pl.classList.contains("is-active")) hidePlayOverlay();
      }
    } catch (eZo) {}
    syncCloudMap(true);
    applyHires();
  });
  map.on("move", () => {
    /* opt23: lock only on movestart/zoomstart — residual move must not re-lock after unlock */
    if (!playMode) syncCloudMap(false);
  });
  map.on("resize", () => {
    schedulePlayImageSizeRefresh();
    if (windOn) {
      syncWindCanvasSize();
      windNeedsReseed = true;
      scheduleWindFieldRefresh(false);
    }
  });
  window.addEventListener("orientationchange", schedulePlayImageSizeRefresh);
  map.on("moveend", () => {
    mapGesturing = false;
    try { windOnGestureEnd(); } catch (eWe) {}
    if (playMode) {
      endPlayMapLock();
    } else {
      syncCloudMap(true);
    }
    saveLastViewDebounced();
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      /* opt38: resume heavy work only after gesture quiet (MOVE_DEBOUNCE) */
      if (mapGesturing) return;
      applyCloudRasterResampling();
      paintBeaches(beaches);
      if (allMode) {
        loadViewBeaches();
      } else if (beaches && beaches.length) {
        /* On-demand: warm cells under the view only while beach results are shown (opt78) */
        try {
          var qb = viewBbox();
          ensureRegionsForBbox(qb.south, qb.north, qb.west, qb.east, true).catch(() => {});
        } catch (eMove) {}
      }
      scheduleIdleGoesWarm();
      if (windOn) scheduleWindFieldRefresh(false);
    }, MOVE_DEBOUNCE_MS);
  });
}
