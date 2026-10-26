// workspace/whereisthesun/app-wind-data.js
/* SUNNY app, part 10 of 14: area loading and wind data fetch.
 * Names here are page-wide and shared by every app-*.js file; startSunny in app.js runs each part's step in order. */
"use strict";
var WIND_CACHE_TTL_MS, WIND_COLS, WIND_ROWS, WIND_BATCH, WIND_MOVE_DEBOUNCE_MS, windLayerEl, windCanvas, windCtx;
var windField, windCache, windParticles, windRaf, windLastTs, windAccumMs, WIND_FRAME_MS, windFetchGen;
var windMoveTimer, windFetchPromise, windDpr, windMoving, windNeedsReseed, windSpawnCursor, windGrid, windFieldWaiting;
var windCellCounts;
  function loadAround(lat, lon) {
    sunnyApp_origin = { lat: lat, lon: lon };
    document.dispatchEvent(new CustomEvent("sunny-origin"));
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
    ensureHomeCountry().then(() => {
      var only = homeOnlyCode();
      return ensureRegionsFor(lat, lon, 150).then(() => {
        return fetchBeaches(lat, lon, null, null, null, null, null, null, only);
      });
    }).then((list) => {
        var home = homeOnlyCode();
        if (home && list) {
          list.forEach((b) => {
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
        return fetchCurrentWeather(list).then((wx) => {
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
        }).catch((err) => {
          var msg = (err && err.message) ? String(err.message) : "weather";
          console.warn("Weather:", msg);
          setStatus("Found beaches, but I couldn't get the weather for them yet.");
        });
      })
      .catch((err) => {
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
  function windParticleCap() {
    try {
      var w = window.innerWidth || 800;
      /* opt55: moderate density — Windy-like, avoid overdraw */
      if (w < 520) return 140;
      if (w < 900) return 220;
      return 320;
    } catch (eC) {
      return 220;
    }
  }
  function ensureWindLayer() {
    var layer = document.getElementById("wind-layer");
    if (!layer || !map) return null;
    try {
      var host = map.getContainer && map.getContainer();
      if (host && layer.parentNode !== host) {
        host.appendChild(layer);
        layer.style.position = "absolute";
        layer.style.inset = "0";
        layer.style.width = "100%";
        layer.style.height = "100%";
        layer.style.zIndex = "3";
        layer.style.pointerEvents = "none";
      }
    } catch (eWl) {}
    windLayerEl = layer;
    var c = document.getElementById("wind-canvas");
    if (!c) {
      c = document.createElement("canvas");
      c.id = "wind-canvas";
      c.setAttribute("aria-hidden", "true");
      layer.appendChild(c);
    }
    windCanvas = c;
    try {
      windCtx = c.getContext("2d", { alpha: true });
    } catch (eCtx) {
      windCtx = c.getContext("2d");
    }
    return layer;
  }
  function syncWindCanvasSize() {
    if (!windCanvas || !map) return;
    var el = map.getContainer ? map.getContainer() : document.getElementById("map");
    if (!el) return;
    var w = el.clientWidth || 1;
    var h = el.clientHeight || 1;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    windDpr = dpr;
    var bw = Math.max(1, Math.round(w * dpr));
    var bh = Math.max(1, Math.round(h * dpr));
    if (windCanvas.width !== bw || windCanvas.height !== bh) {
      windCanvas.width = bw;
      windCanvas.height = bh;
      windCanvas.style.width = w + "px";
      windCanvas.style.height = h + "px";
    }
  }
  function setWindUi(on) {
    windOn = !!on;
    if (toggleWind) toggleWind.checked = windOn;
    var layer = ensureWindLayer();
    if (!layer) return;
    if (windOn) {
      layer.hidden = false;
      layer.classList.add("is-on");
      layer.setAttribute("aria-hidden", "false");
      syncWindCanvasSize();
      scheduleWindFieldRefresh(true);
      startWindAnim();
    } else {
      stopWindAnim();
      layer.classList.remove("is-on");
      layer.hidden = true;
      layer.setAttribute("aria-hidden", "true");
      windParticles = [];
      if (windCtx && windCanvas) {
        try { windCtx.clearRect(0, 0, windCanvas.width, windCanvas.height); } catch (eCl) {}
      }
    }
  }
  function windViewKey() {
    if (!map) return "";
    try {
      var b = map.getBounds();
      var z = Math.round(map.getZoom() * 2) / 2;
      return [
        z.toFixed(1),
        b.getWest().toFixed(2),
        b.getSouth().toFixed(2),
        b.getEast().toFixed(2),
        b.getNorth().toFixed(2)
      ].join("|");
    } catch (eK) {
      return String(Date.now());
    }
  }
  function buildWindSamplePoints() {
    var b = map.getBounds();
    var west = b.getWest();
    var east = b.getEast();
    var south = b.getSouth();
    var north = b.getNorth();
    if (east < west) east += 360;
    var cols = WIND_COLS;
    var rows = WIND_ROWS;
    var dLon = (east - west) / cols;
    var dLat = (north - south) / rows;
    var pts = [];
    var r, c, lat, lon;
    for (r = 0; r < rows; r++) {
      lat = south + (r + 0.5) * dLat;
      for (c = 0; c < cols; c++) {
        lon = west + (c + 0.5) * dLon;
        if (lon > 180) lon -= 360;
        if (lon < -180) lon += 360;
        pts.push({ lat: lat, lon: lon, i: r * cols + c });
      }
    }
    return {
      cols: cols,
      rows: rows,
      west: west,
      south: south,
      dLon: dLon,
      dLat: dLat,
      pts: pts
    };
  }
  /* opt56: use true east/north u,v first; fall back to meteorological FROM */
  function parseWindRow(row) {
    var cur = row && row.current ? row.current : row;
    if (!cur) return null;
    var uRaw = cur.wind_u_component_10m;
    var vRaw = cur.wind_v_component_10m;
    var sp = cur.wind_speed_10m;
    var dir = cur.wind_direction_10m;
    var u, v, speedKmh;
    if (uRaw != null && vRaw != null && isFinite(Number(uRaw)) && isFinite(Number(vRaw))) {
      /* with wind_speed_unit=kmh, Open-Meteo returns u/v in km/h */
      var uKmh = Number(uRaw);
      var vKmh = Number(vRaw);
      u = uKmh / 3.6; /* eastward m/s */
      v = vKmh / 3.6; /* northward m/s */
      if (sp != null && isFinite(Number(sp))) speedKmh = Number(sp);
      else speedKmh = Math.sqrt(uKmh * uKmh + vKmh * vKmh);
    } else if (sp != null && dir != null && isFinite(Number(sp)) && isFinite(Number(dir))) {
      speedKmh = Number(sp);
      var fromDeg = Number(dir);
      var toRad = ((fromDeg + 180) % 360) * Math.PI / 180;
      var speedMs = speedKmh / 3.6;
      u = speedMs * Math.sin(toRad);
      v = speedMs * Math.cos(toRad);
    } else {
      return null;
    }
    if (!isFinite(speedKmh) || !isFinite(u) || !isFinite(v)) return null;
    return { speedKmh: speedKmh, u: u, v: v };
  }
  /* opt56: array-of-objects OR parallel-array single object */
  function normalizeWindApiRows(data) {
    if (data == null) return [];
    if (Array.isArray(data)) return data;
    if (typeof data !== "object") return [];
    if (Array.isArray(data.latitude) && Array.isArray(data.longitude)) {
      var n = Math.min(data.latitude.length, data.longitude.length);
      var curSrc = data.current || data;
      var out = [];
      var i, key, val, cur;
      for (i = 0; i < n; i++) {
        cur = {};
        for (key in curSrc) {
          if (!Object.prototype.hasOwnProperty.call(curSrc, key)) continue;
          if (key === "time" || key === "interval") {
            val = curSrc[key];
            cur[key] = Array.isArray(val) ? val[i] : val;
            continue;
          }
          val = curSrc[key];
          cur[key] = Array.isArray(val) ? val[i] : val;
        }
        out.push({
          latitude: data.latitude[i],
          longitude: data.longitude[i],
          location_id: Array.isArray(data.location_id) ? data.location_id[i] : i,
          current: cur
        });
      }
      return out;
    }
    return [data];
  }
  function windLonLatDist2(aLat, aLon, bLat, bLon) {
    var dLat = aLat - bLat;
    var dLon = aLon - bLon;
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    return dLat * dLat + dLon * dLon;
  }
  /* Map each API sample onto the request grid (lat/lon match when present). */
  function assignWindRowsToGrid(pts, rows) {
    var n = pts.length;
    var assigned = new Array(n);
    var used = [];
    var i, j, best, bestD, d, row, rLat, rLon, hasLL;
    for (i = 0; i < rows.length; i++) used[i] = false;
    for (i = 0; i < n; i++) assigned[i] = null;
    for (i = 0; i < n; i++) {
      best = -1;
      bestD = Infinity;
      for (j = 0; j < rows.length; j++) {
        if (used[j]) continue;
        row = rows[j];
        if (!row) continue;
        rLat = row.latitude != null ? Number(row.latitude) : NaN;
        rLon = row.longitude != null ? Number(row.longitude) : NaN;
        hasLL = isFinite(rLat) && isFinite(rLon);
        if (hasLL) {
          d = windLonLatDist2(pts[i].lat, pts[i].lon, rLat, rLon);
          if (d < bestD) {
            bestD = d;
            best = j;
          }
        }
      }
      if (best >= 0 && bestD < 4) { /* ~2° snap tolerance */
        assigned[i] = rows[best];
        used[best] = true;
      }
    }
    /* fill remaining by index order among unused rows */
    var free = [];
    for (j = 0; j < rows.length; j++) if (!used[j]) free.push(rows[j]);
    var fi = 0;
    for (i = 0; i < n; i++) {
      if (assigned[i] == null && fi < free.length) {
        assigned[i] = free[fi++];
      }
    }
    return assigned;
  }
  function fetchWindBatch(points) {
    if (!points.length) return Promise.resolve([]);
    var lats = points.map((p) => { return p.lat.toFixed(3); }).join(",");
    var lons = points.map((p) => { return p.lon.toFixed(3); }).join(",");
    var url = METEO_URL +
      "?latitude=" + lats +
      "&longitude=" + lons +
      "&current=wind_speed_10m,wind_direction_10m,wind_u_component_10m,wind_v_component_10m" +
      "&wind_speed_unit=kmh";
    return fetchWithTimeout(url, WX_FETCH_TIMEOUT_MS).then(readJsonSafe).then((data) => {
      return normalizeWindApiRows(data);
    });
  }
  function fetchWindFieldForView() {
    if (windGlWanted()) return Promise.resolve({ fixed: true }); /* opt70: wind-field.js owns the data */
    if (!map || !windOn) return Promise.resolve(null);
    var key = windViewKey();
    var cached = windCache[key];
    if (cached && (Date.now() - cached.t) < WIND_CACHE_TTL_MS) {
      windField = cached;
      return Promise.resolve(cached);
    }
    /* reuse nearby cache within TTL if same zoom band */
    var ck;
    for (ck in windCache) {
      if (!Object.prototype.hasOwnProperty.call(windCache, ck)) continue;
      var hit = windCache[ck];
      /* opt59: reuse ONLY if that field actually covers this view (reusing a
         shifted field and clamped to its edge → particles bunched at one side) */
      if (hit && hit.key && hit.key.split("|")[0] === key.split("|")[0] &&
          (Date.now() - hit.t) < WIND_CACHE_TTL_MS &&
          windFieldCoversView(hit)) {
        windField = hit;
        return Promise.resolve(hit);
      }
    }
    if (windFetchPromise) return windFetchPromise;
    var gen = ++windFetchGen;
    var grid = buildWindSamplePoints();
    var pts = grid.pts;
    var batches = [];
    var i;
    for (i = 0; i < pts.length; i += WIND_BATCH) {
      batches.push(pts.slice(i, i + WIND_BATCH));
    }
    windFetchPromise = Promise.all(batches.map((batch) => {
      return fetchWindBatch(batch).catch(() => { return []; });
    })).then((parts) => {
      windFetchPromise = null;
      if (gen !== windFetchGen || !windOn) return windField;
      var flat = [];
      var bi;
      for (bi = 0; bi < parts.length; bi++) {
        var rows = parts[bi] || [];
        var j;
        for (j = 0; j < rows.length; j++) flat.push(rows[j]);
      }
      var mapped = assignWindRowsToGrid(pts, flat);
      var n = grid.cols * grid.rows;
      var u = new Float32Array(n);
      var v = new Float32Array(n);
      var speeds = new Float32Array(n);
      var pi;
      var okMask = new Uint8Array(n);
      var nOk = 0;
      for (pi = 0; pi < pts.length; pi++) {
        var parsed = parseWindRow(mapped[pi]);
        if (!parsed) continue;
        var idx = pts[pi].i;
        u[idx] = parsed.u;
        v[idx] = parsed.v;
        speeds[idx] = parsed.speedKmh;
        okMask[idx] = 1;
        nOk += 1;
      }
      /* opt59: failed/limited fetch → no data. Never cache an all-calm fake field. */
      if (nOk === 0) {
        try { setStatus("Wind data unavailable right now (Open-Meteo) — will retry."); } catch (eNo) {}
        return windField;
      }
      /* partial batch failure: fill gaps from nearest valid samples (no fake calm holes) */
      if (nOk < n) {
        var gi, gj, best, bestD, dd, gc = grid.cols;
        for (gi = 0; gi < n; gi++) {
          if (okMask[gi]) continue;
          best = -1; bestD = Infinity;
          for (gj = 0; gj < n; gj++) {
            if (!okMask[gj]) continue;
            dd = Math.pow((gi % gc) - (gj % gc), 2) + Math.pow(Math.floor(gi / gc) - Math.floor(gj / gc), 2);
            if (dd < bestD) { bestD = dd; best = gj; }
          }
          if (best >= 0) { u[gi] = u[best]; v[gi] = v[best]; speeds[gi] = speeds[best]; }
        }
      }
      var field = {
        key: key,
        cols: grid.cols,
        rows: grid.rows,
        west: grid.west,
        south: grid.south,
        dLon: grid.dLon,
        dLat: grid.dLat,
        u: u,
        v: v,
        speeds: speeds,
        t: Date.now()
      };
      windCache[key] = field;
      /* prune expired cache entries */
      var keys = Object.keys(windCache);
      if (keys.length > 12) {
        keys.sort((a, b) => { return windCache[a].t - windCache[b].t; });
        var drop;
        for (drop = 0; drop < keys.length - 8; drop++) delete windCache[keys[drop]];
      }
      windField = field;
      if (windFieldCoversView(field) && (windNeedsReseed || !windParticles.length)) seedWindParticles(true);
      return field;
    }).catch(() => {
      windFetchPromise = null;
      return windField;
    });
    return windFetchPromise;
  }
  function scheduleWindFieldRefresh(immediate) {
    if (windGl || windGlWanted()) return; /* opt70: fixed field, no reseed or refetch on gestures */
    if (!windOn) return;
    if (windMoveTimer) {
      clearTimeout(windMoveTimer);
      windMoveTimer = null;
    }
    var run = () => {
      windMoveTimer = null;
      if (!windOn || tabHidden || mapGesturing) return;
      fetchWindFieldForView().then((field) => {
        if (!windOn || tabHidden) return;
        if (!field || !windFieldCoversView(field)) {
          if (!field) {
            try { setStatus("Wind field empty — try again in a moment."); } catch (eEmpty2) {}
          }
          /* opt59: slow retry so a failed/limited fetch recovers without a map move */
          if (!windMoveTimer) windMoveTimer = setTimeout(run, 20000);
          return;
        }
        startWindAnim();
      });
    };
    if (immediate) run();
    else windMoveTimer = setTimeout(run, WIND_MOVE_DEBOUNCE_MS);
  }
  /* opt59: field extent in lon/lat; cell centers at west+(c+0.5)*dLon */
  function windLonRel(lon, west) {
    var r = (lon - west) % 360;
    if (r < 0) r += 360;
    return r;
  }
  function windFieldCoversView(f) {
    if (!f || !map) return false;
    try {
      var b = map.getBounds();
      var west = b.getWest();
      var east = b.getEast();
      if (east < west) east += 360;
      var spanF = f.cols * f.dLon;
      var tolLon = f.dLon * 0.35;
      var tolLat = f.dLat * 0.35;
      if (east - west > spanF + 2 * tolLon) return false;
      var w0 = windLonRel(west, f.west);
      if (w0 > 360 - tolLon) w0 -= 360;
      if (w0 < -tolLon) return false;
      if (w0 + (east - west) > spanF + tolLon) return false;
      var fSouth = f.south;
      var fNorth = f.south + f.rows * f.dLat;
      if (b.getSouth() < fSouth - tolLat || b.getNorth() > fNorth + tolLat) return false;
      return true;
    } catch (eCv) {
      return false;
    }
  }
  function sampleWindUV(lon, lat) {
    /* Bilinear on cell centers; returns null outside the fetched field (no edge clamp) */
    var f = windField;
    if (!f) return null;
    var lr = windLonRel(lon, f.west);
    var spanF = f.cols * f.dLon;
    if (lr > spanF + f.dLon * 0.5 && lr > 360 - f.dLon * 0.5) lr -= 360;
    var x = lr / f.dLon - 0.5;
    var y = (lat - f.south) / f.dLat - 0.5;
    if (x < -1 || y < -1 || x > f.cols || y > f.rows) return null;
    /* half-cell rim inside the field extent: hold the edge sample (still real data) */
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x > f.cols - 1) x = f.cols - 1;
    if (y > f.rows - 1) y = f.rows - 1;
    var x0 = Math.floor(x);
    var y0 = Math.floor(y);
    var x1 = Math.min(f.cols - 1, x0 + 1);
    var y1 = Math.min(f.rows - 1, y0 + 1);
    var tx = x - x0;
    var ty = y - y0;
    var i00 = y0 * f.cols + x0, i10 = y0 * f.cols + x1, i01 = y1 * f.cols + x0, i11 = y1 * f.cols + x1;
    var w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
    var u = w00 * f.u[i00] + w10 * f.u[i10] + w01 * f.u[i01] + w11 * f.u[i11];
    var v = w00 * f.v[i00] + w10 * f.v[i10] + w01 * f.v[i01] + w11 * f.v[i11];
    var sp = w00 * f.speeds[i00] + w10 * f.speeds[i10] + w01 * f.speeds[i01] + w11 * f.speeds[i11];
    return { u: u, v: v, speed: sp };
  }
  function windViewCss() {
    var el = map && map.getContainer ? map.getContainer() : document.getElementById("map");
    return { w: (el && el.clientWidth) || 800, h: (el && el.clientHeight) || 600 };
  }
  function buildWindGrid(n) {
    /* Stratified strata ≈ n cells over the viewport (aspect-aware) */
    var v = windViewCss();
    var cols = Math.max(1, Math.round(Math.sqrt(n * v.w / Math.max(1, v.h))));
    var rows = Math.max(1, Math.round(n / cols));
    windGrid = { cols: cols, rows: rows, cw: v.w / cols, ch: v.h / rows, w: v.w, h: v.h };
    windSpawnCursor = Math.floor(Math.random() * cols * rows);
    return windGrid;
  }
  function stratifiedSpawn(p, cellIdx) {
    var g = windGrid;
    if (!g) g = buildWindGrid(windParticleCap());
    var n = g.cols * g.rows;
    var ci;
    if (cellIdx == null && windCellCounts && windCellCounts.length === n) {
      /* least-populated stratum (random scan start) → density stays even even though
         wind drains the upwind edge and piles into convergence zones */
      var start = Math.floor(Math.random() * n);
      var best = start, bestC = Infinity, k, idx;
      for (k = 0; k < n; k++) {
        idx = (start + k) % n;
        if (windCellCounts[idx] < bestC) { bestC = windCellCounts[idx]; best = idx; if (bestC === 0) break; }
      }
      ci = best;
      windCellCounts[ci] += 1;
    } else if (cellIdx == null) {
      /* golden-ratio stride over cells → even coverage over time, no clumping */
      windSpawnCursor = (windSpawnCursor + Math.max(1, Math.round(n * 0.618034))) % n;
      ci = windSpawnCursor;
    } else {
      ci = cellIdx % n;
    }
    var cx = ci % g.cols;
    var cy = Math.floor(ci / g.cols);
    p.x = (cx + Math.random()) * g.cw;
    p.y = (cy + Math.random()) * g.ch;
    p.age = 0;
    p.life = 1.8 + Math.random() * 2.8;
  }
function sunnyStep10() {
  /* === BEGIN WIND LINES (opt53–opt56) — Open-Meteo Windy-style particles === */
  WIND_CACHE_TTL_MS = 8 * 60 * 1000;
  WIND_COLS = 10;
  WIND_ROWS = 7;
  WIND_BATCH = 24;
  WIND_MOVE_DEBOUNCE_MS = 380;
  windLayerEl = null;
  windCanvas = null;
  windCtx = null;
  windField = null; /* {cols,rows,west,south,dLon,dLat,u[],v[],speeds[],t,key} */
  windCache = Object.create(null);
  windParticles = [];
  windRaf = 0;
  windLastTs = 0;
  windAccumMs = 0; /* opt55/56: rAF throttle accumulator */
  WIND_FRAME_MS = 1000 / 28; /* ~28fps cheap smoothness */
  windFetchGen = 0;
  windMoveTimer = null;
  windFetchPromise = null;
  windDpr = 1;
  /* opt59: screen-space particles; hold during gestures; stratified respawn */
  windMoving = false;
  windNeedsReseed = true;
  windSpawnCursor = 0;
  windGrid = null; /* {cols,rows,cw,ch,w,h} CSS px strata */
  windFieldWaiting = false;
  windCellCounts = null; /* per-frame stratum occupancy for even respawn */
}
