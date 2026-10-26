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
      map.addLayer({ id: "famous-star", type: "symbol", source: "famous", layout: { "icon-image": "famous-star", "icon-offset": [7, -7],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 1, 0.7, 8, 1.1], "icon-allow-overlap": true, "icon-ignore-placement": true } });
    }
    map.setFilter("famous-star", ["in", ["get", "l"], ["literal", ids]]);
    map.setLayoutProperty("famous-star", "visibility", "visible");
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
    r.innerHTML = '<label class="ov switch"><input id="toggle-famous" type="checkbox"><span class="knob" aria-hidden="true"></span>Famous stars</label>' +
      '<div class="set-hint">A gold star on well-known places in the layers that are on.</div>';
    pop.insertBefore(r, btn);
    var g = r.querySelector("input");
    g.checked = on();
    g.addEventListener("change", () => { try { localStorage.setItem("sunny-famous", g.checked ? "1" : "0"); } catch (e) {} draw(); });
  };
  L.add({ id: "famous-attach", group: "none", attach: (m) => {
    map = m;
    document.addEventListener("change", soon);
    map.on("idle", () => { if (map.getLayer("famous-star")) { var ls = map.getStyle().layers; if (ls[ls.length - 1].id !== "famous-star") map.moveLayer("famous-star"); } });
    row(); setTimeout(row, 1500);
    soon();
  } });
})();
