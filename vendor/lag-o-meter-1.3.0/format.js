// workspace/lag-o-meter/src/format.js
// Turns the stats into the text the meter shows. A figure that cannot be measured prints as dashes of the same width.
export const NO_PING = "--";
export const NO_LOSS = "-.-%";
export const NO_RATE = "--";
const MAX_PING = 99999;
const MAX_RATE = 9999999;
// True for a finite number.
function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
// A ping in whole milliseconds, or dashes when it is unknown.
export function formatPing(ms) {
  if (!isNumber(ms) || ms < 0) return NO_PING;
  return String(Math.min(MAX_PING, Math.round(ms)));
}
// A loss percentage with one decimal, 100% without one so it fits its column, or dashes when the game cannot count
// lost packets.
export function formatLoss(percent) {
  if (!isNumber(percent)) return NO_LOSS;
  const value = Math.max(0, Math.min(100, percent));
  return value >= 99.95 ? "100%" : value.toFixed(1) + "%";
}
// The data rate as a whole number of bytes per second, or dashes when it is unknown.
export function formatRate(bytesPerSecond) {
  if (!isNumber(bytesPerSecond) || bytesPerSecond < 0) return NO_RATE;
  return String(Math.min(MAX_RATE, Math.round(bytesPerSecond)));
}
// A byte count in B, KB, MB or GB, counting 1000 bytes to the kilobyte as the browser's Network panel does. Under 10
// of a unit it keeps one decimal, and from 10 up it prints a whole number, so 248 KB, 1.2 MB and 4.8 MB.
export function formatBytes(bytes) {
  const n = isNumber(bytes) && bytes > 0 ? bytes : 0;
  if (n < 1000) return Math.round(n) + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let value = n / 1000;
  let unit = 0;
  while (unit < units.length - 1 && Math.round(value) >= 1000) {
    value /= 1000;
    unit += 1;
  }
  const text = value < 9.95 ? value.toFixed(1) : String(Math.round(value));
  return text + " " + units[unit];
}
// The colour of the ping figure: green, then yellow and red at the latency thresholds.
export function pingColor(ms, s) {
  if (!isNumber(ms)) return s.textGreen;
  if (ms >= s.pingRed) return s.red;
  if (ms >= s.pingYellow) return s.yellow;
  return s.textGreen;
}
// The colour of a loss figure: green while it prints as 0.0%, yellow above that and red from the loss threshold.
export function lossColor(percent, s) {
  if (!isNumber(percent) || Math.round(percent * 10) <= 0) return s.textGreen;
  if (percent >= s.lossRed) return s.red;
  return s.yellow;
}
// The bottom line under the bar.
export function downloadLine(stats) {
  return "▼ " + formatBytes(stats.downloaded) + (stats.demo ? "  DEMO" : "");
}
// The tooltip: each field named in plain words, which figures this game cannot measure, the upload total and how far
// the download total can be trusted.
export function tooltip(stats, s) {
  const lines = ["Lag-O-Meter"];
  const ping = formatPing(stats.ping);
  if (ping === NO_PING) lines.push("Ping: this game has no request to time right now.");
  else if (stats.pingFailed) lines.push("Ping: the last request got no answer. It was sent " + ping + " ms ago.");
  else if (stats.pingWaiting) lines.push("Ping: waiting " + ping + " ms for an answer from the server.");
  else lines.push("Ping " + ping + " ms: the round trip of this game's last request to its server, not an ICMP ping.");
  const out = formatLoss(stats.lossOut);
  const back = formatLoss(stats.lossIn);
  if (out === NO_LOSS && back === NO_LOSS) lines.push("Loss: this game has made no request to its server yet.");
  else if (stats.lossFromRequests) lines.push("Loss " + out + ": the share of this game's last requests to its server that got no answer.");
  else lines.push("Loss out " + out + " and loss in " + back + ": packets lost on the way to the server and on the way back.");
  const rate = formatRate(stats.rate);
  const seconds = Math.round(s.rateWindowMs / 1000);
  if (rate === NO_RATE) lines.push("Data rate: unknown.");
  else if (stats.demo) lines.push("Data rate " + rate + ": bytes per second over the last " + seconds + " seconds.");
  else lines.push("Data rate " + rate + ": bytes per second averaged over this visit to the page.");
  if (stats.health === null || stats.health === undefined) lines.push("The bar is dimmed because there is no live connection to judge.");
  let total = "↓ " + formatBytes(stats.downloaded) + " downloaded and ↑ " + formatBytes(stats.uploaded) + " uploaded this session";
  if (stats.demo) total += ".";
  else total += ", as the browser reports them. The total is an estimate and can miss some traffic, such as streaming and files from other sites.";
  lines.push(total);
  if (stats.hiddenFiles > 0) lines.push(stats.hiddenFiles + (stats.hiddenFiles === 1 ? " file" : " files") + " from other sites came without a size and count 0.");
  if (stats.sizesMissing) lines.push("This browser doesn't report file sizes, so only the game's own traffic is counted.");
  if (stats.demo) lines.push("Demo: these numbers are simulated.");
  return lines.join("\n");
}
