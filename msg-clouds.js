// workspace/whereisthesun/msg-clouds.js
/* Meteosat (EUMETSAT, 0° view) clouds for Europe, Africa and the Middle East, where GOES sees only the edge.
 * Source: EUMETView WMS msg_fes:clm cloud mask (keyless, CORS open). White cloud stays; land and sea colours are keyed
 * out by cloud-key.js. The layer follows the main cloud layer ("gibs"): same visibility and opacity, drawn just below it.
 * Shows the latest image (a 15-minute slot, refreshed every 30 minutes); it is not part of Play frames. */
(function () {
  "use strict";
  var ID = "msg-clouds", BOUNDS = [-15, -75, 75, 75], slot = "";
  var url = (t) => {
    var u = "https://view.eumetsat.int/geoserver/wms?service=WMS&request=GetMap&version=1.3.0&layers=msg_fes:clm&styles=&crs=EPSG:3857" +
      "&bbox={bbox-epsg-3857}&width=256&height=256&format=image/png&transparent=true&time=" + t;
    return window.SunnyCloudKey ? window.SunnyCloudKey.tileUrl(u) : u;
  };
  var nowSlot = () => { var d = new Date(Math.floor(Date.now() / 900000) * 900000 - 1800000); return d.toISOString().slice(0, 16) + ":00Z"; };
  var below = (map) => { var ls = map.getStyle().layers, a = -1, b = -1; ls.forEach((l, i) => { if (l.id === ID) a = i; if (l.id === "gibs") b = i; }); return a === b - 1; };
  var sync = (map) => {
    var g = map.getLayer("gibs");
    if (!g) { if (map.getLayer(ID)) map.setLayoutProperty(ID, "visibility", "none"); return; }
    var t = nowSlot();
    if (!map.getSource(ID)) {
      slot = t;
      map.addSource(ID, { type: "raster", tiles: [url(t)], bounds: BOUNDS, tileSize: 256, maxzoom: 6, attribution: "Meteosat clouds: EUMETSAT EUMETView" });
    } else if (t !== slot && Date.now() - Date.parse(slot) > 3600000 /* each slot lags 30 min; refresh hourly */) {
      slot = t; var s = map.getSource(ID); if (s.setTiles) s.setTiles([url(t)]);
    }
    if (!map.getLayer(ID)) map.addLayer({ id: ID, type: "raster", source: ID, paint: { "raster-fade-duration": 300 } }, "gibs");
    else if (!below(map)) { try { map.moveLayer(ID, "gibs"); } catch (e) {} }
    var vis = map.getLayoutProperty("gibs", "visibility") || "visible", op = map.getPaintProperty("gibs", "raster-opacity");
    if (map.getLayoutProperty(ID, "visibility") !== vis) map.setLayoutProperty(ID, "visibility", vis);
    if (JSON.stringify(map.getPaintProperty(ID, "raster-opacity")) !== JSON.stringify(op)) map.setPaintProperty(ID, "raster-opacity", op);
  };
  var start = () => {
    var map = window.map;
    if (!map || !map.on) { setTimeout(start, 1000); return; }
    var busy = 0, tick = () => { if (busy) return; busy = 1; setTimeout(() => { busy = 0; try { sync(map); } catch (e) {} }, 400); };
    map.on("idle", tick); map.on("styledata", tick);
  };
  start();
})();
