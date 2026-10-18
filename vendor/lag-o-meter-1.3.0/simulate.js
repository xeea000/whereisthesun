// workspace/lag-o-meter/src/simulate.js
// The demo network, used only by the labelled demo mode and by tests. It plays a pretend game that sends one request a
// second and feeds a real connection tracker with the simulated answers, so the meter behaves exactly as it does for a
// real game. Latency, jitter, loss each way, a stall, a disconnect and a restore are set from the outside. Every figure
// it gives is marked demo, and nothing here touches the network.
import { DEFAULTS } from "./defaults.js";
import { createConnection } from "./connection.js";
const SEND_EVERY_MS = 1000;
const PACKETS_PER_SECOND = 20;
const LOSS_WINDOW_S = 10;
const RESEND_DELAY_MS = 1500;
// A small seeded random number generator, so a demo run repeats exactly.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Creates a simulator. options: latency, jitter (both ms), lossOut, lossIn (percent), rate (bytes per second),
// downloaded (the starting session total), seed, now (a clock), graceMs and timeoutMs.
export function createSimulator(options) {
  const opts = options || {};
  const perf = globalThis.performance;
  const clock = typeof opts.now === "function" ? opts.now : () => (perf ? perf.now() : Date.now());
  const random = seeded(opts.seed || 1999);
  const conditions = { latency: 85, jitter: 15, lossOut: 0, lossIn: 0, rate: 673 };
  const windowMs = opts.rateWindowMs || DEFAULTS.rateWindowMs;
  const connection = createConnection({ graceMs: opts.graceMs, timeoutMs: opts.timeoutMs, now: clock, window: {} });
  let downloaded = typeof opts.downloaded === "number" ? opts.downloaded : 4800000;
  let uploaded = 0;
  let disconnected = false;
  let stallUntil = -Infinity;
  let request = null;
  const start = clock();
  let nextSend = start;
  let nextSecond = start + 1000;
  const seconds = [];
  const loss = { out: 0, in: 0 };
  // Changes the simulated conditions; any field left out keeps its value.
  const set = (next) => {
    for (const name of Object.keys(conditions)) {
      if (next && typeof next[name] === "number" && Number.isFinite(next[name])) conditions[name] = Math.max(0, next[name]);
    }
  };
  set(opts);
  // How long the next answer takes, or Infinity while disconnected.
  const answerDelay = (sentAt) => {
    if (disconnected) return Infinity;
    let delay = Math.max(1, conditions.latency + conditions.jitter * (random() * 2 - 1));
    const lost = 1 - (1 - conditions.lossOut / 100) * (1 - conditions.lossIn / 100);
    if (random() < lost) delay += RESEND_DELAY_MS;
    if (stallUntil > sentAt) delay = Math.max(delay, stallUntil - sentAt);
    return delay;
  };
  // One simulated second of packets and bytes. While nothing gets through, no packets are counted, so the loss
  // figures keep their last measured values and the bar follows the time waited.
  const tickSecond = () => {
    const through = !disconnected && stallUntil < nextSecond;
    const sent = through ? PACKETS_PER_SECOND : 0;
    let lostOut = 0;
    let lostIn = 0;
    for (let i = 0; i < sent; i++) {
      if (random() < conditions.lossOut / 100) lostOut += 1;
      if (random() < conditions.lossIn / 100) lostIn += 1;
    }
    const bytes = through ? Math.round(conditions.rate * (0.9 + random() * 0.2)) : 0;
    downloaded += Math.round(bytes * 0.85);
    uploaded += bytes - Math.round(bytes * 0.85);
    seconds.push({ at: nextSecond, sent, lostOut, lostIn, bytes });
    while (seconds.length > LOSS_WINDOW_S) seconds.shift();
    nextSecond += 1000;
  };
  // Plays the pretend game forward to a time.
  const advance = (now) => {
    for (let guard = 0; guard < 100000; guard++) {
      const answerAt = request ? request.sentAt + request.delay : Infinity;
      const sendAt = request ? Infinity : nextSend;
      const next = Math.min(answerAt, sendAt, nextSecond);
      if (next > now) return;
      if (next === nextSecond) tickSecond();
      else if (next === answerAt) {
        request.handle.ok(answerAt);
        request = null;
        nextSend = answerAt + SEND_EVERY_MS;
      } else {
        request = { sentAt: sendAt, delay: answerDelay(sendAt), handle: connection.begin(sendAt) };
      }
    }
  };
  // Holds every answer back for a while, as a long stall would.
  const stall = (ms) => {
    const now = clock();
    advance(now);
    stallUntil = now + (typeof ms === "number" ? ms : 4000);
    if (request) request.delay = Math.max(request.delay, stallUntil - request.sentAt);
  };
  // Stops every answer until restore().
  const disconnect = () => {
    advance(clock());
    disconnected = true;
    if (request) request.delay = Infinity;
  };
  // Brings the connection back: the waiting request is answered after the normal latency.
  const restore = () => {
    const now = clock();
    advance(now);
    disconnected = false;
    stallUntil = -Infinity;
    if (request) request.delay = now - request.sentAt + Math.max(1, conditions.latency);
  };
  // The stats for the meter at a time on the simulator's clock.
  const stats = (at) => {
    const now = typeof at === "number" ? at : clock();
    advance(now);
    let sent = 0;
    let lostOut = 0;
    let lostIn = 0;
    let bytes = 0;
    for (const second of seconds) {
      sent += second.sent;
      lostOut += second.lostOut;
      lostIn += second.lostIn;
      if (second.at > now - windowMs) bytes += second.bytes;
    }
    if (sent) {
      loss.out = (100 * lostOut) / sent;
      loss.in = (100 * lostIn) / sent;
    }
    connection.setLoss(loss.out, loss.in);
    const state = connection.state(now);
    return {
      ping: state.ping, pingWaiting: state.pingWaiting, pingFailed: state.pingFailed, lossOut: state.lossOut, lossIn: state.lossIn,
      rate: bytes / (windowMs / 1000), health: state.health, offline: state.offline, now: state.now, events: state.events, downloaded, uploaded,
      estimated: false, demo: true,
    };
  };
  return { set, stall, disconnect, restore, stats, conditions, connection };
}
