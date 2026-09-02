/* SUNNY — MapLibre + NASA GIBS GOES GeoColor + Open-Meteo + local OSM beaches. No keys. */
(function () {
  "use strict";

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("script " + src)); };
      document.head.appendChild(s);
    });
  }

  function startSunny() {
  if (typeof maplibregl === "undefined") {
    var st = document.getElementById("status");
    if (st) st.textContent = "Map toolkit failed to load. Try a refresh.";
    return;
  }

  var BEACH_RADIUS_M = 50000;
  var BEACH_CAP = 60;
  var SUNNY_CLOUD = 20;
  var SUNNY_PICK_CAP = 12;
  var DWELL_MS = 850;
  var PLAY_MS = 450;
  var FRAME_MIN = 10;
  var HOURS_BACK = 24;
  var METEO_URL = "https://api.open-meteo.com/v1/forecast";
  var WIKI_URL = "https://en.wikipedia.org/api/rest_v1/page/summary/";
  var GEOCODE_URL = "https://api.bigdatacloud.net/data/reverse-geocode-client";

  var statusEl = document.getElementById("status");
  var btnLocate = document.getElementById("btn-locate");
  var btnAll = document.getElementById("btn-all");
  var btnSun = document.getElementById("btn-sun");
  var toggleSunny = document.getElementById("toggle-sunny");
  var sunnySheet = document.getElementById("sunny-sheet");
  var sunnySheetTitle = document.getElementById("sunny-sheet-title");
  var sunnySheetList = document.getElementById("sunny-sheet-list");
  var sunnySheetSub = document.getElementById("sunny-sheet-sub");
  var sunnySheetClose = document.getElementById("sunny-sheet-close");
  var btnPlay = document.getElementById("btn-play");
  var slider = document.getElementById("time-slider");
  var timeLabel = document.getElementById("time-label");
  var cloudOpacityEl = document.getElementById("cloud-opacity");
  var toggleMap = document.getElementById("toggle-map");
  var toggleIntl = document.getElementById("toggle-intl");

  var origin = null;
  var homeCountry = null;
  var beaches = [];
  var waitingForTap = false;
  var userMarker = null;
  var destMarker = null;
  var popup = null;
  var hoverId = null;
  var dwellTimer = null;
  var playTimer = null;
  var cloudTimes = [];
  var cloudIndex = 0;
  var hourlyCache = {};
  var currentWxCache = {};
  var CURRENT_WX_TTL_MS = 20 * 60 * 1000;
  var wikiCache = {};
  var cloudOpacity = 0.90;
  if (cloudOpacityEl) {
    var _co = Number(cloudOpacityEl.value);
    if (isFinite(_co)) cloudOpacity = Math.max(0, Math.min(1, _co / 100));
  }
  var searchingSunny = false;
  var overlayIds = ["ov-road-casing", "ov-road", "ov-road-name", "ov-place"];
  var BASEMAP_KEY = "sunny-basemap";
  var BASEMAP_IDS = ["osm", "base-sat", "base-dark"];
  var basemapMode = "roads";
  try {
    var savedBasemap = localStorage.getItem(BASEMAP_KEY);
    if (savedBasemap === "roads" || savedBasemap === "satellite" || savedBasemap === "dark") {
      basemapMode = savedBasemap;
    }
  } catch (eBasemap) {}
  var allMode = false;
  var nearbyBeaches = [];
  var viewGen = 0;
  var moveTimer = null;
  var viewAbort = null;
  var resumePlay = false;
  var tabHidden = false;
  var beachDb = null;
  var beachDbPromise = null;
  var beachGrid = null;
  var beachManifest = null;
  var beachManifestPromise = null;
  var beachRegionsLoaded = Object.create(null);
  var beachRegionInflight = Object.create(null);
  var beachDbComplete = false;
  var beachBgStarted = false;
  var beachSeenIds = Object.create(null);
  var beachByIdMap = Object.create(null);
  var GRID_DEG = 1;
  var DEFAULT_WARM_LAT = 43.65;
  var DEFAULT_WARM_LON = -79.38;
  var WX_BATCH = 60;
  var sheetSunnyMode = true;
  var sheetListRows = [];
  var wxSearchGen = 0;
  var BG_RING_KM = 1000;
  var BG_PAD_CELLS = 2;

  var lastPaintKey = "";
  var overlayReady = false;
  var hoverThrottle = 0;

  var map = new maplibregl.Map({
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
        { id: "osm", type: "raster", source: "osm", layout: { visibility: "visible" } },
        { id: "base-sat", type: "raster", source: "base-sat", layout: { visibility: "none" } },
        { id: "base-dark", type: "raster", source: "base-dark", layout: { visibility: "none" } }
      ]
    },
    center: [-79.38, 43.65],
    zoom: 3,
    dragRotate: false,
    pitchWithRotate: false,
    fadeDuration: 0,
    refreshExpiredTiles: false,
    maxTileCacheSize: 80,
    attributionControl: false,
    maxPitch: 0
  });

    map.on("error", function (e) {
    try {
      var msg = (e && e.error && e.error.message) ? e.error.message : "";
      if (msg.indexOf("Could not load image") !== -1) return;
    } catch (eIgn) {}
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.addControl(
    new maplibregl.AttributionControl({ compact: true, customAttribution: "NASA GIBS / NOAA GOES · Open-Meteo · free tiles" }),
    "bottom-left"
  );

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

  function toGoesIso(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) +
      "T" + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":00Z";
  }

  function buildCloudTimes() {
    var lagMs = 50 * 60 * 1000;
    var latest = Math.floor((Date.now() - lagMs) / (FRAME_MIN * 60 * 1000)) * (FRAME_MIN * 60 * 1000);
    var start = latest - HOURS_BACK * 3600 * 1000;
    var out = [];
    var t;
    for (t = start; t <= latest; t += FRAME_MIN * 60 * 1000) out.push(toGoesIso(t));
    return out;
  }

  function goesLayer(lon) {
    if (lon <= -105) return "GOES-West_ABI_GeoColor";
    return "GOES-East_ABI_GeoColor";
  }

  function gibsTiles(iso, lon) {
    var layer = goesLayer(lon == null ? -79 : lon);
    return "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/" + layer +
      "/default/" + iso + "/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png";
  }

  function utcDate(offsetDays) {
    var d = new Date(Date.now() - (offsetDays || 0) * 86400000);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }

  function modisTiles(date) {
    return "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/" +
      date + "/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg";
  }

  function viirsTiles(date) {
    return "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/" +
      date + "/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg";
  }

  function iemVisTiles(lon) {
    var layer = (lon != null && lon <= -105) ? "goes-west-vis-1km" : "goes-east-vis-1km";
    return "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/" + layer + "/{z}/{x}/{y}.png";
  }

  function formatFrameLabel(iso) {
    var d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function sliderMax() {
    return Math.max(0, cloudTimes.length - 1);
  }

  function clampIndex(i) {
    var n = Number(i);
    if (!isFinite(n)) n = 0;
    return Math.max(0, Math.min(Math.floor(n), sliderMax()));
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
    return rows.filter(function (row) {
      var c = (row && (row.country || beachCountryCode(row))) || null;
      return c === code;
    });
  }

/* === BEGIN CLOUD STATIC + PLAY IMAGE OVERLAY (opt6/7 + opt8 smooth) === */
  /*
   * opt6: Abandon MapLibre tile animation for Play (opt5 double-buffer flickered
   * because clearTiles / source rebuild blanked the visible buffer).
   * - Static / scrub: single GIBS WMTS raster on #cloud-map. setTiles WITHOUT
   *   clearTiles (brief stale tiles OK). remove+add only when host/layer changes.
   * - Play: hide MapLibre cloud layers; drive #cloud-play-layer (two <img>s) from
   *   NASA GIBS WMS GetMap, mix-blend-mode:screen, double-buffer crossfade.
   *   Never clear to empty — hold previous image until next onload.
   */
  var CLOUD_FADE_MS = 520; /* rAF crossfade ~450–600ms */
  var PLAY_DWELL_MS = 250; /* min dwell after reveal when next is cached */
  var FRAME_LOAD_STUCK_MS = 1500; /* hide "Loading frame…" unless stuck >1.5s */
  var FRAME_PLAY_STEP = 1; /* 10-minute satellite steps while playing */
  var PLAY_PREFETCH = 5; /* prefetch 4–6 frames ahead */
  var PLAY_MOVE_DEBOUNCE_MS = 300;
  var PLAY_LRU_CAP = 24;
  var WMS_MAX_SIDE_PHONE = 960;
  var WMS_MAX_SIDE_DESKTOP = 1280;
  var GIBS_SRC = "gibs";
  var GIBS_LAYER = "gibs";

  var cloudMap = null;
  var lastGibsUrl = null;
  var lastGibsHostLayer = "";
  var cloudSourcesReady = false;
  var playSession = 0;
  var playBusy = false;
  var playMode = false;
  var playFrontBuf = "a";
  var playImgCache = Object.create(null); /* LRU: key -> {ok,url,img,key} */
  var playLruOrder = []; /* oldest → newest keys */
  var playLoadPending = Object.create(null);
  var playLoadGen = 0;
  var playFadeRaf = 0;
  var playMoveTimer = null;
  var playCorsOk = null; /* null=untested, true/false */
  var playUseOpenMeteo = false;
  var loadingFrameHint = false;
  var frameWaitStarted = 0;

  function cloudTargetMap() {
    return cloudMap || map;
  }

  function isPlaying() {
    return playMode || !!(btnPlay && btnPlay.getAttribute("aria-pressed") === "true");
  }

  function ensureCloudMap() {
    if (cloudMap) return cloudMap;
    var el = document.getElementById("cloud-map");
    if (!el || typeof maplibregl === "undefined") return null;
    try {
      var canvasBox = map.getCanvasContainer && map.getCanvasContainer();
      if (canvasBox && el.parentNode !== canvasBox) {
        canvasBox.appendChild(el);
        el.style.position = "absolute";
        el.style.inset = "0";
        el.style.width = "100%";
        el.style.height = "100%";
      }
    } catch (ePar) {}
    cloudMap = new maplibregl.Map({
      container: "cloud-map",
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "cloud-bg",
            type: "background",
            paint: { "background-color": "#000000", "background-opacity": 1 }
          }
        ]
      },
      center: map.getCenter(),
      zoom: map.getZoom(),
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      refreshExpiredTiles: false,
      maxTileCacheSize: 64,
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      preserveDrawingBuffer: false
    });
    cloudMap.on("load", function () {
      cloudSourcesReady = true;
      syncCloudMap(true);
      try { cloudMap.resize(); } catch (eRz) {}
    });
    ensurePlayLayer();
    return cloudMap;
  }

  function syncCloudMap(force) {
    if (!cloudMap || !map) return;
    /* opt8 E: during Play skip continuous sync; only debounced moveend passes force */
    if (playMode && !force) return;
    try {
      var c = map.getCenter();
      var z = map.getZoom();
      var b = map.getBearing();
      var p = map.getPitch();
      cloudMap.jumpTo({ center: c, zoom: z, bearing: b, pitch: p });
    } catch (eSync) {}
  }

  function cloudRasterPaint(opacity) {
    return {
      "raster-opacity": opacity == null ? 0 : opacity,
      "raster-resampling": "linear",
      "raster-fade-duration": 0
    };
  }

  function applyCloudPaint(layerId, opacity) {
    var m = cloudTargetMap();
    if (!m || !m.getLayer(layerId)) return;
    var paint = cloudRasterPaint(opacity);
    var key;
    for (key in paint) {
      if (Object.prototype.hasOwnProperty.call(paint, key)) {
        m.setPaintProperty(layerId, key, paint[key]);
      }
    }
  }

  function gibsEffectiveOpacity() {
    /* Full opacity for solid mode; slight boost still OK for screen mode. */
    if (cloudOpacity >= 0.82) return Math.min(1, cloudOpacity);
    var op = Math.min(1, cloudOpacity * 1.05);
    return Math.max(0, Math.min(1, op));
  }

  function applyCloudSolidMode() {
    /* screen blend can never fully obscure the basemap; at high opacity use normal */
    var solid = cloudOpacity >= 0.82;
    var cm = document.getElementById("cloud-map");
    var pl = document.getElementById("cloud-play-layer");
    if (cm) {
      if (solid) cm.classList.add("clouds-solid");
      else cm.classList.remove("clouds-solid");
    }
    if (pl) {
      if (solid) pl.classList.add("clouds-solid");
      else pl.classList.remove("clouds-solid");
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
    /* opt8 D: adaptive WMS max side — phone/narrow 960, desktop 1280; respect DPR */
    var el = map && map.getContainer ? map.getContainer() : document.getElementById("map");
    var cw = (el && el.clientWidth) || window.innerWidth || 800;
    var dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    var narrow = cw < 700 || (typeof window.matchMedia === "function" && window.matchMedia("(max-width:700px)").matches);
    var phone = narrow || (typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || ""));
    var cap = phone ? WMS_MAX_SIDE_PHONE : WMS_MAX_SIDE_DESKTOP;
    if (dpr >= 2.5 && phone) cap = Math.min(cap, 960);
    else if (dpr >= 2 && !phone) cap = Math.min(cap, WMS_MAX_SIDE_DESKTOP);
    return cap;
  }

  function playImageSize() {
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

  function roundPlayBbox(box) {
    /* Stable LRU / URL key — ~100m web-mercator grid */
    function r(v) { return Math.round(v / 100) * 100; }
    return { minx: r(box.minx), miny: r(box.miny), maxx: r(box.maxx), maxy: r(box.maxy) };
  }

  function playFrameKey(iso, box, sz) {
    return String(iso) + "|" + box.minx + "," + box.miny + "," + box.maxx + "," + box.maxy + "|" + sz.w + "x" + sz.h;
  }

  function playLruTouch(key) {
    var i = playLruOrder.indexOf(key);
    if (i >= 0) playLruOrder.splice(i, 1);
    playLruOrder.push(key);
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
      var old = playLruOrder.shift();
      if (old && playImgCache[old]) delete playImgCache[old];
    }
    playImgCache[key] = rec;
    playLruOrder.push(key);
  }

  function playLruClear() {
    playImgCache = Object.create(null);
    playLruOrder = [];
    playLoadPending = Object.create(null);
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

  function ensurePlayLayer() {
    var layer = document.getElementById("cloud-play-layer");
    if (!layer) return null;
    try {
      var canvasBox = map.getCanvasContainer && map.getCanvasContainer();
      if (canvasBox && layer.parentNode !== canvasBox) {
        canvasBox.appendChild(layer);
        layer.style.position = "absolute";
        layer.style.inset = "0";
        layer.style.width = "100%";
        layer.style.height = "100%";
      }
    } catch (ePl) {}
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
    var m = cloudTargetMap();
    var el = document.getElementById("cloud-map");
    if (el) {
      if (hidden) el.classList.add("is-play-hidden");
      else el.classList.remove("is-play-hidden");
    }
    if (!m) return;
    if (m.getLayer(GIBS_LAYER)) {
      try {
        m.setLayoutProperty(GIBS_LAYER, "visibility", hidden ? "none" : "visible");
      } catch (eV) {}
      if (!hidden) applyCloudPaint(GIBS_LAYER, gibsEffectiveOpacity());
      else applyCloudPaint(GIBS_LAYER, 0);
    }
  }

  function showPlayOverlay() {
    var layer = ensurePlayLayer();
    if (!layer) return;
    layer.hidden = false;
    layer.classList.add("is-active");
    layer.setAttribute("aria-hidden", "false");
    setPlayLayerOpacity();
  }

  function hidePlayOverlay() {
    var layer = document.getElementById("cloud-play-layer");
    if (!layer) return;
    layer.classList.remove("is-active");
    layer.hidden = true;
    layer.setAttribute("aria-hidden", "true");
    var imgs = layer.querySelectorAll("img");
    var i;
    for (i = 0; i < imgs.length; i++) {
      imgs[i].classList.remove("is-front");
      /* keep src so we do not flash empty if re-entered; do not clear */
    }
  }

  function showLoadingFrameHint(show) {
    if (show && !loadingFrameHint) {
      loadingFrameHint = true;
      setStatus("Loading frame…");
    } else if (!show && loadingFrameHint) {
      loadingFrameHint = false;
    }
  }

  function addGibsStatic(url) {
    var m = cloudTargetMap();
    if (!m) return;
    if (!m.getSource(GIBS_SRC)) {
      m.addSource(GIBS_SRC, {
        type: "raster",
        tiles: [url],
        tileSize: 256,
        maxzoom: 7,
        attribution: "NASA GIBS / NOAA GOES"
      });
    }
    if (!m.getLayer(GIBS_LAYER)) {
      m.addLayer({
        id: GIBS_LAYER,
        type: "raster",
        source: GIBS_SRC,
        paint: cloudRasterPaint(gibsEffectiveOpacity())
      });
    } else {
      applyCloudPaint(GIBS_LAYER, gibsEffectiveOpacity());
    }
    lastGibsUrl = url;
    lastGibsHostLayer = gibsHostLayerKey(url);
    cloudSourcesReady = true;
  }

  function rebuildStaticGibs(url) {
    var m = cloudTargetMap();
    if (!m) return;
    if (m.getLayer(GIBS_LAYER)) m.removeLayer(GIBS_LAYER);
    if (m.getSource(GIBS_SRC)) m.removeSource(GIBS_SRC);
    m.addSource(GIBS_SRC, {
      type: "raster",
      tiles: [url],
      tileSize: 256,
      maxzoom: 7,
      attribution: "NASA GIBS / NOAA GOES"
    });
    m.addLayer({
      id: GIBS_LAYER,
      type: "raster",
      source: GIBS_SRC,
      paint: cloudRasterPaint(gibsEffectiveOpacity())
    });
    lastGibsUrl = url;
    lastGibsHostLayer = gibsHostLayerKey(url);
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

  function presentStaticGibs(url) {
    var m = cloudTargetMap();
    if (!m || tabHidden) return Promise.resolve(false);
    if (!cloudSourcesReady || !m.getSource(GIBS_SRC)) {
      addGibsStatic(url);
      return Promise.resolve(true);
    }
    if (url === lastGibsUrl) {
      applyCloudPaint(GIBS_LAYER, gibsEffectiveOpacity());
      return Promise.resolve(true);
    }
    setStaticGibsTiles(url);
    return Promise.resolve(true);
  }

  function testWmsCors() {
    if (playCorsOk != null) return Promise.resolve(playCorsOk);
    return new Promise(function (resolve) {
      var iso = cloudTimes.length ? cloudTimes[cloudTimes.length - 1] : toGoesIso(Date.now());
      var url = gibsWmsUrl(iso, origin ? origin.lon : -79);
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
      img.onload = function () { finish(true); };
      img.onerror = function () {
        /* Retry once with crossOrigin=anonymous (some CDNs differ) */
        var img2 = new Image();
        img2.onload = function () { finish(true); };
        img2.onerror = function () { finish(false, "onerror"); };
        try { img2.crossOrigin = "anonymous"; } catch (eC) {}
        img2.src = url + "&_corsprobe2=" + Date.now();
      };
      img.src = url + "&_corsprobe=" + Date.now();
      setTimeout(function () {
        if (!done) finish(!!(img.naturalWidth > 0), "timeout");
      }, 8000);
    });
  }

  function loadImageSrc(url, preferCors, cacheKey) {
    var key = cacheKey || url;
    var hit = playLruGet(key);
    if (hit) return Promise.resolve(hit);
    if (playLoadPending[key]) return playLoadPending[key];
    var p = new Promise(function (resolve) {
      var img = new Image();
      var settled = false;
      function finish(ok) {
        if (settled) return;
        settled = true;
        delete playLoadPending[key];
        var rec = { ok: !!ok, url: url, img: img, key: key };
        if (ok) playLruSet(key, rec);
        resolve(rec);
      }
      img.onload = function () { finish(true); };
      img.onerror = function () { finish(false); };
      /* Prefer plain load for <img> display; crossOrigin only if caller asks (canvas). */
      if (preferCors) {
        try { img.crossOrigin = "anonymous"; } catch (e1) {}
      }
      img.src = url;
      setTimeout(function () {
        if (!settled) finish(img.naturalWidth > 0);
      }, 15000);
    });
    playLoadPending[key] = p;
    return p;
  }

  function cancelPlayFade() {
    if (playFadeRaf) {
      try { cancelAnimationFrame(playFadeRaf); } catch (eC) {}
      playFadeRaf = 0;
    }
  }

  function rafCrossfade(back, front, gen, resolve) {
    var targetOp = gibsEffectiveOpacity();
    var start = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    var dur = CLOUD_FADE_MS;
    back.style.opacity = "0";
    back.classList.add("is-front");
    function easeInOut(t) {
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }
    function step(now) {
      playFadeRaf = 0;
      if (gen !== playLoadGen) {
        resolve(false);
        return;
      }
      var t = Math.min(1, (now - start) / dur);
      var e = easeInOut(t);
      back.style.opacity = String(targetOp * e);
      if (front) front.style.opacity = String(targetOp * (1 - e));
      if (t < 1) {
        playFadeRaf = requestAnimationFrame(step);
      } else {
        back.style.opacity = String(targetOp);
        if (front) {
          front.style.opacity = "0";
          front.classList.remove("is-front");
        }
        resolve(true);
      }
    }
    playFadeRaf = requestAnimationFrame(step);
  }

  function crossfadePlayImage(url, cacheKey) {
    return new Promise(function (resolve) {
      var backId = playFrontBuf === "a" ? "b" : "a";
      var back = playBufEl(backId);
      var front = playBufEl(playFrontBuf);
      if (!back) {
        resolve(false);
        return;
      }
      var gen = ++playLoadGen;
      cancelPlayFade();
      frameWaitStarted = Date.now();
      var stuckTimer = setTimeout(function () {
        if (gen === playLoadGen) showLoadingFrameHint(true);
      }, FRAME_LOAD_STUCK_MS);

      function reveal() {
        clearTimeout(stuckTimer);
        showLoadingFrameHint(false);
        if (gen !== playLoadGen) {
          resolve(false);
          return;
        }
        if (!back.naturalWidth) {
          /* HOLD previous — never clear to empty */
          resolve(false);
          return;
        }
        setPlayLayerOpacity();
        /* Mark back as incoming front; rAF lerps opacity (no CSS flash) */
        rafCrossfade(back, front, gen, function (ok) {
          if (ok) playFrontBuf = backId;
          resolve(ok);
        });
      }

      loadImageSrc(url, false, cacheKey).then(function (rec) {
        if (gen !== playLoadGen) {
          clearTimeout(stuckTimer);
          resolve(false);
          return;
        }
        if (!rec || !rec.ok) {
          clearTimeout(stuckTimer);
          showLoadingFrameHint(false);
          /* HOLD previous — never clear */
          resolve(false);
          return;
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
        back.onerror = function () {
          if (settled) return;
          settled = true;
          back.onload = null;
          back.onerror = null;
          clearTimeout(stuckTimer);
          showLoadingFrameHint(false);
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

  function prefetchPlayIndices(fromIndex) {
    if (!cloudTimes.length || playUseOpenMeteo) return;
    var lon = origin ? origin.lon : null;
    var n;
    for (n = 1; n <= PLAY_PREFETCH; n++) {
      var idx = fromIndex + n * FRAME_PLAY_STEP;
      if (idx > sliderMax()) idx = sliderMax();
      if (idx === fromIndex) continue;
      var iso = cloudTimes[idx];
      var meta = gibsWmsFrameMeta(iso, lon);
      if (!playImgCache[meta.key] && !playLoadPending[meta.key]) {
        loadImageSrc(meta.url, false, meta.key);
      }
    }
  }

  /* --- Open-Meteo fallback heatmap (only if WMS Image CORS fails) --- */
  var omPlayGrid = null;
  var omPlayPromise = null;

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
    omPlayPromise = fetch(url).then(function (res) {
      if (!res.ok) throw new Error("om " + res.status);
      return res.json();
    }).then(function (data) {
      /* normalize to array-of-series */
      var series = Array.isArray(data) ? data : [data];
      omPlayGrid = { cols: cols, rows: rows, lats: lats, lons: lons, series: series, sampleStep: 2 };
      return omPlayGrid;
    }).catch(function () {
      omPlayPromise = null;
      return null;
    });
    return omPlayPromise;
  }

  function paintOpenMeteoFrame(iso) {
    return fetchOpenMeteoCloudGrid().then(function (grid) {
      if (!grid) return false;
      var canvas = document.createElement("canvas");
      var sz = playImageSize();
      canvas.width = sz.w;
      canvas.height = sz.h;
      var ctx = canvas.getContext("2d");
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
    setMapLibreCloudsHidden(true);
    if (playUseOpenMeteo) {
      return paintOpenMeteoFrame(iso);
    }
    var meta = gibsWmsFrameMeta(iso, origin ? origin.lon : null);
    return crossfadePlayImage(meta.url, meta.key).then(function (ok) {
      if (!ok && playCorsOk === false) {
        playUseOpenMeteo = true;
        return paintOpenMeteoFrame(iso);
      }
      return ok;
    });
  }

  function enterPlayMode() {
    playMode = true;
    omPlayGrid = null;
    omPlayPromise = null;
    ensurePlayLayer();
    showPlayOverlay();
    setMapLibreCloudsHidden(true);
    setPlayLayerOpacity();
    /* opt8 E: pause cloud MapLibre render loop during Play */
    if (cloudMap && typeof cloudMap.stop === "function") {
      try { cloudMap.stop(); } catch (eStop) {}
    }
  }

  function exitPlayMode() {
    playMode = false;
    playLoadGen += 1;
    cancelPlayFade();
    if (playMoveTimer) { clearTimeout(playMoveTimer); playMoveTimer = null; }
    hidePlayOverlay();
    setMapLibreCloudsHidden(false);
    /* opt8 E: resume cloud map paint after Play */
    if (cloudMap) {
      try {
        if (typeof cloudMap.resize === "function") cloudMap.resize();
        if (typeof cloudMap.triggerRepaint === "function") cloudMap.triggerRepaint();
      } catch (eRes) {}
      syncCloudMap(true);
    }
    /* restore MapLibre to current slider time WITHOUT clearTiles flicker */
    if (cloudTimes.length) {
      var url = gibsTiles(cloudTimes[cloudIndex], origin ? origin.lon : null);
      presentStaticGibs(url);
    }
  }

  function onPlayViewChanged() {
    if (!playMode || tabHidden) return;
    /* keep last image visible; debounce bbox reload */
    if (playMoveTimer) clearTimeout(playMoveTimer);
    playMoveTimer = setTimeout(function () {
      playMoveTimer = null;
      if (!playMode) return;
      /* opt8 E: one sync at debounced moveend only */
      syncCloudMap(true);
      /* purge LRU — bbox changed; keep last image visible until new loads */
      playLruClear();
      omPlayGrid = null;
      omPlayPromise = null;
      if (cloudTimes.length) {
        var iso = cloudTimes[cloudIndex];
        presentPlayFrame(iso).then(function () {
          prefetchPlayIndices(cloudIndex);
        });
      }
    }, PLAY_MOVE_DEBOUNCE_MS);
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
    cloudIndex = clampIndex(i);
    slider.min = "0";
    slider.max = String(sliderMax());
    slider.value = String(cloudIndex);
    var iso = cloudTimes[cloudIndex];
    var atNow = cloudIndex >= sliderMax();
    var suffix = atNow ? " · NOW" : "";
    timeLabel.textContent = formatFrameLabel(iso) + suffix;
    if (tabHidden) return Promise.resolve();

    var p;
    if (playMode) {
      p = presentPlayFrame(iso).then(function (shown) {
        if (shown) prefetchPlayIndices(cloudIndex);
        return shown;
      });
    } else {
      var url = gibsTiles(iso, origin ? origin.lon : null);
      p = presentStaticGibs(url);
    }

    return p.then(function (shown) {
      void shown;
      if (playMode) return shown;
      /* Hires (MODIS/VIIRS/IEM) only at NOW — not while scrubbing history / play */
      if (atNow) {
        var day = utcDate(0);
        function refreshRaster(srcId, url) {
          var src = map.getSource(srcId);
          if (src && typeof src.setTiles === "function") {
            try {
              var cur = src.tiles && src.tiles[0];
              if (cur !== url) src.setTiles([url]);
            } catch (eRef) {
              src.setTiles([url]);
            }
          }
        }
        refreshRaster("modis", modisTiles(day));
        refreshRaster("viirs", viirsTiles(day));
        refreshRaster("iem-vis", iemVisTiles(origin ? origin.lon : null));
        applyHires();
      } else {
        ["modis", "viirs", "iem-vis"].forEach(function (id) {
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
    if (!map.getLayer(layerId)) return;
    var paint = {
      "raster-opacity": opacity,
      "raster-resampling": "linear",
      "raster-fade-duration": 0
    };
    var key;
    for (key in paint) {
      if (Object.prototype.hasOwnProperty.call(paint, key)) {
        map.setPaintProperty(layerId, key, paint[key]);
      }
    }
  }

  function applyHires() {
    if (tabHidden || playMode) return;
    var z = map.getZoom();
    var atNow = !cloudTimes.length || cloudIndex >= sliderMax();
    /* Hires overlays only at NOW (not scrubbing / play). GOES GeoColor stays base. */
    var wantSharp = atNow && z >= 5.6;
    if (wantSharp) {
      addHiresSources();
      var sharp = Math.min(0.94, cloudOpacity);
      if (map.getLayer("modis")) {
        map.setLayoutProperty("modis", "visibility", "visible");
        applyCloudPaintMain("modis", sharp * 0.55);
      }
      if (map.getLayer("viirs")) {
        map.setLayoutProperty("viirs", "visibility", "visible");
        applyCloudPaintMain("viirs", sharp * 0.4);
      }
      if (map.getLayer("iem-vis")) {
        var vis = z >= 6.5 ? (0.45 * cloudOpacity) : 0;
        map.setLayoutProperty("iem-vis", "visibility", vis > 0 ? "visible" : "none");
        applyCloudPaintMain("iem-vis", vis);
      }
    } else {
      ["modis", "viirs", "iem-vis"].forEach(function (id) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, "visibility", "none");
          applyCloudPaintMain(id, 0);
        }
      });
    }
    /* Single GIBS layer — never collapse opacity to blank */
    applyCloudPaint(GIBS_LAYER, gibsEffectiveOpacity());
  }

  function basemapLayerId(mode) {
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
  }

  function applyCloudOpacity() {
    applyCloudSolidMode();
    if (playMode) setPlayLayerOpacity();
    applyHires();
    if (typeof applyBaseMap === "function") applyBaseMap();
  }

  function addHiresSources() {
    if (tabHidden) return;
    var before = map.getLayer("beaches-fill") ? "beaches-fill" : undefined;
    if (!map.getSource("modis")) {
      map.addSource("modis", {
        type: "raster",
        tiles: [modisTiles(utcDate(0))],
        tileSize: 256,
        maxzoom: 9,
        attribution: "NASA GIBS / MODIS"
      });
    }
    if (!map.getSource("viirs")) {
      map.addSource("viirs", {
        type: "raster",
        tiles: [viirsTiles(utcDate(0))],
        tileSize: 256,
        maxzoom: 9,
        attribution: "NASA GIBS / VIIRS SNPP"
      });
    }
    if (!map.getSource("iem-vis")) {
      map.addSource("iem-vis", {
        type: "raster",
        tiles: [iemVisTiles(origin ? origin.lon : -79)],
        tileSize: 256,
        maxzoom: 9,
        attribution: "Iowa Environmental Mesonet / NOAA GOES"
      });
    }
    if (!map.getLayer("modis")) {
      map.addLayer({
        id: "modis",
        type: "raster",
        source: "modis",
        paint: {
          "raster-opacity": 0,
          "raster-resampling": "linear",
          "raster-fade-duration": 0
        }
      }, before);
    }
    if (!map.getLayer("viirs")) {
      map.addLayer({
        id: "viirs",
        type: "raster",
        source: "viirs",
        paint: {
          "raster-opacity": 0,
          "raster-resampling": "linear",
          "raster-fade-duration": 0
        }
      }, before);
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
  }

  /* legacy aliases */
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
    if (!overlayVisible()) {
      applyOverlay();
      return;
    }
    ensureOverlayLayers();
    overlayReady = true;
    var before = map.getLayer("beaches-fill") ? "beaches-fill" : undefined;
    overlayIds.forEach(function (id) {
      if (map.getLayer(id)) map.moveLayer(id, before);
    });
    applyOverlay();
  }

  function applyOverlay() {
    var vis = overlayVisible() ? "visible" : "none";
    overlayIds.forEach(function (id) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
    });
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
    if (map.getLayer("ov-road-casing")) return;
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
        "text-optional": true
      },
      paint: {
        "text-color": "#fff",
        "text-halo-color": "rgba(8,10,14,0.92)",
        "text-halo-width": 1.5,
        "text-halo-blur": 0.3
      }
    }, before);
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
    if (!origin) return;
    if (!userMarker) {
      var el = document.createElement("div");
      el.className = "user-dot";
      userMarker = new maplibregl.Marker({ element: el }).setLngLat([origin.lon, origin.lat]).addTo(map);
    } else {
      userMarker.setLngLat([origin.lon, origin.lat]);
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

  function parseBeachDb(data) {
    var rows = [];
    if (data && Array.isArray(data.beaches)) rows = data.beaches;
    else if (Array.isArray(data)) rows = data;
    else throw new Error("beach list");
    var out = new Array(rows.length);
    var n = 0;
    var i, r, lat, lon, name, country, id;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      if (!r) continue;
      if (Array.isArray(r)) {
        /* compact row [id,name,lat,lon,country] — read in place, one object */
        id = r[0] != null ? String(r[0]) : ("b/" + i);
        name = r[1] == null ? "" : String(r[1]).trim();
        lat = Number(r[2]);
        lon = Number(r[3]);
        country = r[4] == null || r[4] === "" ? null : String(r[4]).toUpperCase().slice(0, 2);
      } else if (r.id != null && r.lat != null && r.lon != null && !r.geom) {
        /* already a compact object from a prior merge — reuse */
        if (beachSeenIds[String(r.id)]) continue;
        if (!isFinite(Number(r.lat)) || !isFinite(Number(r.lon))) continue;
        out[n++] = r;
        continue;
      } else {
        id = r.id != null ? String(r.id) : ("b/" + i);
        name = r.name == null ? "" : String(r.name).trim();
        lat = Number(r.lat);
        lon = Number(r.lon);
        country = r.country == null || r.country === "" ? null : String(r.country).toUpperCase().slice(0, 2);
      }
      if (!isFinite(lat) || !isFinite(lon)) continue;
      if (!name) name = "Unnamed beach";
      if (country && country.length !== 2) country = null;
      out[n++] = { id: id, name: name, lat: lat, lon: lon, country: country };
    }
    out.length = n;
    return out;
  }

  function buildBeachGrid(db) {
    beachGrid = Object.create(null);
    var i, row, key;
    for (i = 0; i < db.length; i++) {
      row = db[i];
      key = Math.floor(row.lat / GRID_DEG) * GRID_DEG + "," + Math.floor(row.lon / GRID_DEG) * GRID_DEG;
      if (!beachGrid[key]) beachGrid[key] = [];
      beachGrid[key].push(row);
    }
  }

  function forEachGridKey(south, north, west, east, fn) {
    var pad = GRID_DEG;
    var lat0 = Math.floor((south - pad) / GRID_DEG) * GRID_DEG;
    var lat1 = Math.floor((north + pad) / GRID_DEG) * GRID_DEG;
    if (lat0 < -90) lat0 = Math.floor(-90 / GRID_DEG) * GRID_DEG;
    if (lat1 > 90) lat1 = Math.floor(90 / GRID_DEG) * GRID_DEG;
    var w = west - pad;
    var e = east + pad;
    var lonSpans = [];
    if (e - w >= 360) {
      lonSpans.push([-180, 180]);
    } else {
      while (w < -180 && e < -180) { w += 360; e += 360; }
      while (w > 180 && e > 180) { w -= 360; e -= 360; }
      if (w < -180) {
        lonSpans.push([w + 360, 180]);
        lonSpans.push([-180, e]);
      } else if (e > 180) {
        lonSpans.push([w, 180]);
        lonSpans.push([-180, e - 360]);
      } else if (e < w) {
        lonSpans.push([w, 180]);
        lonSpans.push([-180, e]);
      } else {
        lonSpans.push([w, e]);
      }
    }
    var lat, lon, s, lon0, lon1;
    for (lat = lat0; lat <= lat1; lat += GRID_DEG) {
      for (s = 0; s < lonSpans.length; s++) {
        lon0 = Math.floor(lonSpans[s][0] / GRID_DEG) * GRID_DEG;
        lon1 = Math.floor(lonSpans[s][1] / GRID_DEG) * GRID_DEG;
        for (lon = lon0; lon <= lon1; lon += GRID_DEG) {
          fn(lat + "," + lon);
        }
      }
    }
  }

  function rowsFromGrid(south, north, west, east) {
    if (!beachGrid) return beachDb || [];
    var out = [];
    var seen = Object.create(null);
    forEachGridKey(south, north, west, east, function (key) {
      var cell = beachGrid[key];
      if (!cell) return;
      var i, row;
      for (i = 0; i < cell.length; i++) {
        row = cell[i];
        if (seen[row.id]) continue;
        seen[row.id] = 1;
        out.push(row);
      }
    });
    return out;
  }

  function fetchJsonGzip(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("beach list");
      if (typeof DecompressionStream === "undefined") throw new Error("no decompress");
      return new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).json();
    });
  }

  function fetchJsonMaybeGzip(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("beach list");
      var enc = (res.headers.get("Content-Encoding") || "").toLowerCase();
      var wantGunzip = /\.gz$/i.test(url) && enc.indexOf("gzip") === -1 && enc.indexOf("br") === -1;
      if (!wantGunzip) return res.json();
      if (typeof DecompressionStream === "undefined") throw new Error("no decompress");
      return res.arrayBuffer().then(function (buf) {
        var u8 = new Uint8Array(buf);
        // gzip magic 1f 8b — if missing, body was already inflated by the host
        if (u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b) {
          var stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
          return new Response(stream).json();
        }
        return JSON.parse(new TextDecoder().decode(u8));
      });
    });
  }

  var BEACH_DB_IDB = "sunny";
  var BEACH_DB_STORE = "beachdb";
  var BEACH_DB_VER = "region1-bin1-idb3";

  function idbOpenBeach() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === "undefined") {
        reject(new Error("no idb"));
        return;
      }
      var req = indexedDB.open(BEACH_DB_IDB, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(BEACH_DB_STORE)) {
          db.createObjectStore(BEACH_DB_STORE);
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error("idb")); };
    });
  }

  function idbRegionKey(id) {
    return "region:" + id;
  }

  function idbGetVer() {
    return idbOpenBeach().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(BEACH_DB_STORE, "readonly");
        var store = tx.objectStore(BEACH_DB_STORE);
        var verReq = store.get("v");
        verReq.onsuccess = function () {
          resolve(verReq.result === BEACH_DB_VER ? BEACH_DB_VER : null);
        };
        verReq.onerror = function () { reject(verReq.error || new Error("idb")); };
      });
    });
  }

  function idbGetRegionRows(regionId) {
    return idbOpenBeach().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(BEACH_DB_STORE, "readonly");
        var store = tx.objectStore(BEACH_DB_STORE);
        var verReq = store.get("v");
        verReq.onsuccess = function () {
          if (verReq.result !== BEACH_DB_VER) {
            resolve(null);
            return;
          }
          var rowReq = store.get(idbRegionKey(regionId));
          rowReq.onsuccess = function () {
            var val = rowReq.result;
            resolve(val && Array.isArray(val) ? val : null);
          };
          rowReq.onerror = function () { reject(rowReq.error || new Error("idb")); };
        };
        verReq.onerror = function () { reject(verReq.error || new Error("idb")); };
      });
    });
  }

  function idbPutRegionRows(regionId, rows) {
    return idbOpenBeach().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(BEACH_DB_STORE, "readwrite");
        var store = tx.objectStore(BEACH_DB_STORE);
        store.put(BEACH_DB_VER, "v");
        store.put(rows, idbRegionKey(regionId));
        try {
          var loadedReq = store.get("loaded");
          loadedReq.onsuccess = function () {
            var idx = loadedReq.result;
            if (!idx || typeof idx !== "object") idx = {};
            idx[regionId] = 1;
            store.put(idx, "loaded");
          };
        } catch (eLoaded) {}
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error("idb")); };
        tx.onabort = function () { reject(tx.error || new Error("idb")); };
      });
    });
  }

  function idbPutBeachRowsLegacy(rows) {
    /* legacy full-blob write kept only for non-region fallbacks; prefer per-region */
    return idbOpenBeach().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(BEACH_DB_STORE, "readwrite");
        var store = tx.objectStore(BEACH_DB_STORE);
        store.put(BEACH_DB_VER, "v");
        store.put(rows, "rows");
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error("idb")); };
        tx.onabort = function () { reject(tx.error || new Error("idb")); };
      });
    });
  }

  function toCompactRows(parsed) {
    var out = [];
    var i, r;
    for (i = 0; i < parsed.length; i++) {
      r = parsed[i];
      out.push([r.id, r.name, r.lat, r.lon, r.country == null ? "" : r.country]);
    }
    return out;
  }

  function appendBeachGrid(rows) {
    if (!beachGrid) beachGrid = Object.create(null);
    var i, row, key;
    for (i = 0; i < rows.length; i++) {
      row = rows[i];
      key = Math.floor(row.lat / GRID_DEG) * GRID_DEG + "," + Math.floor(row.lon / GRID_DEG) * GRID_DEG;
      if (!beachGrid[key]) beachGrid[key] = [];
      beachGrid[key].push(row);
    }
  }

  function mergeBeachRows(rawRows) {
    var parsed = parseBeachDb(rawRows);
    if (!beachDb) beachDb = [];
    var added = [];
    var i, row;
    for (i = 0; i < parsed.length; i++) {
      row = parsed[i];
      if (beachSeenIds[row.id]) continue;
      beachSeenIds[row.id] = 1;
      beachDb.push(row);
      beachByIdMap[row.id] = row;
      added.push(row);
    }
    if (added.length) appendBeachGrid(added);
    return beachDb;
  }

  function noteBeachObjects(list) {
    var i, b;
    for (i = 0; i < (list || []).length; i++) {
      b = list[i];
      if (b && b.id != null) beachByIdMap[String(b.id)] = b;
    }
  }

  function yieldMain() {
    return new Promise(function (resolve) {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(function () { resolve(); }, { timeout: 80 });
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  function markAllRegionsLoaded() {
    if (!beachManifest || !beachManifest.regions) {
      beachDbComplete = true;
      return;
    }
    var i, r;
    for (i = 0; i < beachManifest.regions.length; i++) {
      r = beachManifest.regions[i];
      if (r && r.id) beachRegionsLoaded[r.id] = true;
    }
    beachDbComplete = true;
  }

  function lonRangesOverlap(aWest, aEast, bWest, bEast) {
    function normPairs(west, east) {
      var pairs = [];
      if (east - west >= 360) return [[-180, 180]];
      var w = west, e = east;
      while (w < -180 && e < -180) { w += 360; e += 360; }
      while (w > 180 && e > 180) { w -= 360; e -= 360; }
      if (w < -180) {
        pairs.push([w + 360, 180]);
        pairs.push([-180, e]);
      } else if (e > 180) {
        pairs.push([w, 180]);
        pairs.push([-180, e - 360]);
      } else if (e < w) {
        pairs.push([w, 180]);
        pairs.push([-180, e]);
      } else {
        pairs.push([w, e]);
      }
      return pairs;
    }
    var A = normPairs(aWest, aEast);
    var B = normPairs(bWest, bEast);
    var i, j;
    for (i = 0; i < A.length; i++) {
      for (j = 0; j < B.length; j++) {
        if (A[i][0] <= B[j][1] && B[j][0] <= A[i][1]) return true;
      }
    }
    return false;
  }

  function regionIntersectsBbox(region, south, north, west, east) {
    if (!region) return false;
    if (region.north < south || region.south > north) return false;
    return lonRangesOverlap(region.west, region.east, west, east);
  }

  function loadBeachManifest() {
    if (beachManifest) return Promise.resolve(beachManifest);
    if (beachManifestPromise) return beachManifestPromise;
    beachManifestPromise = fetch("data/manifest.json").then(function (res) {
      if (!res.ok) throw new Error("beach list");
      return res.json();
    }).then(function (manifest) {
      if (Array.isArray(manifest)) {
        beachManifest = {
          v: BEACH_DB_VER,
          cell: null,
          regions: null,
          files: manifest
        };
      } else {
        beachManifest = manifest || {};
        if (!beachManifest.regions && Array.isArray(beachManifest.files)) {
          /* legacy flat shards */
        }
      }
      return beachManifest;
    }).catch(function (err) {
      beachManifestPromise = null;
      throw err;
    });
    return beachManifestPromise;
  }

  function pickRegionsForBbox(south, north, west, east, padCells) {
    var regions = beachManifest && beachManifest.regions;
    if (!regions || !regions.length) return [];
    var cell = beachManifest.cell || { lat: 10, lon: 20 };
    var padLat = (padCells == null ? 1 : padCells) * (cell.lat || 10);
    var padLon = (padCells == null ? 1 : padCells) * (cell.lon || 20);
    var s = south - padLat;
    var n = north + padLat;
    var w = west - padLon;
    var e = east + padLon;
    if (s < -90) s = -90;
    if (n > 90) n = 90;
    var out = [];
    var i, r;
    for (i = 0; i < regions.length; i++) {
      r = regions[i];
      if (regionIntersectsBbox(r, s, n, w, e)) out.push(r);
    }
    return out;
  }

  function pickRegionsAround(lat, lon, radiusKm, padCells) {
    var degLat = (radiusKm || 80) / 111;
    var cosLat = Math.cos(lat * Math.PI / 180);
    var degLon = cosLat > 0.05 ? degLat / cosLat : 180;
    return pickRegionsForBbox(lat - degLat, lat + degLat, lon - degLon, lon + degLon, padCells);
  }


  /* --- beach worker + binary shards (opt5/8) ---
   * opt8 C: lazy Worker — do NOT new Worker at startup; create on first
   * region/decode need via getBeachWorker(); main-thread fallback always kept.
   */
  var beachWorker = null;
  var beachWorkerSeq = 0;
  var beachWorkerPending = Object.create(null);
  var idlePrefetchBusy = false;
  var idlePrefetchSeen = Object.create(null);

  function getBeachWorker() {
    if (beachWorker) return beachWorker;
    if (typeof Worker === "undefined") return null;
    try {
      /* created only when a region fetch actually needs decode off-main */
      beachWorker = new Worker("beach-worker.js?v=opt9c");
      beachWorker.onmessage = function (ev) {
        var msg = ev.data || {};
        var pending = beachWorkerPending[msg.id];
        if (!pending) return;
        delete beachWorkerPending[msg.id];
        if (msg.ok) pending.resolve(msg.rows || []);
        else pending.reject(new Error(msg.error || "worker"));
      };
      beachWorker.onerror = function () {
        /* fall back to main-thread parse next time */
        try { beachWorker.terminate(); } catch (eT) {}
        beachWorker = null;
      };
      return beachWorker;
    } catch (eW) {
      beachWorker = null;
      return null;
    }
  }

  function parseBin1Main(u8) {
    if (u8.length < 8 || u8[0] !== 0x53 || u8[1] !== 0x4e || u8[2] !== 0x59 || u8[3] !== 0x31) {
      throw new Error("bad magic");
    }
    var view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var count = view.getUint32(4, true);
    var off = 8;
    var out = new Array(count);
    var n = 0;
    var dec = new TextDecoder();
    var i, idLen, nameLen, id, name, lat, lon, cLen, country;
    for (i = 0; i < count; i++) {
      idLen = view.getUint16(off, true); off += 2;
      id = dec.decode(u8.subarray(off, off + idLen)); off += idLen;
      nameLen = view.getUint16(off, true); off += 2;
      name = dec.decode(u8.subarray(off, off + nameLen)); off += nameLen;
      lat = view.getFloat64(off, true); off += 8;
      lon = view.getFloat64(off, true); off += 8;
      cLen = view.getUint8(off); off += 1;
      country = cLen ? dec.decode(u8.subarray(off, off + cLen)).toUpperCase().slice(0, 2) : "";
      off += cLen;
      out[n++] = [id, name, lat, lon, country];
    }
    out.length = n;
    return out;
  }

  function gunzipU8(buf) {
    var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b) {
      if (typeof DecompressionStream === "undefined") return Promise.reject(new Error("no decompress"));
      var stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip"));
      return new Response(stream).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
    }
    return Promise.resolve(u8);
  }

  function fetchRegionViaWorker(url, format) {
    var w = getBeachWorker();
    if (!w) return Promise.reject(new Error("no worker"));
    var id = "r" + (++beachWorkerSeq);
    return new Promise(function (resolve, reject) {
      beachWorkerPending[id] = { resolve: resolve, reject: reject };
      w.postMessage({ id: id, url: url, format: format || "auto" });
      setTimeout(function () {
        if (!beachWorkerPending[id]) return;
        delete beachWorkerPending[id];
        reject(new Error("worker timeout"));
      }, 60000);
    });
  }

  function fetchRegionBytes(url, format) {
    return fetchRegionViaWorker(url, format).catch(function () {
      return fetch(url).then(function (res) {
        if (!res.ok) throw new Error("beach list");
        return res.arrayBuffer();
      }).then(gunzipU8).then(function (u8) {
        var looksBin = u8.length >= 4 && u8[0] === 0x53 && u8[1] === 0x4e && u8[2] === 0x59 && u8[3] === 0x31;
        if (format === "bin1" || (format === "auto" && looksBin)) return parseBin1Main(u8);
        var data = JSON.parse(new TextDecoder().decode(u8));
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.beaches)) return data.beaches;
        throw new Error("beach list");
      });
    });
  }

  function regionFileCandidates(region) {
    var files = [];
    var fmt = beachManifest && beachManifest.format;
    if (region.file) files.push({ url: region.file, format: /\.bin(\.gz)?$/i.test(region.file) ? "bin1" : (fmt === "bin1" ? "bin1" : "auto") });
    if (region.fileJson && region.fileJson !== region.file) {
      files.push({ url: region.fileJson, format: "json" });
    }
    if (!files.length) {
      files.push({ url: "data/" + region.id + ".bin.gz", format: "bin1" });
      files.push({ url: "data/" + region.id + ".json.gz", format: "json" });
    } else if (fmt === "bin1" && files.length === 1 && files[0].format === "bin1") {
      files.push({ url: "data/" + region.id + ".json.gz", format: "json" });
    }
    return files;
  }

  function maybeIdlePrefetchRing() {
    if (idlePrefetchBusy || tabHidden || !beachManifest || !beachManifest.regions) return;
    if (!beachDb || !beachDb.length) return;
    var lat = origin ? origin.lat : DEFAULT_WARM_LAT;
    var lon = origin ? origin.lon : DEFAULT_WARM_LON;
    var ring = pickRegionsAround(lat, lon, BG_RING_KM * 1.35, BG_PAD_CELLS + 1);
    var need = [];
    var i, r;
    for (i = 0; i < ring.length; i++) {
      r = ring[i];
      if (!r || !r.id) continue;
      if (beachRegionsLoaded[r.id] || beachRegionInflight[r.id] || idlePrefetchSeen[r.id]) continue;
      need.push(r);
    }
    if (!need.length) return;
    idlePrefetchBusy = true;
    var CONCURRENCY = 2;
    var idx = 0;
    function pump() {
      if (idx >= need.length || tabHidden) {
        idlePrefetchBusy = false;
        return Promise.resolve();
      }
      var batch = [];
      while (batch.length < CONCURRENCY && idx < need.length) {
        var reg = need[idx++];
        idlePrefetchSeen[reg.id] = 1;
        batch.push(reg);
      }
      return Promise.all(batch.map(function (reg) {
        return fetchOneRegion(reg).catch(function () { return null; });
      })).then(function () {
        return yieldMain().then(pump);
      });
    }
    pump();
  }

  function fetchOneRegion(region) {
    var id = region.id;
    if (beachRegionsLoaded[id]) return Promise.resolve(null);
    if (beachRegionInflight[id]) return beachRegionInflight[id];
    beachRegionInflight[id] = idbGetRegionRows(id).then(function (cached) {
      if (cached && cached.length) {
        if (!beachRegionsLoaded[id]) {
          beachRegionsLoaded[id] = true;
          mergeBeachRows(cached);
        }
        return cached;
      }
      var candidates = regionFileCandidates(region);
      function tryNext(i) {
        if (i >= candidates.length) throw new Error("beach list");
        var c = candidates[i];
        return fetchRegionBytes(c.url, c.format).then(function (rows) {
          if (beachRegionsLoaded[id]) return null;
          beachRegionsLoaded[id] = true;
          if (rows && rows.length) {
            var compact = Array.isArray(rows[0]) ? rows : toCompactRows(parseBeachDb(rows));
            mergeBeachRows(compact);
            idbPutRegionRows(id, compact).catch(function () {});
          }
          return rows;
        }).catch(function () {
          return tryNext(i + 1);
        });
      }
      return tryNext(0);
    }).then(function (part) {
      delete beachRegionInflight[id];
      return part;
    }).catch(function (err) {
      delete beachRegionInflight[id];
      throw err;
    });
    return beachRegionInflight[id];
  }

  function ensureRegionsList(regions, statusMsg) {
    if (beachDbComplete && beachDb) return Promise.resolve(beachDb);
    if (!regions || !regions.length) return Promise.resolve(beachDb || []);
    var need = [];
    var i, r;
    for (i = 0; i < regions.length; i++) {
      r = regions[i];
      if (!r || !r.id) continue;
      if (!beachRegionsLoaded[r.id]) need.push(r);
    }
    if (!need.length) return Promise.resolve(beachDb || []);
    if (statusMsg) setStatus(statusMsg);
    var YIELD_EVERY = 4;
    var idx = 0;
    function step() {
      if (idx >= need.length) return Promise.resolve(beachDb || []);
      var batch = [];
      while (batch.length < YIELD_EVERY && idx < need.length) {
        batch.push(need[idx++]);
      }
      return Promise.all(batch.map(function (reg) {
        return fetchOneRegion(reg).catch(function (err) {
          console.error(err);
          return null;
        });
      })).then(function () {
        if (idx >= need.length) return beachDb || [];
        return yieldMain().then(step);
      });
    }
    return step();
  }

  function ensureRegionsFor(lat, lon, radiusKm) {
    if (beachDbComplete && beachDb) return Promise.resolve(beachDb);
    return loadBeachManifest().then(function (manifest) {
      if (manifest.regions && manifest.regions.length) {
        var regs = pickRegionsAround(lat, lon, radiusKm == null ? 120 : radiusKm, 1);
        return ensureRegionsList(regs, "Loading beaches for this area…");
      }
      // legacy flat files — load all once
      if (beachDbComplete && beachDb) return beachDb;
      var files = manifest.files;
      if (!files || !files.length) throw new Error("beach list");
      setStatus("Loading beaches for this area…");
      return Promise.all(files.map(function (f) {
        return fetchJsonMaybeGzip(f);
      })).then(function (parts) {
        var rows = [];
        var i;
        for (i = 0; i < parts.length; i++) {
          if (Array.isArray(parts[i])) rows.push.apply(rows, parts[i]);
        }
        mergeBeachRows(rows);
        beachDbComplete = true;
        idbPutBeachRowsLegacy(toCompactRows(beachDb)).catch(function () {});
        return beachDb;
      });
    });
  }

  function ensureRegionsForBbox(south, north, west, east, quiet) {
    if (beachDbComplete && beachDb) return Promise.resolve(beachDb);
    return loadBeachManifest().then(function (manifest) {
      if (manifest.regions && manifest.regions.length) {
        var regs = pickRegionsForBbox(south, north, west, east, 1);
        return ensureRegionsList(regs, quiet ? null : "Loading beaches for this area…");
      }
      return ensureRegionsFor((south + north) / 2, (west + east) / 2, 200);
    });
  }

  function startBackgroundRegionLoad(quiet, lat, lon) {
    if (beachBgStarted || beachDbComplete) return;
    beachBgStarted = true;
    if (lat == null || lon == null) {
      if (origin) { lat = origin.lat; lon = origin.lon; }
      else { lat = DEFAULT_WARM_LAT; lon = DEFAULT_WARM_LON; }
    }
    loadBeachManifest().then(function (manifest) {
      var regions = manifest.regions;
      if (!regions || !regions.length) return;
      /* Nearby ring only — never background-fetch the whole planet (~198 regions). */
      var pending = pickRegionsAround(lat, lon, BG_RING_KM, BG_PAD_CELLS);
      var filtered = [];
      var i, r;
      for (i = 0; i < pending.length; i++) {
        r = pending[i];
        if (r && r.id && !beachRegionsLoaded[r.id]) filtered.push(r);
      }
      pending = filtered;
      if (!pending.length) return;
      if (!quiet) setStatus("Loading beaches for this area…");
      var idx = 0;
      var CONCURRENCY = 3;
      function pump() {
        if (idx >= pending.length) return;
        var batch = [];
        while (batch.length < CONCURRENCY && idx < pending.length) {
          batch.push(pending[idx++]);
        }
        return Promise.all(batch.map(function (reg) {
          return fetchOneRegion(reg).catch(function (err) {
            console.error(err);
            return null;
          });
        })).then(function () {
          if (idx >= pending.length) return;
          return yieldMain().then(pump);
        });
      }
      return pump();
    }).catch(function (err) {
      console.error(err);
      beachBgStarted = false;
    });
  }

  function finishFromFullCache(data) {
    beachDb = null;
    beachGrid = null;
    beachSeenIds = Object.create(null);
    beachByIdMap = Object.create(null);
    mergeBeachRows(data);
    markAllRegionsLoaded();
    return beachDb;
  }

  function loadBeachDb(opts) {
    var quiet = opts && opts.quiet;
    var lat = opts && opts.lat;
    var lon = opts && opts.lon;
    if ((lat == null || lon == null) && origin) {
      lat = origin.lat;
      lon = origin.lon;
    }
    if (lat == null || lon == null) {
      lat = DEFAULT_WARM_LAT;
      lon = DEFAULT_WARM_LON;
    }

    if (beachDbComplete && beachDb) return Promise.resolve(beachDb);

    function dbStatus(msg) {
      if (quiet) return;
      setStatus(msg);
    }

    function fromLegacyFull() {
      return fetchJsonGzip("data/beaches.json.gz")
        .catch(function () {
          return fetch("data/beaches.json").then(function (res) {
            if (!res.ok) throw new Error("beach list");
            return res.json();
          });
        })
        .then(function (data) {
          mergeBeachRows(data);
          beachDbComplete = true;
          idbPutBeachRowsLegacy(toCompactRows(beachDb)).catch(function () {});
          return beachDb;
        });
    }

    function priorityThenBackground() {
      dbStatus("Loading beaches for this area…");
      return ensureRegionsFor(lat, lon, 150).then(function (db) {
        startBackgroundRegionLoad(quiet, lat, lon);
        return db || beachDb || [];
      }).catch(function (err) {
        console.error(err);
        return fromLegacyFull();
      });
    }

    // Already have some rows (priority loaded) — still fine to resolve; callers that need
    // more geography should use ensureRegionsFor / ensureRegionsForBbox.
    if (beachDb && beachDb.length) {
      startBackgroundRegionLoad(true, lat, lon);
      return ensureRegionsFor(lat, lon, 150).then(function () {
        return beachDb;
      });
    }

    if (beachDbPromise) {
      return beachDbPromise.then(function () {
        return ensureRegionsFor(lat, lon, 150).then(function () { return beachDb; });
      });
    }

    dbStatus("Loading beaches for this area…");
    /* Per-region IDB: no full-planet hydrate. Priority fetch + nearby ring. */
    beachDbPromise = idbGetVer().then(function (ver) {
      void ver;
      return priorityThenBackground();
    }).catch(function () {
      return priorityThenBackground();
    }).catch(function (err) {
      beachDbPromise = null;
      throw err;
    });
    return beachDbPromise;
  }

  function inBbox(lat, lon, bbox) {
    if (!bbox) return true;
    if (lat < bbox.south || lat > bbox.north) return false;
    return lonInBounds(lon, bbox.west, bbox.east);
  }

  function rowToBeach(row, lat, lon) {
    return {
      id: row.id,
      name: row.name,
      lat: row.lat,
      lon: row.lon,
      country: row.country,
      tags: {},
      brief: "Beach",
      wiki: null,
      geom: { type: "Point", coordinates: [row.lon, row.lat] },
      dist: haversineKm(lat, lon, row.lat, row.lon)
    };
  }

  function fetchBeaches(lat, lon, radiusM, wantGeom, excludeCountry, bbox, capOverride, signal, onlyCountry) {
    void wantGeom;
    if (!bbox) radiusM = radiusM || BEACH_RADIUS_M;
    else if (!radiusM) radiusM = 150000;
    var cap = capOverride != null ? capOverride : ((bbox || radiusM > 200000) ? 250 : BEACH_CAP);
    if (onlyCountry) onlyCountry = String(onlyCountry).toUpperCase().slice(0, 2);
    if (onlyCountry) excludeCountry = null;
    else if (excludeCountry) excludeCountry = String(excludeCountry).toUpperCase().slice(0, 2);
    abortIf(signal);
    var prep = bbox
      ? ensureRegionsForBbox(bbox.south, bbox.north, bbox.west, bbox.east)
      : loadBeachDb({ lat: lat, lon: lon });
    return prep.then(function (db) {
      abortIf(signal);
      db = db || beachDb || [];
      var list = [];
      var i, row, country, distM, b, candidates, south, north, west, east, degLat, degLon, cosLat;
      if (bbox) {
        candidates = rowsFromGrid(bbox.south, bbox.north, bbox.west, bbox.east);
      } else {
        degLat = (radiusM / 1000) / 111;
        cosLat = Math.cos(lat * Math.PI / 180);
        degLon = cosLat > 0.05 ? degLat / cosLat : 180;
        south = lat - degLat;
        north = lat + degLat;
        west = lon - degLon;
        east = lon + degLon;
        candidates = rowsFromGrid(south, north, west, east);
      }
      if (!candidates || !candidates.length) candidates = db;
      for (i = 0; i < candidates.length; i++) {
        row = candidates[i];
        if (bbox) {
          if (!inBbox(row.lat, row.lon, bbox)) continue;
        } else {
          distM = haversineKm(lat, lon, row.lat, row.lon) * 1000;
          if (distM > radiusM) continue;
        }
        country = row.country || null;
        if (onlyCountry) {
          if (country !== onlyCountry) continue;
        } else if (excludeCountry) {
          if (country === excludeCountry) continue;
        }
        b = rowToBeach(row, lat, lon);
        list.push(b);
      }
      abortIf(signal);
      list.sort(function (a, c) { return a.dist - c.dist; });
      return list.slice(0, cap);
    }).catch(function (err) {
      if (err && err.name === "AbortError") throw err;
      if (!beachDb) {
        setStatus("Couldn't load the beach list. Try a refresh.");
      }
      throw err;
    });
  }

  function parseCurrent(row) {
    if (!row || row.error) throw new Error((row && row.reason) || "Open-Meteo error");
    if (!row.current || row.current.cloud_cover == null) throw new Error("missing cloud_cover");
    var isDay = row.current.is_day === 1;
    var uv = row.current.uv_index;
    if (uv == null) uv = 0;
    if (!isDay) uv = 0;
    return { cloud: row.current.cloud_cover, uv: uv, isDay: isDay };
  }

  function wxCacheKey(lat, lon) {
    return lat.toFixed(3) + "," + lon.toFixed(3);
  }

  function getCachedCurrentWx(lat, lon) {
    var ent = currentWxCache[wxCacheKey(lat, lon)];
    if (!ent) return null;
    if (Date.now() - ent.t > CURRENT_WX_TTL_MS) {
      delete currentWxCache[wxCacheKey(lat, lon)];
      return null;
    }
    return ent.wx;
  }

  function putCachedCurrentWx(lat, lon, wx) {
    currentWxCache[wxCacheKey(lat, lon)] = { t: Date.now(), wx: wx };
  }

  function fetchCurrentWeather(points) {
    if (!points.length) return Promise.resolve([]);
    var out = new Array(points.length);
    var missing = [];
    var missingIdx = [];
    var i, hit;
    for (i = 0; i < points.length; i++) {
      hit = getCachedCurrentWx(points[i].lat, points[i].lon);
      if (hit) {
        out[i] = Object.assign({}, points[i], hit);
      } else {
        missing.push(points[i]);
        missingIdx.push(i);
      }
    }
    if (!missing.length) return Promise.resolve(out);

    var lats = missing.map(function (p) { return p.lat.toFixed(4); }).join(",");
    var lons = missing.map(function (p) { return p.lon.toFixed(4); }).join(",");
    var url = METEO_URL + "?latitude=" + lats + "&longitude=" + lons + "&current=cloud_cover,uv_index,is_day";
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("Open-Meteo HTTP " + res.status);
      return res.json();
    }).then(function (data) {
      var rows = Array.isArray(data) ? data : [data];
      if (rows.length !== missing.length) throw new Error("Open-Meteo count mismatch");
      var j, wx;
      for (j = 0; j < missing.length; j++) {
        wx = parseCurrent(rows[j]);
        putCachedCurrentWx(missing[j].lat, missing[j].lon, wx);
        out[missingIdx[j]] = Object.assign({}, missing[j], wx);
      }
      return out;
    });
  }

  function fetchHourly(lat, lon) {
    var key = lat.toFixed(3) + "," + lon.toFixed(3);
    if (hourlyCache[key]) return Promise.resolve(hourlyCache[key]);
    var url = METEO_URL + "?latitude=" + lat.toFixed(4) + "&longitude=" + lon.toFixed(4) +
      "&current=cloud_cover,uv_index,is_day" +
      "&hourly=cloud_cover,is_day,uv_index,sunshine_duration" +
      "&forecast_hours=48&timezone=auto";
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("Open-Meteo HTTP " + res.status);
      return res.json();
    }).then(function (data) {
      hourlyCache[key] = data;
      try {
        if (data && data.current && data.current.cloud_cover != null) {
          putCachedCurrentWx(lat, lon, parseCurrent(data));
        }
      } catch (e) {}
      return data;
    });
  }

  function hourIndexNow(times) {
    var now = Date.now();
    var i, best = 0, dt, min = Infinity;
    for (i = 0; i < times.length; i++) {
      dt = Math.abs(Date.parse(times[i]) - now);
      if (dt < min) { min = dt; best = i; }
    }
    return best;
  }

  function isSunnyHour(cloud, isDay) {
    return isDay === 1 && cloud != null && cloud < SUNNY_CLOUD;
  }

  function formatClock(iso) {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function hoursWord(n) {
    if (n < 1) return "under an hour";
    if (n === 1) return "about 1 hour";
    return "about " + n + " hours";
  }

  function sunForecast(data) {
    if (!data || !data.hourly || !data.hourly.time) return "Couldn't get the sun forecast.";
    var times = data.hourly.time;
    var clouds = data.hourly.cloud_cover;
    var days = data.hourly.is_day;
    var i = hourIndexNow(times);
    var n, start, len;

    if (isSunnyHour(clouds[i], days[i])) {
      n = i;
      while (n < times.length && isSunnyHour(clouds[n], days[n])) n++;
      len = n - i;
      if (n < times.length) {
        return "Sun for " + hoursWord(len) + ", then clouds around " + formatClock(times[n]) + ".";
      }
      return "Sun for " + hoursWord(len) + ".";
    }

    start = i;
    while (start < times.length && !isSunnyHour(clouds[start], days[start])) start++;
    if (start >= times.length) return "No real sun in the next couple of days.";
    n = start;
    while (n < times.length && isSunnyHour(clouds[n], days[n])) n++;
    len = n - start;
    if (days[i] !== 1) {
      return "It's night. Sun after " + formatClock(times[start]) + ", " + hoursWord(len) + ".";
    }
    return "Cloudy now. Looks sunny around " + formatClock(times[start]) + " for " + hoursWord(len) + ".";
  }

  function lonInBounds(lon, west, east) {
    if (west <= east) return lon >= west && lon <= east;
    return lon >= west || lon <= east;
  }

  function inViewList(list) {
    var rows = beachesForMode(list || []);
    if (!rows.length) return [];
    var b;
    try { b = map.getBounds(); } catch (e) { return rows.slice(); }
    var south = b.getSouth();
    var north = b.getNorth();
    var west = b.getWest();
    var east = b.getEast();
    var latPad = Math.max(0.02, (north - south) * 0.08);
    var lonPad;
    if (west <= east) lonPad = Math.max(0.02, (east - west) * 0.08);
    else lonPad = Math.max(0.02, (360 - west + east) * 0.08);
    south -= latPad;
    north += latPad;
    west -= lonPad;
    east += lonPad;
    if (west < -180) west += 360;
    if (east > 180) east -= 360;
    var out = [];
    var i, row;
    for (i = 0; i < rows.length; i++) {
      row = rows[i];
      if (row.lat < south || row.lat > north) continue;
      if (!lonInBounds(row.lon, west, east)) continue;
      out.push(row);
    }
    return out;
  }

  function cullToView(list) {
    var vis = inViewList(list);
    var z = 3;
    try { z = map.getZoom(); } catch (e) {}
    var cap = z < 4 ? 220 : z < 6 ? 320 : z < 9 ? 420 : 380;
    if (vis.length <= cap) return vis;
    var sampled = [];
    var stride = vis.length / cap;
    var i, idx;
    for (i = 0; i < cap; i++) {
      idx = Math.min(vis.length - 1, Math.floor(i * stride));
      sampled.push(vis[idx]);
    }
    return sampled;
  }

  function paintCullKey(vis, usePoint) {
    var n = vis.length;
    var firstId = n ? String(vis[0].id) : "";
    var lastId = n ? String(vis[n - 1].id) : "";
    var west = 0, east = 0, south = 0, north = 0;
    try {
      var b = map.getBounds();
      west = b.getWest();
      east = b.getEast();
      south = b.getSouth();
      north = b.getNorth();
    } catch (eB) {}
    var hash = 0;
    var lim = n < 24 ? n : 24;
    var i, s, c, j;
    for (i = 0; i < lim; i++) {
      s = String(vis[i].id);
      for (j = 0; j < s.length; j++) {
        c = s.charCodeAt(j);
        hash = ((hash << 5) - hash + c) | 0;
      }
    }
    return n + "|" + (usePoint ? "pt" : "poly") + "|" + firstId + "|" + lastId + "|" +
      west.toFixed(2) + "," + south.toFixed(2) + "," + east.toFixed(2) + "," + north.toFixed(2) +
      "|" + (hash >>> 0) + "|" + viewGen;
  }

  function paintBeaches(list) {
    ensureBeachLayers();
    var srcList = list || beaches;
    noteBeachObjects(srcList);
    var vis = cullToView(beachesForMode(srcList));
    var z = 3;
    try { z = map.getZoom(); } catch (eZ) {}
    var usePoint = z < 9;
    var key = paintCullKey(vis, usePoint);
    if (key === lastPaintKey) return;
    lastPaintKey = key;
    var features = [];
    var i, b, geom;
    for (i = 0; i < vis.length; i++) {
      b = vis[i];
      geom = b.geom;
      if (usePoint || !geom) {
        geom = { type: "Point", coordinates: [b.lon, b.lat] };
      }
      features.push({
        type: "Feature",
        id: b.id,
        properties: { id: String(b.id) },
        geometry: geom
      });
    }
    map.getSource("beaches").setData({ type: "FeatureCollection", features: features });
  }

  function popupHtml(b, extra, imgUrl) {
    var lines = [];
    lines.push("<div class=\"popup\"><h2>" + escapeHtml(b.name) + "</h2>");
    if (b.dist != null) lines.push("<p>" + formatKm(b.dist) + "</p>");
    if (b.brief) lines.push("<p>" + escapeHtml(b.brief) + "</p>");
    if (b.cloud != null && b.cloud >= 0) {
      lines.push("<p>" + Math.round(b.cloud) + "% cloudy" + (b.isDay ? "" : ", and it's night") + "</p>");
    }
    if (extra) lines.push("<p class=\"sunline\">" + escapeHtml(extra) + "</p>");
    if (imgUrl) lines.push("<img class=\"thumb\" alt=\"\" src=\"" + escapeHtml(imgUrl) + "\">");
    lines.push("</div>");
    return lines.join("");
  }

  function showPopup(b, lngLat, extra, imgUrl) {
    if (popup) popup.remove();
    popup = new maplibregl.Popup({ offset: 14, closeButton: true, maxWidth: "280px" })
      .setLngLat(lngLat || [b.lon, b.lat])
      .setHTML(popupHtml(b, extra, imgUrl))
      .addTo(map);
  }

  function beachById(id) {
    var sid = String(id);
    if (beachByIdMap[sid]) return beachByIdMap[sid];
    var i;
    for (i = 0; i < beaches.length; i++) {
      if (String(beaches[i].id) === sid) {
        beachByIdMap[sid] = beaches[i];
        return beaches[i];
      }
    }
    return null;
  }

  function fetchWiki(b) {
    var title = b.wiki || b.name;
    if (!title || title === "Unnamed beach") return Promise.resolve(null);
    if (wikiCache[title] !== undefined) return Promise.resolve(wikiCache[title]);
    return fetch(WIKI_URL + encodeURIComponent(title), {
      headers: { Accept: "application/json" }
    }).then(function (res) {
      if (!res.ok) throw new Error("wiki");
      return res.json();
    }).then(function (data) {
      var info = {
        extract: data.extract ? String(data.extract).slice(0, 280) : "",
        thumb: data.thumbnail && data.thumbnail.source ? data.thumbnail.source : ""
      };
      wikiCache[title] = info;
      return info;
    }).catch(function () {
      wikiCache[title] = null;
      return null;
    });
  }

  function enrichBeach(b, withWiki) {
    /* withWiki default true for map hover-dwell / click popup path only */
    if (withWiki === false) {
      return fetchHourly(b.lat, b.lon).then(function (data) {
        var forecast = sunForecast(data);
        showPopup(b, [b.lon, b.lat], forecast, "");
        return data;
      }).catch(function () {
        showPopup(b, [b.lon, b.lat], "Couldn't get the sun forecast.", "");
      });
    }
    return Promise.all([
      fetchHourly(b.lat, b.lon).then(sunForecast).catch(function () { return "Couldn't get the sun forecast."; }),
      fetchWiki(b)
    ]).then(function (pair) {
      var forecast = pair[0];
      var wiki = pair[1];
      var extra = forecast;
      if (wiki && wiki.extract) extra = forecast;
      var img = wiki && wiki.thumb ? wiki.thumb : "";
      var brief = b.brief;
      if (wiki && wiki.extract) brief = wiki.extract;
      showPopup(Object.assign({}, b, { brief: brief }), [b.lon, b.lat], extra, img);
    });
  }

  function setHover(id) {
    if (hoverId && map.getSource("beaches")) {
      try { map.setFeatureState({ source: "beaches", id: hoverId }, { hover: false }); } catch (e) {}
    }
    hoverId = id;
    if (id && map.getSource("beaches")) {
      try { map.setFeatureState({ source: "beaches", id: id }, { hover: true }); } catch (e2) {}
    }
  }

  function onBeachEnter(e) {
    var now = Date.now();
    if (now - hoverThrottle < 80) return;
    hoverThrottle = now;
    if (!e.features || !e.features.length) return;
    var f = e.features[0];
    var b = beachById(f.properties.id);
    if (!b) return;
    map.getCanvas().style.cursor = "pointer";
    if (hoverId === b.id) return;
    setHover(b.id);
    showPopup(b, e.lngLat);
    if (dwellTimer) clearTimeout(dwellTimer);
    dwellTimer = setTimeout(function () {
      enrichBeach(b);
    }, DWELL_MS);
  }

  function onBeachLeave() {
    map.getCanvas().style.cursor = "";
    setHover(null);
    if (dwellTimer) { clearTimeout(dwellTimer); dwellTimer = null; }
  }

  function beachCountryCode(b) {
    if (b && b.country) {
      var cc = String(b.country).toUpperCase().slice(0, 2);
      if (cc.length === 2) return cc;
    }
    var tags = (b && b.tags) || {};
    var raw = tags["ISO3166-1"] || tags["addr:country"] || tags["is_in:country_code"] || tags["is_in:country"] || "";
    raw = String(raw).trim();
    if (!raw) return null;
    var up = raw.toUpperCase();
    if (up.length === 2) return up;
    if (up.indexOf("UNITED STATES") >= 0 || up === "USA") return "US";
    if (up.indexOf("CANADA") >= 0) return "CA";
    if (up.indexOf("MEXICO") >= 0) return "MX";
    return up.slice(0, 2);
  }

  function isForeignBeach(b, assumeForeignIfUnknown) {
    if (!homeCountry || !homeCountry.code) return !!assumeForeignIfUnknown;
    var code = beachCountryCode(b);
    if (code) return code !== homeCountry.code;
    return !!assumeForeignIfUnknown;
  }

  function parseCountryPayload(data, fromNominatim) {
    if (!data) return null;
    if (fromNominatim) {
      var addr = data.address || {};
      var cc = String(addr.country_code || "").toUpperCase();
      if (!cc) return null;
      return { code: cc.slice(0, 2), name: addr.country || cc };
    }
    var code = String(data.countryCode || "").toUpperCase();
    if (!code) return null;
    return { code: code.slice(0, 2), name: data.countryName || code };
  }

  function fetchHomeCountry(lat, lon) {
    var url = GEOCODE_URL + "?latitude=" + lat + "&longitude=" + lon + "&localityLanguage=en";
    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("geocode");
        return res.json();
      })
      .then(function (data) {
        homeCountry = parseCountryPayload(data, false);
        if (homeCountry) return homeCountry;
        throw new Error("empty country");
      })
      .catch(function () {
        return fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" + lat + "&lon=" + lon + "&zoom=3")
          .then(function (res) {
            if (!res.ok) throw new Error("nominatim");
            return res.json();
          })
          .then(function (data) {
            homeCountry = parseCountryPayload(data, true);
            return homeCountry;
          });
      })
      .catch(function () {
        homeCountry = null;
        return null;
      });
  }

  function ensureHomeCountry() {
    if (homeCountry && homeCountry.code) return Promise.resolve(homeCountry);
    if (!origin) return Promise.resolve(null);
    return fetchHomeCountry(origin.lat, origin.lon);
  }

  function isSunnyBeach(b) {
    return !!(b && b.isDay && b.cloud != null && b.cloud < SUNNY_CLOUD);
  }

  function sunnySortCmp(a, b) {
    var ca = a && a.cloud != null ? a.cloud : 999;
    var cb = b && b.cloud != null ? b.cloud : 999;
    if (ca !== cb) return ca - cb;
    return (a.dist || 0) - (b.dist || 0);
  }

  function excludeCode() {
    return isIntl() && homeCountry && homeCountry.code ? homeCountry.code : null;
  }

  function countryLabel() {
    return (homeCountry && (homeCountry.name || homeCountry.code)) || "your country";
  }

  function searchRadii() {
    return isIntl() ? [300000, 800000, 1500000, 2500000] : [200000, 500000, 1000000];
  }

  function pickNearestSunnyFrom(list, assumeForeign) {
    var rows = list || [];
    if (isIntl()) {
      rows = rows.filter(function (b) { return isForeignBeach(b, assumeForeign); });
    } else {
      rows = beachesForMode(rows);
    }
    var sunny = rows.filter(isSunnyBeach);
    if (!sunny.length) return null;
    sunny.sort(sunnySortCmp);
    return sunny[0];
  }

  function pickNearestBeachFrom(list, assumeForeign) {
    var rows = list || [];
    if (isIntl()) {
      rows = rows.filter(function (b) { return isForeignBeach(b, assumeForeign); });
    } else {
      rows = beachesForMode(rows);
    }
    if (!rows.length) return null;
    rows.sort(function (a, b) { return a.dist - b.dist; });
    return rows[0];
  }

  function finishBeach(b, kind) {
    placeDest(b);
    map.flyTo({ center: [b.lon, b.lat], zoom: Math.max(map.getZoom(), 11), speed: 0.9 });
    showPopup(b);
    var prefix = kind === "sunny" ? "Sunny: " : "Nearest: ";
    /* No Wikipedia on Find / list / preview cycle — hourly only. Wiki via map dwell/click. */
    enrichBeach(b, false).then(function () {
      return fetchHourly(b.lat, b.lon);
    }).then(function (data) {
      var line = sunForecast(data);
      var cloud = b.cloud != null ? Math.round(b.cloud) + "% cloudy · " : "";
      setStatus(prefix + b.name + " · " + formatKm(b.dist) + " · " + cloud + line);
    }).catch(function () {
      setStatus(prefix + b.name + " · " + formatKm(b.dist));
    });
  }

  function unlockSearch() {
    searchingSunny = false;
    btnSun.disabled = false;
    if (btnAll) btnAll.disabled = false;
  }

  function filterSunnyRows(list, assumeForeign) {
    var rows = list || [];
    if (isIntl()) {
      rows = rows.filter(function (b) { return isForeignBeach(b, assumeForeign); });
    } else {
      rows = beachesForMode(rows);
    }
    return rows.filter(isSunnyBeach).sort(sunnySortCmp);
  }

  function weatherCollectSunny(list, assumeForeign, wantCount, genToken) {
    var want = wantCount || SUNNY_PICK_CAP;
    var found = [];
    var i = 0;
    var myGen = genToken != null ? genToken : wxSearchGen;
    function stale() {
      return myGen !== wxSearchGen;
    }
    function absorb(wx) {
      if (stale()) return;
      filterSunnyRows(wx, assumeForeign).forEach(function (b) {
        if (found.length >= want) return;
        if (found.some(function (x) { return x.id === b.id; })) return;
        found.push(b);
      });
    }
    function step() {
      if (stale()) return Promise.resolve([]);
      if (found.length >= want || i >= list.length) {
        found.sort(sunnySortCmp);
        return Promise.resolve(found.slice(0, want));
      }
      var chunkA = list.slice(i, i + WX_BATCH);
      i += WX_BATCH;
      var chunkB = list.slice(i, i + WX_BATCH);
      if (chunkB.length) i += WX_BATCH;
      setStatus("Checking the sun… " + Math.min(i, list.length) + "/" + list.length);
      var jobs = [
        fetchCurrentWeather(chunkA).catch(function (err) {
          console.error(err);
          return [];
        })
      ];
      if (chunkB.length) {
        jobs.push(fetchCurrentWeather(chunkB).catch(function (err) {
          console.error(err);
          return [];
        }));
      }
      return Promise.all(jobs).then(function (parts) {
        if (stale()) return [];
        var wx = [];
        var p;
        for (p = 0; p < parts.length; p++) {
          if (parts[p] && parts[p].length) wx.push.apply(wx, parts[p]);
        }
        absorb(wx);
        return step();
      });
    }
    return step();
  }

  function closeSunnySheet() {
    if (!sunnySheet) return;
    sunnySheet.hidden = true;
    if (sunnySheetList) sunnySheetList.innerHTML = "";
    sheetListRows = [];
  }

  function markSunnyActive(btn) {
    if (!sunnySheetList) return;
    var items = sunnySheetList.querySelectorAll(".sheet-item");
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle("is-active", items[i] === btn);
    }
  }

  function previewSunnyBeach(b, btn) {
    markSunnyActive(btn);
    if (btn && typeof btn.scrollIntoView === "function") {
      try { btn.scrollIntoView({ block: "nearest" }); } catch (eScroll) {}
    }
    finishBeach(b, sheetSunnyMode ? "sunny" : "near");
  }

  function advanceSunnySheet() {
    if (!sunnySheet || sunnySheet.hidden || !sunnySheetList) return false;
    var items = sunnySheetList.querySelectorAll(".sheet-item");
    if (!items.length || !sheetListRows.length) return false;
    var wantSunny = sunnyModeOn();
    if (wantSunny !== sheetSunnyMode) return false;
    var active = -1;
    var i;
    for (i = 0; i < items.length; i++) {
      if (items[i].classList.contains("is-active")) {
        active = i;
        break;
      }
    }
    if (active < 0) active = 0;
    var next = (active + 1) % items.length;
    var b = sheetListRows[next];
    if (!b) return false;
    previewSunnyBeach(b, items[next]);
    return true;
  }

  function shortBeachName(name, maxLen) {
    maxLen = maxLen || 40;
    var s = String(name == null ? "" : name).replace(/^\s+|\s+$/g, "");
    if (s.length <= maxLen) return s;
    var prefix = "Beach near ";
    if (s.indexOf(prefix) === 0) {
      var place = s.slice(prefix.length);
      var room = maxLen - prefix.length - 1;
      if (room < 8) room = 8;
      if (place.length > room) {
        place = place.slice(0, room).replace(/\s+$/g, "") + "…";
      }
      return prefix + place;
    }
    return s.slice(0, maxLen - 1).replace(/\s+$/g, "") + "…";
  }

  function openSunnySheet(list, sunnyMode) {
    sheetSunnyMode = sunnyMode !== false;
    sheetListRows = list ? list.slice() : [];
    if (sheetSunnyMode && (!list || !list.length)) {
      sheetListRows = [];
      if (sunnySheet) sunnySheet.hidden = true;
      if (sunnySheetList) sunnySheetList.innerHTML = "";
      setStatus("No beaches under 20% cloud nearby");
      return;
    }
    if (!sunnySheet || !sunnySheetList) {
      if (list && list[0]) finishBeach(list[0], sheetSunnyMode ? "sunny" : "near");
      return;
    }
    if (sunnySheetTitle) {
      sunnySheetTitle.textContent = sheetSunnyMode ? "Sunny beaches" : "Nearest beaches";
    }
    sunnySheetList.innerHTML = "";
    if (sunnySheetSub) {
      if (sheetSunnyMode) {
        sunnySheetSub.textContent = list.length === 1
          ? "1 sunny beach. Tap to show on map."
          : list.length + " sunny beaches. Tap one, map stays live.";
      } else {
        sunnySheetSub.textContent = list.length === 1
          ? "1 beach. Tap to show on map."
          : list.length + " nearest beaches. Tap one, map stays live.";
      }
    }
    list.forEach(function (b, idx) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sheet-item";
      var cloud = b.cloud != null ? Math.round(b.cloud) + "% cloudy" : "—";
      var label = shortBeachName(b.name || "Beach", 40);
      btn.innerHTML = "<span>" + escapeHtml(label) + "</span>" +
        "<span class=\"dist\">" + escapeHtml(formatKm(b.dist)) + "</span>" +
        "<span class=\"meta\">#" + (idx + 1) + " · " + escapeHtml(cloud) + "</span>";
      btn.title = b.name || "Beach";
      btn.addEventListener("click", function () {
        previewSunnyBeach(b, btn);
      });
      li.appendChild(btn);
      sunnySheetList.appendChild(li);
    });
    sunnySheet.hidden = false;
    if (list[0]) {
      var firstBtn = sunnySheetList.querySelector(".sheet-item");
      previewSunnyBeach(list[0], firstBtn);
    }
    // Prefetch current weather for top rows (uses currentWxCache). Non-blocking.
    try {
      var pref = [];
      var nPref = Math.min(8, list.length);
      var pi, pb;
      for (pi = 0; pi < nPref; pi++) {
        pb = list[pi];
        if (!pb) continue;
        if (sheetSunnyMode && pb.cloud != null) continue;
        if (getCachedCurrentWx(pb.lat, pb.lon)) continue;
        pref.push(pb);
      }
      if (pref.length) {
        fetchCurrentWeather(pref).catch(function () {});
      }
    } catch (ePref) {}
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function weatherNearestSunny(list) {
    return weatherCollectSunny(list, true, 1).then(function (rows) {
      return rows[0] || null;
    });
  }

  function modeSortedBeaches(list, assumeForeign) {
    var rows = list || [];
    if (isIntl()) {
      rows = rows.filter(function (b) { return isForeignBeach(b, assumeForeign); });
    } else {
      rows = beachesForMode(rows);
    }
    rows = rows.slice().sort(function (a, b) { return a.dist - b.dist; });
    return rows;
  }

  function searchBeachesFar(wantSunny) {
    var radii = searchRadii();
    var maxR = radii[radii.length - 1];
    var only = homeOnlyCode();
    var code = only ? null : excludeCode();
    var where = isIntl() ? " outside " + countryLabel() : "";
    var km = Math.round(maxR / 1000);
    var myGen = ++wxSearchGen;
    setStatus((wantSunny ? "No sun close by. " : "") + "Looking" + where + ", within " + km + " km…");
    fetchBeaches(origin.lat, origin.lon, maxR, false, code, null, 400, null, only)
      .then(function (list) {
        if (myGen !== wxSearchGen) { unlockSearch(); return; }
        if (!wantSunny) {
          var nearList = modeSortedBeaches(list, true).slice(0, SUNNY_PICK_CAP);
          unlockSearch();
          if (nearList.length) {
            setStatus(nearList.length === 1 ? "1 beach found. Pick it on the list." : nearList.length + " beaches found. Pick one.");
            openSunnySheet(nearList, false);
          } else {
            setStatus("Couldn't find a beach" + where + " within " + km + " km.");
          }
          return;
        }
        if (!list || !list.length) {
          unlockSearch();
          setStatus("No beaches under 20% cloud nearby");
          return;
        }
        return weatherCollectSunny(list, true, SUNNY_PICK_CAP, myGen).then(function (rows) {
          if (myGen !== wxSearchGen) { unlockSearch(); return; }
          unlockSearch();
          if (rows && rows.length) {
            setStatus(rows.length === 1 ? "1 sunny beach found." : rows.length + " sunny beaches found. Pick one.");
            openSunnySheet(rows, true);
          } else {
            setStatus("No beaches under 20% cloud nearby");
          }
        });
      })
      .catch(function (err) {
        console.error(err);
        unlockSearch();
        if (!beachDb) return;
        if (wantSunny) {
          setStatus("No beaches under 20% cloud nearby");
        } else {
          setStatus("Couldn't find a beach" + where + " within " + km + " km.");
        }
      });
  }

  function fitBeaches(list) {
    if (!list || !list.length) return;
    if (list.length === 1) {
      map.flyTo({ center: [list[0].lon, list[0].lat], zoom: Math.max(map.getZoom(), 11), speed: 0.9 });
      return;
    }
    var bounds = new maplibregl.LngLatBounds([list[0].lon, list[0].lat], [list[0].lon, list[0].lat]);
    list.forEach(function (b) { bounds.extend([b.lon, b.lat]); });
    map.fitBounds(bounds, {
      padding: { top: 90, left: 28, right: 190, bottom: 240 },
      maxZoom: 12,
      duration: 900
    });
  }

  function viewBbox() {
    var b = map.getBounds();
    return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
  }

  function viewDiagonalKm() {
    var b = viewBbox();
    return haversineKm(b.south, b.west, b.north, b.east);
  }

  function mergeBeaches(list) {
    var seen = {};
    beaches.forEach(function (b) { seen[b.id] = true; });
    (list || []).forEach(function (b) {
      if (!b || seen[b.id]) return;
      if (origin) b.dist = haversineKm(origin.lat, origin.lon, b.lat, b.lon);
      beaches.push(b);
      beachByIdMap[String(b.id)] = b;
      seen[b.id] = true;
    });
  }

  function viewStatus() {
    var n = inViewList(beaches).length;
    var msg = n === 1 ? "1 beach in view." : n + " beaches in view.";
    if (!n) msg = "Zoom in a bit to load beaches in this view.";
    setStatus(msg);
  }

  function syncAllBtn() {
    if (!btnAll) return;
    btnAll.setAttribute("aria-pressed", allMode ? "true" : "false");
    if (allMode) btnAll.classList.add("is-on");
    else btnAll.classList.remove("is-on");
    if (!allMode) btnAll.classList.remove("is-busy");
  }


  function loadViewBeaches() {
    if (!allMode) return;
    var gen = ++viewGen;
    function run() {
      if (!allMode || gen !== viewGen) return;
      var z = map.getZoom();
      var diag = viewDiagonalKm();
      if (z < 3.4 || diag > 4500) {
        if (btnAll) btnAll.classList.remove("is-busy");
        paintBeaches(beaches);
        if (gen !== viewGen) return;
        var n = inViewList(beaches).length;
        if (n) setStatus(n === 1 ? "1 beach in view." : n + " beaches in view.");
        else setStatus("Zoom in a bit to load beaches in this view.");
        return;
      }
      var qb = viewBbox();
      var cap = z < 6 ? 220 : 400;
      var center = map.getCenter();
      var only = homeOnlyCode();
      if (btnAll) btnAll.classList.add("is-busy");
      if (!beachDb) setStatus("Loading beaches in view…");
      if (viewAbort) viewAbort.abort();
      viewAbort = new AbortController();
      fetchBeaches(center.lat, center.lng, null, false, null, qb, cap, viewAbort.signal, only)
        .then(function (list) {
          beaches = nearbyBeaches.slice();
          mergeBeaches(list);
          if (gen !== viewGen) return;
          if (btnAll) btnAll.classList.remove("is-busy");
          paintBeaches(beaches);
          viewStatus();
        })
        .catch(function (err) {
          if (err && err.name === "AbortError") return;
          console.error(err);
          if (gen !== viewGen) return;
          if (btnAll) btnAll.classList.remove("is-busy");
          paintBeaches(beaches);
          if (!beachDb) return;
          setStatus("Couldn't load beaches in this view. Try again in a bit.");
        });
    }
    if (!isIntl()) ensureHomeCountry().then(run);
    else run();
  }

  function showAllBeaches() {
    if (searchingSunny) return;
    allMode = !allMode;
    syncAllBtn();
    if (!allMode) {
      viewGen += 1;
      if (viewAbort) viewAbort.abort();
      beaches = nearbyBeaches.slice();
      paintBeaches(beaches);
      var visOff = beachesForMode(beaches);
      var n = visOff.length;
      if (n) {
        var nSunny = visOff.filter(isSunnyBeach).length;
        var sunBit = nSunny === 0 ? "none look sunny right now" : (nSunny === 1 ? "1 looks sunny" : nSunny + " look sunny");
        var nBit = n === 1 ? "1 beach nearby, " : n + " beaches nearby, ";
        setStatus(nBit + sunBit + ".");
      } else {
        setStatus("All beaches off. Pan the map, or hit Locate me.");
      }
      return;
    }
    loadViewBeaches();
  }

  function sunnyModeOn() {
    return !toggleSunny || toggleSunny.checked;
  }

  function goNearestBeaches() {
    if (!origin || searchingSunny) return;
    // Repeated Find: cycle next beach in the open sheet (wrap); else search.
    if (advanceSunnySheet()) return;
    wxSearchGen += 1;
    ensureHomeCountry().then(function () {
      var wantSunny = sunnyModeOn();
      if (wantSunny) {
        var localSunny = filterSunnyRows(nearbyBeaches, false);
        if (localSunny.length >= 3) {
          setStatus(localSunny.length + " sunny beaches nearby. Pick one.");
          openSunnySheet(localSunny.slice(0, SUNNY_PICK_CAP), true);
          return;
        }
        searchingSunny = true;
        btnSun.disabled = true;
        if (localSunny.length) {
          setStatus("Found " + localSunny.length + " nearby. Looking farther for more…");
        }
        searchBeachesFar(true);
        return;
      }
      var localNear = modeSortedBeaches(nearbyBeaches, false);
      if (localNear.length >= 3) {
        var pick = localNear.slice(0, SUNNY_PICK_CAP);
        setStatus(pick.length === 1 ? "1 beach nearby. Pick it on the list." : pick.length + " beaches nearby. Pick one.");
        openSunnySheet(pick, false);
        return;
      }
      searchingSunny = true;
      btnSun.disabled = true;
      if (localNear.length) {
        setStatus("Found " + localNear.length + " nearby. Looking farther for more…");
      }
      searchBeachesFar(false);
    });
  }

  function maybeLocalBeachForecast() {
    if (!origin || !nearbyBeaches.length) return;
    var closest = nearbyBeaches[0];
    if (closest.dist > 1.5) return;
    fetchHourly(closest.lat, closest.lon).then(function (data) {
      var line = sunForecast(data);
      var here = closest.cloud != null ? closest.name + " is " + Math.round(closest.cloud) + "% cloudy. " : "";
      setStatus(here + line);
    }).catch(function () {});
  }

  function loadAround(lat, lon) {
    origin = { lat: lat, lon: lon };
    homeCountry = null;
    waitingForTap = false;
    btnSun.disabled = true;
    beaches = [];
    nearbyBeaches = [];
    placeUserMarker();
    placeDest(null);
    if (popup) { popup.remove(); popup = null; }
    map.flyTo({ center: [lon, lat], zoom: 9.2, speed: 1.2 });
    setStatus("Finding clouds and beaches…");
    ensureBeachLayers();
    setCloudFrame(cloudTimes.length ? cloudTimes.length - 1 : 0);

    ensureHomeCountry().then(function () {
      var only = homeOnlyCode();
      return ensureRegionsFor(lat, lon, 150).then(function () {
        return fetchBeaches(lat, lon, null, null, null, null, null, null, only);
      });
    }).then(function (list) {
        var home = homeOnlyCode();
        if (home && list) {
          list.forEach(function (b) {
            if (b) b.country = b.country || home;
          });
        }
        if (!list || !list.length) {
          nearbyBeaches = [];
          if (!allMode) {
            beaches = [];
            paintBeaches([]);
          } else {
            paintBeaches(beaches);
          }
          btnSun.disabled = false;
          if (btnAll) btnAll.disabled = false;
          setStatus("No beaches within 50 km. All beaches can still look at the map.");
          return null;
        }
        nearbyBeaches = list.slice();
        if (allMode) {
          var extras0 = beaches.slice();
          beaches = nearbyBeaches.slice();
          mergeBeaches(extras0);
        } else {
          beaches = nearbyBeaches.slice();
        }
        paintBeaches(beaches);
        btnSun.disabled = false;
        if (btnAll) btnAll.disabled = false;
        var n0 = beachesForMode(nearbyBeaches).length;
        setStatus((n0 === 1 ? "1 beach nearby. " : n0 + " beaches nearby. ") + "Checking the sun…");
        return fetchCurrentWeather(list).then(function (wx) {
          nearbyBeaches = wx.slice();
          if (allMode) {
            var extras = beaches.slice();
            beaches = nearbyBeaches.slice();
            mergeBeaches(extras);
          } else {
            beaches = nearbyBeaches.slice();
          }
          paintBeaches(beaches);
          var visWx = beachesForMode(beaches);
          var nSunny = visWx.filter(isSunnyBeach).length;
          var n = visWx.length;
          var sunBit = nSunny === 0 ? "none look sunny right now" : (nSunny === 1 ? "1 looks sunny" : nSunny + " look sunny");
          var nBit = n === 1 ? "1 beach nearby, " : n + " beaches nearby, ";
          setStatus(nBit + sunBit + ". Hover or tap one for details.");
          maybeLocalBeachForecast();
        }).catch(function (err) {
          console.error(err);
          setStatus("Found beaches, but I couldn't get the weather for them yet.");
        });
      })
      .catch(function (err) {
        console.error(err);
        nearbyBeaches = [];
        if (!allMode) {
          beaches = [];
          paintBeaches([]);
        }
        btnSun.disabled = false;
        if (btnAll) btnAll.disabled = false;
        setStatus(beachDb ? "Couldn't load nearby beaches. Clouds are still up — try Locate me again." : "Couldn't load the beach list. Try a refresh.");
      });
  }

  function locate() {
    if (!navigator.geolocation) {
      waitingForTap = true;
      setStatus("Can't get your location. Tap the map to drop a pin.");
      return;
    }
    setStatus("Finding you…");
    navigator.geolocation.getCurrentPosition(
      function (pos) { loadAround(pos.coords.latitude, pos.coords.longitude); },
      function () {
        waitingForTap = true;
        setStatus("Location is off. Tap the map to drop a pin.");
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 30000 }
    );
  }

  function stopPlay() {
    playSession += 1;
    playBusy = false;
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    btnPlay.textContent = "Play";
    btnPlay.setAttribute("aria-pressed", "false");
    btnPlay.classList.remove("is-on");
    if (playMode) exitPlayMode();
  }

  function startPlay() {
    if (playTimer || playBusy) return;
    btnPlay.textContent = "Pause";
    btnPlay.setAttribute("aria-pressed", "true");
    btnPlay.classList.add("is-on");
    enterPlayMode();
    var session = ++playSession;
    var holdTarget = null;
    function schedule(ms) {
      if (playSession !== session) return;
      playTimer = setTimeout(tick, ms);
    }
    function tick() {
      playTimer = null;
      if (playSession !== session || tabHidden) return;
      var next;
      if (holdTarget != null) {
        next = holdTarget;
      } else {
        next = cloudIndex + FRAME_PLAY_STEP;
      }
      if (cloudIndex >= sliderMax() && holdTarget == null) {
        stopPlay();
        setCloudFrame(sliderMax(), { forceHires: true });
        return;
      }
      if (next >= sliderMax()) next = sliderMax();
      playBusy = true;
      var t0 = Date.now();
      setCloudFrame(next).then(function (shown) {
        playBusy = false;
        if (playSession !== session) return;
        if (!shown) {
          /* HOLD visible frame; retry the same target index */
          holdTarget = next;
          schedule(400);
          return;
        }
        holdTarget = null;
        if (cloudIndex >= sliderMax()) {
          stopPlay();
          setCloudFrame(sliderMax(), { forceHires: true });
          return;
        }
        /* Min dwell after reveal; next frame already prefetching into LRU */
        void t0;
        schedule(PLAY_DWELL_MS);
      }).catch(function () {
        playBusy = false;
        if (playSession === session) {
          holdTarget = next;
          schedule(400);
        }
      });
    }
    /* Probe WMS CORS once, show current frame, then animate */
    testWmsCors().then(function () {
      if (playSession !== session) return;
      setCloudFrame(cloudIndex).then(function () {
        if (playSession !== session) return;
        prefetchPlayIndices(cloudIndex);
        schedule(80);
      });
    });
  }

  function togglePlay() {
    if (playTimer || playBusy || btnPlay.getAttribute("aria-pressed") === "true") {
      stopPlay();
      return;
    }
    startPlay();
  }

  map.on("zoomend", function () {
    if (playMode) {
      onPlayViewChanged();
      return;
    }
    syncCloudMap(true);
    applyHires();
  });

  map.on("move", function () {
    if (!playMode) syncCloudMap(false);
  });

  map.on("resize", function () {
    if (playMode) {
      onPlayViewChanged();
      return;
    }
    if (cloudMap) {
      try { cloudMap.resize(); } catch (eR) {}
      syncCloudMap(true);
    }
  });

  map.on("moveend", function () {
    if (playMode) {
      /* debounced inside onPlayViewChanged; keeps last image visible */
      onPlayViewChanged();
    } else {
      syncCloudMap(true);
    }
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = setTimeout(function () {
      paintBeaches(beaches);
      if (allMode) {
        loadViewBeaches();
      } else {
        /* On-demand: warm cells under the view without full-planet fetch */
        try {
          var qb = viewBbox();
          ensureRegionsForBbox(qb.south, qb.north, qb.west, qb.east, true).catch(function () {});
        } catch (eMove) {}
      }
      maybeIdlePrefetchRing();
    }, 180);
  });

  map.on("load", function () {
    cloudTimes = buildCloudTimes();
    slider.min = "0";
    slider.max = String(sliderMax());
    slider.value = String(sliderMax());
    ensureBeachLayers();
    applyCloudSolidMode();
    setBasemapMode(basemapMode);
    if (overlayVisible()) restackOverlay();
    ensureCloudMap();
    var cloudsBooted = false;
    function bootClouds() {
      if (cloudsBooted) return;
      cloudsBooted = true;
      syncCloudMap(true);
      var url = gibsTiles(cloudTimes[cloudTimes.length - 1], origin ? origin.lon : -79);
      addGibsStatic(url);
      setCloudFrame(sliderMax());
      applyBaseMap();
    }
    if (cloudMap) {
      cloudMap.once("load", bootClouds);
      try {
        if ((cloudMap.loaded && cloudMap.loaded()) || (cloudMap.isStyleLoaded && cloudMap.isStyleLoaded())) {
          bootClouds();
        }
      } catch (eBoot) {}
    } else {
      bootClouds();
    }
    loadBeachDb({ quiet: true, lat: DEFAULT_WARM_LAT, lon: DEFAULT_WARM_LON }).catch(function () {});
    locate();
  });

  map.on("idle", function () {
    maybeIdlePrefetchRing();
  });

  ["beaches-fill", "beaches-line", "beaches-dot"].forEach(function (layer) {
    map.on("mousemove", layer, onBeachEnter);
    map.on("mouseleave", layer, onBeachLeave);
    map.on("click", layer, function (e) {
      if (!e.features || !e.features.length) return;
      var b = beachById(e.features[0].properties.id);
      if (!b) return;
      if (dwellTimer) clearTimeout(dwellTimer);
      enrichBeach(b);
    });
  });

  map.on("click", function (e) {
    if (!waitingForTap) return;
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
    toggleSunny.addEventListener("change", function () {
      wxSearchGen += 1;
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
  slider.addEventListener("input", function () {
    stopPlay();
    setCloudFrame(clampIndex(slider.value), { forceHires: true });
  });
  slider.addEventListener("change", function () {
    setCloudFrame(clampIndex(slider.value), { forceHires: true });
  });
  cloudOpacityEl.addEventListener("input", function () {
    cloudOpacity = Math.max(0, Math.min(1, Number(cloudOpacityEl.value) / 100));
    applyCloudOpacity();
  });
  toggleMap.addEventListener("change", function () {
    restackOverlay();
  });
  (function bindBasemapSeg() {
    var seg = document.getElementById("basemap-seg");
    if (!seg) return;
    seg.addEventListener("click", function (e) {
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
    toggleIntl.addEventListener("change", function () {
      if (!isIntl()) {
        ensureHomeCountry().then(function () {
          setStatus("International off. Staying in " + countryLabel() + ".");
          beaches = beachesForMode(beaches);
          nearbyBeaches = beachesForMode(nearbyBeaches);
          paintBeaches(beaches);
          if (allMode) loadViewBeaches();
        });
        return;
      }
      ensureHomeCountry().then(function () {
        if (homeCountry) {
          setStatus("International on. I'll skip " + countryLabel() + ".");
        } else {
          setStatus("International on. I don't know your country yet — hit Locate me first.");
        }
        if (allMode) loadViewBeaches();
      });
    });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      tabHidden = true;
      if (playTimer || playMode) {
        resumePlay = true;
        stopPlay();
      }
      try {
        if (map && typeof map.stop === "function") map.stop();
        if (cloudMap && typeof cloudMap.stop === "function") cloudMap.stop();
      } catch (eStop) {}
    } else {
      tabHidden = false;
      try {
        if (map && typeof map.resume === "function") map.resume();
        if (cloudMap && typeof cloudMap.resume === "function") cloudMap.resume();
        syncCloudMap(true);
        setCloudFrame(cloudIndex);
        if (map && typeof map.triggerRepaint === "function") map.triggerRepaint();
        if (cloudMap && typeof cloudMap.triggerRepaint === "function") cloudMap.triggerRepaint();
      } catch (eRes) {}
      if (resumePlay) {
        resumePlay = false;
        startPlay();
      }
    }
  });

  try {
    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      try {
        navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then(function (reg) {
          try { reg.update(); } catch (eUp) {}
        }).catch(function () {});
      } catch (eSw) {}
    }
  } catch (eSw) {}

  } /* end startSunny */

  if (typeof maplibregl !== "undefined") {
    startSunny();
  } else {
    loadScript("vendor/maplibre-gl.js?v=opt9c").then(startSunny).catch(function () {
      var st = document.getElementById("status");
      if (st) st.textContent = "Map toolkit failed to load. Try a refresh.";
    });
  }
})();
