/* SUNNY opt60 — regularized coarse motion estimate between two frames (A→B).
 *
 * Pyramidal Lucas-Kanade ported from jpettitt/weather-radar-card src/lk.ts
 * (MIT License, Copyright (c) 2019 Custom cards for Home Assistant), then
 * extended for SUNNY:
 *   - coarsest level is initialised at the steering-wind prior (Open-Meteo
 *     700 hPa) instead of (0,0), so large/ambiguous motion locks near the wind;
 *   - a coarse grid of cells refines the global vector locally (a few LK
 *     iterations per cell at the finest level), confidence-weighted, with each
 *     cell's deviation from the global vector clamped;
 *   - the grid is then smoothed (twice, 3×3 weighted) so the field is spatially
 *     smooth — no per-block noise (the opt44 block-matcher was removed).
 * Output: displacement field in estimation pixels; the caller turns it into UV.
 * Interpolation itself (bidirectional semi-Lagrangian, pySTEPS-style advection
 * correction) runs on the GPU in frame-tween.js.
 *
 * ---- weather-radar-card license (for the ported Lucas-Kanade code) ----
 * MIT License
 * Copyright (c) 2019 Custom cards for Home Assistant
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
"use strict";

function buildPyramid(img, w, h, levels) {
  var pyr = [{ d: img, w: w, h: h }];
  for (var i = 1; i < levels; i++) {
    var p = pyr[i - 1];
    var nw = p.w >> 1, nh = p.h >> 1;
    if (nw < 8 || nh < 8) break;
    var o = new Float32Array(nw * nh);
    for (var y = 0; y < nh; y++) {
      for (var x = 0; x < nw; x++) {
        var sx = x << 1, sy = y << 1, r = sy * p.w + sx;
        o[y * nw + x] = (p.d[r] + p.d[r + 1] + p.d[r + p.w] + p.d[r + p.w + 1]) * 0.25;
      }
    }
    pyr.push({ d: o, w: nw, h: nh });
  }
  return pyr;
}

function sobel(img, w, h) {
  var Ix = new Float32Array(w * h), Iy = new Float32Array(w * h);
  for (var y = 1; y < h - 1; y++) {
    for (var x = 1; x < w - 1; x++) {
      var i = y * w + x;
      var tl = img[i - w - 1], tc = img[i - w], tr = img[i - w + 1];
      var ml = img[i - 1], mr = img[i + 1];
      var bl = img[i + w - 1], bc = img[i + w], br = img[i + w + 1];
      Ix[i] = ((tr + 2 * mr + br) - (tl + 2 * ml + bl)) * 0.125;
      Iy[i] = ((bl + 2 * bc + br) - (tl + 2 * tc + tr)) * 0.125;
    }
  }
  return { Ix: Ix, Iy: Iy };
}

function sampleBilinear(img, w, h, x, y) {
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return -1; /* outside marker */
  var x0 = Math.floor(x), y0 = Math.floor(y);
  var x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
  var fx = x - x0, fy = y - y0;
  return img[y0 * w + x0] * (1 - fx) * (1 - fy) + img[y0 * w + x1] * fx * (1 - fy) +
         img[y1 * w + x0] * (1 - fx) * fy + img[y1 * w + x1] * fx * fy;
}

/* LK on a rectangle [x0,x1)×[y0,y1) of one level; gradients precomputed. */
function lkRect(I0, I1, g, w, h, rx0, ry0, rx1, ry1, vx, vy, iters) {
  var sxx = 0, sxy = 0, syy = 0, n = 0, x, y, i;
  for (y = Math.max(1, ry0); y < Math.min(h - 1, ry1); y++) {
    for (x = Math.max(1, rx0); x < Math.min(w - 1, rx1); x++) {
      i = y * w + x;
      sxx += g.Ix[i] * g.Ix[i]; sxy += g.Ix[i] * g.Iy[i]; syy += g.Iy[i] * g.Iy[i]; n++;
    }
  }
  var det = sxx * syy - sxy * sxy;
  var tr = sxx + syy;
  var minEig = tr * 0.5 - Math.sqrt(Math.max(0, tr * tr * 0.25 - det));
  var conf = n ? minEig / n : 0;
  if (det < 1e-6 || !n) return { vx: vx, vy: vy, conf: 0 };
  for (var it = 0; it < iters; it++) {
    var sxt = 0, syt = 0;
    for (y = Math.max(1, ry0); y < Math.min(h - 1, ry1); y++) {
      for (x = Math.max(1, rx0); x < Math.min(w - 1, rx1); x++) {
        i = y * w + x;
        var s = sampleBilinear(I1, w, h, x + vx, y + vy);
        if (s < 0) continue;
        var t = s - I0[i];
        sxt += g.Ix[i] * t; syt += g.Iy[i] * t;
      }
    }
    var dvx = (syy * (-sxt) - sxy * (-syt)) / det;
    var dvy = (sxx * (-syt) - sxy * (-sxt)) / det;
    /* damp single-iteration jumps (regularization) */
    var m = Math.sqrt(dvx * dvx + dvy * dvy);
    if (m > 3) { dvx *= 3 / m; dvy *= 3 / m; }
    vx += dvx; vy += dvy;
    if (Math.abs(dvx) < 0.01 && Math.abs(dvy) < 0.01) break;
  }
  return { vx: vx, vy: vy, conf: conf };
}

/* Coarse exhaustive search (zero-mean SSD) over integer shifts within radius R on a
   low-res level, softly penalised by distance from the wind prior. Robust global
   initialisation for LK (LK alone can lock onto a local minimum in low-texture cloud). */
function coarseSearch(A, B, w, h, R, pdx, pdy, lam) {
  var best = Infinity, bx = 0, by = 0, scores = [], grid = {};
  var x0 = R, x1 = w - R, y0 = R, y1 = h - R;
  if (x1 - x0 < 8 || y1 - y0 < 8) return null;
  for (var dy = -R; dy <= R; dy++) {
    for (var dx = -R; dx <= R; dx++) {
      /* B(p) ≈ A(p − d) */
      var sa = 0, sb = 0, n = 0, x, y;
      for (y = y0; y < y1; y++) for (x = x0; x < x1; x++) { sa += A[(y - dy) * w + (x - dx)]; sb += B[y * w + x]; n++; }
      var ma = sa / n, mb = sb / n, e = 0;
      for (y = y0; y < y1; y++) for (x = x0; x < x1; x++) { var t = (A[(y - dy) * w + (x - dx)] - ma) - (B[y * w + x] - mb); e += t * t; }
      e /= n;
      var pen = lam > 0 ? (1 + lam * ((dx - pdx) * (dx - pdx) + (dy - pdy) * (dy - pdy)) / (R * R)) : 1;
      var sc = e * pen;
      grid[dx + "," + dy] = sc;
      scores.push(e);
      if (sc < best) { best = sc; bx = dx; by = dy; }
    }
  }
  scores.sort(function (a, b) { return a - b; });
  var med = scores[scores.length >> 1] || 1;
  var raw = grid[bx + "," + by];
  /* sub-pixel parabola fit on the penalised score */
  function sub(m, c, p) { var d = m - 2 * c + p; return d > 1e-9 ? 0.5 * (m - p) / d : 0; }
  var fx = 0, fy = 0;
  if (grid[(bx - 1) + "," + by] != null && grid[(bx + 1) + "," + by] != null) fx = sub(grid[(bx - 1) + "," + by], raw, grid[(bx + 1) + "," + by]);
  if (grid[bx + "," + (by - 1)] != null && grid[bx + "," + (by + 1)] != null) fy = sub(grid[bx + "," + (by - 1)], raw, grid[bx + "," + (by + 1)]);
  return { dx: bx + Math.max(-0.5, Math.min(0.5, fx)), dy: by + Math.max(-0.5, Math.min(0.5, fy)),
           q: med > 0 ? Math.max(0, 1 - best / med) : 0, edge: Math.abs(bx) === R || Math.abs(by) === R };
}

function estimate(msg) {
  var w = msg.w, h = msg.h;
  var A = new Float32Array(msg.a), B = new Float32Array(msg.b);
  var levels = Math.max(1, Math.min(5, msg.levels || 4));
  var pa = buildPyramid(A, w, h, levels), pb = buildPyramid(B, w, h, levels);
  var L = Math.min(pa.length, pb.length);
  var prior = msg.prior; /* {dx,dy} in estimation px or null */
  var maxMag = msg.maxMag || (0.12 * w);
  /* search level: ~64 px wide */
  var sLev = 0;
  while (sLev < L - 1 && pa[sLev].w > 80) sLev++;
  var ss = Math.pow(2, sLev);
  var R = Math.max(3, Math.ceil(maxMag / ss) + 1);
  var cs = coarseSearch(pa[sLev].d, pb[sLev].d, pa[sLev].w, pa[sLev].h, R,
                        prior ? prior.dx / ss : 0, prior ? prior.dy / ss : 0, prior ? 0.12 : 0);
  var vx, vy, startLev;
  if (cs && cs.q > 0.04 && !cs.edge) { vx = cs.dx; vy = cs.dy; startLev = sLev; }
  else { var sc0 = Math.pow(2, L - 1); vx = prior ? prior.dx / sc0 : 0; vy = prior ? prior.dy / sc0 : 0; startLev = L - 1; }
  var conf = 0, lev, grads = [];
  for (lev = startLev; lev >= 0; lev--) {
    if (lev < startLev) { vx *= 2; vy *= 2; }
    var g = sobel(pa[lev].d, pa[lev].w, pa[lev].h);
    grads[lev] = g;
    var bx0 = vx, by0 = vy;
    var r = lkRect(pa[lev].d, pb[lev].d, g, pa[lev].w, pa[lev].h, 0, 0, pa[lev].w, pa[lev].h, vx, vy, 6);
    /* LK may only refine the search result locally (±1.5 px at this level) */
    if (startLev === sLev && cs) {
      r.vx = bx0 + Math.max(-1.5, Math.min(1.5, r.vx - bx0));
      r.vy = by0 + Math.max(-1.5, Math.min(1.5, r.vy - by0));
    }
    vx = r.vx; vy = r.vy; conf = r.conf;
  }
  if (!grads[0]) grads[0] = sobel(A, w, h);
  var gx = vx, gy = vy;
  /* Global regularization toward the wind prior: trust the observation in proportion
     to how distinct the search minimum is (q) and the LK structure confidence. */
  var qObs = cs && !cs.edge ? Math.min(1, cs.q / 0.12) : 0;
  var wObs = Math.max(qObs * 0.95, conf / (conf + (msg.confK || 4)) * (cs ? qObs : 1));
  if (!prior && cs && cs.q < 0.04) return { ok: false, reason: "ambiguous", conf: conf, q: cs.q };
  if (prior) {
    gx = wObs * gx + (1 - wObs) * prior.dx;
    gy = wObs * gy + (1 - wObs) * prior.dy;
  } else if (conf < (msg.minConf || 1.5)) {
    return { ok: false, reason: "low-confidence", conf: conf };
  }
  var maxMag = msg.maxMag || (0.12 * w);
  var gm = Math.sqrt(gx * gx + gy * gy);
  if (gm > maxMag) { gx *= maxMag / gm; gy *= maxMag / gm; }

  /* Coarse cells: local refinement, clamped deviation, confidence-weighted */
  var cols = msg.cols || 4, rows = msg.rows || 3;
  var cw = w / cols, ch = h / rows;
  var v = new Float32Array(cols * rows * 2);
  var maxDev = Math.max(1.5, 0.35 * gm + 1);
  var g0 = grads[0];
  for (var cy = 0; cy < rows; cy++) {
    for (var cx = 0; cx < cols; cx++) {
      /* overlapping windows (1.5× cell) for coherence */
      var x0 = Math.floor((cx - 0.25) * cw), x1 = Math.ceil((cx + 1.25) * cw);
      var y0 = Math.floor((cy - 0.25) * ch), y1 = Math.ceil((cy + 1.25) * ch);
      var rc = lkRect(A, B, g0, w, h, x0, y0, x1, y1, gx, gy, 4);
      var wc = rc.conf / (rc.conf + (msg.confK || 4) * 2);
      var dx = Math.max(-maxDev, Math.min(maxDev, rc.vx - gx));
      var dy = Math.max(-maxDev, Math.min(maxDev, rc.vy - gy));
      var k = (cy * cols + cx) * 2;
      v[k] = gx + wc * dx;
      v[k + 1] = gy + wc * dy;
    }
  }
  /* spatial smoothing ×2 (center weight 4, edge neighbours 2, corners 1) */
  for (var pass = 0; pass < 2; pass++) {
    var o = new Float32Array(v.length);
    for (cy = 0; cy < rows; cy++) {
      for (cx = 0; cx < cols; cx++) {
        var sx = 0, sy = 0, sw = 0;
        for (var oy = -1; oy <= 1; oy++) {
          for (var ox = -1; ox <= 1; ox++) {
            var nx = cx + ox, ny = cy + oy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            var wt = (ox === 0 && oy === 0) ? 4 : ((ox === 0 || oy === 0) ? 2 : 1);
            var kk = (ny * cols + nx) * 2;
            sx += v[kk] * wt; sy += v[kk + 1] * wt; sw += wt;
          }
        }
        o[(cy * cols + cx) * 2] = sx / sw;
        o[(cy * cols + cx) * 2 + 1] = sy / sw;
      }
    }
    v = o;
  }
  return { ok: true, cols: cols, rows: rows, v: v, w: w, h: h, conf: conf, q: cs ? cs.q : 0, wObs: wObs, global: [gx, gy], lk: [vx, vy] };
}

self.onmessage = function (ev) {
  var msg = ev.data || {};
  if (msg.type !== "motion") return;
  try {
    var res = estimate(msg);
    res.id = msg.id;
    if (res.v) self.postMessage(res, [res.v.buffer]);
    else self.postMessage(res);
  } catch (e) {
    self.postMessage({ id: msg.id, ok: false, reason: String(e && e.message || e) });
  }
};
