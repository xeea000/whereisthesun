// workspace/whereisthesun/sun-hours.js
/* SUNNY Sun hours: an estimate of direct sun over the current calendar day on a clear day, with shade from hills, buildings and woods.
 * Worked out in the browser for the current view from zoom 13: terrain from the keyless AWS Terrarium tiles,
 * building heights and wooded areas from OpenFreeMap vector tiles (OSM). Sun sampled every 15 minutes.
 * Each cell marches toward the sun over a height grid three times the view, so hills just outside it still cast shade.
 * Trees are 12 m and always in leaf; buildings without a height are 8 m. ShadeMap needs a key, so this is its own small model. */
(() => {
  "use strict";
  var L = window.SunnyLayers, K = window.SunnyKit;
  var viewKey = "", ID = "sunh", N = 300, MINZ = 13, R = Math.PI / 180, timer = null, last = null, run = 0;
  var RAMP = [[0, "#1b1f5e"], [2, "#3b3fa0"], [4, "#7a4aa8"], [6, "#c0567f"], [8, "#ef8a3c"], [10, "#ffc93a"], [12, "#fff3a0"]];
  var DEM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/";
  var sunAt = (t, lat, lon) => {
    var d = t / 864e5 - 10957.5, g = (357.529 + 0.98560028 * d) * R, q = 280.459 + 0.98564736 * d;
    var lam = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * R, e = (23.439 - 3.6e-7 * d) * R;
    var dec = Math.asin(Math.sin(e) * Math.sin(lam)), ra = Math.atan2(Math.cos(e) * Math.sin(lam), Math.cos(lam)) / R;
    var H = ((18.697374558 + 24.06570982441908 * d) % 24 * 15 + lon - ra) * R, p = lat * R;
    var alt = Math.asin(Math.sin(p) * Math.sin(dec) + Math.cos(p) * Math.cos(dec) * Math.cos(H));
    var az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(p) - Math.sin(p) * Math.cos(H)); /* from north, clockwise */
    return { alt: alt, az: az };
  };
  var mx = (lon) => { return (lon + 180) / 360; };
  var my = (lat) => { var s = Math.sin(lat * R); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
  var img = (u) => { return new Promise((ok, no) => { var i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => { ok(i); }; i.onerror = no; i.src = u; }); };
  /* terrain heights for the outer grid (3N x 3N cells over [x0, y0] + 3N * c) */
  var terrain = (x0, y0, c, z, M) => {
    var n = 1 << z, tx0 = Math.floor(x0 * n), ty0 = Math.floor(y0 * n), tx1 = Math.floor((x0 + M * c) * n), ty1 = Math.floor((y0 + M * c) * n);
    var cv = document.createElement("canvas"), W = (tx1 - tx0 + 1) * 256, H = (ty1 - ty0 + 1) * 256;
    cv.width = W; cv.height = H;
    var g = cv.getContext("2d"), jobs = [];
    for (var tx = tx0; tx <= tx1; tx++) for (var ty = ty0; ty <= ty1; ty++) {
      ((a, b) => {
        jobs.push(img(DEM + z + "/" + (((a % n) + n) % n) + "/" + b + ".png").then((i) => { g.drawImage(i, (a - tx0) * 256, (b - ty0) * 256); }).catch(() => {}));
      })(tx, ty);
    }
    return Promise.all(jobs).then(() => {
      var px = g.getImageData(0, 0, W, H).data, h = new Float32Array(M * M);
      for (var j = 0; j < M; j++) for (var i = 0; i < M; i++) {
        var u = Math.min(W - 1, Math.floor(((x0 + (i + 0.5) * c) * n - tx0) * 256)), v = Math.min(H - 1, Math.floor(((y0 + (j + 0.5) * c) * n - ty0) * 256)), k = (v * W + u) * 4;
        h[j * M + i] = px[k + 3] ? px[k] * 256 + px[k + 1] + px[k + 2] / 256 - 32768 : 0;
      }
      return h;
    });
  };
  /* buildings and woods drawn into the inner N x N cells, height in metres = grey value * 2 */
  var objects = (map, x0, y0, c, cm, trees) => {
    var cv = document.createElement("canvas"); cv.width = cv.height = N;
    var g = cv.getContext("2d"), q = (lay) => { try { return map.querySourceFeatures(ID + "-omt", { sourceLayer: lay }); } catch (e) { return []; } };
    var ring = (r) => { r.forEach((p, i) => { var u = (mx(p[0]) - x0) / c, v = (my(p[1]) - y0) / c; if (i) g.lineTo(u, v); else g.moveTo(u, v); }); g.closePath(); };
    var poly = (f, hm) => {
      var gm = f.geometry, ps = gm.type === "Polygon" ? [gm.coordinates] : gm.type === "MultiPolygon" ? gm.coordinates : [];
      var v = Math.max(1, Math.min(255, Math.round(hm / 2)));
      g.fillStyle = "rgb(" + v + "," + v + "," + v + ")"; g.beginPath(); ps.forEach((p) => { p.forEach(ring); }); g.fill("evenodd");
    };
    q("landcover").filter((f) => { return f.properties.class === "wood"; }).forEach((f) => { poly(f, 12); });
    var bs = q("building").map((f) => { return [f, +f.properties.render_height || 8]; });
    bs.sort((a, b) => { return a[1] - b[1]; }).forEach((b) => { poly(b[0], b[1]); });
    (trees || []).forEach((t) => { /* single OSM trees: 10 m, crown about 8 m across */
      var u = (mx(t[1]) - x0) / c, v = (my(t[0]) - y0) / c;
      g.fillStyle = "rgb(5,5,5)"; g.beginPath(); g.arc(u, v, Math.max(0.5, 4 / cm), 0, 7); g.fill();
    });
    var px = g.getImageData(0, 0, N, N).data, o = new Float32Array(N * N);
    for (var k = 0; k < N * N; k++) o[k] = px[k * 4] * 2;
    return { h: o, nb: bs.length, nt: (trees || []).length };
  };
  var treeKey = "", treeList = null;
  var treesFor = (b, z) => {
    if (z < 15) return Promise.resolve(null);
    var k = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((v) => { return v.toFixed(3); }).join(",");
    if (k === treeKey) return Promise.resolve(treeList);
    var q = "[out:json][timeout:15];node[natural=tree](" + k + ");out skel;";
    var t = K.overpass(q).then((j) => { treeKey = k; treeList = j.elements.map((e) => { return [e.lat, e.lon]; }); return treeList; }).catch(() => { return null; });
    return Promise.race([t, new Promise((ok) => { setTimeout(() => { ok(null); }, 8000); })]);
  };
  /* Esri / Impact Observatory Sentinel-2 10 m land cover, raw classes (2 = trees) for the view, one N x N image */
  var LC = "https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/exportImage";
  var cover = (x0, y0, c) => {
    var E = 40075016.686, b = [x0 * E - E / 2, E / 2 - (y0 + N * c) * E, (x0 + N * c) * E - E / 2, E / 2 - y0 * E].map((v) => { return v.toFixed(1); });
    var u = LC + "?bbox=" + b.join(",") + "&bboxSR=3857&imageSR=3857&size=" + N + "," + N + "&format=png&f=image&renderingRule=%7B%22rasterFunction%22%3A%22None%22%7D";
    return img(u).then((i) => {
      var cv = document.createElement("canvas"); cv.width = cv.height = N;
      var g = cv.getContext("2d"); g.drawImage(i, 0, 0, N, N);
      var px = g.getImageData(0, 0, N, N).data, o = new Uint8Array(N * N);
      for (var k = 0; k < N * N; k++) o[k] = px[k * 4];
      return o;
    }).catch(() => { return null; });
  };
  /* separable gaussian, sigma about 1.2 cells, so there are no hard cell edges */
  var blur = (a) => {
    var w = [0.07, 0.24, 0.38, 0.24, 0.07], t = new Float32Array(N * N), o = new Float32Array(N * N), i, j, k;
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) { var s = 0; for (k = -2; k <= 2; k++) s += w[k + 2] * a[j * N + Math.max(0, Math.min(N - 1, i + k))]; t[j * N + i] = s; }
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) { var s2 = 0; for (k = -2; k <= 2; k++) s2 += w[k + 2] * t[Math.max(0, Math.min(N - 1, j + k)) * N + i]; o[j * N + i] = s2; }
    return o;
  };
  var compute = (map) => {
    var b0 = map.getBounds(), vk = b0.toArray().join(",") + map.getZoom().toFixed(2);
    if (vk === viewKey) return; /* the map also fires moveend without moving; keep the run in flight */
    viewKey = vk;
    var my0 = ++run, b = b0, z = map.getZoom();
    if (z < MINZ - 0.01) { clear(map); return; }
    var x0 = mx(b.getWest()), x1 = mx(b.getEast()), y0 = my(b.getNorth()), y1 = my(b.getSouth());
    var c = Math.max(x1 - x0, y1 - y0) / N, ox = x0 - N * c, oy = y0 - N * c, lat = map.getCenter().lat, lon = map.getCenter().lng;
    var cm = c * 40075016.7 * Math.cos(lat * R), dz = Math.max(8, Math.min(12, Math.floor(z) - 3)), fz = Math.min(14, Math.floor(z) - 1);
    Promise.all([terrain(ox, oy, c, dz, 3 * N), treesFor(b, z), terrain(x0, y0, c, fz, N), cover(x0, y0, c)]).then((tt) => {
      var h = tt[0], fine = tt[2], lc = tt[3];
      if (my0 !== run) return;
      var ob = objects(map, x0, y0, c, cm, tt[1]), M = 3 * N, ne = 0;
      for (var q = 0; q < N * N; q++) { /* Sentinel-2 trees where OSM maps no wood or building: 15 m, an estimate */
        if (lc && lc[q] === 2 && !ob.h[q]) { ob.h[q] = 15; ne++; }
        h[(Math.floor(q / N) + N) * M + (q % N) + N] = fine[q]; /* finer terrain inside the view */
      }
      var sun = [], day = new Date(); day.setHours(0, 0, 0, 0);
      var k;
      for (var t = 0; t < 96; t++) { var s = sunAt(day.getTime() + t * 9e5 + 4.5e5, lat, lon); if (s.alt > 0.005) sun.push([Math.sin(s.az), -Math.cos(s.az), Math.tan(s.alt)]); }
      for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) h[(j + N) * M + i + N] += ob.h[j * N + i];
      var hmax = -1e9; for (k = 0; k < M * M; k++) if (h[k] > hmax) hmax = h[k];
      var hrs = new Float32Array(N * N), top = 0;
      for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
        var gi = (j + N) * M + i + N, h0 = h[gi] + 1, lit = 0;
        for (k = 0; k < sun.length; k++) {
          var dx = sun[k][0], dy = sun[k][1], tn = sun[k][2], d = 0.7, st = 0.7, sh = false;
          while (true) {
            var u = Math.round(i + N + dx * d), v = Math.round(j + N + dy * d);
            if (u < 0 || v < 0 || u >= M || v >= M) break;
            var need = h0 + d * cm * tn;
            if (need > hmax) break; /* nothing in the grid is that tall */
            if (h[v * M + u] > need) { sh = true; break; }
            d += st; st = Math.min(st * 1.08, 6);
          }
          if (!sh) lit++;
        }
        hrs[j * N + i] = lit / 4; if (lit / 4 > top) top = lit / 4;
      }
      hrs = blur(hrs);
      last = { x0: x0, y0: y0, c: c, n: N, hrs: hrs, day: sun.length / 4, nb: ob.nb, nt: ob.nt, ne: ne, lc: !!lc };
      draw(map, x0, y0, c, hrs, z);
    }).catch((e) => { console.error("sun hours", e); });
  };
  var col = (v) => {
    for (var i = 1; i < RAMP.length; i++) if (v <= RAMP[i][0]) {
      var a = RAMP[i - 1], b = RAMP[i], f = (v - a[0]) / (b[0] - a[0]), p = (s, o) => { return parseInt(s.substr(o, 2), 16); };
      return [1, 3, 5].map((o) => { return Math.round(p(a[1], o) + (p(b[1], o) - p(a[1], o)) * f); });
    }
    return [255, 243, 160];
  };
  var inv = (y) => { return Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) / R; };
  var draw = (map, x0, y0, c, hrs, z) => {
    var cv = document.createElement("canvas"); cv.width = cv.height = N;
    var g = cv.getContext("2d"), im = g.createImageData(N, N);
    for (var k = 0; k < N * N; k++) { var cc = col(hrs[k]); im.data[k * 4] = cc[0]; im.data[k * 4 + 1] = cc[1]; im.data[k * 4 + 2] = cc[2]; im.data[k * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
    var w = x0 * 360 - 180, e = (x0 + N * c) * 360 - 180, n = inv(y0), s = inv(y0 + N * c);
    var co = [[w, n], [e, n], [e, s], [w, s]], src = map.getSource(ID);
    if (src) src.updateImage({ url: cv.toDataURL(), coordinates: co });
    else {
      map.addSource(ID, { type: "image", url: cv.toDataURL(), coordinates: co });
      map.addLayer({ id: ID, type: "raster", source: ID, paint: { "raster-opacity": 0.6 } }, K.before(map));
      map.addSource(ID + "-hit", { type: "geojson", data: K.fc([]) });
      map.addLayer({ id: ID + "-hit", type: "fill", source: ID + "-hit", paint: { "fill-opacity": 0 } });
    }
    map.setPaintProperty(ID, "raster-resampling", "linear");
    map.getSource(ID + "-hit").setData(K.fc([{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [co.concat([co[0]])] } }]));
    K.vis(map, [ID, ID + "-hit"], true);
  };
  var clear = (map) => { last = null; viewKey = ""; K.vis(map, [ID, ID + "-hit"], false); };
  var ensure = (map) => {
    if (map.getSource(ID + "-omt")) return;
    map.addSource(ID + "-omt", { type: "vector", url: "https://tiles.openfreemap.org/planet",
      attribution: "Sun hours: estimate from AWS Terrarium terrain and OpenFreeMap (OSM) buildings, Esri/Impact Observatory Sentinel-2 land cover" });
    ["building", "landcover"].forEach((l) => { map.addLayer({ id: ID + "-q-" + l, type: "fill", source: ID + "-omt", "source-layer": l, minzoom: MINZ,
      paint: { "fill-opacity": 0 } }); });
  };
  var later = (map) => { clearTimeout(timer); var tries = 0;
    var go = () => { var ok = false; try { ok = map.isSourceLoaded(ID + "-omt"); } catch (e) {} if (ok || ++tries > 12) compute(map); else timer = setTimeout(go, 500); };
    timer = setTimeout(go, 900); };
  var apply = (map, on) => {
    if (!on) { run++; viewKey = ""; clearTimeout(timer); if (map.getLayer(ID)) K.vis(map, [ID, ID + "-hit", ID + "-q-building", ID + "-q-landcover"], false); return; }
    try { ensure(map); } catch (e) { setTimeout(() => { if (L.isOn("sunhours")) apply(map, true); }, 2000); return; }
    K.vis(map, [ID + "-q-building", ID + "-q-landcover"], true);
    later(map);
  };
  var at = (ll) => {
    if (!last) return null;
    var i = Math.floor((mx(ll.lng) - last.x0) / last.c), j = Math.floor((my(ll.lat) - last.y0) / last.c);
    return i < 0 || j < 0 || i >= last.n || j >= last.n ? null : last.hrs[j * last.n + i];
  };
  var fmt = (v) => { return (Math.round(v * 4) / 4).toFixed(2).replace(/\.?0+$/, "") + " h"; };
  window.SunnySunHours = { at: at, fmt: fmt, last: () => { return last; } };
  L.add({ id: "sunhours", name: "Sun hours (estimate)", icon: "⏱️", group: "Sky & Space", taps: [ID + "-hit"], dflt: true, apply: apply,
    legend: K.legRamp(RAMP.map((r) => { return r[1]; }).join(","), "0 h", "6 h", "12+ h"),
    tip: "Estimated hours of direct sun today on a clear day: shade from hills, buildings, woods; satellite tree cover fills gaps in OSM (estimate). Zoom 13+; tap for the value",
    attach: (map, on) => {
      map.on("moveend", () => { if (L.isOn("sunhours")) later(map); });
      map.on("click", ID + "-hit", (e) => {
        var v = at(e.lngLat);
        if (v == null) return;
        K.show(map, e.lngLat, "About " + fmt(v) + " of direct sun today", ["Open sky here would give " + fmt(last.day),
          "Estimate: clear sky, terrain, " + last.nb + " building shapes" + (last.nt ? ", " + last.nt + " single trees" : "") + "; woods 12 m, in leaf",
          last.lc ? last.ne + " cells of trees from satellite land cover (no OSM wood there) set to 15 m: estimate" : "Satellite land cover unavailable",
          "Zoom 13 or closer; redrawn when the map moves"],
          ["AWS Terrarium terrain, OpenFreeMap (OSM), Esri/Impact Observatory Sentinel-2 land cover (CC BY 4.0)",
          "https://registry.opendata.aws/terrain-tiles/"]);
      });
      apply(map, on);
    } });
})();
