// workspace/whereisthesun/data-meter.js
/* SUNNY data meter (opt76). Small faint readout in the top-right corner: data used this
 * session and the current download rate. Counts PerformanceObserver resource entries
 * (transferSize, else encodedBodySize). Cross-origin files without Timing-Allow-Origin
 * report 0 bytes; those are estimated from the average known size of the same kind and
 * the total is then shown with "~". Workers may add bytes with SunnyDataMeter.add(n).
 * On by default; the Settings switch "Data usage" turns it off (saved). */
(function () {
  "use strict";
  var KEY = "sunny-data-meter";
  var total = 0;
  var partial = false;
  var recent = [];
  var known = {};
  var el = null;
  var timer = null;
  function avgFor(kind) {
    var k = known[kind];
    return k && k.n ? k.sum / k.n : 0;
  }
  function count(bytes, now) {
    total += bytes;
    recent.push([now, bytes]);
  }
  function onEntry(e) {
    var n = e.transferSize || e.encodedBodySize || 0;
    var kind = e.initiatorType || "other";
    if (n > 0) {
      known[kind] = known[kind] || { sum: 0, n: 0 };
      known[kind].sum += n;
      known[kind].n += 1;
    } else if (e.name.indexOf(location.origin) !== 0 && e.name.indexOf("data:") !== 0) {
      partial = true;
      n = avgFor(kind);
    }
    count(n, performance.now());
  }
  function fmtTotal() {
    var mb = total / 1048576;
    return (partial ? "~" : "") + (mb < 10 ? mb.toFixed(1) : Math.round(mb)) + " MB";
  }
  function rate() {
    var now = performance.now();
    var sum = 0;
    recent = recent.filter(function (r) { return now - r[0] < 5000; });
    recent.forEach(function (r) { sum += r[1]; });
    return Math.round(sum / 5 / 1024);
  }
  function render() {
    if (el) el.textContent = fmtTotal() + " · " + rate() + " kB/s";
  }
  function show(on) {
    if (!el) {
      el = document.createElement("div");
      el.className = "data-meter";
      el.setAttribute("aria-label", "Data used this session");
      document.body.appendChild(el);
    }
    el.hidden = !on;
    clearInterval(timer);
    if (on) {
      render();
      timer = setInterval(render, 1000);
    }
  }
  try {
    performance.getEntriesByType("resource").forEach(onEntry);
    new PerformanceObserver(function (list) { list.getEntries().forEach(onEntry); })
      .observe({ type: "resource", buffered: false });
  } catch (eObs) {}
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (eLs) {}
  var on = saved !== "0";
  var sw = document.getElementById("toggle-data-meter");
  if (sw) {
    sw.checked = on;
    sw.addEventListener("change", function () {
      try { localStorage.setItem(KEY, sw.checked ? "1" : "0"); } catch (eSet) {}
      show(sw.checked);
    });
  }
  show(on);
  window.SunnyDataMeter = {
    add: function (bytes) { count(bytes || 0, performance.now()); },
    totalBytes: function () { return total; }
  };
})();
