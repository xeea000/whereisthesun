// workspace/lag-o-meter/src/collector.js
// The bandwidth collector. It adds up what the browser reports this page fetched over the network, from Navigation
// Timing and Resource Timing, counting each entry once, plus the traffic the app reports itself. It keeps the session
// total across reloads in the same tab through sessionStorage and gives the data rate in bytes per second averaged
// over this visit to the page. A page reads a size of 0 for every file its service worker answers, so it also adds what the
// game's service worker reports it fetched (src/sw-counter.js, loaded in the worker), counting each file once. It never
// makes a request: it only reads the browser's own timing records and those reports.
import { DEFAULTS } from "./defaults.js";
const BUFFER_SIZE = 20000;
const BUFFER_MARGIN = 1000;
const WORKER_MESSAGE = "lag-o-meter-bytes";
const PAIR_MS = 60000;
const HOLD_MS = 3000;
const HOLD_PAGE_MS = 15000;
const collectors = new WeakMap();
// True for a finite number of zero or more.
function isCount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
// The window's sessionStorage, or null when reading it throws.
function sessionStore(win) {
  try {
    return win.sessionStorage || null;
  } catch (err) {
    return null;
  }
}
// True when an entry's address is on another site than the page.
function otherSite(name, win) {
  try {
    const here = win.location && win.location.origin;
    return Boolean(here) && typeof name === "string" && /^https?:/i.test(name) && new URL(name).origin !== here;
  } catch (err) {
    return false;
  }
}
// Creates a collector for one window. Most callers use getCollector, which shares one per window.
export function createCollector(options) {
  const opts = options || {};
  const win = opts.window || globalThis;
  const perf = win.performance || null;
  let key = opts.storageKey || DEFAULTS.storageKey;
  let keyGiven = Boolean(opts.storageKey);
  const clock = () => (perf && typeof perf.now === "function" ? perf.now() : Date.now());
  const origin = perf && typeof perf.now === "function" ? 0 : clock();
  const seen = new Set();
  let base = { down: 0, up: 0 };
  let down = 0;
  let up = 0;
  let lastSaved = { down: 0, up: 0 };
  let estimated = false;
  let hiddenFiles = 0;
  let sizesMissing = false;
  let started = false;
  let everStarted = false;
  let observer = null;
  let polled = 0;
  let navigationDone = false;
  const listeners = [];
  // A file the service worker handled can show on both sides. The worker's report is what it really fetched, so a page
  // timing entry for such a file waits HOLD_MS for a report of the same address and counts only when none comes, as for
  // a request the worker passed straight to the network; the page's own load waits HOLD_PAGE_MS, the time its report may
  // take to reach a page that is still starting. Reports that came first are kept a minute by address.
  const held = new Map();
  const reported = new Map();
  // Adds one item to a list kept under an address.
  const push = (map, url, item) => {
    const list = map.get(url);
    if (list) list.push(item);
    else map.set(url, [item]);
  };
  // Takes the oldest item kept under an address, or null.
  const shift = (map, url) => {
    const list = map.get(url);
    if (!list) return null;
    const item = list.shift();
    if (!list.length) map.delete(url);
    return item;
  };
  // Counts the held entries no report claimed in time (all of them with now at Infinity) and forgets reports past a minute.
  const settle = (now) => {
    for (const [url, list] of held) {
      while (list.length && now - list[0].at >= list[0].hold) down += list.shift().bytes;
      if (!list.length) held.delete(url);
    }
    for (const [url, list] of reported) {
      while (list.length && now - list[0] > PAIR_MS) list.shift();
      if (!list.length) reported.delete(url);
    }
  };
  // Reads the stored session total, or zeros when there is none or storage throws.
  const readStored = () => {
    const store = sessionStore(win);
    try {
      const raw = store ? store.getItem(key) : null;
      const data = raw ? JSON.parse(raw) : null;
      return { down: data && isCount(data.down) ? data.down : 0, up: data && isCount(data.up) ? data.up : 0 };
    } catch (err) {
      return { down: 0, up: 0 };
    }
  };
  // The bytes one timing entry stands for: its transferSize, which is 0 for a cache hit and the 300 byte header
  // estimate for a revalidated file. Where the browser leaves out transferSize the body size is used and the total is
  // marked as an estimate. A file from another site reported at 0 is counted for the tooltip, unless a service worker
  // handled it: the worker reports such files itself.
  const sizeOf = (entry) => {
    if (isCount(entry.transferSize)) {
      const zero = entry.transferSize === 0 && entry.encodedBodySize === 0 && entry.decodedBodySize === 0;
      if (zero && !(entry.workerStart > 0) && otherSite(entry.name, win)) hiddenFiles += 1;
      return entry.transferSize;
    }
    estimated = true;
    if (isCount(entry.encodedBodySize)) return entry.encodedBodySize;
    sizesMissing = true;
    return 0;
  };
  // Counts one timing entry unless it was counted before.
  const take = (entry) => {
    if (!entry || typeof entry !== "object") return;
    const id = entry.entryType === "navigation" ? "navigation" : entry.name + "|" + entry.startTime + "|" + entry.responseEnd + "|" + entry.initiatorType;
    if (seen.has(id)) return;
    seen.add(id);
    const bytes = sizeOf(entry);
    if (bytes <= 0) return;
    if (entry.workerStart > 0 && entry.name) {
      if (shift(reported, entry.name) !== null) return;
      push(held, entry.name, { bytes, at: clock(), hold: entry.entryType === "navigation" ? HOLD_PAGE_MS : HOLD_MS });
      return;
    }
    down += bytes;
  };
  // Adds the files a service worker reports it fetched, except one already counted from the page's own timing entry.
  const onWorkerMessage = (event) => {
    const data = event && event.data;
    if (!data || data.type !== WORKER_MESSAGE) return;
    const now = clock();
    settle(now);
    for (const file of Array.isArray(data.files) ? data.files : []) {
      const url = Array.isArray(file) ? file[0] : null;
      const bytes = Array.isArray(file) ? file[1] : 0;
      if (!isCount(bytes) || bytes === 0) continue;
      if (typeof url === "string" && shift(held, url) === null) push(reported, url, now);
      down += bytes;
    }
    if (isCount(data.hidden)) hiddenFiles += data.hidden;
  };
  // Reads timing entries of one type, or none when the browser has no such list.
  const entriesOf = (type) => {
    try {
      return perf && typeof perf.getEntriesByType === "function" ? perf.getEntriesByType(type) || [] : [];
    } catch (err) {
      return [];
    }
  };
  // Counts the page's own load once its response has fully arrived.
  const checkNavigation = () => {
    if (navigationDone) return;
    const nav = entriesOf("navigation")[0];
    if (!nav) return;
    if (!(nav.responseEnd > 0)) return;
    navigationDone = true;
    take(nav);
  };
  // Without an observer, reads the resource entries past the last index read, starting over if the list shrank.
  const poll = () => {
    const list = entriesOf("resource");
    if (list.length < polled) polled = 0;
    for (let i = polled; i < list.length; i++) take(list[i]);
    polled = list.length;
  };
  // Raises the resource timing buffer so long sessions keep their entries, and again each time it fills.
  const raiseBuffer = () => {
    if (!perf || typeof perf.setResourceTimingBufferSize !== "function") return;
    try {
      perf.setResourceTimingBufferSize(BUFFER_SIZE);
    } catch (err) {
      return;
    }
    const onFull = () => {
      try {
        perf.setResourceTimingBufferSize(entriesOf("resource").length + BUFFER_MARGIN);
      } catch (err) {
        return;
      }
    };
    if (typeof perf.addEventListener === "function") {
      perf.addEventListener("resourcetimingbufferfull", onFull);
      listeners.push([perf, "resourcetimingbufferfull", onFull]);
    }
  };
  // Starts the observer, trying the buffered form first and the older entryTypes form where that throws.
  const observe = () => {
    const Observer = win.PerformanceObserver;
    if (typeof Observer !== "function") return;
    try {
      observer = new Observer((list) => list.getEntries().forEach(take));
    } catch (err) {
      observer = null;
      return;
    }
    try {
      observer.observe({ type: "resource", buffered: true });
    } catch (err) {
      try {
        observer.observe({ entryTypes: ["resource"] });
      } catch (err2) {
        observer = null;
      }
    }
  };
  // Writes the session total to sessionStorage, quietly doing nothing when storage is blocked.
  const save = () => {
    settle(Infinity);
    const total = { down: base.down + down, up: base.up + up };
    const store = sessionStore(win);
    try {
      if (store) store.setItem(key, JSON.stringify(total));
      lastSaved = total;
    } catch (err) {
      return;
    }
  };
  // Adds the traffic other pages in this tab added while this page sat in the back-forward cache.
  const resume = (event) => {
    if (!event || !event.persisted) return;
    const stored = readStored();
    base = { down: base.down + Math.max(0, stored.down - lastSaved.down), up: base.up + Math.max(0, stored.up - lastSaved.up) };
    lastSaved = { down: Math.max(stored.down, lastSaved.down), up: Math.max(stored.up, lastSaved.up) };
  };
  // Saves when the page is hidden; hidden pages may never come back.
  const onVisibility = () => {
    if (win.document && win.document.visibilityState === "hidden") save();
  };
  // Adds an event listener and remembers it so stop() can remove it.
  const listen = (target, type, fn) => {
    if (!target || typeof target.addEventListener !== "function") return;
    target.addEventListener(type, fn);
    listeners.push([target, type, fn]);
  };
  // Starts counting. Calling it again does nothing, and starting again after stop() keeps the total it had.
  const start = () => {
    if (started) return api;
    started = true;
    if (!everStarted) {
      base = readStored();
      lastSaved = base;
    }
    everStarted = true;
    raiseBuffer();
    observe();
    entriesOf("resource").forEach(take);
    polled = entriesOf("resource").length;
    checkNavigation();
    listen(win, "pagehide", save);
    listen(win, "pageshow", resume);
    listen(win.document, "visibilitychange", onVisibility);
    listen(win.navigator && win.navigator.serviceWorker, "message", onWorkerMessage);
    return api;
  };
  // Adds bytes the app downloaded that timing cannot see, such as socket messages.
  const addDownload = (bytes) => {
    if (!isCount(bytes) || bytes === 0) return;
    down += bytes;
  };
  // Adds bytes the app uploaded, such as a diagnostic log it posted.
  const addUpload = (bytes) => {
    if (!isCount(bytes) || bytes === 0) return;
    up += bytes;
  };
  // The totals and the data rate at a time on the page's performance clock.
  const stats = (at) => {
    const now = isCount(at) ? at : clock();
    checkNavigation();
    if (!observer) poll();
    settle(clock());
    const seconds = Math.max(1, (now - origin) / 1000);
    return {
      downloaded: base.down + down, uploaded: base.up + up, rate: (down + up) / seconds,
      estimated: estimated || sizesMissing || hiddenFiles > 0, hiddenFiles, sizesMissing,
    };
  };
  // Stops counting and removes the observer and every listener.
  const stop = () => {
    if (observer) observer.disconnect();
    observer = null;
    for (const [target, type, fn] of listeners.splice(0)) target.removeEventListener(type, fn);
    started = false;
  };
  // Switches to a sessionStorage key given after the collector was made without one, and takes the session total
  // stored under it. A key given at creation or already adopted stays.
  const adoptKey = (next) => {
    if (!next || keyGiven) return;
    key = next;
    keyGiven = true;
    if (!everStarted) return;
    base = readStored();
    lastSaved = base;
  };
  const api = { start, stop, stats, save, addDownload, addUpload, adoptKey };
  return api;
}
// The collector shared by everything on one window, so start.js and the meter count into the same total. The first
// caller that names a storageKey sets it, whichever module runs first.
export function getCollector(options) {
  const win = (options && options.window) || globalThis;
  let collector = collectors.get(win);
  if (!collector) {
    collector = createCollector(options);
    collectors.set(win, collector);
  } else if (options && options.storageKey) {
    collector.adoptKey(options.storageKey);
  }
  return collector;
}
