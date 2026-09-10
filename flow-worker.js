/* SUNNY opt43 — coarse block-matching optical flow (A→B) for Play motion lerp.
   Runs off-main; returns Int16 dx/dy per block. No external deps. */
"use strict";

function toGray(rgba, n) {
  var g = new Uint8Array(n);
  var i, j = 0;
  for (i = 0; i < n; i++, j += 4) {
    /* ITU-R BT.601 luma */
    g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  }
  return g;
}

function blockFlow(w, h, grayA, grayB, block, search) {
  var bw = Math.max(1, Math.floor(w / block));
  var bh = Math.max(1, Math.floor(h / block));
  var out = new Int16Array(bw * bh * 2);
  var yb, xb, bi, x0, y0, best, bestDx, bestDy, dy, dx, sad, yy, xx, ia, ib, lim;
  var half = block;
  lim = search;
  for (yb = 0; yb < bh; yb++) {
    for (xb = 0; xb < bw; xb++) {
      bi = (yb * bw + xb) * 2;
      x0 = xb * block;
      y0 = yb * block;
      best = 1e15;
      bestDx = 0;
      bestDy = 0;
      for (dy = -lim; dy <= lim; dy++) {
        for (dx = -lim; dx <= lim; dx++) {
          sad = 0;
          for (yy = 0; yy < half; yy++) {
            var ay = y0 + yy;
            var by = ay + dy;
            if (ay < 0 || ay >= h || by < 0 || by >= h) {
              sad += 255 * half;
              continue;
            }
            var aRow = ay * w + x0;
            var bRow = by * w + x0 + dx;
            for (xx = 0; xx < half; xx++) {
              var ax = x0 + xx;
              var bx = ax + dx;
              if (ax < 0 || ax >= w || bx < 0 || bx >= w) {
                sad += 255;
              } else {
                ia = grayA[aRow + xx];
                ib = grayB[bRow + xx];
                sad += ia > ib ? ia - ib : ib - ia;
              }
              if (sad >= best) break;
            }
            if (sad >= best) break;
          }
          if (sad < best) {
            best = sad;
            bestDx = dx;
            bestDy = dy;
          }
        }
      }
      out[bi] = bestDx;
      out[bi + 1] = bestDy;
    }
  }
  return { flow: out, bw: bw, bh: bh, block: block };
}

self.onmessage = function (ev) {
  var msg = ev.data || {};
  if (msg.type !== "flow") return;
  var id = msg.id;
  try {
    var w = msg.w | 0;
    var h = msg.h | 0;
    var block = Math.max(4, msg.block | 0 || 12);
    var search = Math.max(2, Math.min(16, msg.search | 0 || 6));
    if (!w || !h || !msg.a || !msg.b || msg.a.byteLength < w * h * 4) {
      self.postMessage({ id: id, ok: false, error: "bad dims" });
      return;
    }
    var rgbaA = new Uint8ClampedArray(msg.a);
    var rgbaB = new Uint8ClampedArray(msg.b);
    var n = w * h;
    var grayA = toGray(rgbaA, n);
    var grayB = toGray(rgbaB, n);
    var rec = blockFlow(w, h, grayA, grayB, block, search);
    self.postMessage(
      { id: id, ok: true, flow: rec.flow, bw: rec.bw, bh: rec.bh, block: rec.block, w: w, h: h },
      [rec.flow.buffer]
    );
  } catch (e) {
    self.postMessage({ id: id, ok: false, error: String(e && e.message ? e.message : e) });
  }
};
