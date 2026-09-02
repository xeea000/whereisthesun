/* SUNNY service worker — shell cache-first; beach data network-first with store. */
var CACHE = "sunny-v-opt5";
var PRECACHE = [
  "./",
  "index.html",
  "styles.css?v=opt5",
  "app.js?v=opt5",
  "beach-worker.js?v=opt5",
  "vendor/maplibre-gl.js?v=opt5",
  "vendor/maplibre-gl.css?v=opt5"
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

function isSameOriginStatic(url) {
  try {
    var u = new URL(url);
    if (u.origin !== self.location.origin) return false;
    if (isDataRequest(url)) return false;
    var p = u.pathname;
    if (p === "/" || p.slice(-1) === "/" || p.slice(-5) === ".html") return true;
    if (p.slice(-3) === ".js" || p.slice(-4) === ".css") return true;
    if (p.indexOf("/vendor/") !== -1) return true;
    return false;
  } catch (e2) {
    return false;
  }
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = req.url;

  if (isDataRequest(url)) {
    event.respondWith(
      fetch(req).then(function (res) {
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
      })
    );
    return;
  }

  if (isSameOriginStatic(url)) {
    event.respondWith(
      caches.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(CACHE).then(function (cache) {
              cache.put(req, copy);
            }).catch(function () {});
          }
          return res;
        });
      })
    );
  }
});
