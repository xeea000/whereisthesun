// workspace/whereisthesun/layer-kit.js
/* SUNNY layer helpers (opt94), shared by the opt94 layers. Everything here is data-light:
 *   store    small localStorage cache with an expiry, so slow-changing data is fetched rarely
 *   tiles    viewport loader: splits the view into zoom-10 tiles, loads only missing tiles,
 *            waits for the map to stop moving, and only above a zoom threshold
 *   popup    the same tap card the Craters layer uses */
(() => {
  "use strict";
  var popup = null;
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  /* src is "text" or ["text", "https://record-or-dataset-page"]; every card ends with a link */
  function srcHtml(src) {
    var s = Array.isArray(src) ? src : [src, ""];
    var a = s[1] ? '<a href="' + esc(s[1]) + '" target="_blank" rel="noopener">' + esc(s[0]) + "</a>" : esc(s[0]);
    return '<div class="pf-src">Source: ' + a + "</div>";
  }
  function show(map, lngLat, title, lines, src) {
    var html = '<div class="pf-now"><span class="pf-facts"><b>' + esc(title) + "</b>" +
      lines.filter(Boolean).map((l) => { return "<br>" + l; }).join("") +
      '</span></div>' + srcHtml(src);
    popup = new window.maplibregl.Popup({ closeButton: true, maxWidth: "280px", className: "pf-popup", offset: 8 });
    popup.setLngLat(lngLat).setHTML(html).addTo(map);
  }
  function before(map) {
    var ids = ["obs-cluster", "craters-fill", "beaches-fill", "beaches-line", "beaches-dot"];
    for (var i = 0; i < ids.length; i++) if (map.getLayer(ids[i])) return ids[i];
    return undefined;
  }
  function vis(map, ids, on) {
    ids.forEach((id) => {
      var want = on ? "visible" : "none";
      if (map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== want) map.setLayoutProperty(id, "visibility", want);
    });
  }
  function getStore(key) {
    try {
      var v = JSON.parse(localStorage.getItem("sunny-c-" + key));
      if (v && v.t > Date.now()) return v.d;
    } catch (e) {}
    return null;
  }
  function putStore(key, data, ttlMs) {
    var s = JSON.stringify({ t: Date.now() + ttlMs, d: data });
    try {
      localStorage.setItem("sunny-c-" + key, s);
    } catch (e) {
      prune();
      try { localStorage.setItem("sunny-c-" + key, s); } catch (e2) {}
    }
  }
  /* full storage: drop the SUNNY tile caches (they reload a piece at a time) */
  function prune() {
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && k.indexOf("sunny-c-t-") === 0) localStorage.removeItem(k);
      }
    } catch (e) {}
  }
  var json = {};
  function loadJson(url) {
    if (!json[url]) {
      json[url] = fetch(url).then((r) => {
        if (!r.ok) throw new Error(url + " " + r.status);
        return r.json();
      });
      json[url].catch(() => { delete json[url]; });
    }
    return json[url];
  }
  function tileOf(lng, lat, z) {
    var n = Math.pow(2, z);
    var x = Math.floor((lng + 180) / 360 * n);
    var r = lat * Math.PI / 180;
    var y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n);
    return [Math.max(0, Math.min(n - 1, x)), Math.max(0, Math.min(n - 1, y))];
  }
  function tileBox(x, y, z) {
    var n = Math.pow(2, z);
    function lat(yy) {
      return Math.atan(Math.sinh(Math.PI * (1 - 2 * yy / n))) * 180 / Math.PI;
    }
    return [x / n * 360 - 180, lat(y + 1), (x + 1) / n * 360 - 180, lat(y)];
  }
  /* opts: { key, minZoom, maxTiles, ttlMs, fetchTile(box) -> Promise<array>, onData(allItems) , isOn() } */
  function tiles(map, opts) {
    var Z = 10;
    var mem = {};
    var timer = null;
    var busy = false;
    function wanted() {
      var b = map.getBounds();
      var a = tileOf(b.getWest(), b.getNorth(), Z);
      var c = tileOf(b.getEast(), b.getSouth(), Z);
      var out = [];
      for (var x = a[0]; x <= c[0]; x++) for (var y = a[1]; y <= c[1]; y++) out.push(x + "/" + y);
      return out;
    }
    function emit(list) {
      var all = [];
      list.forEach((k) => { if (mem[k]) all = all.concat(mem[k]); });
      opts.onData(all);
    }
    function run() {
      timer = null;
      if (!opts.isOn() || map.getZoom() < opts.minZoom || busy) return;
      var list = wanted();
      if (list.length > (opts.maxTiles || 6)) return;
      var missing = [];
      list.forEach((k) => {
        if (mem[k]) return;
        var c = getStore("t-" + opts.key + "-" + k);
        if (c) mem[k] = c;
        else missing.push(k);
      });
      emit(list);
      if (!missing.length) return;
      busy = true;
      var k = missing[0];
      var p = k.split("/");
      opts.fetchTile(tileBox(+p[0], +p[1], Z)).then((items) => {
        mem[k] = items;
        putStore("t-" + opts.key + "-" + k, items, opts.ttlMs);
        emit(list);
        busy = false;
        if (missing.length > 1) schedule(1500);
      }).catch(() => {
        busy = false;
        schedule(30000);
      });
    }
    function schedule(ms) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, ms == null ? 700 : ms);
    }
    map.on("moveend", () => { schedule(); });
    return { refresh: schedule };
  }
  /* main Overpass server first, then public mirrors when it is busy */
  var OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"];
  function overpass(ql, i) {
    i = i || 0;
    return fetch(OVERPASS[i] + "?data=" + encodeURIComponent(ql)).then((r) => {
      if (!r.ok) throw new Error("overpass " + r.status);
      return r.json();
    }).catch((e) => {
      if (i + 1 < OVERPASS.length) return overpass(ql, i + 1);
      throw e;
    });
  }
  function fc(feats) {
    return { type: "FeatureCollection", features: feats || [] };
  }
  window.SunnyKit = { esc: esc, show: show, before: before, vis: vis, getStore: getStore, putStore: putStore,
    loadJson: loadJson, tiles: tiles, overpass: overpass, fc: fc };
})();
