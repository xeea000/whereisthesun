// workspace/whereisthesun/beach-ref.js
/* SUNNY beach list "Distance from" (opt95). The list's km figures can be measured from your
 * location, the map centre, or a pin you drop. "Live update" re-ranks the list each time the map
 * stops moving, using the beaches already loaded (no new downloads). In pin mode only a short,
 * still, one-finger tap drops or moves the pin; drags, pinches and long presses never do.
 * The pin can be dragged, and Clear pin removes it. Choices are remembered. */
(() => {
  "use strict";
  var MODE_KEY = "sunny-dist-ref";
  var LIVE_KEY = "sunny-dist-live";
  var PIN_KEY = "sunny-pin";
  var WORDS = { me: "from your location", centre: "from map centre", pin: "from your pin" };
  var mode = "me";
  var live = false;
  var pin = null;
  var marker = null;
  var box, sel, liveBox, help, clearBtn;
  var timer = null;
  var press = null;
  function store(k, v) {
    try { localStorage.setItem(k, v); } catch (e) {}
  }
  function read(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function getMap() {
    return typeof map !== "undefined" ? map : null;
  }
  function ref() {
    var m = getMap();
    if (mode === "centre" && m) {
      var c = m.getCenter();
      return { lat: c.lat, lon: c.lng };
    }
    if (mode === "pin" && pin) return pin;
    return typeof sunnyApp_origin !== "undefined" && sunnyApp_origin ? sunnyApp_origin : null;
  }
  function words() {
    if (mode === "pin" && !pin) return WORDS.me;
    if (mode === "me" && (typeof sunnyApp_origin === "undefined" || !sunnyApp_origin)) return "from where you searched";
    return WORDS[mode];
  }
  function km(a, b) {
    return haversineKm(a.lat, a.lon, b.lat, b.lon);
  }
  function rerank() {
    if (typeof sheetListRows === "undefined" || !sheetListRows.length || !sunnySheetList) return;
    var r = ref();
    if (!r) return;
    sheetListRows.forEach((b) => { b.dist = km(r, b); });
    sheetListRows.sort(sheetSunnyMode ? sunnySortCmp : (a, b) => { return a.dist - b.dist; });
    var items = sunnySheetList.querySelectorAll(".sheet-item");
    var active = sunnySheetList.querySelector(".sheet-item.is-active");
    var activeId = active && active._beach ? active._beach.id : null;
    for (var i = 0; i < items.length && i < sheetListRows.length; i++) {
      fillSheetItem(items[i], sheetListRows[i], i);
      items[i].classList.toggle("is-active", sheetListRows[i].id === activeId);
    }
    label();
  }
  function label() {
    if (!sunnySheetList) return;
    var w = words();
    sunnySheetList.querySelectorAll(".sheet-item .dist").forEach((d) => {
      var s = d.querySelector("small");
      if (!s) {
        s = document.createElement("small");
        d.appendChild(s);
      }
      s.textContent = w;
    });
  }
  function syncUi() {
    if (!box) return;
    sel.value = mode;
    liveBox.checked = live;
    help.hidden = mode !== "pin";
    help.firstChild.textContent = pin ? "Tap the map to move the pin, or drag it. " : "Tap the map to drop a pin. ";
    clearBtn.hidden = !pin;
    showPin();
  }
  function showPin() {
    var m = getMap();
    if (!m || !window.maplibregl) return;
    if (!pin || mode !== "pin" || (sunnySheet && sunnySheet.hidden)) {
      if (marker) marker.remove();
      return;
    }
    if (!marker) {
      marker = new window.maplibregl.Marker({ draggable: true, color: "#e0482a" });
      marker.on("dragend", () => {
        var p = marker.getLngLat();
        setPin({ lat: p.lat, lon: p.lng });
      });
    }
    marker.setLngLat([pin.lon, pin.lat]).addTo(m);
  }
  function setPin(p) {
    pin = p;
    store(PIN_KEY, p ? JSON.stringify(p) : "");
    syncUi();
    rerank();
  }
  function setMode(m) {
    mode = WORDS[m] ? m : "me";
    store(MODE_KEY, mode);
    syncUi();
    rerank();
  }
  /* A deliberate tap: one finger or mouse button, under 350 ms, moved less than 8 px. */
  function down(e) {
    if (mode !== "pin" || !e.isPrimary) {
      press = null;
      return;
    }
    press = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId, n: 1 };
  }
  function moveP(e) {
    if (!press) return;
    if (e.pointerId !== press.id) {
      press = null;
      return;
    }
    if (Math.abs(e.clientX - press.x) > 8 || Math.abs(e.clientY - press.y) > 8) press = null;
  }
  function second(e) {
    if (press && !e.isPrimary) press = null;
  }
  function up(e) {
    var p = press;
    press = null;
    if (!p || mode !== "pin" || e.pointerId !== p.id || Date.now() - p.t > 350) return;
    if (Math.abs(e.clientX - p.x) > 8 || Math.abs(e.clientY - p.y) > 8) return;
    var m = getMap();
    if (!m) return;
    var r = m.getCanvas().getBoundingClientRect();
    var ll = m.unproject([e.clientX - r.left, e.clientY - r.top]);
    window.sunnyPinTapAt = Date.now();
    setPin({ lat: ll.lat, lon: ll.lng });
  }
  function build() {
    var sheet = document.getElementById("sunny-sheet");
    if (!sheet || box) return;
    box = document.createElement("div");
    box.className = "dist-ref";
    box.innerHTML = '<label>Distance from <select aria-label="Distance from"><option value="me">My location</option>' +
      '<option value="centre">Centre of map</option><option value="pin">Dropped pin</option></select></label>' +
      '<label class="dist-live"><input type="checkbox"> Live update</label>' +
      '<div class="dist-help" hidden>Tap the map to drop a pin. <button type="button" class="dist-clear" hidden>Clear pin</button></div>';
    sel = box.querySelector("select");
    liveBox = box.querySelector("input");
    help = box.querySelector(".dist-help");
    clearBtn = box.querySelector(".dist-clear");
    sel.addEventListener("change", () => { setMode(sel.value); });
    liveBox.addEventListener("change", () => {
      live = liveBox.checked;
      store(LIVE_KEY, live ? "1" : "0");
      if (live) rerank();
    });
    clearBtn.addEventListener("click", () => { setPin(null); });
    var list = document.getElementById("sunny-sheet-list");
    sheet.insertBefore(box, list);
    syncUi();
  }
  function hook() {
    var m = getMap();
    if (!m || typeof openSunnySheet !== "function") {
      setTimeout(hook, 500);
      return;
    }
    build();
    var orig = window.openSunnySheet;
    window.openSunnySheet = (list, sunnyMode) => {
      orig(list, sunnyMode);
      showPin();
      if (mode !== "me") rerank();
      else label();
    };
    var origClose = window.closeSunnySheet;
    window.closeSunnySheet = () => {
      origClose();
      showPin();
    };
    m.on("moveend", () => {
      if (!live || mode === "pin") return;
      clearTimeout(timer);
      timer = setTimeout(rerank, 600);
    });
    var c = m.getCanvasContainer();
    c.addEventListener("pointerdown", down, true);
    c.addEventListener("pointerdown", second, true);
    c.addEventListener("pointermove", moveP, true);
    c.addEventListener("pointerup", up, true);
    c.addEventListener("pointercancel", () => { press = null; }, true);
  }
  mode = WORDS[read(MODE_KEY)] ? read(MODE_KEY) : "me";
  live = read(LIVE_KEY) === "1";
  try { pin = JSON.parse(read(PIN_KEY) || "null"); } catch (e) { pin = null; }
  window.SunnyBeachRef = { words: words, rerank: rerank };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hook);
  else hook();
})();
