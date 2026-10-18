// workspace/lag-o-meter/src/connection.js
// The connection tracker. A game's adapter feeds it real events: a request sent and answered or failed, a socket
// message sent or heard, measured packet loss. It turns them into the ping, the loss figures, a health value from 0 to 1
// and a log of recent sends and arrivals for the bar's ticks. Health stays 1 however long the game is idle; it falls only while an answer is overdue past the grace
// time, after a request fails, after the browser reports going offline, while an expected socket message is late, or
// while the game reports measured packet loss.
import { DEFAULTS } from "./defaults.js";
const EVENT_LOG = 64;
// True for a finite number.
function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
// Creates a tracker. options: graceMs, timeoutMs, lossHealthZero (the loss percentage at which health from loss
// reaches 0), lossSample (how many recent requests the loss figures cover when the game's protocol cannot count lost
// packets), onRecheck (called when the browser says it is online again, so the
// game can make one real request), now (a clock in milliseconds) and window (for the online and offline events).
export function createConnection(options) {
  const opts = options || {};
  const win = opts.window || globalThis;
  const grace = isNumber(opts.graceMs) ? opts.graceMs : DEFAULTS.graceMs;
  const timeout = isNumber(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULTS.timeoutMs;
  const lossZero = isNumber(opts.lossHealthZero) && opts.lossHealthZero > 0 ? opts.lossHealthZero : DEFAULTS.lossHealthZero;
  const perf = win.performance;
  const clock = typeof opts.now === "function" ? opts.now : () => (perf && typeof perf.now === "function" ? perf.now() : Date.now());
  const time = (at) => (isNumber(at) ? at : clock());
  const open = new Set();
  let live = false;
  let ping = null;
  let failedAt = null;
  let failedSince = null;
  let offlineAt = null;
  let expectMs = 0;
  let lastHeard = null;
  let lossOut = null;
  let lossIn = null;
  const sample = isNumber(opts.lossSample) && opts.lossSample > 0 ? opts.lossSample : DEFAULTS.lossSample;
  const outcomes = [];
  const events = [];
  let eventCount = 0;
  // Logs a send ("out") or an arrival ("in") at a time, numbered so a reader can tell which ones it has seen.
  const note = (dir, at) => {
    eventCount += 1;
    events.push({ n: eventCount, dir, at });
    if (events.length > EVENT_LOG) events.shift();
  };
  // Keeps whether each of the last requests got an answer, for the loss figures of a game whose protocol cannot count
  // lost packets.
  const record = (lost) => {
    outcomes.push(lost);
    if (outcomes.length > sample) outcomes.shift();
  };
  let onRecheck = typeof opts.onRecheck === "function" ? opts.onRecheck : null;
  // A real answer: clears the failure state and the offline hint, and settles every request sent at or before
  // the answered one.
  const answered = (now, sentAt) => {
    for (const request of open) if (request.start <= sentAt) open.delete(request);
    live = true;
    failedAt = null;
    failedSince = null;
    offlineAt = null;
    lastHeard = now;
  };
  // Marks a request as sent and returns its handle. ok() means an answer arrived, at any HTTP status. fail() means a
  // network error with no answer; a request that was already overdue keeps the trouble time it had, so the bar goes on
  // falling from where it was. cancel() forgets a request the game aborted itself. Each handle settles once.
  const begin = (at) => {
    const request = { start: time(at) };
    live = true;
    open.add(request);
    note("out", request.start);
    const settle = () => {
      if (!open.has(request)) return false;
      open.delete(request);
      return true;
    };
    return {
      ok: (when) => {
        if (!settle()) return;
        const now = time(when);
        note("in", now);
        ping = Math.max(0, now - request.start);
        record(false);
        answered(now, request.start);
      },
      fail: (when) => {
        if (!settle()) return;
        const now = time(when);
        record(true);
        if (failedAt === null) {
          failedAt = Math.min(now, request.start + grace);
          failedSince = request.start;
        }
      },
      cancel: () => {
        settle();
      },
    };
  };
  // Tracks a promise such as a fetch: resolving is an answer, rejecting is a failure, and an abort is forgotten.
  const track = (promise) => {
    const handle = begin();
    if (promise && typeof promise.then === "function") {
      promise.then(() => handle.ok(), (err) => (err && err.name === "AbortError" ? handle.cancel() : handle.fail()));
    }
    return promise;
  };
  // A socket message arrived.
  const heard = (at) => {
    const now = time(at);
    note("in", now);
    answered(now, now);
  };
  // A socket message went out. It adds a tick to the sent half and judges nothing.
  const sent = (at) => {
    note("out", time(at));
  };
  // Sets how often a socket game expects to hear from its server; 0 turns the check off.
  const expect = (ms, at) => {
    expectMs = isNumber(ms) && ms > 0 ? ms : 0;
    if (expectMs && lastHeard === null) lastHeard = time(at);
    if (expectMs) live = true;
  };
  // Takes measured loss percentages from a protocol that counts lost packets each way; null for unknown.
  const setLoss = (out, back) => {
    lossOut = isNumber(out) ? Math.max(0, Math.min(100, out)) : null;
    lossIn = isNumber(back) ? Math.max(0, Math.min(100, back)) : null;
    if (lossOut !== null || lossIn !== null) live = true;
  };
  // Health from measured loss: 1 with no loss, falling to 0 at lossHealthZero percent.
  const lossHealth = () => 1 - Math.min(1, Math.max(lossOut || 0, lossIn || 0) / lossZero);
  // The time trouble began, or Infinity when nothing is wrong.
  const troubleSince = () => {
    let since = Infinity;
    for (const request of open) since = Math.min(since, request.start + grace);
    if (failedAt !== null) since = Math.min(since, failedAt);
    if (offlineAt !== null) since = Math.min(since, offlineAt);
    if (expectMs && lastHeard !== null) since = Math.min(since, lastHeard + expectMs + grace);
    return since;
  };
  // The time the oldest unanswered wait began and whether it ended in a failure, or null when nothing is overdue.
  const waitingSince = (now) => {
    let oldest = Infinity;
    for (const request of open) oldest = Math.min(oldest, request.start);
    if (oldest !== Infinity && now - oldest > grace) return { at: oldest, failed: false };
    if (failedSince !== null) return { at: failedSince, failed: true };
    if (expectMs && lastHeard !== null && now - lastHeard > expectMs + grace) return { at: lastHeard, failed: false };
    return null;
  };
  // The figures for the meter at a time on the tracker's clock.
  const state = (at) => {
    const now = time(at);
    const since = waitingSince(now);
    let health = null;
    if (live) {
      const trouble = troubleSince();
      const overdue = now <= trouble ? 1 : Math.max(0, Math.min(1, 1 - (now - trouble) / timeout));
      health = Math.min(overdue, lossHealth());
    }
    const measured = lossOut !== null || lossIn !== null;
    const requestLoss = outcomes.length ? (100 * outcomes.filter(Boolean).length) / outcomes.length : null;
    return {
      ping: since === null ? ping : Math.max(0, now - since.at), pingWaiting: since !== null, pingFailed: since !== null && since.failed,
      lossOut: measured ? lossOut : requestLoss, lossIn: measured ? lossIn : requestLoss,
      lossFromRequests: !measured && requestLoss !== null, health, offline: offlineAt !== null, now, events: events.slice(),
    };
  };
  const onOffline = () => {
    if (offlineAt === null) offlineAt = clock();
  };
  const onOnline = () => {
    if (!onRecheck) return;
    try {
      onRecheck();
    } catch (err) {
      return;
    }
  };
  const nav = win.navigator;
  if (nav && nav.onLine === false) offlineAt = clock();
  const listening = typeof win.addEventListener === "function";
  if (listening) {
    win.addEventListener("offline", onOffline);
    win.addEventListener("online", onOnline);
  }
  // Removes the online and offline listeners.
  const destroy = () => {
    if (!listening) return;
    win.removeEventListener("offline", onOffline);
    win.removeEventListener("online", onOnline);
  };
  // Replaces the hook called when the browser says it is online again.
  const setRecheck = (fn) => {
    onRecheck = typeof fn === "function" ? fn : null;
  };
  return { begin, track, heard, sent, expect, setLoss, state, destroy, setRecheck };
}
