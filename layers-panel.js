// workspace/whereisthesun/layers-panel.js
/* SUNNY layers sidebar (opt94). An arrow tab on the left edge folds a Windy-style panel in
 * and out. Every layer is one row: icon, name, on/off switch, grouped by type. Older layers
 * keep their own Settings switches (the row flips that switch); opt94 layers get a switch
 * made here in Settings, "More layers". Open/closed and each layer's state are saved. */
(() => {
  "use strict";
  var GROUPS = ["Weather", "Sky & Space", "Earth", "Ocean", "Transmission", "Outdoors", "History"];
  var defs = [];
  var map = null;
  var panel = null;
  var rows = {};
  function saved(id, dflt) {
    try {
      var v = localStorage.getItem("sunny-L-" + id);
      return v == null ? dflt : v === "1";
    } catch (e) {
      return dflt;
    }
  }
  function isOn(d) {
    return d.get ? !!d.get() : saved(d.id, d.dflt !== false);
  }
  function setOn(d, on) {
    if (d.set) d.set(on);
    else {
      try { localStorage.setItem("sunny-L-" + d.id, on ? "1" : "0"); } catch (e) {}
      var t = document.getElementById("toggle-L-" + d.id);
      if (t) t.checked = on;
      if (map && d.apply) d.apply(map, on);
    }
    refresh();
  }
  function add(d) {
    defs.push(d);
    if (panel) build();
    if (map && d.attach) d.attach(map, isOn(d));
  }
  function refresh() {
    defs.forEach((d) => {
      var r = rows[d.id];
      if (!r) return;
      var on = isOn(d);
      r.input.checked = on;
      r.row.classList.toggle("is-on", on);
      if (d.note) r.note.textContent = d.note(map, on) || "";
    });
    var seg = document.querySelector("#overlay-seg .seg-btn.is-on");
    var cur = seg ? seg.getAttribute("data-overlay") : "";
    document.querySelectorAll(".lp-ov").forEach((b) => {
      b.classList.toggle("is-on", b.getAttribute("data-ov") === cur);
    });
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function overlayRow() {
    var r = el("div", "lp-row lp-seg");
    r.appendChild(el("span", "lp-ico", "🛰️"));
    var w = el("span", "lp-name", "Map overlay");
    r.appendChild(w);
    var g = el("span", "lp-segs");
    [["clouds", "Clouds"], ["radar", "Radar"]].forEach((o) => {
      var b = el("button", "lp-ov", o[1]);
      b.type = "button";
      b.setAttribute("data-ov", o[0]);
      b.addEventListener("click", () => {
        var s = document.querySelector('#overlay-seg [data-overlay="' + o[0] + '"]');
        if (s) s.click();
        setTimeout(refresh, 50);
      });
      g.appendChild(b);
    });
    r.appendChild(g);
    return r;
  }
  function row(d) {
    var r = el("label", "lp-row");
    r.title = d.tip || "";
    r.appendChild(el("span", "lp-ico", d.icon));
    var n = el("span", "lp-name", d.name);
    var note = el("small", "lp-note");
    n.appendChild(note);
    r.appendChild(n);
    var i = el("input");
    i.type = "checkbox";
    i.className = "lp-input";
    i.dataset.id = d.id;
    i.addEventListener("change", () => { setOn(d, i.checked); });
    r.appendChild(i);
    r.appendChild(el("span", "lp-sw"));
    rows[d.id] = { row: r, input: i, note: note };
    if (!d.kids) return r;
    /* opt102: twisty sub-section (e.g. Satellites groups), each child saved as sunny-L-<kid id> */
    var w = el("div", "lp-fold");
    var tw = el("button", "lp-twisty", "▸");
    tw.type = "button";
    tw.setAttribute("aria-label", "Show " + d.name + " groups");
    var box = el("div", "lp-kids");
    var open = saved(d.id + "-open", false);
    var show = (o) => { box.hidden = !o; tw.textContent = o ? "▾" : "▸"; tw.setAttribute("aria-expanded", o ? "true" : "false"); };
    show(open);
    tw.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); open = !open; show(open);
      try { localStorage.setItem("sunny-L-" + d.id + "-open", open ? "1" : "0"); } catch (e) {} });
    r.insertBefore(tw, r.firstChild);
    d.kids.forEach((k) => {
      var kl = el("label", "lp-kid");
      var ki = el("input");
      ki.type = "checkbox";
      ki.checked = saved(k.id, k.dflt);
      ki.addEventListener("change", () => {
        try { localStorage.setItem("sunny-L-" + k.id, ki.checked ? "1" : "0"); } catch (e) {}
        if (ki.checked && !isOn(d)) setOn(d, true);
        if (d.kidSet) d.kidSet();
      });
      kl.appendChild(ki);
      kl.appendChild(document.createTextNode(" " + k.name));
      box.appendChild(kl);
    });
    w.appendChild(r);
    w.appendChild(box);
    return w;
  }
  /* opt102: Clear all turns every overlay off (Clouds/Radar too) and saves it; base map, beaches and the tap pin stay */
  function clearAll() {
    defs.forEach((d) => { if (d.name && d.id !== "beaches" && isOn(d)) setOn(d, false); });
    var b = document.querySelector("#overlay-seg .seg-btn.is-on");
    if (b) b.click();
    setTimeout(refresh, 80);
  }
  /* opt103: sections and sub-groups fold with twisty triangles (state saved per path, open by default).
   * PLACE moves a layer into a "Section/Sub" path without touching the layer's own file. */
  var PLACE = { skyglow: "Sky & Space/Natural", aurora: "Sky & Space/Natural", eclipses: "Sky & Space/Natural", moon: "Sky & Space/Natural",
    nightscore: "Sky & Space/Natural", observatories: "Sky & Space/Artificial", radioscopes: "Sky & Space/Artificial", sats: "Sky & Space/Artificial",
    craters: "Earth", meteorites: "Earth", geology: "Earth/Geology", stations: "Earth" };
  var SUBS = { "Sky & Space": ["Natural", "Artificial"], Earth: ["", "Geology"] };
  function fold(parent, path, label, lvl) {
    var key = "sunny-lp-g-" + path;
    var open = true;
    try { open = localStorage.getItem(key) !== "0"; } catch (e) {}
    var h = el("button", "lp-head lp-fold-h lp-l" + lvl);
    h.type = "button";
    var box = el("div", "lp-grp");
    var set = (o) => { box.hidden = !o; h.textContent = (o ? "▾ " : "▸ ") + label; h.setAttribute("aria-expanded", o ? "true" : "false"); };
    set(open);
    h.addEventListener("click", () => { open = !open; set(open); try { localStorage.setItem(key, open ? "1" : "0"); } catch (e) {} });
    parent.appendChild(h);
    parent.appendChild(box);
    return box;
  }
  function build() {
    var body = panel.querySelector(".lp-body");
    body.textContent = "";
    rows = {};
    var where = (d) => { return (PLACE[d.id] || d.group || "").split("/"); };
    GROUPS.forEach((g) => {
      var list = defs.filter((d) => { return where(d)[0] === g && d.name; });
      if (!list.length && g !== "Weather") return;
      var box = fold(body, g, g, 0);
      if (g === "Weather") box.appendChild(overlayRow());
      (SUBS[g] || [""]).forEach((sub) => {
        var sl = list.filter((d) => { return (where(d)[1] || "") === sub; });
        if (!sl.length) return;
        var tgt = sub ? fold(box, g + "/" + sub, sub, 1) : box;
        sl.forEach((d) => { tgt.appendChild(row(d)); });
      });
    });
    buildSettings();
    refresh();
  }
  /* Settings switches for opt94 layers (older layers already have theirs) */
  function buildSettings() {
    var pop = document.getElementById("settings-pop");
    if (!pop) return;
    var sec = document.getElementById("set-more-layers");
    if (!sec) {
      sec = el("section", "set-group");
      sec.id = "set-more-layers";
      sec.appendChild(el("h3", "set-title", "More layers"));
      sec.appendChild(el("div", "set-row"));
      var lag = document.getElementById("lag-controls");
      pop.insertBefore(sec, lag);
    }
    var box = sec.querySelector(".set-row");
    box.textContent = "";
    defs.filter((d) => { return d.name && !d.get; }).forEach((d) => {
      var l = el("label", "ov switch");
      l.title = d.tip || "";
      var i = el("input");
      i.type = "checkbox";
      i.id = "toggle-L-" + d.id;
      i.checked = isOn(d);
      i.addEventListener("change", () => { setOn(d, i.checked); });
      l.appendChild(i);
      var k = el("span", "knob");
      k.setAttribute("aria-hidden", "true");
      l.appendChild(k);
      l.appendChild(document.createTextNode(d.name));
      box.appendChild(l);
    });
  }
  function setOpen(open) {
    panel.classList.toggle("is-open", open);
    document.body.classList.toggle("lp-open", open);
    var tab = document.getElementById("lp-tab");
    tab.setAttribute("aria-expanded", open ? "true" : "false");
    tab.textContent = open ? "‹" : "›";
    try { localStorage.setItem("sunny-lp-open", open ? "1" : "0"); } catch (e) {}
    if (open) refresh();
  }
  function init() {
    panel = el("aside", "lp-panel");
    panel.id = "layers-panel";
    panel.setAttribute("aria-label", "Layers");
    var head = el("div", "lp-title", "Layers");
    var clr = el("button", "lp-clear", "Clear all");
    clr.type = "button";
    clr.title = "Turn off every overlay layer (keeps the base map, beaches and the tap pin)";
    clr.addEventListener("click", clearAll);
    head.appendChild(clr);
    panel.appendChild(head);
    panel.appendChild(el("div", "lp-body"));
    var tab = el("button", "lp-tab", "›");
    tab.id = "lp-tab";
    tab.type = "button";
    tab.setAttribute("aria-label", "Layers");
    tab.setAttribute("aria-controls", "layers-panel");
    tab.title = "Layers";
    tab.addEventListener("click", () => { setOpen(!panel.classList.contains("is-open")); });
    panel.appendChild(tab);
    document.body.appendChild(panel);
    build();
    var open = false;
    try { open = localStorage.getItem("sunny-lp-open") === "1"; } catch (e) {}
    setOpen(open);
    document.addEventListener("change", () => { setTimeout(refresh, 0); });
    document.addEventListener("click", () => { setTimeout(refresh, 80); });
    document.addEventListener("sunny-crown", refresh);
  }
  function attach(m) {
    map = m;
    defs.forEach((d) => { if (d.attach) d.attach(map, isOn(d)); });
    map.on("zoomend", refresh);
    refresh();
  }
  function tapIds() {
    var out = [];
    defs.forEach((d) => { if (d.taps) out = out.concat(d.taps); });
    return out;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  window.SunnyLayers = { add: add, attach: attach, refresh: refresh, isOn: (id) => {
    var d = defs.filter((x) => { return x.id === id; })[0];
    return d ? isOn(d) : false;
  }, tapIds: tapIds };
})();
