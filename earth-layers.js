// workspace/whereisthesun/earth-layers.js
/* SUNNY opt94 Earth and fire layers.
 *   Wildfires   Canadian Wildland Fire Information System (NRCan) satellite hotspots from the
 *               last 24 hours, North America, no key (NASA FIRMS needs a key). About 17 KB,
 *               at most once per 30 minutes. Open Government Licence - Canada.
 *   Meteorites  observed meteorite falls, data/met (points + shards from data/meteorite-falls.json), NASA
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
  /* opt99: fire perimeters this season (CWFIS M3 burned areas from satellite hotspots), WMS tiles for the view only */
  var PERIM = "https://cwfis.cfs.nrcan.gc.ca/geoserver/public/wms?service=WMS&version=1.1.1&request=GetMap&layers=public:m3_polygons_current" +
    "&styles=&format=image/png&transparent=true&srs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}";
  function perimAdd(map) {
    if (!map.getSource("fire-perim")) map.addSource("fire-perim", { type: "raster", tiles: [PERIM + "&t=" + Math.floor(Date.now() / 36e5)], tileSize: 256, minzoom: 3,
      attribution: 'Fire perimeters: <a href="https://cwfis.cfs.nrcan.gc.ca/" target="_blank" rel="noopener">CWFIS (NRCan)</a>' });
    if (!map.getLayer("fire-perim")) map.addLayer({ id: "fire-perim", type: "raster", source: "fire-perim", minzoom: 3, paint: { "raster-opacity": 0.8 } }, K.before(map));
  }
  var DAY = 864e5;
  function perimTap(map, e) {
    if (!L.isOn("fires") || map.getZoom() < 3) return;
    if (map.queryRenderedFeatures(e.point).some((f) => { return f.layer && f.layer.id === "fire-dot"; })) return;
    var a = map.unproject([e.point.x - 3, e.point.y + 3]), b = map.unproject([e.point.x + 3, e.point.y - 3]);
    var u = "https://cwfis.cfs.nrcan.gc.ca/geoserver/public/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=public:m3_polygons_current" +
      "&outputFormat=application/json&propertyName=firstdate,lastdate,area,hcount&count=1&bbox=" + [a.lng, a.lat, b.lng, b.lat].map((x) => { return x.toFixed(5); }).join(",") + ",urn:ogc:def:crs:OGC:1.3:CRS84";
    fetch(u).then((r) => { return r.json(); }).then((j) => {
      var f = (j.features || [])[0];
      if (!f) return;
      var p = f.properties, t0 = new Date(p.firstdate), t1 = new Date(p.lastdate);
      var d = (x) => { return x.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }); };
      var days = Math.max(1, Math.round((t1 - t0) / DAY));
      var ago = Math.round((Date.now() - t1) / DAY);
      K.show(map, e.lngLat, "Fire perimeter", ["Burned area mapped from satellite hotspots", "First seen " + K.esc(d(t0)), "Last seen " + K.esc(d(t1)) + (ago > 0 ? " (" + ago + " days ago)" : " (today)"),
        "Burned for about " + days + " day" + (days === 1 ? "" : "s"), p.area != null ? "Area " + Math.round(p.area).toLocaleString() + " ha" : "",
        p.hcount ? K.esc(p.hcount) + " hotspots" : ""], ["CWFIS fire M3 perimeters, NRCan", "https://cwfis.cfs.nrcan.gc.ca/interactive-map"]);
    }).catch(() => {});
  }
  function fireApply(map, on) {
    K.vis(map, ["fire-dot", "fire-perim"], on);
    if (!on) return;
    try { perimAdd(map); } catch (eP) {}
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
      K.vis(map, ["fire-dot", "fire-perim"], L.isOn("fires"));
    }).catch(() => {});
  }
  L.add({ id: "fires", name: "Wildfires", icon: "🔥", group: "Weather", taps: ["fire-dot"],
    tip: "Fire perimeters this season and satellite hotspots from the last 24 hours, North America (CWFIS, NRCan)", apply: fireApply,
    attach: (map, on) => {
      idleAdd(map, "fires", "fire-dot", fireApply);
      setInterval(() => { if (L.isOn("fires")) fireApply(map, true); }, 30 * 60000);
      map.on("click", (e) => { if (!(window.SunnyTapSnap && window.SunnyTapSnap.hit(e))) perimTap(map, e); });
      (window.SunnyHoverName = window.SunnyHoverName || {})["fire-dot"] = (f) => { var p = f.properties;
        var t = p.t ? new Date(p.t).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
        return Promise.resolve(["Fire hotspot" + (t ? ", " + t : ""), (p.frp ? p.frp + " MW fire power · " : "") + (p.sat || "satellite")]); };
      map.on("click", "fire-dot", (e) => {
        var p = e.features[0].properties;
        var t = p.t ? new Date(p.t).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
        K.show(map, e.lngLat, "Fire hotspot", ["Seen " + K.esc(t) + " by " + K.esc(p.sat), p.frp ? "Fire power " + K.esc(p.frp) + " MW" : "", p.ag ? "Agency " + K.esc(p.ag) : ""], ["CWFIS, Natural Resources Canada", "https://cwfis.cfs.nrcan.gc.ca/interactive-map"]);
      });
      fireApply(map, on);
    } });
  /* meteorite falls: tiny points file, detail shard fetched on tap (opt96) */
  var MET = "data/met/falls";
  var metMeta = null;
  function metApply(map, on) {
    K.vis(map, ["meteor-dot"], on);
    if (!on) return;
    K.loadJson(MET + ".p.json?h=opt99").then((d) => {
      metMeta = d;
      if (!map.getSource("meteorites")) {
        map.addSource("meteorites", { type: "geojson", attribution: 'Meteorites: <a href="https://www.lpi.usra.edu/meteor/" target="_blank" rel="noopener">Meteoritical Society</a> via NASA',
          data: K.fc(window.SunnyPoints.toFeatures(d)) });
      }
      if (!map.getLayer("meteor-dot")) {
        map.addLayer({ id: "meteor-dot", type: "circle", source: "meteorites", paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 1.8, 8, 5],
          "circle-color": ["match", ["get", "k"], "found", "#8a7bd0", "#b9a2ff"], "circle-stroke-color": "#2a1f4d", "circle-stroke-width": 0.7 } }, K.before(map));
      }
      K.vis(map, ["meteor-dot"], L.isOn("meteorites"));
    }).catch(() => {});
  }
  function mass(g) {
    if (g == null) return "";
    return g >= 1000 ? (Math.round(g / 100) / 10) + " kg" : g + " g";
  }
  L.add({ id: "meteorites", name: "Meteorites", icon: "🪨", group: "Earth", taps: ["meteor-dot"],
    tip: "Meteorites seen falling, plus finds of 1 kg or more, worldwide (Meteoritical Society, NASA)", apply: metApply,
    attach: (map, on) => {
      idleAdd(map, "meteorites", "meteor-dot", metApply);
      (window.SunnyHoverName = window.SunnyHoverName || {})["meteor-dot"] = (f) => {
        return window.SunnyPoints.detail(MET, metMeta, f.properties.i, "opt99").then((p) => {
          return [p.n + " meteorite", (f.properties.k !== "found" ? "Seen falling" : "Found") + (p.y ? " " + p.y : "")]; });
      };
      map.on("click", "meteor-dot", (e) => {
        var ll = e.features[0].geometry.coordinates;
        var fell = e.features[0].properties.k !== "found";
        var pp = K.show(map, ll, "", [window.SunnyPoints.skeleton("Meteorite fall")], "Meteoritical Bulletin");
        window.SunnyPoints.detail(MET, metMeta, e.features[0].properties.i, "opt99").then((p) => {
          var rec = "https://www.lpi.usra.edu/meteor/metbull.php?sea=" + encodeURIComponent(p.n) + "&srt=name&lrec=50";
                    var yrs = p.y ? new Date().getFullYear() - +p.y : 0;
          if (pp.isOpen()) pp.setHTML(K.card(p.n + " meteorite", [(fell ? "Seen falling" : "Found") + (p.y ? " in " + K.esc(p.y) + (yrs > 0 ? " · " + yrs + " years ago" : "") : ""), "Type " + K.esc(p.c),
            p.m != null && p.m !== "" ? "Found: " + mass(+p.m) : ""], ["Meteoritical Bulletin record", rec]));
        }).catch(() => { if (pp.isOpen()) pp.setHTML(K.card("Meteorite fall", ["Could not load details. Tap again when online."], "Meteoritical Bulletin")); });
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
  /* opt115: rock age, the same Macrostrat tiles coloured by the oldest age of each unit in ICS (International Commission on Stratigraphy) colours */
  var ICS = [["Quaternary", 0, "#f9f97f"], ["Neogene", 2.58, "#ffe619"], ["Paleogene", 23, "#fd9a52"], ["Cretaceous", 66, "#7fc64e"], ["Jurassic", 145, "#34b2c9"],
    ["Triassic", 201, "#812b92"], ["Permian", 252, "#f04028"], ["Carboniferous", 299, "#67a599"], ["Devonian", 359, "#cb8c37"], ["Silurian", 419, "#b3e1b6"],
    ["Ordovician", 444, "#009270"], ["Cambrian", 485, "#7fa056"], ["Proterozoic", 539, "#f73563"], ["Archean", 2500, "#f0047f"], ["Hadean", 4000, "#ae027e"]];
  var icsStep = ["step", ["coalesce", ["get", "best_age_bottom"], 0], ICS[0][2]];
  ICS.slice(1).forEach((c) => { icsStep.push(c[1], c[2]); });
  var icsName = (ma) => { var n = ICS[0][0]; ICS.forEach((c) => { if (ma >= c[1]) n = c[0]; }); return n; };
  function ageApply(map, on) {
    K.vis(map, ["age-fill"], on);
    if (!on) return;
    try {
      if (!map.getSource("geology")) {
        map.addSource("geology", { type: "vector", tiles: ["https://tiles.macrostrat.org/carto-slim/{z}/{x}/{y}.mvt"], minzoom: 5, maxzoom: 12,
          attribution: 'Geology: <a href="https://macrostrat.org/" target="_blank" rel="noopener">Macrostrat</a> (CC BY 4.0)' });
      }
      if (!map.getLayer("age-fill")) map.addLayer({ id: "age-fill", type: "fill", source: "geology", "source-layer": "units", minzoom: 5, paint: { "fill-color": icsStep, "fill-opacity": 0.5 } }, K.before(map));
    } catch (e) {}
    K.vis(map, ["age-fill"], L.isOn("rockage"));
  }
  L.add({ id: "rockage", name: "Rock age", icon: "⏳", group: "Earth", taps: ["age-fill"], dflt: false,
    tip: "Age of the bedrock in ICS colours (Macrostrat). Zoom in to see it; tap for the period",
    legend: K.legKeys(ICS.slice().reverse().map((c) => { return [c[2], "area", c[0] + (c[1] ? ", from " + c[1].toLocaleString() + " Ma" : "")]; })),
    note: (map, on) => { return on && map && map.getZoom() < 5 ? "zoom in" : ""; }, apply: ageApply,
    attach: (map, on) => {
      idleAdd(map, "rockage", "age-fill", ageApply);
      map.on("click", "age-fill", (e) => {
        var p = e.features[0].properties;
        K.show(map, e.lngLat, icsName(+p.best_age_bottom || 0) + " rock", [age(p), K.esc([p.lith_class1, p.lith_type1].filter(Boolean).join(", "))],
          ["Macrostrat (CC BY 4.0)", "https://macrostrat.org/map/loc/" + e.lngLat.lng.toFixed(4) + "/" + e.lngLat.lat.toFixed(4)]);
      });
      ageApply(map, on);
    } });
  /* opt115: cratons, the ancient cores of the continents (Archean basement, older than 2.5 Ga). Hasterok et al. 2022, GPL-3.0, 34 KB gzipped */
  var CR_SRC = ["Hasterok et al. 2022, global_tectonics", "https://github.com/dhasterok/global_tectonics"];
  function cratonApply(map, on) {
    K.vis(map, ["craton-fill", "craton-line"], on);
    if (!on) return;
    K.loadJson("data/world/cratons.geo.json").then((g) => {
      if (!map.getSource("cratons")) map.addSource("cratons", { type: "geojson", data: g,
        attribution: 'Cratons: <a href="' + CR_SRC[1] + '" target="_blank" rel="noopener">Hasterok et al. 2022</a>' });
      if (!map.getLayer("craton-fill")) map.addLayer({ id: "craton-fill", type: "fill", source: "cratons", paint: {
        "fill-color": ["match", ["get", "w"], 1, "#c98bdb", "#f0047f"], "fill-opacity": 0.22 } }, K.before(map));
      if (!map.getLayer("craton-line")) map.addLayer({ id: "craton-line", type: "line", source: "cratons", paint: {
        "line-color": ["match", ["get", "w"], 1, "#c98bdb", "#f0047f"], "line-width": 1, "line-opacity": 0.8 } }, K.before(map));
      K.vis(map, ["craton-fill", "craton-line"], L.isOn("cratons"));
    }).catch(() => {});
  }
  L.add({ id: "cratons", name: "Cratons", icon: "🪨", group: "Earth", taps: ["craton-fill"], dflt: true,
    tip: "The oldest cores of the continents, with Archean basement older than 2.5 billion years (Hasterok et al. 2022)",
    legend: K.legKeys([["#f0047f", "area", "craton, older than 2.5 Ga"], ["#c98bdb", "area", "Archean basement, reworked later"]]), apply: cratonApply,
    attach: (map, on) => {
      idleAdd(map, "cratons", "craton-fill", cratonApply);
      map.on("click", "craton-fill", (e) => {
        var p = e.features[0].properties;
        K.show(map, e.lngLat, p.n, ["Age: older than 2.5 Ga (Archean)", K.esc(p.t ? p.t.charAt(0).toUpperCase() + p.t.slice(1) : "") + (p.c ? " · " + K.esc(p.c) : ""),
          p.w ? "Reworked later" + (p.o && p.o !== "cratonic" ? " (" + K.esc(p.o) + ")" : "") : "Stable since the Archean"], CR_SRC);
      });
      cratonApply(map, on);
    } });
})();
