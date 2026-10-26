// workspace/whereisthesun/advanced.js
/* SUNNY opt106: a small gear in Settings opens a hidden Advanced part (closed by default, remembered).
 * It holds the hover popup delay (0.5 to 5 s, read through window.SunnyHoverDelay), Show FPS, the Lag-O-Meter settings and Dev. */
(() => {
  "use strict";
  var get = (k, d) => { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
  var put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  window.SunnyHoverDelay = () => { var s = parseFloat(get("sunny-hover-delay", "2")); return (s >= 0.5 && s <= 5 ? s : 2) * 1000; };
  function fps(on) { var f = document.getElementById("fps"); if (f) f.style.display = on ? "" : "none"; }
  function init() {
    var pop = document.getElementById("settings-pop"), lag = document.getElementById("lag-controls");
    if (!pop || document.getElementById("set-adv")) return;
    var btn = document.createElement("button");
    btn.type = "button"; btn.id = "set-adv-btn"; btn.className = "set-adv-btn";
    var adv = document.createElement("div");
    adv.id = "set-adv"; adv.className = "set-adv";
    var d = Number(get("sunny-hover-delay", "2"));
    adv.innerHTML = '<section class="set-group"><h3 class="set-title">Advanced</h3><div class="set-row">' +
      '<label class="sun-opt" title="How long the mouse rests on a map item before its info box opens">Hover popup delay ' +
      '<input id="hover-delay" type="range" min="0.5" max="5" step="0.5" value="' + d + '"> <b id="hover-delay-v">' + d + " s</b></label>" +
      '<label class="ov switch" title="Frames per second, top left"><input id="toggle-fps" type="checkbox"><span class="knob" aria-hidden="true"></span>Show FPS</label></div></section>';
    var open = get("sunny-adv-open", "0") === "1";
    var show = () => { adv.hidden = !open; btn.textContent = "⚙ Advanced " + (open ? "▾" : "▸"); btn.setAttribute("aria-expanded", open ? "true" : "false"); };
    btn.addEventListener("click", () => { open = !open; put("sunny-adv-open", open ? "1" : "0"); show(); });
    show();
    var build = document.getElementById("set-build");
    pop.insertBefore(btn, build); pop.insertBefore(adv, build);
    if (lag) adv.appendChild(lag);
    var r = adv.querySelector("#hover-delay"), v = adv.querySelector("#hover-delay-v");
    r.addEventListener("input", () => { v.textContent = r.value + " s"; put("sunny-hover-delay", r.value); });
    var f = adv.querySelector("#toggle-fps");
    f.checked = get("sunny-fps", "1") === "1"; fps(f.checked);
    f.addEventListener("change", () => { put("sunny-fps", f.checked ? "1" : "0"); fps(f.checked); });
    /* Dev (aurora-dev.js) adds itself after the Lag-O-Meter group, so it lands in here too; catch it if it came first */
    var dev = document.getElementById("toggle-dev");
    var sec = dev && dev.closest(".set-group");
    if (sec && !adv.contains(sec)) adv.appendChild(sec);
    var pin = () => { /* Pin where I tap stays in the main list, above the gear */
      var t = document.getElementById("toggle-tap-pin"), row = t && t.closest(".set-row");
      if (row && adv.contains(row)) pop.insertBefore(row, btn);
    };
    pin(); window.addEventListener("load", pin);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
