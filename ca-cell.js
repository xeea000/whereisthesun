// workspace/whereisthesun/ca-cell.js
/* SUNNY Canadian cell sites for the Towers layer: every site in ISED Canada's Terrestrial Spectrum Licence Site Data Extract
 * (Open Government Licence - Canada), merged per location and coloured by carrier. Loads 1° tiles from zoom 8 and keeps them in the
 * browser cache for good (the file name carries the extract date). Own switch under Towers: "Canada cell sites (ISED)". */
(() => {
  "use strict";
  var K = window.SunnyKit, BASE = "data/ca-cell/", man = null, feats = {}, asked = {}, map = null, hooked = false;
  var ST = { T: "Purpose-built tower", R: "Rooftop", P: "Pole", O: "Other (e.g. indoor)", S: "Water tower or silo", F: "Street furniture", M: "Transportable" };
  var BR = [["Bell", "#1f6fe0"], ["Rogers", "#e0301e"], ["TELUS", "#4b286d"], ["Freedom (filed as Freedom)", "#ff7a00"], ["Vidéotron (incl. Freedom)", "#ffd400"], ["SaskTel", "#00a650"],
    ["Eastlink", "#00b5e2"], ["Xplore", "#8bc34a"], ["TBayTel", "#795548"], ["Ice Wireless", "#9fd8ff"], ["Other", "#9e9e9e"]];
  /* opt199: towers-ca is a subset kid of Towers (SunnyKit.kids) */
  var on = () => {
    var KK = window.SunnyKit && window.SunnyKit.kids;
    var kid = KK ? KK.isOn("towers-ca", true) : true;
    return window.SunnyLayers && window.SunnyLayers.isOn("towers") && kid;
  };
  var need = () => { return on() || !!(window.SunnyCaCover && window.SunnyCaCover.on()); }; /* opt160: coverage uses the same tiles */
  var get = (url) => { /* the Cache API keeps tiles across visits; falls back to a plain fetch */
    if (!window.caches) return fetch(url).then((r) => { if (!r.ok) throw r.status; return r.json(); });
    return caches.open("sunny-ca-cell").then((c) => c.match(url).then((hit) => hit || fetch(url).then((r) => {
      if (!r.ok) throw r.status; c.put(url, r.clone()); return r; }))).then((r) => r.json());
  };
  var names = (b) => { return BR.filter((x, i) => b >> i & 1).map((x) => x[0]); };
  var first = (b) => { for (var i = 0; i < BR.length; i++) if (b >> i & 1) return i; return BR.length - 1; };
  var techs = (t) => { return man ? man.tech.filter((x, i) => t >> i & 1) : []; };
  var set = () => {
    if (!map || !map.getSource("ca-cell")) return;
    var all = []; Object.keys(feats).forEach((k) => { all = all.concat(feats[k]); });
    map.getSource("ca-cell").setData(K.fc(all));
    if (window.SunnyCaCover) window.SunnyCaCover.redraw();
  };
  var tile = (k) => {
    if (asked[k]) return; asked[k] = 1;
    get(BASE + k + ".json?d=" + man.date + (man.rev ? "r" + man.rev : "")).then((rows) => {
      feats[k] = rows.map((r) => { var b = r[2]; return { type: "Feature", geometry: { type: "Point", coordinates: [r[1], r[0]] },
        properties: { c: first(b), n: names(b).length, b: b, t: r[3], h: r[4], s: r[5], l: r[6] || "", o: r[7] || "",
        bd: (r[8] || []).reduce((a, x) => a | x[2], 0) }, rad: r[8] || [] }; });
      set();
    }).catch(() => { delete asked[k]; });
  };
  var view = () => {
    if (!map || !need() || !man || map.getZoom() < 8) return;
    var b = map.getBounds();
    man.tiles.forEach((k) => { var p = k.split("_").map(Number); /* margin: coverage reaches past the edge */
      if (p[0] < b.getNorth() + 0.1 && p[0] + 1.1 > b.getSouth() && p[1] < b.getEast() + 0.15 && p[1] + 1.15 > b.getWest()) tile(k); });
  };
  var color = ["match", ["get", "c"]].concat([].concat.apply([], BR.map((x, i) => [i, x[1]])), ["#9e9e9e"]);
  var add = () => {
    if (map.getSource("ca-cell")) return;
    map.addSource("ca-cell", { type: "geojson", data: K.fc([]), attribution: "Canada cell sites: ISED Canada (OGL-Canada)" });
    map.addLayer({ id: "ca-cell-dot", type: "circle", source: "ca-cell", minzoom: 8, paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 2.2, 12, 4.5, 15, 7], "circle-color": color,
      "circle-stroke-color": ["case", [">", ["get", "n"], 1], "#ffffff", "#101418"], "circle-stroke-width": ["case", [">", ["get", "n"], 1], 1.4, 0.6] } }, K.before(map));
  };
  var title = (p) => { return names(p.b).filter((x) => x !== "Other").concat(p.o ? [p.o] : []).join(", ") || "Cell site"; };
  var lines = (p) => { return [(p.h ? "<b>" + p.h + " m</b> · " : "") + K.esc(ST[p.s] || "Structure not given"), K.esc(techs(p.t).join(" · ")),
    p.l ? K.esc(p.l) : "", p.n > 1 ? "Shared by " + p.n + " licensees" : "",
    p.bd && window.SunnyCaCover ? "Reach about " + (window.SunnyCaCover.reach(p.bd, p.h) / 1000).toFixed(1) + " km <small>(estimate, not official coverage)</small>" : ""]; };
  var apply = () => {
    if (!map) return;
    var want = on();
    if (need()) {
      try { add(); } catch (e) { setTimeout(apply, 2000); return; } /* style not ready yet */
      if (!man) K.loadJson(BASE + "manifest.json?v=" + Date.now().toString().slice(0, 6)).then((m) => { man = m; view(); }).catch(() => {});
      else view();
    }
    K.vis(map, ["ca-cell-dot"], want);
  };
  window.SunnyCaCell = {
    legend: K.legKeys(BR.map((x) => [x[1], "dot", x[0]]).concat([["#ffffff", "dot", "white ring: shared site (Canada, ISED, zoom 8+)"]])),
    attach: (m) => {
      map = m;
      if (hooked) return; hooked = true;
      m.on("moveend", view);
      m.on("idle", () => { if (on() && !m.getLayer("ca-cell-dot")) apply(); });
      m.on("click", "ca-cell-dot", (e) => { var p = e.features[0].properties;
        K.show(m, e.features[0].geometry.coordinates, title(p), lines(p), ["ISED Site Data Extract " + (man ? man.date : ""),
          "https://www.ised-isde.canada.ca/site/spectrum-management-system/en/spectrum-management-system-data/download-sms-data"]); });
      (window.SunnyHoverName = window.SunnyHoverName || {})["ca-cell-dot"] = (f) => Promise.resolve([title(f.properties) + " cell site",
        (f.properties.h ? f.properties.h + " m · " : "") + (ST[f.properties.s] || "") ]);
      apply();
    },
    apply: apply,
    all: () => { var a = []; Object.keys(feats).forEach((k) => { a = a.concat(feats[k]); }); return a; },
    brands: BR, tech: () => { return man ? man.tech : []; }
  };
})();
