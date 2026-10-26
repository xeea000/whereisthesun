// workspace/whereisthesun/app-beach-fetch.js
/* SUNNY app, part 8 of 14: beach regions, beach fetch and current weather.
 * Names here are page-wide and shared by every app-*.js file; startSunny in app.js runs each part's step in order. */
"use strict";
  function ensureRegionsForBbox(south, north, west, east, quiet) {
    if (beachDbComplete && beachDb) return Promise.resolve(beachDb);
    return loadBeachManifest().then((manifest) => {
      if (manifest.regions && manifest.regions.length) {
        var regs = pickRegionsForBbox(south, north, west, east, 1);
        return ensureRegionsList(regs, quiet ? null : "Loading beaches for this area…");
      }
      return ensureRegionsFor((south + north) / 2, (west + east) / 2, 200);
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
    if ((lat == null || lon == null) && sunnyApp_origin) {
      lat = sunnyApp_origin.lat;
      lon = sunnyApp_origin.lon;
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
        .catch(() => {
          return fetch("data/beaches.json").then((res) => {
            if (!res.ok) throw new Error("beach list");
            return res.json();
          });
        })
        .then((data) => {
          mergeBeachRows(data);
          beachDbComplete = true;
          idbPutBeachRowsLegacy(toCompactRows(beachDb)).catch(() => {});
          return beachDb;
        });
    }
    function priorityThenBackground() {
      dbStatus("Loading beaches for this area…");
      return ensureRegionsFor(lat, lon, 150).then((db) => {
        return db || beachDb || [];
      }).catch((err) => {
        console.error(err);
        return fromLegacyFull();
      });
    }
    // Already have some rows (priority loaded) — still fine to resolve; callers that need
    // more geography uses ensureRegionsFor / ensureRegionsForBbox.
    if (beachDb && beachDb.length) {
      return ensureRegionsFor(lat, lon, 150).then(() => {
        return beachDb;
      });
    }
    if (beachDbPromise) {
      return beachDbPromise.then(() => {
        return ensureRegionsFor(lat, lon, 150).then(() => { return beachDb; });
      });
    }
    dbStatus("Loading beaches for this area…");
    /* Per-region IDB: no full-planet hydrate. Priority fetch + nearby ring. */
    beachDbPromise = idbGetVer().then((ver) => {
      void ver;
      return priorityThenBackground();
    }).catch(() => {
      return priorityThenBackground();
    }).catch((err) => {
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
    return prep.then((db) => {
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
      list.sort((a, c) => { return a.dist - c.dist; });
      return list.slice(0, cap);
    }).catch((err) => {
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
    /* opt12: shared short-TTL bins ~0.05° for Find / list / hover */
    return Math.round(lat * 20) + "," + Math.round(lon * 20);
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
  window.sunnyCachedWx = getCachedCurrentWx;
  function fetchWithTimeout(url, ms, outerSignal) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = null;
    function abortInner() {
      if (ctrl) {
        try { ctrl.abort(); } catch (eA) {}
      }
    }
    if (outerSignal) {
      if (outerSignal.aborted) {
        return Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      }
      outerSignal.addEventListener("abort", abortInner);
    }
    if (ctrl && ms > 0) {
      timer = setTimeout(abortInner, ms);
    }
    var init = ctrl ? { signal: ctrl.signal } : {};
    return fetch(url, init).then((res) => {
      if (timer) clearTimeout(timer);
      if (outerSignal) outerSignal.removeEventListener("abort", abortInner);
      return res;
    }, (err) => {
      if (timer) clearTimeout(timer);
      if (outerSignal) outerSignal.removeEventListener("abort", abortInner);
      throw err;
    });
  }
  /* opt26: never res.json() blind — Open-Meteo sometimes returns non-JSON / HTML */
  function readJsonSafe(res) {
    if (!res.ok) throw new Error("Open-Meteo HTTP " + res.status);
    return res.text().then((text) => {
      if (!text || !String(text).trim()) throw new Error("empty weather body");
      try {
        return JSON.parse(text);
      } catch (eParse) {
        throw new Error("non-JSON weather");
      }
    });
  }
  function fetchCurrentWeather(points, signal) {
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
    /* Cap per-request size so one hung Open-Meteo call can't freeze Find */
    var CAP = WX_BATCH;
    if (missing.length > CAP) {
      var start = 0;
      var chain = Promise.resolve();
      while (start < missing.length) {
        ((slicePts, sliceIdx) => {
          chain = chain.then(() => {
            if (signal && signal.aborted) return;
            return fetchCurrentWeather(slicePts, signal).then((rows) => {
              var r;
              for (r = 0; r < rows.length; r++) {
                if (rows[r]) out[sliceIdx[r]] = rows[r];
              }
            }).catch(() => { /* partial OK */ });
          });
        })(missing.slice(start, start + CAP), missingIdx.slice(start, start + CAP));
        start += CAP;
      }
      return chain.then(() => {
        var filled = [];
        var fi;
        for (fi = 0; fi < out.length; fi++) {
          filled.push(out[fi] || Object.assign({}, points[fi]));
        }
        return filled;
      });
    }
    var lats = missing.map((p) => { return p.lat.toFixed(4); }).join(",");
    var lons = missing.map((p) => { return p.lon.toFixed(4); }).join(",");
    var url = METEO_URL + "?latitude=" + lats + "&longitude=" + lons + "&current=cloud_cover,uv_index,is_day";
    return fetchWithTimeout(url, WX_FETCH_TIMEOUT_MS, signal).then(readJsonSafe).then((data) => {
      var rows = Array.isArray(data) ? data : [data];
      if (rows.length !== missing.length) throw new Error("Open-Meteo count mismatch");
      var j, wx;
      for (j = 0; j < missing.length; j++) {
        try {
          wx = parseCurrent(rows[j]);
          putCachedCurrentWx(missing[j].lat, missing[j].lon, wx);
          out[missingIdx[j]] = Object.assign({}, missing[j], wx);
        } catch (eRow) {
          out[missingIdx[j]] = Object.assign({}, missing[j]);
        }
      }
      return out.map((row, idx) => {
        return row || Object.assign({}, points[idx]);
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
    return fetch(url).then(readJsonSafe).then((data) => {
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
    if (window.SunnyBeachIcons) window.SunnyBeachIcons.paint(vis);
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
  function wikiLink(b) {
    if (!b.wiki) return "";
    var m = /^([a-z-]{2,12}):(.+)$/.exec(String(b.wiki));
    var lang = m ? m[1] : "en";
    var t = m ? m[2] : String(b.wiki);
    return ' · <a href="https://' + lang + ".wikipedia.org/wiki/" + encodeURIComponent(t.replace(/ /g, "_")) + '" target="_blank" rel="noopener">Wikipedia</a>';
  }
  function popupHtml(b, extra, imgUrl) {
    var lines = [];
    lines.push("<div class=\"popup\"><h2>" + escapeHtml(b.name) + "</h2>");
    if (b.dist != null) lines.push("<p>" + formatKm(b.dist) + (window.SunnyBeachRef ? " " + window.SunnyBeachRef.words() : "") + "</p>");
    if (b.brief) lines.push("<p>" + escapeHtml(b.brief) + "</p>");
    if (b.cloud != null && b.cloud >= 0) {
      lines.push("<p>" + Math.round(b.cloud) + "% cloudy" + (b.isDay ? "" : ", and it's night") + "</p>");
    }
    if (extra) lines.push("<p class=\"sunline\">" + escapeHtml(extra) + "</p>");
    if (imgUrl) lines.push("<img class=\"thumb\" alt=\"\" src=\"" + escapeHtml(imgUrl) + "\">");
    var osm = /^(node|way|relation)\/\d+$/.test(String(b.id)) ? "https://www.openstreetmap.org/" + b.id : "https://www.openstreetmap.org/";
    lines.push('<div class="pf-src">Source: <a href="' + osm + '" target="_blank" rel="noopener">OpenStreetMap</a>' +
      ' · cloud <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>' + wikiLink(b) + "</div>");
    lines.push("</div>");
    return lines.join("");
  }
  function showPopup(b, lngLat, extra, imgUrl) {
    var ll = lngLat || [b.lon, b.lat];
    var html = popupHtml(b, extra, imgUrl);
    var ring = window.SunnyBeachCard ? window.SunnyBeachCard.html(b) : "";
    if (ring) html = html.replace(/(<div class="pf-src">)/, ring + "$1");
    if (popup) {
      try {
        popup.setLngLat(ll).setHTML(html);
        if (typeof popup.isOpen === "function" && !popup.isOpen()) popup.addTo(map);
        else if (typeof popup.isOpen !== "function") popup.addTo(map);
        return;
      } catch (ePop) {
        try { popup.remove(); } catch (eRem) {}
        popup = null;
      }
    }
    popup = new maplibregl.Popup({ offset: 14, closeButton: true, maxWidth: "280px" })
      .setLngLat(ll)
      .setHTML(html)
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
    }).then((res) => {
      if (!res.ok) throw new Error("wiki");
      return res.json();
    }).then((data) => {
      var info = {
        extract: data.extract ? String(data.extract).slice(0, 280) : "",
        thumb: data.thumbnail && data.thumbnail.source ? data.thumbnail.source : ""
      };
      wikiCache[title] = info;
      return info;
    }).catch(() => {
      wikiCache[title] = null;
      return null;
    });
  }
  function enrichBeach(b, withWiki) {
    /* withWiki default true for map hover-dwell / click popup path only */
    if (withWiki === false) {
      return fetchHourly(b.lat, b.lon).then((data) => {
        var forecast = sunForecast(data);
        showPopup(b, [b.lon, b.lat], forecast, "");
        return data;
      }).catch(() => {
        showPopup(b, [b.lon, b.lat], "Couldn't get the sun forecast.", "");
      });
    }
    return Promise.all([
      fetchHourly(b.lat, b.lon).then(sunForecast).catch(() => { return "Couldn't get the sun forecast."; }),
      fetchWiki(b)
    ]).then((pair) => {
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
    dwellTimer = setTimeout(() => {
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
