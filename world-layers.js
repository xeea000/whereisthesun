// workspace/whereisthesun/world-layers.js
/* SUNNY opt99 world layers: Ocean, research stations and Transmission. Progressive: each layer loads
 * a tiny points file (data/world/<name>.p.json, built by tools/build-world.js) and one detail shard on tap.
 *   Seafloor     trenches, seamounts, guyots, ridges, canyons, abyssal plains, hydrothermal vents (Wikidata, CC0)
 *   Cables       submarine cables, TeleGeography Submarine Cable Map (CC BY-NC-SA 3.0), lines + details on tap
 *   Platforms    offshore platforms still standing (BOEM, public domain) plus oil platforms on Wikidata
 *   OSM undersea pipelines and platforms, zoom 9+, (Overpass, ODbL)
 *   Stations     research stations (Wikidata) and Antarctic facilities (COMNAP)
 *   Transmission tall TV and radio masts (opt102: data/world/masts.*, dot size by height; opt105 Towers with types and tiles), radio telescopes
 *                and radar sites (Wikidata) */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers, P = window.SunnyPoints;
  if (!K || !L || !P) return;
  var NOW = new Date().getFullYear();
  var BASE = "data/world/";
  var V = "opt105"; /* bump when tools/build-world.js or build-cables.js output changes */
  var meta = {};
  var cap = (s) => { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); };
  var age = (verb, y) => {
    if (y === "" || y == null || isNaN(+y)) return "";
    var n = NOW - +y;
    return verb + " " + K.esc(y) + (n > 0 ? " · " + n + " year" + (n === 1 ? "" : "s") + " old" : "");
  };
  var src = (r, dflt) => {
    if (r.qid) return ["Wikidata " + r.qid, "https://www.wikidata.org/wiki/" + r.qid];
    return dflt;
  };
  var wikiLine = (r) => { return r.wiki && r.wiki !== "manned" ? '<a href="https://en.wikipedia.org/wiki/' + encodeURIComponent(r.wiki) + '" target="_blank" rel="noopener">Wikipedia article</a>' : ""; };
  function idle(map, id, layer, fn) {
    map.on("idle", () => { if (L.isOn(id) && !map.getLayer(layer)) fn(map, true); });
  }
  /* shared points source per file; layers per category */
  var hoverOf = {};
  function pointLayer(o) {
    o.layers.forEach((l) => { hoverOf[l.id] = o; });
    /* opt113: kids: true gives each map layer its own switch under the row (saved as sunny-L-<id>-<layer id>) */
    var kidOn = (l) => { try { return !o.kids || localStorage.getItem("sunny-L-" + o.id + "-" + l.id) !== "0"; } catch (e) { return true; } };
    var kidVis = (map, on) => { o.layers.forEach((l) => { K.vis(map, [l.id], on && kidOn(l)); }); };
    function apply(map, on) {
      var ids = o.layers.map((l) => { return l.id; });
      K.vis(map, o.extraIds || [], on);
      kidVis(map, on);
      if (!on) return;
      K.loadJson(BASE + o.file + ".p.json?h=" + V).then((d) => {
        meta[o.file] = d;
        var sid = "w-" + o.file;
        if (!map.getSource(sid)) map.addSource(sid, { type: "geojson", data: K.fc(P.toFeatures(d)), attribution: o.attrib });
        o.layers.forEach((l) => {
          if (map.getLayer(l.id)) return;
          var spec = { id: l.id, type: "circle", source: sid, filter: l.filter || ["in", ["get", "k"], ["literal", l.codes]], paint: {
            "circle-radius": o.radius || ["interpolate", ["linear"], ["zoom"], 1, l.r || 2.5, 8, (l.r || 2.5) * 2.2],
            "circle-color": l.color, "circle-stroke-color": "#101418", "circle-stroke-width": 0.8 } };
          if (K.gz(l.minzoom || 0)) spec.minzoom = l.minzoom;
          map.addLayer(spec, K.before(map));
        });
        if (o.extra) o.extra(map);
        K.vis(map, o.extraIds || [], L.isOn(o.id));
        kidVis(map, L.isOn(o.id));
      }).catch(() => {});
    }
    var taps = o.layers.map((l) => { return l.id; });
    var pMap = null;
    L.add({ id: o.id, name: o.name, icon: o.icon, group: o.group, tip: o.tip, taps: taps, dflt: o.dflt, apply: apply, legend: o.legend,
      kids: o.kids ? o.layers.map((l) => { return { id: o.id + "-" + l.id, name: l.name, dflt: true }; }) : undefined,
      kidSet: o.kids ? () => { if (pMap) kidVis(pMap, L.isOn(o.id)); } : undefined,
      attach: (map, on) => {
        pMap = map;
        idle(map, o.id, taps[0], apply);
        taps.forEach((t) => {
          map.on("click", t, (e) => {
            var f = e.features[0];
            var pp = K.show(map, f.geometry.coordinates, "", [P.skeleton(o.name)], o.src);
            P.detail(BASE + o.file, meta[o.file], f.properties.i, V).then((r) => {
              if (pp.isOpen()) pp.setHTML(K.card(o.title ? o.title(r) : r.name, o.lines(r, f.properties.k), o.srcOf ? o.srcOf(r) : src(r, o.src)));
            }).catch(() => { if (pp.isOpen()) pp.setHTML(K.card(o.name, ["Could not load details. Tap again when online."], o.src)); });
          });
        });
        apply(map, on);
      } });
  }
  var place = (r) => { return [r.country].filter(Boolean).map(K.esc).join(""); };
  /* Ocean: seafloor features */
  var SEA_KIND = { trench: "Oceanic trench", vent: "Hydrothermal vent", seamount: "Seamount", feature: "" };
  pointLayer({ id: "seafloor", file: "seafloor", name: "Seafloor features", icon: "🌊", group: "Ocean",
    tip: "Ocean trenches, seamounts, ridges, canyons and hydrothermal vents (Wikidata)",
    attrib: 'Seafloor: <a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a>', src: ["Wikidata", "https://www.wikidata.org/"],
    layers: [{ id: "sea-trench", codes: ["trench"], color: "#1b3fa8", r: 3.5 }, { id: "sea-vent", codes: ["vent"], color: "#ff4fa3", r: 3.5 },
      { id: "sea-mount", codes: ["seamount", "feature"], color: "#3fb6c9", r: 2.2 }],
    lines: (r, k) => {
      return [K.esc(cap(r.kind || SEA_KIND[k])), place(r), r.depth !== "" ? "Depth " + Number(r.depth).toLocaleString() + " m" : "",
        r.height !== "" ? "Rises " + Number(r.height).toLocaleString() + " m" : "", wikiLine(r)];
    } });
  /* Ocean: offshore platforms */
  pointLayer({ id: "platforms", file: "platforms", name: "Offshore platforms", icon: "🛢️", group: "Ocean",
    tip: "Offshore oil and gas platforms still standing: US federal waters (BOEM) and named platforms worldwide (Wikidata)",
    attrib: 'Platforms: <a href="https://www.data.boem.gov/" target="_blank" rel="noopener">BOEM</a>, Wikidata', src: ["BOEM platform structures", "https://www.data.boem.gov/Main/PlatformStructures.aspx"],
    layers: [{ id: "plat-dot", codes: ["boem", "wd"], color: "#ffcc33", r: 2 }],
    lines: (r, k) => {
      return [K.esc(k === "boem" ? BT[r.kind] || "Structure type " + r.kind : cap(r.kind)), place(r), age("Installed", r.year),
        r.depth !== "" ? "Water depth " + K.esc(r.depth) + " m" : "", r.operator ? "Operator " + K.esc(r.operator) : "",
        r.wiki === "manned" ? "Crewed around the clock" : "", wikiLine(r)];
    } });
  /* research stations */
  pointLayer({ id: "stations", file: "stations", name: "Research stations", icon: "🔬", group: "Science",
    tip: "Research stations worldwide (Wikidata) and every Antarctic station and camp (COMNAP)",
    legend: K.legKeys([["#e8f6ff", "dot", "polar station or camp"], ["#7fd1a8", "dot", "other research station"]]),
    attrib: 'Stations: <a href="https://www.comnap.aq/" target="_blank" rel="noopener">COMNAP</a>, Wikidata', src: ["COMNAP Antarctic facilities", "https://github.com/PolarGeospatialCenter/comnap-antarctic-facilities"],
    layers: [{ id: "stn-polar", codes: ["polar"], color: "#e8f6ff", r: 3.2 }, { id: "stn-other", codes: ["other"], color: "#7fd1a8", r: 2.6 }],
    lines: (r) => {
      return [K.esc(cap(r.kind)), place(r), age("Opened", r.year), r.operator ? "Run by " + K.esc(r.operator) : "",
        r.height !== "" ? "Height " + K.esc(r.height) + " m" : "", wikiLine(r)];
    } });
  /* opt111 Science: particle accelerators (with the LHC ring) and research labs (tools/build-science.js) */
  var ring = (lat, lon, km) => {
    var c = [];
    for (var a = 0; a <= 360; a += 5) c.push([lon + km / (111.32 * Math.cos(lat * Math.PI / 180)) * Math.cos(a * Math.PI / 180), lat + km / 110.57 * Math.sin(a * Math.PI / 180)]);
    return c;
  };
  var sciLines = (r) => {
    return [K.esc(cap(r.kind)), place(r), age("Opened", r.year), r.operator ? "Run by " + K.esc(r.operator) : "", wikiLine(r)];
  };
  var WD = 'Science: <a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a>';
  pointLayer({ id: "accelerators", file: "accelerators", name: "Particle accelerators", icon: "⚛️", group: "Science", dflt: true,
    tip: "Particle accelerators and the big accelerator labs (CERN, Fermilab, SLAC, DESY, KEK, TRIUMF, Brookhaven), Wikidata", attrib: WD,
    src: ["Wikidata", "https://www.wikidata.org/"], legend: K.legKeys([["#ff4fa3", "dot", "accelerator lab"], ["#ffa6d2", "dot", "accelerator"],
      ["#ff4fa3", "line", "LHC ring, 27 km"]]),
    layers: [{ id: "acc-lab", codes: ["lab"], color: "#ff4fa3", r: 4 }, { id: "acc-dot", codes: ["acc"], color: "#ffa6d2", r: 2.8 }],
    extraIds: ["acc-ring"],
    extra: (map) => {
      if (map.getLayer("acc-ring")) return;
      map.addSource("w-acc-ring", { type: "geojson", data: K.fc([{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: ring(46.2726, 6.0661, 4.24) } }]) });
      map.addLayer({ id: "acc-ring", type: "line", source: "w-acc-ring", paint: { "line-color": "#ff4fa3", "line-width": 2, "line-opacity": 0.9 } }, K.before(map));
    },
    lines: sciLines });
  /* labs by field (tools/classify-labs.js): one class per lab from its Wikidata field of work, type and name */
  var LABS = [["space", "Physics & space", "#b48cff"], ["life", "Life sciences & medicine", "#ff6b8a"], ["earth", "Earth, climate & ocean", "#3fb6c9"],
    ["eng", "Engineering, tech & computing", "#ffb347"], ["chem", "Chemistry & materials", "#f5e663"], ["agri", "Agriculture & food", "#9be564"],
    ["soc", "Social sciences", "#5fb8ff"], ["rel", "Religion & humanities", "#d9a6ff"], ["mil", "Military & defence", "#a0a0a0"], ["other", "Other or not known", "#e8e8e8"]];
  pointLayer({ id: "labs", file: "labs", name: "Research labs & centres", icon: "🧪", group: "Science", dflt: true, kids: true,
    tip: "Laboratories, research centres and well-known research institutes by field (Wikidata)", attrib: WD, src: ["Wikidata", "https://www.wikidata.org/"],
    legend: K.legKeys(LABS.map((c) => { return [c[2], "dot", c[1]]; })),
    layers: LABS.map((c) => { return { id: "lab-" + c[0], codes: [c[0]], color: c[2], r: 2.4, name: c[1] }; }),
    lines: (r) => { return sciLines(r).concat(r.field ? ["Field: " + K.esc(r.field)] : []); } });
  /* History: one place per point, in the first group that claims it (tools/build-history.js) */
  var HIST = [["wonder", "Ancient Wonders (original sites)", "#ffd34d", 5], ["new7", "New 7 Wonders", "#ffb000", 5], ["whs", "UNESCO World Heritage", "#3f8cff", 3],
    ["temple", "Temples & shrines, 800+ years", "#c08bff", 2.8], ["c200", "Castles & forts, under 200 years", "#f6d6a8", 2.4],
    ["c500", "Castles & forts, 201–500 years", "#e8a25c", 2.4], ["c1000", "Castles & forts, 501–1,000 years", "#c46a2a", 2.6],
    ["c1500", "Castles & forts, 1,001–1,500 years", "#8e3b1a", 2.8], ["cold", "Castles & forts, over 1,500 years", "#5a1d0c", 3],
    ["cnone", "Castles & forts, age not known", "#9a9a9a", 2.2], ["site", "Other ancient sites", "#7fc6a4", 2.4]];
  pointLayer({ id: "history", file: "history", name: "Heritage & ancient sites", icon: "🏛️", group: "History", dflt: true, kids: true,
    tip: "World Heritage, the Wonders, old temples, castles and forts by age, and ancient sites, each place listed once (Wikidata)", attrib: WD,
    src: ["Wikidata", "https://www.wikidata.org/"], legend: K.legKeys(HIST.map((h) => { return [h[2], "dot", h[1]]; })),
    layers: HIST.map((h) => { return { id: "hist-" + h[0], codes: [h[0]], color: h[2], r: h[3], name: h[1] }; }),
    lines: (r) => { return [K.esc(cap(r.kind)), place(r), (+r.year < 0 ? "Built about " + (-r.year) + " BC · " + (NOW - r.year) + " years old" : age("Built", r.year)), wikiLine(r)]; } });
  /* Travel: airports */
  pointLayer({ id: "airports", file: "airports", name: "Airports", icon: "✈️", group: "Travel", dflt: true,
    tip: "Large airports and medium airports with scheduled flights (OurAirports, public domain)",
    attrib: 'Airports: <a href="https://ourairports.com/" target="_blank" rel="noopener">OurAirports</a>', src: ["OurAirports", "https://ourairports.com/data/"],
    legend: K.legKeys([["#e8eef7", "dot", "large airport"], ["#9aa7bd", "dot", "medium airport, scheduled flights"]]),
    layers: [{ id: "ap-large", codes: ["large"], color: "#e8eef7", r: 3.6 }, { id: "ap-med", codes: ["medium"], color: "#9aa7bd", r: 2.4 }],
    lines: (r) => {
      return [[r.iata, r.icao].filter(Boolean).map(K.esc).join(" · "), [r.city, r.country].filter(Boolean).map(K.esc).join(", "),
        r.elev !== "" ? "Elevation " + Number(r.elev).toLocaleString() + " ft" : "", wikiLine(r)];
    } });
  /* Transmission */
  var txLines = (verb) => {
    return (r) => {
      return [K.esc(cap(r.kind)), place(r), r.height !== "" ? "Height " + Number(r.height).toLocaleString() + " m" : "", age(verb, r.year),
        r.operator ? "Operator " + K.esc(r.operator) : "", wikiLine(r)];
    };
  };
  var TXA = 'Transmission: <a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a>';
  /* opt105 Towers: one layer for broadcast masts, cell towers, microwave and other towers (tools/build-masts.js).
   * Code = type letter + height bucket. 150 m+ load once for all zooms; shorter ones stream per 10 degree tile from zoom 6. */
  var TT = [["b", "TV & radio broadcast", "#ff5a2a"], ["c", "Cell / LTE", "#4fc3f7"], ["m", "Microwave & utility", "#b388ff"], ["o", "Other", "#ffc2a6"]];
  var TN = {}; TT.forEach((t) => { TN[t[0]] = t[1]; });
  var tOn = (t) => { try { return localStorage.getItem("sunny-L-towers-" + t) !== "0"; } catch (e) { return true; } };
  var tFilter = () => { return ["in", ["slice", ["get", "k"], 0, 1], ["literal", TT.filter((t) => tOn(t[0])).map((t) => t[0])]]; };
  var tColor = ["match", ["slice", ["get", "k"], 0, 1]].concat([].concat.apply([], TT.map((t) => [t[0], t[2]])), ["#ffc2a6"]);
  var mastName = (r) => { return r.name || r.operator || "Unnamed tower"; };
  var MSRC = { wd: (r) => { return ["Wikidata " + r.ref, "https://www.wikidata.org/wiki/" + r.ref]; },
    osm: (r) => { return ["OpenStreetMap " + r.ref, "https://www.openstreetmap.org/" + r.ref]; },
    fcc: (r) => { var p = String(r.ref).split(":"); return ["FCC ASR " + p[0], "https://wireless2.fcc.gov/UlsApp/AsrSearch/asrRegistration.jsp?regKey=" + p[1]]; } };
  var tMeta = {}, tFeats = {}, tMap = null;
  var tBase = (k) => { return k === "big" ? BASE + "masts" : BASE + "towers-t/" + k + "/t"; };
  var tLines = (r, k) => {
    return ["<b>" + (r.height !== "" ? Number(r.height).toLocaleString() + " m" : "Height unknown") + "</b> · " + K.esc(TN[String(k)[0]] || "Tower"),
      K.esc(cap(r.kind || "tower")), K.esc(r.country || ""), age("Built", r.year), r.name && r.operator ? "Owner " + K.esc(r.operator) : "", wikiLine(r)];
  };
  var tSet = () => {
    if (!tMap || !tMap.getSource("w-towers")) return;
    var all = []; Object.keys(tFeats).forEach((k) => { all = all.concat(tFeats[k]); });
    tMap.getSource("w-towers").setData(K.fc(all));
  };
  var tLoad = (k) => {
    if (tMeta[k]) return;
    tMeta[k] = 1;
    K.loadJson(tBase(k) + ".p.json?h=" + V).then((d) => { tMeta[k] = d; tFeats[k] = P.toFeatures(d, { t: k }); tSet(); }).catch(() => { delete tMeta[k]; });
  };
  var tView = () => {
    var m = tMap, man = meta.manifest;
    if (!m || !L.isOn("towers") || m.getZoom() < K.gz(6) || !man || !man.towerTiles) return;
    var b = m.getBounds();
    man.towerTiles.forEach((k) => {
      var p = k.split("_").map(Number);
      if (p[0] < b.getNorth() && p[0] + 10 > b.getSouth() && p[1] < b.getEast() && p[1] + 10 > b.getWest()) tLoad(k);
    });
  };
  var TH = ["to-number", ["slice", ["get", "k"], 1]];
  var tApply = (map, on) => {
    tMap = map;
    K.vis(map, ["tower-dot"], on);
    if (window.SunnyFireLook) window.SunnyFireLook.apply();
    if (window.SunnyCaCell) window.SunnyCaCell.apply(); /* opt159: Canadian cell sites (ca-cell.js) follow the Towers switch */
    if (!on) return;
    if (!map.getSource("w-towers")) {
      map.addSource("w-towers", { type: "geojson", data: K.fc([]), attribution: "Towers: Wikidata, FCC ASR" });
      map.addLayer({ id: "tower-dot", type: "circle", source: "w-towers", filter: tFilter(), paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, ["+", 1, ["/", TH, 170]], 6, ["+", 1.6, ["/", TH, 90]], 12, ["+", 3, ["/", TH, 40]]],
        "circle-color": tColor, "circle-stroke-color": "#101418", "circle-stroke-width": 0.6 } }, K.before(map));
      map.on("moveend", tView);
    }
    K.loadJson(BASE + "manifest.json?h=" + V).then((m) => { meta.manifest = m; tView(); }).catch(() => {});
    tLoad("big");
  };
  var tDetail = (f) => { var k = f.properties.t; return P.detail(tBase(k), tMeta[k], f.properties.i, V); };
  L.add({ id: "towers", name: "Towers", icon: "🗼", group: "Transmission", taps: ["tower-dot", "ca-cell-dot", "fire-look-dot"], apply: tApply,
    tip: "Broadcast masts, cell towers, microwave and other towers; bigger dot = taller. 150 m+ at every zoom, shorter towers (60 m+, United States) from zoom 6. Types are guessed from the owner.",
    kids: TT.map((t) => { return { id: "towers-" + t[0], name: t[1], dflt: true }; }).concat([{ id: "towers-ca", name: "Canada cell sites (ISED), by carrier", dflt: true },
      { id: "towers-fl", name: "Fire lookout towers", dflt: true }]),
    kidSet: () => { if (tMap && tMap.getLayer("tower-dot")) tMap.setFilter("tower-dot", tFilter()); if (window.SunnyCaCell) window.SunnyCaCell.apply();
      if (window.SunnyFireLook) window.SunnyFireLook.apply(); },
    legend: K.legKeys(TT.map((t) => [t[2], "dot", t[1]])) + (window.SunnyCaCell ? window.SunnyCaCell.legend : "") + (window.SunnyFireLook ? window.SunnyFireLook.legend : ""),
    attach: (map) => {
      if (window.SunnyCaCell) window.SunnyCaCell.attach(map);
      if (window.SunnyFireLook) window.SunnyFireLook.attach(map);
      idle(map, "towers", "tower-dot", tApply);
      map.on("click", "tower-dot", (e) => {
        var f = e.features[0];
        var pp = K.show(map, f.geometry.coordinates, "", [P.skeleton("Tower")], ["FCC ASR, Wikidata", "https://www.fcc.gov/uls/transactions/daily-weekly"]);
        tDetail(f).then((r) => { if (pp.isOpen()) pp.setHTML(K.card(mastName(r), tLines(r, f.properties.k), (MSRC[r.src] || MSRC.wd)(r))); })
          .catch(() => { if (pp.isOpen()) pp.setHTML(K.card("Tower", ["Could not load details. Tap again when online."], null)); });
      });
    } });
  var BT = { FIXED: "Fixed platform", CAIS: "Caisson", WP: "Well protector", TLP: "Tension-leg platform", SPAR: "Spar", MOPU: "Mobile production unit", SEMI: "Semi-submersible", SUBS: "Subsea" };
  /* opt105: hover labels with the real name and type for towers and every points layer (was "Plat", "Mast 300") */
  var prevExt = window.SunnyHoverExt;
  window.SunnyHoverExt = (f, upd) => {
    var id = f.layer && f.layer.id, k = String(f.properties.k || "");
    if (id === "tower-dot" && tMeta[f.properties.t]) {
      tDetail(f).then((r) => { upd("<b>" + K.esc(mastName(r)) + "</b><br><small>" + (r.height !== "" ? r.height + " m · " : "") + K.esc(TN[k[0]] || "Tower") + "</small>"); }).catch(() => {});
      return "<b>" + K.esc(TN[k[0]] || "Tower") + "</b>" + (+k.slice(1) ? "<br><small>about " + k.slice(1) + " m</small>" : "");
    }
    var o = hoverOf[id];
    if (!o || !meta[o.file]) return prevExt ? prevExt(f, upd) : null;
    P.detail(BASE + o.file, meta[o.file], f.properties.i, V).then((r) => {
      var ty = o.id === "platforms" ? (k === "boem" ? BT[r.kind] || "Offshore platform" : cap(r.kind || "offshore platform")) : cap(r.kind || o.name);
      upd("<b>" + K.esc((o.title ? o.title(r) : r.name) || o.name) + "</b><br><small>" + K.esc(ty) + (r.operator ? " · " + K.esc(r.operator) : "") + "</small>");
    }).catch(() => {});
    return "<b>" + K.esc(o.name) + "</b>";
  };
  pointLayer({ id: "radioscopes", file: "transmission", name: "Radio telescopes", icon: "📡", group: "Transmission",
    tip: "Radio telescopes and arrays (Wikidata)", attrib: TXA, src: ["Wikidata", "https://www.wikidata.org/"],
    layers: [{ id: "tx-scope", codes: ["scope"], color: "#c08bff", r: 3.2 }], lines: txLines("Opened") });
  pointLayer({ id: "radars", file: "transmission", name: "Radar sites", icon: "🛰️", group: "Transmission",
    tip: "Radar stations (Wikidata)", attrib: TXA, src: ["Wikidata", "https://www.wikidata.org/"],
    kids: true, legend: K.legKeys([["#5ad1ff", "dot", "civil and weather radar"], ["#ff7a59", "dot", "military radar"]]),
    layers: [{ id: "tx-radar", codes: ["radar"], color: "#5ad1ff", r: 3, name: "Civil & weather" }, { id: "tx-radarm", codes: ["radarm"], color: "#ff7a59", r: 3, name: "Military" }],
    lines: txLines("Opened") });
  /* submarine cables: one 75 KB file of lines, details file on first tap */
  var cableRows = null;
  function cableApply(map, on) {
    K.vis(map, ["cable-line", "cable-plan"], on);
    if (!on) return;
    K.loadJson(BASE + "cables.geo.json?h=" + V).then((g) => {
      if (!map.getSource("w-cables")) map.addSource("w-cables", { type: "geojson", data: g,
        attribution: 'Cables: <a href="https://www.submarinecablemap.com/" target="_blank" rel="noopener">TeleGeography</a> (CC BY-NC-SA)' });
      /* opt113: coloured by ready-for-service year; planned cables dashed */
      var cw = ["interpolate", ["linear"], ["zoom"], 1, 0.8, 8, 2.2];
      if (!map.getLayer("cable-line")) map.addLayer({ id: "cable-line", type: "line", source: "w-cables", filter: ["<=", ["get", "y"], NOW], paint: {
        "line-color": ["step", ["get", "y"], "#8a94a8", 1995, "#4fc3f7", 2010, "#7cf29a", 2020, "#ffd34d"], "line-width": cw, "line-opacity": 0.85 } }, K.before(map));
      if (!map.getLayer("cable-plan")) map.addLayer({ id: "cable-plan", type: "line", source: "w-cables", filter: [">", ["get", "y"], NOW], paint: {
        "line-color": "#ff6ad5", "line-width": cw, "line-opacity": 0.85, "line-dasharray": [2, 1.5] } }, K.before(map));
      K.vis(map, ["cable-line", "cable-plan"], L.isOn("cables"));
    }).catch(() => {});
  }
  var CSRC = ["TeleGeography Submarine Cable Map", "https://www.submarinecablemap.com/"];
  L.add({ id: "cables", name: "Submarine cables", icon: "🧵", group: "Ocean", taps: ["cable-line", "cable-plan"], apply: cableApply,
    legend: K.legKeys([["#8a94a8", "line", "before 1995 or year unknown"], ["#4fc3f7", "line", "1995 to 2009"], ["#7cf29a", "line", "2010 to 2019"],
      ["#ffd34d", "line", "2020 to now"], ["#ff6ad5", "line", "planned (dashed)"]]),
    tip: "Undersea internet and power cables (TeleGeography, CC BY-NC-SA)",
    attach: (map, on) => {
      idle(map, "cables", "cable-line", cableApply);
      var cableTap = (e) => {
        var i = e.features[0].properties.i;
        var pp = K.show(map, e.lngLat, "", [P.skeleton("Submarine cable")], CSRC);
        if (!cableRows) cableRows = K.loadJson(BASE + "cables.d.json?h=" + V);
        cableRows.then((rows) => {
          var r = rows[i] || [];
          var link = ["TeleGeography: " + r[0], "https://www.submarinecablemap.com/submarine-cable/" + r[4]];
          if (pp.isOpen()) pp.setHTML(K.card(r[0] + " cable", ["Submarine telecom cable", r[1] ? "Length " + K.esc(r[1]) : "",
            r[2] ? (+r[2] > NOW ? "Planned to start " + K.esc(r[2]) : age("In service since", r[2])) : "", r[3] ? "Owners " + K.esc(r[3]) : ""], link));
        }).catch(() => { cableRows = null; if (pp.isOpen()) pp.setHTML(K.card("Submarine cable", ["Could not load details. Tap again when online."], CSRC)); });
      };
      var hn = window.SunnyHoverName = window.SunnyHoverName || {};
      hn["cable-line"] = hn["cable-plan"] = (f) => {
        if (!cableRows) cableRows = K.loadJson(BASE + "cables.d.json?h=" + V);
        return cableRows.then((rows) => { var r = rows[f.properties.i]; return r ? [r[0], "Submarine cable" + (r[2] ? " · " + r[2] : "")] : null; });
      };
      map.on("click", "cable-line", cableTap); map.on("click", "cable-plan", cableTap);
      cableApply(map, on);
    } });
  /* OSM viewport layers via Overpass (only when zoomed in, cached per tile for a week) */
  function osmLayer(o) {
    var loader = null;
    function draw(map, items) {
      var geo = K.fc(items.map((it) => { return { type: "Feature", properties: it.t, geometry: it.g }; }));
      if (map.getSource(o.src)) map.getSource(o.src).setData(geo);
      else map.addSource(o.src, { type: "geojson", data: geo, attribution: 'OSM: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> (ODbL)' });
      o.add(map);
      K.vis(map, o.ids, L.isOn(o.id));
    }
    function apply(map, on) {
      K.vis(map, o.ids, on);
      if (on && loader) loader.refresh();
    }
    L.add({ id: o.id, name: o.name, icon: o.icon, group: o.group, tip: o.tip, taps: o.ids, dflt: o.dflt, apply: apply, legend: o.legend,
      note: (map) => { return map && map.getZoom() < o.minZoom ? "Zoom in to load" : ""; },
      attach: (map, on) => {
        loader = K.tiles(map, { key: o.id, minZoom: K.gz(o.minZoom), maxTiles: o.maxTiles, ttlMs: 7 * 864e5, isOn: () => { return L.isOn(o.id); },
          fetchTile: (b) => {
            var bb = "(" + [b[1], b[0], b[3], b[2]].map((x) => { return x.toFixed(4); }).join(",") + ")";
            return K.overpass("[out:json][timeout:25];(" + o.q.split("BB").join(bb) + ");out geom 400;").then((j) => { return (j.elements || []).map(o.item).filter(Boolean); });
          },
          onData: (items) => { draw(map, items); } });
        o.ids.forEach((t) => {
          map.on("click", t, (e) => {
            var p = e.features[0].properties;
            K.show(map, e.lngLat, p.name || o.title(p), o.lines(p), ["OpenStreetMap " + p.id, "https://www.openstreetmap.org/" + p.id]);
          });
        });
        apply(map, on);
      } });
  }
  var tg = (el) => {
    var t = el.tags || {};
    return { id: el.type + "/" + el.id, name: t.name || "", op: t.operator || "", h: t.height || "", st: t.start_date || "", acc: t.access || "",
      sub: t.substance || t["tower:construction"] || "", ty: t["communication:mobile_phone"] === "yes" ? "Cell tower" : t["tower:type"] || t.man_made || "" };
  };
  var ptOf = (el) => {
    if (el.type === "node") return { type: "Point", coordinates: [el.lon, el.lat] };
    if (el.bounds) return { type: "Point", coordinates: [(el.bounds.minlon + el.bounds.maxlon) / 2, (el.bounds.minlat + el.bounds.maxlat) / 2] };
    return null;
  };
  var common = (p) => {
    return [p.st ? age("Built", parseInt(p.st, 10)) || "Built " + K.esc(p.st) : "", p.op ? "Operator " + K.esc(p.op) : "",
      p.acc ? "Access " + K.esc(p.acc) : ""];
  };
  /* opt119: undersea pipelines at all zooms, a static file built from Geofabrik OpenStreetMap extracts (tools/build-pipelines.py) */
  var PIPE_IDS = ["pipe-line", "pipe-hit"];
  function pipeApply(map, on) {
    K.vis(map, PIPE_IDS, on);
    if (!on) return;
    K.loadJson(BASE + "pipelines.geo.json").then((g) => {
      if (!map.getSource("w-pipes")) map.addSource("w-pipes", { type: "geojson", data: g,
        attribution: 'Pipelines: <a href="https://download.geofabrik.de/" target="_blank" rel="noopener">Geofabrik</a> · OpenStreetMap (ODbL)' });
      if (!map.getLayer("pipe-hit")) map.addLayer({ id: "pipe-hit", type: "line", source: "w-pipes", paint: { "line-color": "#000", "line-width": 16, "line-opacity": 0 } });
      if (!map.getLayer("pipe-line")) map.addLayer({ id: "pipe-line", type: "line", source: "w-pipes", paint: {
        "line-color": ["match", ["get", "s"], "gas", "#ff9a3c", "oil", "#c0662b", "#e3c07a"],
        "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.8, 9, 2], "line-opacity": 0.9 } }, K.before(map));
      K.vis(map, PIPE_IDS, L.isOn("pipelines"));
    }).catch(() => {});
  }
  L.add({ id: "pipelines", name: "Undersea pipelines", icon: "🛢️", group: "Ocean", taps: ["pipe-hit"], dflt: true, apply: pipeApply,
    tip: "Undersea oil and gas pipelines at every zoom, from OpenStreetMap (North Sea, Gulf of Mexico, Persian Gulf, Asia, Australia, Brazil, Nigeria)",
    legend: K.legKeys([["#ff9a3c", "line", "gas"], ["#c0662b", "line", "oil"], ["#e3c07a", "line", "other or not tagged"]]),
    attach: (map, on) => {
      idle(map, "pipelines", "pipe-line", pipeApply);
      map.on("click", "pipe-hit", (e) => {
        var p = e.features[0].properties;
        K.show(map, e.lngLat, p.n || "Undersea pipeline", [p.s ? "Carries " + K.esc(p.s) : "", p.o ? "Operator " + K.esc(p.o) : ""],
          ["OpenStreetMap via Geofabrik", "https://www.openstreetmap.org/#map=12/" + e.lngLat.lat.toFixed(4) + "/" + e.lngLat.lng.toFixed(4)]);
      });
      pipeApply(map, on);
    } });
  osmLayer({ id: "osm-undersea", src: "w-osm-sea", ids: ["osm-pipe", "osm-plat"], name: "Undersea pipelines (OSM)", icon: "🛢️", group: "Ocean", minZoom: 9, maxTiles: 15,
    legend: K.legKeys([["#d98c2b", "line", "pipeline"], ["#ffcc33", "dot", "platform"]]),
    tip: "Underwater pipelines and offshore platforms mapped in OpenStreetMap, loads at zoom 9 and closer",
    q: 'way["man_made"="pipeline"]["location"="underwater"]BB;nwr["man_made"="offshore_platform"]BB;',
    item: (el) => {
      var t = tg(el);
      if (el.type === "way" && el.geometry && (el.tags || {}).man_made === "pipeline") {
        const r5 = (v) => Math.round(v * 1e5) / 1e5;
        return { t: t, g: { type: "LineString", coordinates: el.geometry.map((c) => [r5(c.lon), r5(c.lat)]) } };
      }
      var g = ptOf(el);
      return g ? { t: t, g: g } : null;
    },
    add: (map) => {
      if (!map.getLayer("osm-pipe")) map.addLayer({ id: "osm-pipe", type: "line", source: "w-osm-sea", filter: ["==", ["geometry-type"], "LineString"],
        paint: { "line-color": "#d98c2b", "line-width": 1.6, "line-dasharray": [3, 1.5] } }, K.before(map));
      if (!map.getLayer("osm-plat")) map.addLayer({ id: "osm-plat", type: "circle", source: "w-osm-sea", filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-radius": 4, "circle-color": "#ffcc33", "circle-stroke-color": "#3a2a00", "circle-stroke-width": 1 } }, K.before(map));
    },
    title: (p) => { return p.ty === "pipeline" ? "Undersea pipeline" : "Offshore platform"; },
    lines: (p) => { return [p.ty === "pipeline" ? "Underwater pipeline" + (p.sub ? ", carries " + K.esc(p.sub) : "") : "Offshore platform"].concat(common(p)); } });
})();
