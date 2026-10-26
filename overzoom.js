// workspace/whereisthesun/overzoom.js
/* SUNNY opt117 overzoom notice: map tiles carry no more detail past zoom 19, so a small pill says "Max detail reached"
 * with a Zoom out button back to 19. Settings switch "Max detail notice" (sunny-maxdetail, on by default). No data. */
(() => {
  "use strict";
  var L = window.SunnyLayers;
  if (!L) return;
  var MAX = 19;
  var map = null, pill = null;
  var on = () => { try { return localStorage.getItem("sunny-maxdetail") !== "0"; } catch (e) { return true; } };
  var show = () => {
    if (!map) return;
    var need = on() && map.getZoom() > MAX + 0.4;
    if (!pill && need) {
      pill = document.createElement("div");
      pill.id = "max-detail";
      pill.setAttribute("role", "status");
      pill.style.cssText = "position:absolute;top:56px;left:50%;transform:translateX(-50%);z-index:30;background:rgba(20,24,34,.92);color:#fff;" +
        "font:13px system-ui,sans-serif;padding:6px 8px 6px 12px;border-radius:16px;display:flex;gap:8px;align-items:center;white-space:nowrap";
      pill.innerHTML = 'Max detail reached <button type="button" style="border:0;border-radius:12px;padding:3px 10px;background:#ffd34d;font:inherit">Zoom out</button>';
      pill.querySelector("button").addEventListener("click", () => { map.easeTo({ zoom: MAX }); });
      document.body.appendChild(pill);
    }
    if (pill) pill.style.display = need ? "flex" : "none";
  };
  var row = () => {
    var pop = document.getElementById("settings-pop"), btn = document.getElementById("set-adv-btn");
    if (!pop || !btn || document.getElementById("toggle-maxdetail")) return;
    var r = document.createElement("div");
    r.className = "set-row";
    r.innerHTML = '<label class="ov switch"><input id="toggle-maxdetail" type="checkbox"><span class="knob" aria-hidden="true"></span>Max detail notice</label>' +
      '<div class="set-hint">Says when zooming further shows no more detail.</div>';
    pop.insertBefore(r, btn);
    var g = r.querySelector("input");
    g.checked = on();
    g.addEventListener("change", () => { try { localStorage.setItem("sunny-maxdetail", g.checked ? "1" : "0"); } catch (e) {} show(); });
  };
  L.add({ id: "maxdetail-attach", group: "none", attach: (m) => {
    map = m;
    map.on("zoomend", show);
    row(); setTimeout(row, 1500);
    show();
  } });
})();
