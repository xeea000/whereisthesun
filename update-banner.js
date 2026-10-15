/* SUNNY update banner (opt61). Polls version.json; when the deployed build differs from the
 * running build, shows "A new update is ready" with an UPDATE button. Shows on every screen. */
(function () {
  "use strict";

  var CHECK_MS = 3 * 60 * 1000;
  var running = null;
  var shownFor = null;
  var dismissedFor = null;
  var updating = false;
  var banner = null;

  try {
    var self = document.currentScript;
    var m = self && /[?&]v=([^&]+)/.exec(self.src);
    if (m) running = decodeURIComponent(m[1]);
  } catch (eSelf) {}

  function bareUrl() {
    var u = new URL(location.href);
    u.searchParams.delete("v");
    var q = u.searchParams.toString();
    return u.pathname + (q ? "?" + q : "") + u.hash;
  }

  function build() {
    var el = document.createElement("div");
    el.className = "update-banner";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.innerHTML =
      '<span class="update-banner-text">A new update is ready</span>' +
      '<button type="button" class="update-banner-go">UPDATE</button>' +
      '<button type="button" class="update-banner-close" aria-label="Dismiss">\u00d7</button>';
    el.querySelector(".update-banner-go").addEventListener("click", applyUpdate);
    el.querySelector(".update-banner-close").addEventListener("click", function () {
      dismissedFor = shownFor;
      hide();
    });
    document.body.appendChild(el);
    return el;
  }

  function show(next) {
    if (updating || next === dismissedFor) return;
    shownFor = next;
    if (!banner) banner = build();
    banner.hidden = false;
    requestAnimationFrame(function () { banner.classList.add("is-on"); });
  }

  function hide() {
    if (banner) { banner.classList.remove("is-on"); banner.hidden = true; }
  }

  function clearCaches() {
    if (!window.caches || !caches.keys) return Promise.resolve();
    return caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k.indexOf("sunny-") === 0;
      }).map(function (k) { return caches.delete(k); }));
    }).catch(function () {});
  }

  function goBare() {
    try { location.replace(bareUrl()); } catch (eGo) { location.reload(); }
  }

  function applyUpdate() {
    if (updating) return;
    updating = true;
    var btn = banner && banner.querySelector(".update-banner-go");
    if (btn) { btn.disabled = true; btn.textContent = "Updating\u2026"; }
    var sw = navigator.serviceWorker;
    var regP = sw && sw.getRegistration ? sw.getRegistration().catch(function () { return null; })
      : Promise.resolve(null);
    regP.then(function (reg) {
      return clearCaches().then(function () {
        if (reg && reg.waiting) {
          /* app.js reloads once on controllerchange; fall back to our own reload. */
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
          setTimeout(goBare, 2500);
          return;
        }
        var upd = reg && reg.update ? reg.update().catch(function () {}) : Promise.resolve();
        Promise.race([upd, new Promise(function (r) { setTimeout(r, 1500); })]).then(function () {
          if (reg && reg.waiting) {
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
            setTimeout(goBare, 2500);
          } else {
            goBare();
          }
        });
      });
    });
  }

  function check() {
    if (updating) return;
    fetch("version.json?t=" + Date.now(), { cache: "no-store" }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (v) {
      if (!v || !v.build) return;
      if (!running) { running = v.build; return; }
      if (v.build !== running) show(v.build);
      else hide();
    }).catch(function () {});
  }

  function start() {
    check();
    setInterval(check, CHECK_MS);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") check();
    });
  }

  window.SunnyUpdate = { check: check, apply: applyUpdate };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start);
})();
