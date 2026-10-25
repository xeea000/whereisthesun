// workspace/whereisthesun/earth-layers.js
/* SUNNY opt94 Earth and fire layers.
 *   Wildfires   Canadian Wildland Fire Information System (NRCan) satellite hotspots from the
 *               last 24 hours, North America, no key (NASA FIRMS needs a key). About 17 KB,
 *               at most once per 30 minutes. Open Government Licence - Canada.
 *   Meteorites  observed meteorite falls, data/meteorite-falls.json from NASA Meteorite Landings
 *               (Meteoritical Society), public domain. Static.
 *   Geology     Macrostrat bedrock geology vector tiles (CC BY 4.0), zoom 5 and closer only;
 *               tap for rock type, age and unit name (Macrostrat API). */
(() => {
  "use strict";
  var K = window.SunnyKit;
  var L = window.SunnyLayers;
  if (!K || !L) return;
  function idleAdd(map, id, layer, fn) {
    map.on("idle", () => { if (L.isOn(id) && !map.getLayer(layer)) fn(map, true); });
  }
  /* wildfires */
  var FIRE_URL = "https://cwfis.cfs.nrcan.gc.ca/geoserver/public/ows?service=WFS&version=2.0.0&request=GetFeature" +
    "&typeNames=public:hotspots_last24hrs&outputFormat=application/json&propertyName=lat,lon,rep_date,satellite,frp,agency";
  var fireLoading = null;
  function fireData() {
    var c = K.getStore("fires");
    if (c) return Promise.resolve(c);
    if (!fireLoading) {
      fireLoading = fetch(FIRE_URL).then((r) => { return r.json(); }).then((j) => {
        var rows = (j.features || []).map((f) => {
          var p = f.properties;
          return [p.lon, p.lat, p.rep_date, p.satellite, p.frp, p.agency];
        });
        K.putStore("fires", rows, 30 * 60000);
        fireLoading = null;
        return rows;
      });
      fireLoading.catch(() => { fireLoading = null; });
    }
    return fireLoading;
  }
  function fireApply(map, on) {
    K.vis(map, ["fire-dot"], on);
    if (!on) return;
    fireData().then((rows) => {
      var geo = K.fc(rows.map((r) => {
        return { type: "Feature", properties: { t: r[2], sat: r[3], frp: r[4], ag: r[5] }, geometry: { type: "Point", coordinates: [r[0], r[1]] } };
      }));
      if (map.getSource("fires")) map.getSource("fires").setData(geo);
      else map.addSource("fires", { type: "geojson", data: geo, attribution: 'Fires: <a href="https://cwfis.cfs.nrcan.gc.ca/" target="_blank" rel="noopener">CWFIS (NRCan)</a>' });
      if (!map.getLayer("fire-dot")) {
        map.addLayer({ id: "fire-dot", type: "circle", source: "fires", paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 2.5, 8, 6],
          "circle-color": ["interpolate", ["linear"], ["coalesce", ["get", "frp"], 0], 0, "#ffb000", 50, "#ff5a00", 300, "#d0001a"],
          "circle-stroke-color": "#3a0a00", "circle-stroke-width": 0.6 } }, K.before(map));
      }
      K.vis(map, ["fire-dot"], L.isOn("fires"));
    }).catch(() => {});
  }
  L.add({ id: "fires", name: "Wildfires (24 h)", icon: "🔥", group: "Weather", taps: ["fire-dot"],
    tip: "Satellite fire hotspots, last 24 hours, North America (CWFIS, NRCan)", apply: fireApply,
    attach: (map, on) => {
      idleAdd(map, "fires", "fire-dot", fireApply);
      setInterval(() => { if (L.isOn("fires")) fireApply(map, true); }, 30 * 60000);
      map.on("click", "fire-dot", (e) => {
        var p = e.features[0].properties;
        var t = p.t ? new Date(p.t).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
        K.show(map, e.lngLat, "Fire hotspot", ["Seen " + K.esc(t) + " by " + K.esc(p.sat), p.frp ? "Fire power " + K.esc(p.frp) + " MW" : "", p.ag ? "Agency " + K.esc(p.ag) : ""], ["CWFIS, Natural Resources Canada", "https://cwfis.cfs.nrcan.gc.ca/interactive-map"]);
      });
      fireApply(map, on);
    } });
  /* meteorite falls */
  function metApply(map, on) {
    K.vis(map, ["meteor-dot"], on);
    if (!on) return;
    K.loadJson("data/meteorite-falls.json").then((d) => {
      if (!map.getSource("meteorites")) {
        map.addSource("meteorites", { type: "geojson", attribution: 'Meteorites: <a href="https://www.lpi.usra.edu/meteor/" target="_blank" rel="noopener">Meteoritical Society</a> via NASA', data: K.fc(d.falls.map((f) => {
          return { type: "Feature", properties: { n: f[0], c: f[1], m: f[2], y: f[3] }, geometry: { type: "Point", coordinates: [f[5], f[4]] } };
        })) });
      }
      if (!map.getLayer("meteor-dot")) {
        map.addLayer({ id: "meteor-dot", type: "circle", source: "meteorites", paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 1.8, 8, 5],
          "circle-color": "#b9a2ff", "circle-stroke-color": "#2a1f4d", "circle-stroke-width": 0.7 } }, K.before(map));
      }
      K.vis(map, ["meteor-dot"], L.isOn("meteorites"));
    }).catch(() => {});
  }
  function mass(g) {
    if (g == null) return "";
    return g >= 1000 ? (Math.round(g / 100) / 10) + " kg" : g + " g";
  }
  L.add({ id: "meteorites", name: "Meteorite falls", icon: "🪨", group: "Earth", taps: ["meteor-dot"],
    tip: "Places where a meteorite was seen falling and then found (Meteoritical Society, NASA)", apply: metApply,
    attach: (map, on) => {
      idleAdd(map, "meteorites", "meteor-dot", metApply);
      map.on("click", "meteor-dot", (e) => {
        var p = e.features[0].properties;
        var rec = "https://www.lpi.usra.edu/meteor/metbull.php?sea=" + encodeURIComponent(p.n) + "&srt=name&lrec=50";
        K.show(map, e.lngLat, p.n + " meteorite", ["Seen falling" + (p.y ? " in " + K.esc(p.y) : ""), "Type " + K.esc(p.c),
          p.m != null && p.m !== "null" ? "Found: " + mass(+p.m) : ""], ["Meteoritical Bulletin record", rec]);
      });
      metApply(map, on);
    } });
  /* geology */
  var GEO_IDS = ["geo-fill", "geo-line"];
  function geoApply(map, on) {
    K.vis(map, GEO_IDS, on);
    if (!on) return;
    try {
      if (!map.getSource("geology")) {
        map.addSource("geology", { type: "vector", tiles: ["https://tiles.macrostrat.org/carto-slim/{z}/{x}/{y}.mvt"], minzoom: 5, maxzoom: 12,
          attribution: 'Geology: <a href="https://macrostrat.org/" target="_blank" rel="noopener">Macrostrat</a> (CC BY 4.0)' });
      }
      if (!map.getLayer("geo-fill")) map.addLayer({ id: "geo-fill", type: "fill", source: "geology", "source-layer": "units", minzoom: 5, paint: { "fill-color": ["coalesce", ["get", "color"], "#999"], "fill-opacity": 0.45 } }, K.before(map));
      if (!map.getLayer("geo-line")) map.addLayer({ id: "geo-line", type: "line", source: "geology", "source-layer": "lines", minzoom: 7, paint: { "line-color": "#3b1d0a", "line-width": 0.6, "line-opacity": 0.6 } }, K.before(map));
    } catch (e) {}
    K.vis(map, GEO_IDS, L.isOn("geology"));
  }
  function age(p) {
    if (p.best_age_bottom == null) return "";
    return "Age " + Math.round(p.best_age_top) + "–" + Math.round(p.best_age_bottom) + " million years";
  }
  L.add({ id: "geology", name: "Rock geology", icon: "🗻", group: "Earth", taps: ["geo-fill"], dflt: false,
    tip: "Bedrock geology worldwide (Macrostrat). Zoom in to see it; tap for the rock type",
    note: (map, on) => { return on && map && map.getZoom() < 5 ? "zoom in" : ""; }, apply: geoApply,
    attach: (map, on) => {
      idleAdd(map, "geology", "geo-fill", geoApply);
      map.on("click", "geo-fill", (e) => {
        var p = e.features[0].properties;
        var lines = [K.esc([p.lith_class1, p.lith_type1, p.lith_type2].filter(Boolean).join(", ")), age(p)];
        var mlink = "https://macrostrat.org/map/loc/" + e.lngLat.lng.toFixed(4) + "/" + e.lngLat.lat.toFixed(4);
        K.show(map, e.lngLat, "Bedrock", lines, ["Macrostrat", mlink]);
        var q = "https://macrostrat.org/api/v2/mobile/map_query?lat=" + e.lngLat.lat.toFixed(4) + "&lng=" + e.lngLat.lng.toFixed(4) + "&z=" + Math.round(map.getZoom());
        fetch(q).then((r) => { return r.json(); }).then((j) => {
          var b = j.success && j.success.data && j.success.data.burwell && j.success.data.burwell[0];
          if (!b) return;
          K.show(map, e.lngLat, b.name || "Bedrock", [b.lith ? "Rock: " + K.esc(b.lith) : lines[0], age(p), b.descrip ? K.esc(b.descrip).slice(0, 200) : ""], ["Macrostrat map unit (CC BY 4.0)", mlink]);
        }).catch(() => {});
      });
      geoApply(map, on);
    } });
})();
