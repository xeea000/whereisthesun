// workspace/whereisthesun/badge-kit.js
/* SUNNY emoji badges (t406u): a round map icon with an emoji inside a coloured ring, and the legend row that shows the same badge.
 *   SunnyBadge.image(map, name, emoji, colour)  adds the icon to the map once, returns its name for icon-image
 *   SunnyBadge.keys(rows)                       legend rows [colour, label, emoji] as HTML */
(() => {
  "use strict";
  var K = window.SunnyKit;
  if (!K) return;
  var FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  function image(map, name, emoji, colour) {
    if (map.hasImage(name)) return name;
    var px = 2, n = 30, c = document.createElement("canvas");
    c.width = c.height = n * px;
    var g = c.getContext("2d");
    g.scale(px, px);
    g.beginPath(); g.arc(n / 2, n / 2, n / 2 - 1.5, 0, 7);
    g.fillStyle = "rgba(16,20,24,.88)"; g.fill();
    g.lineWidth = 2.4; g.strokeStyle = colour; g.stroke();
    g.font = "15px " + FONT; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(emoji, n / 2, n / 2 + 1);
    map.addImage(name, g.getImageData(0, 0, c.width, c.height), { pixelRatio: px });
    return name;
  }
  var keys = (rows) => {
    return rows.map((r) => { return '<span class="ls-k"><i class="ls-emo" style="border-color:' + r[0] + '">' + r[2] + "</i>" + K.esc(r[1]) + "</span>"; }).join("");
  };
  window.SunnyBadge = { image: image, keys: keys };
})();
