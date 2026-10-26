// workspace/whereisthesun/famous.js
/* SUNNY opt112: a small gold star on well-known items in any point layer that is on.
 * List from tools/build-famous.js (30+ Wikipedia languages, plus a few hand-picked craters and observatories).
 * Settings switch "Famous stars" (sunny-famous, on by default). Fetched once, about 2 KB. */
(() => {
  "use strict";
  var L = window.SunnyLayers, K = window.SunnyKit, map = null, data = null, loading = false;
  var on = () => { try { return localStorage.getItem("sunny-famous") !== "0"; } catch (e) { return true; } };
  window.SunnyFamousOn = on;
  var img = () => {
    if (map.hasImage("famous-star")) return;
    var n = 32, cv = document.createElement("canvas"); cv.width = cv.height = n;
    var x = cv.getContext("2d"); x.beginPath();
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 6 : 15; x.lineTo(n / 2 + r * Math.cos(a), n / 2 + r * Math.sin(a)); }
    x.closePath(); x.fillStyle = "#ffd34d"; x.fill(); x.lineWidth = 2; x.strokeStyle = "#3a2a00"; x.stroke();
    map.addImage("famous-star", x.getImageData(0, 0, n, n), { pixelRatio: 2 });
  };
  var layersOn = () => { return L.list().map((d) => { return d.id; }); };
  var draw = () => {
    if (!map) return;
    var ids = layersOn();
    var want = on() && data && data.l.some((r) => { return ids.indexOf(r[0]) >= 0; });
    if (!want) { if (map.getLayer("famous-star")) map.setLayoutProperty("famous-star", "visibility", "none"); if (on() && !data) load(ids); return; }
    if (!map.getSource("famous")) {
      map.addSource("famous", { type: "geojson", data: K.fc(data.l.map((r) => {
        return { type: "Feature", properties: { l: r[0], name: r[3] }, geometry: { type: "Point", coordinates: [r[2], r[1]] } };
      })) });
    }
    if (!map.getLayer("famous-star")) {
      img();
      map.addLayer({ id: "famous-star", type: "symbol", source: "famous", layout: { "icon-image": "famous-star", "icon-offset": [0, 0],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 1, 0.7, 8, 1.1], "icon-allow-overlap": true, "icon-ignore-placement": true } });
    }
    map.setFilter("famous-star", ["in", ["get", "l"], ["literal", ids]]);
    map.setLayoutProperty("famous-star", "visibility", "visible");
    hide();
  };
  /* The star replaces the dot: the matching circle goes see-through but stays tappable underneath. */
  var orig = {}, seen = {};
  var dist = (r, c) => { return Math.abs(r[1] - c[1]) + Math.abs(r[2] - c[0]); };
  /* Move each star onto the dot it replaces. */
  var snap = () => {
    var s = map.getSource("famous"); if (!s) return;
    s.setData(K.fc(data.l.map((r) => {
      var c = r[6] || [r[2], r[1]];
      return { type: "Feature", properties: { l: r[0], name: r[3] }, geometry: { type: "Point", coordinates: c } }; })));
  };
  var hide = () => {
    if (!map || !data) return;
    var near = (c) => { return on() && data.l.find((r) => { return Math.abs(r[1] - c[1]) < 0.15 && Math.abs(r[2] - c[0]) < 0.15; }); };
    map.getStyle().layers.forEach((ly) => {
      if (ly.type !== "circle" || !ly.source) return;
      var src = map.getSource(ly.source); if (!src || src.type !== "geojson" || !src.getData) return;
      src.getData().then((d) => {
        if (!map.getLayer(ly.id)) return;
        var sig = (on() ? 1 : 0) + ":" + ((d && d.features) || []).length;
        if (seen[ly.id] === sig) return; seen[ly.id] = sig;
        var ids = [], names = [], moved = false;
        ((d && d.features) || []).forEach((f) => {
          var g = f.geometry; if (!g || g.type !== "Point" || !near(g.coordinates)) return;
          var p = f.properties || {}, r = near(g.coordinates); if (r.length > 5 && r[5] < dist(r, g.coordinates)) return;
          r[5] = dist(r, g.coordinates); r[6] = g.coordinates; moved = true;
          if (p.i != null) ids.push(p.i); else if (p.name) names.push(p.name);
        });
        if (moved) snap();
        if (!orig[ly.id]) orig[ly.id] = [map.getPaintProperty(ly.id, "circle-opacity"), map.getPaintProperty(ly.id, "circle-stroke-opacity")];
        var o = orig[ly.id];
        var m = ["any", ["in", ["get", "i"], ["literal", ids]], ["in", ["get", "name"], ["literal", names]]];
        var set = (k, v) => { map.setPaintProperty(ly.id, k, ids.length || names.length ? ["case", m, 0, v == null ? 1 : v] : (v == null ? 1 : v)); };
        try { set("circle-opacity", o[0]); set("circle-stroke-opacity", o[1]); } catch (e) {}
      }).catch(() => {});
    });
  };
  var load = (ids) => {
    if (loading || !ids.length) return;
    loading = true;
    K.loadJson("data/world/famous.json").then((d) => { data = d; draw(); }).catch(() => { loading = false; });
  };
  var t = null, soon = () => { clearTimeout(t); t = setTimeout(draw, 200); };
  var row = () => {
    var pop = document.getElementById("settings-pop"), btn = document.getElementById("set-adv-btn");
    if (!pop || !btn || document.getElementById("toggle-famous")) return;
    var r = document.createElement("div");
    r.className = "set-row";
    r.innerHTML = '<label class="ov switch"><input id="toggle-famous" type="checkbox"><span class="knob" aria-hidden="true"></span>Famous</label>' +
      '<div class="set-hint">A gold star replaces the dot of well-known places in the layers that are on.</div>';
    pop.insertBefore(r, btn);
    var g = r.querySelector("input");
    g.checked = on();
    g.addEventListener("change", () => { try { localStorage.setItem("sunny-famous", g.checked ? "1" : "0"); } catch (e) {} draw(); });
  };
  L.add({ id: "famous-attach", group: "none", attach: (m) => {
    map = m;
    document.addEventListener("change", soon);
    map.on("idle", () => { if (map.getLayer("famous-star")) { var ls = map.getStyle().layers; if (ls[ls.length - 1].id !== "famous-star") map.moveLayer("famous-star"); }
      hide();
    });
    row(); setTimeout(row, 1500);
    soon();
  } });
})();
