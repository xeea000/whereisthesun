// workspace/lag-o-meter/src/controls.js
// The meter's own settings: Show Lag-O-Meter, High visibility, Scale (50% to 100%) and Pin side (Left, Center or
// Right), kept in localStorage under one key per game. loadLagPrefs and saveLagPrefs read and write them for games that
// draw these settings in their own menu; applyLagPrefs puts them on a mounted meter; mountLagControls draws the four
// controls as a small group in plain elements and keeps the meter and the saved copy in step.
export const LAG_PREF_DEFAULTS = Object.freeze({ show: true, bright: false, scale: 1, pin: "center" });
const PIN_CHOICES = [["left", "Left"], ["center", "Center"], ["right", "Right"]];
// The saved settings under key, each one checked, with the defaults (or the given fallback values) for anything missing.
export function loadLagPrefs(win, key, fallback) {
  const out = Object.assign({}, LAG_PREF_DEFAULTS, fallback || {});
  try {
    const raw = win.localStorage ? JSON.parse(win.localStorage.getItem(key) || "null") : null;
    if (raw && typeof raw === "object") Object.assign(out, raw);
  } catch (err) {
    return tidy(out);
  }
  return tidy(out);
}
// The settings with every value in range.
function tidy(p) {
  const scale = Math.min(1, Math.max(0.5, Number(p.scale) || 1));
  const pin = PIN_CHOICES.some((c) => c[0] === p.pin) ? p.pin : "center";
  return { show: p.show !== false, bright: p.bright === true, scale, pin };
}
// Saves the settings under key, quietly doing nothing when storage is blocked.
export function saveLagPrefs(win, key, prefs) {
  try {
    if (win.localStorage) win.localStorage.setItem(key, JSON.stringify(tidy(prefs)));
  } catch (err) {
    return;
  }
}
// Puts the settings on a meter returned by mountLagOMeter.
export function applyLagPrefs(meter, prefs) {
  const p = tidy(prefs);
  if (p.show) meter.show();
  else meter.hide();
  meter.setBright(p.bright).setScale(p.scale).setPin(p.pin);
}
// Makes one element with a class name and text.
function el(doc, tag, cls, text) {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
// Draws the four controls in container and wires them to meter. Options: window, key (the localStorage key), title
// (default "Lag-O-Meter"), classes ({ group, title, check, row }: the game's own class names), fallback (values to use
// when nothing is saved yet) and onChange(prefs). Returns { prefs, destroy }.
export function mountLagControls(container, meter, options) {
  const o = options || {};
  const win = o.window || globalThis;
  const doc = container.ownerDocument;
  const c = Object.assign({ group: "lag-controls", title: "lag-controls-title", check: "lag-controls-check", row: "lag-controls-row" }, o.classes || {});
  const prefs = loadLagPrefs(win, o.key, o.fallback);
  const group = el(doc, "div", c.group);
  group.appendChild(el(doc, "div", c.title, o.title || "Lag-O-Meter"));
  const changed = () => {
    applyLagPrefs(meter, prefs);
    saveLagPrefs(win, o.key, prefs);
    if (typeof o.onChange === "function") o.onChange(Object.assign({}, prefs));
  };
  const check = (name, label, help) => {
    const row = el(doc, "label", c.check);
    row.title = help;
    const box = el(doc, "input");
    box.type = "checkbox";
    box.checked = prefs[name];
    box.addEventListener("change", () => { prefs[name] = box.checked; changed(); });
    row.append(box, " " + label);
    group.appendChild(row);
  };
  check("show", "Show Lag-O-Meter", "Network Statistics monitor");
  check("bright", "High visibility", "Makes the Lag-O-Meter brighter and easier to see");
  const scaleRow = el(doc, "label", c.row);
  const slider = el(doc, "input");
  slider.type = "range";
  slider.min = "50";
  slider.max = "100";
  slider.step = "5";
  slider.value = String(Math.round(prefs.scale * 100));
  const shown = el(doc, "span", "", slider.value + "%");
  slider.addEventListener("input", () => { prefs.scale = Number(slider.value) / 100; shown.textContent = slider.value + "%"; changed(); });
  scaleRow.append(el(doc, "span", "", "Scale"), slider, shown);
  group.appendChild(scaleRow);
  const pinRow = el(doc, "label", c.row);
  const pick = el(doc, "select");
  for (const [value, label] of PIN_CHOICES) {
    const opt = el(doc, "option", "", label);
    opt.value = value;
    pick.appendChild(opt);
  }
  pick.value = prefs.pin;
  pick.addEventListener("change", () => { prefs.pin = pick.value; changed(); });
  pinRow.append(el(doc, "span", "", "Pin side"), pick);
  group.appendChild(pinRow);
  container.appendChild(group);
  applyLagPrefs(meter, prefs);
  return { prefs, destroy: () => group.remove() };
}
