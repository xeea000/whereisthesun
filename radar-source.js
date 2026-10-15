// workspace/whereisthesun/radar-source.js
/* SUNNY radar source (opt67): United States NEXRAD only, from the Iowa Environmental
 * Mesonet (IEM) n0q base reflectivity composite. Time-stamped WMS frames every 5 minutes,
 * free, no key, CORS open. Canadian radar is no longer used anywhere.
 * Areas outside NEXRAD range (Canada, Mexico, oceans, gaps) get a faint hatch drawn by
 * radar-mask.js, so a range edge never looks like clear weather.
 * Attribution: NOAA NEXRAD via Iowa Environmental Mesonet. */
(function () {
  "use strict";
  var BASE = "https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q-t.cgi";
  var LATEST = "https://mesonet.agron.iastate.edu/data/gis/images/4326/USCOMP/n0q_0.json";
  var LAYER = "nexrad-n0q-wmst";
  var STEP_MS = 5 * 60000;
  var SPAN_MS = 3 * 3600000;
  var COVER_OP = 0.45;
  var COVER_SRC = "radar-coverage";
  var ATTRIB = 'Radar: NOAA NEXRAD via <a href="https://mesonet.agron.iastate.edu/" target="_blank" rel="noopener">Iowa Environmental Mesonet</a>';
  var HALF = 20037508.342789244;
  var latestIso = null;
  var attachedMap = null;
  var coverWant = -1;
  function wmsUrl(iso, bboxText, w, h) {
    return BASE + "?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true" +
      "&LAYERS=" + LAYER + "&STYLES=&CRS=EPSG:3857&BBOX=" + bboxText +
      "&WIDTH=" + w + "&HEIGHT=" + h + (iso ? "&TIME=" + encodeURIComponent(iso) : "");
  }
  /* MapLibre tile template; also filled by fill() */
  function tileUrl(host, path) {
    void host;
    return wmsUrl(path, "{bbox-epsg-3857}", 256, 256);
  }
  function tileBbox(z, x, y) {
    var size = 2 * HALF / Math.pow(2, z);
    var minx = -HALF + x * size;
    var maxy = HALF - y * size;
    return minx + "," + (maxy - size) + "," + (minx + size) + "," + maxy;
  }
  /* One GetMap for the whole view: Play needs one request per frame, not tiles */
  function viewUrl(path, box, w, h) {
    return wmsUrl(path, box.minx + "," + box.miny + "," + box.maxx + "," + box.maxy, w, h);
  }
  function fill(tpl, z, x, y) {
    return tpl.replace("{bbox-epsg-3857}", tileBbox(z, x, y));
  }
  function isoOf(ms) {
    return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  }
  /* Latest valid time from IEM, then every 5 minutes back over the last 3 hours */
  function framesFromLatest(d) {
    var end = Date.parse(d && d.meta && d.meta.valid);
    if (!isFinite(end)) end = Math.floor((Date.now() - 10 * 60000) / STEP_MS) * STEP_MS;
    var past = [];
    for (var t = end - SPAN_MS; t <= end; t += STEP_MS) {
      past.push({ time: Math.round(t / 1000), path: isoOf(t) });
    }
    latestIso = past[past.length - 1].path;
    syncCoverage();
    return { host: "iem", radar: { past: past, nowcast: [] } };
  }
  function readJson(res) {
    if (!res.ok) throw new Error("radar latest " + res.status);
    return res.json();
  }
  /* Same shape as the RainViewer manifest: {host, radar: {past: [{time, path}]}} */
  function fetchManifest() {
    return fetch(LATEST + "?t=" + Date.now(), { cache: "no-store" }).then(readJson).then(framesFromLatest);
  }
  function radarSelected() {
    var b = document.querySelector('#overlay-seg [data-overlay="radar"]');
    return !!(b && b.getAttribute("aria-pressed") === "true");
  }
  function ensureCoverLayer(map) {
    if (!window.SunnyRadarMask || !map.getSource || !map.isStyleLoaded || !map.isStyleLoaded()) return false;
    if (!map.getSource(COVER_SRC)) {
      map.addSource(COVER_SRC, { type: "raster", tiles: [window.SunnyRadarMask.tiles()], tileSize: 256, maxzoom: 9 });
    }
    if (!map.getLayer(COVER_SRC)) {
      map.addLayer({ id: COVER_SRC, type: "raster", source: COVER_SRC,
        paint: { "raster-opacity": 0, "raster-opacity-transition": { duration: 300, delay: 0 } } });
      coverWant = -1;
    }
    if (map.getLayer("radar")) {
      try { map.moveLayer(COVER_SRC, "radar"); } catch (eMv) {}
    }
    return true;
  }
  function syncCoverage() {
    var map = attachedMap;
    if (!map) return;
    var on = radarSelected();
    try {
      if (on && !ensureCoverLayer(map)) return;
      if (!map.getLayer(COVER_SRC)) return;
      var want = on ? COVER_OP : 0;
      if (want === coverWant) return;
      coverWant = want;
      map.setPaintProperty(COVER_SRC, "raster-opacity", want);
    } catch (eSync) {}
  }
  function attach(map) {
    if (!map || attachedMap === map) return;
    attachedMap = map;
    map.on("idle", syncCoverage);
    map.on("styledata", syncCoverage);
    var btn = document.querySelector('#overlay-seg [data-overlay="radar"]');
    if (btn && window.MutationObserver) new MutationObserver(syncCoverage).observe(btn, { attributes: true });
    syncCoverage();
  }
  function state() {
    return { latest: latestIso, coverOpacity: coverWant, attached: !!attachedMap };
  }
  window.SunnyRadar = {
    ATTRIB: ATTRIB, MAX_ZOOM: 8, tileUrl: tileUrl, fill: fill, viewUrl: viewUrl,
    fetchManifest: fetchManifest, attach: attach, sync: syncCoverage, state: state
  };
})();
