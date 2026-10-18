// workspace/lag-o-meter/src/meter.js
// The classic renderer. It draws the four numbers, the bar with its ticks and centre mark, and the download line from a
// stats object, inside a shadow root so page styles neither reach in nor leak out. Clicks and touches pass through it to
// the game, except on the download line, which keeps the tooltip. It knows nothing about any game, network or storage,
// and it never starts a timer: the caller calls update().
import { DEFAULTS } from "./defaults.js";
import { formatPing, formatLoss, formatRate, pingColor, lossColor, downloadLine, tooltip } from "./format.js";
const TEXT_FIELDS = ["ping", "lossOut", "lossIn", "rate"];
// Arial advance widths in ems for the characters the figures use. Any other character counts as a digit.
const ADVANCE = { ".": 0.278, "%": 0.889, "-": 0.333, " ": 0.278 };
// The clear space a figure keeps before the next column, in ems, which is more than half the digit height.
const CLEAR_EM = 0.4;
// The longest step one update moves the ticks by, in milliseconds.
const MAX_STEP_MS = 2000;
// Rounds a CSS pixel position to the nearest device pixel.
function snap(value, dpr) {
  return Math.round(value * dpr) / dpr;
}
// A #rrggbb colour with each channel multiplied by factor, for the bar's darker edges, ticks and centre mark. Any other
// colour form comes back unchanged.
export function shade(hex, factor) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const channel = (i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * factor).toString(16).padStart(2, "0");
  return "#" + channel(1) + channel(3) + channel(5);
}
// The horizontal scale that keeps a figure inside room pixels: 1 when it fits, less when it would run into the next
// column, so only an unusually wide figure such as a 5-digit ping is narrowed.
export function fitScale(text, room, s) {
  const width = [...String(text)].reduce((sum, ch) => sum + (ADVANCE[ch] || 0.556), 0) * s.fontSize;
  return width > room ? room / width : 1;
}
// The bar's colours for the latest request: green for an answer under pingYellow, yellow under pingRed, red for a slower
// answer, a failed request or a browser that says it is offline. A request still waiting counts by how long it has
// waited, and with nothing to judge yet the bar is dim. Returns { color, edge, mark }.
export function barColors(stats, s) {
  const st = stats || {};
  let level = 0;
  if (st.health === null || st.health === undefined) level = -1;
  else if (st.pingFailed || st.offline) level = 2;
  else if (typeof st.ping === "number" && st.ping >= s.pingRed) level = 2;
  else if (typeof st.ping === "number" && st.ping >= s.pingYellow) level = 1;
  if (level === -1) return { color: s.dim, edge: shade(s.dim, s.edgeShade), mark: shade(s.dim, s.markShade) };
  const color = [s.barGreen, s.yellow, s.red][level];
  const edge = [s.edgeShade, s.edgeShadeYellow, s.edgeShadeRed][level];
  const mark = [s.markShade, s.markShadeYellow, s.markShadeRed][level];
  return { color, edge: shade(color, edge), mark: shade(color, mark) };
}
// How far a tick travels from its end of the bar before it is dropped, short of the centre mark.
export function tickReach(s) {
  return s.width / 2 - s.tickEdge - s.tickClear;
}
// The space between a tick and the one before it in its half: tickGap pixels plus the wait between them on a stretched
// clock, so a few milliseconds add almost nothing, a second about 37 pixels and fullWaitMs or more the whole half.
export function tickSpace(waitMs, s) {
  const wait = Math.max(0, waitMs || 0);
  const stretched = Math.min(1, Math.log1p(wait / s.stretchMs) / Math.log1p(s.fullWaitMs / s.stretchMs));
  return s.tickGap + (tickReach(s) - s.tickGap) * stretched;
}
// The two rows of ticks: sends on the left half moving right, arrivals on the right half moving left, both toward the
// centre. Each send or arrival adds a tick at its end of the bar and pushes the row in by the space after the one before.
// A row glides toward its target position and never lags more than backlog pixels behind.
export function createRows(settings) {
  const s = Object.assign({}, DEFAULTS, settings || {});
  const fresh = () => ({ base: 0, last: null, shown: 0, ticks: [] });
  const rows = { out: fresh(), in: fresh() };
  let seen = 0;
  const goal = (row, now) => (row.last === null ? row.base : row.base + tickSpace(now - row.last, s) - s.tickGap);
  // Adds the events not seen before, oldest first. Each event is { n, dir, at } with n counting up.
  const feed = (events) => {
    const list = Array.isArray(events) ? events.filter((e) => e && e.n > seen && rows[e.dir] && Number.isFinite(e.at)) : [];
    list.sort((a, b) => a.n - b.n);
    for (const e of list) {
      const row = rows[e.dir];
      row.base = goal(row, e.at) + s.tickGap;
      row.last = row.last === null ? e.at : Math.max(row.last, e.at);
      row.ticks.push(row.base);
      seen = e.n;
    }
  };
  // Moves both rows on by dtMs at time now.
  const advance = (now, dtMs) => {
    const dt = Math.max(0, Math.min(MAX_STEP_MS, dtMs || 0));
    for (const row of [rows.out, rows.in]) {
      const target = Number.isFinite(now) ? goal(row, now) : row.base;
      row.shown = Math.max(row.shown, target - s.backlog);
      row.shown += (target - row.shown) * (1 - Math.exp(-dt / s.glideMs));
      row.ticks = row.ticks.filter((pos) => row.shown - pos < tickReach(s));
    }
  };
  // The left edges of the ticks on the bar, each on a device pixel.
  const lefts = (dpr) => {
    const ratio = dpr || 1;
    const out = [];
    for (const pos of rows.out.ticks) {
      const d = rows.out.shown - pos;
      if (d >= 0) out.push(snap(s.tickEdge + d - s.tickWidth / 2, ratio));
    }
    for (const pos of rows.in.ticks) {
      const d = rows.in.shown - pos;
      if (d >= 0) out.push(snap(s.width - s.tickEdge - d - s.tickWidth / 2, ratio));
    }
    return out.sort((x, y) => x - y);
  };
  return { feed, advance, lefts };
}
// Sets an element's style properties from a plain object.
function styleOf(el, props) {
  for (const key of Object.keys(props)) el.style.setProperty(key, props[key]);
}
// Makes one element inside the meter with a class from the meter's style sheet and a few inline properties.
function part(doc, parent, tag, cls, props) {
  const el = doc.createElement(tag);
  el.className = cls;
  if (props) styleOf(el, props);
  parent.appendChild(el);
  return el;
}
// The meter's style sheet. Inside a shadow root the rules reach only the meter; in the plain-element fallback every
// selector starts with the host's tag name and every rule resets the page's styles first.
function sheet(s, scope) {
  const p = scope ? "lag-o-meter " : "";
  const reset = "all:initial;position:absolute;display:block;margin:0;padding:0;border:0;pointer-events:none;";
  const text = "font-family:" + s.fontFamily + ";font-weight:normal;font-style:normal;white-space:pre;letter-spacing:0;color:" + s.textGreen + ";";
  const row = "font-size:" + s.fontSize + "px;line-height:" + s.rowHeight + "px;";
  return [
    p + ".m{" + reset + "left:0;top:0;width:" + (s.width + s.reserveRight) + "px;height:" + s.height + "px}",
    p + ".f{" + reset + text + row + "top:0;transform-origin:0 0}",
    p + ".s{" + reset + "top:" + s.barTop + "px;height:" + s.barHeight + "px}",
    p + ".t{" + reset + "top:" + (s.barTop - s.tickHeight) + "px;width:" + s.tickWidth + "px;height:" + s.tickHeight + "px}",
    p + ".k{" + reset + "top:" + s.barTop + "px;width:" + s.markWidth + "px;height:" + s.barHeight + "px;left:" +
      Math.round(s.width / 2 - s.markWidth / 2) + "px}",
    p + ".l{" + reset + text + "font-weight:bold;left:0;width:" + s.width + "px;text-align:center;top:" + s.lineTop + "px;font-size:" + s.lineFontSize +
      "px;line-height:" + s.lineFontSize + "px;pointer-events:auto}",
  ].join("\n");
}
// Creates the meter's elements. Nothing is attached to the page until the caller appends meter.host.
export function createMeter(doc, settings) {
  const s = Object.assign({}, DEFAULTS, settings || {});
  const host = doc.createElement("lag-o-meter");
  styleOf(host, {
    all: "initial", position: "fixed", display: "block", width: s.width + s.reserveRight + "px", height: s.height + "px",
    "z-index": String(s.zIndex), contain: "layout paint", "pointer-events": "none", "user-select": "none", "-webkit-user-select": "none",
  });
  host.setAttribute("aria-hidden", "true");
  let shadow = null;
  try {
    shadow = typeof host.attachShadow === "function" ? host.attachShadow({ mode: "open" }) : null;
  } catch (err) {
    shadow = null;
  }
  const root = shadow || host;
  const frame = part(doc, root, "div", "m");
  const style = doc.createElement("style");
  style.textContent = sheet(s, !shadow);
  root.appendChild(style);
  const fields = {};
  const rooms = {};
  TEXT_FIELDS.forEach((name, i) => {
    fields[name] = part(doc, frame, "span", "f", { left: Math.round((s.width * i) / 4) + "px" });
    rooms[name] = i < TEXT_FIELDS.length - 1 ? s.width / 4 - CLEAR_EM * s.fontSize : s.width / 4 + s.reserveRight - 1;
  });
  const bar = part(doc, frame, "div", "s", { left: "0px", width: s.width + "px" });
  const ticks = [];
  const most = 2 * (Math.floor(tickReach(s) / s.tickGap) + 1);
  for (let i = 0; i < most; i++) ticks.push(part(doc, frame, "div", "t", { display: "none" }));
  const mark = part(doc, frame, "div", "k");
  const line = part(doc, frame, "div", "l");
  const last = new Map();
  // Writes a style property only when it differs from the value last written.
  const put = (el, key, value) => {
    const memo = last.get(el) || {};
    if (memo[key] === value) return;
    memo[key] = value;
    last.set(el, memo);
    if (key === "text") el.textContent = value;
    else el.style.setProperty(key, value);
  };
  const rows = createRows(s);
  let title = "";
  // Draws the stats. dtMs is the time in milliseconds between this update and the one before; the ticks move by that
  // much toward where stats.now puts them.
  const update = (stats, dtMs, dpr) => {
    const st = stats || {};
    rows.feed(st.events);
    rows.advance(st.now, dtMs);
    const texts = { ping: formatPing(st.ping), lossOut: formatLoss(st.lossOut), lossIn: formatLoss(st.lossIn), rate: formatRate(st.rate) };
    const inks = { ping: pingColor(st.ping, s), lossOut: lossColor(st.lossOut, s), lossIn: lossColor(st.lossIn, s), rate: s.textGreen };
    for (const name of TEXT_FIELDS) {
      const scale = fitScale(texts[name], rooms[name], s);
      put(fields[name], "text", texts[name]);
      put(fields[name], "color", inks[name]);
      put(fields[name], "transform", scale === 1 ? "none" : "scaleX(" + scale.toFixed(3) + ")");
    }
    put(line, "text", downloadLine(st));
    const colors = barColors(st, s);
    put(bar, "background", colors.color);
    put(bar, "box-shadow", "inset 0 1px " + colors.edge + ", inset 0 -1px " + colors.edge);
    const lefts = rows.lefts(dpr);
    ticks.forEach((el, i) => {
      const x = lefts[i];
      put(el, "display", x === undefined ? "none" : "block");
      if (x === undefined) return;
      put(el, "left", x + "px");
      put(el, "background", colors.edge);
    });
    put(mark, "background", colors.mark);
    const next = tooltip(st, s);
    if (next !== title) {
      title = next;
      host.setAttribute("title", next);
    }
  };
  // Removes the meter from the page.
  const destroy = () => {
    if (host.parentNode) host.parentNode.removeChild(host);
    last.clear();
  };
  return { host, shadow, update, destroy, settings: s };
}
