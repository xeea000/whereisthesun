/* SUNNY — MapLibre + NASA GIBS GOES GeoColor + Open-Meteo + local OSM beaches. No keys. */
(function () {
  "use strict";

  var BEACH_RADIUS_M = 50000;
  var BEACH_CAP = 60;
  var SUNNY_CLOUD = 40;
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
  var btnNear = document.getElementById("btn-near");
  var btnAll = document.getElementById("btn-all");
  var btnSun = document.getElementById("btn-sun");
  var sunnySheet = document.getElementById("sunny-sheet");
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
  var wikiCache = {};
  var cloudOpacity = 0.88;
  var searchingSunny = false;
  var overlayIds = ["ov-road-casing", "ov-road", "ov-road-name", "ov-place"];
  var lastGibsUrl = null;
  var allMode = false;
  var nearbyBeaches = [];
  var viewGen = 0;
  var moveTimer = null;
  var viewAbort = null;
  var resumePlay = false;
  var beachDb = null;
  var beachDbPromise = null;
  var WX_BATCH = 60;

  var lastPaintKey = "";
  var overlayReady = false;
  var hoverThrottle = 0;

  var map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "&copy; OpenStreetMap",
          maxzoom: 19
        }
      },
      layers: [{ id: "osm", type: "raster", source: "osm" }]
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

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.addControl(
    new maplibregl.AttributionControl({ compact: true, customAttribution: "NASA GIBS / NOAA GOES · Open-Meteo" }),
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

  function applyHires() {
    var z = map.getZoom();
    var atNow = !cloudTimes.length || cloudIndex >= sliderMax();
    var wantSharp = atNow && z >= 5.6;
    var sharp = wantSharp ? Math.min(0.94, cloudOpacity) : 0;
    if (wantSharp) {
      addHiresSources();
      if (map.getLayer("modis")) {
        map.setLayoutProperty("modis", "visibility", "visible");
        map.setPaintProperty("modis", "raster-opacity", sharp);
      }
      if (map.getLayer("iem-vis")) {
        var vis = z >= 8 ? Math.min(0.28, cloudOpacity) : 0;
        map.setLayoutProperty("iem-vis", "visibility", vis > 0 ? "visible" : "none");
        map.setPaintProperty("iem-vis", "raster-opacity", vis);
      }
    } else {
      if (map.getLayer("modis")) {
        map.setLayoutProperty("modis", "visibility", "none");
        map.setPaintProperty("modis", "raster-opacity", 0);
      }
      if (map.getLayer("iem-vis")) {
        map.setLayoutProperty("iem-vis", "visibility", "none");
        map.setPaintProperty("iem-vis", "raster-opacity", 0);
      }
    }
    if (map.getLayer("gibs")) {
      map.setPaintProperty("gibs", "raster-opacity", wantSharp ? cloudOpacity * 0.42 : cloudOpacity);
    }
  }

  function applyBaseMap() {
    if (!map.getLayer("osm")) return;
    var hide = cloudOpacity >= 0.35 && !overlayVisible();
    map.setLayoutProperty("osm", "visibility", hide ? "none" : "visible");
  }

  function applyCloudOpacity() {
    applyHires();
    applyBaseMap();
  }

  function setCloudFrame(i) {
    if (!cloudTimes.length) return;
    cloudIndex = clampIndex(i);
    slider.min = "0";
    slider.max = String(sliderMax());
    slider.value = String(cloudIndex);
    var iso = cloudTimes[cloudIndex];
    var suffix = cloudIndex >= sliderMax() ? " · NOW" : "";
    timeLabel.textContent = formatFrameLabel(iso) + suffix;
    var url = gibsTiles(iso, origin ? origin.lon : null);
    if (url !== lastGibsUrl) {
      lastGibsUrl = url;
      var src = map.getSource("gibs");
      if (src && typeof src.setTiles === "function") {
        src.setTiles([url]);
      } else if (map.isStyleLoaded()) {
        addGibsSource(url);
      }
    }
    var vis = map.getSource("iem-vis");
    var visUrl = iemVisTiles(origin ? origin.lon : null);
    if (vis && typeof vis.setTiles === "function") vis.setTiles([visUrl]);
    applyHires();
  }

  function addHiresSources() {
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
        paint: { "raster-opacity": 0, "raster-resampling": "linear", "raster-fade-duration": 0 }
      }, before);
    }
    if (!map.getLayer("iem-vis")) {
      map.addLayer({
        id: "iem-vis",
        type: "raster",
        source: "iem-vis",
        paint: { "raster-opacity": 0, "raster-resampling": "linear", "raster-fade-duration": 0 }
      }, before);
    }
  }

  function addGibsSource(url) {
    if (map.getLayer("gibs")) map.removeLayer("gibs");
    if (map.getSource("gibs")) map.removeSource("gibs");
    map.addSource("gibs", {
      type: "raster",
      tiles: [url],
      tileSize: 256,
      maxzoom: 7,
      attribution: "NASA GIBS / NOAA GOES"
    });
    var before = map.getLayer("modis") ? "modis" : (map.getLayer("beaches-fill") ? "beaches-fill" : undefined);
    map.addLayer({
      id: "gibs",
      type: "raster",
      source: "gibs",
      paint: { "raster-opacity": cloudOpacity, "raster-resampling": "linear", "raster-fade-duration": 0 }
    }, before);
    applyHires();
    if (overlayVisible()) restackOverlay();
  }


  function overlayVisible() {
    return !!(toggleMap && toggleMap.checked);
  }

  function restackOverlay() {
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
    var out = [];
    var i, r, lat, lon, name, country, id;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      if (!r) continue;
      if (Array.isArray(r)) {
        id = r[0] != null ? String(r[0]) : ("b/" + i);
        name = r[1] == null ? "" : String(r[1]).trim();
        lat = Number(r[2]);
        lon = Number(r[3]);
        country = r[4] == null || r[4] === "" ? null : String(r[4]).toUpperCase().slice(0, 2);
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
      out.push({ id: id, name: name, lat: lat, lon: lon, country: country });
    }
    return out;
  }

  function fetchJsonGzip(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("beach list");
      if (typeof DecompressionStream === "undefined") throw new Error("no decompress");
      return new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).json();
    });
  }

  function loadBeachDb() {
    if (beachDb) return Promise.resolve(beachDb);
    if (beachDbPromise) return beachDbPromise;
    function fromJson() {
      return fetch("data/beaches.json").then(function (res) {
        if (!res.ok) throw new Error("beach list");
        return res.json();
      });
    }
    function fromShards() {
      return fetch("data/manifest.json").then(function (res) {
        if (!res.ok) throw new Error("beach list");
        return res.json();
      }).then(function (files) {
        return Promise.all((files || []).map(function (f) {
          return fetch(f).then(function (res) {
            if (!res.ok) throw new Error("beach list");
            return res.json();
          });
        }));
      }).then(function (parts) {
        var rows = [];
        var i;
        for (i = 0; i < parts.length; i++) {
          if (Array.isArray(parts[i])) rows.push.apply(rows, parts[i]);
        }
        return rows;
      });
    }
    var start = (typeof DecompressionStream === "undefined")
      ? fromJson().catch(fromShards)
      : fetchJsonGzip("data/beaches.json.gz").catch(fromJson).catch(fromShards);
    beachDbPromise = start.then(function (data) {
      beachDb = parseBeachDb(data);
      return beachDb;
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
    return loadBeachDb().then(function (db) {
      abortIf(signal);
      var list = [];
      var i, row, country, distM, b;
      for (i = 0; i < db.length; i++) {
        row = db[i];
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

  function fetchCurrentWeather(points) {
    if (!points.length) return Promise.resolve([]);
    var lats = points.map(function (p) { return p.lat.toFixed(4); }).join(",");
    var lons = points.map(function (p) { return p.lon.toFixed(4); }).join(",");
    var url = METEO_URL + "?latitude=" + lats + "&longitude=" + lons + "&current=cloud_cover,uv_index,is_day";
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("Open-Meteo HTTP " + res.status);
      return res.json();
    }).then(function (data) {
      var rows = Array.isArray(data) ? data : [data];
      if (rows.length !== points.length) throw new Error("Open-Meteo count mismatch");
      return rows.map(function (row, i) {
        return Object.assign({}, points[i], parseCurrent(row));
      });
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

  function paintBeaches(list) {
    ensureBeachLayers();
    var vis = cullToView(beachesForMode(list || beaches));
    var z = 3;
    try { z = map.getZoom(); } catch (eZ) {}
    var usePoint = z < 9;
    var key = vis.map(function (b) { return String(b.id); }).join(",") + "|" + (usePoint ? "pt" : "poly");
    if (key === lastPaintKey) return;
    lastPaintKey = key;
    var features = vis.map(function (b) {
      var geom = b.geom;
      if (usePoint || !geom) {
        geom = { type: "Point", coordinates: [b.lon, b.lat] };
      }
      return {
        type: "Feature",
        id: b.id,
        properties: { id: String(b.id) },
        geometry: geom
      };
    });
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
    var i, sid = String(id);
    for (i = 0; i < beaches.length; i++) if (String(beaches[i].id) === sid) return beaches[i];
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

  function enrichBeach(b) {
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
    sunny.sort(function (a, b) { return a.dist - b.dist; });
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
    enrichBeach(b).then(function () {
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
    if (btnNear) btnNear.disabled = false;
    if (btnAll) btnAll.disabled = false;
  }

  function filterSunnyRows(list, assumeForeign) {
    var rows = list || [];
    if (isIntl()) {
      rows = rows.filter(function (b) { return isForeignBeach(b, assumeForeign); });
    } else {
      rows = beachesForMode(rows);
    }
    return rows.filter(isSunnyBeach).sort(function (a, b) { return a.dist - b.dist; });
  }

  function weatherCollectSunny(list, assumeForeign, wantCount) {
    var want = wantCount || SUNNY_PICK_CAP;
    var found = [];
    var i = 0;
    function step() {
      if (found.length >= want || i >= list.length) {
        found.sort(function (a, b) { return a.dist - b.dist; });
        return Promise.resolve(found.slice(0, want));
      }
      var chunk = list.slice(i, i + WX_BATCH);
      i += WX_BATCH;
      setStatus("Checking the sun… " + Math.min(i, list.length) + "/" + list.length);
      return fetchCurrentWeather(chunk).then(function (wx) {
        filterSunnyRows(wx, assumeForeign).forEach(function (b) {
          if (found.length >= want) return;
          if (found.some(function (x) { return x.id === b.id; })) return;
          found.push(b);
        });
        return step();
      }).catch(function (err) {
        console.error(err);
        return step();
      });
    }
    return step();
  }

  function closeSunnySheet() {
    if (!sunnySheet) return;
    sunnySheet.hidden = true;
    if (sunnySheetList) sunnySheetList.innerHTML = "";
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
    finishBeach(b, "sunny");
  }

  function openSunnySheet(list) {
    if (!sunnySheet || !sunnySheetList) {
      if (list && list[0]) finishBeach(list[0], "sunny");
      return;
    }
    sunnySheetList.innerHTML = "";
    if (sunnySheetSub) {
      sunnySheetSub.textContent = list.length === 1
        ? "1 sunny beach. Tap to show on map."
        : list.length + " sunny beaches. Tap one, map stays live.";
    }
    list.forEach(function (b, idx) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sheet-item";
      var cloud = b.cloud != null ? Math.round(b.cloud) + "% cloudy" : "sunny";
      btn.innerHTML = "<span>" + escapeHtml(b.name || "Beach") + "</span>" +
        "<span class=\"dist\">" + escapeHtml(formatKm(b.dist)) + "</span>" +
        "<span class=\"meta\">#" + (idx + 1) + " · " + escapeHtml(cloud) + "</span>";
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

  function searchBeachesFar(wantSunny) {
    var radii = searchRadii();
    var maxR = radii[radii.length - 1];
    var only = homeOnlyCode();
    var code = only ? null : excludeCode();
    var where = isIntl() ? " outside " + countryLabel() : "";
    var km = Math.round(maxR / 1000);
    setStatus((wantSunny ? "No sun close by. " : "") + "Looking" + where + ", within " + km + " km…");
    fetchBeaches(origin.lat, origin.lon, maxR, false, code, null, 400, null, only)
      .then(function (list) {
        if (!wantSunny) {
          var near = pickNearestBeachFrom(list, true);
          unlockSearch();
          if (near) finishBeach(near, "near");
          else setStatus("Couldn't find a beach" + where + " within " + km + " km.");
          return;
        }
        if (!list || !list.length) {
          unlockSearch();
          setStatus("Couldn't find a sunny beach" + where + " within " + km + " km right now.");
          return;
        }
        return weatherCollectSunny(list, true, SUNNY_PICK_CAP).then(function (rows) {
          unlockSearch();
          if (rows && rows.length) {
            setStatus(rows.length === 1 ? "1 sunny beach found." : rows.length + " sunny beaches found. Pick one.");
            openSunnySheet(rows);
          } else {
            setStatus("Couldn't find a sunny beach" + where + " within " + km + " km right now.");
          }
        });
      })
      .catch(function (err) {
        console.error(err);
        unlockSearch();
        if (!beachDb) return;
        if (wantSunny) {
          setStatus("Couldn't find a sunny beach" + where + " within " + km + " km right now.");
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

  function goNearestBeach() {
    if (!origin || searchingSunny) return;
    ensureHomeCountry().then(function () {
      var b = pickNearestBeachFrom(nearbyBeaches, false);
      if (b) {
        finishBeach(b, "near");
        return;
      }
      searchingSunny = true;
      btnSun.disabled = true;
      if (btnNear) btnNear.disabled = true;
      searchBeachesFar(false);
    });
  }

  function goNearestSunny() {
    if (!origin || searchingSunny) return;
    ensureHomeCountry().then(function () {
      var localSunny = filterSunnyRows(nearbyBeaches, false);
      if (localSunny.length >= 3) {
        setStatus(localSunny.length + " sunny beaches nearby. Pick one.");
        openSunnySheet(localSunny.slice(0, SUNNY_PICK_CAP));
        return;
      }
      searchingSunny = true;
      btnSun.disabled = true;
      if (btnNear) btnNear.disabled = true;
      if (localSunny.length) {
        setStatus("Found " + localSunny.length + " nearby. Looking farther for more…");
      }
      searchBeachesFar(true);
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
    if (btnNear) btnNear.disabled = true;
    beaches = [];
    nearbyBeaches = [];
    hourlyCache = {};
    placeUserMarker();
    placeDest(null);
    if (popup) { popup.remove(); popup = null; }
    map.flyTo({ center: [lon, lat], zoom: 9.2, speed: 1.2 });
    setStatus("Finding clouds and beaches…");
    ensureBeachLayers();
    setCloudFrame(cloudTimes.length ? cloudTimes.length - 1 : 0);

    ensureHomeCountry().then(function () {
      var only = homeOnlyCode();
      return fetchBeaches(lat, lon, null, null, null, null, null, null, only);
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
          if (btnNear) btnNear.disabled = false;
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
        if (btnNear) btnNear.disabled = false;
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
        if (btnNear) btnNear.disabled = false;
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
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
    btnPlay.textContent = "Play";
    btnPlay.setAttribute("aria-pressed", "false");
    btnPlay.classList.remove("is-on");
  }

  function startPlay() {
    if (playTimer) return;
    btnPlay.textContent = "Pause";
    btnPlay.setAttribute("aria-pressed", "true");
    btnPlay.classList.add("is-on");
    playTimer = setInterval(function () {
      var next = cloudIndex + 1;
      if (next > sliderMax()) {
        setCloudFrame(sliderMax());
        stopPlay();
        return;
      }
      setCloudFrame(next);
    }, PLAY_MS);
  }

  function togglePlay() {
    if (playTimer) { stopPlay(); return; }
    startPlay();
  }

  map.on("zoomend", applyHires);

  map.on("moveend", function () {
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = setTimeout(function () {
      paintBeaches(beaches);
      if (allMode) loadViewBeaches();
    }, 180);
  });

  map.on("load", function () {
    cloudTimes = buildCloudTimes();
    slider.min = "0";
    slider.max = String(sliderMax());
    slider.value = String(sliderMax());
    ensureBeachLayers();
    if (overlayVisible()) restackOverlay();
    setCloudFrame(sliderMax());
    applyBaseMap();
    locate();
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
  if (btnNear) btnNear.addEventListener("click", goNearestBeach);
  btnSun.addEventListener("click", goNearestSunny);
  if (sunnySheetClose) sunnySheetClose.addEventListener("click", closeSunnySheet);
  btnPlay.addEventListener("click", togglePlay);
  slider.addEventListener("input", function () {
    stopPlay();
    setCloudFrame(clampIndex(slider.value));
  });
  slider.addEventListener("change", function () {
    setCloudFrame(clampIndex(slider.value));
  });
  cloudOpacityEl.addEventListener("input", function () {
    cloudOpacity = Math.max(0, Math.min(1, Number(cloudOpacityEl.value) / 100));
    applyCloudOpacity();
  });
  toggleMap.addEventListener("change", function () {
    restackOverlay();
    applyBaseMap();
  });
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
      if (playTimer) {
        resumePlay = true;
        stopPlay();
      }
    } else if (resumePlay) {
      resumePlay = false;
      startPlay();
    }
  });
})();
