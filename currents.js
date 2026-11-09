// workspace/whereisthesun/currents.js
/* SUNNY ocean currents (t388u), the "Currents" kid of Water temperature: surface current arrows on a grid over the view
 * from Open-Meteo Marine (free, no key; ocean model at about 8 km). Arrows point the way the water flows; colour = speed.
 * One request for the whole grid (squares at least 45 px apart, at most 80 points), kept an hour per square; land gives no arrow. */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers;
  if (!K || !L) return;
  var KID = "watertemp-cur", ID = "cur-line", R = Math.PI / 180, map = null, key = "", store = {}, run = 0;
  var STOPS = [[0, "#9ecae1"], [0.5, "#4292c6"], [1.5, "#08519c"], [3, "#f03b20"]];
  var on = () => { return K.kids.layerOn(L.isOn("watertemp"), KID, true); };
  var compass = (az) => { return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(((az % 360) + 360) % 360 / 45) % 8]; };
  /* grid step: the first of these that puts squares at least 45 px apart on screen */
  var STEPS = [0.25, 0.5, 1, 2, 5, 10, 20];
  var step = () => {
    var px = 360 / (512 * Math.pow(2, map.getZoom()));
    for (var i = 0; i < STEPS.length; i++) if (STEPS[i] / px >= 45) return STEPS[i];
    return 20;
  };
  var arrow = (c, v, dir, d) => {
    var len = d * 0.42 * Math.min(1, 0.35 + v / 2), k = 1 / Math.max(0.2, Math.cos(c[1] * R));
    var dx = Math.sin(dir * R) * len * k, dy = Math.cos(dir * R) * len;
    var tip = [c[0] + dx / 2, c[1] + dy / 2], tail = [c[0] - dx / 2, c[1] - dy / 2];
    var head = (a) => { return [tip[0] + Math.sin((dir + a) * R) * len * 0.35 * k, tip[1] + Math.cos((dir + a) * R) * len * 0.35]; };
    return [[tail, tip], [head(150), tip, head(-150)]];
  };
  var cells = () => {
    var b = map.getBounds(), d = step();
    var w = Math.max(-180, Math.floor(b.getWest() / d) * d), e = Math.min(180, Math.ceil(b.getEast() / d) * d);
    var s = Math.max(-75, Math.floor(b.getSouth() / d) * d), n = Math.min(80, Math.ceil(b.getNorth() / d) * d);
    while ((e - w) / d * ((n - s) / d) > 80) d *= 2;
    w = Math.floor(w / d) * d; s = Math.floor(s / d) * d;
    var out = [];
    for (var x = w; x < e; x += d) for (var y = s; y < n; y += d) out.push({ k: d + ":" + x + ":" + y, lng: x + d / 2, lat: y + d / 2, d: d });
    return { list: out, key: [w, s, e, n, d].join(",") };
  };
  var fetchCells = (need) => {
    if (!need.length) return Promise.resolve();
    return fetch("https://marine-api.open-meteo.com/v1/marine?latitude=" + need.map((c) => { return c.lat.toFixed(2); }).join(",") +
      "&longitude=" + need.map((c) => { return c.lng.toFixed(2); }).join(",") + "&current=ocean_current_velocity,ocean_current_direction")
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((j) => {
        var arr = Array.isArray(j) ? j : [j], t = Date.now();
        need.forEach((c, i) => {
          var cu = (arr[i] && arr[i].current) || {};
          var v = cu.ocean_current_velocity, dir = cu.ocean_current_direction;
          store[c.k] = { t: t, v: v == null ? null : v, dir: dir == null ? null : dir };
        });
      });
  };
  var draw = () => {
    if (!map) return;
    if (!on()) { K.vis(map, [ID], false); key = ""; return; }
    var g = cells();
    if (g.key === key && map.getLayer(ID)) { K.vis(map, [ID], true); return; }
    key = g.key;
    var r = ++run, need = g.list.filter((c) => { var x = store[c.k]; return !x || Date.now() - x.t > 36e5; });
    fetchCells(need).then(() => {
      if (r !== run) return;
      var f = [];
      g.list.forEach((c) => {
        var x = store[c.k];
        if (x && x.v != null && x.dir != null) f.push({ type: "Feature", properties: { v: x.v, dir: x.dir },
          geometry: { type: "MultiLineString", coordinates: arrow([c.lng, c.lat], x.v, x.dir, c.d) } });
      });
      try {
        if (map.getSource(ID)) map.getSource(ID).setData(K.fc(f));
        else {
          map.addSource(ID, { type: "geojson", data: K.fc(f),
            attribution: 'Currents: <a href="https://open-meteo.com/en/docs/marine-weather-api" target="_blank" rel="noopener">Open-Meteo Marine</a>' });
          map.addLayer({ id: ID, type: "line", source: ID, layout: { "line-cap": "round", "line-join": "round" }, paint: {
            "line-color": ["interpolate", ["linear"], ["get", "v"]].concat([].concat.apply([], STOPS)), "line-width": 2 } });
        }
        K.vis(map, [ID], on());
      } catch (e) { key = ""; }
    }).catch(() => { key = ""; });
  };
  var text = (p) => {
    return "Current " + (+p.v).toFixed(1) + " kilometres per hour, flowing towards the " + compass(p.dir) + " (" + Math.round(p.dir) + "°)";
  };
  window.SunnyCurrents = { on: on, draw: draw, text: text, stops: STOPS };
  L.add({ id: "currents-attach", group: "none", taps: [ID], attach: (m) => {
    map = m;
    map.on("moveend", () => { setTimeout(draw, 400); });
    map.on("click", ID, (e) => { K.show(map, e.lngLat, "Ocean current", [text(e.features[0].properties), "Surface current at the middle of the arrow, model forecast for now"],
      ["Open-Meteo Marine", "https://open-meteo.com/en/docs/marine-weather-api"]); });
    (window.SunnyHoverName = window.SunnyHoverName || {})[ID] = (f) => { return Promise.resolve(["Ocean current", text(f.properties)]); };
    draw();
  } });
})();
