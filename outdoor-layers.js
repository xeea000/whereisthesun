// workspace/whereisthesun/outdoor-layers.js
/* SUNNY opt94 outdoors and history layers. All load a piece at a time and only when zoomed in.
 *   Provincial parks  Ontario "Provincial Park Regulated" (LIO, OGL-Ontario), operating parks
 *                     solid green, non-operating parks hatched-look orange outline. Picture
 *                     tiles from 256 px server renders, zoom 6 and closer, Ontario only.
 *   Campsites         OpenStreetMap (ODbL) tourism=camp_site and fire lookout towers,
 *                     zoom 10 and closer, loaded per zoom-10 tile and kept 14 days.
 *   Plaques           OpenStreetMap historic plaques, memorials, monuments and history boards,
 *                     zoom 12 and closer, per tile, kept 14 days. Tap for name and inscription. */
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
        op ? "Operating park (facilities, fees)" : "Non-operating park (no facilities, open to low-impact use)"], "Ontario LIO, OGL-Ontario");
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
  /* OSM point layers, tiled */
  function osmLayer(o) {
    var src = "osm-" + o.id;
    var ids = [src + "-dot"];
    var loader = null;
    var last = K.fc();
    function feats(items) {
      return K.fc(items.map((it) => {
        return { type: "Feature", properties: it.p, geometry: { type: "Point", coordinates: [it.x, it.y] } };
      }));
    }
    function ensure(map) {
      if (!map.getSource(src)) map.addSource(src, { type: "geojson", data: last, attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>' });
      if (!map.getLayer(ids[0])) map.addLayer({ id: ids[0], type: "circle", source: src, minzoom: o.minZoom, paint: o.paint }, K.before(map));
    }
    function fetchTile(box) {
      var bb = [box[1], box[0], box[3], box[2]].map((v) => { return v.toFixed(4); }).join(",");
      var ql = "[out:json][timeout:25];(" + o.query.map((q) => { return "nwr" + q + "(" + bb + ");"; }).join("") + ");out center tags 400;";
      return K.overpass(ql).then((j) => {
        return (j.elements || []).map((el) => {
          var c = el.center || el;
          return { x: Math.round(c.lon * 1e5) / 1e5, y: Math.round(c.lat * 1e5) / 1e5, p: o.keep(el.tags || {}) };
        }).filter((it) => { return it.p; });
      });
    }
    function apply(map, on) {
      K.vis(map, ids, on);
      if (!on) return;
      try { ensure(map); } catch (e) {}
      K.vis(map, ids, L.isOn(o.id));
      if (loader) loader.refresh(0);
    }
    L.add({ id: o.id, name: o.name, icon: o.icon, group: o.group, tip: o.tip, taps: ids, apply: apply,
      note: (map, on) => { return on && map && map.getZoom() < o.minZoom ? "zoom in" : ""; },
      attach: (map, on) => {
        loader = K.tiles(map, { key: o.id, minZoom: o.minZoom, maxTiles: 6, ttlMs: 14 * 864e5,
          isOn: () => { return L.isOn(o.id); }, fetchTile: fetchTile,
          onData: (items) => {
            last = feats(items);
            if (map.getSource(src)) map.getSource(src).setData(last);
          } });
        map.on("idle", () => { if (L.isOn(o.id) && !map.getLayer(ids[0])) apply(map, true); });
        map.on("click", ids[0], (e) => { o.tap(map, e, e.features[0].properties); });
        apply(map, on);
      } });
  }
  function short(s, n) {
    s = String(s || "");
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }
  osmLayer({ id: "camps", name: "Campsites & lookouts", icon: "⛺", group: "Outdoors", minZoom: 10,
    tip: "Campgrounds, backcountry sites and fire lookout towers (OpenStreetMap). Zoom in to load",
    query: ['["tourism"="camp_site"]', '["man_made"="tower"]["tower:type"~"fire_lookout|observation"]'],
    keep: (t) => {
      var look = t.man_made === "tower";
      return { n: short(t.name || (look ? (t["tower:type"] === "fire_lookout" ? "Fire lookout tower" : "Lookout tower") : "Campsite"), 80), k: look ? "l" : "c",
        b: t.backcountry === "yes" ? 1 : 0, f: t.fee || "", w: t.website || "", o: t.operator ? short(t.operator, 60) : "" };
    },
    paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 15, 7], "circle-color": ["match", ["get", "k"], "l", "#e0482a", "#3aa35b"],
      "circle-stroke-color": "#fff", "circle-stroke-width": 1.2 },
    tap: (map, e, p) => {
      K.show(map, e.lngLat, p.n, [p.k === "l" ? "Lookout tower" : (+p.b ? "Backcountry campsite" : "Campground"), p.o ? "Run by " + K.esc(p.o) : "",
        p.f ? "Fee: " + K.esc(p.f) : "", /^https?:/.test(p.w) ? '<a href="' + K.esc(p.w) + '" target="_blank" rel="noopener">Website</a>' : ""], "OpenStreetMap (ODbL)");
    } });
  osmLayer({ id: "plaques", name: "Historic plaques & sites", icon: "🪧", group: "History", minZoom: 12,
    tip: "Historical plaques, memorials, monuments and history boards (OpenStreetMap). Zoom in to load",
    query: ['["historic"~"memorial|monument|plaque|blue_plaque|ruins|fort|archaeological_site|battlefield|castle|wayside_cross|marker"]', '["tourism"="information"]["board_type"="history"]'],
    keep: (t) => {
      var n = t.name || t["memorial:name"] || (t.memorial === "plaque" ? "Historical plaque" : "");
      if (!n && !t.inscription) return null;
      return { n: short(n || "Historical plaque", 90), h: t.historic || (t.board_type ? "history board" : ""), m: t.memorial || "",
        i: short(t.inscription || t.description || "", 600), d: t.start_date || "", w: t.website || "", by: t.operator ? short(t.operator, 60) : "" };
    },
    paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 3.5, 16, 6.5], "circle-color": "#5a3fb0", "circle-stroke-color": "#fff", "circle-stroke-width": 1.2 },
    tap: (map, e, p) => {
      var kind = (p.m || p.h || "").replace(/_/g, " ");
      K.show(map, e.lngLat, p.n, [kind ? K.esc(kind.charAt(0).toUpperCase() + kind.slice(1)) : "", p.d ? "Date " + K.esc(p.d) : "", p.by ? K.esc(p.by) : "",
        p.i ? '<i class="lp-inscr">' + K.esc(p.i) + "</i>" : "", /^https?:/.test(p.w) ? '<a href="' + K.esc(p.w) + '" target="_blank" rel="noopener">More</a>' : ""], "OpenStreetMap (ODbL)");
    } });
})();
