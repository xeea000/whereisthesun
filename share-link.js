// workspace/whereisthesun/share-link.js
/* SUNNY share link (opt192/opt193): chain button copies camera + layers + kids + filters + selection
 * into a short #s= hash. Opening restores after layers load. Unknown ids are ignored. */
(() => {
  "use strict";
  var VER = 1;
  var pending = null;
  var toastEl = null;
  var restoring = false;
  function r4(n) { return Math.round(Number(n) * 10000) / 10000; }
  function r2(n) { return Math.round(Number(n) * 100) / 100; }
  function mapOk() { return typeof map !== "undefined" && map && map.getCenter; }
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "share-toast";
      toastEl.setAttribute("role", "status");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("is-on");
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => { toastEl.classList.remove("is-on"); }, 1600);
  }
  function overlayMode() {
    try {
      if (localStorage.getItem("sunny-overlay-none") === "1") return "none";
    } catch (e) {}
    var b = document.querySelector("#overlay-seg .seg-btn.is-on");
    return b ? (b.getAttribute("data-overlay") || "") : "";
  }
  function setOverlay(mode) {
    try {
      if (mode === "none") {
        var on = document.querySelector("#overlay-seg .seg-btn.is-on");
        if (on) on.click();
        return;
      }
      if (!mode) return;
      var s = document.querySelector('#overlay-seg [data-overlay="' + mode + '"]');
      if (s) s.click();
    } catch (e) {}
  }
  function collectKids(defs) {
    var out = [];
    defs.forEach((d) => {
      if (!d.kids || !window.SunnyLayers.isOn(d.id)) return;
      d.kids.forEach((k) => {
        var on = false;
        try {
          var v = localStorage.getItem("sunny-L-" + k.id);
          on = v == null ? !!k.dflt : v === "1";
        } catch (e) { on = !!k.dflt; }
        if (on) out.push(k.id);
      });
    });
    return out;
  }
  function featKey(props) {
    if (!props) return "";
    if (props.id != null && props.id !== "") return "id:" + String(props.id);
    if (props.vn != null && props.vn !== "") return "vn:" + String(props.vn);
    if (props.name != null && props.name !== "") return "name:" + String(props.name);
    return "";
  }
  function captureSelection() {
    var info = window.SunnyInfo && window.SunnyInfo.selection && window.SunnyInfo.selection();
    if (!info || !mapOk()) return null;
    var pt = map.project([info.lng, info.lat]);
    var taps = (window.SunnyLayers && window.SunnyLayers.tapIds()) || [];
    var layers = taps.filter((id) => { return map.getLayer && map.getLayer(id); });
    var feats = [];
    try {
      if (layers.length) feats = map.queryRenderedFeatures(pt, { layers: layers });
      if (!feats.length && layers.length) {
        feats = map.queryRenderedFeatures([[pt.x - 10, pt.y - 10], [pt.x + 10, pt.y + 10]], { layers: layers });
      }
    } catch (e) {}
    var f = feats[0];
    var o = { g: [r4(info.lng), r4(info.lat)] };
    if (f) {
      o.l = f.layer && f.layer.id || "";
      var k = featKey(f.properties);
      if (k) o.k = k;
    }
    return o;
  }
  function buildState() {
    if (!mapOk() || !window.SunnyLayers) return null;
    var c = map.getCenter();
    var st = {
      v: VER,
      c: [r4(c.lat), r4(c.lng), r2(map.getZoom()), r2(map.getBearing() || 0), r2(map.getPitch() || 0)]
    };
    var layers = window.SunnyLayers.list().map((d) => { return d.id; }).filter(Boolean);
    if (layers.length) st.l = layers;
    var kids = collectKids(window.SunnyLayers.defs());
    if (kids.length) st.k = kids;
    var ov = overlayMode();
    if (ov && ov !== "clouds") st.o = ov;
    if (window.SunnyMtg && window.SunnyMtg.getFilter) {
      var mf = window.SunnyMtg.getFilter();
      if (mf) st.f = { mtg: mf };
    }
    if (window.SunnyBeachIcons && window.SunnyBeachIcons.getScale) {
      var bi = window.SunnyBeachIcons.getScale();
      if (bi && bi !== 1) st.bi = bi;
    }
    var sel = captureSelection();
    if (sel) st.s = sel;
    return st;
  }
  /* Compact URL-safe payload: JSON → base64url */
  function encode(st) {
    var json = JSON.stringify(st);
    var b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    return b64;
  }
  function decode(raw) {
    try {
      var b64 = String(raw).replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      var json = decodeURIComponent(escape(atob(b64)));
      var st = JSON.parse(json);
      if (!st || st.v !== VER || !st.c || st.c.length < 3) return null;
      return st;
    } catch (e) { return null; }
  }
  function parseHash() {
    try {
      var h = location.hash || "";
      if (h.charAt(0) === "#") h = h.slice(1);
      if (!h) return null;
      var sp = new URLSearchParams(h.indexOf("s=") >= 0 ? h : "");
      var raw = sp.get("s");
      if (!raw && /^[A-Za-z0-9_-]+$/.test(h) && h.length > 8) raw = h;
      if (!raw) return null;
      return decode(raw);
    } catch (e) { return null; }
  }
  function writeHash(st) {
    var enc = encode(st);
    var next = "#s=" + enc;
    try { history.replaceState(history.state, "", location.pathname + location.search + next); } catch (e) {
      location.hash = next;
    }
    return location.href.split("#")[0] + next;
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => { return true; }).catch(() => { return fallbackCopy(text); });
    }
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }
  function shareOrCopy(url) {
    if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "")) {
      return navigator.share({ url: url, title: "SUNNY" }).then(() => { return "shared"; }).catch(() => {
        return copyText(url).then((ok) => { return ok ? "copied" : "fail"; });
      });
    }
    return copyText(url).then((ok) => { return ok ? "copied" : "fail"; });
  }
  function onShareClick(ev) {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    var st = buildState();
    if (!st) { toast("Map not ready"); return; }
    var url = writeHash(st);
    shareOrCopy(url).then((how) => {
      if (how === "shared") toast("Link ready");
      else if (how === "copied") toast("Link copied");
      else toast("Could not copy");
    });
  }
  function applyLayers(st) {
    if (!window.SunnyLayers) return;
    var want = {};
    (st.l || []).forEach((id) => { want[id] = true; });
    window.SunnyLayers.defs().forEach((d) => {
      if (!d.name || d.id === "beaches") return;
      var on = !!want[d.id];
      if (window.SunnyLayers.isOn(d.id) !== on) window.SunnyLayers.set(d.id, on);
    });
    if (st.k && st.k.length) {
      /* Turn listed kids on; leave others as saved defaults for off layers */
      var kidOn = {};
      st.k.forEach((id) => { kidOn[id] = true; });
      window.SunnyLayers.defs().forEach((d) => {
        if (!d.kids || !want[d.id]) return;
        d.kids.forEach((k) => {
          window.SunnyLayers.kidSet(k.id, !!kidOn[k.id]);
        });
      });
    }
    if (st.o) setOverlay(st.o);
    if (st.f && st.f.mtg && window.SunnyMtg && window.SunnyMtg.setFilter) {
      try { window.SunnyMtg.setFilter(st.f.mtg); } catch (e) {}
    }
    if (st.bi != null && window.SunnyBeachIcons && window.SunnyBeachIcons.setScale) {
      try { window.SunnyBeachIcons.setScale(st.bi); } catch (e) {}
    }
  }
  function matchFeat(f, key) {
    if (!key) return true;
    var cur = featKey(f.properties);
    return cur === key;
  }
  function trySelect(sel, attempt) {
    if (!sel || !sel.g || !mapOk()) return;
    if (attempt > 24) return;
    var lng = Number(sel.g[0]), lat = Number(sel.g[1]);
    if (!isFinite(lng) || !isFinite(lat)) return;
    var pt = map.project([lng, lat]);
    var taps = (window.SunnyLayers && window.SunnyLayers.tapIds()) || [];
    var layers = taps.filter((id) => { return map.getLayer && map.getLayer(id); });
    if (sel.l && map.getLayer(sel.l)) layers = [sel.l];
    var feats = [];
    try {
      if (layers.length) {
        feats = map.queryRenderedFeatures([[pt.x - 12, pt.y - 12], [pt.x + 12, pt.y + 12]], { layers: layers });
      }
    } catch (e) {}
    if (sel.k) feats = feats.filter((f) => { return matchFeat(f, sel.k); });
    if (!feats.length) {
      setTimeout(() => { trySelect(sel, attempt + 1); }, 400);
      return;
    }
    try {
      map.fire("click", { lngLat: { lng: lng, lat: lat }, point: pt, features: feats });
    } catch (e) {}
  }
  function applyState(st) {
    if (!st || restoring || !mapOk()) return;
    restoring = true;
    try {
      var lat = Number(st.c[0]), lng = Number(st.c[1]), z = Number(st.c[2]);
      var bearing = st.c.length > 3 ? Number(st.c[3]) : 0;
      var pitch = st.c.length > 4 ? Number(st.c[4]) : 0;
      if (isFinite(lat) && isFinite(lng) && isFinite(z)) {
        try {
          map.jumpTo({ center: [lng, lat], zoom: z, bearing: bearing || 0, pitch: pitch || 0 });
        } catch (e) {}
      }
      applyLayers(st);
      var waits = 0;
      function after() {
        waits++;
        if (waits < 3) {
          map.once("idle", after);
          return;
        }
        if (st.s) trySelect(st.s, 0);
        restoring = false;
      }
      if (map.loaded()) map.once("idle", after);
      else map.once("load", () => { map.once("idle", after); });
      /* safety unlock */
      setTimeout(() => { restoring = false; if (st.s) trySelect(st.s, 0); }, 8000);
    } catch (e) { restoring = false; }
  }
  function bootRestore() {
    pending = parseHash();
    if (!pending) return;
    var n = 0;
    function tick() {
      n++;
      if (mapOk() && window.SunnyLayers && window.SunnyLayers.defs().length) {
        applyState(pending);
        return;
      }
      if (n < 150) setTimeout(tick, 100);
    }
    tick();
  }
  function bind() {
    var b = document.getElementById("btn-share");
    if (b) b.addEventListener("click", onShareClick);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { bind(); bootRestore(); });
  else { bind(); bootRestore(); }
  window.SunnyShare = { build: buildState, apply: applyState, parse: parseHash };
})();
