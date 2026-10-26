// workspace/whereisthesun/aurora-dev.js
/* SUNNY opt101: temporary Dev switch (Settings, bottom). When on, Contrast and Brightness
 * sliders appear under the Aurora forecast row and retint the aurora band live. Values persist. */
(function () {
  var KEYS = [["sunny.aurContrast", "Contrast"], ["sunny.aurBright", "Brightness"]];
  function box() {
    var b = document.createElement("div");
    b.id = "aur-dev";
    b.style.cssText = "padding:4px 12px 8px 40px;font-size:12px";
    KEYS.forEach((k) => {
      var l = document.createElement("label"), r = document.createElement("input");
      l.style.cssText = "display:flex;align-items:center;gap:8px;margin:2px 0";
      l.textContent = k[1];
      r.type = "range"; r.min = 0; r.max = 100; r.step = 1; r.style.flex = "1";
      r.setAttribute("aria-label", "Aurora " + k[1]);
      r.value = localStorage.getItem(k[0]) || 50;
      r.addEventListener("input", () => { localStorage.setItem(k[0], r.value); if (window.SunnyAurora) window.SunnyAurora.redraw(); });
      l.appendChild(r);
      b.appendChild(l);
    });
    return b;
  }
  function sync() {
    var on = localStorage.getItem("sunny.dev") === "1", inp = document.querySelector(".lp-row input.lp-input[data-id='aurora']");
    var row = inp && inp.closest(".lp-row"), b = document.getElementById("aur-dev");
    if (row && !b) { b = box(); row.after(b); }
    if (b) b.hidden = !on;
  }
  function init() {
    var pop = document.getElementById("lag-controls"), s = document.createElement("section");
    s.className = "set-group";
    s.innerHTML = "<h3 class=\"set-title\">Dev</h3><div class=\"set-row\"><label class=\"ov switch\" title=\"Temporary developer tools\"><input id=\"toggle-dev\" type=\"checkbox\"><span class=\"knob\" aria-hidden=\"true\"></span>Dev</label></div>";
    if (pop) pop.after(s);
    var c = document.getElementById("toggle-dev");
    c.checked = localStorage.getItem("sunny.dev") === "1";
    c.addEventListener("change", () => { localStorage.setItem("sunny.dev", c.checked ? "1" : "0"); sync(); });
    sync();
    new MutationObserver(sync).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
