// workspace/whereisthesun/app-cloud-frames.js
/* SUNNY app, part 6 of 14: Play map lock, cloud frame display and daylight.
 * Names here are page-wide and shared by every app-*.js file; startSunny in app.js runs each part's step in order. */
"use strict";
var labelsIdleHealArmed, labelsHealBusy;
  function armPlayGestureWatch() {
    clearPlayGestureWatch();
    playGestureWatchTimer = setTimeout(() => {
      playGestureWatchTimer = null;
      if (!playGestureActive) return;
      try {
        if (map && (map.isMoving() || map.isZooming())) {
          armPlayGestureWatch();
          return;
        }
      } catch (eArm) {}
      forceClearPlayGesture("watchdog");
    }, PLAY_GESTURE_MAX_MS);
  }
  function withPlayFrameTimeout(p, ms) {
    return new Promise((resolve) => {
      var settled = false;
      var timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(false);
      }, ms);
      Promise.resolve(p).then((shown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(shown);
      }, () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(false);
      });
    });
  }
  function showPlayLockedMapClouds() {
    /* MapLibre rasters move with the map — stay geo-locked while HTML WMS is wrong */
    if (!map || !cloudTimes.length || radarOn()) return;
    var iso = cloudTimes[cloudIndex];
    var url = gibsTiles(iso, sunnyApp_origin ? sunnyApp_origin.lon : null);
    try {
      presentStaticGibs(url);
      setMapLibreCloudsHidden(false);
      applyCloudPaint(GIBS_LAYER, gibsEffectiveOpacity());
      /* hide IEM hires during play history — only GOES for current play index */
      ["iem-vis"].forEach((id) => {
        if (map.getLayer(id)) {
          try { map.setLayoutProperty(id, "visibility", "none"); } catch (eH) {}
        }
      });
    } catch (eLock) {}
  }
  function beginPlayMapLock() {
    /* opt23: on first pan/zoom while Play — drop fixed WMS, show map-synced tiles NOW */
    if (!playMode || tabHidden || radarOn()) return;
    if (playMoveTimer) { clearTimeout(playMoveTimer); playMoveTimer = null; }
    /* cancel in-flight WMS cover so stale geography never wins mid-drag */
    playLoadGen += 1;
    cancelPlayFade();
    cancelPlayTimelineWarm();
    playGestureActive = true;
    armPlayGestureWatch();
    softHidePlayOverlayForGesture();
    showPlayLockedMapClouds();
  }
  function endPlayMapLock() {
    /* Debounced WMS reload for new bbox; cancel if still dragging */
    if (!playMode || tabHidden) {
      forceClearPlayGesture("idle");
      return;
    }
    if (playMoveTimer) clearTimeout(playMoveTimer);
    playMoveTimer = setTimeout(() => {
      playMoveTimer = null;
      if (!playMode) {
        forceClearPlayGesture("idle");
        return;
      }
      try {
        if (map && (map.isMoving() || map.isZooming())) {
          /* still gesturing — wait for a quiet end */
          endPlayMapLock();
          return;
        }
      } catch (eStill) {}
      syncCloudMap(true);
      playLruClear();
      omPlayGrid = null;
      omPlayPromise = null;
      playHoldStaticUntilFirst = true;
      softShowPlayOverlayAfterGesture();
      if (cloudTimes.length) {
        var iso = cloudTimes[cloudIndex];
        presentPlayFrame(iso).then((shown) => {
          if (shown) {
            /* cover complete (or hold released) — ensure maplibre hidden under HTML */
            playHoldStaticUntilFirst = false;
            setMapLibreCloudsHidden(true);
            softShowPlayOverlayAfterGesture();
            prefetchPlayIndices(cloudIndex);
            startPlayTimelineWarm();
          } else {
            /* WMS failed: keep map-synced tiles, do not flash stale fixed image */
            softHidePlayOverlayForGesture();
            showPlayLockedMapClouds();
            playHoldStaticUntilFirst = false;
          }
          clearPlayGestureWatch();
          playGestureActive = false;
        }).catch(() => {
          softHidePlayOverlayForGesture();
          showPlayLockedMapClouds();
          playHoldStaticUntilFirst = false;
          clearPlayGestureWatch();
          playGestureActive = false;
        });
      } else {
        clearPlayGestureWatch();
        playGestureActive = false;
      }
    }, PLAY_MOVE_DEBOUNCE_MS);
  }
  function onPlayViewChanged() {
    /* Compat: treat as gesture-end reload (resize / other callers) */
    if (!playMode || tabHidden) return;
    beginPlayMapLock();
    endPlayMapLock();
  }
  function presentCloudUrl(url, opts) {
    opts = opts || {};
    if (playMode) {
      /* Play path uses WMS images, not tile URLs */
      var iso = cloudTimes[cloudIndex];
      return presentPlayFrame(iso);
    }
    return presentStaticGibs(url);
  }
  function setCloudFrame(i, opts) {
    if (!cloudTimes.length) return Promise.resolve();
    opts = opts || {};
    if (opts.frac != null && isFinite(Number(opts.frac))) playheadFrac = clampFrac(opts.frac);
    else playheadFrac = clampFrac(i);
    cloudIndex = clampIndex(Math.round(playheadFrac));
    syncSliderUi();
    rebuildTimeTicks();
    var iso = cloudTimes[cloudIndex];
    var atNow = playheadFrac >= sliderMax() - 1e-6 || cloudIndex >= sliderMax();
    var suffix = atNow ? " · NOW" : "";
    timeLabel.textContent = formatFrameLabel(iso) + suffix;
    if (tabHidden) return Promise.resolve();
    /* opt19: radar overlay → no GIBS/hires/Play tile work (mutex) */
    if (radarOn()) {
      setMapLibreCloudsHidden(true);
      return Promise.resolve();
    }
    var p;
    var livePlay = playMode && !scrubbing;
    if (livePlay) {
      /* opt38: kick prefetch the moment reveal/load starts — not only after shown */
      prefetchPlayIndices(cloudIndex);
      p = presentPlayFrame(iso).then((shown) => {
        prefetchPlayIndices(cloudIndex);
        return shown;
      });
    } else if (playMode && scrubbing && !playUseOpenMeteo) {
      /* opt64: scrub draws the keyed canvas at the playhead; nearest loaded frame while loading */
      try { softShowPlayOverlayAfterGesture(); } catch (eScrShow) {}
      paintContinuousClouds();
      p = Promise.resolve(true);
    } else {
      /* paused: never snap to latest unless the playhead is at NOW */
      var isoStatic = (atNow ? goesLatestIsoSync() : iso);
      var url = gibsTiles(isoStatic, sunnyApp_origin ? sunnyApp_origin.lon : null);
      p = presentStaticGibs(url);
    }
    return p.then((shown) => {
      void shown;
      if (playMode) return shown;
      /* Hires (IEM VIS) only at NOW — not while scrubbing history / play */
      if (atNow) {
        refreshHiresRaster("iem-vis", iemVisTiles(sunnyApp_origin ? sunnyApp_origin.lon : null));
        applyHires();
      } else {
        ["iem-vis"].forEach((id) => {
          if (map.getLayer(id)) {
            map.setLayoutProperty(id, "visibility", "none");
            applyCloudPaintMain(id, 0);
          }
        });
        applyCloudPaint(GIBS_LAYER, gibsEffectiveOpacity());
      }
      return shown;
    });
  }
  function applyCloudPaintMain(layerId, opacity) {
    if (overlayXfadeActive) return;
    if (!map.getLayer(layerId)) return;
    /* opt14/opt33: short fade on IEM softens handoff; GOES stays snappy via applyCloudPaint */
    var fade = (layerId === "iem-vis") ? 320 : 0;
    var paint = {
      "raster-opacity": overlayNone ? 0 : opacity,
      "raster-resampling": cloudResamplingForLayer(layerId),
      "raster-fade-duration": fade
    };
    var key;
    for (key in paint) {
      if (Object.prototype.hasOwnProperty.call(paint, key)) {
        map.setPaintProperty(layerId, key, paint[key]);
      }
    }
  }
  function cloudLonLat() {
    if (sunnyApp_origin && isFinite(sunnyApp_origin.lon) && isFinite(sunnyApp_origin.lat)) {
      return { lon: sunnyApp_origin.lon, lat: sunnyApp_origin.lat };
    }
    try {
      if (map && typeof map.getCenter === "function") {
        var c = map.getCenter();
        if (c && isFinite(c.lng) && isFinite(c.lat)) return { lon: c.lng, lat: c.lat };
      }
    } catch (eC) {}
    return { lon: -79, lat: 28 };
  }
  /*
   * opt33: rough solar elevation for VIS usefulness (no keys). IEM GOES VIS is
   * black / useless at night — gate it so GeoColor stays the night cloud picture.
   */
  function approxSolarElevationDeg(lon, lat, whenMs) {
    var ms = whenMs == null ? Date.now() : whenMs;
    var d = new Date(ms);
    var rad = Math.PI / 180;
    var start = Date.UTC(d.getUTCFullYear(), 0, 0);
    var day = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86400000;
    var decl = 23.44 * Math.sin(rad * (360 / 365) * (day - 81));
    var utcH = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
    var ha = (utcH - 12) * 15 + lon; /* hour angle deg */
    var latR = (lat == null || !isFinite(lat) ? 28 : lat) * rad;
    var declR = decl * rad;
    var haR = ha * rad;
    var sinEl = Math.sin(latR) * Math.sin(declR) + Math.cos(latR) * Math.cos(declR) * Math.cos(haR);
    if (sinEl > 1) sinEl = 1;
    if (sinEl < -1) sinEl = -1;
    return Math.asin(sinEl) / rad;
  }
  function isVisDaytime(lon, lat, whenMs) {
    /* VIS needs sun well up; ~8° keeps dusk/dawn from painting a black overlay */
    return approxSolarElevationDeg(lon, lat, whenMs) >= 8;
  }
  function applyHires() {
    if (tabHidden || playMode || radarOn() || overlayXfadeActive) return;
    removeLegacyDailyHires();
    var z = map.getZoom();
    var atNow = !cloudTimes.length || playheadFrac >= sliderMax() - 1e-6 || cloudIndex >= sliderMax();
    var ll = cloudLonLat();
    var daytime = isVisDaytime(ll.lon, ll.lat);
    /*
     * opt33 XOR cloud picture (stop muddy dual-blend):
     * - Far / night / scrub history: GeoColor only @ gibsEffectiveOpacity()
     * - Zoomed NOW + daytime: IEM VIS primary (~0.85–0.95×slider), GeoColor down/out
     * Short crossfade from ~z5.5 → z6.5 once daytime.
     */
    var IEM_Z0 = 5.5;
    var IEM_Z1 = 6.5;
    var wantIem = atNow && daytime && z >= IEM_Z0;
    if (wantIem) {
      addHiresSources();
      var t = Math.max(0, Math.min(1, (z - IEM_Z0) / (IEM_Z1 - IEM_Z0)));
      t = t * t * (3 - 2 * t); /* smoothstep */
      var iemTarget = Math.min(0.95, 0.85 + 0.10 * t) * cloudOpacity;
      var iemOp = iemTarget * (0.20 + 0.80 * t); /* rise into primary */
      var gibsOp = gibsEffectiveOpacity() * (1 - t);
      if (t >= 0.92) gibsOp = 0;
      if (map.getLayer("iem-vis")) {
        map.setLayoutProperty("iem-vis", "visibility", iemOp > 0.02 ? "visible" : "none");
        applyCloudPaintMain("iem-vis", iemOp);
      }
      if (map.getLayer(GIBS_LAYER)) {
        if (gibsOp <= 0.02) {
          try { map.setLayoutProperty(GIBS_LAYER, "visibility", "none"); } catch (eHideG) {}
          applyCloudPaint(GIBS_LAYER, 0);
        } else {
          try { map.setLayoutProperty(GIBS_LAYER, "visibility", "visible"); } catch (eShowG) {}
          applyCloudPaint(GIBS_LAYER, gibsOp);
        }
      }
    } else {
      ["iem-vis"].forEach((id) => {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, "visibility", "none");
          applyCloudPaintMain(id, 0);
        }
      });
      if (map.getLayer(GIBS_LAYER)) {
        try { map.setLayoutProperty(GIBS_LAYER, "visibility", "visible"); } catch (eG2) {}
        applyCloudPaint(GIBS_LAYER, gibsEffectiveOpacity());
      }
    }
    applyCloudRasterResampling();
    restackCloudRasters();
  }
  function basemapLayerId(mode) {
    if (window.SunnyVectorBase.active(mode)) return "vector"; /* opt88: picture tiles off */
    if (mode === "satellite") return "base-sat";
    if (mode === "dark") return "base-dark";
    return "osm";
  }
  function restackBasemap() {
    var layers = map.getStyle() && map.getStyle().layers;
    if (!layers || !layers.length) return;
    var firstOther = null;
    var i, id;
    for (i = 0; i < layers.length; i++) {
      id = layers[i].id;
      if (BASEMAP_IDS.indexOf(id) === -1) {
        firstOther = id;
        break;
      }
    }
    if (!firstOther) return;
    for (i = 0; i < BASEMAP_IDS.length; i++) {
      id = BASEMAP_IDS[i];
      if (map.getLayer(id)) map.moveLayer(id, firstOther);
    }
  }
  function applyBaseMap() {
    var active = basemapLayerId(basemapMode);
    var i, id;
    for (i = 0; i < BASEMAP_IDS.length; i++) {
      id = BASEMAP_IDS[i];
      if (!map.getLayer(id)) continue;
      map.setLayoutProperty(id, "visibility", id === active ? "visible" : "none");
    }
    window.SunnyVectorBase.apply(basemapMode);
    restackBasemap();
  }
  function setBasemapMode(mode) {
    if (mode !== "roads" && mode !== "satellite" && mode !== "dark") mode = "roads";
    basemapMode = mode;
    try { localStorage.setItem(BASEMAP_KEY, basemapMode); } catch (eSet) {}
    var seg = document.getElementById("basemap-seg");
    if (seg) {
      var buttons = seg.querySelectorAll(".seg-btn");
      var b, m;
      for (b = 0; b < buttons.length; b++) {
        m = buttons[b].getAttribute("data-basemap");
        var on = m === basemapMode;
        if (on) buttons[b].classList.add("is-on");
        else buttons[b].classList.remove("is-on");
        buttons[b].setAttribute("aria-pressed", on ? "true" : "false");
      }
    }
    applyBaseMap();
    applyHires();
    if (overlayVisible()) healLabels();
  }
  function applyCloudOpacity() {
    if (overlayXfadeActive) return;
    applyCloudSolidMode();
    if (playMode) setPlayLayerOpacity();
    applyHires();
    if (typeof applyBaseMap === "function") applyBaseMap();
  }
  function addHiresSources() {
    if (tabHidden || radarOn()) return;
    removeLegacyDailyHires();
    var before = cloudStackBefore();
    if (!map.getSource("iem-vis")) {
      map.addSource("iem-vis", {
        type: "raster",
        tiles: [iemVisTiles(sunnyApp_origin ? sunnyApp_origin.lon : -79)],
        tileSize: 256,
        maxzoom: 9,
        attribution: "Iowa Environmental Mesonet / NOAA GOES"
      });
    }
    if (!map.getLayer("iem-vis")) {
      map.addLayer({
        id: "iem-vis",
        type: "raster",
        source: "iem-vis",
        paint: {
          "raster-opacity": 0,
          "raster-resampling": "linear",
          "raster-fade-duration": 0
        }
      }, before);
    }
    restackCloudRasters();
    restackRadar();
  }
  /* aliases */
  function addGibsSource(url) { addGibsStatic(url); }
  function addGibsDoubleBuffer(url) { addGibsStatic(url); }
  function updateRasterTiles(sourceId, url) {
    void sourceId;
    return setStaticGibsTiles(url);
  }
/* === END CLOUD PATCH SNIPPET === */
  function overlayVisible() {
    return !!(toggleMap && toggleMap.checked);
  }
  function restackOverlay() {
    restackBasemap();
    restackCloudRasters();
    restackRadar();
    if (!overlayVisible()) {
      applyOverlay();
      restackCloudRasters();
      restackRadar();
      return;
    }
    ensureOverlayLayers();
    overlayReady = true;
    var before = map.getLayer("beaches-fill") ? "beaches-fill" : undefined;
    overlayIds.forEach((id) => {
      if (map.getLayer(id)) map.moveLayer(id, before);
    });
    /* basemap → clouds/hires → radar → labels → beaches */
    restackCloudRasters();
    restackRadar();
    applyOverlay();
  }
  function applyOverlay() {
    var vis = overlayVisible() ? "visible" : "none";
    overlayIds.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
    });
  }
  /* opt54: re-ensure Labels above cloud/radar after restacks / glyph arrival */
  function healLabels() {
    if (!map || !overlayVisible() || labelsHealBusy) return;
    labelsHealBusy = true;
    try {
      ensureOverlayLayers();
      overlayReady = true;
      var before = map.getLayer("beaches-fill") ? "beaches-fill" : undefined;
      var i, id;
      for (i = 0; i < overlayIds.length; i++) {
        id = overlayIds[i];
        if (map.getLayer(id)) {
          try { map.moveLayer(id, before); } catch (eMv) {}
        }
      }
      applyOverlay();
      try { map.triggerRepaint(); } catch (eRp) {}
    } catch (eHeal) {}
    labelsHealBusy = false;
  }
  function armLabelsIdleHeal() {
    if (overlayVisible()) labelsIdleHealArmed = true;
  }
  function ensureOverlayLayers() {
    /* Fetch glyphs only when Labels are turned on */
    try {
      if (typeof map.setGlyphs === "function") {
        map.setGlyphs("https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf");
      } else if (map.style && map.style.glyphManager == null && map.getStyle) {
        /* older fallback: style already may omit glyphs */
      }
    } catch (eGlyph) {}
    if (!map.getSource("ofm")) {
      map.addSource("ofm", {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
        attribution: "OpenFreeMap · OSM"
      });
    }
    if (map.getLayer("ov-road-casing")) {
      /* Layers already exist — still apply visibility (glyphs may have just been set) */
      applyOverlay();
      return;
    }
    var before = map.getLayer("beaches-fill") ? "beaches-fill" : undefined;
    var roadFilter = [
      "all",
      ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
      ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary", "minor"], true, false],
      ["!=", ["get", "brunnel"], "tunnel"]
    ];
    var vis = overlayVisible() ? "visible" : "none";
    var nameField = ["coalesce", ["get", "name_en"], ["get", "name"], ["get", "name:latin"], ""];
    map.addLayer({
      id: "ov-road-casing",
      type: "line",
      source: "ofm",
      "source-layer": "transportation",
      minzoom: 6,
      filter: roadFilter,
      layout: { "line-cap": "round", "line-join": "round", visibility: vis },
      paint: {
        "line-color": "rgba(10,12,16,0.9)",
        "line-width": ["interpolate", ["exponential", 1.3], ["zoom"], 6, 1.4, 10, 2.6, 14, 7, 18, 18]
      }
    }, before);
    map.addLayer({
      id: "ov-road",
      type: "line",
      source: "ofm",
      "source-layer": "transportation",
      minzoom: 6,
      filter: roadFilter,
      layout: { "line-cap": "round", "line-join": "round", visibility: vis },
      paint: {
        "line-color": "#f4efe4",
        "line-width": ["interpolate", ["exponential", 1.3], ["zoom"], 6, 0.7, 10, 1.5, 14, 3.8, 18, 12]
      }
    }, before);
    map.addLayer({
      id: "ov-road-name",
      type: "symbol",
      source: "ofm",
      "source-layer": "transportation_name",
      minzoom: 12,
      filter: ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary"], true, false],
      layout: {
        visibility: vis,
        "symbol-placement": "line",
        "text-field": nameField,
        "text-font": ["Noto Sans Regular"],
        "text-size": 12,
        "text-max-angle": 30
      },
      paint: {
        "text-color": "#fff",
        "text-halo-color": "rgba(0,0,0,0.85)",
        "text-halo-width": 1.2
      }
    }, before);
    map.addLayer({
      id: "ov-place",
      type: "symbol",
      source: "ofm",
      "source-layer": "place",
      minzoom: 3,
      filter: ["match", ["get", "class"], ["city", "town", "village", "state", "country"], true, false],
      layout: {
        visibility: vis,
        "text-field": nameField,
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 11, 8, 14, 12, 18],
        "text-anchor": "bottom",
        "text-padding": 6,
        "text-optional": false
      },
      paint: {
        "text-color": "#fff",
        "text-halo-color": "rgba(8,10,14,0.92)",
        "text-halo-width": 1.5,
        "text-halo-blur": 0.3
      }
    }, before);
    restackCloudRasters();
    restackRadar();
  }
  function ensureBeachLayers() {
    if (!map.getSource("beaches")) {
      map.addSource("beaches", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "beaches-fill",
        type: "fill",
        source: "beaches",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: {
          "fill-color": "#f0c14b",
          "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.55, 0.32]
        }
      });
      map.addLayer({
        id: "beaches-line",
        type: "line",
        source: "beaches",
        filter: ["match", ["geometry-type"], ["LineString", "Polygon"], true, false],
        paint: {
          "line-color": "#ffe08a",
          "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 3.5, 2],
          "line-opacity": 0.95
        }
      });
      map.addLayer({
        id: "beaches-dot",
        type: "circle",
        source: "beaches",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 2.1, 3, 2.6, 6, 4.5, 9, 8, 12, 8],
          "circle-color": "#f0c14b",
          "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 1, 0.4, 6, 1.2, 10, 2],
          "circle-stroke-color": "#fff",
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 1, 0.7, 5, 0.9, 9, 1]
        }
      });
    }
  }
  function placeUserMarker() {
    if (!sunnyApp_origin) return;
    if (!userMarker) {
      var el = document.createElement("div");
      el.className = "user-dot";
      userMarker = new maplibregl.Marker({ element: el }).setLngLat([sunnyApp_origin.lon, sunnyApp_origin.lat]).addTo(map);
    } else {
      userMarker.setLngLat([sunnyApp_origin.lon, sunnyApp_origin.lat]);
    }
  }
  function placeDest(pt) {
    if (destMarker) { destMarker.remove(); destMarker = null; }
    if (!pt) return;
    var el = document.createElement("div");
    el.className = "clear-dot";
    destMarker = new maplibregl.Marker({ element: el }).setLngLat([pt.lon, pt.lat]).addTo(map);
  }
  function abortIf(signal) {
    if (signal && signal.aborted) {
      var err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }
  }
function sunnyStep06() {
  labelsIdleHealArmed = false;
  labelsHealBusy = false;
}
