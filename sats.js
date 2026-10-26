// workspace/whereisthesun/sats.js
/* SUNNY satellites (opt102). One "Satellites" row in the layers panel folds out (twisty) into
 * classification groups from CelesTrak GP groups. Each group is one TLE file, fetched only when
 * the group is on and kept a day in the Cache API (survives reloads, retried until it loads).
 * Orbits run through satellite.js (MIT). Small groups get ground tracks (10 min back faint,
 * 90 min ahead bright) and a live dot; big groups (Starlink, all active) show light dots only,
 * and the hovered or tapped satellite gets its track. Card: name, height, speed, next pass. */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers;
  if (!K || !L) return;
  var GROUPS = [["stations", "Space stations (ISS, Tiangong)", true, "#ffd34d", 0], ["science", "Major science (Hubble…)", false, "#c08bff", 0],
    ["weather", "Weather", false, "#5ad1ff", 0], ["gnss", "GNSS / GPS", false, "#7fe08a", 0], ["visual", "Brightest / visual", false, "#ffffff", 0],
    ["starlink", "Starlink (big, ~1.5 MB)", false, "#9fb4d9", 1], ["active", "Other active (big, ~2 MB)", false, "#8a93a6", 1]];
  var CACHE = "sunny-tle-v1", DAY = 864e5;
  var map = null, recs = {}, loading = {}, fails = {}, focus = null, hereFix = null;
  var on = () => { return L.isOn("sats"); };
  var gOn = (g) => {
    try { var v = localStorage.getItem("sunny-L-sats-" + g[0]); return v == null ? g[2] : v === "1"; } catch (e) { return g[2]; }
  };
  var url = (g) => { return "https://celestrak.org/NORAD/elements/gp.php?GROUP=" + g + "&FORMAT=tle"; };
  function parse(txt) {
    var l = txt.split(/\r?\n/).map((s) => { return s.trimEnd(); }).filter(Boolean), out = [];
    for (var i = 0; i + 2 < l.length; i += 3) {
      if (!l[i + 2] || l[i + 1][0] !== "1" || l[i + 2][0] !== "2") continue;
      try { out.push({ name: l[i].trim(), id: +l[i + 1].slice(2, 7), rec: window.satellite.twoline2satrec(l[i + 1], l[i + 2]) }); } catch (e) {}
    }
    return out;
  }
  function getTle(g) {
    var u = url(g);
    var c = window.caches ? caches.open(CACHE) : Promise.reject(new Error("no cache"));
    var fresh = () => {
      return fetch(u).then((r) => {
        if (!r.ok) throw new Error(r.status);
        return r.text();
      }).then((t) => {
        if (t.indexOf("\n1 ") < 0) throw new Error("bad tle");
        c.then((ca) => { ca.put(u, new Response(t, { headers: { "x-at": String(Date.now()) } })); }).catch(() => {});
        return t;
      });
    };
    return c.then((ca) => { return ca.match(u); }).catch(() => { return null; }).then((hit) => {
      if (!hit) return fresh();
      var at = +hit.headers.get("x-at") || 0;
      if (Date.now() - at < DAY) return hit.text();
      return fresh().catch(() => { return hit.text(); }); /* stale beats nothing */
    });
  }
  function load(g) {
    if (recs[g[0]] || loading[g[0]] || !window.satellite) return;
    if (fails[g[0]] && Date.now() - fails[g[0]] < 60000) return;
    loading[g[0]] = getTle(g[0]).then((t) => {
      var seen = {};
      GROUPS.forEach((o) => { (recs[o[0]] || []).forEach((s) => { seen[s.id] = 1; }); });
      recs[g[0]] = parse(t).filter((s) => { return !seen[s.id]; });
      delete loading[g[0]];
      draw(true);
    }).catch(() => { fails[g[0]] = Date.now(); delete loading[g[0]]; });
  }
  function geo(rec, d) {
    var sl = window.satellite, pv = sl.propagate(rec, d);
    if (!pv || !pv.position || isNaN(pv.position.x)) return null;
    var gd = sl.eciToGeodetic(pv.position, sl.gstime(d));
    var v = pv.velocity;
    return { lng: sl.degreesLong(gd.longitude), lat: sl.degreesLat(gd.latitude), h: gd.height, v: Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z), eci: pv.position };
  }
  /* track from -10 to +90 min, split at the date line; part 0 = past, 1 = future */
  function track(s, col, now) {
    var out = [], seg = [], part = 0, prev = null;
    var push = () => { if (seg.length > 1) out.push({ type: "Feature", properties: { f: part, c: col, name: s.name }, geometry: { type: "LineString", coordinates: seg } }); };
    for (var m = -10; m <= 90; m += 1) {
      var p = geo(s.rec, new Date(now + m * 60000));
      if (!p) continue;
      var q = [Math.round(p.lng * 1e3) / 1e3, Math.round(p.lat * 1e3) / 1e3];
      if (prev && Math.abs(q[0] - prev[0]) > 180) { push(); seg = []; }
      if (m === 0) { seg.push(q); push(); seg = [q]; part = 1; prev = q; continue; }
      seg.push(q); prev = q;
    }
    push();
    return out;
  }
  function draw(full) {
    if (!map || !on()) return;
    var now = Date.now(), d = new Date(now), pts = [], lines = [];
    GROUPS.forEach((g) => {
      if (!gOn(g)) return;
      if (!recs[g[0]]) { load(g); return; }
      recs[g[0]].forEach((s) => {
        var p = geo(s.rec, d);
        if (!p) return;
        pts.push({ type: "Feature", properties: { name: s.name, id: s.id, g: g[0], c: g[3], big: g[4], type: "Satellite" }, geometry: { type: "Point", coordinates: [p.lng, p.lat] } });
        if (full && (!g[4] || focus === s.id)) lines = lines.concat(track(s, g[3], now));
      });
    });
    try {
      if (!map.getSource("sat-pts")) {
        map.addSource("sat-trk", { type: "geojson", data: K.fc(lines) });
        map.addSource("sat-pts", { type: "geojson", data: K.fc(pts), attribution: 'Orbits: <a href="https://celestrak.org/" target="_blank" rel="noopener">CelesTrak</a>' });
        map.addLayer({ id: "sat-trk", type: "line", source: "sat-trk", layout: { "line-cap": "round" }, paint: { "line-color": ["get", "c"],
          "line-width": ["case", ["==", ["get", "f"], 1], 2, 1.2], "line-opacity": ["case", ["==", ["get", "f"], 1], 0.9, 0.3] } });
        map.addLayer({ id: "sat-dot", type: "circle", source: "sat-pts", paint: { "circle-color": ["get", "c"],
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, ["case", ["==", ["get", "big"], 1], 1.2, 4], 6, ["case", ["==", ["get", "big"], 1], 2.5, 6]],
          "circle-opacity": ["case", ["==", ["get", "big"], 1], 0.55, 1], "circle-stroke-color": "#0b1020", "circle-stroke-width": ["case", ["==", ["get", "big"], 1], 0, 1.5] } });
      } else {
        map.getSource("sat-pts").setData(K.fc(pts));
        if (full) map.getSource("sat-trk").setData(K.fc(lines));
      }
      K.vis(map, ["sat-trk", "sat-dot"], true);
    } catch (e) {}
  }
  function find(id) {
    var r = null;
    GROUPS.forEach((g) => { (recs[g[0]] || []).forEach((s) => { if (s.id === id) r = s; }); });
    return r;
  }
  /* next pass above 10 degrees over the map centre (or GPS fix), next 24 h */
  function nextPass(s) {
    var sl = window.satellite, c = hereFix || map.getCenter();
    var obs = { latitude: c.lat * Math.PI / 180, longitude: c.lng * Math.PI / 180, height: 0.1 };
    var t0 = Date.now();
    for (var t = t0; t < t0 + DAY; t += 30000) {
      var d = new Date(t), pv = sl.propagate(s.rec, d);
      if (!pv || !pv.position) continue;
      var el = sl.ecfToLookAngles(obs, sl.eciToEcf(pv.position, sl.gstime(d))).elevation * 180 / Math.PI;
      if (el > 10) {
        var max = el, tm = t;
        while (el > 10 && tm < t + 1800000) {
          tm += 30000; var p2 = sl.propagate(s.rec, new Date(tm));
          if (!p2 || !p2.position) break;
          el = sl.ecfToLookAngles(obs, sl.eciToEcf(p2.position, sl.gstime(new Date(tm)))).elevation * 180 / Math.PI;
          max = Math.max(max, el);
        }
        return (t - t0 < 60000 ? "Overhead now" : d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })) + ", up to " + Math.round(max) + "° high";
      }
    }
    return "None in the next 24 h";
  }
  function card(id, lngLat) {
    var s = find(id);
    if (!s) return;
    focus = id; draw(true);
    var p = geo(s.rec, new Date());
    K.show(map, lngLat || [p.lng, p.lat], s.name, [p ? Math.round(p.h).toLocaleString() + " km up" : "", p ? "Moving " + p.v.toFixed(1) + " km/s (" + Math.round(p.v * 3600).toLocaleString() + " km/h)" : "",
      "Next pass over " + (hereFix ? "you" : "map centre") + ": " + nextPass(s), "Line: 10 min back (faint), next 90 min (bright)"],
      ["CelesTrak NORAD " + s.id, "https://celestrak.org/satcat/table-satcat.php?CATNR=" + s.id]);
  }
  function apply(m, isOn) {
    if (!map) return;
    if (!isOn) { K.vis(map, ["sat-trk", "sat-dot"], false); return; }
    draw(true);
  }
  L.add({ id: "sats", name: "Satellites", icon: "🛰️", group: "Sky & Space", taps: ["sat-dot"], apply: apply,
    tip: "Live satellites with projected ground tracks, by type (CelesTrak orbits, kept a day)",
    kids: GROUPS.map((g) => { return { id: "sats-" + g[0], name: g[1], dflt: g[2] }; }),
    kidSet: () => { if (map) { if (on()) draw(true); } },
    attach: (m, isOn) => {
      map = m;
      map.on("click", "sat-dot", (e) => { card(e.features[0].properties.id, e.lngLat); });
      map.on("mousemove", "sat-dot", (e) => { var id = e.features[0].properties.id; if (focus !== id && e.features[0].properties.big) { focus = id; draw(true); } });
      map.on("idle", () => { if (on() && !map.getLayer("sat-dot")) draw(true); });
      document.addEventListener("sunny-gps", (ev) => { if (ev.detail) hereFix = ev.detail; });
      var n = 0;
      setInterval(() => { if (on() && !document.hidden) { n++; draw(n % 30 === 0); } }, 2000);
      apply(m, isOn);
    } });
  window.SunnySats = { major: () => { return (recs.stations || []).concat(recs.science || []); }, card: card };
})();
