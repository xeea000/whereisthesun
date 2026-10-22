// workspace/lag-o-meter/src/lag-o-meter.js
// The one call a game makes. mountLagOMeter puts the meter on the page, wires the shared bandwidth collector and a
// connection tracker to the renderer, and owns the update timer, the show and hide setting and the placement. It
// redraws every drawMs, a third of a second by default (every 20th frame at 60 frames a second), and stops while the
// page or the meter is hidden.
import { DEFAULTS } from "./defaults.js";
import { VERSION } from "./version.js";
import { createMeter } from "./meter.js";
import { getCollector } from "./collector.js";
import { createConnection } from "./connection.js";
export { VERSION, DEFAULTS };
export { createMeter } from "./meter.js";
export { createCollector, getCollector } from "./collector.js";
export { createConnection } from "./connection.js";
export { mountLagControls, loadLagPrefs, saveLagPrefs, applyLagPrefs, LAG_PREF_DEFAULTS } from "./controls.js";
const PINS = { left: "0%", center: "50%", right: "100%" };
const CORNERS = ["bottom-right", "bottom-left", "top-right", "top-left"];
// Reads a remembered visible flag from localStorage: true, false, or null when there is none or storage throws.
function readRemembered(win, key) {
  if (!key) return null;
  try {
    const value = win.localStorage ? win.localStorage.getItem(key) : null;
    if (value === "1") return true;
    if (value === "0") return false;
    return null;
  } catch (err) {
    return null;
  }
}
// Writes the visible flag to localStorage, quietly doing nothing when storage is blocked.
function writeRemembered(win, key, visible) {
  if (!key) return;
  try {
    if (win.localStorage) win.localStorage.setItem(key, visible ? "1" : "0");
  } catch (err) {
    return;
  }
}
// Mounts the meter. Every option is optional:
// container (default document.body), corner ("bottom-right", "bottom-left", "top-right" or "top-left"), x and y (pixel
// offsets from that corner, added to the device safe-area insets), visible (the game's own setting), rememberKey (a
// localStorage key for games without a settings store), collector (instead of the shared one), connection (a tracker
// to use instead of a new one), onRecheck
// (called when the browser says it is online again), source (an object with stats(now), such as the demo simulator,
// used instead of the collector and the connection), storageKey (the sessionStorage key for the session total),
// settings (overrides for DEFAULTS), window, bright (true starts in high visibility; setBright(on) changes it), scale
// (0.5 to 1, setScale) and pin ("left", "center" or "right": the side that stays put when scaled down, setPin).
export function mountLagOMeter(options) {
  const opts = options || {};
  const win = opts.window || globalThis;
  const doc = win.document;
  const s = Object.assign({}, DEFAULTS, opts.settings || {});
  const perf = win.performance;
  const clock = () => (perf && typeof perf.now === "function" ? perf.now() : Date.now());
  const source = opts.source && typeof opts.source.stats === "function" ? opts.source : null;
  const shared = () => getCollector({ window: win, storageKey: opts.storageKey || (opts.settings || {}).storageKey });
  const collector = source ? null : (opts.collector || shared()).start();
  const ownConnection = !opts.connection && !source;
  const connection = opts.connection || (source ? source.connection || null : createConnection({
    window: win, graceMs: s.graceMs, timeoutMs: s.timeoutMs, lossHealthZero: s.lossHealthZero, lossSample: s.lossSample, onRecheck: opts.onRecheck,
  }));
  const meter = createMeter(doc, s);
  const container = opts.container || doc.body;
  const position = container === doc.body ? "fixed" : "absolute";
  meter.host.style.setProperty("position", position);
  container.appendChild(meter.host);
  let visible = typeof opts.visible === "boolean" ? opts.visible : readRemembered(win, opts.rememberKey);
  if (visible === null) visible = true;
  let timer = null;
  let last = null;
  let alive = true;
  // The stats object the renderer draws.
  const gather = (now) => {
    if (source) return source.stats(now);
    const traffic = collector.stats(now);
    const link = connection ? connection.state() : { ping: null, pingWaiting: false, lossOut: null, lossIn: null, health: null };
    return Object.assign({}, link, traffic, { demo: false });
  };
  // Draws once.
  const tick = () => {
    if (!alive) return;
    const now = clock();
    const dt = last === null ? 0 : now - last;
    last = now;
    meter.update(gather(now), dt, win.devicePixelRatio || 1);
  };
  const pageHidden = () => Boolean(doc && doc.visibilityState === "hidden");
  const stopTimers = () => {
    if (timer !== null) win.clearInterval(timer);
    timer = null;
  };
  // Runs the timer only while the meter is shown and the page is visible.
  const sync = () => {
    if (!alive) return;
    if (!visible || pageHidden()) {
      stopTimers();
      return;
    }
    if (timer === null) {
      last = null;
      tick();
      timer = win.setInterval(tick, s.drawMs);
    }
  };
  if (doc && typeof doc.addEventListener === "function") doc.addEventListener("visibilitychange", sync);
  let where = s.corner;
  // Moves the meter to a corner with pixel offsets; the safe-area insets are added to the offsets.
  const setPlace = (corner, x, y) => {
    where = CORNERS.includes(corner) ? corner : s.corner;
    const dx = typeof x === "number" && Number.isFinite(x) ? x : s.offsetX;
    const dy = typeof y === "number" && Number.isFinite(y) ? y : s.offsetY;
    const [vertical, horizontal] = where.split("-");
    const style = meter.host.style;
    for (const side of ["top", "bottom", "left", "right"]) style.removeProperty(side);
    style.setProperty(vertical, "calc(" + dy + "px + env(safe-area-inset-" + vertical + ", 0px))");
    style.setProperty(horizontal, "calc(" + dx + "px + env(safe-area-inset-" + horizontal + ", 0px))");
    if (!style.getPropertyValue(vertical)) style.setProperty(vertical, dy + "px");
    if (!style.getPropertyValue(horizontal)) style.setProperty(horizontal, dx + "px");
    reshape();
    return api;
  };
  let scale = 1;
  let pin = "center";
  // Applies the scale and the pinned side: the left edge, the middle or the right edge stays put, on the corner's side.
  const reshape = () => {
    const vertical = String(where).startsWith("top") ? "0%" : "100%";
    scale = meter.setScale(scale, PINS[pin], vertical);
  };
  // Shows or hides the meter, remembering the choice when a rememberKey was given.
  const setVisible = (next) => {
    visible = Boolean(next);
    meter.host.style.setProperty("display", visible ? "block" : "none");
    writeRemembered(win, opts.rememberKey, visible);
    sync();
    return visible;
  };
  // Removes the meter, its timer and listeners. A tracker it made itself is destroyed too; the shared collector keeps
  // counting for the rest of the page session.
  const destroy = () => {
    if (!alive) return;
    alive = false;
    stopTimers();
    if (doc && typeof doc.removeEventListener === "function") doc.removeEventListener("visibilitychange", sync);
    if (ownConnection && connection) connection.destroy();
    meter.destroy();
  };
  const api = {
    element: meter.host, connection, collector, version: VERSION,
    show: () => setVisible(true), hide: () => setVisible(false), toggle: () => setVisible(!visible),
    isVisible: () => visible, setPlace, update: tick, destroy,
    setBright: (on) => { meter.setBright(on); return api; }, isBright: () => meter.isBright(),
    setScale: (k) => { scale = Number(k) || 1; reshape(); return api; }, getScale: () => scale,
    setPin: (side) => { pin = PINS[side] ? side : "center"; reshape(); return api; }, getPin: () => pin,
  };
  setPlace(opts.corner, opts.x, opts.y);
  if (opts.bright) meter.setBright(true);
  if (opts.scale !== undefined) api.setScale(opts.scale);
  if (opts.pin !== undefined) api.setPin(opts.pin);
  meter.host.style.setProperty("display", visible ? "block" : "none");
  if (visible && !pageHidden()) sync();
  else tick();
  return api;
}
