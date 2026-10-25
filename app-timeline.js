// workspace/whereisthesun/app-timeline.js
/* SUNNY app, part 2 of 14: timeline slider, loop start and frame index helpers.
 * Names here are page-wide and shared by every app-*.js file; startSunny in app.js runs each part's step in order. */
"use strict";
var CLOUD_FADE_MS, PLAY_PACE_MS, PLAY_DWELL_MS, FRAME_LOAD_STUCK_MS, FRAME_PLAY_STEP, PLAY_PREFETCH, PLAY_BOOT_WARM_MIN, PLAY_BOOT_WARM_MS;
var PLAY_MOVE_DEBOUNCE_MS, PLAY_LRU_CAP, PLAY_LRU_CAP_MAX, PLAY_WARM_CONCURRENCY, PLAY_WARM_STATUS_MIN, PLAY_BLUR_PX, WMS_MAX_SIDE_PHONE, WMS_MAX_SIDE_TABLET;
var WMS_MAX_SIDE_DESKTOP, WMS_MAX_SIDE_DESKTOP_HI, HI_RES_MAX_SIDE, HI_RES_FADE_MS, PLAY_HIRES_LRU_CAP, GIBS_SRC, GIBS_LAYER, cloudMap;
var lastGibsUrl, lastGibsHostLayer, cloudSourcesReady, playSession, playBusy, playAnimating, playheadFrac, loopStartFrac;
var loopStartInited, loopSplitterDragging, savedLoopStartFrac, playRafId, playRafLastMs, playPrefetchAt, playMode, scrubbing;
var scrubWasPlaying, scrubDesiredIdx, scrubRaf, mapGesturing, idleGoesWarmTimer, IDLE_GOES_WARM_MS, IDLE_GOES_WARM_COUNT, timeTicksSig;
var playHoldStaticUntilFirst, playGestureActive, playGestureWatchTimer, PLAY_GESTURE_MAX_MS, PLAY_FRAME_TIMEOUT_MS, PLAY_HOLD_MAX_RETRIES, playFrontBuf, playImgCache;
var playLruOrder, playLoadPending, playHiResCache, playHiResOrder, playHiResPending, playHiResFade, playHiResRaf, playSliderWriteMs;
var PLAY_SLIDER_THROTTLE_MS, playHiResInFlight, playLoadGen, playFadeRaf, playMoveTimer, TWEEN_MOTION, tweenEstimator, cloudTween;
var cloudHiFade, cloudHiFadeRaf, PLAY_CANVAS_MAX_SIDE, PLAY_CANVAS_MAX_PIXELS, BLEND_HINT_MS, playMotionActive, playCanvasSession, playLastFrameKey;
var playCorsOk, playUseOpenMeteo, loadingFrameHint, blendingFrameHint, blendingHintTimer, frameWaitStarted, playFrameFromCache, playWarmGen;
var playWarmActive, playWarmTimer, playWarmInFlight, playWarmHintShown, playTimelineWarmed, cachingFramesHint, speedMenuEl, PLAY_ICO_HTML;
var PAUSE_ICO_HTML;
  function rebuildTimeTicks() {
    if (!timeTicksEl) return;
    var max, i, ix, frac, lab, edge, html, sig, idxs, fr;
    if (typeof radarOn === "function" && radarOn() && radarPast && radarPast.length) {
      max = radarSliderMax();
      sig = "r|" + max + "|" + (radarPast[0] && radarPast[0].time) + "|" + (radarPast[max] && radarPast[max].time);
    } else if (cloudTimes && cloudTimes.length) {
      max = sliderMax();
      sig = "c|" + max + "|" + cloudTimes[0] + "|" + cloudTimes[max];
    } else {
      if (timeTicksSig === "empty") return;
      timeTicksSig = "empty";
      timeTicksEl.innerHTML = "";
      return;
    }
    if (sig === timeTicksSig) return;
    timeTicksSig = sig;
    idxs = pickTickIndices(max);
    html = "";
    for (i = 0; i < idxs.length; i++) {
      ix = idxs[i];
      frac = max <= 0 ? 0 : (100 * ix / max);
      edge = (i === 0) ? " is-start" : (i === idxs.length - 1 ? " is-end" : "");
      if (typeof radarOn === "function" && radarOn() && radarPast && radarPast[ix]) {
        fr = radarPast[ix];
        lab = formatTickClock(new Date(Number(fr.time) * 1000));
      } else {
        lab = formatTickClock(cloudTimes[ix]);
      }
      html += '<span class="time-tick' + edge + '" style="left:' + frac.toFixed(2) + '%">';
      html += '<span class="time-tick-mark"></span><span class="time-tick-lab">' + lab + "</span></span>";
    }
    timeTicksEl.innerHTML = html;
  }
  function sliderMax() {
    return Math.max(0, cloudTimes.length - 1);
  }
  function clampIndex(i) {
    var n = Number(i);
    if (!isFinite(n)) n = 0;
    return Math.max(0, Math.min(Math.floor(n), sliderMax()));
  }
  function clampFrac(f) {
    var n = Number(f);
    if (!isFinite(n)) n = 0;
    return Math.max(0, Math.min(n, activeSliderMax()));
  }
  function activeSliderMax() {
    if (typeof radarOn === "function" && radarOn() && radarPast && radarPast.length) {
      return radarSliderMax();
    }
    return sliderMax();
  }
  function nearestCloudIndexByMs(want) {
    if (!cloudTimes.length || !isFinite(want)) return clampIndex(cloudIndex);
    var best = 0;
    var bestD = Infinity;
    var i, ms, d;
    for (i = 0; i < cloudTimes.length; i++) {
      ms = goesIsoMs(cloudTimes[i]);
      if (!isFinite(ms)) continue;
      d = Math.abs(ms - want);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }
  function defaultCloudLoopStartIndex() {
    if (!cloudTimes.length) return 0;
    var latest = goesIsoMs(cloudTimes[cloudTimes.length - 1]);
    if (!isFinite(latest)) return 0;
    var idx = nearestCloudIndexByMs(latest - PLAY_WINDOW_MS);
    var end = sliderMax();
    if (idx >= end) idx = Math.max(0, end - 1);
    return idx;
  }
  function defaultRadarLoopStartIndex() {
    if (!radarPast || !radarPast.length) return 0;
    var last = radarPast[radarPast.length - 1];
    var latestMs = last && last.time != null ? Number(last.time) * 1000 : NaN;
    if (!isFinite(latestMs)) return 0;
    var want = latestMs - PLAY_WINDOW_MS;
    var best = 0;
    var bestD = Infinity;
    var i, ms, d;
    for (i = 0; i < radarPast.length; i++) {
      if (!radarPast[i] || radarPast[i].time == null) continue;
      ms = Number(radarPast[i].time) * 1000;
      if (!isFinite(ms)) continue;
      d = Math.abs(ms - want);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    var end = radarSliderMax();
    if (best >= end) best = Math.max(0, end - 1);
    return best;
  }
  /* compat aliases used by older call sites — return user loopStartFrac */
  function playLoopStartIndex() {
    ensureLoopStartInited();
    return clampLoopStart(loopStartFrac);
  }
  function radarLoopStartIndex() {
    ensureLoopStartInited();
    return clampLoopStart(loopStartFrac);
  }
  function clampLoopStart(f) {
    var n = Number(f);
    if (!isFinite(n)) n = 0;
    var max = activeSliderMax();
    if (n < 0) n = 0;
    if (n > max) n = max;
    return n;
  }
  function loopStartMs() {
    ensureLoopStartInited();
    var f = clampLoopStart(loopStartFrac);
    if (typeof radarOn === "function" && radarOn() && radarPast && radarPast.length) {
      var i = clampRadarIndex(Math.round(f));
      var fr = radarPast[i];
      return fr && fr.time != null ? Number(fr.time) * 1000 : NaN;
    }
    if (cloudTimes.length) {
      var iso = cloudTimes[clampIndex(Math.round(f))];
      return goesIsoMs(iso);
    }
    return NaN;
  }
  function persistLoopStart() {
    var max = activeSliderMax();
    var frac01 = max <= 0 ? 0 : (clampLoopStart(loopStartFrac) / max);
    if (frac01 < 0) frac01 = 0;
    if (frac01 > 1) frac01 = 1;
    try { localStorage.setItem(LOOP_START_KEY, String(frac01)); } catch (eP) {}
    savedLoopStartFrac = frac01;
  }
  function ensureLoopStartInited() {
    if (loopStartInited) {
      loopStartFrac = clampLoopStart(loopStartFrac);
      return;
    }
    var max = activeSliderMax();
    if (max <= 0 && !(cloudTimes && cloudTimes.length) && !(radarPast && radarPast.length)) {
      loopStartFrac = 0;
      return;
    }
    if (savedLoopStartFrac != null && isFinite(savedLoopStartFrac)) {
      loopStartFrac = clampLoopStart(savedLoopStartFrac * max);
    } else {
      var def = (typeof radarOn === "function" && radarOn() && radarPast && radarPast.length)
        ? defaultRadarLoopStartIndex()
        : defaultCloudLoopStartIndex();
      loopStartFrac = clampLoopStart(def);
    }
    loopStartInited = true;
  }
  function setLoopStartFrac(f, opts) {
    opts = opts || {};
    ensureLoopStartInited();
    loopStartFrac = clampLoopStart(f);
    if (playheadFrac < loopStartFrac) {
      playheadFrac = loopStartFrac;
      if (typeof radarOn === "function" && radarOn()) {
        radarIndex = clampRadarIndex(Math.round(playheadFrac));
      } else {
        cloudIndex = clampIndex(Math.round(playheadFrac));
      }
    }
    if (!opts.skipPersist) persistLoopStart();
    syncLoopSplitter();
    syncSliderUi();
  }
  function activeLoopStart() {
    ensureLoopStartInited();
    return clampLoopStart(loopStartFrac);
  }
  function syncLoopSplitter() {
    var el = document.getElementById("loop-splitter");
    if (!el || !slider) return;
    ensureLoopStartInited();
    var max = activeSliderMax();
    var frac = max <= 0 ? 0 : (clampLoopStart(loopStartFrac) / max);
    if (frac < 0) frac = 0;
    if (frac > 1) frac = 1;
    el.style.left = (frac * 100).toFixed(3) + "%";
    el.setAttribute("aria-valuenow", String(Math.round(frac * 100)));
    el.setAttribute("aria-valuemax", "100");
  }
  function fracFromTrackClientX(clientX) {
    var wrap = slider && slider.parentNode;
    if (!wrap) return 0;
    var rect = wrap.getBoundingClientRect();
    var w = rect.width || 1;
    var x = clientX - rect.left;
    var t = x / w;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return t * activeSliderMax();
  }
  function applyScrubPlayhead(dragged) {
    ensureLoopStartInited();
    var d = Number(dragged);
    if (!isFinite(d)) d = playheadFrac;
    var ls = clampLoopStart(loopStartFrac);
    if (d < ls) {
      /* pull splitter left with the dot; never leave playhead left of splitter */
      loopStartFrac = clampLoopStart(d);
      playheadFrac = loopStartFrac;
      persistLoopStart();
      syncLoopSplitter();
    } else {
      /* right never moves splitter */
      playheadFrac = clampFrac(d);
    }
  }
  function playHoursBack() {
    return (HOURS_BACK === 6 || HOURS_BACK === 12) ? HOURS_BACK : 24;
  }
  function sliderUiMax() {
    return Math.max(0, activeSliderMax() * SLIDER_RES);
  }
  function sliderUiFromFrac(frac) {
    return Math.round(clampFrac(frac) * SLIDER_RES);
  }
  function fracFromSliderUi(val) {
    var n = Number(val);
    if (!isFinite(n)) n = 0;
    return clampFrac(n / SLIDER_RES);
  }
  function syncPlayheadThumb() {
    var el = document.getElementById("playhead-thumb");
    var wrap = slider && slider.parentNode;
    if (!el || !slider) return;
    var max = activeSliderMax();
    var frac = max <= 0 ? 0 : (clampFrac(playheadFrac) / max);
    if (frac < 0) frac = 0;
    if (frac > 1) frac = 1;
    el.style.left = (frac * 100).toFixed(3) + "%";
    if (wrap && wrap.classList) {
      if (playAnimating) wrap.classList.add("is-playing-smooth");
      else wrap.classList.remove("is-playing-smooth");
    }
    if (playAnimating) el.classList.add("is-on");
    else el.classList.remove("is-on");
    syncLoopSplitter();
  }
  function syncSliderUi(opts) {
    if (!slider) return;
    opts = opts || {};
    ensureLoopStartInited();
    /* keep playhead from sitting left of splitter */
    if (playheadFrac < loopStartFrac) playheadFrac = loopStartFrac;
    slider.min = "0";
    slider.step = "1";
    slider.max = String(sliderUiMax());
    /* opt51: overlay thumb/splitter stay 60fps via left%; throttle native
       #time-slider.value so layout isn't thrashed every rAF while playing. */
    var forceVal = !!opts.force || !playAnimating || scrubbing;
    var nowMs = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    if (forceVal || (nowMs - playSliderWriteMs) >= PLAY_SLIDER_THROTTLE_MS) {
      playSliderWriteMs = nowMs;
      slider.value = String(sliderUiFromFrac(playheadFrac));
    }
    syncPlayheadThumb();
  }
  function syncRangeSeg() {
    var seg = rangeSeg || document.getElementById("range-seg");
    if (!seg) return;
    var cur = String(playHoursBack());
    var btns = seg.querySelectorAll("[data-range]");
    var i, b, on;
    for (i = 0; i < btns.length; i++) {
      b = btns[i];
      on = b.getAttribute("data-range") === cur;
      if (on) b.classList.add("is-on");
      else b.classList.remove("is-on");
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }
  function isIntl() {
    return !!(toggleIntl && toggleIntl.checked);
  }
  function homeOnlyCode() {
    return !isIntl() && homeCountry && homeCountry.code ? homeCountry.code : null;
  }
  function beachesForMode(list) {
    var rows = list || [];
    if (isIntl()) return rows;
    var code = homeOnlyCode();
    if (!code) return rows;
    return rows.filter((row) => {
      var c = (row && (row.country || beachCountryCode(row))) || null;
      return c === code;
    });
  }
  function cloudTargetMap() {
    /* opt11: static clouds always on main map */
    return map;
  }
  function isPlaying() {
    /* opt45: real animation only — not playMode (past-frame overlay) or stale aria */
    return !!playAnimating;
  }
  function playLoopOn() {
    if (toggleLoop) return !!toggleLoop.checked;
    return !!playLoop;
  }
  function syncLoopButtonUi() {
    var on = playLoopOn();
    if (loopBtn) {
      loopBtn.setAttribute("aria-pressed", on ? "true" : "false");
      loopBtn.title = on ? "Loop on" : "Loop off";
      if (on) loopBtn.classList.add("is-on");
      else loopBtn.classList.remove("is-on");
    }
  }
  function setPlayLoop(on) {
    playLoop = !!on;
    if (toggleLoop) toggleLoop.checked = playLoop;
    syncLoopButtonUi();
    try { localStorage.setItem(LOOP_KEY, playLoop ? "1" : "0"); } catch (eL) {}
  }
  function normalizePlaySpeed(v) {
    var n = Number(v);
    if (n === 0.5 || n === 1 || n === 1.5 || n === 2 || n === 3) return n;
    return 1;
  }
  function getPlaySpeed() {
    if (playSpeedEl) return normalizePlaySpeed(playSpeedEl.value);
    return normalizePlaySpeed(playSpeed);
  }
  function speedLabel(sp) {
    var n = normalizePlaySpeed(sp);
    if (n === 0.5) return "0.5x";
    if (n === 1.5) return "1.5x";
    return String(n) + "x";
  }
  function syncSpeedMenuUi() {
    if (!speedMenuEl) return;
    var cur = String(getPlaySpeed());
    var opts = speedMenuEl.querySelectorAll(".speed-opt");
    var i;
    for (i = 0; i < opts.length; i++) {
      var on = opts[i].getAttribute("data-speed") === cur;
      if (on) opts[i].classList.add("is-active");
      else opts[i].classList.remove("is-active");
      opts[i].setAttribute("aria-selected", on ? "true" : "false");
    }
  }
  function syncSpeedButtonUi() {
    var sp = getPlaySpeed();
    var label = "Speed " + speedLabel(sp);
    if (btnSpeed) {
      btnSpeed.title = label;
      btnSpeed.setAttribute("aria-label", label);
    }
    syncSpeedMenuUi();
  }
  function speedMenuOpen() {
    return !!(speedMenuEl && !speedMenuEl.hidden);
  }
  function closeSpeedMenu() {
    if (!speedMenuEl) return;
    speedMenuEl.hidden = true;
    if (btnSpeed) btnSpeed.setAttribute("aria-expanded", "false");
  }
  function openSpeedMenu() {
    if (!speedMenuEl || !btnSpeed) return;
    syncSpeedMenuUi();
    speedMenuEl.hidden = false;
    btnSpeed.setAttribute("aria-expanded", "true");
  }
  function toggleSpeedMenu() {
    if (speedMenuOpen()) closeSpeedMenu();
    else openSpeedMenu();
  }
  function setPlaySpeed(v) {
    playSpeed = normalizePlaySpeed(v);
    if (playSpeedEl) playSpeedEl.value = String(playSpeed);
    syncSpeedButtonUi();
    try { localStorage.setItem(SPEED_KEY, String(playSpeed)); } catch (eS) {}
  }
  /* opt25/opt26: one .tbtn-ico slot — swap path; keep is-on + Pause while playing/retrying */
  function setPlayButtonPlaying(on) {
    if (!btnPlay) return;
    var playing = !!on;
    btnPlay.setAttribute("aria-pressed", playing ? "true" : "false");
    if (playing) {
      btnPlay.classList.add("is-on");
      btnPlay.classList.add("is-playing");
    } else {
      btnPlay.classList.remove("is-on");
      btnPlay.classList.remove("is-playing");
    }
    var ico = btnPlay.querySelector(".tbtn-ico");
    if (ico && typeof PAUSE_ICO_HTML === "string" && typeof PLAY_ICO_HTML === "string") {
      ico.innerHTML = playing ? PAUSE_ICO_HTML : PLAY_ICO_HTML;
    }
    var kind = (typeof radarOn === "function" && radarOn()) ? "radar" : "cloud";
    var label = playing ? ("Pause " + kind + " animation") : ("Play " + kind + " animation");
    btnPlay.setAttribute("aria-label", label);
    btnPlay.title = playing ? "Pause" : "Play";
  }
  /* opt22/opt37: effective dwell from live speed; shared PLAY_PACE_MS base */
  function playDwellMs(baseMs) {
    var base = Number(baseMs);
    if (!isFinite(base) || base <= 0) base = PLAY_PACE_MS;
    var sp = getPlaySpeed();
    if (!sp || sp <= 0) sp = 1;
    return Math.max(120, Math.round(base / sp));
  }
  /* opt37: skip 10-min cloud slots so weather time tracks Speed even if WMS is slow.
     1 @ 0.5–1x, 2 @ 1.5–2x, 3 @ 3x. */
  function playFrameStep() {
    /* opt46: always advance one GOES slot — speed only changes blend duration.
       Skipping 2–3 slots at 2x/3x made motion jumpy (slideshow). */
    return 1;
  }
  /* opt36/opt37/opt39/opt45: while animating, blend fills the whole frame
     interval (no short fade + freeze). Else short soften for one-shots. */
  function playFadeMs() {
    var sp = getPlaySpeed();
    if (!sp || sp <= 0) sp = 1;
    if (playAnimating) return playDwellMs(PLAY_PACE_MS);
    return Math.max(120, Math.round(CLOUD_FADE_MS / sp));
  }
  function playFrameIsCached(idx) {
    if (playUseOpenMeteo) return true;
    if (!cloudTimes.length) return false;
    var i = clampIndex(idx);
    var iso = cloudTimes[i];
    if (!iso) return false;
    try {
      var meta = gibsWmsFrameMeta(iso, sunnyApp_origin ? sunnyApp_origin.lon : null);
      return !!(meta && playImgCache[meta.key] && playImgCache[meta.key].ok);
    } catch (eC) {
      return false;
    }
  }
  function playFrameMetaAt(idx) {
    if (!cloudTimes.length || playUseOpenMeteo) return null;
    var iso = cloudTimes[clampIndex(idx)];
    if (!iso) return null;
    try {
      return gibsWmsFrameMeta(iso, sunnyApp_origin ? sunnyApp_origin.lon : null);
    } catch (eM) {
      return null;
    }
  }
  function countCachedAround(fromIdx, count) {
    var n = 0;
    var i;
    for (i = 0; i < count; i++) {
      if (playFrameIsCached(clampIndex(fromIdx + i))) n += 1;
    }
    return n;
  }
  function warmNearbyFrames(fromIdx, count) {
    /* Returns Promise that resolves when up to `count` frames from fromIdx are cached (best-effort). */
    if (playUseOpenMeteo || !cloudTimes.length) return Promise.resolve(0);
    var lon = sunnyApp_origin ? sunnyApp_origin.lon : null;
    var jobs = [];
    var i;
    for (i = 0; i < count; i++) {
      var idx = clampIndex(fromIdx + i);
      var iso = cloudTimes[idx];
      if (!iso) continue;
      try {
        var meta = gibsWmsFrameMeta(iso, lon);
        if (!(playImgCache[meta.key] && playImgCache[meta.key].ok)) {
          jobs.push(loadImageSrc(meta.url, false, meta.key));
        }
      } catch (eW) {}
    }
    if (!jobs.length) return Promise.resolve(count);
    return Promise.all(jobs).then(() => {
      return countCachedAround(fromIdx, count);
    }).catch(() => {
      return countCachedAround(fromIdx, count);
    });
  }
  function playEase(t) {
    /* opt45: linear while animating so segment joins stay velocity-continuous */
    if (playAnimating) return t;
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
  function releasePlayStaticHold() {
    if (!playHoldStaticUntilFirst) return;
    playHoldStaticUntilFirst = false;
    setMapLibreCloudsHidden(true);
  }
  function hideUnusedCloudMapEl() {
    var el = document.getElementById("cloud-map");
    if (!el) return;
    el.style.display = "none";
    el.setAttribute("aria-hidden", "true");
    el.classList.add("is-unused");
    /* never reparent into canvas-container */
    try {
      if (el.parentNode && map && map.getContainer && el.parentNode === map.getCanvasContainer()) {
        document.body.appendChild(el);
      }
    } catch (eHide) {}
  }
  function ensureCloudMap() {
    /* opt11: no second MapLibre — hide leftover #cloud-map DOM */
    cloudMap = null;
    hideUnusedCloudMapEl();
    ensurePlayLayer();
    ensureWindLayer();
    return null;
  }
  function syncCloudMap(force) {
    void force;
    /* opt11: no secondary cloud map to sync */
  }
function sunnyStep02() {
/* === BEGIN CLOUD STATIC + PLAY IMAGE OVERLAY (opt11: clouds under beaches) === */
  /*
   * opt11: Static/scrub GIBS on MAIN map (raster before beaches/labels) so canvas
   * beach dots + Labels draw on top. Do NOT cover the WebGL canvas with #cloud-map.
   * - Static / scrub: gibs/iem-vis on `map`, insert before beaches-fill
   *   (and under Labels overlay). setTiles WITHOUT clearTiles.
   * - Play: hide MapLibre cloud rasters; drive #cloud-play-layer (two <img>s) from
   *   NASA GIBS WMS GetMap, mix-blend-mode:screen, double-buffer crossfade.
   *   Play layer is sibling of canvas-container (markers z-index above it).
   *   Never clear to empty — hold the shown image until next onload.
   * opt21: cover crossfade (outgoing full; incoming 0→op) + Loop checkbox.
   * opt23: on pan/zoom while Play, hide HTML WMS immediately and show MapLibre
   *   rasters (map-locked); debounce WMS reload on gesture end.
   * opt60: ONE shared frame-tween engine (frame-tween.js + motion-worker.js) for
   *   clouds AND radar: bidirectional semi-Lagrangian advection on the GPU along a
   *   smooth per-interval field (700 hPa wind prior + regularized coarse LK).
   * opt41/opt42 (removed in opt60): block-match flow-worker warp.
   * opt42: real wait budget (600–900ms), prefetch flow, faster block-match.
   * opt43: never block critical path on cold flow (~50ms grace → opacity);
   *   honest download vs blend status; lighter Play WMS pixel budget.
   * opt44: cache full Play timeline (dynamic LRU ≥ timeline+prefetch, pin
   *   current-view keys, background warmer) so scrub/Loop are seamless.
   * opt45: honest playAnimating (Pause always stops); clock-smooth playback —
   *   full-interval motion/opacity lerp (no dwell freeze); hold if next cold.
   * opt46: persistent motion canvas for whole Play session (no hide+snap join
   *   pop); flow-gated advances only (no opacity dissolve while animating);
   *   kill schedule(80) cold stutter; step=1 always; optional boot warm.
   * opt47: smash Play reliability — start clock NOW (no 10-frame boot gate);
   *   always advance playhead (no cache freeze); canvas alpha-blend fallback
   *   when flow cold (~70ms grace); end+Loop-off status feedback.
   * opt48: continuous playheadFrac + rAF (not tick→frame); Play starts/loops
   *   at Now−1h; unlabeled 6/12/24h range next to Overlay.
   * opt51: safe fluid polish — write-path canvas attrs (alpha, no WRF on rAF),
   *   hi-res only floor/ceil/+1 while playing, throttle #time-slider.value,
   *   CSS contain on play layer, warmer in-flight ≤1–2 during Play.
   */
  CLOUD_FADE_MS = 320; /* opt37: readable soften at 1x; scaled via playFadeMs */
  PLAY_PACE_MS = 600; /* opt46: ~600ms @1x — continuous motion, not slideshow */
  PLAY_DWELL_MS = PLAY_PACE_MS; /* alias — playDwellMs(PLAY_PACE_MS) */
  FRAME_LOAD_STUCK_MS = 1000; /* "Downloading cloud frame…" only if WMS >~1s */
  FRAME_PLAY_STEP = 1; /* opt46: always 1 — speed only changes dwell */
  PLAY_PREFETCH = 10; /* opt46: deeper warm ahead (step always 1) */
  PLAY_BOOT_WARM_MIN = 2; /* opt47: at most 2 nearby frames; never block clock */
  PLAY_BOOT_WARM_MS = 1200; /* opt47: hard cap if Play briefly races warm */
  PLAY_MOVE_DEBOUNCE_MS = 180; /* opt23: WMS reload after gesture ends */
  PLAY_LRU_CAP = 160; /* opt44: raised dynamically with cloudTimes */
  PLAY_LRU_CAP_MAX = 200; /* opt44: memory bound */
  PLAY_WARM_CONCURRENCY = 3; /* opt44: low-concurrency full-timeline warmer */
  PLAY_WARM_STATUS_MIN = 12; /* opt44: optional Caching… if many pending */
  PLAY_BLUR_PX = 2.5; /* opt37/opt39: cheap incoming blur during linear crossfade */
  /* opt43: tighter Play GetMap caps (static MapLibre WMTS unchanged) */
  WMS_MAX_SIDE_PHONE = 720;
  WMS_MAX_SIDE_TABLET = 900;
  WMS_MAX_SIDE_DESKTOP = 1024;
  WMS_MAX_SIDE_DESKTOP_HI = 1024;
  /* opt50: soft preview caps above; hi-res progressive enhance */
  HI_RES_MAX_SIDE = 1920;
  HI_RES_FADE_MS = 400;
  PLAY_HIRES_LRU_CAP = 36;
  GIBS_SRC = "gibs";
  GIBS_LAYER = "gibs";
  cloudMap = null;
  lastGibsUrl = null;
  lastGibsHostLayer = "";
  cloudSourcesReady = false;
  playSession = 0;
  playBusy = false;
  playAnimating = false; /* opt45: true only while Play clock/ticks run */
  playheadFrac = 0; /* opt48: continuous frame index while playing */
  loopStartFrac = 0; /* opt49: continuous; Loop rewind / Play window start */
  loopStartInited = false;
  loopSplitterDragging = false;
  savedLoopStartFrac = _sunnySavedLoopStartFrac; /* 0–1 from localStorage, applied when timeline ready */
  playRafId = 0;
  playRafLastMs = 0;
  playPrefetchAt = -1;
  playMode = false;
  scrubbing = false; /* opt28: pointer on #time-slider */
  scrubWasPlaying = false; /* opt28: resume play after scrub if it was on */
  scrubDesiredIdx = null; /* opt38: coalesce slider input to one apply/frame */
  scrubRaf = 0;
  mapGesturing = false; /* opt38: pan/zoom — pause heavy idle work */
  idleGoesWarmTimer = null; /* opt38: quiet nearby WMS warm into playImgCache */
  IDLE_GOES_WARM_MS = 1700;
  IDLE_GOES_WARM_COUNT = 3;
  timeTicksSig = "";
  playHoldStaticUntilFirst = false; /* opt21: keep MapLibre under play until first cover */
  playGestureActive = false; /* opt23: map-locked tiles while pan/zoom in Play */
  playGestureWatchTimer = null; /* opt35: force-clear stuck map lock */
  PLAY_GESTURE_MAX_MS = 2500;
  PLAY_FRAME_TIMEOUT_MS = 8000; /* opt35: wedged setCloudFrame must not stick playBusy */
  PLAY_HOLD_MAX_RETRIES = 3;
  playFrontBuf = "a";
  playImgCache = Object.create(null); /* LRU: key -> {ok,url,img,key} */
  playLruOrder = []; /* oldest → newest keys */
  playLoadPending = Object.create(null);
  playHiResCache = Object.create(null); /* opt50: separate LRU for full-res WMS */
  playHiResOrder = [];
  playHiResPending = Object.create(null);
  playHiResFade = { pairKey: "", opacity: 0, t0: 0, active: false };
  playHiResRaf = 0;
  playSliderWriteMs = 0; /* opt51: throttle native range value during rAF play */
  PLAY_SLIDER_THROTTLE_MS = 32;
  playHiResInFlight = 0; /* opt51: cap concurrent hi-res fetches while playing */
  playLoadGen = 0;
  playFadeRaf = 0;
  playMoveTimer = null;
  /* opt60: ONE shared frame-tween engine (frame-tween.js → window.SunnyTween) drives
     every animated raster layer (visible clouds + radar). Per-layer code is only a small
     source adapter; interpolation = bidirectional semi-Lagrangian advection along a smooth,
     per-interval-constant motion field (wind prior + regularized coarse LK), GPU warp,
     linear-blend fallback. */
  TWEEN_MOTION = true;
  tweenEstimator = null; /* shared motion estimator (one worker) for all layers */
  cloudTween = null;
  cloudHiFade = { view: "", t0: 0 };
  cloudHiFadeRaf = 0;
  PLAY_CANVAS_MAX_SIDE = 2560; /* display canvas cap (CSS px × DPR) */
  PLAY_CANVAS_MAX_PIXELS = 2560 * 1600;
  BLEND_HINT_MS = 200; /* opt43: "Blending frames…" only if cached+motion >200ms */
  playMotionActive = false;
  playCanvasSession = false; /* opt46: motion canvas stays up across segments */
  playLastFrameKey = null;
  playCorsOk = null; /* null=untested, true/false */
  playUseOpenMeteo = false;
  loadingFrameHint = false; /* download hint active */
  blendingFrameHint = false;
  blendingHintTimer = 0;
  frameWaitStarted = 0;
  playFrameFromCache = false; /* current transition's WMS came from LRU */
  playWarmGen = 0; /* opt44: cancel/restart timeline warmer */
  playWarmActive = false;
  playWarmTimer = null;
  playWarmInFlight = 0;
  playWarmHintShown = false;
  playTimelineWarmed = false; /* full warm OR one complete Play pass */
  cachingFramesHint = false;
  speedMenuEl = document.getElementById("speed-menu");
  PLAY_ICO_HTML = '<path d="M8.2 5.6v12.8l11-6.4z" fill="currentColor"/>';
  PAUSE_ICO_HTML =
    '<rect x="7" y="5.5" width="3.4" height="13" rx="1" fill="currentColor"/>' +
    '<rect x="13.6" y="5.5" width="3.4" height="13" rx="1" fill="currentColor"/>';
}
