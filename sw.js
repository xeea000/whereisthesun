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
var BUILD = "opt278"; /* deploy name, read by tools/write-version.js */
self.SUNNY_BUILD = BUILD;
var CACHE = "sunny-app-1";
var STATIC = "sunny-static-1";
var FRAMES = "sunny-frames-1";
var DATA = "sunny-data-1"; /* opt109: static data files kept forever, keyed by content hash */
var OFFLINE = "sunny-offline-1"; /* opt95: regions saved from "Save for offline", never pruned here */
var KEEP = [CACHE, STATIC, FRAMES, DATA, OFFLINE];
/* opt244: cache caps and trim pacing in one place. A trim (cache.keys over the whole cache) runs at most once
 * per TRIM_EVERY writes or TRIM_MS, so a cache holds up to TRIM_EVERY entries over its cap between trims. */
var CAPS = { STATIC_MAX: 900, FRAMES_MAX: 400, TRIM_EVERY: 50, TRIM_MS: 30000 };
var STATIC_MAX = CAPS.STATIC_MAX;
var FRAMES_MAX = CAPS.FRAMES_MAX;
var FRAME_MAX_AGE_MS = 26 * 3600 * 1000;
var FRAME_SETTLE_MS = 45 * 60 * 1000;
/* PRECACHE-START (tools/fingerprint.js) */
var PRECACHE = [
  "./",
  "index.html",
  "vendor/lag-o-meter-1.7.0/start.js?h=00de626178&key=sunny-lag",
  "vendor/maplibre-gl.slim.css?h=5ae31c574f",
  "styles.css?h=64f8fad1bf",
  "settings-panel.css?h=4b9ee1d0bf",
  "side-buttons.css?h=629d800453",
  "layers-panel.css?h=217dac85f7",
  "info-panel.css?h=f27269beca",
  "vendor/maplibre-gl.js?h=be9633c4d8",
  "base-guard.js?h=45c2453283",
  "tap-snap.js?h=3fe785f8f8",
  "points.js?h=bd3ec9c286",
  "peek-place.js?h=4dfa1405fd",
  "drag-kit.js?h=8c3939a239",
  "plus-code.js?h=2de5aed8e0",
  "info-panel.js?h=fef315bb15",
  "beach-card.js?h=0237ca65e1",
  "beach-icons.js?h=20b06e164b",
  "data-saver.js?h=e646e5f5ee",
  "label-tiers.js?h=76e5cf6417",
  "vector-base.js?h=d38449997d",
  "light-clouds.js?h=3eec306776",
  "cloud-key.js?h=5d5b626b3c",
  "msg-clouds.js?h=64a9d75088",
  "play-handoff.js?h=b695a52a77",
  "radar-key.js?h=f5fb81876e",
  "radar-source.js?h=be24bccbbb",
  "radar-warm.js?h=3430fcf9a7",
  "radar-mask.js?h=801e09e7d5",
  "radar-legend.js?h=82ca8259a4",
  "wind-field.js?h=e5e0fb680c",
  "wind-gl.js?h=09b3941c63",
  "point-forecast.js?h=41c0f3dc6d",
  "beach-toggle.js?h=6f8bbe8fdf",
  "side-buttons.js?h=b0ec3429d6",
  "vendor/suncalc-2.1.1.js?h=3f2bf4d522",
  "layer-kit.js?h=3f91cd8bbe",
  "frame-kit.js?h=483b24432b",
  "layer-lazy.js?h=26794f51c2",
  "layers-panel.js?h=5b49cae999",
  "overzoom.js?h=1dc114f61d",
  "share-link.js?h=0eeccab808",
  "bar-toggles.js?h=68ff6400e3",
  "legend-stack.js?h=4554a57966",
  "existing-layers.js?h=11cf24a82a",
  "advanced.js?h=ef030f80f5",
  "hover-box.js?h=32cdb130cf",
  "offline.js?h=f591704655",
  "beach-ref.js?h=dab3a52757",
  "wind-play-fade.js?h=e342e19b7e",
  "frame-tween.js?h=4469ac2203",
  "sw-ready.js?h=66b3059850",
  "beach-data-v.js?h=6226beb469",
  "play-pin.js?h=d91f012835",
  "app-core.js?h=00250bdda4",
  "app-timeline.js?h=cfc2a3086a",
  "app-cloud-layers.js?h=044f396d25",
  "app-play-buffers.js?h=f67069c191",
  "app-play-blend.js?h=2d35ed038e",
  "app-cloud-frames.js?h=8f56604d07",
  "app-beach-store.js?h=2f443c94e4",
  "app-beach-fetch.js?h=2b9c93ee7a",
  "app-beach-search.js?h=d42286ab71",
  "app-wind-data.js?h=2ae6af874a",
  "app-wind-draw.js?h=ad70f6723c",
  "app-radar.js?h=a70bdb5d8e",
  "geo-ask.js?h=3531b4d856",
  "app-play-clock.js?h=638b075435",
  "app-scrub.js?h=2f5017e5cb",
  "app.js?h=0b946f883c",
  "update-banner.js?h=5dc7a338ad",
  "settings-panel.js?h=0e2b6b8551",
  "lagmeter.js?h=3ed84b3cb2",
  "craters.js?h=62aa51af7f",
  "sky-glow.js?h=06356a2a64",
  "observatories.js?h=dd917d3367",
  "crown-land.js?h=34bb143216",
  "vendor/satellite-5.0.0.min.js?h=272c249d24",
  "famous.js?h=88b268063d",
  "flight-time.js?h=79218c417c",
  "aurora-dev.js?h=e819e98e39",
  "aurora-top.js?h=d5ed39088c",
  "sky-layers.js?h=f3661544a7",
  "smoke-aq.js?h=3dc0835e01",
  "earth-layers.js?h=30237759c5",
  "forest-loss.js?h=ade90b3739",
  "oil-spills.js?h=2d5c0335c0",
  "airbursts.js?h=347dc2f94c",
  "nuclear.js?h=25232620fd",
  "spacecraft.js?h=2c33563edf",
  "ocean-garbage.js?h=98656663a4",
  "plates.js?h=fc25f7fdd7",
  "quakes.js?h=96c8ef8693",
  "volcanoes.js?h=bbd8b6d5a8",
  "storms.js?h=acd4e567c3",
  "tornadoes.js?h=e268aebfac",
  "golden-hour.js?h=16bf01063e",
  "sun-card.js?h=f5194300bd",
  "sun-hours.js?h=cb04d37309",
  "coord-grid.js?h=c49f678b9e",
  "currents.js?h=6eb08ffcef",
  "water-temp.js?h=a0005ad2e5",
  "waves.js?h=c1631fca41",
  "ships.js?h=d8e3cb9ff4",
  "ca-cell.js?h=f203aa492e",
  "fire-lookout.js?h=3a7c53c59c",
  "ca-cover.js?h=c5dd186c2a",
  "world-layers.js?h=ce04c120ce",
  "outdoor-layers.js?h=a63aab75b7",
  "mtg-stores.js?h=33e5f87fee",
  "parks-ca.js?h=fb1fec2c6b",
  "sky-card.js?h=e625e51b88",
  "sats.js?h=ea5fdb3a67",
  "sky-draw.js?h=48f25ae53e",
  "dark-spot.js?h=5273815ee5",
  "hover-tips.js?h=a6001eefb3",
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
/* opt247: one opened handle per cache name for this worker's life instead of caches.open on every request */
var handles = {};
function openCache(name) {
  if (!handles[name]) {
    handles[name] = caches.open(name);
    handles[name].catch(() => { delete handles[name]; });
  }
  return handles[name];
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
var trimState = {};
function trimDue(name) {
  var st = trimState[name] || (trimState[name] = { n: 0, t: Date.now() });
  st.n++;
  if (st.n < CAPS.TRIM_EVERY && Date.now() - st.t < CAPS.TRIM_MS) return false;
  st.n = 0;
  st.t = Date.now();
  return true;
}
function putIn(name, max, req, res) {
  if (!res || !res.ok) return Promise.resolve();
  var copy = res.clone();
  function store(cache) {
    return cache.put(req, copy);
  }
  function capped() {
    return trimDue(name) ? trim(name, max) : null;
  }
  return openCache(name).then(store).then(capped).catch(noop);
}
/* opt244: hand the response over at once; the cache write finishes in the background under the fetch event */
function later(ev, p) {
  if (ev && ev.waitUntil) { try { ev.waitUntil(p); } catch (eW) {} }
  return p;
}
function cacheFirst(name, max, req, ev) {
  function stored(res) {
    later(ev, putIn(name, max, req, res));
    return res;
  }
  function hitOrNet(hit) {
    return hit || netFetch(req).then(stored);
  }
  function lookup(cache) {
    return cache.match(req);
  }
  return openCache(name).then(lookup).then(hitOrNet);
}
function networkFirst(req, ev) {
  function stored(res) {
    later(ev, putIn(CACHE, 9999, req, res));
    return res;
  }
  function orError(hit) {
    return hit || Response.error();
  }
  function offline() {
    return caches.match(req).then(orError);
  }
  /* a page load asks the server again (GitHub Pages lets browsers reuse index.html for 10 minutes) */
  var net = req.mode !== "navigate" ? netFetch(req) : netFetch(req.url, { cache: "no-cache", credentials: "same-origin" })
    .then((res) => { return res.redirected ? netFetch(req) : res; }); /* a redirected answer cannot serve a page load */
  return net.then(stored).catch(offline);
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
function route(req, u, ev) {
  var rel = relData(u);
  if (rel) {
    return dataHashes().then((h) => { return h[rel] ? dataFirst(req, rel, h[rel]) : routeOld(req, u, ev); });
  }
  return routeOld(req, u, ev);
}
function routeOld(req, u, ev) {
  if (u.pathname.slice(-13) === "/version.json") return netFetch(req, { cache: "no-store" });
  if (isSettledFrame(u)) {
    if (Date.now() - lastAgeOut > 600000) {
      lastAgeOut = Date.now();
      ageOutFrames();
    }
    return cacheFirst(FRAMES, FRAMES_MAX, req, ev);
  }
  if (isTile(u) || isStaticData(u) || isBeachData(u)) return cacheFirst(STATIC, STATIC_MAX, req, ev);
  if (isHashed(u)) return cacheFirst(CACHE, 9999, req, ev);
  if (u.origin === self.location.origin) return networkFirst(req, ev);
  return netFetch(req);
}
/* opt95: the network (or the usual caches) first; a region saved for offline fills in when that fails. */
function withSaved(req, u, ev) {
  var mine = u.origin === self.location.origin;
  if (!(mine && u.pathname.indexOf("/data/") !== -1) && u.host !== "tiles.openfreemap.org") return route(req, u, ev);
  function saved(res) {
    function pick(hit) {
      return hit || res || Response.error();
    }
    return caches.open(OFFLINE).then((c) => { return c.match(req, { ignoreSearch: mine }); }).then(pick).catch(() => { return res || Response.error(); });
  }
  function check(res) {
    return res && res.ok ? res : saved(res);
  }
  return route(req, u, ev).then(check, () => { return saved(null); });
}
function onFetch(event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var u;
  try { u = new URL(req.url); } catch (eUrl) { return; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return;
  /* opt247: the app's own hashed files (scripts, styles) go straight to the app cache, then the network; this is
   * the same answer route() gives them, without the data-hash and offline-region checks that do not apply */
  if (isHashed(u) && !relData(u) && u.pathname.indexOf("/data/") === -1) {
    event.respondWith(cacheFirst(CACHE, 9999, req, event));
    return;
  }
  event.respondWith(withSaved(req, u, event));
}
/* opt61: the update banner asks a waiting worker to take over now. */
function onSwMessage(event) {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
}
self.addEventListener("install", onInstall);
self.addEventListener("activate", onActivate);
self.addEventListener("fetch", onFetch);
self.addEventListener("message", onSwMessage);
