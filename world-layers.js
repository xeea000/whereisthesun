// workspace/whereisthesun/world-layers.js
/* SUNNY opt99 world layers: Ocean, research stations and Transmission. Progressive: each layer loads
 * a tiny points file (data/world/<name>.p.json, built by tools/build-world.js) and one detail shard on tap.
 *   Seafloor     trenches, seamounts, guyots, ridges, canyons, abyssal plains, hydrothermal vents (Wikidata, CC0)
 *   Cables       submarine cables, TeleGeography Submarine Cable Map (CC BY-NC-SA 3.0), lines + details on tap
 *   Platforms    offshore platforms still standing (BOEM, public domain) plus oil platforms on Wikidata
 *   OSM undersea pipelines and platforms, zoom 9+, and OSM communication towers, zoom 11+ (Overpass, ODbL)
 *   Stations     research stations (Wikidata) and Antarctic facilities (COMNAP)
 *   Transmission tall TV and radio masts (shown by height: 300 m+ always, 150 m+ from zoom 4, all from 6),
 *                radio telescopes and radar sites (Wikidata) */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers, P = window.SunnyPoints;
  if (!K || !L || !P) return;
  var NOW = new Date().getFullYear();
  var BASE = "data/world/";
  var V = "opt99"; /* bump when tools/build-world.js or build-cables.js output changes */
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
  function pointLayer(o) {
    function apply(map, on) {
      var ids = o.layers.map((l) => { return l.id; });
      K.vis(map, ids, on);
      if (!on) return;
      K.loadJson(BASE + o.file + ".p.json?h=" + V).then((d) => {
        meta[o.file] = d;
        var sid = "w-" + o.file;
        if (!map.getSource(sid)) map.addSource(sid, { type: "geojson", data: K.fc(P.toFeatures(d)), attribution: o.attrib });
        o.layers.forEach((l) => {
          if (map.getLayer(l.id)) return;
          var spec = { id: l.id, type: "circle", source: sid, filter: ["in", ["get", "k"], ["literal", l.codes]], paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, l.r || 2.5, 8, (l.r || 2.5) * 2.2],
            "circle-color": l.color, "circle-stroke-color": "#101418", "circle-stroke-width": 0.8 } };
          if (l.minzoom) spec.minzoom = l.minzoom;
          map.addLayer(spec, K.before(map));
        });
        K.vis(map, ids, L.isOn(o.id));
      }).catch(() => {});
    }
    var taps = o.layers.map((l) => { return l.id; });
    L.add({ id: o.id, name: o.name, icon: o.icon, group: o.group, tip: o.tip, taps: taps, dflt: o.dflt, apply: apply,
      attach: (map, on) => {
        idle(map, o.id, taps[0], apply);
        taps.forEach((t) => {
          map.on("click", t, (e) => {
            var f = e.features[0];
            var pp = K.show(map, f.geometry.coordinates, "", [P.skeleton(o.name)], o.src);
            P.detail(BASE + o.file, meta[o.file], f.properties.i, V).then((r) => {
              if (pp.isOpen()) pp.setHTML(K.card(r.name, o.lines(r, f.properties.k), src(r, o.src)));
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
      var BT = { FIXED: "Fixed platform", CAIS: "Caisson", WP: "Well protector", TLP: "Tension-leg platform", SPAR: "Spar", MOPU: "Mobile production unit", SEMI: "Semi-submersible", SUBS: "Subsea" };
      return [K.esc(k === "boem" ? BT[r.kind] || "Structure type " + r.kind : cap(r.kind)), place(r), age("Installed", r.year),
        r.depth !== "" ? "Water depth " + K.esc(r.depth) + " m" : "", r.operator ? "Operator " + K.esc(r.operator) : "",
        r.wiki === "manned" ? "Crewed around the clock" : "", wikiLine(r)];
    } });
  /* research stations */
  pointLayer({ id: "stations", file: "stations", name: "Research stations", icon: "🔬", group: "Earth",
    tip: "Research stations worldwide (Wikidata) and every Antarctic station and camp (COMNAP)",
    attrib: 'Stations: <a href="https://www.comnap.aq/" target="_blank" rel="noopener">COMNAP</a>, Wikidata', src: ["COMNAP Antarctic facilities", "https://github.com/PolarGeospatialCenter/comnap-antarctic-facilities"],
    layers: [{ id: "stn-polar", codes: ["polar"], color: "#e8f6ff", r: 3.2 }, { id: "stn-other", codes: ["other"], color: "#7fd1a8", r: 2.6 }],
    lines: (r) => {
      return [K.esc(cap(r.kind)), place(r), age("Opened", r.year), r.operator ? "Run by " + K.esc(r.operator) : "",
        r.height !== "" ? "Height " + K.esc(r.height) + " m" : "", wikiLine(r)];
    } });
  /* Transmission */
  var txLines = (verb) => {
    return (r) => {
      return [K.esc(cap(r.kind)), place(r), r.height !== "" ? "Height " + Number(r.height).toLocaleString() + " m" : "", age(verb, r.year),
        r.operator ? "Operator " + K.esc(r.operator) : "", wikiLine(r)];
    };
  };
  var TXA = 'Transmission: <a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a>';
  pointLayer({ id: "masts", file: "transmission", name: "Tall TV & radio masts", icon: "🗼", group: "Transmission",
    tip: "TV towers and tall radio masts. 300 m and taller show everywhere, 150 m+ from zoom 4, all from zoom 6 (Wikidata)",
    attrib: TXA, src: ["Wikidata", "https://www.wikidata.org/"],
    layers: [{ id: "mast-300", codes: ["mast300"], color: "#ff6b3d", r: 3.4 }, { id: "mast-150", codes: ["mast150"], color: "#ff9a6b", r: 2.6, minzoom: 4 },
      { id: "mast-all", codes: ["mast"], color: "#ffc2a6", r: 2, minzoom: 6 }], lines: txLines("Built") });
  pointLayer({ id: "radioscopes", file: "transmission", name: "Radio telescopes", icon: "📡", group: "Transmission",
    tip: "Radio telescopes and arrays (Wikidata)", attrib: TXA, src: ["Wikidata", "https://www.wikidata.org/"],
    layers: [{ id: "tx-scope", codes: ["scope"], color: "#c08bff", r: 3.2 }], lines: txLines("Opened") });
  pointLayer({ id: "radars", file: "transmission", name: "Radar sites", icon: "🛰️", group: "Transmission",
    tip: "Radar stations (Wikidata)", attrib: TXA, src: ["Wikidata", "https://www.wikidata.org/"],
    layers: [{ id: "tx-radar", codes: ["radar"], color: "#5ad1ff", r: 3 }], lines: txLines("Opened") });
  /* submarine cables: one 75 KB file of lines, details file on first tap */
  var cableRows = null;
  function cableApply(map, on) {
    K.vis(map, ["cable-line"], on);
    if (!on) return;
    K.loadJson(BASE + "cables.geo.json?h=" + V).then((g) => {
      if (!map.getSource("w-cables")) map.addSource("w-cables", { type: "geojson", data: g,
        attribution: 'Cables: <a href="https://www.submarinecablemap.com/" target="_blank" rel="noopener">TeleGeography</a> (CC BY-NC-SA)' });
      if (!map.getLayer("cable-line")) map.addLayer({ id: "cable-line", type: "line", source: "w-cables", paint: {
        "line-color": ["coalesce", ["get", "c"], "#4fc3f7"], "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.8, 8, 2.2], "line-opacity": 0.8 } }, K.before(map));
      K.vis(map, ["cable-line"], L.isOn("cables"));
    }).catch(() => {});
  }
  var CSRC = ["TeleGeography Submarine Cable Map", "https://www.submarinecablemap.com/"];
  L.add({ id: "cables", name: "Submarine cables", icon: "🧵", group: "Ocean", taps: ["cable-line"], apply: cableApply,
    tip: "Undersea internet and power cables (TeleGeography, CC BY-NC-SA)",
    attach: (map, on) => {
      idle(map, "cables", "cable-line", cableApply);
      map.on("click", "cable-line", (e) => {
        var i = e.features[0].properties.i;
        var pp = K.show(map, e.lngLat, "", [P.skeleton("Submarine cable")], CSRC);
        if (!cableRows) cableRows = K.loadJson(BASE + "cables.d.json?h=" + V);
        cableRows.then((rows) => {
          var r = rows[i] || [];
          var link = ["TeleGeography: " + r[0], "https://www.submarinecablemap.com/submarine-cable/" + r[4]];
          if (pp.isOpen()) pp.setHTML(K.card(r[0] + " cable", ["Submarine telecom cable", r[1] ? "Length " + K.esc(r[1]) : "",
            r[2] ? (+r[2] > NOW ? "Planned to start " + K.esc(r[2]) : age("In service since", r[2])) : "", r[3] ? "Owners " + K.esc(r[3]) : ""], link));
        }).catch(() => { cableRows = null; if (pp.isOpen()) pp.setHTML(K.card("Submarine cable", ["Could not load details. Tap again when online."], CSRC)); });
      });
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
    L.add({ id: o.id, name: o.name, icon: o.icon, group: o.group, tip: o.tip, taps: o.ids, dflt: o.dflt, apply: apply,
      note: (map) => { return map && map.getZoom() < o.minZoom ? "Zoom in to load" : ""; },
      attach: (map, on) => {
        loader = K.tiles(map, { key: o.id, minZoom: o.minZoom, maxTiles: o.maxTiles, ttlMs: 7 * 864e5, isOn: () => { return L.isOn(o.id); },
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
  osmLayer({ id: "osm-undersea", src: "w-osm-sea", ids: ["osm-pipe", "osm-plat"], name: "Undersea pipelines (OSM)", icon: "🛢️", group: "Ocean", minZoom: 9, maxTiles: 15,
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
  osmLayer({ id: "osm-towers", src: "w-osm-tow", ids: ["osm-tower"], name: "Cell & radio towers (OSM)", icon: "📶", group: "Transmission", minZoom: 11, maxTiles: 6,
    tip: "Communication towers and masts mapped in OpenStreetMap, loads at zoom 11 and closer",
    q: 'nwr["man_made"~"^(mast|tower)$"]["tower:type"="communication"]BB;',
    item: (el) => { var g = ptOf(el); return g ? { t: tg(el), g: g } : null; },
    add: (map) => {
      if (!map.getLayer("osm-tower")) map.addLayer({ id: "osm-tower", type: "circle", source: "w-osm-tow", paint: {
        "circle-radius": 4, "circle-color": "#ff7b54", "circle-stroke-color": "#fff", "circle-stroke-width": 1 } }, K.before(map));
    },
    title: () => { return "Communication tower"; },
    lines: (p) => { return [K.esc(cap(p.ty)) + (p.sub ? " (" + K.esc(p.sub) + ")" : ""), p.h ? "Height " + K.esc(p.h) + " m" : ""].concat(common(p)); } });
})();
