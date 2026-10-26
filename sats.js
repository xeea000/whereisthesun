// workspace/whereisthesun/sats.js
/* SUNNY satellites (opt102). One "Satellites" row in the layers panel folds out (twisty) into
 * classification groups from CelesTrak GP groups. Each group is one TLE file, fetched only when
 * the group is on and kept a day in the Cache API (survives reloads, retried until it loads).
 * Orbits run through satellite.js (MIT). Small groups get ground tracks (10 min back faint,
 * 90 min ahead bright) and a live dot; big groups (Starlink, all active) show light dots only,
 * and the hovered or tapped satellite gets its track. Card: name, height, speed, next pass.
 * opt107: dots are coloured by standard magnitude (McCants quicksat.mag, data/sats/mag.json; grey = unknown) and
 * drawn dim while in Earth's shadow. Cards give the estimated magnitude for the map centre or GPS fix.
 * Crewed craft (static crew list with its date, no live keyless https source) and major objects get a star icon. */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers;
  if (!K || !L) return;
  var GROUPS = [["crewed", "Crewed", true, "#ffd34d", 0], ["stations", "Space stations (ISS, Tiangong)", true, "#ffd34d", 0], ["science", "Major science (Hubble…)", false, "#c08bff", 0],
    ["weather", "Weather", false, "#5ad1ff", 0], ["gnss", "GNSS / GPS", false, "#7fe08a", 0], ["visual", "Visible to the naked eye", false, "#ffffff", 0],
    ["starlink", "Starlink (big, ~1.5 MB)", false, "#9fb4d9", 1], ["active", "Other active (big, ~2 MB)", false, "#8a93a6", 1]];
  var CACHE = "sunny-tle-v1", DAY = 864e5;
  /* Crew on board as of 2026-10-25 (orbitnight.com / The Space Devs Launch Library 2). Visiting ships list their station. */
  var CREW_AT = "25 Oct 2026";
  var CREW = { 25544: ["ISS", ["Pyotr Dubrov", "Anna Kikina", "Anil Menon", "Jessica Watkins", "Luke Delaney", "Joshua Kutryk", "Sergey Teteryatnikov"]],
    48274: ["Tiangong", ["Zhu Yangzhu", "Zhang Zhiyuan", "Lai Ka-ying"]] };
  var CREWED = /^(ISS \(ZARYA\)|CSS \(TIANHE\)|SHENZHOU|SOYUZ-MS|CREW DRAGON|DRAGON CREW|STARLINER)/;
  /* major objects: star icon, sized by rough length in metres */
  var MAJOR = { 25544: 109, 48274: 55, 20580: 13 };
  var MAG = null, magLoad = null;
  var sizeOf = (s) => { return MAJOR[s.id] || (CREWED.test(s.name) ? 10 : 0); };
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
    if (!magLoad) magLoad = K.loadJson("data/sats/mag.json").then((m) => { MAG = m; draw(true); }).catch(() => { magLoad = null; });
    if (g[0] === "crewed") return load(GROUPS[1]);
    if (recs[g[0]] || loading[g[0]] || !window.satellite) return;
    if (fails[g[0]] && Date.now() - fails[g[0]] < 60000) return;
    loading[g[0]] = getTle(g[0]).then((t) => {
      var seen = {};
      GROUPS.forEach((o) => { (recs[o[0]] || []).forEach((s) => { seen[s.id] = 1; }); });
      var all = parse(t).filter((s) => { return !seen[s.id]; });
      if (g[0] === "stations") { recs.crewed = all.filter((s) => { return CREWED.test(s.name); }); all = all.filter((s) => { return !CREWED.test(s.name); }); }
      recs[g[0]] = all;
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
  /* low-precision sun direction (unit vector, ECI), good to about 1 degree */
  function sun(d) {
    var n = d / 864e5 - 10957.5, L0 = (280.46 + 0.9856474 * n) * Math.PI / 180, g = (357.528 + 0.9856003 * n) * Math.PI / 180;
    var lam = L0 + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * Math.PI / 180, e = (23.439 - 4e-7 * n) * Math.PI / 180;
    return { x: Math.cos(lam), y: Math.cos(e) * Math.sin(lam), z: Math.sin(e) * Math.sin(lam) };
  }
  var dot = (a, b) => { return a.x * b.x + a.y * b.y + a.z * b.z; };
  function lit(r, su) {
    var k = dot(r, su);
    if (k > 0) return true;
    var px = r.x - k * su.x, py = r.y - k * su.y, pz = r.z - k * su.z;
    return Math.sqrt(px * px + py * py + pz * pz) > 6371;
  }
  /* estimated magnitude for the observer: standard mag at 1000 km, half lit, scaled by range and phase */
  function bright(s, d) {
    var sl = window.satellite, m0 = MAG ? MAG[s.id] : undefined;
    if (m0 == null) return { txt: "unknown (no magnitude on record)" };
    var c = hereFix || map.getCenter(), pv = sl.propagate(s.rec, d);
    if (!pv || !pv.position) return { txt: "unknown" };
    var gm = sl.gstime(d), obs = { latitude: c.lat * Math.PI / 180, longitude: c.lng * Math.PI / 180, height: 0.1 };
    var la = sl.ecfToLookAngles(obs, sl.eciToEcf(pv.position, gm)), su = sun(d), oe = sl.ecfToEci(sl.geodeticToEcf(obs), gm);
    var sunEl = Math.asin(dot(su, oe) / Math.sqrt(dot(oe, oe))) * 180 / Math.PI;
    var std = "standard mag " + m0.toFixed(1);
    if (la.elevation < 0) return { txt: std + " (not visible now: below the horizon)" };
    if (!lit(pv.position, su)) return { txt: std + " (not visible now: in Earth's shadow)" };
    var v = { x: oe.x - pv.position.x, y: oe.y - pv.position.y, z: oe.z - pv.position.z }, r = Math.sqrt(dot(v, v));
    var ph = Math.acos(Math.max(-1, Math.min(1, dot(su, v) / r))), F = (Math.sin(ph) + (Math.PI - ph) * Math.cos(ph)) / Math.PI;
    var m = m0 + 5 * Math.log10(r / 1000) - 2.5 * Math.log10(Math.max(1e-3, F * Math.PI));
    var how = sunEl > -6 ? "not visible now: daylight" : m <= 4.5 ? "visible to the naked eye" : m <= 7.5 ? "binoculars" : "not visible now: too faint";
    return { txt: "mag " + m.toFixed(1) + " (" + how + ")" };
  }
  var MCOL = ["interpolate", ["linear"], ["get", "m"], -4, "#ffffff", -2, "#fff3a0", 0, "#ffd34d", 2, "#ff9a3c", 4, "#d0587a", 6, "#6a5acd"];
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
    var now = Date.now(), d = new Date(now), pts = [], lines = [], su = sun(d), got = {};
    GROUPS.forEach((g) => {
      if (!gOn(g)) return;
      if (!recs[g[0]]) { load(g); return; }
      recs[g[0]].forEach((s) => {
        if (got[s.id]) return; /* a satellite in two groups is drawn once */
        got[s.id] = 1;
        var p = geo(s.rec, d);
        if (!p) return;
        var mg = MAG ? MAG[s.id] : undefined, z = sizeOf(s), cr = CREW[s.id];
        pts.push({ type: "Feature", properties: { name: s.name, id: s.id, g: g[0], c: g[3], big: g[4], type: "Satellite", m: mg == null ? 99 : mg,
          lit: lit(p.eci, su) ? 1 : 0, star: z ? 1 : 0, sz: cr ? 0.5 + cr[1].length * 0.09 : z ? 0.45 + Math.sqrt(z) * 0.04 : 0 },
          geometry: { type: "Point", coordinates: [p.lng, p.lat] } });
        if (full && (!g[4] || focus === s.id)) lines = lines.concat(track(s, g[3], now));
      });
    });
    try {
      if (!map.getSource("sat-pts")) {
        map.addSource("sat-trk", { type: "geojson", data: K.fc(lines) });
        map.addSource("sat-pts", { type: "geojson", data: K.fc(pts), attribution: 'Orbits: <a href="https://celestrak.org/" target="_blank" rel="noopener">CelesTrak</a>' });
        map.addLayer({ id: "sat-trk", type: "line", source: "sat-trk", layout: { "line-cap": "round" }, paint: { "line-color": ["get", "c"],
          "line-width": ["case", ["==", ["get", "f"], 1], 2, 1.2], "line-opacity": ["case", ["==", ["get", "f"], 1], 0.9, 0.3] } });
        starImg();
        map.addLayer({ id: "sat-dot", type: "circle", source: "sat-pts", filter: ["!=", ["get", "star"], 1], paint: { "circle-color": ["case", ["==", ["get", "m"], 99], "#7d8596", MCOL],
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, ["case", ["==", ["get", "big"], 1], 1.2, 4], 6, ["case", ["==", ["get", "big"], 1], 2.5, 6]],
          "circle-opacity": ["case", ["==", ["get", "lit"], 0], 0.3, ["==", ["get", "big"], 1], 0.55, 1],
          "circle-stroke-color": "#0b1020", "circle-stroke-width": ["case", ["==", ["get", "big"], 1], 0, 1.5] } });
        map.addLayer({ id: "sat-star", type: "symbol", source: "sat-pts", filter: ["==", ["get", "star"], 1],
          layout: { "icon-image": "sat-star", "icon-size": ["get", "sz"], "icon-allow-overlap": true, "icon-ignore-placement": true },
          paint: { "icon-color": ["case", ["==", ["get", "m"], 99], "#ffd34d", MCOL], "icon-opacity": ["case", ["==", ["get", "lit"], 0], 0.45, 1] } });
      } else {
        map.getSource("sat-pts").setData(K.fc(pts));
        if (full) map.getSource("sat-trk").setData(K.fc(lines));
      }
      K.vis(map, ["sat-trk", "sat-dot", "sat-star"], true);
    } catch (e) {}
  }
  /* a white star drawn once as an SDF icon, so its colour follows the brightness ramp */
  function starImg() {
    if (map.hasImage("sat-star")) return;
    var n = 48, cv = document.createElement("canvas"); cv.width = cv.height = n;
    var x = cv.getContext("2d"); x.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 9 : 22; x.lineTo(n / 2 + r * Math.cos(a), n / 2 + r * Math.sin(a)); }
    x.closePath(); x.fillStyle = "#fff"; x.fill(); x.lineWidth = 2; x.strokeStyle = "#0b1020"; x.stroke();
    map.addImage("sat-star", x.getImageData(0, 0, n, n), { sdf: true });
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
    var p = geo(s.rec, new Date()), cr = CREW[s.id];
    var crew = cr ? "Crew " + cr[1].length + ": " + cr[1].join(", ") + " (as of " + CREW_AT + ")" :
      CREWED.test(s.name) ? "Crewed ship; its crew is counted on the station it visits" : "";
    K.show(map, lngLat || [p.lng, p.lat], s.name, [crew, MAJOR[s.id] ? "Major object, about " + MAJOR[s.id] + " m across" : "",
      "Brightness: " + bright(s, new Date()).txt, p ? Math.round(p.h).toLocaleString() + " km up" : "", p ? "Moving " + p.v.toFixed(1) + " km/s (" + Math.round(p.v * 3600).toLocaleString() + " km/h)" : "",
      "Next pass over " + (hereFix ? "you" : "map centre") + ": " + nextPass(s), "Line: 10 min back (faint), next 90 min (bright)"],
      ["CelesTrak NORAD " + s.id, "https://celestrak.org/satcat/table-satcat.php?CATNR=" + s.id]);
  }
  function apply(m, isOn) {
    if (!map) return;
    if (!isOn) { K.vis(map, ["sat-trk", "sat-dot", "sat-star"], false); return; }
    draw(true);
  }
  var LEGEND = '<div class="sat-leg"><div class="sat-ramp"></div><div class="sat-rl"><span>faint +6</span><span>mag</span><span>-4 bright</span></div>' +
    '<div>Grey = magnitude unknown · dim = in Earth\'s shadow</div><div>★ = crewed or major object; bigger star = more crew (crewed) or bigger craft</div></div>';
  L.add({ id: "sats", name: "Satellites", icon: "🛰️", group: "Sky & Space", taps: ["sat-dot", "sat-star"], apply: apply,
    tip: "Live satellites with projected ground tracks, by type (CelesTrak orbits, kept a day)",
    kids: GROUPS.map((g) => { return { id: "sats-" + g[0], name: g[1], dflt: g[2] }; }), legend: LEGEND,
    kidSet: () => { if (map) { if (on()) draw(true); } },
    attach: (m, isOn) => {
      map = m;
      var prev = window.SunnyHoverExt; /* hover label adds the brightness */
      window.SunnyHoverExt = (f, upd) => {
        var id = f.layer && f.layer.id;
        if (id !== "sat-dot" && id !== "sat-star") return prev ? prev(f, upd) : null;
        var s = find(f.properties.id);
        return s ? "<b>" + K.esc(s.name) + "</b><br><small>Brightness: " + K.esc(bright(s, new Date()).txt) + "</small>" : null;
      };
      var tapAt = 0; /* the star (crewed or major) wins over a docked ship under it */
      map.on("click", "sat-star", (e) => { tapAt = Date.now(); card(e.features[0].properties.id, e.lngLat); });
      map.on("click", "sat-dot", (e) => { if (Date.now() - tapAt > 300) card(e.features[0].properties.id, e.lngLat); });
      map.on("mousemove", "sat-dot", (e) => { var id = e.features[0].properties.id; if (focus !== id && e.features[0].properties.big) { focus = id; draw(true); } });
      map.on("idle", () => { if (on() && !map.getLayer("sat-dot")) draw(true); });
      document.addEventListener("sunny-gps", (ev) => { if (ev.detail) hereFix = ev.detail; });
      var n = 0;
      setInterval(() => { if (on() && !document.hidden) { n++; draw(n % 30 === 0); } }, 2000);
      apply(m, isOn);
    } });
  const majorAll = () => { return (recs.crewed || []).concat(recs.stations || [], recs.science || []); };
  window.SunnySats = { major: majorAll, card: card, bright: (s) => { return bright(s, new Date()).txt; } };
})();
