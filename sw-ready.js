// workspace/whereisthesun/sw-ready.js
/* SUNNY (opt78): resolves once the service worker controls the page, or after a short
 * timeout. Satellite frames wait for this on a first visit so the worker can keep them
 * and the next visit does not download them again. Never rejects. */
(function () {
  function controlled() {
    try { return !!navigator.serviceWorker.controller; } catch (eCtl) { return false; }
  }
  function waitForControl(ms) {
    if (!("serviceWorker" in navigator) || controlled()) return Promise.resolve(controlled());
    function waitWith(resolve) {
      var timer = setTimeout(done, ms || 1500);
      function done() {
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener("controllerchange", done);
        resolve(controlled());
      }
      navigator.serviceWorker.addEventListener("controllerchange", done);
    }
    return new Promise(waitWith);
  }
  window.SunnySwReady = waitForControl;
})();
