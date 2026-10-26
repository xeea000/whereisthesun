// workspace/whereisthesun/overzoom.js
/* SUNNY opt118 overzoom notice: map tiles carry no more detail past zoom 19. The map keeps zooming into the last tiles
 * (stretched pixels, base maps drawn with nearest resampling) and a text watermark says "Max detail reached". Settings switch "Max detail notice" (sunny-maxdetail, on by default). No data. */
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
      pill.style.cssText = "position:absolute;top:56px;left:50%;transform:translateX(-50%);z-index:30;color:rgba(255,255,255,.85);pointer-events:none;" +
        "font:600 13px system-ui,sans-serif;text-shadow:0 1px 3px #000,0 0 2px #000;white-space:nowrap";
      pill.textContent = "Max detail reached";
      document.body.appendChild(pill);
    }
    if (pill) pill.style.display = need ? "block" : "none";
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
