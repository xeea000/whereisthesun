// workspace/whereisthesun/app-core.js
/* SUNNY app, part 1 of 14: status line, distance helpers, GOES satellite time and shared settings.
 * Names here are page-wide and shared by every app-*.js file; startSunny in app.js runs each part's step in order. */
"use strict";
var st, BEACH_RADIUS_M, BEACH_CAP, SUNNY_CLOUD, SUNNY_PICK_CAP, DWELL_MS, PLAY_MS, FRAME_MIN;
var HOURS_BACK, PLAY_WINDOW_MS, SLIDER_RES, METEO_URL, WIKI_URL, GEOCODE_URL, statusEl, btnLocate;
var btnAll, btnSun, toggleSunny, sunnySheet, sunnySheetTitle, sunnySheetList, sunnySheetSub, sunnySheetClose;
var btnPlay, btnSpeed, toggleLoop, loopBtn, playSpeedEl, slider, timeLabel, timeTicksEl;
var cloudOpacityEl, toggleMap, toggleIntl, toggleWind, windVisInput, WIND_VIS_KEY, WIND_VIS_DEFAULT, windVisK;
var overlaySeg, rangeSeg, sunnyApp_origin, homeCountry, beaches, waitingForTap, locateWatchId, locateDeadlineTimer;
var userMarker, destMarker, popup, hoverId, dwellTimer, playTimer, cloudTimes, cloudIndex;
var hourlyCache, currentWxCache, CURRENT_WX_TTL_MS, wikiCache, cloudOpacity, _co, searchingSunny, overlayIds;
var BASEMAP_KEY, OPACITY_KEY, LABELS_KEY, INTL_KEY, RADAR_KEY, OVERLAY_KEY, WIND_KEY, LOOP_KEY;
var overlayNone = false; /* opt96: Clouds and Radar both off */
var SPEED_KEY, RANGE_KEY, LOOP_START_KEY, _sunnySavedLoopStartFrac, overlayMode, playLoop, playSpeed, cloudOpacitySavedForRadar;
var OVERLAY_XFADE_MS, overlayXfadeRaf, overlayXfadeGen, overlayXfadeActive, VIEW_KEY, BASEMAP_IDS, basemapMode, MOVE_DEBOUNCE_MS;
var viewSaveTimer, settingsRestored, savedBasemap, savedOp, opN, savedLabels, savedIntl, savedOverlay;
var savedRadar, windOn, savedWind, savedLoop, savedSpeed, spN, savedRange, rN;
var savedLs, lsN, allMode, nearbyBeaches, viewGen, moveTimer, viewAbort, resumePlay;
var tabHidden, LOCATE_KEY, playSizeCache, playSizeResizeTimer, beachRegionRevalidated, beachDb, beachDbPromise, beachGrid;
var beachManifest, beachManifestPromise, beachRegionsLoaded, beachRegionInflight, beachDbComplete, beachSeenIds, beachByIdMap, GRID_DEG;
var DEFAULT_WARM_LAT, DEFAULT_WARM_LON, WX_BATCH, WX_PARALLEL, WX_FETCH_TIMEOUT_MS, wxFetchAbort, sheetSunnyMode, sheetListRows;
var wxSearchGen, lastPaintKey, overlayReady, hoverThrottle, bootCenter, bootZoom, rawView, ov;
var map, GOES_STEP_MS, GOES_AVAIL_LAG_MS, GOES_PROBE_TTL_MS, GOES_PROBE_BACK_STEPS, goesTimeCache, goesLastGoodIso, goesTimeProbe;
  function setStatus(text) {
    statusEl.textContent = text;
  }
  function toRad(d) { return (d * Math.PI) / 180; }
  function haversineKm(aLat, aLon, bLat, bLon) {
    var dLat = toRad(bLat - aLat);
    var dLon = toRad(bLon - aLon);
    var s =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  function formatKm(km) {
    if (km < 10) return km.toFixed(1) + " km";
    return Math.round(km) + " km";
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function pad(n) { return n < 10 ? "0" + n : String(n); }
  function snapGoesMs(ms) {
    var n = Number(ms);
    if (!isFinite(n)) n = Date.now();
    return Math.floor(n / GOES_STEP_MS) * GOES_STEP_MS;
  }
  function toGoesIso(ms) {
    var d = new Date(snapGoesMs(ms));
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) +
      "T" + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":00Z";
  }
  function goesWallLatestMs() {
    return snapGoesMs(Date.now() - GOES_AVAIL_LAG_MS);
  }
  function goesIsoMs(iso) {
    var t = Date.parse(iso);
    return isFinite(t) ? t : NaN;
  }
  function rememberGoesGood(iso) {
    if (!iso || typeof iso !== "string") return;
    var ms = goesIsoMs(iso);
    if (!isFinite(ms)) return;
    if (ms > goesWallLatestMs()) return;
    goesLastGoodIso = iso;
    goesTimeCache = { iso: iso, t: Date.now() };
  }
  function goesLatestIsoSync() {
    var wallMs = goesWallLatestMs();
    var wallIso = toGoesIso(wallMs);
    /* opt40: once probed, NEVER tip newer than last successful slot */
    if (goesLastGoodIso) {
      var gMs = goesIsoMs(goesLastGoodIso);
      if (isFinite(gMs)) {
        var tipMs = Math.min(gMs, wallMs);
        return toGoesIso(tipMs);
      }
    }
    if (goesTimeCache && goesTimeCache.iso) {
      var cMs = goesIsoMs(goesTimeCache.iso);
      if (isFinite(cMs) && cMs <= wallMs) return goesTimeCache.iso;
    }
    return wallIso;
  }
  function buildCloudTimes() {
    var latest = goesIsoMs(goesLatestIsoSync());
    if (!isFinite(latest)) latest = goesWallLatestMs();
    latest = snapGoesMs(latest);
    var wall = goesWallLatestMs();
    if (latest > wall) latest = wall;
    /* opt40: never include times newer than last successful probe */
    if (goesLastGoodIso) {
      var gMs = snapGoesMs(goesIsoMs(goesLastGoodIso));
      if (isFinite(gMs) && latest > gMs) latest = gMs;
    }
    var start = latest - HOURS_BACK * 3600 * 1000;
    var out = [];
    var t;
    for (t = start; t <= latest; t += GOES_STEP_MS) out.push(toGoesIso(t));
    return out;
  }
  function goesProbeTileUrl(iso, lon) {
    var layer = goesLayer(lon == null ? -79 : lon);
    /* Mid-disk z4 tile: East FL ~4/6/4; West CA ~4/6/2 */
    var z = 4;
    var y = 6;
    var x = (lon != null && lon <= -105) ? 2 : 4;
    return "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/" + layer +
      "/default/" + iso + "/GoogleMapsCompatible_Level7/" + z + "/" + y + "/" + x + ".png";
  }
  function probeGoesWmtsTile(iso, lon) {
    var url = goesProbeTileUrl(iso, lon);
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = null;
    var p = fetch(url, {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      signal: ctrl ? ctrl.signal : undefined
    }).then((res) => {
      if (!res.ok) return false;
      return res.blob().then((b) => {
        return !!(b && b.size > 2000);
      });
    }).catch(() => {
      return false;
    });
    if (ctrl) {
      timer = setTimeout(() => {
        try { ctrl.abort(); } catch (eA) {}
      }, 6000);
      p = p.then((ok) => {
        clearTimeout(timer);
        return ok;
      }, (err) => {
        clearTimeout(timer);
        throw err;
      });
    }
    return p;
  }
  function resolveGoesLatestIso(lon) {
    if (goesTimeCache && goesTimeCache.iso && (Date.now() - goesTimeCache.t) < GOES_PROBE_TTL_MS) {
      return Promise.resolve(goesTimeCache.iso);
    }
    if (goesTimeProbe) return goesTimeProbe;
    var startMs = goesWallLatestMs();
    /* opt52: probe several 10-min slots in parallel instead of serial walk-back */
    var PROBE_BATCH = 4;
    function tryBatch(startStep) {
      if (startStep > GOES_PROBE_BACK_STEPS) {
        var fb = goesLatestIsoSync();
        rememberGoesGood(fb);
        return Promise.resolve(fb);
      }
      var probes = [];
      var s;
      for (s = startStep; s <= GOES_PROBE_BACK_STEPS && probes.length < PROBE_BATCH; s++) {
        ((step) => {
          var iso = toGoesIso(startMs - step * GOES_STEP_MS);
          probes.push({ step: step, iso: iso, p: probeGoesWmtsTile(iso, lon) });
        })(s);
      }
      return Promise.all(probes.map((x) => { return x.p; })).then((oks) => {
        var j;
        for (j = 0; j < oks.length; j++) {
          if (oks[j]) {
            rememberGoesGood(probes[j].iso);
            return probes[j].iso;
          }
        }
        return tryBatch(startStep + probes.length);
      });
    }
    goesTimeProbe = tryBatch(0).then((iso) => {
      goesTimeProbe = null;
      return iso;
    }).catch(() => {
      goesTimeProbe = null;
      return goesLatestIsoSync();
    });
    return goesTimeProbe;
  }
  function applyGoesLatestToTimeline(iso) {
    if (!iso) return;
    rememberGoesGood(iso);
    var atEnd = !cloudTimes.length || cloudIndex >= sliderMax();
    var keepIso = (!atEnd && cloudTimes[cloudIndex]) ? cloudTimes[cloudIndex] : null;
    cloudTimes = buildCloudTimes();
    refreshPlayCacheCaps();
    if (atEnd) cloudIndex = sliderMax();
    else if (keepIso) {
      var found = cloudTimes.indexOf(keepIso);
      if (found >= 0) cloudIndex = found;
      else cloudIndex = nearestCloudIndex(keepIso);
    } else {
      cloudIndex = clampIndex(cloudIndex);
    }
    playheadFrac = cloudIndex;
    if (loopStartInited) {
      loopStartFrac = clampLoopStart(loopStartFrac);
      if (playheadFrac < loopStartFrac) playheadFrac = loopStartFrac;
    } else {
      ensureLoopStartInited();
    }
    syncSliderUi();
    rebuildTimeTicks();
  }
  function goesIsoForStaticRestore() {
    /* opt28: paused mid-timeline restores that frame, not NOW */
    if (!cloudTimes.length) return goesLatestIsoSync();
    var atNow = playheadFrac >= sliderMax() - 1e-6 || cloudIndex >= sliderMax();
    if (atNow) return goesLatestIsoSync();
    var iso = cloudTimes[cloudIndex];
    if (!iso) return goesLatestIsoSync();
    var ms = goesIsoMs(iso);
    var wall = goesWallLatestMs();
    if (isFinite(ms) && ms > wall) return goesLatestIsoSync();
    return iso;
  }
  function nearestCloudIndex(iso) {
    var want = goesIsoMs(iso);
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
  function goesLayer(lon) {
    if (lon <= -105) return "GOES-West_ABI_GeoColor";
    return "GOES-East_ABI_GeoColor";
  }
  function gibsTiles(iso, lon) {
    var layer = goesLayer(lon == null ? -79 : lon);
    var u = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/" + layer + "/default/" + iso + "/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png";
    return window.SunnyCloudKey ? window.SunnyCloudKey.tileUrl(u) : u; /* opt63: cloud-only tiles */
  }
  function utcDate(offsetDays) {
    var d = new Date(Date.now() - (offsetDays || 0) * 86400000);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }
  /*
   * opt27: Drop gappy daily MODIS Terra + VIIRS SNPP CorrectedReflectance from the
   * live stack (granule gaps → widespread 404s even on "available" days). Keep
   * GOES GeoColor (static + Play WMS) and IEM GOES VIS 1km for zoomed NOW sharpness.
   * Remove leftover modis/viirs sources/layers on hot reload.
   */
  function removeLegacyDailyHires() {
    if (!map || !map.getLayer) return;
    ["modis", "viirs"].forEach((id) => {
      try {
        if (map.getLayer(id)) map.removeLayer(id);
      } catch (eL) {}
      try {
        if (map.getSource(id)) map.removeSource(id);
      } catch (eS) {}
    });
  }
  function refreshHiresRaster(srcId, url) {
    if (!map || !map.getSource) return;
    var src = map.getSource(srcId);
    if (src && typeof src.setTiles === "function") {
      try {
        var cur = src.tiles && src.tiles[0];
        if (cur !== url) src.setTiles([url]);
      } catch (eRef) {
        try { src.setTiles([url]); } catch (e2) {}
      }
    }
  }
  function iemVisTiles(lon) {
    var layer = (lon != null && lon <= -105) ? "goes-west-vis-1km" : "goes-east-vis-1km";
    var u = "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/" + layer + "/{z}/{x}/{y}.png";
    return window.SunnyCloudKey ? window.SunnyCloudKey.tileUrl(u) : u; /* opt63: cloud-only */
  }
  function formatFrameLabel(iso) {
    var d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  function formatTickClock(isoOrDate) {
    var d = (isoOrDate instanceof Date) ? isoOrDate : new Date(isoOrDate);
    if (!isFinite(d.getTime())) return "";
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  function pickTickIndices(max) {
    var n, i, idx, out, seen;
    if (!isFinite(max) || max <= 0) return [0];
    n = 5;
    try {
      if (typeof window !== "undefined" && window.innerWidth < 700) n = 4;
    } catch (eN) {}
    if (max + 1 < n) n = max + 1;
    if (n > 6) n = 6;
    if (n < 2) return [0, max];
    out = [];
    seen = Object.create(null);
    for (i = 0; i < n; i++) {
      idx = Math.round(i * max / (n - 1));
      if (seen[idx]) continue;
      seen[idx] = 1;
      out.push(idx);
    }
    return out;
  }
function sunnyStep01() {
  BEACH_RADIUS_M = 50000;
  BEACH_CAP = 60;
  SUNNY_CLOUD = 20;
  SUNNY_PICK_CAP = 12;
  DWELL_MS = 850;
  PLAY_MS = 450;
  FRAME_MIN = 10;
  HOURS_BACK = 24;
  PLAY_WINDOW_MS = 60 * 60 * 1000; /* opt48: Play window Now−1h */
  SLIDER_RES = 100; /* opt48: substeps per frame for smooth scrubber */
  METEO_URL = "https://api.open-meteo.com/v1/forecast";
  WIKI_URL = "https://en.wikipedia.org/api/rest_v1/page/summary/";
  GEOCODE_URL = "https://api.bigdatacloud.net/data/reverse-geocode-client";
  statusEl = document.getElementById("status");
  btnLocate = document.getElementById("btn-locate");
  btnAll = document.getElementById("btn-all");
  btnSun = document.getElementById("btn-sun");
  toggleSunny = document.getElementById("toggle-sunny");
  sunnySheet = document.getElementById("sunny-sheet");
  sunnySheetTitle = document.getElementById("sunny-sheet-title");
  sunnySheetList = document.getElementById("sunny-sheet-list");
  sunnySheetSub = document.getElementById("sunny-sheet-sub");
  sunnySheetClose = document.getElementById("sunny-sheet-close");
  btnPlay = document.getElementById("btn-play");
  btnSpeed = document.getElementById("btn-speed");
  toggleLoop = document.getElementById("toggle-loop");
  loopBtn = document.getElementById("loop-btn");
  playSpeedEl = document.getElementById("play-speed");
  slider = document.getElementById("time-slider");
  timeLabel = document.getElementById("time-label");
  timeTicksEl = document.getElementById("time-ticks");
  cloudOpacityEl = document.getElementById("cloud-opacity");
  toggleMap = document.getElementById("toggle-map");
  toggleIntl = document.getElementById("toggle-intl");
  toggleWind = document.getElementById("toggle-wind");
  windVisInput = document.getElementById("wind-vis");
  WIND_VIS_KEY = "sunny-wind-vis";
  WIND_VIS_DEFAULT = 60; /* opt60: a bit more visible than opt59 by default */
  windVisK = WIND_VIS_DEFAULT / 100;
  (() => {
    var v = WIND_VIS_DEFAULT;
    try {
      var sv = localStorage.getItem(WIND_VIS_KEY);
      if (sv != null && sv !== "" && isFinite(Number(sv))) v = Math.max(0, Math.min(100, Number(sv)));
    } catch (eW) {}
    windVisK = v / 100;
    if (windVisInput) {
      windVisInput.value = String(v);
      windVisInput.addEventListener("input", () => {
        var n = Math.max(0, Math.min(100, Number(windVisInput.value) || 0));
        windVisK = n / 100;
        try { localStorage.setItem(WIND_VIS_KEY, String(n)); } catch (eS) {}
      });
    }
  })();
  overlaySeg = document.getElementById("overlay-seg");
  rangeSeg = document.getElementById("range-seg");
  sunnyApp_origin = null;
  homeCountry = null;
  beaches = [];
  waitingForTap = false;
  locateWatchId = null;
  locateDeadlineTimer = null;
  userMarker = null;
  destMarker = null;
  popup = null;
  hoverId = null;
  dwellTimer = null;
  playTimer = null;
  cloudTimes = [];
  cloudIndex = 0;
  hourlyCache = {};
  currentWxCache = {};
  CURRENT_WX_TTL_MS = 20 * 60 * 1000;
  wikiCache = {};
  cloudOpacity = 0.90;
  if (cloudOpacityEl) {
    _co = Number(cloudOpacityEl.value);
    if (isFinite(_co)) cloudOpacity = Math.max(0, Math.min(1, _co / 100));
  }
  if (toggleLoop) toggleLoop.checked = !!playLoop;
  searchingSunny = false;
  overlayIds = ["ov-road-casing", "ov-road", "ov-road-name", "ov-place"];
  BASEMAP_KEY = "sunny-basemap";
  OPACITY_KEY = "sunny-cloud-opacity";
  LABELS_KEY = "sunny-labels";
  INTL_KEY = "sunny-intl";
  RADAR_KEY = "sunny-radar"; /* read once and moved to OVERLAY_KEY */
  OVERLAY_KEY = "sunny-overlay";
  WIND_KEY = "sunny-wind"; /* opt53: Wind lines toggle */
  LOOP_KEY = "sunny-loop";
  SPEED_KEY = "sunny-play-speed";
  RANGE_KEY = "sunny-hours-back";
  LOOP_START_KEY = "sunny-loop-start"; /* opt49: 0–1 fraction of timeline */
  _sunnySavedLoopStartFrac = null;
  /* opt19: overlayMode clouds|radar — remember opacity while radar mutes clouds */
  overlayMode = "clouds"; /* "clouds" | "radar" */
  playLoop = true; /* opt21: Loop checkbox default ON */
  playSpeed = 1; /* opt22: 0.5|1|1.5|2|3 */
  cloudOpacitySavedForRadar = null; /* 0–100 or null while muted */
  OVERLAY_XFADE_MS = 380; /* opt57: Clouds↔Radar crossfade */
  overlayXfadeRaf = 0;
  overlayXfadeGen = 0;
  overlayXfadeActive = false;
  VIEW_KEY = "sunny-last-view";
  BASEMAP_IDS = ["osm", "base-sat", "base-dark"];
  basemapMode = "roads";
  MOVE_DEBOUNCE_MS = 220; /* opt12: single queue for paint/regions/Play bbox */
  viewSaveTimer = null;
  settingsRestored = false;
  try {
    savedBasemap = localStorage.getItem(BASEMAP_KEY);
    if (savedBasemap === "roads" || savedBasemap === "satellite" || savedBasemap === "dark") {
      basemapMode = savedBasemap;
    }
  } catch (eBasemap) {}
  try {
    savedOp = localStorage.getItem(OPACITY_KEY);
    if (savedOp != null && cloudOpacityEl) {
      opN = Number(savedOp);
      if (isFinite(opN)) {
        opN = Math.max(0, Math.min(100, Math.round(opN)));
        cloudOpacityEl.value = String(opN);
        cloudOpacity = opN / 100;
      }
    }
  } catch (eOp) {}
  try {
    savedLabels = localStorage.getItem(LABELS_KEY);
    if (toggleMap && (savedLabels === "1" || savedLabels === "0")) {
      toggleMap.checked = savedLabels === "1";
    }
  } catch (eLab) {}
  try {
    savedIntl = localStorage.getItem(INTL_KEY);
    if (toggleIntl && (savedIntl === "1" || savedIntl === "0")) {
      toggleIntl.checked = savedIntl === "1";
    }
  } catch (eIntl) {}
  try {
    savedOverlay = localStorage.getItem(OVERLAY_KEY);
    if (savedOverlay === "clouds" || savedOverlay === "radar") {
      overlayMode = savedOverlay;
    } else {
      savedRadar = localStorage.getItem(RADAR_KEY);
      if (savedRadar === "1") overlayMode = "radar";
      else overlayMode = "clouds";
    }
  } catch (eRadar) {}
  windOn = false; /* opt53: default off — light boot */
  try {
    savedWind = localStorage.getItem(WIND_KEY);
    if (savedWind === "1") windOn = true;
    else if (savedWind === "0") windOn = false;
    if (toggleWind) toggleWind.checked = !!windOn;
  } catch (eWind) {}
  try {
    savedLoop = localStorage.getItem(LOOP_KEY);
    if (savedLoop === "0") playLoop = false;
    else if (savedLoop === "1") playLoop = true;
    /* absent / other → default ON */
  } catch (eLoop) {}
  try {
    savedSpeed = localStorage.getItem(SPEED_KEY);
    if (savedSpeed != null) {
      spN = Number(savedSpeed);
      if (spN === 0.5 || spN === 1 || spN === 1.5 || spN === 2 || spN === 3) {
        playSpeed = spN;
      }
    }
  } catch (eSpeed) {}
  try {
    savedRange = localStorage.getItem(RANGE_KEY);
    rN = Number(savedRange);
    if (rN === 6 || rN === 12 || rN === 24) HOURS_BACK = rN;
  } catch (eRange) {}
  try {
    savedLs = localStorage.getItem(LOOP_START_KEY);
    if (savedLs != null && savedLs !== "") {
      lsN = Number(savedLs);
      if (isFinite(lsN) && lsN >= 0 && lsN <= 1) _sunnySavedLoopStartFrac = lsN;
    }
  } catch (eLs) {}
  if (playSpeedEl) playSpeedEl.value = String(playSpeed);
  allMode = false;
  nearbyBeaches = [];
  viewGen = 0;
  moveTimer = null;
  viewAbort = null;
  resumePlay = false;
  tabHidden = false;
  LOCATE_KEY = "sunny-last-locate";
  playSizeCache = null; /* {w,h} — recompute only on real resize/orientation */
  playSizeResizeTimer = null;
  beachRegionRevalidated = Object.create(null); /* session SWR once per region */
  beachDb = null;
  beachDbPromise = null;
  beachGrid = null;
  beachManifest = null;
  beachManifestPromise = null;
  beachRegionsLoaded = Object.create(null);
  beachRegionInflight = Object.create(null);
  beachDbComplete = false;
  beachSeenIds = Object.create(null);
  beachByIdMap = Object.create(null);
  GRID_DEG = 1;
  DEFAULT_WARM_LAT = 43.65;
  DEFAULT_WARM_LON = -79.38;
  WX_BATCH = 40; /* opt14: batches of 40 keep requests from hanging */
  WX_PARALLEL = 1; /* one Open-Meteo batch at a time */
  WX_FETCH_TIMEOUT_MS = 12000;
  wxFetchAbort = null; /* aborted when search gen bumps / cancel */
  sheetSunnyMode = true;
  sheetListRows = [];
  wxSearchGen = 0;
  lastPaintKey = "";
  overlayReady = false;
  hoverThrottle = 0;
  bootCenter = [-79.38, 43.65];
  bootZoom = 3;
  try {
    rawView = localStorage.getItem(VIEW_KEY);
    if (rawView) {
      ov = JSON.parse(rawView);
      if (ov && isFinite(ov.lat) && isFinite(ov.lon) && isFinite(ov.zoom) &&
          ov.lat >= -90 && ov.lat <= 90 && ov.lon >= -180 && ov.lon <= 180 &&
          ov.zoom >= 0 && ov.zoom <= 22) {
        bootCenter = [Number(ov.lon), Number(ov.lat)];
        bootZoom = Number(ov.zoom);
      }
    }
  } catch (eViewBoot) {}
  map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      /* glyphs deferred until Labels on — see ensureOverlayLayers / setGlyphs */
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "&copy; OpenStreetMap",
          maxzoom: 19
        },
        "base-sat": {
          type: "raster",
          tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256,
          attribution: "Esri World Imagery",
          maxzoom: 19
        },
        "base-dark": {
          type: "raster",
          tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "&copy; CARTO &middot; &copy; OpenStreetMap",
          maxzoom: 20
        }
      },
      layers: [
        { id: "osm", type: "raster", source: "osm", paint: { "raster-resampling": "nearest" }, layout: { visibility: window.SunnyDataSaver.on("vector") ? "none" : "visible" } },
        { id: "base-sat", type: "raster", source: "base-sat", paint: { "raster-resampling": "nearest" }, layout: { visibility: "none" } },
        { id: "base-dark", type: "raster", source: "base-dark", paint: { "raster-resampling": "nearest" }, layout: { visibility: "none" } }
      ]
    },
    center: bootCenter,
    zoom: bootZoom,
    dragRotate: false,
    pitchWithRotate: false,
    fadeDuration: 0,
    refreshExpiredTiles: false,
    maxTileCacheSize: 80,
    attributionControl: false,
    maxPitch: 0
  });
  if (window.SunnyDataSaver.on("visible") && map.setPrefetchZoomDelta) map.setPrefetchZoomDelta(0); /* opt88 */
  window.SunnyVectorBase.start(map);
    map.on("error", (e) => {
    try {
      var msg = (e && e.error && e.error.message) ? e.error.message : "";
      var src = "";
      try {
        if (e && e.error && e.error.url) src = String(e.error.url);
        else if (e && e.sourceId) src = String(e.sourceId);
      } catch (eSrc) {}
      var blob = msg + " " + src;
      if (msg.indexOf("Could not load image") !== -1) return;
      if (msg.indexOf("Failed to fetch") !== -1) return;
      if (msg.indexOf("Not Found") !== -1) return;
      if (/\b404\b/.test(blob)) return;
      if (/gibs\.earthdata\.nasa\.gov/i.test(blob)) return;
      if (/geo\.weather\.gc\.ca/i.test(blob)) return;
      if (/AjaxError|ImageError|source.*error/i.test(blob) && /\.png|wmts|tile/i.test(blob)) return;
    } catch (eIgn) {}
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
  map.addControl(
    new maplibregl.AttributionControl({ compact: true, customAttribution: 'NASA GIBS / NOAA GOES · Open-Meteo · NOAA NEXRAD radar (IEM) · free tiles' }),
    "bottom-right"
  );
  /*
   * opt15: GOES GeoColor time — snap to GIBS 10-min step, lag wall clock so NOW
   * never asks for an unpublished slot, probe last published tile, remember
   * last-known-good from Play WMS / probe. Play WMS + static WMTS share these.
   */
  GOES_STEP_MS = FRAME_MIN * 60 * 1000;
  GOES_AVAIL_LAG_MS = 55 * 60 * 1000; /* opt40: wall−55m — 40m still 404ed unpublished slots */
  GOES_PROBE_TTL_MS = 20 * 60 * 1000;
  GOES_PROBE_BACK_STEPS = 12; /* walk back ≤2h in 10-min steps */
  goesTimeCache = null; /* { iso, t } */
  goesLastGoodIso = null;
  goesTimeProbe = null;
}
