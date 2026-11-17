// workspace/whereisthesun/area-wx.js
/* SUNNY area forecast (t420u). The weather service is asked for a coarse grid, never for each beach:
 * nodes every 0.25 degrees (about 25 km) around the places on screen, all missing nodes in one Open-Meteo
 * request (up to 100 nodes each), cached 30 minutes. A place gets its hourly cloud by bilinear blending of
 * the four nodes around it, or the nearest loaded node within 30 km. Weather code comes from the nearest node.
 * Sun height, day or night and a clear-sky UV estimate come from SunCalc at the place itself, so they need
 * no request. Busy answers (429, 5xx) wait for Retry-After or 2, 6 then 15 s and try again; a node already
 * asked for is never asked twice at once.
 *   SunnyAreaWx.need(points) loads the nodes (resolves to how many it asked for); .at(lat, lon) gives { start, cl, code, km } or null;
 *   .hourly(lat, lon) gives an Open-Meteo shaped answer with area: true; .current(lat, lon) gives cloud, uv, isDay;
 *   .stats() counts requests. */
(() => {
  "use strict";
  var API = "https://api.open-meteo.com/v1/forecast";
  var STEP = 0.25, TTL = 30 * 60000, MAX = 100, NEAR_KM = 30;
  var WAITS = [2000, 6000, 15000];
  var nodes = {}, flying = {}, count = { requests: 0, retries: 0, failed: 0 };
  var key = (la, lo) => la.toFixed(2) + "," + lo.toFixed(2);
  var fresh = (k) => nodes[k] && Date.now() - nodes[k].t < TTL;
  var corners = (lat, lon) => {
    var a = Math.floor(lat / STEP) * STEP, o = Math.floor(lon / STEP) * STEP;
    return [[a, o], [a, o + STEP], [a + STEP, o], [a + STEP, o + STEP]];
  };
  var sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
  var ask = (list, tries) => {
    var u = API + "?latitude=" + list.map((n) => n[0].toFixed(2)).join(",") + "&longitude=" + list.map((n) => n[1].toFixed(2)).join(",") +
      "&hourly=cloud_cover,weather_code&forecast_hours=48&past_hours=1&timezone=GMT&timeformat=unixtime";
    count.requests++;
    var ctrl = new AbortController(), timer = setTimeout(() => { ctrl.abort(); }, 18000);
    return fetch(u, { signal: ctrl.signal }).then((r) => {
      if (r.status === 429 || r.status >= 500) {
        var e = new Error("busy " + r.status);
        var ra = r.headers.get("Retry-After");
        e.wait = /^\d/.test(ra || "") && isFinite(Number(ra)) ? Number(ra) * 1000 : Math.max(0, Date.parse(ra) - Date.now()) || 0;
        e.busy = true;
        throw e;
      }
      if (!r.ok) throw new Error("Open-Meteo HTTP " + r.status);
      return r.json();
    }).then((j) => {
      var rows = Array.isArray(j) ? j : [j];
      rows.forEach((row, i) => {
        var n = list[i];
        if (!n || !row || !row.hourly || !row.hourly.time) return;
        nodes[key(n[0], n[1])] = { t: Date.now(), la: n[0], lo: n[1], start: row.hourly.time[0] * 1000,
          cl: row.hourly.cloud_cover, code: row.hourly.weather_code };
      });
    }).catch((e) => {
      if (e.name === "AbortError" || e instanceof TypeError) e.busy = true;
      if (!e.busy || tries >= WAITS.length) { count.failed++; throw e; }
      count.retries++;
      return sleep(Math.min(60000, Math.max(e.wait || 0, WAITS[tries]))).then(() => ask(list, tries + 1));
    }).finally(() => { clearTimeout(timer); });
  };
  /* ms: stop waiting after that long (the requests carry on); the answer is then whatever the grid already has */
  var need = (points, ms) => {
    var want = [], seen = {}, wait = [];
    (points || []).forEach((p) => {
      if (!p || !isFinite(p.lat) || !isFinite(p.lon)) return;
      corners(p.lat, p.lon).forEach((c) => {
        var k = key(c[0], c[1]);
        if (seen[k]) return;
        seen[k] = 1;
        if (fresh(k)) return;
        if (flying[k]) { wait.push(flying[k]); return; }
        want.push(c);
      });
    });
    for (var i = 0; i < want.length; i += MAX) {
      let part = want.slice(i, i + MAX);
      var job = ask(part, 0);
      part.forEach((c) => { flying[key(c[0], c[1])] = job; });
      job.catch(() => {}).then(() => { part.forEach((c) => { delete flying[key(c[0], c[1])]; }); });
      wait.push(job);
    }
    var all = Promise.allSettled(wait);
    if (ms) all = Promise.race([all, sleep(ms).then(() => wait.map(() => ({ status: "rejected", reason: new Error("weather service slow") })))]);
    return all.then((rs) => {
      if (rs.length && rs.every((r) => r.status === "rejected") && !(points || []).some((p) => at(p.lat, p.lon))) throw rs[0].reason;
      return want.length;
    });
  };
  var km = (a, o, b, p) => {
    var x = (p - o) * Math.cos((a + b) * Math.PI / 360), y = b - a;
    return Math.sqrt(x * x + y * y) * 111.2;
  };
  var at = (lat, lon) => {
    var cs = corners(lat, lon), a = cs[0][0], o = cs[0][1];
    var fy = (lat - a) / STEP, fx = (lon - o) * 1 / STEP;
    var wts = [(1 - fy) * (1 - fx), (1 - fy) * fx, fy * (1 - fx), fy * fx];
    var got = cs.map((c) => (fresh(key(c[0], c[1])) ? nodes[key(c[0], c[1])] : null));
    var d = 0;
    if (!got.some(Boolean)) {
      var best = null, bd = NEAR_KM;
      Object.keys(nodes).forEach((k) => {
        var n = nodes[k];
        if (!fresh(k)) return;
        var dk = km(lat, lon, n.la, n.lo);
        if (dk < bd) { bd = dk; best = n; }
      });
      if (!best) return null;
      got = [best]; wts = [1]; d = bd;
    }
    var start = Math.max.apply(null, got.filter(Boolean).map((n) => n.start)), len = 48, cl = [];
    for (var h = 0; h < len; h++) {
      var s = 0, w = 0;
      got.forEach((n, i) => {
        if (!n) return;
        var v = n.cl[h + Math.round((start - n.start) / 3600000)];
        if (v == null) return;
        s += v * wts[i]; w += wts[i];
      });
      cl.push(w > 0 ? s / w : null);
    }
    var near = got.map((n, i) => [n, wts[i]]).filter((x) => x[0]).sort((x, y) => y[1] - x[1])[0][0];
    var off = Math.round((start - near.start) / 3600000);
    return { start: start, cl: cl, code: near.code.slice(off, off + len), km: Math.round(d) };
  };
  var sunAlt = (t, lat, lon) => (window.SunCalc ? window.SunCalc.getPosition(new Date(t), lat, lon).altitude : 0);
  /* clear-sky UV from sun height (about 12 at the sun overhead), thinned by cloud */
  var uvAt = (t, lat, lon, cl) => {
    var s = Math.sin(sunAlt(t, lat, lon));
    if (s <= 0) return 0;
    return Math.round(12.5 * Math.pow(s, 2.4) * (1 - 0.6 * Math.pow((cl || 0) / 100, 1.5)) * 10) / 10;
  };
  var hourly = (lat, lon) => {
    var w = at(lat, lon);
    if (!w) return null;
    var time = [], isDay = [], uv = [];
    w.cl.forEach((c, h) => {
      var t = w.start + h * 3600000;
      time.push(new Date(t).toISOString());
      isDay.push(sunAlt(t + 1800000, lat, lon) > 0 ? 1 : 0);
      uv.push(uvAt(t + 1800000, lat, lon, c));
    });
    var now = Date.now(), i = Math.max(0, Math.min(w.cl.length - 1, Math.floor((now - w.start) / 3600000)));
    return { area: true, km: w.km, hourly: { time: time, cloud_cover: w.cl, is_day: isDay, uv_index: uv, weather_code: w.code },
      current: { cloud_cover: w.cl[i], is_day: sunAlt(now, lat, lon) > 0 ? 1 : 0, uv_index: uvAt(now, lat, lon, w.cl[i]) } };
  };
  var current = (lat, lon) => {
    var h = hourly(lat, lon);
    if (!h || h.current.cloud_cover == null) return null;
    return { cloud: Math.round(h.current.cloud_cover), uv: h.current.uv_index, isDay: h.current.is_day === 1 };
  };
  var sun = (lat, lon) => {
    var now = Date.now(), alt = sunAlt(now, lat, lon), tm = window.SunCalc ? window.SunCalc.getTimes(new Date(now), lat, lon) : {};
    var left = alt > 0 && isFinite(+tm.sunset) ? Math.max(0, (+tm.sunset - now) / 3600000) : 0;
    var w = at(lat, lon), until = 0;
    if (w && alt > 0) {
      for (var m = 0; m < Math.min(1440, left * 60); m += 5) {
        var t = now + m * 60000, i = Math.max(0, Math.floor((t - w.start) / 3600000));
        if (w.cl[i] == null || w.cl[i] >= 20 || sunAlt(t, lat, lon) <= 0) break;
        until = Math.min(left, (m + 5) / 60);
      }
    }
    return { elevation: Math.round(alt * 180 / Math.PI), daylight: left, clearUv: uvAt(now, lat, lon, 0), sunny: until };
  };
  window.SunnyAreaWx = { need: need, at: at, hourly: hourly, current: current, sun: sun, stats: () => Object.assign({}, count) };
})();
