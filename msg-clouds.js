// workspace/whereisthesun/msg-clouds.js
/* Meteosat (EUMETSAT, 0° view) clouds for Europe, Africa and the Middle East, where GOES sees only the edge.
 * Source: EUMETView WMS msg_fes:clm cloud mask (keyless, CORS open). White cloud stays; land and sea colours are keyed
 * out by cloud-key.js. The layer follows the main cloud layer ("gibs"): same visibility and opacity, drawn just below it.
 * Shows the latest image (a 15-minute slot, refreshed hourly); it is not part of Play frames. */
(function () {
  "use strict";
  var ID = "msg-clouds", BOUNDS = [-20, -75, 75, 75], slot = "";
  var url = (t) => {
    var u = "https://view.eumetsat.int/geoserver/wms?service=WMS&request=GetMap&version=1.3.0&layers=msg_fes:clm&styles=&crs=EPSG:3857" +
      "&bbox={bbox-epsg-3857}&width=256&height=256&format=image/png&transparent=true&time=" + t;
    return window.SunnyCloudKey ? window.SunnyCloudKey.tileUrl(u) : u;
  };
  var nowSlot = () => { var d = new Date(Math.floor(Date.now() / 900000) * 900000 - 1800000); return d.toISOString().slice(0, 16) + ":00Z"; };
  var parents = ["iem-vis", "vis-fill-east", "vis-fill-west", "gibs"];
  var beforeId = (map) => {
    if (map.getLayer("iem-vis")) return "iem-vis";
    if (map.getLayer("vis-fill-east")) return "vis-fill-east";
    if (map.getLayer("gibs")) return "gibs";
    return undefined;
  };
  var parentPaint = (map) => {
    var vis = "none", op = 0, i, id, v, o;
    for (i = 0; i < parents.length; i++) {
      id = parents[i];
      if (!map.getLayer(id)) continue;
      try { v = map.getLayoutProperty(id, "visibility") || "visible"; } catch (eV) { v = "none"; }
      try { o = map.getPaintProperty(id, "raster-opacity"); } catch (eO) { o = 0; }
      if (v !== "none" && o) { vis = "visible"; op = o; break; }
    }
    return { vis: vis, op: op };
  };
  var below = (map) => {
    var ls = map.getStyle().layers, a = -1, b = -1, bid = beforeId(map);
    ls.forEach((l, i) => { if (l.id === ID) a = i; if (l.id === bid) b = i; });
    return bid && a === b - 1;
  };
  var sync = (map) => {
    var paint = parentPaint(map);
    if (paint.vis === "none" && !map.getLayer("gibs") && !map.getLayer("iem-vis") && !map.getLayer("vis-fill-east")) {
      if (map.getLayer(ID)) map.setLayoutProperty(ID, "visibility", "none");
      return;
    }
    var t = nowSlot();
    var before = beforeId(map);
    if (!map.getSource(ID)) {
      slot = t;
      map.addSource(ID, K.overzoom({ type: "raster", tiles: [url(t)], bounds: BOUNDS, tileSize: 256, attribution: "Meteosat clouds: EUMETSAT EUMETView" }, 6));
    } else if (t !== slot && Date.now() - Date.parse(slot) > 3600000 /* each slot lags 30 min; refresh hourly */) {
      slot = t; var s = map.getSource(ID); if (s.setTiles) s.setTiles([url(t)]);
    }
    if (!map.getLayer(ID)) { map.addLayer({ id: ID, type: "raster", source: ID, paint: { "raster-fade-duration": 300 } }, before); K.uncapped(map, [ID]); }
    else if (!below(map)) { try { map.moveLayer(ID, before); } catch (e) {} }
    if (map.getLayoutProperty(ID, "visibility") !== paint.vis) map.setLayoutProperty(ID, "visibility", paint.vis);
    if (JSON.stringify(map.getPaintProperty(ID, "raster-opacity")) !== JSON.stringify(paint.op)) map.setPaintProperty(ID, "raster-opacity", paint.op);
  };
  var start = () => {
    var map = window.map;
    if (!map || !map.on) { setTimeout(start, 1000); return; }
    setInterval(() => { try { sync(map); } catch (e) {} }, 2000); /* the map rarely goes idle while clouds animate */
  };
  start();
})();
