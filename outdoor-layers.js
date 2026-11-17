// workspace/whereisthesun/outdoor-layers.js
/* SUNNY outdoors and history pack layers (campsites, plaques).
 * opt209: cluster-centroid overview at far zoom (real locations, no grid); region packs when closer.
 * opt291: Campsites & RV parks (separate switches) and Lookouts & viewpoints; fire lookout towers move here
 * from Towers; Canada RV parks and viewpoints come from the local OpenStreetMap extract.
 * Uses SunnyKit.lod — something visible at every zoom without a zoom gate. */
(() => {
  "use strict";
  var K = window.SunnyKit;
  var L = window.SunnyLayers;
  if (!K || !L) return;
  var index = null;
  function packIndex() {
    if (!index) index = fetch("data/packs/index.json").then((r) => { if (!r.ok) throw new Error("packs"); return r.json(); }).catch((e) => { index = null; throw e; });
    return index;
  }
  function packUrl(ix, id, layer) {
    return "data/packs/" + id + "/" + layer + ".p.json?h=" + ix.built;
  }
  function overlaps(b, v) {
    return !(b[2] < v.getWest() || b[0] > v.getEast() || b[3] < v.getSouth() || b[1] > v.getNorth());
  }
  function packLayer(o) {
    var file = o.file || o.id;
    var src = "pack-" + o.id;
    var ids = [src + "-dot"];
    var taps = o.taps ? ids.concat(o.taps) : ids;
    var mem = {};
    var loading = {};
    var shown = "";
    var ov = null, ovLoading = false, band = null;
    var cuts = o.cuts || K.lod.CUT_PACK;
    var metas = {};
    var built = "";
    var mapRef = null;
    var curBand = (map) => { return K.lod.band(map.getZoom(), cuts); };
    var allow = (k) => {
      if (o.kinds && o.kinds.indexOf(k) < 0) return false;
      if (!o.kids) return true;
      return K.kids.matchAny(o.kids, (kid) => { return (kid.kinds || []).indexOf(k) >= 0; });
    };
    var want = () => { return L.isOn(o.id) && (!o.kids || K.kids.anyOn(o.kids)); };
    function ensure(map) {
      if (!map.getSource(src)) map.addSource(src, { type: "geojson", data: K.fc(), attribution: o.attr });
      if (!map.getLayer(ids[0])) {
        var paint = Object.assign({}, o.paint);
        if (paint["circle-radius"] != null) {
          paint["circle-radius"] = K.markerScale.bind(map, ids[0], "circle-radius", paint["circle-radius"]);
        }
        map.addLayer({ id: ids[0], type: "circle", source: src, paint: paint }, K.before(map));
      }
    }
    function draw(map, regions) {
      var have = regions.filter((id) => { return mem[id]; });
      var key = "raw:" + have.join(",") + ":" + (o.kids ? K.kids.active(o.kids).map((k) => { return k.id; }).join(",") : "");
      if (key === shown || !map.getSource(src)) return;
      shown = key;
      var feats = [];
      have.forEach((id) => { mem[id].forEach((f) => { if (allow(f.properties.k)) feats.push(f); }); });
      map.getSource(src).setData(K.fc(feats));
    }
    function ovFeats() {
      if (!ov) return [];
      return (ov.pts || []).filter((r) => { return allow(r[3]); }).map((r) => {
        return { type: "Feature", geometry: { type: "Point", coordinates: [r[1], r[0]] },
          properties: { k: r[3], n: r[2], ov: 1, sites: r[2] } };
      });
    }
    function setOv(map) {
      if (!map.getSource(src) || !ov) return;
      var key = "ov:" + (ov.kept || (ov.pts && ov.pts.length) || 0) + ":" + (o.kids ? K.kids.active(o.kids).map((k) => { return k.id; }).join(",") : "");
      if (key === shown) return;
      shown = key;
      map.getSource(src).setData(K.fc(ovFeats()));
    }
    function loadOv() {
      if (ov) return Promise.resolve(ov);
      if (ovLoading) return ovLoading;
      ovLoading = K.loadJson("data/packs/" + file + ".ov.json?v=opt291").then((d) => {
        ov = d; ovLoading = false; return d;
      }).catch(() => { ovLoading = false; });
      return ovLoading;
    }
    function refresh(map) {
      if (!want()) { if (map.getSource(src)) map.getSource(src).setData(K.fc([])); shown = ""; return; }
      var next = curBand(map);
      band = next;
      if (next === "ov") {
        loadOv().then(() => { if (want() && curBand(map) === "ov") setOv(map); });
        return;
      }
      packIndex().then((ix) => {
        if (curBand(map) !== "raw") return;
        var v = map.getBounds();
        var need = ix.regions.filter((r) => { return overlaps(r.bbox, v); }).map((r) => { return r.id; });
        if (need.length > 6) need = need.slice(0, 6);
        draw(map, need);
        need.forEach((id) => {
          if (mem[id] || loading[id]) return;
          loading[id] = fetch(packUrl(ix, id, file)).then((r) => { return r.json(); }).then((j) => {
            metas[id] = j;
            built = ix.built;
            mem[id] = window.SunnyPoints.toFeatures(j, { r: id });
            if (curBand(map) === "raw") { shown = ""; draw(map, need); }
          }).catch(() => {}).then(() => { delete loading[id]; });
        });
      }).catch(() => {});
    }
    function apply(map, on) {
      mapRef = map;
      K.vis(map, ids, on && want());
      if (o.extra) o.extra(map, on && L.isOn(o.id));
      if (!(on && want())) return;
      try { ensure(map); } catch (e) {}
      K.vis(map, ids, want());
      shown = "";
      refresh(map);
    }
    L.add({ id: o.id, name: o.name, icon: o.icon, group: o.group, tip: o.tip, taps: taps, apply: apply,
      kids: o.kids, kidSet: o.kids ? () => { shown = ""; if (mapRef) apply(mapRef, L.isOn(o.id)); } : undefined,
      legend: o.legend, note: (map, on) => { return on && ovLoading ? K.lod.note(true) : ""; },
      attach: (map, on) => {
        mapRef = map;
        map.on("moveend", () => { refresh(map); });
        map.on("zoomend", () => { refresh(map); });
        map.on("idle", () => { if (want() && !map.getLayer(ids[0])) apply(map, true); });
        (window.SunnyHoverName = window.SunnyHoverName || {})[ids[0]] = (g) => {
          var f = g.properties;
          if (f.ov) return Promise.resolve([(f.sites || f.n) + " nearby", o.label(f.k)]);
          return window.SunnyPoints.detail("data/packs/" + f.r + "/" + file, metas[f.r], f.i, built).then((d) => { return [d.name || o.label(f.k), o.label(f.k)]; });
        };
        map.on("click", ids[0], (e) => {
          var f = e.features[0].properties;
          var ll = e.features[0].geometry.coordinates;
          if (f.ov) {
            K.show(map, ll, (f.sites || f.n) + " " + o.label(f.k).toLowerCase() + "s nearby",
              ["Cluster of places near here", o.label(f.k)], o.name);
            return;
          }
          var pp = K.show(map, ll, "", [window.SunnyPoints.skeleton(o.label(f.k))], o.name);
          window.SunnyPoints.detail("data/packs/" + f.r + "/" + file, metas[f.r], f.i, built).then((d) => {
            d.kind = d.kind || f.k;
            d.src = f.k;
            if (pp.isOpen()) pp.setHTML(o.html(d));
          }).catch(() => { if (pp.isOpen()) pp.setHTML(K.card(o.label(f.k), ["Could not load details. Check your connection and tap again."], o.name)); });
        });
        if (o.attach) o.attach(map);
        apply(map, on);
      } });
  }
  function osmUrl(id) {
    var t = { n: "node", w: "way", r: "relation" }[String(id || "").charAt(0)];
    return t ? "https://www.openstreetmap.org/" + t + "/" + String(id).slice(1) : "https://www.openstreetmap.org/";
  }
  function link(u, txt) {
    return /^https?:/.test(u || "") ? '<a href="' + K.esc(u) + '" target="_blank" rel="noopener">' + txt + "</a>" : "";
  }
  var OSM_ATTR = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>';
  var CAMP_KIDS = [
    { id: "camps-c", name: "Campsites", dflt: true, kinds: ["c"], color: "#3aa35b" },
    { id: "camps-rv", name: "RV / trailer parks", dflt: true, kinds: ["r"], color: "#c36b1e" }
  ];
  packLayer({ id: "camps", name: "Campsites & RV parks", icon: "⛺", group: "Outdoors", cuts: K.lod.CUT_PACK, attr: OSM_ATTR,
    tip: "Campgrounds and backcountry sites (OpenStreetMap), saved per province or region, plus RV and trailer parks in Canada from the same map. Overview clusters far out; each place when closer. Switches for campsites and RV parks",
    kids: CAMP_KIDS,
    kinds: ["c", "r"],
    paint: { "circle-radius": K.size({ stops: [[2, 2.5], [7, 4], [15, 7]], cluster: { prop: "sites", max: 1.6 } }),
      "circle-color": ["match", ["get", "k"], "r", "#c36b1e", "#3aa35b"],
      "circle-stroke-color": "#fff", "circle-stroke-width": 1.2 },
    legend: () => { return K.kids.legKeys(CAMP_KIDS, (k) => { return [k.color, "dot", k.name]; }); },
    label: (k) => { return k === "r" ? "RV / trailer park" : "Campsite"; },
    html: (p) => {
      var kind = p.kind === "r" || p.src === "r" ? "RV / trailer park" : (+p.backcountry ? "Backcountry campsite" : "Campground");
      return K.card(p.name || (p.kind === "r" || p.src === "r" ? "RV / trailer park" : "Campsite"),
        [kind, p.operator ? "Run by " + K.esc(p.operator) : "", p.fee ? "Fee: " + K.esc(p.fee) : "", link(p.website, "Website")],
        ["OpenStreetMap (ODbL)", osmUrl(p.osm)]);
    } });
  packLayer({ id: "lookouts", file: "camps", name: "Lookouts & viewpoints", icon: "🌄", group: "Outdoors", cuts: K.lod.CUT_PACK,
    attr: OSM_ATTR + ', <a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a>',
    tip: "Lookout towers and viewpoints (OpenStreetMap), plus fire lookout towers worldwide (OpenStreetMap and Wikidata). Viewpoints are mapped in Canada; towers also cover the United States. Overview clusters far out; each place when closer",
    kinds: ["l", "v"], taps: ["fire-look-dot"],
    paint: { "circle-radius": K.size({ stops: [[2, 2.5], [7, 4], [15, 7]], cluster: { prop: "sites", max: 1.6 } }),
      "circle-color": ["match", ["get", "k"], "v", "#2a7de0", "#e0482a"],
      "circle-stroke-color": "#fff", "circle-stroke-width": 1.2 },
    legend: () => {
      var html = K.legKeys([["#e0482a", "dot", "Lookout tower"], ["#2a7de0", "dot", "Viewpoint"]]);
      return html + (window.SunnyFireLook ? window.SunnyFireLook.legend : "");
    },
    label: (k) => { return k === "v" ? "Viewpoint" : "Lookout tower"; },
    html: (p) => {
      var kind = p.kind === "v" || p.src === "v" ? "Viewpoint" : "Lookout tower";
      return K.card(p.name || kind, [kind, p.operator ? "Run by " + K.esc(p.operator) : "", link(p.website, "Website")],
        ["OpenStreetMap (ODbL)", osmUrl(p.osm)]);
    },
    extra: (map, on) => { if (window.SunnyFireLook) window.SunnyFireLook.apply(); },
    attach: (map) => { if (window.SunnyFireLook) window.SunnyFireLook.attach(map); }
  });
  var PLQ_SRC = { h: ["Ontario Heritage Trust plaque list", ""], p: ["Parks Canada", ""] };
  packLayer({ id: "plaques", name: "Historic plaques & sites", icon: "🪧", group: "History", cuts: K.lod.CUT_PLAQUES,
    attr: OSM_ATTR + ', <a href="https://www.heritagetrust.on.ca/" target="_blank" rel="noopener">Ontario Heritage Trust</a>, <a href="https://parks.canada.ca/" target="_blank" rel="noopener">Parks Canada</a>',
    tip: "Historical plaques, monuments, Ontario Heritage Trust plaques and national historic sites. Overview clusters far out; each place when closer",
    paint: { "circle-radius": K.size({ stops: [[2, 2.5], [9, 4], [16, 6.5]], cluster: { prop: "sites", max: 1.6 } }),
      "circle-color": ["match", ["get", "k"], "p", "#b0302a", "h", "#1e6bff", "#5a3fb0"],
      "circle-stroke-color": "#fff", "circle-stroke-width": 1.2 },
    label: (k) => { return k === "p" ? "National historic site" : k === "h" ? "Heritage plaque" : "Historic plaque"; },
    html: (p) => {
      var kind = String(p.kind || "").replace(/_/g, " ");
      var src = p.src === "o" ? ["OpenStreetMap (ODbL)", osmUrl(p.osm)] : [PLQ_SRC[p.src][0], p.website];
      return K.card(p.name || "Historic plaque", [kind ? K.esc(kind.charAt(0).toUpperCase() + kind.slice(1)) : "", p.date ? "Date " + K.esc(p.date) : "",
        p.inscription ? '<i class="lp-inscr">' + K.esc(p.inscription) + "</i>" : "", p.src === "o" ? link(p.website, "More") : ""], src);
    } });
})();
