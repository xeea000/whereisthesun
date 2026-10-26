// workspace/whereisthesun/base-guard.js
/* SUNNY base-map guard: base tiles load through addProtocol("sunnybase"). A missing tile (error, or the Esri
 * placeholder image, 2521 bytes) is swapped for the deepest real parent tile, cropped and stretched
 * with nearest pixels. window.SunnyBaseUrl(u) wraps a tile URL; window.SunnyBaseFake is the time of the last swap. */
(() => {
  "use strict";
  var ml = window.maplibregl, ok = false;
  var fake = (b) => { return b.size === 2521 && b.type === "image/jpeg"; };
  var get = (tpl, z, x, y, signal) => {
    var u = tpl.replace("{z}", z).replace("{x}", x).replace("{y}", y);
    return fetch(u, { signal: signal, mode: "cors" }).then((r) => { if (!r.ok) throw new Error("tile"); return r.blob(); })
      .then((b) => { if (fake(b)) throw new Error("fake"); return b; });
  };
  var deep = (tpl, z, x, y, signal, up) => {
    return get(tpl, z - up, x >> up, y >> up, signal).then((b) => { return { b: b, up: up }; }, (e) => {
      if ((signal && signal.aborted) || up >= 10 || z - up <= 0) throw e;
      return deep(tpl, z, x, y, signal, up + 1);
    });
  };
  var load = (params, abort) => {
    var m = /^sunnybase:\/\/(\d+)\/(\d+)\/(\d+)\/(.*)$/.exec(params.url);
    var z = +m[1], x = +m[2], y = +m[3], tpl = decodeURIComponent(m[4]), signal = abort && abort.signal;
    var low = window.SunnyDataSaver && window.SunnyDataSaver.low() && z > 12 ? z - 12 : 0;
    return deep(tpl, z, x, y, signal, low).then((r) => {
      if (!r.up) return r.b.arrayBuffer().then((d) => { return { data: d }; });
      if (!low || r.up > low) window.SunnyBaseFake = Date.now();
      return createImageBitmap(r.b).then((bmp) => {
        var n = 1 << r.up, w = bmp.width / n, c = document.createElement("canvas");
        c.width = c.height = 256;
        var g = c.getContext("2d");
        g.imageSmoothingEnabled = false;
        g.drawImage(bmp, (x % n) * w, (y % n) * w, w, w, 0, 0, 256, 256);
        return new Promise((res) => { c.toBlob(res, "image/png"); });
      }).then((b) => { return b.arrayBuffer(); }).then((d) => { return { data: d }; });
    });
  };
  try { if (ml && ml.addProtocol && window.createImageBitmap) { ml.addProtocol("sunnybase", load); ok = true; } } catch (e) { ok = false; }
  window.SunnyBaseUrl = (u) => { return ok ? "sunnybase://{z}/{x}/{y}/" + encodeURIComponent(u) : u; };
})();
