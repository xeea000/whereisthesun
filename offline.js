// workspace/whereisthesun/offline.js
/* SUNNY "Save for offline" (opt95), at the bottom of the layers sidebar. Lists each province or USA
 * region with its download size, and saves on request only (never by itself): the region's
 * campsite and plaque packs (points plus every detail shard, so taps work offline), the shared observatories, craters, meteorites and eclipses files,
 * and optionally OpenFreeMap vector map tiles over the region up to a capped zoom. Shows the MB
 * first, warns on mobile data when the phone says so, shows progress, and can delete a region.
 * Saved files live in their own cache (sunny-offline-1); the service worker uses them only when
 * the network fails, so online use stays fresh. */
(() => {
  "use strict";
  var CACHE = "sunny-offline-1";
  var TILE_KB = 28;
  var MAX_TILES = 2500;
  var box = null;
  var busy = false;
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function mb(bytes) {
    return bytes < 1e6 ? Math.max(0.1, bytes / 1e6).toFixed(1) + " MB" : (bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0) + " MB";
  }
  function savedInfo(id) {
    try { return JSON.parse(localStorage.getItem("sunny-off-" + id) || "null"); } catch (e) { return null; }
  }
  function setSaved(id, v) {
    try {
      if (v) localStorage.setItem("sunny-off-" + id, JSON.stringify(v));
      else localStorage.removeItem("sunny-off-" + id);
    } catch (e) {}
  }
  function tileX(lng, z) {
    return Math.floor((lng + 180) / 360 * Math.pow(2, z));
  }
  function tileY(lat, z) {
    var r = Math.max(-85, Math.min(85, lat)) * Math.PI / 180;
    return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z));
  }
  /* zoom 0 up to the highest zoom that keeps the region under MAX_TILES tiles */
  function tilePlan(bb) {
    var list = [];
    for (var z = 0; z <= 10; z++) {
      var add = [];
      for (var x = tileX(bb[0], z); x <= tileX(bb[2], z); x++) for (var y = tileY(bb[3], z); y <= tileY(bb[1], z); y++) add.push([z, x, y]);
      if (list.length + add.length > MAX_TILES) return { tiles: list, maxZ: z - 1 };
      list = list.concat(add);
    }
    return { tiles: list, maxZ: 10 };
  }
  function packBytes(r, ix) {
    var n = 0;
    Object.keys(r.files).forEach((k) => { n += r.files[k].gz + (r.files[k].dgz || 0); });
    (ix.shared || []).forEach((s) => { n += s.gz; });
    return n;
  }
  function onMobileData() {
    var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return false;
    return c.type === "cellular" || c.saveData === true;
  }
  function tileTemplate() {
    return fetch("https://tiles.openfreemap.org/planet").then((r) => { return r.json(); }).then((j) => { return j.tiles[0]; });
  }
  function save(ix, r, withMap, row) {
    if (busy) return;
    var plan = withMap ? tilePlan(r.bbox) : { tiles: [] };
    var est = packBytes(r, ix) + plan.tiles.length * TILE_KB * 1000;
    var msg = "Download " + r.name + " for offline: about " + mb(est) + ".";
    if (onMobileData()) msg += "\n\nYou look to be on mobile data. This will use your data plan. Wi-Fi is better.";
    if (!window.confirm(msg)) return;
    busy = true;
    var urls = ["data/packs/index.json"];
    Object.keys(r.files).forEach((k) => {
      var b = "data/packs/" + r.id + "/" + k;
      urls.push(b + ".p.json?h=" + ix.built);
      for (var d = 0; d < (r.files[k].shards || 0); d++) urls.push(b + ".d" + d + ".json?h=" + ix.built);
    });
    (ix.shared || []).forEach((s) => { urls.push(s.url); });
    var prog = row.querySelector(".off-prog");
    var go = withMap ? tileTemplate().then((t) => {
      urls.push("https://tiles.openfreemap.org/planet");
      plan.tiles.forEach((p) => { urls.push(t.replace("{z}", p[0]).replace("{x}", p[1]).replace("{y}", p[2])); });
    }) : Promise.resolve();
    var done = 0;
    var bytes = 0;
    var failed = 0;
    go.then(() => { return caches.open(CACHE); }).then((cache) => {
      var i = 0;
      function next() {
        if (i >= urls.length) return Promise.resolve();
        var u = urls[i++];
        return fetch(u).then((res) => {
          if (!res.ok) throw new Error(res.status);
          return res.clone().blob().then((b) => { bytes += b.size; return cache.put(u, res); });
        }).catch(() => { failed++; }).then(() => {
          done++;
          prog.textContent = done + " / " + urls.length + " · " + mb(bytes);
          return next();
        });
      }
      return Promise.all([next(), next(), next(), next()]);
    }).then(() => {
      setSaved(r.id, { urls: urls, bytes: bytes, at: new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" }), map: withMap ? plan.maxZ : -1, failed: failed });
    }).catch(() => {
      prog.textContent = "Download failed. Try again on Wi-Fi.";
    }).then(() => {
      busy = false;
      render(ix);
    });
  }
  function del(ix, r) {
    var s = savedInfo(r.id);
    if (!s) return;
    var keepShared = ix.regions.some((o) => { return o.id !== r.id && savedInfo(o.id); });
    caches.open(CACHE).then((cache) => {
      return Promise.all(s.urls.filter((u) => {
        return !(keepShared && (u.indexOf("data/packs/") < 0 || u.indexOf("index.json") >= 0));
      }).map((u) => { return cache.delete(u); }));
    }).catch(() => {}).then(() => {
      setSaved(r.id, null);
      render(ix);
    });
  }
  function render(ix) {
    var list = box.querySelector(".off-list");
    list.textContent = "";
    var withMap = box.querySelector(".off-map input").checked;
    ix.regions.forEach((r) => {
      var s = savedInfo(r.id);
      var row = el("div", "off-row");
      var plan = withMap && !s ? tilePlan(r.bbox) : null;
      var est = packBytes(r, ix) + (plan ? plan.tiles.length * TILE_KB * 1000 : 0);
      row.appendChild(el("span", "off-name", r.name));
      var info = el("span", "off-prog", s ? "Saved " + s.at + " · " + mb(s.bytes) + (s.map >= 0 ? " · map to zoom " + s.map : "") : mb(est) + (plan ? " (map to zoom " + plan.maxZ + ")" : ""));
      row.appendChild(info);
      var b = el("button", "off-btn", s ? "Delete" : "Download");
      b.type = "button";
      b.addEventListener("click", () => { if (s) del(ix, r); else save(ix, r, withMap, row); });
      row.appendChild(b);
      list.appendChild(row);
    });
  }
  function build(ix) {
    var panel = document.getElementById("layers-panel");
    if (!panel || box) return;
    box = el("details", "lp-off");
    box.innerHTML = "<summary>📥 Save for offline</summary><p class=\"off-tip\">Saves campsites, plaques and sky data for a region so they work with no signal. " +
      "Nothing downloads until you tap Download.</p><label class=\"off-map\"><input type=\"checkbox\"> Also save the map (OpenFreeMap vector map, zoomed-out levels)</label>" +
      '<div class="off-list"></div><p class="off-tip">Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, ' +
      '<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a>. Built ' + ix.built + ".</p>";
    box.querySelector(".off-map input").addEventListener("change", () => { render(ix); });
    panel.insertBefore(box, document.getElementById("lp-tab"));
    render(ix);
  }
  function start() {
    if (!window.caches || !document.getElementById("layers-panel")) {
      setTimeout(start, 800);
      return;
    }
    fetch("data/packs/index.json").then((r) => { return r.json(); }).then(build).catch(() => {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
