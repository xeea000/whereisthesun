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
  function card(title, lines, src) {
    return '<div class="pf-now"><span class="pf-facts"><b>' + esc(title) + "</b>" +
      lines.filter(Boolean).map((l) => { return "<br>" + l; }).join("") + "</span></div>" + srcHtml(src);
  }
  function show(map, lngLat, title, lines, src) {
    var html = '<div class="pf-now"><span class="pf-facts"><b>' + esc(title) + "</b>" +
      lines.filter(Boolean).map((l) => { return "<br>" + l; }).join("") +
      '</span></div>' + srcHtml(src);
    popup = new window.maplibregl.Popup({ closeButton: true, maxWidth: "280px", className: "pf-popup", offset: 8 });
    popup.setLngLat(lngLat).setHTML(html).addTo(map);
    if (!map._sunnyGone) {
      map._sunnyGone = true; /* opt165: a card whose place has left the screen closes */
      map.on("moveend", () => {
        try {
          var ll = popup && popup.getLngLat && popup.getLngLat();
          if (!popup || !popup.isOpen() || !ll || !isFinite(ll.lng) || !isFinite(ll.lat)) return;
          if (!map.getBounds().contains(ll)) popup.remove();
        } catch (e) {}
      });
    }
    return popup;
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
  /* opt108: one shared Group nearby markers setting (default on); off drops clustering and zoom gates on point layers */
  var grouped = () => { try { return localStorage.getItem("sunny-group") !== "0"; } catch (e) { return true; } };
  var gz = (z) => { return grouped() ? z : 0; };
  /* opt110: legend html helpers. ramp: gradient bar with end labels; keys: [[colour, "dot"|"line"|"area", label], ...] */
  var legRamp = (grad, lo, mid, hi) => {
    return '<div class="sat-leg"><div class="sat-ramp" style="background:linear-gradient(90deg,' + grad + ')"></div>' +
      '<div class="sat-rl"><span>' + lo + "</span><span>" + (mid || "") + "</span><span>" + hi + "</span></div></div>";
  };
  var legKeys = (rows) => {
    return rows.map((r) => { return '<span class="ls-k"><i class="ls-sw ls-' + r[1] + '" style="background:' + r[0] + '"></i>' + r[2] + "</span>"; }).join("");
  };
  /* opt199: shared parent/kids visibility.
   * Subset kids (default): a feature shows only when it matches ≥1 checked kid;
   *   zero subset kids checked → show nothing (parent switch may stay on).
   * Modifier kids (role: "mod"): display/option switches — ignored by matchAny /
   *   activeCodes / anyOn. Do not use them for feature subsets.
   * Storage: sunny-L-<kid.id>, same key layers-panel writes. */
  function kidsDflt(k) { return k && k.dflt == null ? true : !!(k && k.dflt); }
  function kidsIsOn(id, dflt) {
    try {
      var v = localStorage.getItem("sunny-L-" + id);
      return v == null ? !!dflt : v === "1";
    } catch (e) { return !!dflt; }
  }
  function kidsSubset(list) {
    return (list || []).filter((k) => { return k.role !== "mod" && k.kind !== "mod"; });
  }
  function kidsActive(list) {
    return kidsSubset(list).filter((k) => { return kidsIsOn(k.id, kidsDflt(k)); });
  }
  function kidsAnyOn(list) { return kidsActive(list).length > 0; }
  /* JS feature gate: none on → false; else OR of pred(kid) over active subset kids */
  function kidsMatchAny(list, pred) {
    var on = kidsActive(list);
    if (!on.length) return false;
    for (var i = 0; i < on.length; i++) if (pred(on[i])) return true;
    return false;
  }
  function kidsActiveCodes(list, codeOf) {
    return kidsActive(list).map(codeOf || ((k) => { return k.code != null ? k.code : k.id; }))
      .filter((c) => { return c != null && c !== ""; });
  }
  /* MapLibre filter: empty codes → never matches (do not use bare ["in", …, []]) */
  function kidsInFilter(getExpr, codes) {
    if (!codes || !codes.length) return ["==", 1, 0];
    return ["in", getExpr, ["literal", codes]];
  }
  /* Per-sublayer visibility: parent on AND that kid on */
  function kidsLayerOn(parentOn, kidId, dflt) {
    return !!parentOn && kidsIsOn(kidId, dflt == null ? true : !!dflt);
  }
  var kids = { isOn: kidsIsOn, subset: kidsSubset, active: kidsActive, anyOn: kidsAnyOn,
    matchAny: kidsMatchAny, activeCodes: kidsActiveCodes, inFilter: kidsInFilter, layerOn: kidsLayerOn };
  window.SunnyKit = { legRamp: legRamp, legKeys: legKeys, grouped: grouped, gz: gz, kids: kids,
    esc: esc, show: show, card: card, before: before, vis: vis, getStore: getStore, putStore: putStore,
    loadJson: loadJson, tiles: tiles, overpass: overpass, fc: fc };
})();
