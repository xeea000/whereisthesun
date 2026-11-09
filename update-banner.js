// workspace/whereisthesun/update-banner.js
/* SUNNY update banner (opt61). Polls version.json; when the deployed build differs from the
 * running build (the page's own sunny-build meta), shows "Update ready" with an UPDATE button. Shows on every screen.
 * Coming back to the app after 10 minutes or more in the background on an older build updates right away. */
(function () {
  "use strict";
  var CHECK_MS = 3 * 60 * 1000;
  var running = null;
  var shownFor = null;
  var dismissedFor = null;
  var updating = false;
  var banner = null;
  var hiddenAt = 0;
  var STALE_MS = 10 * 60 * 1000;
  try {
    var meta = document.querySelector('meta[name="sunny-build"]');
    if (meta) running = meta.getAttribute("content") || null;
  } catch (eSelf) {}
  function bareUrl() {
    var u = new URL(location.href);
    u.searchParams.delete("v");
    var q = u.searchParams.toString();
    return u.pathname + (q ? "?" + q : "") + u.hash;
  }
  function onDismiss() {
    dismissedFor = shownFor;
    hide();
  }
  function build() {
    var el = document.createElement("div");
    el.className = "update-banner";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.innerHTML =
      '<span class="update-banner-text">Update ready</span>' +
      '<button type="button" class="update-banner-go">UPDATE</button>' +
      '<button type="button" class="update-banner-close" aria-label="Dismiss">\u00d7</button>';
    el.querySelector(".update-banner-go").addEventListener("click", applyUpdate);
    el.querySelector(".update-banner-close").addEventListener("click", onDismiss);
    document.body.appendChild(el);
    return el;
  }
  function slideIn() {
    banner.classList.add("is-on");
  }
  function show(next) {
    if (updating || next === dismissedFor) return;
    shownFor = next;
    if (!banner) banner = build();
    banner.hidden = false;
    requestAnimationFrame(slideIn);
  }
  function hide() {
    if (!banner) return;
    banner.classList.remove("is-on");
    banner.hidden = true;
  }
  /* only the app files cache; saved offline regions, data and map tiles stay */
  function isSunnyCache(key) {
    return key.indexOf("sunny-app-") === 0;
  }
  function deleteCache(key) {
    return caches.delete(key);
  }
  function deleteSunnyCaches(keys) {
    return Promise.all(keys.filter(isSunnyCache).map(deleteCache));
  }
  function ignore() {}
  function clearCaches() {
    if (!window.caches || !caches.keys) return Promise.resolve();
    return caches.keys().then(deleteSunnyCaches).catch(ignore);
  }
  function goBare() {
    try { location.replace(bareUrl()); } catch (eGo) { location.reload(); }
  }
  function nullOnError() {
    return null;
  }
  function waitExecutor(resolve) {
    setTimeout(resolve, 1500);
  }
  function waitBriefly() {
    return new Promise(waitExecutor);
  }
  /* A waiting worker takes over; app.js then reloads once on controllerchange. goBare is the fallback. */
  function activateOrReload(reg) {
    if (reg && reg.waiting) {
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
      setTimeout(goBare, 2500);
      return;
    }
    goBare();
  }
  function afterClear(reg) {
    if (reg && reg.waiting) return activateOrReload(reg);
    var upd = reg && reg.update ? reg.update().catch(ignore) : Promise.resolve();
    return Promise.race([upd, waitBriefly()]).then(activateOrReload.bind(null, reg));
  }
  function withRegistration(reg) {
    return clearCaches().then(afterClear.bind(null, reg));
  }
  function applyUpdate() {
    if (updating) return;
    updating = true;
    var btn = banner && banner.querySelector(".update-banner-go");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Updating\u2026";
    }
    var sw = navigator.serviceWorker;
    var regP = sw && sw.getRegistration ? sw.getRegistration().catch(nullOnError) : Promise.resolve(null);
    regP.then(withRegistration);
  }
  function readJson(r) {
    return r.ok ? r.json() : null;
  }
  function compare(v, resumed) {
    if (!v || !v.build) return;
    if (!running) {
      running = v.build;
      return;
    }
    if (v.build === running) { hide(); return; }
    if (resumed) applyUpdate();
    else show(v.build);
  }
  function check(resumed) {
    if (updating) return;
    try {
      /* Only pause while the GPS card is on screen — still offer UPDATE after confirm. */
      var el = document.getElementById("geo-ask");
      if (el && !el.hidden) return;
    } catch (eHold) {}
    fetch("version.json?t=" + Date.now(), { cache: "no-store" }).then(readJson).then((v) => { compare(v, resumed); }).catch(ignore);
  }
  function onVisible() {
    if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
    check(hiddenAt > 0 && Date.now() - hiddenAt >= STALE_MS);
  }
  function start() {
    check();
    setInterval(() => { check(); }, CHECK_MS);
    document.addEventListener("visibilitychange", onVisible);
  }
  window.SunnyUpdate = { check: check, apply: applyUpdate, running: () => { return running; } };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start);
})();
