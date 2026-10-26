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
var BUILD = "opt173b"; /* deploy name, read by tools/write-version.js */
self.SUNNY_BUILD = BUILD;
var CACHE = "sunny-app-1";
var STATIC = "sunny-static-1";
var FRAMES = "sunny-frames-1";
var DATA = "sunny-data-1"; /* opt109: static data files kept forever, keyed by content hash */
var OFFLINE = "sunny-offline-1"; /* opt95: regions saved from "Save for offline", never pruned here */
var KEEP = [CACHE, STATIC, FRAMES, DATA, OFFLINE];
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
  "styles.css?h=cd37db5056",
  "settings-panel.css?h=f5be224c45",
  "side-buttons.css?h=de1efe43ac",
  "layers-panel.css?h=3b513d26f9",
  "info-panel.css?h=90932599a5",
  "vendor/maplibre-gl.js?h=be9633c4d8",
  "base-guard.js?h=45c2453283",
  "tap-snap.js?h=8bb1b46efa",
  "points.js?h=bd3ec9c286",
  "peek-place.js?h=f0d14e00bc",
  "plus-code.js?h=f565a0bf77",
  "info-panel.js?h=48513f9529",
  "beach-card.js?h=0237ca65e1",
  "beach-icons.js?h=9bb675dbcd",
  "data-saver.js?h=ab8a4eacad",
  "vector-base.js?h=e2411f3d4a",
  "light-clouds.js?h=b3980fe855",
  "cloud-key.js?h=5d5b626b3c",
  "msg-clouds.js?h=15deb9f22a",
  "play-handoff.js?h=b695a52a77",
  "radar-key.js?h=13e90ad595",
  "radar-source.js?h=8a8a3abbaa",
  "radar-warm.js?h=3430fcf9a7",
  "radar-mask.js?h=801e09e7d5",
  "radar-legend.js?h=82ca8259a4",
  "wind-field.js?h=a44ddd27bd",
  "wind-gl.js?h=48bdd93d99",
  "point-forecast.js?h=d393a333b1",
  "craters.js?h=961f6df77a",
  "sky-glow.js?h=b325551c86",
  "beach-toggle.js?h=29ef62a7e1",
  "observatories.js?h=3cfd516ec0",
  "crown-land.js?h=4f17ab26f8",
  "side-buttons.js?h=6e117a70f1",
  "vendor/suncalc-2.1.1.js?h=3f2bf4d522",
  "vendor/satellite-5.0.0.min.js?h=272c249d24",
  "layer-kit.js?h=eb56bcfbb3",
  "layers-panel.js?h=487dc2ee13",
  "famous.js?h=cc6ba5ffd5",
  "bar-toggles.js?h=e6af9b608f",
  "overzoom.js?h=1dc114f61d",
  "flight-time.js?h=79218c417c",
  "legend-stack.js?h=b35e7720b5",
  "existing-layers.js?h=9631c68614",
  "advanced.js?h=ef030f80f5",
  "aurora-dev.js?h=e819e98e39",
  "aurora-top.js?h=d5ed39088c",
  "hover-box.js?h=32cdb130cf",
  "sky-layers.js?h=a4e092c437",
  "earth-layers.js?h=f43b3bfaef",
  "plates.js?h=192e0fa1b8",
  "quakes.js?h=a47e073cf2",
  "volcanoes.js?h=9ee4643d5e",
  "storms.js?h=7df322a672",
  "tornadoes.js?h=c9eac3da26",
  "golden-hour.js?h=674767defb",
  "coord-grid.js?h=a8528bd13f",
  "water-temp.js?h=6917bec6fc",
  "waves.js?h=cfbdb3bac4",
  "ca-cell.js?h=87604440a1",
  "fire-lookout.js?h=48723de234",
  "ca-cover.js?h=3793788c5f",
  "world-layers.js?h=645ad0c78d",
  "outdoor-layers.js?h=888e543c92",
  "parks-ca.js?h=239b668258",
  "sky-card.js?h=29233a05a1",
  "sats.js?h=7e53ca1d3e",
  "sky-draw.js?h=73f5ab9b32",
  "offline.js?h=f591704655",
  "beach-ref.js?h=dab3a52757",
  "wind-play-fade.js?h=e342e19b7e",
  "frame-tween.js?h=f2cd6bfd0b",
  "sw-ready.js?h=66b3059850",
  "beach-data-v.js?h=6226beb469",
  "play-pin.js?h=d91f012835",
  "app-core.js?h=1b52768a8f",
  "app-timeline.js?h=cfc2a3086a",
  "app-cloud-layers.js?h=3e1f472043",
  "app-play-buffers.js?h=db9bee0f55",
  "app-play-blend.js?h=fd6939b65c",
  "app-cloud-frames.js?h=7132727f13",
  "app-beach-store.js?h=2f443c94e4",
  "app-beach-fetch.js?h=f59fe3db1e",
  "app-beach-search.js?h=953df5657c",
  "app-wind-data.js?h=2fae005c89",
  "app-wind-draw.js?h=d433a84b94",
  "app-radar.js?h=477c8db9db",
  "app-play-clock.js?h=06b09bbc8c",
  "app-scrub.js?h=f85da55f93",
  "app.js?h=d9c14cf1bc",
  "update-banner.js?h=71cd3fa54f",
  "hover-tips.js?h=78f6072fb0",
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
  event.waitUntil(caches.keys().then(dropUnknownCaches).then(pruneApp).then(pruneData).then(claimAll));
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
  return p.slice(-23) === "/data/nexrad-sites.json" || p.slice(-25) === "/data/impact-craters.json" || p.slice(-23) === "/data/observatories.json" || p.indexOf("/data/obs/") !== -1 || p.indexOf("/data/met/") !== -1 || p.indexOf("/data/world/") !== -1;
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
/* opt109: data-hashes.json (tools/data-hashes.js) maps each data file to its content hash; one copy per build. */
var hashes = null;
function dataHashes() {
  if (hashes) return hashes;
  var key = absUrl("data-hashes.json?b=" + BUILD);
  hashes = caches.open(DATA).then((c) => {
    return c.match(key).then((hit) => {
      return hit || fetch(key).then((res) => { if (!res.ok) throw new Error(res.status); c.put(key, res.clone()); return res; });
    });
  }).then((r) => { return r.json(); }).catch(() => { hashes = null; return {}; });
  return hashes;
}
function relData(u) {
  var base = new URL("./", self.location.href).pathname;
  return u.origin === self.location.origin && u.pathname.indexOf(base + "data/") === 0 ? u.pathname.slice(base.length) : "";
}
function dataFirst(req, rel, h) {
  var key = absUrl(rel + "?c=" + h);
  return caches.open(DATA).then((c) => {
    return c.match(key).then((hit) => {
      /* opt174: fetch under the content hash, so the network copy always matches data-hashes.json */
      return hit || fetch(key).then((res) => { if (res.ok) c.put(key, res.clone()).catch(noop); return res; });
    });
  });
}
/* Drops data files whose hash changed and older hash lists. */
function pruneData() {
  return dataHashes().then((h) => {
    if (!Object.keys(h).length) return null;
    return caches.open(DATA).then((c) => {
      return c.keys().then((keys) => {
        return Promise.all(keys.map((k) => {
          var u = new URL(k.url), rel = relData(u), b = u.searchParams.get("b");
          if (b) return b === BUILD ? null : c.delete(k);
          return rel && h[rel] === u.searchParams.get("c") ? null : c.delete(k);
        }));
      });
    });
  });
}
function route(req, u) {
  var rel = relData(u);
  if (rel) {
    return dataHashes().then((h) => { return h[rel] ? dataFirst(req, rel, h[rel]) : routeOld(req, u); });
  }
  return routeOld(req, u);
}
function routeOld(req, u) {
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
/* opt95: the network (or the usual caches) first; a region saved for offline fills in when that fails. */
function withSaved(req, u) {
  var mine = u.origin === self.location.origin;
  if (!(mine && u.pathname.indexOf("/data/") !== -1) && u.host !== "tiles.openfreemap.org") return route(req, u);
  function saved(res) {
    function pick(hit) {
      return hit || res || Response.error();
    }
    return caches.open(OFFLINE).then((c) => { return c.match(req, { ignoreSearch: mine }); }).then(pick).catch(() => { return res || Response.error(); });
  }
  function check(res) {
    return res && res.ok ? res : saved(res);
  }
  return route(req, u).then(check, () => { return saved(null); });
}
function onFetch(event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var u;
  try { u = new URL(req.url); } catch (eUrl) { return; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return;
  event.respondWith(withSaved(req, u));
}
/* opt61: the update banner asks a waiting worker to take over now. */
function onSwMessage(event) {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
}
self.addEventListener("install", onInstall);
self.addEventListener("activate", onActivate);
self.addEventListener("fetch", onFetch);
self.addEventListener("message", onSwMessage);
