// workspace/whereisthesun/sw.js
/* SUNNY service worker (opt77).
 * - App cache: files carry a content hash (?h=, written by tools/fingerprint.js), so they are
 *   cache-first forever; a new build fetches only files whose hash changed. index.html and
 *   version.json are network-first.
 * - Static cache (kept across deploys, capped): map tiles, fonts, small static data.
 * - Frames cache (kept across deploys, capped, aged out after 26 h): settled past satellite
 *   and radar frames. A frame for a fixed past time never changes, so it is fetched once.
 * - Reports bytes it pulled from the network to the page's data meter (postMessage).
 * Real network bytes come from the worker's own timing entries (transferSize is 0 for
 * HTTP-cache hits). Cross-origin servers without the timing header report 0, so those
 * fall back to Content-Length; opaque responses have no size and are only counted. */
var BUILD = "opt77"; /* deploy name, read by tools/write-version.js */
self.SUNNY_BUILD = BUILD;
var CACHE = "sunny-app-1";
var STATIC = "sunny-static-1";
var FRAMES = "sunny-frames-1";
var KEEP = [CACHE, STATIC, FRAMES];
var STATIC_MAX = 900;
var FRAMES_MAX = 400;
var FRAME_MAX_AGE_MS = 26 * 3600 * 1000;
var FRAME_SETTLE_MS = 45 * 60 * 1000;
/* PRECACHE-START (tools/fingerprint.js) */
var PRECACHE = [
  "./",
  "index.html",
  "vendor/maplibre-gl.slim.css?h=5ae31c574f",
  "styles.css?h=78f082975a",
  "settings-panel.css?h=a8d0a7ccc0",
  "side-buttons.css?h=5ab83bde0d",
  "vendor/maplibre-gl.js?h=be9633c4d8",
  "cloud-key.js?h=5d5b626b3c",
  "play-handoff.js?h=b695a52a77",
  "radar-key.js?h=13e90ad595",
  "radar-source.js?h=8a8a3abbaa",
  "radar-warm.js?h=e3f27c6340",
  "radar-mask.js?h=801e09e7d5",
  "radar-legend.js?h=82ca8259a4",
  "wind-field.js?h=a95511e1dc",
  "wind-gl.js?h=cbb13e67c4",
  "point-forecast.js?h=b05dfd8dfe",
  "craters.js?h=12ec56a7af",
  "crown-land.js?h=066064dd81",
  "side-buttons.js?h=06480df83c",
  "wind-play-fade.js?h=e342e19b7e",
  "frame-tween.js?h=2b0f964296",
  "app.js?h=0ba2f8f2fd",
  "update-banner.js?h=e3362c1916",
  "settings-panel.js?h=0e2b6b8551",
  "data-meter.js?h=688018d308",
  "manifest.webmanifest?h=3122f023bd",
  "icon-192.png?h=737599b667",
  "icon-512.png?h=52a83ea426"
];
/* PRECACHE-END */
var TILE_HOSTS = ["tile.openstreetmap.org", "basemaps.cartocdn.com", "server.arcgisonline.com", "tiles.openfreemap.org"];
var pendingBytes = 0;
var pendingOpaque = 0;
var flushTimer = null;
var lenByUrl = {};
var haveTiming = false;
var lastAgeOut = 0;
function noop() {}
function warnPrecache(path, err) {
  console.warn("SUNNY sw: precache failed", path, err);
}
/* One file failing MUST NOT leave the app cache empty (cache.addAll is all-or-nothing). */
function precacheOne(cache, path) {
  function addIfMissing(hit) {
    if (hit && path.indexOf("?h=") !== -1) return null;
    return cache.add(path);
  }
  return cache.match(path).then(addIfMissing).catch(warnPrecache.bind(null, path));
}
function precacheAll(cache) {
  return Promise.all(PRECACHE.map(precacheOne.bind(null, cache)));
}
function takeOver() {
  return self.skipWaiting();
}
function onInstall(event) {
  event.waitUntil(caches.open(CACHE).then(precacheAll).then(takeOver));
}
function dropKey(key) {
  if (KEEP.indexOf(key) === -1) return caches.delete(key);
  return null;
}
function dropUnknownCaches(keys) {
  return Promise.all(keys.map(dropKey));
}
function absUrl(p) {
  return new URL(p, self.location.href).href;
}
/* Hashed files that are not in the current build are deleted. */
function pruneApp() {
  var want = PRECACHE.map(absUrl);
  function dropStale(cache, k) {
    if (k.url.indexOf("?h=") !== -1 && want.indexOf(k.url) === -1) return cache.delete(k);
    return null;
  }
  function pruneKeys(cache) {
    function eachKeys(keys) {
      return Promise.all(keys.map(dropStale.bind(null, cache)));
    }
    return cache.keys().then(eachKeys);
  }
  return caches.open(CACHE).then(pruneKeys);
}
function claimAll() {
  return self.clients.claim();
}
function onActivate(event) {
  event.waitUntil(caches.keys().then(dropUnknownCaches).then(pruneApp).then(claimAll));
}
function postTo(client) {
  client.postMessage({ type: "SUNNY_NET_BYTES", bytes: pendingBytes, opaque: pendingOpaque });
}
function postBytes(list) {
  list.forEach(postTo);
  pendingBytes = 0;
  pendingOpaque = 0;
}
function flushBytes() {
  flushTimer = null;
  self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then(postBytes);
}
function soon() {
  if (!flushTimer) flushTimer = setTimeout(flushBytes, 700);
}
function countEntry(e) {
  var n = e.transferSize;
  if (!n && e.name.indexOf(self.location.origin) !== 0) n = lenByUrl[e.name] || 0;
  delete lenByUrl[e.name];
  pendingBytes += n;
}
function onTiming(list) {
  list.getEntries().forEach(countEntry);
  soon();
}
try {
  new PerformanceObserver(onTiming).observe({ type: "resource" });
  haveTiming = true;
} catch (eObs) {}
function noteBytes(req, res) {
  if (!res) return;
  if (res.type === "opaque") {
    pendingOpaque += 1;
    soon();
    return;
  }
  var len = parseInt(res.headers.get("content-length") || "", 10) || 0;
  if (haveTiming) {
    if (len) lenByUrl[req.url || req] = len + 300;
    return;
  }
  pendingBytes += len;
  soon();
}
function netFetch(req, opts) {
  function seen(res) {
    noteBytes(req, res);
    return res;
  }
  return fetch(req, opts).then(seen);
}
function trim(name, max) {
  function trimKeys(cache) {
    function dropExtra(keys) {
      var jobs = [];
      for (var i = 0; i < keys.length - max; i++) jobs.push(cache.delete(keys[i]));
      return Promise.all(jobs);
    }
    return cache.keys().then(dropExtra);
  }
  return caches.open(name).then(trimKeys).catch(noop);
}
function putIn(name, max, req, res) {
  if (!res || !res.ok) return;
  var copy = res.clone();
  function store(cache) {
    return cache.put(req, copy);
  }
  function capped() {
    return trim(name, max);
  }
  caches.open(name).then(store).then(capped).catch(noop);
}
function cacheFirst(name, max, req) {
  function stored(res) {
    putIn(name, max, req, res);
    return res;
  }
  function hitOrNet(hit) {
    return hit || netFetch(req).then(stored);
  }
  function lookup(cache) {
    return cache.match(req);
  }
  return caches.open(name).then(lookup).then(hitOrNet);
}
function networkFirst(req) {
  function stored(res) {
    putIn(CACHE, 9999, req, res);
    return res;
  }
  function orError(hit) {
    return hit || Response.error();
  }
  function offline() {
    return caches.match(req).then(orError);
  }
  return netFetch(req).then(stored).catch(offline);
}
/* Time of a satellite/radar frame named in its URL; 0 if none. */
function frameTime(u) {
  if (u.host !== "gibs.earthdata.nasa.gov" && u.host !== "mesonet.agron.iastate.edu") return 0;
  var m = decodeURIComponent(u.href).match(/(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) return 0;
  var t = Date.parse(m[1] + "T" + m[2] + ":" + m[3] + ":00Z");
  return isNaN(t) ? 0 : t;
}
/* Only settled frames are stored: a too-recent frame may still be filling in upstream. */
function isSettledFrame(u) {
  var t = frameTime(u);
  if (!t) return false;
  var age = Date.now() - t;
  return age > FRAME_SETTLE_MS && age < FRAME_MAX_AGE_MS;
}
function isTile(u) {
  if (TILE_HOSTS.indexOf(u.host) === -1) return false;
  return /\.(png|jpe?g|pbf|webp)$/.test(u.pathname) || u.pathname.indexOf("/tile/") !== -1;
}
function isStaticData(u) {
  if (u.origin !== self.location.origin) return false;
  var p = u.pathname;
  return p.slice(-23) === "/data/nexrad-sites.json" || p.slice(-25) === "/data/impact-craters.json";
}
function isHashed(u) {
  return u.origin === self.location.origin && u.searchParams.has("h");
}
/* Frames past 26 h are deleted so the frames cache holds only timeline-useful weather. */
function ageOutFrames() {
  function dropExpired(cache, k) {
    var t = frameTime(new URL(k.url));
    if (!t || Date.now() - t > FRAME_MAX_AGE_MS) return cache.delete(k);
    return null;
  }
  function sweep(cache) {
    function eachFrame(keys) {
      return Promise.all(keys.map(dropExpired.bind(null, cache)));
    }
    return cache.keys().then(eachFrame);
  }
  return caches.open(FRAMES).then(sweep).catch(noop);
}
function route(req, u) {
  if (u.pathname.slice(-13) === "/version.json") return netFetch(req, { cache: "no-store" });
  if (isSettledFrame(u)) {
    if (Date.now() - lastAgeOut > 600000) {
      lastAgeOut = Date.now();
      ageOutFrames();
    }
    return cacheFirst(FRAMES, FRAMES_MAX, req);
  }
  if (isTile(u) || isStaticData(u)) return cacheFirst(STATIC, STATIC_MAX, req);
  if (isHashed(u)) return cacheFirst(CACHE, 9999, req);
  if (u.origin === self.location.origin) return networkFirst(req);
  return netFetch(req);
}
function onFetch(event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var u;
  try { u = new URL(req.url); } catch (eUrl) { return; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return;
  event.respondWith(route(req, u));
}
/* opt61: the update banner asks a waiting worker to take over now. */
function onSwMessage(event) {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
}
self.addEventListener("install", onInstall);
self.addEventListener("activate", onActivate);
self.addEventListener("fetch", onFetch);
self.addEventListener("message", onSwMessage);
