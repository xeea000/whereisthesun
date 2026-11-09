// workspace/whereisthesun/frame-kit.js
/* SUNNY frame kit (opt244). Shared helpers for work that runs on every Play or wind frame, or on a layer's first
 * use, added to window.SunnyKit (layer-kit.js loads first):
 *   once(fn)        fn runs on first call only; later calls get its first result. A layer's heavy assets
 *                   (sprites, packs) load the first time it draws, not at boot.
 *   viewSize(el)    an element's client size kept from a ResizeObserver, so a frame never forces layout to read it
 *   fmt.frameTime   one reused date formatter for frame labels
 *   setText(el, s)  writes only when the text changes
 *   narrow()        one shared phone-width media query */
(function () {
  "use strict";
  var K = window.SunnyKit = window.SunnyKit || {};
  function once(fn) {
    var done = false;
    var val;
    function first() {
      if (!done) {
        done = true;
        val = fn.apply(this, arguments);
      }
      return val;
    }
    return first;
  }
  var sizes = typeof WeakMap === "function" ? new WeakMap() : null;
  var ro = null;
  function readSize(el) {
    return { w: el.clientWidth, h: el.clientHeight };
  }
  function resized(list) {
    list.forEach((e) => { sizes.set(e.target, readSize(e.target)); });
  }
  function viewSize(el) {
    if (!el) return { w: 0, h: 0 };
    if (!sizes || typeof ResizeObserver !== "function") return readSize(el);
    var s = sizes.get(el);
    if (s) return s;
    s = readSize(el);
    sizes.set(el, s);
    if (!ro) ro = new ResizeObserver(resized);
    ro.observe(el);
    return s;
  }
  var frameFmt = null;
  function frameTime(ms) {
    if (!frameFmt) frameFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    return frameFmt.format(new Date(ms));
  }
  function setText(el, s) {
    if (el && el.textContent !== s) el.textContent = s;
  }
  var narrowMq = null;
  function narrow() {
    if (!narrowMq && typeof window.matchMedia === "function") narrowMq = window.matchMedia("(max-width:700px)");
    return !!(narrowMq && narrowMq.matches);
  }
  K.once = once;
  K.viewSize = viewSize;
  K.fmt = { frameTime: frameTime };
  K.setText = setText;
  K.narrow = narrow;
})();
