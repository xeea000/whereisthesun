// workspace/whereisthesun/app.js
/* SUNNY — MapLibre + NASA GIBS GOES GeoColor + Open-Meteo + local OSM beaches. No keys. */
(() => {
  "use strict";
  /* opt60: keep the address bar on the bare app URL — ?v=optNN is cache-bust only */
  try {
    if (typeof location !== "undefined" && typeof history !== "undefined" && history.replaceState) {
      var __u = new URL(location.href);
      var __v = __u.searchParams.get("v");
      if (__v && /^opt[-_]?\d+/i.test(String(__v))) {
        __u.searchParams.delete("v");
        var __q = __u.searchParams.toString();
        history.replaceState(history.state, "", __u.pathname + (__q ? "?" + __q : "") + __u.hash);
      }
    }
  } catch (eBareUrl) {}
  /* opt58: new SW claims the page → reload once so bare /whereisthesun/ gets the new shell */
  try {
    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      var __sunnySwReloaded = false;
      /* opt77: first install claiming the page is not an update, so no reload (it re-downloaded everything) */
      var __sunnyHadSw = !!navigator.serviceWorker.controller;
      function onSunnySwSwap() {
        if (__sunnySwReloaded || !__sunnyHadSw) return;
        __sunnySwReloaded = true;
        try { location.reload(); } catch (eRel) {}
      }
      navigator.serviceWorker.addEventListener("controllerchange", onSunnySwSwap);
    }
  } catch (eSwHook) {}
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => { resolve(); };
      s.onerror = () => { reject(new Error("script " + src)); };
      document.head.appendChild(s);
    });
  }
  function startSunny() {
if (typeof maplibregl === "undefined") {
    var st = document.getElementById("status");
    if (st) st.textContent = "Map toolkit failed to load. Try a refresh.";
    return;
  }
  sunnyStep01();
  sunnyStep02();
  sunnyStep03();
  sunnyStep04();
  sunnyStep05();
  sunnyStep06();
  sunnyStep07();
  sunnyStep10();
  sunnyStep11();
  sunnyStep12();
  sunnyStep13();
  sunnyStep14();
  } /* end startSunny */
  function onMapToolkitFail() {
    var st = document.getElementById("status");
    if (st) st.textContent = "Map toolkit failed to load. Try a refresh.";
  }
  if (typeof maplibregl !== "undefined") {
    startSunny();
  } else {
    loadScript("vendor/maplibre-gl.js?v=opt75").then(startSunny).catch(onMapToolkitFail);
  }
})();
