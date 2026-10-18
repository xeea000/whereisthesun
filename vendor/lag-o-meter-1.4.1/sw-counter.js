// workspace/lag-o-meter/src/sw-counter.js
// The service worker half of the download count. A page reads a size of 0 for every file its service worker answers, so the
// worker counts what it really fetches over the network and tells its pages, whose collector adds it. A game with a service
// worker loads this file in it with importScripts("<the meter's folder>/sw-counter.js"), or imports it from a module worker;
// it starts at once and needs nothing else. It reads the worker's own timing entries, whose transferSize is what each fetch
// moved (0 for a hit in the browser's HTTP cache). A file from another site sent without timing permission shows no size
// there, so the worker's fetch is wrapped to note the Content-Length (or the body length) of each readable response, which
// stands in for it; a file whose size stays unknown counts as hidden. Every quarter second the worker posts
// { type: "lag-o-meter-bytes", files: [[url, bytes], ...], hidden } to each page of its origin. A page load goes only to the
// page it opens, once that page exists. It makes no request of its own, and every request and response passes through
// unchanged; its fetch listener only notes which page a navigation opens. It runs only inside a service worker; it has no
// exports and no imports, so it loads either way.
(() => {
  const scope = typeof self === "object" ? self : null;
  if (!scope || typeof scope.fetch !== "function" || scope.fetch.lagOMeter || !scope.clients || !scope.PerformanceObserver) return;
  const FLUSH_MS = 250;
  const KEEP_MS = 60000;
  const SETTLE_MS = 1000;
  const TRIES = 40;
  const real = scope.fetch;
  const readable = new Map();
  const opening = new Map();
  let files = [];
  let hidden = 0;
  let timer = null;
  // The absolute address a fetch asked for.
  const addressOf = (input) => {
    try {
      return new URL(typeof input === "string" ? input : input && input.url ? input.url : String(input), scope.location.href).href;
    } catch (err) {
      return "";
    }
  };
  // True for an address on another site than the worker.
  const otherSite = (url) => {
    try {
      return new URL(url).origin !== scope.location.origin;
    } catch (err) {
      return false;
    }
  };
  // Posts the files waiting in the queue to every page of this origin and empties the queue.
  const flush = () => {
    timer = null;
    if (!files.length && !hidden) return;
    const message = { type: "lag-o-meter-bytes", files, hidden };
    files = [];
    hidden = 0;
    scope.clients.matchAll({ includeUncontrolled: true, type: "window" })
      .then((list) => list.forEach((client) => client.postMessage(message)))
      .catch(() => undefined);
  };
  const soon = () => {
    if (timer === null) timer = setTimeout(flush, FLUSH_MS);
  };
  // Posts one file to one page, trying again every quarter second until that page exists, for up to ten seconds.
  const deliver = (id, file, tries) => {
    scope.clients.get(id).then((client) => {
      if (client) client.postMessage({ type: "lag-o-meter-bytes", files: [file], hidden: 0 });
      else if (tries > 0) setTimeout(() => deliver(id, file, tries - 1), FLUSH_MS);
    }, () => undefined);
  };
  // Queues a counted file, or sends a page load to the page it opens.
  const add = (url, bytes) => {
    const page = opening.get(url);
    opening.delete(url);
    if (page) deliver(page.id, [url, bytes], TRIES);
    else {
      files.push([url, bytes]);
      soon();
    }
  };
  // Keeps the size of a readable response, for a file whose timing entry may hide it.
  const remember = (url, response) => {
    if (!url || !response || response.type === "opaque" || response.type === "opaqueredirect") return;
    const now = Date.now();
    for (const [key, value] of readable) if (now - value.at > KEEP_MS) readable.delete(key);
    const length = Number(response.headers && response.headers.get("content-length"));
    if (length > 0) {
      readable.set(url, { bytes: length, at: now });
      return;
    }
    try {
      response.clone().arrayBuffer().then((body) => {
        if (body.byteLength > 0) readable.set(url, { bytes: body.byteLength, at: Date.now() });
      }, () => undefined);
    } catch (err) {
      return;
    }
  };
  // Counts one of the worker's own timing entries.
  const take = (entry) => {
    const url = entry.name;
    if (entry.transferSize > 0) {
      readable.delete(url);
      add(url, entry.transferSize);
      return;
    }
    if (entry.encodedBodySize > 0 || entry.decodedBodySize > 0 || !otherSite(url)) return;
    setTimeout(() => {
      const known = readable.get(url);
      readable.delete(url);
      if (known) add(url, known.bytes);
      else {
        hidden += 1;
        soon();
      }
    }, SETTLE_MS);
  };
  const counted = (input, init) => real.call(scope, input, init).then((response) => {
    remember(addressOf(input), response);
    return response;
  });
  counted.lagOMeter = true;
  try {
    new scope.PerformanceObserver((list) => list.getEntries().forEach(take)).observe({ type: "resource", buffered: true });
  } catch (err) {
    return;
  }
  scope.fetch = counted;
  scope.addEventListener("fetch", (event) => {
    const request = event.request;
    if (!request || request.mode !== "navigate" || !event.resultingClientId) return;
    const now = Date.now();
    for (const [key, value] of opening) if (now - value.at > KEEP_MS) opening.delete(key);
    opening.set(request.url, { id: event.resultingClientId, at: now });
  });
  const perf = scope.performance;
  if (perf && typeof perf.addEventListener === "function" && typeof perf.clearResourceTimings === "function") {
    perf.addEventListener("resourcetimingbufferfull", () => perf.clearResourceTimings());
  }
})();
