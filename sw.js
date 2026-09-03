/* SUNNY service worker — network-first shell so deploys stick; beach data network-first. */
var CACHE = "sunny-v-opt28";
var PRECACHE = [
  "./",
  "index.html",
  "styles.css?v=opt28",
  "app.js?v=opt28",
  "beach-worker.js?v=opt28",
  "vendor/maplibre-gl.js?v=opt28",
  "vendor/maplibre-gl.slim.css?v=opt28",
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

  if (isDataRequest(url) || isShellRequest(url)) {
    event.respondWith(networkFirst(req));
  }
});
