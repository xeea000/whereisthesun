// workspace/whereisthesun/ships.js
/* SUNNY ships (t388u): live AIS positions from Digitraffic (Fintraffic, Finland), free, no key, CC BY 4.0.
 * Coverage is Finnish waters and the nearby Baltic only: no free keyless AIS feed covers Canada or the open ocean.
 * The whole feed is about 1,100 ships and 45 KB, so every zoom shows every ship; refreshed each minute while on
 * (every 5 minutes with Low data). Tap a ship for its name, type and destination (one small request). */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers;
  if (!K || !L) return;
  var API = "https://meri.digitraffic.fi/api/ais/v1/", HDR = { headers: { "Digitraffic-User": "SUNNY/whereisthesun" } };
  var ID = "ship-dot", map = null, timer = null, last = 0;
  var COL = { move: "#1565c0", still: "#9e9e9e" };
  var SRC = ["Digitraffic marine AIS (Fintraffic, CC BY 4.0)", "https://www.digitraffic.fi/en/marine-traffic/"];
  /* AIS ship type codes, first digit groups */
  var typeName = (t) => {
    if (t === 30) return "Fishing"; if (t === 31 || t === 32 || t === 52) return "Tug or towing"; if (t === 35) return "Military";
    if (t === 36) return "Sailing"; if (t === 37) return "Pleasure craft"; if (t === 50) return "Pilot boat"; if (t === 51) return "Search and rescue";
    var g = Math.floor(t / 10);
    return { 4: "High-speed craft", 6: "Passenger ship", 7: "Cargo ship", 8: "Tanker" }[g] || "Other or unknown type";
  };
  var every = () => { return window.SunnyDataSaver && window.SunnyDataSaver.low() ? 300000 : 60000; };
  var load = () => {
    if (Date.now() - last < every() - 1000 && map.getSource(ID)) return;
    last = Date.now();
    fetch(API + "locations", HDR).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((j) => {
      var f = (j.features || []).map((x) => { var p = x.properties;
        return { type: "Feature", properties: { m: p.mmsi, sog: p.sog, cog: p.cog, t: p.timestampExternal, mv: p.sog > 0.5 ? 1 : 0 }, geometry: x.geometry }; });
      if (!L.isOn("ships")) return;
      if (map.getSource(ID)) { map.getSource(ID).setData(K.fc(f)); return; }
      map.addSource(ID, { type: "geojson", data: K.fc(f), attribution: 'Ships: <a href="' + SRC[1] + '" target="_blank" rel="noopener">Digitraffic (Fintraffic)</a>' });
      map.addLayer({ id: ID, type: "circle", source: ID, paint: {
        "circle-radius": K.markerScale.bind(map, ID, "circle-radius", K.size({ stops: [[2, 2], [8, 4], [14, 6]] })),
        "circle-color": ["case", ["==", ["get", "mv"], 1], COL.move, COL.still], "circle-stroke-color": "#fff", "circle-stroke-width": 0.8 } });
      K.vis(map, [ID], L.isOn("ships"));
    }).catch(() => { last = 0; });
  };
  var apply = (m, on) => {
    map = m;
    clearInterval(timer); timer = null;
    K.vis(map, [ID], on);
    if (!on) return;
    load();
    timer = setInterval(load, 30000);
  };
  var card = (e) => {
    var p = e.features[0].properties, ll = e.features[0].geometry.coordinates;
    var seen = new Date(p.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    var move = p.sog > 0.5 ? "Moving " + (+p.sog).toFixed(1) + " knots (nautical miles per hour), course " + Math.round(p.cog) + "°" : "Stopped or moored";
    var pp = K.show(map, ll, "Ship " + p.m, [move, "Position at " + seen], SRC);
    fetch(API + "vessels/" + p.m, HDR).then((r) => { return r.ok ? r.json() : null; }).then((v) => {
      if (!v || !pp.isOpen()) return;
      pp.setHTML(K.card(K.esc(v.name || "Ship " + p.m), [typeName(v.shipType), move, v.destination ? "Heading for " + K.esc(v.destination) : "",
        "Position at " + seen, "MMSI " + p.m], SRC));
    }).catch(() => {});
  };
  L.add({ id: "ships", name: "Ships (live, Finnish waters)", icon: "🚢", group: "Ocean", taps: [ID], apply: apply,
    tip: "Live ship positions from AIS, Finnish waters and the nearby Baltic only (Digitraffic, free). No free keyless feed covers Canada " +
      "or the open ocean, so ships elsewhere are not shown. Refreshed each minute",
    legend: K.legKeys([[COL.move, "dot", "Moving (over half a knot)"], [COL.still, "dot", "Stopped or moored"]]) +
      '<div class="ls-row"><small>Coverage: Finland and the nearby Baltic only</small></div>',
    attach: (m, on) => {
      map = m;
      map.on("click", ID, card);
      (window.SunnyHoverName = window.SunnyHoverName || {})[ID] = (f) => {
        return Promise.resolve(["Ship " + f.properties.m, f.properties.mv ? (+f.properties.sog).toFixed(1) + " knots" : "stopped"]); };
      map.on("idle", () => { if (L.isOn("ships") && !map.getLayer(ID)) load(); });
      apply(m, on);
    } });
})();
