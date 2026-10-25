// workspace/whereisthesun/app-beach-store.js
/* SUNNY app, part 7 of 14: beach database parsing, grid and device storage.
 * Names here are page-wide and shared by every app-*.js file; startSunny in app.js runs each part's step in order. */
"use strict";
var BEACH_DB_IDB, BEACH_DB_STORE, BEACH_DB_VER, beachWorker, beachWorkerSeq, beachWorkerPending;
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
    forEachGridKey(south, north, west, east, (key) => {
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
    return fetch(url).then((res) => {
      if (!res.ok) throw new Error("beach list");
      if (typeof DecompressionStream === "undefined") throw new Error("no decompress");
      return new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).json();
    });
  }
  function fetchJsonMaybeGzip(url) {
    return fetch(url).then((res) => {
      if (!res.ok) throw new Error("beach list");
      var enc = (res.headers.get("Content-Encoding") || "").toLowerCase();
      var wantGunzip = /\.gz$/i.test(url) && enc.indexOf("gzip") === -1 && enc.indexOf("br") === -1;
      if (!wantGunzip) return res.json();
      if (typeof DecompressionStream === "undefined") throw new Error("no decompress");
      return res.arrayBuffer().then((buf) => {
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
  function idbOpenBeach() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("no idb"));
        return;
      }
      var req = indexedDB.open(BEACH_DB_IDB, 1);
      req.onupgradeneeded = () => {
        var db = req.result;
        if (!db.objectStoreNames.contains(BEACH_DB_STORE)) {
          db.createObjectStore(BEACH_DB_STORE);
        }
      };
      req.onsuccess = () => { resolve(req.result); };
      req.onerror = () => { reject(req.error || new Error("idb")); };
    });
  }
  function idbRegionKey(id) {
    return "region:" + id;
  }
  function idbGetVer() {
    return idbOpenBeach().then((db) => {
      return new Promise((resolve, reject) => {
        var tx = db.transaction(BEACH_DB_STORE, "readonly");
        var store = tx.objectStore(BEACH_DB_STORE);
        var verReq = store.get("v");
        verReq.onsuccess = () => {
          resolve(verReq.result === BEACH_DB_VER ? BEACH_DB_VER : null);
        };
        verReq.onerror = () => { reject(verReq.error || new Error("idb")); };
      });
    });
  }
  function idbGetRegionRows(regionId) {
    return idbOpenBeach().then((db) => {
      return new Promise((resolve, reject) => {
        var tx = db.transaction(BEACH_DB_STORE, "readonly");
        var store = tx.objectStore(BEACH_DB_STORE);
        var verReq = store.get("v");
        verReq.onsuccess = () => {
          if (verReq.result !== BEACH_DB_VER) {
            resolve(null);
            return;
          }
          var rowReq = store.get(idbRegionKey(regionId));
          rowReq.onsuccess = () => {
            var val = rowReq.result;
            resolve(val && Array.isArray(val) ? val : null);
          };
          rowReq.onerror = () => { reject(rowReq.error || new Error("idb")); };
        };
        verReq.onerror = () => { reject(verReq.error || new Error("idb")); };
      });
    });
  }
  function idbPutRegionRows(regionId, rows) {
    return idbOpenBeach().then((db) => {
      return new Promise((resolve, reject) => {
        var tx = db.transaction(BEACH_DB_STORE, "readwrite");
        var store = tx.objectStore(BEACH_DB_STORE);
        store.put(BEACH_DB_VER, "v");
        store.put(rows, idbRegionKey(regionId));
        try {
          var loadedReq = store.get("loaded");
          loadedReq.onsuccess = () => {
            var idx = loadedReq.result;
            if (!idx || typeof idx !== "object") idx = {};
            idx[regionId] = 1;
            store.put(idx, "loaded");
          };
        } catch (eLoaded) {}
        tx.oncomplete = () => { resolve(); };
        tx.onerror = () => { reject(tx.error || new Error("idb")); };
        tx.onabort = () => { reject(tx.error || new Error("idb")); };
      });
    });
  }
  function idbPutBeachRowsLegacy(rows) {
    /* full-blob write serves only non-region fallbacks; per-region writes are the default */
    return idbOpenBeach().then((db) => {
      return new Promise((resolve, reject) => {
        var tx = db.transaction(BEACH_DB_STORE, "readwrite");
        var store = tx.objectStore(BEACH_DB_STORE);
        store.put(BEACH_DB_VER, "v");
        store.put(rows, "rows");
        tx.oncomplete = () => { resolve(); };
        tx.onerror = () => { reject(tx.error || new Error("idb")); };
        tx.onabort = () => { reject(tx.error || new Error("idb")); };
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
    return new Promise((resolve) => {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(() => { resolve(); }, { timeout: 80 });
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
    function readManifestRes(res) {
      if (!res.ok) throw new Error("beach list");
      return res.json();
    }
    function forgetManifest(err) {
      beachManifestPromise = null;
      throw err;
    }
    function keepManifest(manifest) {
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
          /* flat shards */
        }
      }
      return beachManifest;
    }
    beachManifestPromise = fetch(beachDataUrl("data/manifest.json")).then(readManifestRes).then(keepManifest).catch(forgetManifest);
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
  function getBeachWorker() {
    if (beachWorker) return beachWorker;
    if (typeof Worker === "undefined") return null;
    try {
      /* created only when a region fetch actually needs decode off-main */
      beachWorker = new Worker("beach-worker.js?v=opt75");
      beachWorker.onmessage = (ev) => {
        var msg = ev.data || {};
        var pending = beachWorkerPending[msg.id];
        if (!pending) return;
        delete beachWorkerPending[msg.id];
        if (msg.ok) pending.resolve(msg.rows || []);
        else pending.reject(new Error(msg.error || "worker"));
      };
      beachWorker.onerror = () => {
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
      return new Response(stream).arrayBuffer().then((ab) => { return new Uint8Array(ab); });
    }
    return Promise.resolve(u8);
  }
  function fetchRegionViaWorker(url, format) {
    var w = getBeachWorker();
    if (!w) return Promise.reject(new Error("no worker"));
    var id = "r" + (++beachWorkerSeq);
    return new Promise((resolve, reject) => {
      beachWorkerPending[id] = { resolve: resolve, reject: reject };
      w.postMessage({ id: id, url: url, format: format || "auto" });
      setTimeout(() => {
        if (!beachWorkerPending[id]) return;
        delete beachWorkerPending[id];
        reject(new Error("worker timeout"));
      }, 60000);
    });
  }
  function fetchRegionBytes(url, format) {
    return fetchRegionViaWorker(url, format).catch(() => {
      return fetch(url).then((res) => {
        if (!res.ok) throw new Error("beach list");
        return res.arrayBuffer();
      }).then(gunzipU8).then((u8) => {
        var looksBin = u8.length >= 4 && u8[0] === 0x53 && u8[1] === 0x4e && u8[2] === 0x59 && u8[3] === 0x31;
        if (format === "bin1" || (format === "auto" && looksBin)) return parseBin1Main(u8);
        var data = JSON.parse(new TextDecoder().decode(u8));
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.beaches)) return data.beaches;
        throw new Error("beach list");
      });
    });
  }
  function beachDataUrl(path) {
    return path + "?h=" + (window.SUNNY_BEACH_V || "dev");
  }
  function withBeachHash(f) {
    return { url: beachDataUrl(f.url), format: f.format };
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
    return files.map(withBeachHash);
  }
  function networkFetchRegion(region) {
    var id = region.id;
    var candidates = regionFileCandidates(region);
    function tryNext(i) {
      if (i >= candidates.length) throw new Error("beach list");
      var c = candidates[i];
      return fetchRegionBytes(c.url, c.format).then((rows) => {
        if (rows && rows.length) {
          var compact = Array.isArray(rows[0]) ? rows : toCompactRows(parseBeachDb(rows));
          if (!beachRegionsLoaded[id]) {
            beachRegionsLoaded[id] = true;
            mergeBeachRows(compact);
          } else {
            mergeBeachRows(compact);
          }
          idbPutRegionRows(id, compact).catch(() => {});
        } else if (!beachRegionsLoaded[id]) {
          beachRegionsLoaded[id] = true;
        }
        return rows;
      }).catch(() => {
        return tryNext(i + 1);
      });
    }
    return tryNext(0);
  }
  function revalidateRegionInBackground(region) {
    var id = region && region.id;
    if (!id || beachRegionRevalidated[id] || tabHidden) return;
    beachRegionRevalidated[id] = 1;
    networkFetchRegion(region).catch(() => {
      /* keep serving cached rows; retry next session */
      delete beachRegionRevalidated[id];
    });
  }
  function fetchOneRegion(region) {
    var id = region.id;
    if (beachRegionsLoaded[id]) {
      /* already merged this session — optional SWR once */
      revalidateRegionInBackground(region);
      return Promise.resolve(null);
    }
    if (beachRegionInflight[id]) return beachRegionInflight[id];
    beachRegionInflight[id] = idbGetRegionRows(id).then((cached) => {
      if (cached && cached.length) {
        /* opt10: stronger IDB SWR — serve cached region immediately */
        if (!beachRegionsLoaded[id]) {
          beachRegionsLoaded[id] = true;
          mergeBeachRows(cached);
        }
        revalidateRegionInBackground(region);
        return cached;
      }
      return networkFetchRegion(region);
    }).then((part) => {
      delete beachRegionInflight[id];
      return part;
    }).catch((err) => {
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
      return Promise.all(batch.map((reg) => {
        return fetchOneRegion(reg).catch((err) => {
          console.error(err);
          return null;
        });
      })).then(() => {
        if (idx >= need.length) return beachDb || [];
        return yieldMain().then(step);
      });
    }
    return step();
  }
  function ensureRegionsFor(lat, lon, radiusKm) {
    if (beachDbComplete && beachDb) return Promise.resolve(beachDb);
    return loadBeachManifest().then((manifest) => {
      if (manifest.regions && manifest.regions.length) {
        var regs = pickRegionsAround(lat, lon, radiusKm == null ? 120 : radiusKm, 1);
        return ensureRegionsList(regs, "Loading beaches for this area…");
      }
      // flat files — load all once
      if (beachDbComplete && beachDb) return beachDb;
      var files = manifest.files;
      if (!files || !files.length) throw new Error("beach list");
      setStatus("Loading beaches for this area…");
      return Promise.all(files.map((f) => {
        return fetchJsonMaybeGzip(f);
      })).then((parts) => {
        var rows = [];
        var i;
        for (i = 0; i < parts.length; i++) {
          if (Array.isArray(parts[i])) rows.push.apply(rows, parts[i]);
        }
        mergeBeachRows(rows);
        beachDbComplete = true;
        idbPutBeachRowsLegacy(toCompactRows(beachDb)).catch(() => {});
        return beachDb;
      });
    });
  }
function sunnyStep07() {
  BEACH_DB_IDB = "sunny";
  BEACH_DB_STORE = "beachdb";
  BEACH_DB_VER = "region1-bin1-idb4-opt12";
  /* --- beach worker + binary shards (opt5/8) ---
   * opt8 C: lazy Worker — do NOT new Worker at startup; create on first
   * region/decode need via getBeachWorker(); main-thread fallback always kept.
   */
  beachWorker = null;
  beachWorkerSeq = 0;
  beachWorkerPending = Object.create(null);
}
