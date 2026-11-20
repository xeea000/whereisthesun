// workspace/whereisthesun/trails.js
/* SUNNY Trails & hikes (opt299–opt301): prebuilt hiking, walking, cycling and mountain-bike
 * routes plus summits, in region packs (Scotland, Canada). Type switches and a difficulty
 * legend; a grade is shown only when the source states one (sac_scale, mtb:scale, or an
 * explicit grade), otherwise not graded. Named-route pins farther out, lines from zoom 8.
 * Tap a line or pin for its card. OpenStreetMap (ODbL) and Wikidata. */
(() => {
  "use strict";
  var K = window.SunnyKit;
  var L = window.SunnyLayers;
  if (!K || !L) return;
  var V = "opt301";
  var ID = "trails";
  var SRC = "trails-src";
  var DOT = "trails-dot";
  var LINE = "trails-line";
  var HIT = "trails-hit";
  var LINE_Z = 8;
  var index = null, indexP = null, mapRef = null, shown = "";
  var ov = {}, tiles = {}, loading = {};
  var KIDS = [
    { id: "trails-hike", name: "Hiking / walking", dflt: true, kinds: ["h"], color: "#2a6b3c" },
    { id: "trails-cycle", name: "Cycling", dflt: true, kinds: ["c"], color: "#1e6bb8" },
    { id: "trails-mtb", name: "Mountain bike", dflt: true, kinds: ["b"], color: "#8a3d9c" },
    { id: "trails-long", name: "Long-distance routes", dflt: true, kinds: ["l"], color: "#b03a2e" },
    { id: "trails-peak", name: "Summits & Munros", dflt: true, kinds: ["p"], color: "#6b3a1a" }
  ];
  var TYPE = { h: "Hiking / walking", c: "Cycling", b: "Mountain bike", l: "Long-distance route", p: "Summit" };
  var GRADE = { e: "Easy", d: "Moderate", r: "Hard", x: "Expert", n: "Not graded" };
  var GCOL = { e: "#2a9d4a", d: "#d4a017", r: "#d45500", x: "#c02828", n: "#5a7a9a" };
  var PEAK = { munro: "Munro", corbett: "Corbett", graham: "Graham", top: "Munro Top", peak: "Summit" };
  var NETS = { iwn: "International walking network", nwn: "National walking network", rwn: "Regional walking network",
    lwn: "Local walking network", icn: "International cycle network", ncn: "National cycle network",
    rcn: "Regional cycle network", lcn: "Local cycle network" };
  var ATTR = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>' +
    ', <a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a>';
  function want() { return L.isOn(ID) && K.kids.anyOn(KIDS); }
  function allow(k) { return K.kids.matchAny(KIDS, (kid) => { return (kid.kinds || []).indexOf(k) >= 0; }); }
  function overlaps(bb, v) {
    return !(bb[2] < v.getWest() || bb[0] > v.getEast() || bb[3] < v.getSouth() || bb[1] > v.getNorth());
  }
  function tileOf(lon, lat, z) {
    var n = Math.pow(2, z), r = lat * Math.PI / 180;
    return [Math.floor((lon + 180) / 360 * n), Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n)];
  }
  function dec(enc) {
    var g = [], x = 0, y = 0, i;
    for (i = 0; i < enc.length; i += 2) { x += enc[i]; y += enc[i + 1]; g.push([x / 1e5, y / 1e5]); }
    return g;
  }
  function loadIndex() {
    if (index) return Promise.resolve(index);
    if (!indexP) indexP = K.loadJson("data/trails/index.json?v=" + V).then((d) => { index = d; return d; });
    return indexP;
  }
  function loadOv(reg) {
    if (ov[reg.id]) return Promise.resolve(ov[reg.id]);
    if (loading["ov-" + reg.id]) return loading["ov-" + reg.id];
    loading["ov-" + reg.id] = K.loadJson("data/trails/" + reg.id + "/ov.json?v=" + V).then((d) => {
      ov[reg.id] = d.pins || d; delete loading["ov-" + reg.id]; return ov[reg.id];
    }).catch(() => { delete loading["ov-" + reg.id]; ov[reg.id] = []; return ov[reg.id]; });
    return loading["ov-" + reg.id];
  }
  function loadTile(reg, key) {
    var id = reg.id + "/" + key;
    if (tiles[id]) return Promise.resolve(tiles[id]);
    if (loading[id]) return loading[id];
    loading[id] = K.loadJson("data/trails/" + id + ".json?v=" + V).then((d) => {
      tiles[id] = d; delete loading[id]; return d;
    }).catch(() => { delete loading[id]; tiles[id] = []; return tiles[id]; });
    return loading[id];
  }
  function tileKeys(reg, v) {
    var a = tileOf(v.getWest(), v.getNorth(), reg.z), c = tileOf(v.getEast(), v.getSouth(), reg.z);
    var keys = [], x, y, k, have = reg.tileSet || (reg.tileSet = {});
    if (!reg.tileSetReady) { (reg.tiles || []).forEach((t) => { have[t] = 1; }); reg.tileSetReady = 1; }
    for (x = a[0]; x <= c[0]; x++) for (y = a[1]; y <= c[1]; y++) {
      k = x + "_" + y;
      if (have[k]) keys.push(k);
    }
    return keys;
  }
  function pinProps(p) {
    return { k: p[2], g: p[3], n: p[4] || "", gd: p[5] || "", src: p[6] || "o", ref: p[7] || "", extra: p[8] || 0, net: p[9] || "", alt: p[10] || "" };
  }
  function lineProps(r) {
    return { k: r[1], g: r[2], n: r[3] || "", gd: r[4] || "", src: r[5] || "o", ref: r[0] || "", extra: r[6] || 0, net: r[7] || "", alt: r[9] || "" };
  }
  function inView(lon, lat, v, pad) {
    return lon >= v.getWest() - pad && lon <= v.getEast() + pad && lat >= v.getSouth() - pad && lat <= v.getNorth() + pad;
  }
  function pinFeats(regs, v, z) {
    var feats = [], far = z < LINE_Z;
    regs.forEach((reg) => {
      (ov[reg.id] || []).forEach((p) => {
        var lon = p[0] / 1e5, lat = p[1] / 1e5, k = p[2], net = p[9] || "";
        if (!allow(k) || !inView(lon, lat, v, 0.15)) return;
        if (far) {
          if (net === "trailhead") return;
          if (k !== "p" && k !== "l" && (p[8] || 0) < 80) return;
        }
        feats.push({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: pinProps(p) });
      });
    });
    return feats;
  }
  function lineFeats(reg, key) {
    var feats = [];
    (tiles[reg.id + "/" + key] || []).forEach((r) => {
      if (!allow(r[1])) return;
      var cs = dec(r[8]);
      if (cs.length < 2) return;
      feats.push({ type: "Feature", geometry: { type: "LineString", coordinates: cs }, properties: lineProps(r) });
    });
    return feats;
  }
  function setData(map, feats, stamp) {
    var key = stamp + ":" + (K.kids.active(KIDS).map((k) => { return k.id; }).join(",")) + ":" + feats.length;
    if (key === shown || !map.getSource(SRC)) return;
    shown = key;
    map.getSource(SRC).setData(K.fc(feats));
  }
  function clear(map) {
    shown = "";
    if (map.getSource(SRC)) map.getSource(SRC).setData(K.fc([]));
    K.vis(map, [DOT, LINE, HIT], false);
  }
  function colorPaint() {
    return ["case", ["==", ["get", "k"], "p"], "#6b3a1a",
      ["match", ["get", "g"], "e", GCOL.e, "d", GCOL.d, "r", GCOL.r, "x", GCOL.x, GCOL.n]];
  }
  function ensure(map) {
    if (!map.getSource(SRC)) map.addSource(SRC, { type: "geojson", data: K.fc(), attribution: ATTR });
    if (!map.getLayer(HIT)) {
      map.addLayer({ id: HIT, type: "line", source: SRC, filter: ["==", ["geometry-type"], "LineString"],
        paint: { "line-color": "#000", "line-opacity": 0, "line-width": 14 } }, K.before(map));
    }
    if (!map.getLayer(LINE)) {
      map.addLayer({ id: LINE, type: "line", source: SRC, filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": colorPaint(), "line-opacity": 0.92,
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, ["match", ["get", "k"], "l", 2.2, 1.5],
            14, ["match", ["get", "k"], "l", 4.2, 2.8]] } }, K.before(map));
    }
    if (!map.getLayer(DOT)) {
      map.addLayer({ id: DOT, type: "circle", source: SRC, filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-radius": K.size({ stops: [[2, 2.4], [7, 4], [14, 6.2]] }),
          "circle-color": colorPaint(), "circle-stroke-color": "#fff", "circle-stroke-width": 1.1 } }, K.before(map));
    }
  }
  function refresh(map) {
    if (!want()) { clear(map); return; }
    try { ensure(map); } catch (e) { return; }
    K.vis(map, [DOT, LINE, HIT], true);
    loadIndex().then((ix) => {
      if (!want() || map !== mapRef) return;
      var v = map.getBounds(), z = map.getZoom();
      var regs = (ix.regions || []).filter((r) => { return overlaps(r.bbox, v); });
      if (!regs.length) { setData(map, [], "empty"); return; }
      Promise.all(regs.map(loadOv)).then(() => {
        if (!want() || map !== mapRef) return;
        if (z < LINE_Z) { setData(map, pinFeats(regs, v, z), "pins:" + z.toFixed(1) + ":" + v.toString()); return; }
        var jobs = [];
        regs.forEach((r) => { tileKeys(r, v).forEach((k) => { jobs.push(loadTile(r, k).then(() => { return [r, k]; })); }); });
        Promise.all(jobs).then((pairs) => {
          if (!want() || map !== mapRef || map.getZoom() < LINE_Z) return;
          var feats = pinFeats(regs, v, map.getZoom());
          pairs.forEach((pk) => { lineFeats(pk[0], pk[1]).forEach((f) => { feats.push(f); }); });
          setData(map, feats, "lines:" + pairs.map((pk) => { return pk[0].id + "/" + pk[1]; }).join(","));
        });
      });
    }).catch(() => {});
  }
  function apply(map, on) {
    mapRef = map;
    if (!(on && want())) { clear(map); return; }
    try { ensure(map); } catch (e) {}
    shown = "";
    refresh(map);
  }
  function osmUrl(ref) {
    var t = { n: "node", w: "way", r: "relation" }[String(ref || "").charAt(0)];
    return t ? "https://www.openstreetmap.org/" + t + "/" + String(ref).slice(1) : "";
  }
  function netLabel(net) {
    return (net || "").split(/[;,/]/).map((s) => { return s.trim(); }).filter(Boolean)
      .map((s) => { return NETS[s] || s; }).filter((s) => { return s !== "trailhead"; }).join(", ");
  }
  function cardFor(p) {
    var title = p.n || (p.k === "p" ? (PEAK[p.g] || "Summit") : (TYPE[p.k] || "Trail"));
    var typ = p.k === "p" ? (PEAK[p.g] || "Summit") : (p.net === "trailhead" ? "Trailhead" : (TYPE[p.k] || "Trail"));
    var grade = p.k === "p" ? "" : (GRADE[p.g] || "Not graded");
    var extra = +p.extra || 0;
    var measure = "";
    if (p.k === "p" && extra) measure = Math.round(extra) + " m";
    if (p.k !== "p" && extra) measure = (extra / 10).toFixed(1).replace(/\.0$/, "") + " km";
    var altLab = p.alt === "fr" ? "French: " : "Gaelic: ";
    var gd = p.gd && p.gd !== p.n ? altLab + K.esc(p.gd) : "";
    var srcLine = ["OpenStreetMap (ODbL)", osmUrl(p.ref)];
    if (String(p.ref || "").charAt(0) === "Q") srcLine = ["Wikidata", "https://www.wikidata.org/wiki/" + p.ref];
    if (p.src === "b" && p.ref && p.ref.indexOf("|") >= 0) {
      var parts = p.ref.split("|");
      srcLine = ["OpenStreetMap (ODbL)", osmUrl(parts[0])];
      gd = (gd ? gd + " · " : "") + '<a href="https://www.wikidata.org/wiki/' + K.esc(parts[1]) + '" target="_blank" rel="noopener">Wikidata</a>';
    }
    return K.card(title, [typ, grade, measure, netLabel(p.net) ? K.esc(netLabel(p.net)) : "", gd], srcLine);
  }
  function onTap(e) {
    if (!mapRef || !e.features || !e.features[0]) return;
    var f = e.features[0], ll, p = f.properties;
    if (f.geometry && f.geometry.type === "Point") ll = f.geometry.coordinates;
    else ll = [e.lngLat.lng, e.lngLat.lat];
    var pop = K.show(mapRef, ll, p.n || "Trail", [], "Trails & hikes");
    if (pop && pop.setHTML) pop.setHTML(cardFor(p));
  }
  var TIP = "Hiking, walking, cycling and mountain-bike trails in Scotland and Canada, plus Munros, Corbetts, Grahams and other summits. " +
    "Graded only where the source states a grade; otherwise marked not graded. Lines when closer, named routes as pins farther out";
  L.add({ id: ID, name: "Trails & hikes", icon: "🥾", group: "Outdoors", tip: TIP,
    taps: [DOT, LINE, HIT], kids: KIDS, apply: apply,
    kidSet: () => { shown = ""; if (mapRef) apply(mapRef, L.isOn(ID)); },
    legend: () => { return K.legKeys([[GCOL.e, "line", "Easy"], [GCOL.d, "line", "Moderate"], [GCOL.r, "line", "Hard"],
      [GCOL.x, "line", "Expert"], [GCOL.n, "line", "Not graded"], ["#6b3a1a", "dot", "Summit"]]); },
    attach: (map, on) => {
      mapRef = map;
      map.on("moveend", () => { refresh(map); });
      map.on("zoomend", () => { refresh(map); });
      map.on("idle", () => { if (want() && !map.getLayer(DOT)) apply(map, true); });
      map.on("click", DOT, onTap);
      map.on("click", LINE, onTap);
      map.on("click", HIT, onTap);
      apply(map, on);
    }
  });
})();
