// workspace/whereisthesun/outdoor-layers.js
/* SUNNY opt94 outdoors and history layers. All load a piece at a time and only when zoomed in.
 *   Provincial parks  Ontario "Provincial Park Regulated" (LIO, OGL-Ontario), operating parks
 *                     solid green, non-operating parks hatched-look orange outline. Picture
 *                     tiles from 256 px server renders, zoom 6 and closer, Ontario only.
 *   Campsites         OpenStreetMap (ODbL) tourism=camp_site and fire lookout towers, zoom 7+.
 *   Plaques           OpenStreetMap plaques, memorials, monuments and history boards, plus Ontario
 *                     Heritage Trust plaques and Parks Canada national historic sites, zoom 9+.
 *                     Both come from prebuilt packs per province or USA region (opt95). */
(() => {
  "use strict";
  var K = window.SunnyKit;
  var L = window.SunnyLayers;
  if (!K || !L) return;
  /* Ontario provincial parks */
  var PARK_BASE = "https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open03/MapServer";
  var PARK_STYLE = [{ id: 4, source: { type: "mapLayer", mapLayerId: 4 }, drawingInfo: { renderer: { type: "uniqueValue", field1: "OPERATING_STATUS_IND",
    defaultSymbol: { type: "esriSFS", style: "esriSFSSolid", color: [60, 160, 90, 110], outline: { type: "esriSLS", style: "esriSLSSolid", color: [20, 100, 50, 230], width: 0.8 } },
    uniqueValueInfos: [{ value: "No", symbol: { type: "esriSFS", style: "esriSFSBackwardDiagonal", color: [230, 120, 20, 200], outline: { type: "esriSLS", style: "esriSLSDash", color: [200, 90, 0, 255], width: 1 } } }] } } }];
  function parkApply(map, on) {
    K.vis(map, ["parks-raster"], on);
    if (!on) return;
    try {
      if (!map.getSource("on-parks")) {
        map.addSource("on-parks", { type: "raster", tileSize: 256, minzoom: 6, maxzoom: 14, bounds: [-95.2, 41.6, -74.3, 56.9],
          tiles: [PARK_BASE + "/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png8&transparent=true&f=image&dynamicLayers=" + encodeURIComponent(JSON.stringify(PARK_STYLE))],
          attribution: 'Parks (Ontario): <a href="https://geohub.lio.gov.on.ca/" target="_blank" rel="noopener">LIO</a>, OGL-Ontario' });
      }
      if (!map.getLayer("parks-raster")) map.addLayer({ id: "parks-raster", type: "raster", source: "on-parks", minzoom: 6, paint: { "raster-opacity": 0.85 } }, K.before(map));
    } catch (e) {}
    K.vis(map, ["parks-raster"], L.isOn("parks"));
  }
  function parkClick(map, e) {
    if (!L.isOn("parks") || map.getZoom() < 6) return;
    var tap = window.SunnyLayers.tapIds().filter(map.getLayer.bind(map));
    if (tap.length && map.queryRenderedFeatures(e.point, { layers: tap }).length) return;
    var b = map.getBounds();
    var c = map.getCanvas();
    var q = "geometry=" + e.lngLat.lng + "," + e.lngLat.lat + "&geometryType=esriGeometryPoint&sr=4326&layers=all:4&tolerance=1" +
      "&mapExtent=" + [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(",") +
      "&imageDisplay=" + c.clientWidth + "," + c.clientHeight + ",96&returnGeometry=false&f=json";
    fetch(PARK_BASE + "/identify?" + q).then((r) => { return r.json(); }).then((d) => {
      var a = d.results && d.results[0] && d.results[0].attributes;
      if (!a) return;
      var op = a.OPERATING_STATUS_IND === "Yes";
      K.show(map, e.lngLat, a.PROTECTED_AREA_NAME_ENG, [K.esc(a.PROVINCIAL_PARK_CLASS_ENG) + " class provincial park",
        op ? "Operating park (facilities, fees)" : "Non-operating park (no facilities, open to low-impact use)"], ["Ontario GeoHub, Provincial Park Regulated (OGL-Ontario)", "https://geohub.lio.gov.on.ca/datasets/provincial-park-regulated"]);
    }).catch(() => {});
  }
  L.add({ id: "parks", name: "Provincial parks (Ontario)", icon: "🏞️", group: "Outdoors", apply: parkApply,
    tip: "Ontario provincial parks: green = operating, orange hatch = non-operating. Zoom in; tap for details",
    note: (map, on) => { return on && map && map.getZoom() < 6 ? "zoom in" : ""; },
    attach: (map, on) => {
      map.on("idle", () => { if (L.isOn("parks") && !map.getLayer("parks-raster")) parkApply(map, true); });
      map.on("click", parkClick.bind(null, map));
      parkApply(map, on);
    } });
  /* Pack point layers (opt95): data/packs/<region>/<layer>.json built by tools/build-packs.js.
   * Only regions overlapping the view are fetched; the service worker keeps them (cache-first),
   * so a region downloads once and then works offline. */
  var index = null;
  function packIndex() {
    if (!index) index = fetch("data/packs/index.json").then((r) => { if (!r.ok) throw new Error("packs"); return r.json(); }).catch((e) => { index = null; throw e; });
    return index;
  }
  function packUrl(ix, id, layer) {
    return "data/packs/" + id + "/" + layer + ".json?h=" + ix.built;
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
      if (!map.getLayer(ids[0])) map.addLayer({ id: ids[0], type: "circle", source: src, minzoom: o.minZoom, paint: o.paint }, K.before(map));
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
    function toFeats(j) {
      var cols = j.cols.split(",");
      return j.rows.map((r) => {
        var p = {};
        for (var i = 2; i < cols.length; i++) p[cols[i]] = r[i];
        return { type: "Feature", properties: p, geometry: { type: "Point", coordinates: [r[0], r[1]] } };
      });
    }
    function refresh(map) {
      if (!L.isOn(o.id) || map.getZoom() < o.minZoom) return;
      packIndex().then((ix) => {
        var v = map.getBounds();
        var want = ix.regions.filter((r) => { return overlaps(r.bbox, v); }).map((r) => { return r.id; });
        if (want.length > 4) return;
        draw(map, want);
        want.forEach((id) => {
          if (mem[id] || loading[id]) return;
          loading[id] = fetch(packUrl(ix, id, o.id)).then((r) => { return r.json(); }).then((j) => {
            mem[id] = toFeats(j);
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
        map.on("click", ids[0], (e) => { o.tap(map, e, e.features[0].properties); });
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
    paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 2.5, 15, 7], "circle-color": ["match", ["get", "kind"], "l", "#e0482a", "#3aa35b"],
      "circle-stroke-color": "#fff", "circle-stroke-width": 1.2 },
    tap: (map, e, p) => {
      K.show(map, e.lngLat, p.name, [p.kind === "l" ? "Lookout tower" : (+p.backcountry ? "Backcountry campsite" : "Campground"),
        p.operator ? "Run by " + K.esc(p.operator) : "", p.fee ? "Fee: " + K.esc(p.fee) : "", link(p.website, "Website")], ["OpenStreetMap (ODbL)", osmUrl(p.osm)]);
    } });
  var PLQ_SRC = { h: ["Ontario Heritage Trust plaque list", ""], p: ["Parks Canada", ""] };
  packLayer({ id: "plaques", name: "Historic plaques & sites", icon: "🪧", group: "History", minZoom: 9,
    attr: OSM_ATTR + ', <a href="https://www.heritagetrust.on.ca/" target="_blank" rel="noopener">Ontario Heritage Trust</a>, <a href="https://parks.canada.ca/" target="_blank" rel="noopener">Parks Canada</a>',
    tip: "Historical plaques, monuments, Ontario Heritage Trust plaques and national historic sites. Zoom in to see",
    paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2.5, 16, 6.5], "circle-color": ["match", ["get", "src"], "p", "#b0302a", "h", "#1e6bff", "#5a3fb0"],
      "circle-stroke-color": "#fff", "circle-stroke-width": 1.2 },
    tap: (map, e, p) => {
      var kind = String(p.kind || "").replace(/_/g, " ");
      var src = p.src === "o" ? ["OpenStreetMap (ODbL)", osmUrl(p.osm)] : [PLQ_SRC[p.src][0], p.website];
      K.show(map, e.lngLat, p.name, [kind ? K.esc(kind.charAt(0).toUpperCase() + kind.slice(1)) : "", p.date ? "Date " + K.esc(p.date) : "",
        p.inscription ? '<i class="lp-inscr">' + K.esc(p.inscription) + "</i>" : "", p.src === "o" ? link(p.website, "More") : ""], src);
    } });
})();
