/* SUNNY service worker — network-first shell so deploys stick; beach data network-first. */
var CACHE = "sunny-v-opt63";
/* opt60: network-first shell; bare URL always latest. Precache shell only. */
var PRECACHE = [
  "./",
  "index.html",
  "styles.css?v=opt63",
  "cloud-key.js?v=opt63",
  "play-handoff.js?v=opt63",
  "frame-tween.js?v=opt63",
  "app.js?v=opt63",
  "update-banner.js?v=opt63",
  "settings-panel.js?v=opt63",
  "settings-panel.css?v=opt63",
  "vendor/maplibre-gl.js?v=opt63",
  "vendor/maplibre-gl.slim.css?v=opt63",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(PRECACHE);
    }).then(function () {
      return self.skipWaiting();
    }).catch(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE) return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function isDataRequest(url) {
  try {
    var u = new URL(url);
    if (u.origin !== self.location.origin) return false;
    var p = u.pathname;
    if (p.indexOf("/data/") !== -1) {
      if (p.slice(-8) === ".json.gz" || p.slice(-5) === ".json") return true;
      if (p.slice(-7) === ".bin.gz" || p.slice(-4) === ".bin") return true;
    }
    if (p.slice(-18) === "/data/manifest.json" || p.slice(-13) === "manifest.json") return true;
    return false;
  } catch (e) {
    return false;
  }
}

function isShellRequest(url) {
  try {
    var u = new URL(url);
    if (u.origin !== self.location.origin) return false;
    var p = u.pathname;
    if (p === "/" || p.slice(-1) === "/" || p.slice(-5) === ".html") return true;
    if (p.slice(-5) === "sw.js") return true;
    if (p.slice(-3) === ".js" || p.slice(-4) === ".css") return true;
    if (p.indexOf("/vendor/") !== -1) return true;
    if (p.slice(-16) === ".webmanifest" || p.slice(-5) === ".png") return true;
    return false;
  } catch (e2) {
    return false;
  }
}

function networkFirst(req) {
  return fetch(req).then(function (res) {
    if (res && res.ok) {
      var copy = res.clone();
      caches.open(CACHE).then(function (cache) {
        cache.put(req, copy);
      }).catch(function () {});
    }
    return res;
  }).catch(function () {
    return caches.match(req).then(function (hit) {
      return hit || Response.error();
    });
  });
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = req.url;
  /* opt61: version.json is the update signal — always network, never cached. */
  try {
    if (new URL(url).pathname.slice(-13) === "/version.json") {
      event.respondWith(fetch(req, { cache: "no-store" }));
      return;
    }
  } catch (eVer) {}

  if (isDataRequest(url) || isShellRequest(url)) {
    event.respondWith(networkFirst(req));
  }
});
/* opt61: the update banner asks a waiting worker to take over now. */
function onSwMessage(event) {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
}
self.addEventListener("message", onSwMessage);
