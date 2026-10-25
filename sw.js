// workspace/whereisthesun/sw.js
/* SUNNY service worker (opt77).
 * - App cache: files carry a content hash (?h=, written by tools/fingerprint.js), so they are
 *   cache-first forever; a new build fetches only files whose hash changed. index.html and
 *   version.json are network-first.
 * - Static cache (kept across deploys, capped): map tiles, fonts, small static data, and
 *   beach pieces (data/*?h=<hash>, opt78), so each piece is downloaded once.
 * - Frames cache (kept across deploys, capped, aged out after 26 h): settled past satellite
 *   and radar frames. A frame for a fixed past time never changes, so it is fetched once.
 * - Counts the bytes it pulls from the network for the page's Lag-O-Meter (opt80, opt81):
 *   vendor/lag-o-meter-1.7.0/sw-counter.js reads the worker's own timing entries and
 *   posts them to the page; the page itself reads 0 for every file this worker answers. */
importScripts("vendor/lag-o-meter-1.7.0/sw-counter.js");
var BUILD = "opt90"; /* deploy name, read by tools/write-version.js */
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
  "vendor/lag-o-meter-1.7.0/start.js?h=00de626178&key=sunny-lag",
  "vendor/maplibre-gl.slim.css?h=5ae31c574f",
  "styles.css?h=468e6b0212",
  "settings-panel.css?h=5ab8872727",
  "side-buttons.css?h=5ab83bde0d",
  "vendor/maplibre-gl.js?h=be9633c4d8",
  "data-saver.js?h=9b7caac8c2",
  "vector-base.js?h=4d1c85b8fd",
  "light-clouds.js?h=b3980fe855",
  "cloud-key.js?h=5d5b626b3c",
  "play-handoff.js?h=b695a52a77",
  "radar-key.js?h=13e90ad595",
  "radar-source.js?h=8a8a3abbaa",
  "radar-warm.js?h=3430fcf9a7",
  "radar-mask.js?h=801e09e7d5",
  "radar-legend.js?h=82ca8259a4",
  "wind-field.js?h=a95511e1dc",
  "wind-gl.js?h=cbb13e67c4",
  "point-forecast.js?h=e2b627528a",
  "craters.js?h=e36d68f681",
  "observatories.js?h=93a87d3be3",
  "crown-land.js?h=76409d2bb9",
  "side-buttons.js?h=06480df83c",
  "wind-play-fade.js?h=e342e19b7e",
  "frame-tween.js?h=f2cd6bfd0b",
  "sw-ready.js?h=66b3059850",
  "beach-data-v.js?h=6226beb469",
  "app-core.js?h=4603976dda",
  "app-timeline.js?h=cfc2a3086a",
  "app-cloud-layers.js?h=d867f3ff92",
  "app-play-buffers.js?h=13c014bb98",
  "app-play-blend.js?h=38be458b77",
  "app-cloud-frames.js?h=c1f1afe3e7",
  "app-beach-store.js?h=2f443c94e4",
  "app-beach-fetch.js?h=11a99d046c",
  "app-beach-search.js?h=790ea124a1",
  "app-wind-data.js?h=86668761f0",
  "app-wind-draw.js?h=f8483c2264",
  "app-radar.js?h=42414e10ae",
  "app-play-clock.js?h=49e4b1f99a",
  "app-scrub.js?h=6d529a0cfc",
  "app.js?h=d9c14cf1bc",
  "update-banner.js?h=e3362c1916",
  "settings-panel.js?h=0e2b6b8551",
  "lagmeter.js?h=1da2e674c3",
  "manifest.webmanifest?h=3122f023bd",
  "icon-192.png?h=737599b667",
  "icon-512.png?h=52a83ea426"
];
/* PRECACHE-END */
var TILE_HOSTS = ["tile.openstreetmap.org", "basemaps.cartocdn.com", "server.arcgisonline.com", "tiles.openfreemap.org"];
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
function netFetch(req, opts) {
  return fetch(req, opts);
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
  return p.slice(-23) === "/data/nexrad-sites.json" || p.slice(-25) === "/data/impact-craters.json" || p.slice(-23) === "/data/observatories.json";
}
function isBeachData(u) {
  return u.origin === self.location.origin && u.pathname.indexOf("/data/") !== -1 && u.searchParams.has("h");
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
  if (isTile(u) || isStaticData(u) || isBeachData(u)) return cacheFirst(STATIC, STATIC_MAX, req);
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
