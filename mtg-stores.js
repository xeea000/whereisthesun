// workspace/whereisthesun/mtg-stores.js
/* SUNNY Fun & Games: Magic: The Gathering WPN stores (opt190).
 * Data: public Wizards Store & Event Locator HTML (no API key), Canada snapshot in
 * data/mtg-stores.json (tools/build-mtg-stores.py). Off by default. Kids filter
 * Prerelease and Friday Night Magic by format. */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers;
  if (!K || !L) return;
  var SRC = "mtg-src", DOT = "mtg-dot", STAR = "mtg-star";
  var DATA = "data/mtg-stores.json?v=6e78f9e5";
  var meta = null, feats = [], pMap = null;
  var KIDS = [
    { id: "mtg-pre", name: "Prerelease (WPN partners)", dflt: true, kind: "pre" },
    { id: "mtg-fnm-cmd", name: "FNM · Commander", dflt: true, kind: "fnm", fmt: "Commander" },
    { id: "mtg-fnm-std", name: "FNM · Standard", dflt: true, kind: "fnm", fmt: "Standard" },
    { id: "mtg-fnm-oth", name: "FNM · other formats", dflt: true, kind: "fnm", fmt: "other" }
  ];
  function kidOn(id, dflt) {
    try {
      var v = localStorage.getItem("sunny-L-" + id);
      return v == null ? dflt : v === "1";
    } catch (e) { return dflt; }
  }
  function want(s) {
    var anyKid = false, show = false;
    var list = s.fnmFormats || [];
    KIDS.forEach((k) => {
      if (!kidOn(k.id, k.dflt)) return;
      anyKid = true;
      if (k.kind === "pre") {
        /* Prerelease switch: WPN partner stores (badge + dates on the card when listed) */
        if (s.partner) show = true;
      } else if (k.kind === "fnm" && s.fnm) {
        if (k.fmt === "other") {
          if (!list.length || list.every((f) => { return f !== "Commander" && f !== "Standard"; })) show = true;
        } else if (list.indexOf(k.fmt) >= 0) show = true;
      }
    });
    return anyKid ? show : !!(s.partner);
  }
  function toFeats(stores) {
    return stores.filter(want).map((s) => {
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lon, s.lat] },
        properties: {
          id: s.id, name: s.name, addr: s.addr || "", phone: s.phone || "", web: s.web || "",
          partner: s.partner ? 1 : 0, legendary: s.legendary ? 1 : 0,
          fnm: s.fnm ? 1 : 0, prerelease: s.prerelease ? 1 : 0,
          formats: (s.fnmFormats || []).join(", "),
          preDates: (s.prereleaseNext || []).map((e) => { return (e.date + " " + e.time).trim(); }).join(" · "),
          fnmNext: (s.fnmNext || []).map((e) => { return e.title + " (" + (e.date + " " + e.time).trim() + ")"; }).join(" · "),
          color: s.prerelease ? "#c9a227" : s.fnm ? "#5b4fc9" : "#2f9e6b"
        }
      };
    });
  }
  function redraw(map) {
    if (!map.getSource(SRC) || !meta) return;
    feats = toFeats(meta.stores || []);
    map.getSource(SRC).setData(K.fc(feats));
  }
  function ensure(map) {
    if (!map.getSource(SRC)) {
      map.addSource(SRC, {
        type: "geojson", data: K.fc(),
        attribution: '<a href="https://locator.wizards.com/" target="_blank" rel="noopener">Wizards Store &amp; Event Locator</a>'
      });
    }
    if (!map.getLayer(DOT)) {
      map.addLayer({
        id: DOT, type: "circle", source: SRC,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 2.5, 10, 6, 14, 8],
          "circle-color": ["case",
            ["==", ["get", "prerelease"], 1], "#c9a227",
            ["==", ["get", "fnm"], 1], "#5b4fc9",
            "#2f9e6b"],
          "circle-stroke-color": "#101418", "circle-stroke-width": 0.9
        }
      }, K.before(map));
    }
    if (!map.getLayer(STAR)) {
      map.addLayer({
        id: STAR, type: "symbol", source: SRC,
        filter: ["==", ["get", "legendary"], 1],
        layout: { "text-field": "★", "text-size": 12, "text-offset": [0.7, -0.7], "text-allow-overlap": true },
        paint: { "text-color": "#ffd45a", "text-halo-color": "#101418", "text-halo-width": 1 }
      }, K.before(map));
    }
  }
  function apply(map, on) {
    K.vis(map, [DOT, STAR], on);
    if (!on) return;
    ensure(map);
    K.vis(map, [DOT, STAR], L.isOn("mtg"));
    if (meta) { redraw(map); return; }
    K.loadJson(DATA).then((d) => {
      meta = d;
      redraw(map);
    }).catch(() => {});
  }
  function cardHtml(p) {
    var lines = [];
    if (p.partner) lines.push("Wizards Play Network partner store");
    if (p.legendary) lines.push("★ Legendary WPN store");
    if (p.prerelease) {
      lines.push("Prerelease host" + (p.preDates ? ": " + K.esc(p.preDates) : " (upcoming dates when listed)"));
    }
    if (p.fnm) {
      lines.push("Friday Night Magic" + (p.formats ? " · " + K.esc(p.formats) : ""));
      if (p.fnmNext) lines.push(K.esc(p.fnmNext));
    }
    if (p.addr) lines.push(K.esc(p.addr));
    if (p.phone) lines.push(K.esc(p.phone));
    if (p.web) lines.push('<a href="' + K.esc(p.web) + '" target="_blank" rel="noopener">Website</a>');
    var built = meta && meta.built ? " Snapshot " + K.esc(meta.built) + "." : "";
    return K.card(p.name || "Magic store", lines, [
      "Wizards Store & Event Locator" + built,
      "https://locator.wizards.com/en/search?query=" + encodeURIComponent(p.name || "") + "&searchType=stores"
    ]);
  }
  L.add({
    id: "mtg", name: "Magic: The Gathering stores", icon: "🃏", group: "Fun & Games",
    tip: "Wizards Play Network stores in Canada (public Store & Event Locator). Prerelease and Friday Night Magic filters. Snapshot, not live.",
    taps: [DOT, STAR], dflt: false, kids: KIDS,
    legend: K.legKeys([
      ["#c9a227", "dot", "Prerelease upcoming"],
      ["#5b4fc9", "dot", "Friday Night Magic"],
      ["#2f9e6b", "dot", "WPN partner store"],
      ["#ffd45a", "dot", "★ Legendary"]
    ]),
    kidSet: () => { if (pMap) redraw(pMap); },
    apply: apply,
    note: (map, on) => {
      if (!on) return "";
      if (!meta) return "loading…";
      var n = (meta.counts && meta.counts.stores) || 0;
      return n + " CA stores";
    },
    attach: (map, on) => {
      pMap = map;
      map.on("idle", () => { if (L.isOn("mtg") && !map.getLayer(DOT)) apply(map, true); });
      (window.SunnyHoverName = window.SunnyHoverName || {})[DOT] = (g) => {
        var n = g.properties && g.properties.name;
        return Promise.resolve([n || "Magic store", "Magic: The Gathering store"]);
      };
      (window.SunnyHoverName = window.SunnyHoverName || {})[STAR] = (window.SunnyHoverName)[DOT];
      var open = (e) => {
        var p = e.features[0].properties;
        var pp = K.show(map, e.features[0].geometry.coordinates, "", ["Magic store"], ["Wizards Store & Event Locator", "https://locator.wizards.com/"]);
        if (pp && pp.setHTML) pp.setHTML(cardHtml(p));
      };
      map.on("click", DOT, open);
      map.on("click", STAR, open);
      /* register for tap-snap hit targets */
      if (window.SunnyTapSnap) { /* layers registered via map.on click above through patched on() */ }
      apply(map, on);
    }
  });
})();
