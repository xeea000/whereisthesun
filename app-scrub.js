// workspace/whereisthesun/app-scrub.js
/* SUNNY app, part 14 of 14: timeline scrubbing and start-up wiring.
 * Names here are page-wide and shared by every app-*.js file; startSunny in app.js runs each part's step in order. */
"use strict";
  function pointSkip() {
    return waitingForTap;
  }
  function beginScrub() {
    if (scrubbing) return;
    scrubbing = true;
    cancelIdleGoesWarm();
    scrubWasPlaying = playAnimating;
    if (scrubWasPlaying) {
      /* opt45/opt46: stop clock honestly — settle canvas, Play icon while scrubbing */
      if (playTimer) { clearTimeout(playTimer); playTimer = null; }
      cancelPlayRaf();
      playSession += 1;
      radarPlaySession += 1;
      playBusy = false;
      radarPlayBusy = false;
      playAnimating = false;
      setPlayButtonPlaying(false);
      try { setRadarFadeDuration(0); } catch (eRf) {}
      try { cancelPlayFadeRafOnly(); } catch (ePf) {}
    }
    /* opt64: scrub always draws the keyed canvas at the playhead (paused too); repaint each frame */
    if (!radarOn() && !playUseOpenMeteo && cloudTimes.length && !playMode) enterPlayMode();
    requestAnimationFrame(scrubPaintTick);
  }
  function scrubPaintTick() {
    if (!scrubbing) return;
    if (playMode && !radarOn()) paintContinuousClouds();
    requestAnimationFrame(scrubPaintTick);
  }
  function applyScrubFrame() {
    var raw = scrubDesiredIdx != null ? scrubDesiredIdx : slider.value;
    scrubDesiredIdx = null;
    applyScrubPlayhead(fracFromSliderUi(raw));
    if (radarOn()) {
      setRadarFrame(clampRadarIndex(Math.round(playheadFrac)));
      return;
    }
    setCloudFrame(playheadFrac, { forceHires: true, frac: playheadFrac });
  }
  function flushScrubFrame() {
    /* opt38: cancel pending rAF and apply final index immediately */
    if (scrubRaf) {
      try { cancelAnimationFrame(scrubRaf); } catch (eCaf) {}
      scrubRaf = 0;
    }
    if (scrubDesiredIdx == null) scrubDesiredIdx = Number(slider.value);
    applyScrubFrame();
  }
  function scheduleScrubFrame() {
    if (scrubRaf) return;
    scrubRaf = requestAnimationFrame(() => {
      scrubRaf = 0;
      if (scrubDesiredIdx == null) return;
      applyScrubFrame();
    });
  }
  function endScrub() {
    if (!scrubbing) return;
    scrubbing = false;
    var was = scrubWasPlaying;
    scrubWasPlaying = false;
    flushScrubFrame();
    cancelIdleGoesWarm();
    if (was) {
      startPlay({ resume: true });
    } else if (playMode && !radarOn()) {
      exitPlayMode(); /* opt64: same no-pop handoff as Pause */
    } else if (radarOn() && !tabHidden && radarIndex >= radarSliderMax()) {
      startRadarRefresh();
    } else {
      scheduleIdleGoesWarm();
    }
  }
  function onScrubPointerUp() {
    if (scrubbing) endScrub();
  }
function sunnyStep14() {
  map.on("load", () => {
    /* opt52: critical path — map shell, basemap, GOES tip; defer beach/workers/warm */
    cloudTimes = buildCloudTimes();
    refreshPlayCacheCaps();
    playheadFrac = sliderMax();
    cloudIndex = sliderMax();
    ensureLoopStartInited();
    syncSliderUi();
    syncRangeSeg();
    rebuildTimeTicks();
    ensureBeachLayers();
    applyCloudSolidMode();
    ensureCloudMap(); /* hide unused #cloud-map; mount play layer on map container */
    restorePersistedSettingsAfterMapReady();
    /* opt19: if Radar overlay restored, skip cloud tile boot (mutex) */
    if (!radarOn()) {
      /* opt40: do NOT paint WMTS for optimistic tip — wait for probe (avoids first-paint 404 storm) */
      try {
        if (timeLabel && cloudTimes.length) {
          timeLabel.textContent = formatFrameLabel(cloudTimes[cloudTimes.length - 1]) + " · …";
        }
      } catch (eLbl) {}
      /* opt78: first visit waits (max 1.5 s) for the service worker so it keeps these frames */
      window.SunnySwReady(1500).then(resolveGoesForOrigin).then(showGoesBootTip).catch(showGoesFallbackTip);
    } else {
      try {
        var isoBoot = cloudTimes[cloudTimes.length - 1];
        timeLabel.textContent = formatFrameLabel(isoBoot) + " · NOW";
      } catch (eBoot) {}
    }
    applyBaseMap();
    if (overlayVisible()) {
      restackOverlay();
      healLabels();
      armLabelsIdleHeal();
    } else {
      restackCloudRasters();
      restackRadar();
    }
    /* locate stays quiet/async — never blocks map paint */
    locate({ boot: true });
    /* Heavy work after first paint + idle; independent tasks fire in parallel */
    afterMapBasicsReady(() => {
      /* opt78: beach pieces load only when beaches are searched or shown */
      scheduleIdleGoesWarm();
      setTimeout(() => {
        if (!tabHidden) prefetchFlowWorkerScript();
      }, 2000);
      bootWindIfNeeded();
    });
  });
  map.on("idle", () => {
    /* opt54: glyphs often arrive after first Labels enable — heal once on idle */
    if (labelsIdleHealArmed && overlayVisible()) {
      labelsIdleHealArmed = false;
      healLabels();
    }
  });
  ["beaches-fill", "beaches-line", "beaches-dot"].forEach((layer) => {
    map.on("mousemove", layer, onBeachEnter);
    map.on("mouseleave", layer, onBeachLeave);
    map.on("click", layer, (e) => {
      if (!e.features || !e.features.length) return;
      var b = beachById(e.features[0].properties.id);
      if (!b) return;
      if (dwellTimer) clearTimeout(dwellTimer);
      enrichBeach(b);
    });
  });
  if (window.SunnyPoint) window.SunnyPoint.attach(map, pointSkip); /* opt67: tap for point forecast */
  if (window.SunnyCraters) window.SunnyCraters.attach(map); /* opt74: impact craters (Settings, Sightseeing) */
  if (window.SunnyCrownLand) window.SunnyCrownLand.attach(map); /* opt75: Ontario Crown land overlay */
  map.on("click", (e) => {
    if (!waitingForTap) return;
    saveLastLocate(e.lngLat.lat, e.lngLat.lng);
    loadAround(e.lngLat.lat, e.lngLat.lng);
  });
  btnLocate.addEventListener("click", locate);
  if (btnAll) btnAll.addEventListener("click", showAllBeaches);
  btnSun.addEventListener("click", goNearestBeaches);
  if (toggleSunny) {
    function stopSunBubble(e) {
      if (e && e.stopPropagation) e.stopPropagation();
    }
    toggleSunny.addEventListener("click", stopSunBubble);
    toggleSunny.addEventListener("change", () => {
      bumpWxSearchGen();
      if (searchingSunny) {
        searchingSunny = false;
        unlockSearch();
        setStatus(sunnyModeOn() ? "Sunny on — hit Find again." : "Sunny off — hit Find for nearest beaches.");
      }
    });
    if (toggleSunny.parentNode) {
      toggleSunny.parentNode.addEventListener("click", stopSunBubble);
    }
  }
  if (sunnySheetClose) sunnySheetClose.addEventListener("click", closeSunnySheet);
  btnPlay.addEventListener("click", togglePlay);
  if (toggleLoop) {
    toggleLoop.checked = !!playLoop;
    toggleLoop.addEventListener("change", () => {
      setPlayLoop(!!toggleLoop.checked);
    });
  }
  syncLoopButtonUi();
  if (playSpeedEl) {
    playSpeedEl.value = String(normalizePlaySpeed(playSpeed));
    playSpeedEl.addEventListener("change", () => {
      setPlaySpeed(playSpeedEl.value);
    });
  }
  syncSpeedButtonUi();
  if (btnSpeed) {
    btnSpeed.addEventListener("click", (ev) => {
      ev.stopPropagation();
      toggleSpeedMenu();
    });
  }
  if (speedMenuEl) {
    speedMenuEl.addEventListener("click", (ev) => {
      var t = ev.target;
      while (t && t !== speedMenuEl && !(t.getAttribute && t.getAttribute("data-speed"))) {
        t = t.parentNode;
      }
      if (!t || t === speedMenuEl) return;
      var sp = t.getAttribute("data-speed");
      if (sp == null) return;
      setPlaySpeed(sp);
      closeSpeedMenu();
      ev.stopPropagation();
    });
  }
  document.addEventListener("click", (ev) => {
    if (!speedMenuOpen()) return;
    var t = ev.target;
    if (btnSpeed && (t === btnSpeed || (btnSpeed.contains && btnSpeed.contains(t)))) return;
    if (speedMenuEl && (t === speedMenuEl || (speedMenuEl.contains && speedMenuEl.contains(t)))) return;
    closeSpeedMenu();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" || ev.keyCode === 27) closeSpeedMenu();
  });
  setPlayButtonPlaying(false);
  /* opt49: loop-start splitter drag */
  (() => {
    var el = document.getElementById("loop-splitter");
    if (!el) return;
    var pid = null;
    function onDown(ev) {
      if (ev.button != null && ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      loopSplitterDragging = true;
      el.classList.add("is-dragging");
      pid = ev.pointerId != null ? ev.pointerId : null;
      try { if (pid != null) el.setPointerCapture(pid); } catch (eC) {}
      ensureLoopStartInited();
      setLoopStartFrac(fracFromTrackClientX(ev.clientX));
      if (radarOn()) {
        setRadarFrame(clampRadarIndex(Math.round(playheadFrac)));
      } else if (cloudTimes.length) {
        setCloudFrame(playheadFrac, { forceHires: true, frac: playheadFrac });
      }
    }
    function onMove(ev) {
      if (!loopSplitterDragging) return;
      if (pid != null && ev.pointerId != null && ev.pointerId !== pid) return;
      ev.preventDefault();
      setLoopStartFrac(fracFromTrackClientX(ev.clientX));
      if (radarOn()) {
        setRadarFrame(clampRadarIndex(Math.round(playheadFrac)));
      } else if (cloudTimes.length) {
        setCloudFrame(playheadFrac, { forceHires: true, frac: playheadFrac });
      }
    }
    function onUp(ev) {
      if (!loopSplitterDragging) return;
      if (pid != null && ev.pointerId != null && ev.pointerId !== pid) return;
      loopSplitterDragging = false;
      el.classList.remove("is-dragging");
      try { if (pid != null) el.releasePointerCapture(pid); } catch (eR) {}
      pid = null;
      persistLoopStart();
      syncLoopSplitter();
    }
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("keydown", (ev) => {
      ensureLoopStartInited();
      var max = activeSliderMax();
      var step = Math.max(0.25, max / 100);
      if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") {
        ev.preventDefault();
        setLoopStartFrac(loopStartFrac - step);
      } else if (ev.key === "ArrowRight" || ev.key === "ArrowUp") {
        ev.preventDefault();
        setLoopStartFrac(loopStartFrac + step);
        if (playheadFrac < loopStartFrac) {
          playheadFrac = loopStartFrac;
          syncSliderUi();
        }
      } else if (ev.key === "Home") {
        ev.preventDefault();
        setLoopStartFrac(0);
      } else if (ev.key === "End") {
        ev.preventDefault();
        setLoopStartFrac(max);
      }
    });
    syncLoopSplitter();
  })();
  slider.addEventListener("pointerdown", beginScrub);
  slider.addEventListener("mousedown", beginScrub);
  slider.addEventListener("touchstart", beginScrub, { passive: true });
  slider.addEventListener("input", () => {
    if (!scrubbing) beginScrub();
    cancelIdleGoesWarm();
    scrubDesiredIdx = Number(slider.value);
    applyScrubPlayhead(fracFromSliderUi(scrubDesiredIdx));
    /* reflect clamp/pull back onto native range */
    slider.value = String(sliderUiFromFrac(playheadFrac));
    syncPlayheadThumb();
    scheduleScrubFrame();
  });
  slider.addEventListener("change", endScrub);
  document.addEventListener("pointerup", onScrubPointerUp);
  document.addEventListener("pointercancel", onScrubPointerUp);
  document.addEventListener("mouseup", onScrubPointerUp);
  document.addEventListener("touchend", onScrubPointerUp);
  document.addEventListener("touchcancel", onScrubPointerUp);
  window.addEventListener("blur", () => {
    if (scrubbing) endScrub();
  });
  cloudOpacityEl.addEventListener("input", () => {
    if (radarOn() || cloudOpacityEl.disabled) return;
    var pct = Math.max(0, Math.min(100, Math.round(Number(cloudOpacityEl.value))));
    if (!isFinite(pct)) pct = 0;
    cloudOpacity = pct / 100;
    applyCloudOpacity();
    saveSetting(OPACITY_KEY, String(pct));
  });
  toggleMap.addEventListener("change", () => {
    restackOverlay();
    saveSetting(LABELS_KEY, toggleMap.checked ? "1" : "0");
    if (toggleMap.checked) {
      healLabels();
      armLabelsIdleHeal();
    } else {
      labelsIdleHealArmed = false;
    }
  });
  if (toggleWind) {
    toggleWind.addEventListener("change", onWindToggleChange);
  }
  (() => {
    var seg = document.getElementById("basemap-seg");
    if (!seg) return;
    seg.addEventListener("click", (e) => {
      var t = e.target;
      while (t && t !== seg && !(t.getAttribute && t.getAttribute("data-basemap"))) {
        t = t.parentNode;
      }
      if (!t || t === seg) return;
      var mode = t.getAttribute("data-basemap");
      if (mode) setBasemapMode(mode);
    });
  })();
  if (toggleIntl) {
    toggleIntl.addEventListener("change", () => {
      saveSetting(INTL_KEY, toggleIntl.checked ? "1" : "0");
      if (!isIntl()) {
        ensureHomeCountry().then(() => {
          setStatus("International off. Staying in " + countryLabel() + ".");
          beaches = beachesForMode(beaches);
          nearbyBeaches = beachesForMode(nearbyBeaches);
          paintBeaches(beaches);
          if (allMode) loadViewBeaches();
        });
        return;
      }
      ensureHomeCountry().then(() => {
        if (homeCountry) {
          setStatus("International on. I'll skip " + countryLabel() + ".");
        } else {
          setStatus("International on. I don't know your country yet — hit Locate me first.");
        }
        if (allMode) loadViewBeaches();
      });
    });
  }
  (() => {
    syncOverlaySeg();
    if (!overlaySeg) return;
    overlaySeg.addEventListener("click", (e) => {
      var t = e.target;
      while (t && t !== overlaySeg && !(t.getAttribute && t.getAttribute("data-overlay"))) {
        t = t.parentNode;
      }
      if (!t || t === overlaySeg) return;
      var mode = t.getAttribute("data-overlay");
      if (mode) setOverlayMode(mode);
    });
  })();
  (() => {
    syncRangeSeg();
    if (!rangeSeg) return;
    rangeSeg.addEventListener("click", (e) => {
      var t = e.target;
      while (t && t !== rangeSeg && !(t.getAttribute && t.getAttribute("data-range"))) {
        t = t.parentNode;
      }
      if (!t || t === rangeSeg) return;
      var h = Number(t.getAttribute("data-range"));
      if (h === 6 || h === 12 || h === 24) setHoursBack(h);
    });
  })();
  /* opt12: small FPS meter (rAF, ~4 Hz text, pause when hidden) */
  (() => {
    var el = document.getElementById("fps");
    if (!el) return;
    var frames = 0;
    var last = 0;
    var lastPaint = 0;
    var raf = 0;
    function loop(ts) {
      raf = 0;
      if (tabHidden || document.hidden) return;
      frames += 1;
      if (!last) last = ts;
      if (!lastPaint) lastPaint = ts;
      var dt = ts - lastPaint;
      if (dt >= 250) {
        var fps = Math.round((frames * 1000) / (ts - last || dt));
        el.textContent = fps + " fps";
        frames = 0;
        last = ts;
        lastPaint = ts;
      }
      raf = requestAnimationFrame(loop);
    }
    function start() {
      if (raf || tabHidden || document.hidden) return;
      frames = 0;
      last = 0;
      lastPaint = 0;
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      if (raf) {
        try { cancelAnimationFrame(raf); } catch (eC) {}
        raf = 0;
      }
    }
    window.__sunnyFpsStart = start;
    window.__sunnyFpsStop = stop;
    start();
  })();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      tabHidden = true;
      cancelIdleGoesWarm();
      cancelPlayTimelineWarm();
      stopRadarRefresh();
      stopWindAnim();
      try { if (window.__sunnyFpsStop) window.__sunnyFpsStop(); } catch (eFps) {}
      /* opt35: stuck scrub must not leave play ticker wedged on return */
      if (scrubbing) {
        scrubbing = false;
        scrubWasPlaying = false;
        if (scrubRaf) {
          try { cancelAnimationFrame(scrubRaf); } catch (eScrR) {}
          scrubRaf = 0;
        }
        scrubDesiredIdx = null;
      }
      forceClearPlayGesture("hidden");
      /* opt10: abort/ignore Play WMS prefetch + in-flight frame loads */
      playLoadGen += 1;
      playLoadPending = Object.create(null);
      cancelPlayFade();
      if (playTimer || playMode || playAnimating) {
        resumePlay = true;
        stopPlay();
      }
      try {
        if (map && typeof map.stop === "function") map.stop();
      } catch (eStop) {}
    } else {
      tabHidden = false;
      try { if (window.__sunnyFpsStart) window.__sunnyFpsStart(); } catch (eFps2) {}
      try {
        if (map && typeof map.resume === "function") map.resume();
        if (!radarOn()) setCloudFrame(cloudIndex);
        if (map && typeof map.triggerRepaint === "function") map.triggerRepaint();
      } catch (eRes) {}
      if (windOn) {
        scheduleWindFieldRefresh(true);
        startWindAnim();
      }
      if (radarOn()) {
        fetchAndApplyRadar({ quiet: true, preserveIndex: true }).then((ok) => {
          if (ok && radarOn() && !tabHidden) startRadarRefresh();
        });
      }
      if (resumePlay) {
        resumePlay = false;
        startPlay({ resume: true });
      } else {
        scheduleIdleGoesWarm();
      }
    }
  });
  try {
    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      try {
        navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then((reg) => {
          try { reg.update(); } catch (eUp) {}
        }).catch(() => {});
      } catch (eSw) {}
    }
  } catch (eSw) {}
}
