// workspace/whereisthesun/app-cloud-layers.js
/* SUNNY app, part 3 of 14: cloud map layers, stacking and paint.
 * Names here are page-wide and shared by every app-*.js file; startSunny in app.js runs each part's step in order. */
"use strict";
var GIBS_GEOCOLOR_NATIVE_M_PER_PX, GIBS_NATIVE_OVERSAMPLE;
  function cloudStackBefore() {
    /* Insert cloud rasters under radar (opt16/opt40 single buffer), else Labels, else beaches */
    if (map.getLayer("radar")) return "radar";
    var i, id;
    for (i = 0; i < overlayIds.length; i++) {
      id = overlayIds[i];
      if (map.getLayer(id)) return id;
    }
    if (map.getLayer("beaches-fill")) return "beaches-fill";
    return undefined;
  }
  function radarStackBefore() {
    /* Radar above clouds, under Labels / beaches */
    var i, id;
    for (i = 0; i < overlayIds.length; i++) {
      id = overlayIds[i];
      if (map.getLayer(id)) return id;
    }
    if (map.getLayer("beaches-fill")) return "beaches-fill";
    return undefined;
  }
  function restackRadar() {
    if (!map || !map.getLayer("radar")) return;
    var before = radarStackBefore();
    try { map.moveLayer("radar", before); } catch (eMvR) {}
    /* opt54: radar moved — keep Labels above if enabled */
    if (overlayVisible() && overlayReady) healLabels();
  }
  function restackCloudRasters() {
    if (!map) return;
    var before = cloudStackBefore();
    var ids = [GIBS_LAYER, "iem-vis"];
    var i;
    for (i = 0; i < ids.length; i++) {
      if (map.getLayer(ids[i])) {
        try { map.moveLayer(ids[i], before); } catch (eMv) {}
      }
    }
    /* opt54: clouds moved — keep Labels above if enabled */
    if (overlayVisible() && overlayReady) healLabels();
  }
  function cloudResamplingForZoom(z) {
    /* opt33: GeoColor Level7 — always linear (esp. z>7 upscale); nearest only for sharp IEM */
    void z;
    return "linear";
  }
  function cloudResamplingForLayer(layerId) {
    var z = map && typeof map.getZoom === "function" ? map.getZoom() : 0;
    if (layerId === "iem-vis") {
      /* IEM native ~1km: nearest when close for crisp VIS; linear while blending in */
      /* opt59: always linear — nearest made zoomed VIS look like a pixel mosaic */
      void z;
      return "linear";
    }
    /* GeoColor max WMTS Level7 — linear softens blocky upscale at z>7 */
    return "linear";
  }
  function applyCloudRasterResampling() {
    if (!map) return;
    var ids = [GIBS_LAYER, "iem-vis"];
    var i, id, mode;
    for (i = 0; i < ids.length; i++) {
      id = ids[i];
      if (map.getLayer(id)) {
        mode = cloudResamplingForLayer(id);
        try { map.setPaintProperty(id, "raster-resampling", mode); } catch (eRs) {}
      }
    }
  }
  function cloudRasterPaint(opacity, layerId) {
    /* opt63: tiles are already cloud-only (cloud-key.js); neutral paint so static matches Play */
    var fadeDur = (layerId === "iem-vis") ? 320 : HI_RES_FADE_MS; /* opt50: GIBS fade-in over pop */
    return {
      "raster-opacity": opacity == null ? 0 : opacity,
      "raster-resampling": cloudResamplingForLayer(layerId || GIBS_LAYER),
      "raster-fade-duration": fadeDur,
      "raster-brightness-min": 0,
      "raster-brightness-max": 1,
      "raster-contrast": 0,
      "raster-saturation": 0
    };
  }
  function applyCloudPaint(layerId, opacity) {
    if (overlayXfadeActive) return;
    var m = cloudTargetMap();
    if (!m || !m.getLayer(layerId)) return;
    var paint = cloudRasterPaint(opacity, layerId);
    var key;
    for (key in paint) {
      if (Object.prototype.hasOwnProperty.call(paint, key)) {
        m.setPaintProperty(layerId, key, paint[key]);
      }
    }
  }
  function gibsEffectiveOpacity() {
    /* Full opacity for solid mode; a small boost is fine for screen mode. */
    if (cloudOpacity >= 0.82) return Math.min(1, cloudOpacity);
    var op = Math.min(1, cloudOpacity * 1.05);
    return Math.max(0, Math.min(1, op));
  }
  function applyCloudSolidMode() {
    /* opt63: one cloud-only look for Play and static (cloud-key.js); no blend-mode switch */
    if (map && map.getLayer(GIBS_LAYER) && !playMode) {
      applyCloudPaint(GIBS_LAYER, gibsEffectiveOpacity());
    }
  }
  function gibsHostLayerKey(url) {
    try {
      var u = String(url);
      var i = u.indexOf("/default/");
      if (i < 0) return u;
      return u.slice(0, i);
    } catch (eK) {
      return String(url || "");
    }
  }
  function lngLatTo3857(lon, lat) {
    var x = lon * 20037508.342789244 / 180;
    var s = Math.sin(lat * Math.PI / 180);
    /* clamp polar extremes */
    if (s > 0.9999) s = 0.9999;
    if (s < -0.9999) s = -0.9999;
    var y = 0.5 * Math.log((1 + s) / (1 - s)) * 20037508.342789244 / Math.PI;
    return [x, y];
  }
  function mapBbox3857() {
    var b = map.getBounds();
    var sw = lngLatTo3857(b.getWest(), b.getSouth());
    var ne = lngLatTo3857(b.getEast(), b.getNorth());
    var minx = Math.min(sw[0], ne[0]);
    var maxx = Math.max(sw[0], ne[0]);
    var miny = Math.min(sw[1], ne[1]);
    var maxy = Math.max(sw[1], ne[1]);
    /* avoid zero-area */
    if (maxx - minx < 1) { maxx = minx + 1; }
    if (maxy - miny < 1) { maxy = miny + 1; }
    return { minx: minx, miny: miny, maxx: maxx, maxy: maxy };
  }
  function wmsMaxSide() {
    /* opt43 Play WMS: phone ~720, tablet ~900, desktop ~1024; gate by width/DPR */
    var el = map && map.getContainer ? map.getContainer() : document.getElementById("map");
    var cw = (el && el.clientWidth) || window.innerWidth || 800;
    var dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    var ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
    var narrow = cw < 700 || (typeof window.matchMedia === "function" && window.matchMedia("(max-width:700px)").matches);
    var phone = narrow || /Mobi|Android|iPhone/i.test(ua);
    var tablet = !phone && (cw < 1100 || /iPad|Tablet/i.test(ua));
    var cap;
    if (phone) {
      cap = WMS_MAX_SIDE_PHONE;
      if (dpr >= 2.5) cap = Math.min(cap, 640);
    } else if (tablet) {
      cap = WMS_MAX_SIDE_TABLET;
      if (dpr >= 2.5 && cw < 900) cap = Math.min(cap, 800);
    } else if (cw >= 1400 && dpr >= 1.5) {
      cap = WMS_MAX_SIDE_DESKTOP_HI;
    } else if (cw >= 1100) {
      cap = WMS_MAX_SIDE_DESKTOP;
    } else {
      cap = WMS_MAX_SIDE_TABLET;
    }
    return cap;
  }
  function computePlayImageSize() {
    var el = map.getContainer ? map.getContainer() : document.getElementById("map");
    var w = (el && el.clientWidth) || window.innerWidth || 800;
    var h = (el && el.clientHeight) || window.innerHeight || 600;
    var cap = wmsMaxSide();
    var maxSide = Math.max(w, h);
    if (maxSide > cap) {
      var s = cap / maxSide;
      w = Math.max(64, Math.round(w * s));
      h = Math.max(64, Math.round(h * s));
    }
    w = Math.max(64, Math.min(cap, Math.round(w)));
    h = Math.max(64, Math.min(cap, Math.round(h)));
    return { w: w, h: h };
  }
  function playImageSize() {
    /* opt10: cache WMS size; only recompute on real resize/orientation (debounced).
       opt37: at Speed ≥2 during Play, a smaller JPEG for faster WMS (≥2x shrink).
       opt38: narrow viewports (<700) use ~75% of desktop cap for faster mobile WMS.
       opt43: base caps tightened in wmsMaxSide / WMS_MAX_SIDE_*. */
    if (!playSizeCache) playSizeCache = computePlayImageSize();
    var base = clampWmsToNative(playSizeCache);
    var sp = getPlaySpeed();
    var el = map && map.getContainer ? map.getContainer() : document.getElementById("map");
    var cw = (el && el.clientWidth) || window.innerWidth || 800;
    var narrow = cw < 700 || (typeof window.matchMedia === "function" && window.matchMedia("(max-width:700px)").matches);
    var scale = 1;
    if (narrow) scale *= 0.75;
    /* opt59: removed Speed≥2 shrink (0.72) — lower-res at 2x+ and cache-key churn on Speed change */
    void sp;
    if (scale >= 0.999) return base;
    var w = Math.round(base.w * scale);
    var h = Math.round(base.h * scale);
    /* Clamp min edge ~512 when the base is large enough, else keep ≥64 floor */
    var minEdge = Math.min(w, h);
    var baseMin = Math.min(base.w, base.h);
    if (minEdge < 512 && baseMin >= 512) {
      var up = 512 / Math.max(1, minEdge);
      w = Math.round(w * up);
      h = Math.round(h * up);
    }
    w = Math.max(64, Math.min(base.w, w));
    h = Math.max(64, Math.min(base.h, h));
    return { w: w, h: h };
  }
  function clampWmsToNative(sz) {
    try {
      var box = mapBbox3857();
      var natW = (box.maxx - box.minx) / GIBS_GEOCOLOR_NATIVE_M_PER_PX * GIBS_NATIVE_OVERSAMPLE;
      var natH = (box.maxy - box.miny) / GIBS_GEOCOLOR_NATIVE_M_PER_PX * GIBS_NATIVE_OVERSAMPLE;
      var s = Math.min(1, natW / Math.max(1, sz.w), natH / Math.max(1, sz.h));
      if (!(s < 0.999) || !isFinite(s)) return sz;
      /* round to 16 so tiny zoom jitter doesn't churn cache keys */
      var w = Math.max(64, Math.round(sz.w * s / 16) * 16);
      var h = Math.max(64, Math.round(sz.h * s / 16) * 16);
      return { w: Math.min(sz.w, w), h: Math.min(sz.h, h) };
    } catch (eN) {
      return sz;
    }
  }
  function invalidatePlayImageSize() {
    playSizeCache = null;
  }
  function schedulePlayImageSizeRefresh() {
    if (playSizeResizeTimer) clearTimeout(playSizeResizeTimer);
    playSizeResizeTimer = setTimeout(() => {
      playSizeResizeTimer = null;
      invalidatePlayImageSize();
      playImageSize();
      if (playMode && !tabHidden) onPlayViewChanged();
    }, 180);
  }
  function roundPlayBbox(box) {
    /* Stable LRU / URL key — ~100m web-mercator grid */
    function r(v) { return Math.round(v / 100) * 100; }
    return { minx: r(box.minx), miny: r(box.miny), maxx: r(box.maxx), maxy: r(box.maxy) };
  }
  function playFrameKey(iso, box, sz) {
    return String(iso) + "|" + box.minx + "," + box.miny + "," + box.maxx + "," + box.maxy + "|" + sz.w + "x" + sz.h;
  }
  function refreshPlayCacheCaps() {
    /* opt44: fit full current timeline + prefetch headroom, bounded ~200 */
    var n = (cloudTimes && cloudTimes.length) ? cloudTimes.length : 0;
    PLAY_LRU_CAP = Math.min(PLAY_LRU_CAP_MAX, Math.max(160, n + PLAY_PREFETCH + 8));
  }
  function playKeyIso(key) {
    if (!key) return "";
    var s = String(key);
    var bar = s.indexOf("|");
    return bar >= 0 ? s.slice(0, bar) : s;
  }
  function playCurrentViewSuffix() {
    var box = roundPlayBbox(mapBbox3857());
    var sz = playImageSize();
    return "|" + box.minx + "," + box.miny + "," + box.maxx + "," + box.maxy + "|" + sz.w + "x" + sz.h;
  }
  function playKeyIsPinned(key) {
    /* opt44: while Play + same bbox/size, pin ISOs still in cloudTimes */
    if (!playMode || !key || !cloudTimes || !cloudTimes.length) return false;
    var suf = playCurrentViewSuffix();
    var s = String(key);
    if (s.length < suf.length || s.slice(s.length - suf.length) !== suf) return false;
    var iso = playKeyIso(s);
    return !!iso && cloudTimes.indexOf(iso) >= 0;
  }
  function playLruTouch(key) {
    var i = playLruOrder.indexOf(key);
    if (i >= 0) playLruOrder.splice(i, 1);
    playLruOrder.push(key);
  }
  function playLruEvictOne() {
    var i, key;
    if (playMode) {
      for (i = 0; i < playLruOrder.length; i++) {
        key = playLruOrder[i];
        if (!playKeyIsPinned(key)) {
          playLruOrder.splice(i, 1);
          if (key && playImgCache[key]) delete playImgCache[key];
          return true;
        }
      }
    }
    key = playLruOrder.shift();
    if (key && playImgCache[key]) delete playImgCache[key];
    return !!key;
  }
  function playLruGet(key) {
    var rec = playImgCache[key];
    if (!rec || !rec.ok) return null;
    playLruTouch(key);
    return rec;
  }
  function playLruSet(key, rec) {
    if (!rec || !rec.ok) return;
    rec.key = key;
    if (playImgCache[key]) {
      playImgCache[key] = rec;
      playLruTouch(key);
      return;
    }
    while (playLruOrder.length >= PLAY_LRU_CAP) {
      if (!playLruEvictOne()) break;
    }
    playImgCache[key] = rec;
    playLruOrder.push(key);
  }
  function clearCachingFramesHint() {
    if (!cachingFramesHint) return;
    cachingFramesHint = false;
    try {
      var el = statusEl || document.getElementById("status");
      if (el && (el.textContent || "") === "Caching cloud frames…") setStatus("");
    } catch (eCh) {}
  }
  function cancelPlayTimelineWarm() {
    playWarmGen += 1;
    playWarmActive = false;
    playWarmInFlight = 0;
    if (playWarmTimer) {
      clearTimeout(playWarmTimer);
      playWarmTimer = null;
    }
    clearCachingFramesHint();
  }
  function countPlayTimelineMissing() {
    if (!cloudTimes || !cloudTimes.length || playUseOpenMeteo) return 0;
    var lon = sunnyApp_origin ? sunnyApp_origin.lon : null;
    var missing = 0;
    var i;
    for (i = 0; i < cloudTimes.length; i++) {
      var iso = cloudTimes[i];
      if (!iso) continue;
      var meta = gibsWmsFrameMeta(iso, lon);
      if (!(playImgCache[meta.key] && playImgCache[meta.key].ok) && !playLoadPending[meta.key]) {
        missing += 1;
      }
    }
    return missing;
  }
  function startPlayTimelineWarm() {
    /* opt44: background fill of all cloudTimes for current bbox/size.
       Yields to Play (playBusy) and prefers behind-playhead first so scrub/Loop
       fill without starving the live advance / prefetch. */
    cancelPlayTimelineWarm();
    if (!playMode || tabHidden || playUseOpenMeteo || !cloudTimes.length) return;
    if (lowDataLink()) return; /* opt76: cellular / Save-Data: no whole-timeline warm */
    try {
      if (map && (map.isMoving() || map.isZooming())) return;
    } catch (eMv) {}
    refreshPlayCacheCaps();
    var gen = playWarmGen;
    var lon = sunnyApp_origin ? sunnyApp_origin.lon : null;
    var pass = 0; /* 0: behind playhead, 1: far ahead, 2: full sweep */
    var cursor = 0;
    playWarmActive = true;
    playWarmHintShown = false;
    function maybeCachingStatus(pendingLeft) {
      if (playWarmHintShown || cachingFramesHint) return;
      /* Don't spam during Play animation (playTimer is null between ticks) */
      if (!scrubbing && (playBusy || playTimer || isPlaying())) return;
      if (pendingLeft < PLAY_WARM_STATUS_MIN) return;
      playWarmHintShown = true;
      cachingFramesHint = true;
      try { setStatus("Caching cloud frames…"); } catch (eSt) {}
    }
    function finishWarm() {
      if (gen !== playWarmGen) return;
      playWarmActive = false;
      playWarmInFlight = 0;
      playTimelineWarmed = true;
      clearCachingFramesHint();
    }
    function warmOrderIndices() {
      var n = cloudTimes.length;
      var head = clampIndex(cloudIndex);
      var out = [];
      var i;
      if (pass === 0) {
        /* behind + current — scrub-back range */
        for (i = head; i >= 0; i--) out.push(i);
      } else if (pass === 1) {
        /* beyond live prefetch window */
        for (i = head + PLAY_PREFETCH + 1; i < n; i++) out.push(i);
      } else {
        for (i = 0; i < n; i++) out.push(i);
      }
      return out;
    }
    function pump() {
      if (gen !== playWarmGen) return;
      playWarmTimer = null;
      if (tabHidden || !playMode) {
        playWarmActive = false;
        playWarmInFlight = 0;
        clearCachingFramesHint();
        return;
      }
      if (mapGesturing || playGestureActive) {
        playWarmTimer = setTimeout(pump, 350);
        return;
      }
      try {
        if (map && (map.isMoving() || map.isZooming())) {
          playWarmTimer = setTimeout(pump, 350);
          return;
        }
      } catch (ePump) {}
      /* Yield while active frame is decoding; while animating only cap concurrency */
      if (playBusy && !scrubbing) {
        playWarmTimer = setTimeout(pump, 180);
        return;
      }
      var order = warmOrderIndices();
      /* opt51: never steal more than soft concurrency while Play animates (cap 1–2) */
      var limit = PLAY_WARM_CONCURRENCY;
      if (!scrubbing && playAnimating) limit = 1;
      else if (!scrubbing && (playTimer || isPlaying() || playMode)) limit = 2;
      while (playWarmInFlight < limit && cursor < order.length) {
        var idx = order[cursor++];
        var iso = cloudTimes[idx];
        if (!iso) continue;
        var meta = gibsWmsFrameMeta(iso, lon);
        if ((playImgCache[meta.key] && playImgCache[meta.key].ok) || playLoadPending[meta.key]) {
          continue;
        }
        playWarmInFlight += 1;
        loadImageSrc(meta.url, false, meta.key).then(() => {
          if (gen !== playWarmGen) return;
          playWarmInFlight = Math.max(0, playWarmInFlight - 1);
          pump();
        }).catch(() => {
          if (gen !== playWarmGen) return;
          playWarmInFlight = Math.max(0, playWarmInFlight - 1);
          pump();
        });
      }
      if (cursor >= order.length && playWarmInFlight === 0) {
        if (pass < 2) {
          pass += 1;
          cursor = 0;
          playWarmTimer = setTimeout(pump, 60);
          return;
        }
        /* Final sweep: if anything still missing, one more full pass */
        if (countPlayTimelineMissing() > 0 && pass === 2) {
          pass = 3;
          cursor = 0;
          playWarmTimer = setTimeout(pump, 120);
          return;
        }
        if (pass >= 3) {
          if (countPlayTimelineMissing() === 0) finishWarm();
          else {
            /* Keep a slow retry so late failures refill */
            pass = 2;
            cursor = 0;
            playWarmTimer = setTimeout(pump, 1500);
          }
          return;
        }
        finishWarm();
        return;
      }
      maybeCachingStatus(countPlayTimelineMissing() + playWarmInFlight);
      if (playWarmInFlight === 0 && cursor < order.length) {
        playWarmTimer = setTimeout(pump, 250);
      }
    }
    pump();
  }
  function playLruClear() {
    cancelPlayTimelineWarm();
    playTimelineWarmed = false;
    playImgCache = Object.create(null);
    playLruOrder = [];
    playLoadPending = Object.create(null);
    playHiResCache = Object.create(null);
    playHiResOrder = [];
    playHiResPending = Object.create(null);
    playHiResInFlight = 0;
    playHiResFade = { pairKey: "", opacity: 0, t0: 0, active: false };
    cloudHiFade = { view: "", t0: 0 };
    playLastFrameKey = null;
    try { if (cloudTween) cloudTween.resetLocks(); } catch (eHr) {}
  }
  function gibsWmsUrl(iso, lon) {
    var layer = goesLayer(lon == null ? -79 : lon);
    var box = roundPlayBbox(mapBbox3857());
    var sz = playImageSize();
    return "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi" +
      "?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0" +
      "&LAYERS=" + encodeURIComponent(layer) +
      "&STYLES=&FORMAT=image/jpeg&TRANSPARENT=FALSE" +
      "&WIDTH=" + sz.w + "&HEIGHT=" + sz.h +
      "&CRS=EPSG:3857" +
      "&BBOX=" + box.minx + "," + box.miny + "," + box.maxx + "," + box.maxy +
      "&TIME=" + encodeURIComponent(iso);
  }
  function gibsWmsFrameMeta(iso, lon) {
    var box = roundPlayBbox(mapBbox3857());
    var sz = playImageSize();
    var url = gibsWmsUrl(iso, lon);
    return { iso: iso, box: box, sz: sz, url: url, key: playFrameKey(iso, box, sz) };
  }
  function computePlayHiResSize() {
    /* opt50: near CSS pixels × DPR, sane max; soft preview stays in computePlayImageSize */
    var el = map && map.getContainer ? map.getContainer() : document.getElementById("map");
    var cw = (el && el.clientWidth) || window.innerWidth || 800;
    var ch = (el && el.clientHeight) || window.innerHeight || 600;
    var dpr = 1;
    try { dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1)); } catch (eD) { dpr = 1; }
    var w = Math.round(cw * dpr);
    var h = Math.round(ch * dpr);
    var maxSide = Math.max(w, h);
    var cap = HI_RES_MAX_SIDE;
    if (maxSide > cap) {
      var s = cap / maxSide;
      w = Math.max(64, Math.round(w * s));
      h = Math.max(64, Math.round(h * s));
    }
    w = Math.max(64, Math.min(cap, w));
    h = Math.max(64, Math.min(cap, h));
    var natHi = clampWmsToNative({ w: w, h: h }); /* opt59: never past native */
    w = natHi.w;
    h = natHi.h;
    var soft = playImageSize();
    if (w < soft.w) w = soft.w;
    if (h < soft.h) h = soft.h;
    return { w: w, h: h };
  }
  function playHiResWorthwhile() {
    var soft = playImageSize();
    var hi = computePlayHiResSize();
    return hi.w > soft.w + 16 || hi.h > soft.h + 16;
  }
  function gibsWmsHiResUrl(iso, lon) {
    var layer = goesLayer(lon == null ? -79 : lon);
    var box = roundPlayBbox(mapBbox3857());
    var sz = computePlayHiResSize();
    return "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi" +
      "?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0" +
      "&LAYERS=" + encodeURIComponent(layer) +
      "&STYLES=&FORMAT=image/jpeg&TRANSPARENT=FALSE" +
      "&WIDTH=" + sz.w + "&HEIGHT=" + sz.h +
      "&CRS=EPSG:3857" +
      "&BBOX=" + box.minx + "," + box.miny + "," + box.maxx + "," + box.maxy +
      "&TIME=" + encodeURIComponent(iso);
  }
  function gibsWmsHiResMeta(iso, lon) {
    var box = roundPlayBbox(mapBbox3857());
    var sz = computePlayHiResSize();
    var url = gibsWmsHiResUrl(iso, lon);
    return { iso: iso, box: box, sz: sz, url: url, key: playFrameKey(iso, box, sz) + "|hi" };
  }
  function playHiResLruTouch(key) {
    var i = playHiResOrder.indexOf(key);
    if (i >= 0) playHiResOrder.splice(i, 1);
    playHiResOrder.push(key);
  }
  function playHiResLruGet(key) {
    var rec = playHiResCache[key];
    if (!rec || !rec.ok) return null;
    playHiResLruTouch(key);
    return rec;
  }
  function playHiResLruSet(key, rec) {
    if (!rec || !rec.ok) return;
    rec.key = key;
    rec.hires = true;
    if (playHiResCache[key]) {
      playHiResCache[key] = rec;
      playHiResLruTouch(key);
      return;
    }
    while (playHiResOrder.length >= PLAY_HIRES_LRU_CAP) {
      var drop = playHiResOrder.shift();
      if (drop && playHiResCache[drop]) delete playHiResCache[drop];
    }
    playHiResCache[key] = rec;
    playHiResOrder.push(key);
  }
function sunnyStep03() {
  /* opt59: GIBS GOES GeoColor is GoogleMapsCompatible_Level7 (~1223 m/px in EPSG:3857).
     Asking WMS for more pixels than that makes the SERVER nearest-upscale → blocky
     mosaic baked into the JPEG. Cap at native; the display-res canvas upsamples with
     high-quality linear smoothing instead (soft, never blocky). */
  GIBS_GEOCOLOR_NATIVE_M_PER_PX = 40075016.686 / (256 * 128);
  GIBS_NATIVE_OVERSAMPLE = 1.0;
}
