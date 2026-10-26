// workspace/whereisthesun/beach-card.js
/* SUNNY beach tap card (opt96): a large ring icon with labels (now, +3h, +6h, +9h), next sunset and
 * sunrise, cloud now, weather words, hours of sun left, a small hourly strip and the source link.
 * SunnyBeachCard.html(b) returns the block; the beach popup puts it first so the peek card shows it. */
(() => {
  "use strict";
  var WORDS = [[95, "Thunderstorms"], [85, "Snow showers"], [80, "Rain showers"], [71, "Snow"], [61, "Rain"], [51, "Drizzle"],
    [45, "Fog"], [3, "Overcast"], [2, "Partly cloudy"], [1, "Mostly clear"], [0, "Clear"]];
  var words = (c) => { if (c == null) return "No forecast yet"; var w = WORDS.find((x) => { return c >= x[0]; }); return w ? w[1] : "Clear"; };
  var hm = (t) => {
    var s = new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return new Date(t).toDateString() === new Date().toDateString() ? s : s + " tomorrow";
  };
  var hh = (t) => { return new Date(t).toLocaleTimeString([], { hour: "numeric" }); };
  var next = (b, key) => {
    if (!window.SunCalc) return null;
    for (var d = 0; d < 3; d++) {
      var t = +window.SunCalc.getTimes(new Date(Date.now() + d * 86400000), b.lat, b.lon)[key];
      if (!isNaN(t) && t > Date.now()) return t;
    }
    return null;
  };
  var html = (b) => {
    var BI = window.SunnyBeachIcons;
    if (!BI || !b) return "";
    var s = BI.state(b);
    if (!s) return "";
    var img = "";
    try { img = BI.draw(s, 5, true, true).toDataURL("image/png"); } catch (e) { return ""; }
    var hrs = BI.hourly(b);
    var set = next(b, "sunset"), rise = next(b, "sunrise");
    var sunH = 0;
    hrs.forEach((h) => { if (h.cl != null) sunH += BI.light(h.t + 1800000, b.lat, b.lon) * (1 - h.cl / 100); });
    var up = (t) => { return BI.light(t, b.lat, b.lon) > 0; };
    var lab = (cls, h, txt) => { return '<span class="bc-l ' + cls + '">' + txt + "<b>" + (hrs[h].cl == null ? "?" : Math.round(hrs[h].cl) + "%") + "</b></span>"; };
    var strip = hrs.slice(0, 8).map((h) => {
      var u = BI.glyphUrl(h.code, up(h.t));
      return '<div class="bc-h"><span>' + hh(h.t) + "</span>" + (u ? '<img alt="" src="' + u + '">' : "<i></i>") + "<span>" + (h.cl == null ? "?" : Math.round(h.cl) + "%") + "</span></div>";
    }).join("");
    return '<div class="bx-ring"><div class="bc-ring"><img class="bx-big" alt="Sun and cloud ring" src="' + img + '">' +
      lab("bc-n", 0, "Now ") + lab("bc-e", 3, "+3h ") + lab("bc-s", 6, "+6h ") + lab("bc-w", 9, "+9h ") + "</div>" +
      '<div class="bc-facts"><div><b>' + words(hrs[0].code) + "</b> · cloud " + (hrs[0].cl == null ? "?" : Math.round(hrs[0].cl) + "%") + "</div>" +
      "<div>About " + (Math.round(sunH * 2) / 2) + " h of sun left in the next 12 h</div>" +
      "<div>🌇 Sunset " + (set ? hm(set) : "none") + " · 🌅 Sunrise " + (rise ? hm(rise) : "none") + "</div>" +
      '<div class="bc-key">Ring: 12 hours clockwise from the top. Bright blue is clear sky, white is cloud, dark is night.' +
      " Red pin is now, orange sunset, yellow sunrise.</div></div>" +
      '<div class="bc-strip">' + strip + "</div></div>";
  };
  window.SunnyBeachCard = { html: html };
})();
