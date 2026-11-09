// workspace/whereisthesun/dark-spot.js
/* SUNNY darkest sky near you (t388u), part of Night-sky score: the darkest land within 100 km of the map centre
 * in NASA Black Marble night lights (VIIRS, 2016 composite, the same tiles the score reads). Ties go to the nearest spot.
 * Water and the pixels touching it are left out (water reads darkest of all, and a shore pixel mixes the two):
 * seas and the Great Lakes from the NASA GIBS OSM land and water map, other lakes by their dark blue colour.
 * Tiles at zoom 7 (about 1 km pixels at 45° N), zoom 5 with Low data. A green ring marks the spot; a line in the Tonight's sky block. */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers;
  if (!K || !L) return;
  var R = Math.PI / 180, KM = 100, map = null, here = null, spot = null, run = 0, imgs = {};
  var URL0 = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/";
  var MASK = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/OSM_Land_Water_Map/default/default/GoogleMapsCompatible_Level9/";
  /* water: grey 128 in the OSM land and water map (seas and the Great Lakes; land is 75), or Black Marble's dark water blue,
   * blue at least 2.1 times green (water glows (4, 5, 15) to (6, 7, 16); the darkest land reads about (7, 9, 17)) */
  var wet = (d, m, o) => { return (m && m[o] > 100) || d[o + 2] >= 2.1 * Math.max(1, d[o + 1]); };
  /* a pixel next to water mixes shore and water, so it reads darker than the land is */
  var shore = (d, m, px, py) => {
    for (var j = -1; j <= 1; j++) for (var i = -1; i <= 1; i++) {
      var x = px + i, y = py + j;
      if ((i || j) && x >= 0 && y >= 0 && x < 256 && y < 256 && wet(d, m, (y * 256 + x) * 4)) return true;
    }
    return false;
  };
  var tileData = (z, x, y, base) => {
    var k = (base || URL0).length + "/" + z + "/" + x + "/" + y;
    if (!imgs[k]) imgs[k] = new Promise((ok, no) => {
      var im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => { var cv = document.createElement("canvas"); cv.width = cv.height = 256; var g = cv.getContext("2d"); g.drawImage(im, 0, 0);
        ok(g.getImageData(0, 0, 256, 256).data); };
      im.onerror = () => { delete imgs[k]; no(new Error("tile")); };
      im.src = (base || URL0) + z + "/" + y + "/" + x + ".png";
    });
    return imgs[k];
  };
  var wx = (lng, n) => { return (lng + 180) / 360 * n; };
  var wy = (lat, n) => { var r = lat * R; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n; };
  var unx = (x, n) => { return x / n * 360 - 180; };
  var uny = (y, n) => { return Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) / R; };
  var compass = (az) => { return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(((az % 360) + 360) % 360 / 45) % 8]; };
  /* scan the land pixels within KM of (lat, lng); returns { lat, lng, lum, here, km, az } */
  var find = (lat, lng) => {
    var z = window.SunnyDataSaver && window.SunnyDataSaver.low() ? 5 : 7, n = 256 * Math.pow(2, z), t = n / 256;
    var cx = wx(lng, n), cy = wy(lat, n), rpx = KM / (40075 * Math.cos(lat * R) / n);
    var tx0 = Math.floor((cx - rpx) / 256), tx1 = Math.floor((cx + rpx) / 256);
    var ty0 = Math.max(0, Math.floor((cy - rpx) / 256)), ty1 = Math.min(t - 1, Math.floor((cy + rpx) / 256));
    var jobs = [];
    for (var tx = tx0; tx <= tx1; tx++) for (var ty = ty0; ty <= ty1; ty++) jobs.push([tx, ty]);
    var get = (j, base) => { return tileData(z, ((j[0] % t) + t) % t, j[1], base).catch(() => { return null; }); };
    return Promise.all(jobs.map((j) => { return Promise.all([get(j), get(j, MASK)]); })).then((ds) => {
      var best = null, hereLum = null;
      ds.forEach((dm, i) => {
        var d = dm[0], m = dm[1];
        if (!d) return;
        var ox = jobs[i][0] * 256, oy = jobs[i][1] * 256;
        for (var py = 0; py < 256; py++) for (var px = 0; px < 256; px++) {
          var dx = ox + px + 0.5 - cx, dy = oy + py + 0.5 - cy, dd = dx * dx + dy * dy;
          if (dd > rpx * rpx) continue;
          var o = (py * 256 + px) * 4, lum = 0.3 * d[o] + 0.59 * d[o + 1] + 0.11 * d[o + 2];
          if (dd < 2) hereLum = lum;
          if (wet(d, m, o) || shore(d, m, px, py)) continue;
          if (!best || lum < best.lum - 0.5 || (Math.abs(lum - best.lum) <= 0.5 && dd < best.dd)) best = { lum: lum, dd: dd, x: ox + px + 0.5, y: oy + py + 0.5 };
        }
      });
      if (!best) return null;
      var km = Math.sqrt(best.dd) * 40075 * Math.cos(lat * R) / n, az = Math.atan2(best.x - cx, cy - best.y) / R;
      return { lat: uny(best.y, n), lng: unx(best.x, n), lum: Math.round(best.lum), here: hereLum == null ? null : Math.round(hereLum), km: Math.round(km), az: az };
    });
  };
  var lines = () => {
    if (!here) return [];
    if (!spot) return ["🌑 Darkest sky within " + KM + " km: working…"];
    if (spot === "none") return ["🌑 Darkest sky within " + KM + " km: only water nearby"];
    return ["🌑 Darkest sky within " + KM + " km: " + (spot.km < 2 ? "right here" : spot.km + " km " + compass(spot.az)) + " · night light " + spot.lum + "/255" +
      (spot.here != null ? " (map centre " + spot.here + "/255)" : "")];
  };
  var draw = () => {
    var on = L.isOn("nightscore") && spot && spot !== "none";
    try {
      var g = K.fc(on ? [{ type: "Feature", properties: { lum: spot.lum, km: spot.km }, geometry: { type: "Point", coordinates: [spot.lng, spot.lat] } }] : []);
      if (map.getSource("dark-spot")) map.getSource("dark-spot").setData(g);
      else {
        map.addSource("dark-spot", { type: "geojson", data: g, attribution: "Darkest sky: NASA Black Marble 2016" });
        map.addLayer({ id: "dark-spot", type: "circle", source: "dark-spot", paint: { "circle-radius": K.markerScale.bind(map, "dark-spot", "circle-radius", 8),
          "circle-color": "#0b1d3a", "circle-stroke-color": "#1a9850", "circle-stroke-width": 3 } });
      }
    } catch (e) { return; }
    K.vis(map, ["dark-spot"], !!on);
  };
  var redo = () => {
    var I = window.SunnySky;
    if (I && I.render) I.render();
    draw();
  };
  var moved = () => {
    if (!map || !L.isOn("nightscore")) { if (map) draw(); return; }
    var c = map.getCenter();
    if (here && Math.abs(c.lat - here.lat) < 0.3 && Math.abs(c.lng - here.lng) < 0.3 && spot) { draw(); return; }
    here = { lat: c.lat, lng: c.lng }; spot = null;
    var r = ++run;
    redo();
    find(c.lat, c.lng).then((s) => { if (r === run) { spot = s || "none"; redo(); } }).catch(() => {});
  };
  window.SunnyDarkSpot = { lines: lines, refresh: moved };
  L.add({ id: "darkspot-attach", group: "none", taps: ["dark-spot"], attach: (m) => {
    map = m;
    map.on("moveend", () => { setTimeout(moved, 600); });
    map.on("idle", () => { if (L.isOn("nightscore") && spot && !map.getLayer("dark-spot")) draw(); });
    map.on("click", "dark-spot", (e) => {
      K.show(map, e.lngLat, "Darkest sky within " + KM + " km", ["Night light " + spot.lum + " out of 255 here (lower is darker)",
        spot.km < 2 ? "At the map centre" : spot.km + " km " + compass(spot.az) + " of the map centre", "Water left out; lights as of 2016"],
      ["NASA Black Marble (VIIRS, 2016)", "https://earthobservatory.nasa.gov/features/NightLights"]);
    });
    (window.SunnyHoverName = window.SunnyHoverName || {})["dark-spot"] = () => {
      return Promise.resolve(["Darkest sky within " + KM + " km", "night light " + spot.lum + "/255"]); };
    moved();
  } });
})();
