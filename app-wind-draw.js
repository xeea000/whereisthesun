// workspace/whereisthesun/app-wind-draw.js
/* SUNNY app, part 11 of 14: wind particles, wind drawing and gestures.
 * Names here are page-wide and shared by every app-*.js file; startSunny in app.js runs each part's step in order. */
"use strict";
var windGl, windGlFailed, RADAR_SRC, RADAR_LAYER, RADAR_OPACITY, RADAR_REFRESH_MS, RADAR_PLAY_DWELL_MS, radarRefreshTimer;
var radarFetchGen, radarHost, radarPath, radarPastAll, radarPast, radarIndex, radarPlaySession, radarPlayBusy;
var radarTween, radarComp, radarCompOrder, RADAR_COMP_CAP, RADAR_COMP_MAX_SIDE, radarCanvasOn;
  function seedWindParticles(reset) {
    if (!map) return;
    var cap = windParticleCap();
    if (reset || !windGrid) buildWindGrid(cap);
    if (reset) windParticles = [];
    windCellCounts = null;
    var n = windGrid.cols * windGrid.rows;
    /* shuffled cell order so the initial field is evenly spread */
    var order = [];
    var i;
    for (i = 0; i < n; i++) order.push(i);
    for (i = n - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    var k = 0;
    while (windParticles.length < cap) {
      var p = { x: 0, y: 0, age: 0, life: 1 };
      stratifiedSpawn(p, order[k % n]);
      k += 1;
      p.age = Math.random() * p.life * 0.8; /* staggered lifetimes */
      windParticles.push(p);
    }
    if (windParticles.length > cap) windParticles.length = cap;
    windNeedsReseed = false;
  }
  function respawnParticle(p) {
    stratifiedSpawn(p, null);
  }
  /* opt56/opt59: projected u/v unit direction in CSS px (handles bearing/pitch) */
  function windScreenDir(lon, lat, u, v) {
    var mag = Math.sqrt(u * u + v * v);
    if (!(mag > 1e-6) || !map) return null;
    var stepM = 400;
    var cosLat = Math.cos(lat * Math.PI / 180);
    if (Math.abs(cosLat) < 0.15) cosLat = cosLat < 0 ? -0.15 : 0.15;
    var dLon = (u / mag * stepM) / (111320 * cosLat);
    var dLat = (v / mag * stepM) / 111320;
    var p0, p1;
    try {
      p0 = map.project([lon, lat]);
      p1 = map.project([lon + dLon, lat + dLat]);
    } catch (ePr) {
      return null;
    }
    var dx = p1.x - p0.x;
    var dy = p1.y - p0.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (!(len > 1e-6)) return null;
    return { x: dx / len, y: dy / len };
  }
  function windScreenDelta(lon, lat, u, v, lengthPx) {
    var d = windScreenDir(lon, lat, u, v);
    if (!d || !(lengthPx > 0)) return { dx: 0, dy: 0 };
    return { dx: d.x * lengthPx, dy: d.y * lengthPx };
  }
  function windOnGestureStart() {
    if (windGl) return; /* opt70: fixed field, no reseed or refetch on gestures */
    /* opt59: never carry particles through a zoom/pan — fade out, then clear */
    if (!windOn) return;
    windMoving = true;
    windNeedsReseed = true;
    if (windLayerEl) {
      try {
        windLayerEl.style.transition = "opacity 140ms linear";
        windLayerEl.style.opacity = "0";
      } catch (eOp) {}
    }
  }
  function windOnGestureEnd() {
    if (windGl) return; /* opt70: fixed field, no reseed or refetch on gestures */
    if (!windOn) return;
    windMoving = false;
    windParticles = [];
    windNeedsReseed = true;
    if (windCtx && windCanvas) {
      try { windCtx.clearRect(0, 0, windCanvas.width, windCanvas.height); } catch (eCl) {}
    }
    if (windLayerEl) {
      try {
        windLayerEl.style.transition = "opacity 260ms linear";
        windLayerEl.style.opacity = "1";
      } catch (eOp2) {}
    }
    if (windField && windFieldCoversView(windField)) {
      seedWindParticles(true);
    }
    /* refetch (debounced) — draws resume from the new field if the current one didn't cover */
    scheduleWindFieldRefresh(false);
  }
  function startWindAnim() {
    if (!windOn || tabHidden) return;
    if (windRaf) return;
    windLastTs = 0;
    windAccumMs = 0;
    function frame(ts) {
      windRaf = 0;
      if (!windOn || tabHidden) return;
      if (!windLastTs) windLastTs = ts;
      var elapsed = ts - windLastTs;
      windLastTs = ts;
      /* opt55: accumulate dt; paint ~24–30fps (cheap) */
      windAccumMs += elapsed;
      if (windAccumMs >= WIND_FRAME_MS) {
        var dt = Math.min(0.08, windAccumMs / 1000);
        windAccumMs = 0;
        paintWindFrame(dt);
      }
      windRaf = requestAnimationFrame(frame);
    }
    windRaf = requestAnimationFrame(frame);
  }
  function stopWindAnim() {
    if (windRaf) {
      try { cancelAnimationFrame(windRaf); } catch (eR) {}
      windRaf = 0;
    }
    windLastTs = 0;
    windAccumMs = 0;
  }
  function windGlCanvas() {
    var c = document.getElementById("wind-gl-canvas");
    if (c || !windLayerEl) return c;
    c = document.createElement("canvas");
    c.id = "wind-gl-canvas";
    c.setAttribute("aria-hidden", "true");
    c.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;";
    windLayerEl.appendChild(c);
    return c;
  }
  function windGlWanted() {
    return !!(window.SunnyWindGL && window.SunnyWindField && !windGlFailed);
  }
  function paintWindGl(dt) {
    var c = window.SunnyWindGL && window.SunnyWindField && !windGlFailed ? windGlCanvas() : null;
    if (!c) return false;
    if (!windGl) windGl = window.SunnyWindGL.create(c, windCanvas.width < 1400 ? 5000 : 9000);
    if (!windGl) {
      windGlFailed = true;
      c.remove();
      return false;
    }
    if (c.width !== windCanvas.width || c.height !== windCanvas.height) {
      c.width = windCanvas.width;
      c.height = windCanvas.height;
    }
    window.SunnyWindField.ensure(map);
    windGl.frame(map, dt, windVisK, windDpr);
    return true;
  }
  function paintWindFrame(dt) {
    ensureWindLayer();
    syncWindCanvasSize();
    if (!windCtx || !windCanvas || !map) return;
    var w = windCanvas.width;
    var h = windCanvas.height;
    windCtx.clearRect(0, 0, w, h);
    if (paintWindGl(dt)) return; /* opt70: GPU particles keep running through pan/zoom; 2D below is the fallback */
    /* opt59: hold during gestures; never draw from a field that doesn't cover the view */
    if (windMoving || mapGesturing) return;
    try { if (map.isMoving() || map.isZooming()) return; } catch (eMv) {}
    if (!windField || !windFieldCoversView(windField)) {
      windFieldWaiting = true;
      return;
    }
    windFieldWaiting = false;
    var view = windViewCss();
    if (windNeedsReseed || !windGrid || Math.abs(windGrid.w - view.w) > 1 || Math.abs(windGrid.h - view.h) > 1) {
      seedWindParticles(true);
    }
    var cap = windParticleCap();
    if (windParticles.length < cap) seedWindParticles(false);
    /* stratum occupancy (before this frame's moves) */
    var g = windGrid;
    var nCells = g.cols * g.rows;
    if (!windCellCounts || windCellCounts.length !== nCells) windCellCounts = new Int16Array(nCells);
    else windCellCounts.fill(0);
    var ci0, cxi, cyi;
    for (ci0 = 0; ci0 < windParticles.length; ci0++) {
      cxi = Math.floor(windParticles[ci0].x / g.cw);
      cyi = Math.floor(windParticles[ci0].y / g.ch);
      if (cxi >= 0 && cyi >= 0 && cxi < g.cols && cyi < g.rows) windCellCounts[cyi * g.cols + cxi] += 1;
    }
    /* anti-clustering: in strata well above the mean (convergence zones), let some
       mature particles fade out early so they respawn into the sparsest strata */
    var meanPer = windParticles.length / Math.max(1, nCells);
    var crowd = Math.max(2, Math.ceil(meanPer * 1.6));
    for (ci0 = 0; ci0 < windParticles.length; ci0++) {
      var pc = windParticles[ci0];
      if (pc.age < 0.6 || pc.life - pc.age < 0.3) continue;
      cxi = Math.floor(pc.x / g.cw);
      cyi = Math.floor(pc.y / g.ch);
      if (cxi < 0 || cyi < 0 || cxi >= g.cols || cyi >= g.rows) continue;
      if (windCellCounts[cyi * g.cols + cxi] > crowd && Math.random() < 0.25) {
        pc.life = pc.age + 0.28; /* normal 0.28s tail fade, then stratified respawn */
        windCellCounts[cyi * g.cols + cxi] -= 1;
      }
    }
    var dpr = windDpr;
    var i, p, ll, uv, dir, speedKmh, pxPerSec, lengthPx, hx, hy, tx, ty, lwCss, maxA, lifeFade, grad;
    windCtx.lineCap = "round";
    windCtx.lineJoin = "round";
    windCtx.globalCompositeOperation = "source-over";
    for (i = 0; i < windParticles.length; i++) {
      p = windParticles[i];
      p.age += dt;
      if (p.age > p.life) respawnParticle(p);
      try {
        ll = map.unproject([p.x, p.y]);
      } catch (eUp) {
        respawnParticle(p);
        continue;
      }
      uv = sampleWindUV(ll.lng, ll.lat);
      if (!uv) {
        respawnParticle(p);
        continue;
      }
      dir = windScreenDir(ll.lng, ll.lat, uv.u, uv.v);
      if (!dir) continue;
      speedKmh = uv.speed;
      /* Screen-space advection: same on-screen pace at every zoom (≈10–90 CSS px/s) */
      pxPerSec = Math.max(10, Math.min(90, 8 + speedKmh * 1.6));
      p.x += dir.x * pxPerSec * dt;
      p.y += dir.y * pxPerSec * dt;
      if (p.x < -20 || p.y < -20 || p.x > view.w + 20 || p.y > view.h + 20) {
        respawnParticle(p);
        continue;
      }
      /* opt60: visibility slider k∈[0,1] scales length/width/alpha; streak along travel */
      lengthPx = (10 + 26 * windVisK + Math.min(16, speedKmh * 0.4)) * dpr;
      hx = p.x * dpr;
      hy = p.y * dpr;
      tx = hx - dir.x * lengthPx;
      ty = hy - dir.y * lengthPx;
      lifeFade = 1;
      if (p.age < 0.18) lifeFade = p.age / 0.18;
      else if (p.age > p.life - 0.28) lifeFade = Math.max(0, (p.life - p.age) / 0.28);
      /* opt60: subtle (k=0) … thick bright near-opaque (k=1); gradient falloff kept */
      maxA = Math.min(1, 0.35 + 0.65 * windVisK + speedKmh / 200) * lifeFade;
      if (maxA < 0.02) continue;
      lwCss = 0.7 + 2.5 * windVisK * windVisK + Math.min(0.8, speedKmh / 60) * (0.4 + 0.6 * windVisK);
      if (windVisK > 0.5) {
        /* dark halo under the streak so it pops on bright clouds / light basemaps */
        windCtx.strokeStyle = "rgba(0,20,40," + (0.35 * (windVisK - 0.5) * 2 * lifeFade).toFixed(3) + ")";
        windCtx.lineWidth = (lwCss + 1.5) * dpr;
        windCtx.beginPath();
        windCtx.moveTo(tx, ty);
        windCtx.lineTo(hx, hy);
        windCtx.stroke();
      }
      try {
        grad = windCtx.createLinearGradient(tx, ty, hx, hy);
        grad.addColorStop(0, "rgba(235,245,255,0)");
        grad.addColorStop(0.45, "rgba(235,245,255," + (maxA * 0.4).toFixed(3) + ")");
        grad.addColorStop(1, "rgba(235,245,255," + maxA.toFixed(3) + ")");
        windCtx.strokeStyle = grad;
      } catch (eG) {
        windCtx.strokeStyle = "rgba(235,245,255," + (maxA * 0.6).toFixed(3) + ")";
      }
      windCtx.lineWidth = lwCss * dpr;
      windCtx.beginPath();
      windCtx.moveTo(tx, ty);
      windCtx.lineTo(hx, hy);
      windCtx.stroke();
    }
  }
  function onWindToggleChange() {
    var on = !!(toggleWind && toggleWind.checked);
    saveSetting(WIND_KEY, on ? "1" : "0");
    setWindUi(on);
    if (on) {
      try { setStatus("Wind on — Open-Meteo particles (subtle streaks; stronger = longer)."); } catch (eS) {}
      fetchWindFieldForView().then((field) => {
        if (!windOn) return;
        if (!field) {
          try { setStatus("Wind field empty — try again in a moment."); } catch (eEmpty) {}
        }
      });
    } else if (/^Wind /.test(statusEl.textContent || "")) {
      setStatus(""); /* opt155: no stale wind note once wind is off */
    }
  }
  function bootWindIfNeeded() {
    if (!windOn) return;
    if (toggleWind) toggleWind.checked = true;
    /* defer fetch until after first paint — don't block boot */
    afterMapBasicsReady(() => {
      if (!windOn) return;
      setWindUi(true);
    });
  }
  function radarOn() {
    return overlayMode === "radar";
  }
  function syncOverlaySeg() {
    if (!overlaySeg) return;
    var btns = overlaySeg.querySelectorAll("[data-overlay]");
    var i, b, mode, on;
    for (i = 0; i < btns.length; i++) {
      b = btns[i];
      mode = b.getAttribute("data-overlay");
      on = !overlayNone && mode === overlayMode;
      if (on) b.classList.add("is-on");
      else b.classList.remove("is-on");
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
    if (btnPlay) { btnPlay.classList.toggle("is-disabled", overlayNone); btnPlay.title = overlayNone ? "Turn on Clouds or Radar to play" : ""; }
  }
  function setCloudSliderDisabled(disabled) {
    if (!cloudOpacityEl) return;
    cloudOpacityEl.disabled = !!disabled;
    if (disabled) {
      cloudOpacityEl.setAttribute("aria-disabled", "true");
      cloudOpacityEl.classList.add("is-radar-muted");
    } else {
      cloudOpacityEl.removeAttribute("aria-disabled");
      cloudOpacityEl.classList.remove("is-radar-muted");
    }
    try {
      var lab = cloudOpacityEl.closest ? cloudOpacityEl.closest("label") : null;
      if (lab) {
        if (disabled) lab.classList.add("is-radar-muted");
        else lab.classList.remove("is-radar-muted");
      }
    } catch (eLab) {}
  }
  function radarTileUrl(host, path) {
    return window.SunnyRadar.tileUrl(host, path); /* opt67: IEM NEXRAD n0q composite */
  }
  function pickRadarFrame(data) {
    var past = (data && data.radar && Array.isArray(data.radar.past)) ? data.radar.past : [];
    var nowcast = (data && data.radar && Array.isArray(data.radar.nowcast)) ? data.radar.nowcast : [];
    if (past.length) return past[past.length - 1];
    if (nowcast.length) return nowcast[nowcast.length - 1];
    return null;
  }
  function radarSliderMax() {
    return Math.max(0, radarPast.length - 1);
  }
  function radarPastForRange(all) {
    if (!all || !all.length) return [];
    var last = all[all.length - 1];
    var latestMs = last && last.time != null ? Number(last.time) * 1000 : NaN;
    if (!isFinite(latestMs)) return all.slice();
    var startMs = latestMs - playHoursBack() * 3600 * 1000;
    return all.filter((fr) => {
      return fr && fr.time != null && Number(fr.time) * 1000 >= startMs - 1500;
    });
  }
  function applyRadarPastKeep(keepMs) {
    /* Only remap loopStartFrac onto radar indices while Radar overlay is active */
    var keepLoopMs = (loopStartInited && typeof radarOn === "function" && radarOn())
      ? loopStartMs() : NaN;
    radarPast = radarPastForRange(radarPastAll);
    if (isFinite(keepMs) && radarPast.length) {
      var best = 0, bestD = Infinity, i, ms, d;
      for (i = 0; i < radarPast.length; i++) {
        if (!radarPast[i] || radarPast[i].time == null) continue;
        ms = Number(radarPast[i].time) * 1000;
        d = Math.abs(ms - keepMs);
        if (d < bestD) { bestD = d; best = i; }
      }
      radarIndex = best;
      if (!playAnimating) playheadFrac = best;
    } else if (radarPast.length) {
      radarIndex = radarSliderMax();
      if (!playAnimating) playheadFrac = radarIndex;
    }
    if (radarPast.length && typeof radarOn === "function" && radarOn()) {
      if (isFinite(keepLoopMs)) {
        var lb = 0, ld = Infinity, j, jms, jd;
        for (j = 0; j < radarPast.length; j++) {
          if (!radarPast[j] || radarPast[j].time == null) continue;
          jms = Number(radarPast[j].time) * 1000;
          jd = Math.abs(jms - keepLoopMs);
          if (jd < ld) { ld = jd; lb = j; }
        }
        loopStartFrac = lb;
        loopStartInited = true;
        persistLoopStart();
      } else {
        ensureLoopStartInited();
        loopStartFrac = clampLoopStart(loopStartFrac);
      }
      if (playheadFrac < loopStartFrac) playheadFrac = loopStartFrac;
    }
  }
  function clampRadarIndex(i) {
    var n = Number(i);
    if (!isFinite(n)) n = 0;
    return Math.max(0, Math.min(Math.floor(n), radarSliderMax()));
  }
  function nearestRadarIndexByMs(want) {
    if (!radarPast || !radarPast.length || !isFinite(want)) {
      return clampRadarIndex(radarIndex);
    }
    var best = 0, bestD = Infinity, i, ms, d;
    for (i = 0; i < radarPast.length; i++) {
      if (!radarPast[i] || radarPast[i].time == null) continue;
      ms = Number(radarPast[i].time) * 1000;
      if (!isFinite(ms)) continue;
      d = Math.abs(ms - want);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
  function formatRadarLabel(frame) {
    if (!frame || !frame.time) return "Radar";
    var d = new Date(Number(frame.time) * 1000);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  function syncRadarTimelineUi() {
    if (!slider || !radarPast.length) return;
    radarIndex = clampRadarIndex(radarIndex);
    if (!playAnimating) playheadFrac = radarIndex;
    syncSliderUi();
    var frame = radarPast[radarIndex];
    var atNow = playheadFrac >= radarSliderMax() - 1e-6 || radarIndex >= radarSliderMax();
    if (timeLabel) {
      timeLabel.textContent = formatRadarLabel(frame) + (atNow ? " · NOW" : "");
    }
    rebuildTimeTicks();
  }
  function stopRadarRefresh() {
    if (radarRefreshTimer) {
      clearInterval(radarRefreshTimer);
      radarRefreshTimer = null;
    }
  }
  function radarParkedOffNow() {
    return !!(radarPast.length && radarIndex < radarSliderMax());
  }
  function startRadarRefresh() {
    stopRadarRefresh();
    if (!radarOn() || tabHidden) return;
    if (isPlaying() || scrubbing) return;
    /* opt28: parked on a past radar frame — do not jump to latest */
    if (radarParkedOffNow()) return;
    radarRefreshTimer = setInterval(() => {
      if (!radarOn() || tabHidden) {
        stopRadarRefresh();
        return;
      }
      if (isPlaying() || scrubbing) return;
      if (radarParkedOffNow()) {
        stopRadarRefresh();
        return;
      }
      fetchAndApplyRadar({ quiet: true });
    }, RADAR_REFRESH_MS);
  }
  /* opt40/opt42: single radar source — MapLibre raster-fade-duration softens Play setTiles
   * (opt42 motion lerp is clouds/WMS only; do NOT restore dual RainViewer tile URLs).
   * opt40: single radar source — MapLibre raster-fade-duration softens Play setTiles
     without a second live tile URL (dual buffer doubled RainViewer traffic → CORS spam). */
  function setRadarFadeDuration(ms) {
    if (!map || !map.getLayer(RADAR_LAYER)) return;
    var n = Number(ms);
    if (!isFinite(n) || n < 0) n = 0;
    try { map.setPaintProperty(RADAR_LAYER, "raster-fade-duration", n); } catch (eFd) {}
  }
  function ensureRadarLayer(url, opts) {
    opts = opts || {};
    if (!map || !url) return;
    var before = radarStackBefore();
    var fade = opts.fadeMs;
    if (fade == null) {
      fade = (isPlaying() && radarOn()) ? playFadeMs() : 0;
    }
    if (!map.getSource(RADAR_SRC)) {
      map.addSource(RADAR_SRC, {
        type: "raster",
        tiles: [url],
        tileSize: 256,
        maxzoom: window.SunnyRadar.MAX_ZOOM, /* 1 km composite; MapLibre overzooms beyond */
        attribution: window.SunnyRadar.ATTRIB
      });
      window.SunnyRadar.attach(map);
    } else {
      var src = map.getSource(RADAR_SRC);
      if (src && typeof src.setTiles === "function") {
        try {
          var cur = (src.tiles && src.tiles[0]) || "";
          if (cur !== url) src.setTiles([url]);
        } catch (eSet) {
          try { src.setTiles([url]); } catch (e2) {}
        }
      }
    }
    var wantOp = RADAR_OPACITY;
    if (opts.opacity != null && isFinite(Number(opts.opacity))) {
      wantOp = Number(opts.opacity);
    } else if (overlayXfadeActive) {
      wantOp = 0;
      try {
        if (map.getLayer(RADAR_LAYER)) {
          var curOp = Number(map.getPaintProperty(RADAR_LAYER, "raster-opacity"));
          if (isFinite(curOp)) wantOp = curOp;
        }
      } catch (eCurOp) {}
    }
    if (overlayXfadeActive && (fade == null || fade < OVERLAY_XFADE_MS)) {
      fade = OVERLAY_XFADE_MS;
    }
    if (!map.getLayer(RADAR_LAYER)) {
      map.addLayer({
        id: RADAR_LAYER,
        type: "raster",
        source: RADAR_SRC,
        paint: {
          "raster-opacity": wantOp,
          "raster-fade-duration": fade,
          "raster-resampling": "linear"
        }
      }, before);
    } else {
      try { map.setLayoutProperty(RADAR_LAYER, "visibility", "visible"); } catch (eVis) {}
      if (!overlayXfadeActive || opts.opacity != null) {
        try { map.setPaintProperty(RADAR_LAYER, "raster-opacity", wantOp); } catch (eOp) {}
      }
      setRadarFadeDuration(fade);
      try { map.moveLayer(RADAR_LAYER, before); } catch (eMv) {}
    }
    /* Drop a dual buffer left by a stored session (opt39) */
    try {
      if (map.getLayer("radar-b")) map.removeLayer("radar-b");
    } catch (eLb) {}
    try {
      if (map.getSource("radar-b")) map.removeSource("radar-b");
    } catch (eSb) {}
    restackCloudRasters();
    restackRadar();
  }
  function hideRadarLayer() {
    try { hideRadarCanvas(false); } catch (eHrc) {}
    stopRadarRefresh();
    radarFetchGen += 1;
    radarHost = null;
    radarPath = null;
    radarPastAll = [];
    radarPast = [];
    radarIndex = 0;
    if (!map) return;
    if (map.getLayer(RADAR_LAYER)) {
      try { map.removeLayer(RADAR_LAYER); } catch (eRmL) {}
    }
    if (map.getSource(RADAR_SRC)) {
      try { map.removeSource(RADAR_SRC); } catch (eRmS) {}
    }
    try {
      if (map.getLayer("radar-b")) map.removeLayer("radar-b");
    } catch (eLb2) {}
    try {
      if (map.getSource("radar-b")) map.removeSource("radar-b");
    } catch (eSb2) {}
  }
  function applyRadarFrameAt(i, opts) {
    opts = opts || {};
    if (!radarOn() || !radarPast.length || !radarHost) return false;
    radarIndex = clampRadarIndex(i);
    var frame = radarPast[radarIndex];
    if (!frame || !frame.path) return false;
    radarPath = frame.path;
    var fade = opts.blend ? playFadeMs() : 0;
    ensureRadarLayer(radarTileUrl(radarHost, frame.path), { fadeMs: fade });
    syncRadarTimelineUi();
    return true;
  }
  function radarPlayLayerEl() {
    var host = map && map.getContainer && map.getContainer();
    if (!host) return null;
    var el = document.getElementById("radar-play-layer");
    if (!el) {
      el = document.createElement("div");
      el.id = "radar-play-layer";
      el.setAttribute("aria-hidden", "true");
      el.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none;display:none;";
      var c = document.createElement("canvas");
      c.className = "radar-play-canvas";
      c.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
      el.appendChild(c);
    }
    if (el.parentNode !== host) host.appendChild(el);
    return el;
  }
  function radarPlayCanvasEl() {
    var el = radarPlayLayerEl();
    return el ? el.querySelector(".radar-play-canvas") : null;
  }
function sunnyStep11() {
  /* opt70: GPU wind on one fixed lat/lon field (wind-field.js); particles live in map space */
  windGl = null;
  windGlFailed = false;
  /* debug/verify hook (read-only) */
  window.__sunnyWind = () => {
    return {
      on: windOn,
      vis: windVisK,
      moving: windMoving,
      waiting: windFieldWaiting,
      covers: !!(windField && windFieldCoversView(windField)),
      n: windParticles.length,
      pts: windParticles.map((q) => { return [Math.round(q.x), Math.round(q.y)]; }),
      view: windViewCss()
    };
  };
  /* === END WIND LINES (opt53–opt56) === */
  /* === BEGIN RAINVIEWER RADAR (opt16) + overlay mode (opt19) + single-buffer fade (opt40) === */
  RADAR_SRC = "radar";
  RADAR_LAYER = "radar";
  RADAR_OPACITY = 0.7;
  RADAR_REFRESH_MS = 6 * 60 * 1000; /* ~6 min while Radar on + tab visible + not playing */
  RADAR_PLAY_DWELL_MS = PLAY_PACE_MS; /* opt37: shared pace with clouds */
  radarRefreshTimer = null;
  radarFetchGen = 0;
  radarHost = null;
  radarPath = null;
  radarPastAll = []; /* unfiltered RainViewer past */
  radarPast = []; /* {time, path}[] from manifest, range-clipped */
  radarIndex = 0;
  radarPlaySession = 0;
  radarPlayBusy = false;
  /* opt60: radar plugs into the SAME frame-tween engine (small adapter only).
     RainViewer tiles for the current view are composited per frame onto a canvas
     (CORS: tilecache sends ACAO:*), then the shared engine tweens them exactly like
     clouds. MapLibre radar layer stays the static/gesture/fallback path. */
  radarTween = null;
  radarComp = Object.create(null); /* key → {key, canvas, done, pending} */
  radarCompOrder = [];
  RADAR_COMP_CAP = 40;
  RADAR_COMP_MAX_SIDE = 2048;
  radarCanvasOn = false;
}
