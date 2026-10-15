// workspace/whereisthesun/radar-source.js
/* SUNNY radar source (opt65): Environment and Climate Change Canada MSC GeoMet.
 * RADAR_1KM_RRAI is one 1 km North American composite (Canadian radars plus United States NEXRAD),
 * every 6 minutes for the last 3 hours, free, no key, CORS open. Using one composite
 * everywhere gives one colour scale and no seams between countries.
 * Areas no radar reaches are drawn with GeoMet's own coverage layer as a faint hatch,
 * so a range edge never looks like clear weather.
 * Licence: Open Government Licence - Canada. Attribution: ECCC MSC GeoMet. */
(function () {
  "use strict";
  var BASE = "https://geo.weather.gc.ca/geomet";
  var LAYER = "RADAR_1KM_RRAI";
  var COVER_LAYER = "RADAR_COVERAGE_RRAI.INV";
  var COVER_STYLE = "Radar-Coverage_Inv-HatchFill";
  var COVER_OP = 0.45;
  var COVER_SRC = "radar-coverage";
  var ATTRIB = 'Radar: <a href="https://eccc-msc.github.io/open-data/msc-geomet/readme_en/" target="_blank" rel="noopener">ECCC MSC GeoMet</a> (incl. NOAA NEXRAD), OGL-Canada';
  var HALF = 20037508.342789244;
  var latestIso = null;
  var attachedMap = null;
  var coverWant = -1;
  function wmsUrl(layer, style, iso, bboxText, w, h) {
    return BASE + "?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true" +
      "&LAYERS=" + layer + "&STYLES=" + style + "&CRS=EPSG:3857&BBOX=" + bboxText +
      "&WIDTH=" + w + "&HEIGHT=" + h + (iso ? "&TIME=" + encodeURIComponent(iso) : "");
  }
  /* MapLibre tile template; also filled by fill() for the Play composite */
  function tileUrl(host, path) {
    void host;
    return wmsUrl(LAYER, "", path, "{bbox-epsg-3857}", 256, 256);
  }
  function tileBbox(z, x, y) {
    var size = 2 * HALF / Math.pow(2, z);
    var minx = -HALF + x * size;
    var maxy = HALF - y * size;
    return minx + "," + (maxy - size) + "," + (minx + size) + "," + maxy;
  }
  /* One GetMap for the whole view: the Play composite needs one request per frame, not tiles */
  function viewUrl(path, box, w, h) {
    return wmsUrl(LAYER, "", path, box.minx + "," + box.miny + "," + box.maxx + "," + box.maxy, w, h);
  }
  function fill(tpl, z, x, y) {
    return tpl.replace("{bbox-epsg-3857}", tileBbox(z, x, y));
  }
  function parseIsoMs(s) {
    return Date.parse(s);
  }
  function isoOf(ms) {
    return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  }
  /* Frames from the time dimension "start/end/PT6M" in GetCapabilities */
  function framesFromCaps(xml) {
    var m = /<Dimension[^>]*name="time"[^>]*>([^<]+)</.exec(xml);
    if (!m) throw new Error("radar times");
    var parts = m[1].trim().split("/");
    var start = parseIsoMs(parts[0]);
    var end = parseIsoMs(parts[1]);
    var step = /PT(\d+)M/.exec(parts[2] || "PT6M");
    var stepMs = (step ? Number(step[1]) : 6) * 60000;
    var past = [];
    for (var t = start; t <= end + 1; t += stepMs) {
      var iso = isoOf(t);
      past.push({ time: Math.round(t / 1000), path: iso });
    }
    latestIso = past.length ? past[past.length - 1].path : null;
    syncCoverage();
    return { host: "geomet", radar: { past: past, nowcast: [] } };
  }
  function readText(res) {
    if (!res.ok) throw new Error("radar caps " + res.status);
    return res.text();
  }
  /* Same shape as the RainViewer manifest: {host, radar: {past: [{time, path}]}} */
  function fetchManifest() {
    var url = BASE + "?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities&LAYERS=" + LAYER + "&t=" + Date.now();
    return fetch(url, { cache: "no-store" }).then(readText).then(framesFromCaps);
  }
  function radarSelected() {
    var b = document.querySelector('#overlay-seg [data-overlay="radar"]');
    return !!(b && b.getAttribute("aria-pressed") === "true");
  }
  function coverTiles() {
    return wmsUrl(COVER_LAYER, COVER_STYLE, latestIso, "{bbox-epsg-3857}", 256, 256);
  }
  function ensureCoverLayer(map) {
    if (!latestIso || !map.getSource || !map.isStyleLoaded || !map.isStyleLoaded()) return false;
    var src = map.getSource(COVER_SRC);
    if (!src) {
      map.addSource(COVER_SRC, { type: "raster", tiles: [coverTiles()], tileSize: 256, attribution: ATTRIB });
    } else if (src.setTiles && src.tiles && src.tiles[0] !== coverTiles()) {
      src.setTiles([coverTiles()]);
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
