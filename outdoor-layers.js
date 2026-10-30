// workspace/whereisthesun/outdoor-layers.js
/* SUNNY opt94 outdoors and history layers. All load a piece at a time and only when zoomed in.
 *   Provincial parks  moved to parks-ca.js (opt164, all of Canada).
 *   Campsites         OpenStreetMap (ODbL) tourism=camp_site and fire lookout towers, zoom 7+.
 *   Plaques           OpenStreetMap plaques, memorials, monuments and history boards, plus Ontario
 *                     Heritage Trust plaques and Parks Canada national historic sites, zoom 9+.
 *                     Both come from prebuilt packs per province or USA region (opt95). */
(() => {
  "use strict";
  var K = window.SunnyKit;
  var L = window.SunnyLayers;
  if (!K || !L) return;
  /* Pack point layers (opt95): data/packs/<region>/<layer>.json built by tools/build-packs.js.
   * Only regions overlapping the view are fetched; the service worker keeps them (cache-first),
   * so a region downloads once and then works offline. */
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
    var src = "pack-" + o.id;
    var ids = [src + "-dot"];
    var mem = {};
    var loading = {};
    var shown = "";
    function ensure(map) {
      if (!map.getSource(src)) map.addSource(src, { type: "geojson", data: K.fc(), attribution: o.attr });
      if (!map.getLayer(ids[0])) {
        var paint = Object.assign({}, o.paint);
        if (paint["circle-radius"] != null) {
          paint["circle-radius"] = K.markerScale.bind(map, ids[0], "circle-radius", paint["circle-radius"]);
        }
        map.addLayer({ id: ids[0], type: "circle", source: src, minzoom: K.gz(o.minZoom), paint: paint }, K.before(map));
      }
    }
    function draw(map, want) {
      var have = want.filter((id) => { return mem[id]; });
      var key = have.join(",");
      if (key === shown || !map.getSource(src)) return;
      shown = key;
      var feats = [];
      have.forEach((id) => { feats = feats.concat(mem[id]); });
      map.getSource(src).setData(K.fc(feats));
    }
    var metas = {};
    var built = "";
    function refresh(map) {
      if (!L.isOn(o.id) || map.getZoom() < K.gz(o.minZoom)) return;
      packIndex().then((ix) => {
        var v = map.getBounds();
        var want = ix.regions.filter((r) => { return overlaps(r.bbox, v); }).map((r) => { return r.id; });
        if (want.length > 4) return;
        draw(map, want);
        want.forEach((id) => {
          if (mem[id] || loading[id]) return;
          loading[id] = fetch(packUrl(ix, id, o.id)).then((r) => { return r.json(); }).then((j) => {
            metas[id] = j;
            built = ix.built;
            mem[id] = window.SunnyPoints.toFeatures(j, { r: id });
            draw(map, want);
          }).catch(() => {}).then(() => { delete loading[id]; });
        });
      }).catch(() => {});
    }
    function apply(map, on) {
      K.vis(map, ids, on);
      if (!on) return;
      try { ensure(map); } catch (e) {}
      K.vis(map, ids, L.isOn(o.id));
      refresh(map);
    }
    L.add({ id: o.id, name: o.name, icon: o.icon, group: o.group, tip: o.tip, taps: ids, apply: apply,
      note: (map, on) => { return on && map && map.getZoom() < o.minZoom ? "zoom in" : ""; },
      attach: (map, on) => {
        map.on("moveend", () => { refresh(map); });
        map.on("idle", () => { if (L.isOn(o.id) && !map.getLayer(ids[0])) apply(map, true); });
        (window.SunnyHoverName = window.SunnyHoverName || {})[ids[0]] = (g) => {
          var f = g.properties;
          return window.SunnyPoints.detail("data/packs/" + f.r + "/" + o.id, metas[f.r], f.i, built).then((d) => { return [d.name || o.label(f.k), o.label(f.k)]; });
        };
        map.on("click", ids[0], (e) => {
          var f = e.features[0].properties;
          var ll = e.features[0].geometry.coordinates;
          var pp = K.show(map, ll, "", [window.SunnyPoints.skeleton(o.label(f.k))], o.name);
          window.SunnyPoints.detail("data/packs/" + f.r + "/" + o.id, metas[f.r], f.i, built).then((d) => {
            d.kind = d.kind || f.k;
            d.src = f.k;
            if (pp.isOpen()) pp.setHTML(o.html(d));
          }).catch(() => { if (pp.isOpen()) pp.setHTML(K.card(o.label(f.k), ["Could not load details. Check your connection and tap again."], o.name)); });
        });
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
  packLayer({ id: "camps", name: "Campsites & lookouts", icon: "⛺", group: "Outdoors", minZoom: 7, attr: OSM_ATTR,
    tip: "Campgrounds, backcountry sites and fire lookout towers (OpenStreetMap), saved per province or region. Zoom in to see",
    paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 2.5, 15, 7], "circle-color": ["match", ["get", "k"], "l", "#e0482a", "#3aa35b"],
      "circle-stroke-color": "#fff", "circle-stroke-width": 1.2 },
    label: (k) => { return k === "l" ? "Lookout tower" : "Campsite"; },
    html: (p) => {
      return K.card(p.name || "Campsite", [p.kind === "l" ? "Lookout tower" : (+p.backcountry ? "Backcountry campsite" : "Campground"),
        p.operator ? "Run by " + K.esc(p.operator) : "", p.fee ? "Fee: " + K.esc(p.fee) : "", link(p.website, "Website")], ["OpenStreetMap (ODbL)", osmUrl(p.osm)]);
    } });
  var PLQ_SRC = { h: ["Ontario Heritage Trust plaque list", ""], p: ["Parks Canada", ""] };
  packLayer({ id: "plaques", name: "Historic plaques & sites", icon: "🪧", group: "History", minZoom: 9,
    attr: OSM_ATTR + ', <a href="https://www.heritagetrust.on.ca/" target="_blank" rel="noopener">Ontario Heritage Trust</a>, <a href="https://parks.canada.ca/" target="_blank" rel="noopener">Parks Canada</a>',
    tip: "Historical plaques, monuments, Ontario Heritage Trust plaques and national historic sites. Zoom in to see",
    paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2.5, 16, 6.5], "circle-color": ["match", ["get", "k"], "p", "#b0302a", "h", "#1e6bff", "#5a3fb0"],
      "circle-stroke-color": "#fff", "circle-stroke-width": 1.2 },
    label: (k) => { return k === "p" ? "National historic site" : k === "h" ? "Heritage plaque" : "Historic plaque"; },
    html: (p) => {
      var kind = String(p.kind || "").replace(/_/g, " ");
      var src = p.src === "o" ? ["OpenStreetMap (ODbL)", osmUrl(p.osm)] : [PLQ_SRC[p.src][0], p.website];
      return K.card(p.name || "Historic plaque", [kind ? K.esc(kind.charAt(0).toUpperCase() + kind.slice(1)) : "", p.date ? "Date " + K.esc(p.date) : "",
        p.inscription ? '<i class="lp-inscr">' + K.esc(p.inscription) + "</i>" : "", p.src === "o" ? link(p.website, "More") : ""], src);
    } });
})();
