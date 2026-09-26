/* SUNNY opt60 — shared, layer-agnostic frame-tween engine.
 *
 *   SunnyTween.createRenderer(canvas)          GPU (WebGL) warp+blend, 2D linear fallback
 *   SunnyTween.createMotionEstimator(opts)     regularized coarse A→B motion (worker)
 *   SunnyTween.createAnimatedRasterLayer(opts) playhead → (i0,i1,t) → images+flow → render
 *
 * Interpolation (per pixel, at tween t, V = smooth A→B displacement over the frame
 * interval; same V for the whole interval):
 *     a = A(p − t·V),  b = B(p + (1−t)·V),  out = (1−t)·a + t·b
 * i.e. bidirectional semi-Lagrangian advection correction (Anagnostou & Krajewski
 * 1999, as implemented in pySTEPS' advection_correction example, BSD-3). At t=0
 * and t=1 the output is exactly frame A / frame B, so V only shapes the in-between.
 * A layer plugs in with a small "source" adapter: count, images(i), kick(i),
 * pairKey(i0,i1), prior(i0,i1), channel. No per-layer animation code.
 */
(function (root) {
  "use strict";

  var MAX_FLOW_CELLS = 20; /* shader uniform array size (e.g. 5×4) */

  var VS = [
    "attribute vec2 aPos;",
    "varying vec2 vUv;",
    "void main(){ vUv = vec2((aPos.x + 1.0) * 0.5, 1.0 - (aPos.y + 1.0) * 0.5);",
    "  gl_Position = vec4(aPos, 0.0, 1.0); }"
  ].join("\n");

  /* Flow bilinear via tent weights over a small uniform grid — constant-index loop,
     so it is valid GLSL ES 1.0 (WebGL1) with no float-texture extensions. */
  var FS = [
    "precision highp float;",
    "varying vec2 vUv;",
    "uniform sampler2D uA; uniform sampler2D uB;",
    "uniform float uT; uniform float uAlpha; uniform float uHasB;",
    "uniform vec2 uGrid; uniform vec2 uFlow[" + MAX_FLOW_CELLS + "]; uniform float uUseFlow;",
    "vec2 flowAt(vec2 uv){",
    "  vec2 g = uv * uGrid - 0.5; vec2 acc = vec2(0.0); float ws = 0.0;",
    "  for (int i = 0; i < " + MAX_FLOW_CELLS + "; i++) {",
    "    float fi = float(i); if (fi >= uGrid.x * uGrid.y) break;",
    "    float cy = floor(fi / uGrid.x); float cx = fi - cy * uGrid.x;",
    "    vec2 d = clamp(g, vec2(0.0), uGrid - 1.0) - vec2(cx, cy);",
    "    float w = max(0.0, 1.0 - abs(d.x)) * max(0.0, 1.0 - abs(d.y));",
    "    acc += w * uFlow[i]; ws += w; }",
    "  return ws > 0.0 ? acc / ws : vec2(0.0); }",
    "float inside(vec2 p){ vec2 q = step(vec2(0.0), p) * step(p, vec2(1.0)); return q.x * q.y; }",
    "void main(){",
    "  vec2 V = uUseFlow > 0.5 ? flowAt(vUv) : vec2(0.0);",
    "  vec2 pa = vUv - uT * V; vec2 pb = vUv + (1.0 - uT) * V;",
    "  vec4 a = texture2D(uA, pa); vec4 b = texture2D(uB, pb);",
    "  float wa = (1.0 - uT) * inside(pa); float wb = uT * inside(pb) * uHasB;",
    "  vec4 c;",
    "  if (wa + wb < 1e-4) { c = mix(texture2D(uA, vUv), texture2D(uB, vUv), uT * uHasB); }",
    "  else { c = (a * wa + b * wb) / (wa + wb); }",
    "  if (uHasB < 0.5) c = texture2D(uA, vUv);",
    "  gl_FragColor = c * uAlpha; }"
  ].join("\n");

  function displaySize(canvas, maxSide, maxPixels) {
    var cw = canvas.clientWidth || (canvas.parentNode && canvas.parentNode.clientWidth) || 800;
    var ch = canvas.clientHeight || (canvas.parentNode && canvas.parentNode.clientHeight) || 600;
    var dpr = 1;
    try { dpr = Math.min(2.5, Math.max(1, root.devicePixelRatio || 1)); } catch (e) {}
    var w = Math.round(cw * dpr), h = Math.round(ch * dpr), s = 1;
    if (Math.max(w, h) > maxSide) s = maxSide / Math.max(w, h);
    if (w * h * s * s > maxPixels) s = Math.sqrt(maxPixels / (w * h));
    return { w: Math.max(64, Math.round(w * s)), h: Math.max(48, Math.round(h * s)) };
  }

  function createRenderer(canvas, opts) {
    opts = opts || {};
    var maxSide = opts.maxSide || 2560, maxPixels = opts.maxPixels || 2560 * 1600;
    var gl = null, prog = null, loc = {}, lost = false, ctx2d = null;
    var texCache = new Map(); /* img → {tex, key} (insertion order = LRU) */
    var TEX_CAP = opts.texCap || 8;
    if (!opts.force2d) {
      try {
        var ga = { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false };
        gl = canvas.getContext("webgl", ga) || canvas.getContext("experimental-webgl", ga);
      } catch (e) { gl = null; }
    }
    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    if (gl) {
      try {
        prog = gl.createProgram();
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
        gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        gl.useProgram(prog);
        var buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        var ap = gl.getAttribLocation(prog, "aPos");
        gl.enableVertexAttribArray(ap);
        gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
        ["uA", "uB", "uT", "uAlpha", "uHasB", "uGrid", "uFlow", "uUseFlow"].forEach(function (n) {
          loc[n] = gl.getUniformLocation(prog, n);
        });
        gl.uniform1i(loc.uA, 0);
        gl.uniform1i(loc.uB, 1);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        canvas.addEventListener("webglcontextlost", function (ev) { ev.preventDefault(); lost = true; texCache.clear(); }, false);
      } catch (eGl) {
        try { console.warn("SUNNY tween: WebGL init failed, 2D fallback", eGl); } catch (e2) {}
        gl = null;
      }
    }
    if (!gl) {
      try { ctx2d = canvas.getContext("2d", { alpha: true }); } catch (e3) { ctx2d = null; }
    }

    function fit() {
      var d = displaySize(canvas, maxSide, maxPixels);
      if (canvas.width !== d.w || canvas.height !== d.h) { canvas.width = d.w; canvas.height = d.h; }
      return d;
    }

    function texFor(img) {
      var rec = texCache.get(img);
      var ver = (img.naturalWidth || img.width) + "x" + (img.naturalHeight || img.height) + "|" + (img.__sunnyVer || 0);
      if (rec && rec.ver === ver) {
        texCache.delete(img); texCache.set(img, rec); /* touch */
        return rec.tex;
      }
      if (!rec) {
        while (texCache.size >= TEX_CAP) {
          var oldest = texCache.keys().next().value;
          var o = texCache.get(oldest);
          try { gl.deleteTexture(o.tex); } catch (eD) {}
          texCache.delete(oldest);
        }
        rec = { tex: gl.createTexture(), ver: "" };
      }
      gl.bindTexture(gl.TEXTURE_2D, rec.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); /* throws if tainted */
      rec.ver = ver;
      texCache.set(img, rec);
      return rec.tex;
    }

    function ready(img) {
      return !!(img && ((img.naturalWidth || img.width) > 0) && (img.complete !== false));
    }

    /* passes: [{a, b, alpha}], t in [0,1], flow: {cols, rows, v(Float32 UV)} | null */
    /* A canvas can hold one context type: to fall back from WebGL (tainted image,
       lost context) swap in a fresh clone of the element and use 2D linear blend. */
    function downgrade(reason) {
      try { console.warn("SUNNY tween: 2D fallback (" + reason + ")"); } catch (e0) {}
      try {
        var c2 = canvas.cloneNode(false);
        if (canvas.parentNode) canvas.parentNode.replaceChild(c2, canvas);
        canvas = c2;
      } catch (eC) {}
      gl = null; texCache.clear(); lost = false;
      try { ctx2d = canvas.getContext("2d", { alpha: true }); } catch (e3) { ctx2d = null; }
      api.mode = ctx2d ? "2d" : "none";
    }

    function render(passes, t, flow) {
      if (lost) downgrade("context lost");
      var d = fit();
      if (gl) {
        try {
          gl.viewport(0, 0, d.w, d.h);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.useProgram(prog);
          var useFlow = !!(flow && flow.v && flow.cols * flow.rows <= MAX_FLOW_CELLS);
          gl.uniform1f(loc.uUseFlow, useFlow ? 1 : 0);
          if (useFlow) {
            gl.uniform2f(loc.uGrid, flow.cols, flow.rows);
            var arr = new Float32Array(MAX_FLOW_CELLS * 2);
            arr.set(flow.v.subarray ? flow.v.subarray(0, flow.cols * flow.rows * 2) : flow.v);
            gl.uniform2fv(loc.uFlow, arr);
          } else {
            gl.uniform2f(loc.uGrid, 1, 1);
          }
          gl.uniform1f(loc.uT, t);
          var drew = 0;
          for (var i = 0; i < passes.length; i++) {
            var p = passes[i];
            if (!p || !ready(p.a) || !(p.alpha > 0.001)) continue;
            var hasB = ready(p.b) && p.b !== p.a;
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texFor(p.a));
            gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, hasB ? texFor(p.b) : texFor(p.a));
            gl.uniform1f(loc.uHasB, hasB ? 1 : 0);
            gl.uniform1f(loc.uAlpha, p.alpha == null ? 1 : p.alpha);
            if (drew) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); }
            else gl.disable(gl.BLEND);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            drew++;
          }
          return drew > 0;
        } catch (eR) {
          try { console.warn("SUNNY tween render " + String(eR && eR.message || eR) + " a=" + String(passes[0] && passes[0].a && (passes[0].a.src || passes[0].a.tagName)).slice(0, 160)); } catch (e4) {}
          if (eR && (eR.name === "SecurityError" || /cross-origin|tainted/i.test(String(eR.message)))) {
            downgrade("tainted image");
            return render(passes, t, flow);
          }
          return false;
        }
      }
      if (!ctx2d) return false;
      /* 2D fallback: plain linear per-pixel crossfade (no warp) */
      try {
        ctx2d.imageSmoothingEnabled = true;
        ctx2d.imageSmoothingQuality = "high";
        ctx2d.globalAlpha = 1;
        ctx2d.clearRect(0, 0, d.w, d.h);
        var drew2 = 0;
        for (var j = 0; j < passes.length; j++) {
          var q = passes[j];
          if (!q || !ready(q.a) || !(q.alpha > 0.001)) continue;
          var al = q.alpha == null ? 1 : q.alpha;
          ctx2d.globalAlpha = al;
          ctx2d.drawImage(q.a, 0, 0, d.w, d.h);
          if (ready(q.b) && q.b !== q.a && t > 0) {
            ctx2d.globalAlpha = al * t;
            ctx2d.drawImage(q.b, 0, 0, d.w, d.h);
          }
          drew2++;
        }
        ctx2d.globalAlpha = 1;
        return drew2 > 0;
      } catch (e5) {
        return false;
      }
    }

    var api = {
      mode: gl ? "webgl" : (ctx2d ? "2d" : "none"),
      render: render,
      canvas: function () { return canvas; },
      isLost: function () { return lost; },
      dropTextures: function () {
        if (gl) texCache.forEach(function (r) { try { gl.deleteTexture(r.tex); } catch (e) {} });
        texCache.clear();
      }
    };
    return api;
  }

  /* ---- motion estimator (worker) ---- */
  function createMotionEstimator(opts) {
    opts = opts || {};
    var worker = null, seq = 0, pending = {}, cache = new Map(), inflight = {};
    var CAP = opts.cap || 64;
    var EST_W = opts.estWidth || 256;
    var scratch = null;
    function getWorker() {
      if (worker || worker === false) return worker || null;
      try {
        worker = new Worker(opts.workerUrl || "motion-worker.js");
        worker.onmessage = function (ev) {
          var m = ev.data || {};
          var p = pending[m.id];
          if (p) { delete pending[m.id]; p(m); }
        };
        worker.onerror = function () { worker = false; };
      } catch (e) { worker = false; }
      return worker || null;
    }
    /* intensity channel: "cloud" = whiteness above a land/ocean floor; "radar" = distance-from-white × alpha */
    function channelOf(img, w, h, mode) {
      if (!scratch) scratch = document.createElement("canvas");
      scratch.width = w; scratch.height = h;
      var c = scratch.getContext("2d", { willReadFrequently: true });
      c.clearRect(0, 0, w, h);
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = "high";
      c.drawImage(img, 0, 0, w, h);
      var d = c.getImageData(0, 0, w, h).data; /* throws if tainted */
      var out = new Float32Array(w * h);
      for (var i = 0, j = 0; i < out.length; i++, j += 4) {
        var r = d[j], g = d[j + 1], b = d[j + 2], a = d[j + 3];
        var mn = Math.min(r, g, b);
        if (mode === "radar") out[i] = a === 0 ? 0 : ((255 - mn) * a) / 255;
        else out[i] = Math.max(0, mn - 90) * 1.5;
      }
      return out;
    }
    function get(key) {
      var r = cache.get(key);
      if (r) { cache.delete(key); cache.set(key, r); }
      return r || null;
    }
    function put(key, rec) {
      cache.set(key, rec);
      while (cache.size > CAP) cache.delete(cache.keys().next().value);
    }
    /* prior: {dx, dy} in UV units (A→B), or null */
    function estimate(key, imgA, imgB, o) {
      o = o || {};
      if (cache.has(key)) return Promise.resolve(get(key));
      if (inflight[key]) return inflight[key];
      var p = new Promise(function (resolve) {
        var nw = imgA.naturalWidth || imgA.width, nh = imgA.naturalHeight || imgA.height;
        if (!nw || !nh) { resolve(null); return; }
        var w = Math.min(EST_W, nw), h = Math.max(16, Math.round(w * nh / nw));
        var a, b;
        try { a = channelOf(imgA, w, h, o.channel); b = channelOf(imgB, w, h, o.channel); }
        catch (eT) { resolve(o.prior ? windOnly() : null); return; }
        var prior = o.prior ? { dx: o.prior.dx * w, dy: o.prior.dy * h } : null;
        function windOnly() {
          var nc = o.cols || 4, nr = o.rows || 3, n = nc * nr, vv = new Float32Array(n * 2);
          for (var k = 0; k < n; k++) { vv[k * 2] = o.prior.dx; vv[k * 2 + 1] = o.prior.dy; }
          return { cols: nc, rows: nr, v: vv, conf: 0, source: "wind" };
        }
        var msg = {
          type: "motion", id: ++seq, w: w, h: h, a: a.buffer, b: b.buffer, prior: prior,
          cols: o.cols || 4, rows: o.rows || 3, maxMag: (o.maxMagUv || 0.12) * w,
          confK: o.confK || 4, minConf: o.minConf || 1.5
        };
        var wk = getWorker();
        if (!wk) { resolve(o.prior ? windOnly() : null); return; }
        pending[msg.id] = function (m) {
          if (!m || !m.ok || !m.v) {
            /* no confident estimate: wind-only field if we have a prior */
            resolve(prior ? windOnly() : null);
            return;
          }
          var uv = new Float32Array(m.v.length);
          for (var q = 0; q < m.v.length; q += 2) { uv[q] = m.v[q] / w; uv[q + 1] = m.v[q + 1] / h; }
          resolve({ cols: m.cols, rows: m.rows, v: uv, conf: m.conf, source: prior ? "wind+lk" : "lk",
                    global: [m.global[0] / w, m.global[1] / h] });
        };
        try { wk.postMessage(msg, [msg.a, msg.b]); } catch (eP) { delete pending[msg.id]; resolve(o.prior ? windOnly() : null); }
      }).then(function (rec) {
        delete inflight[key];
        if (rec) put(key, rec);
        else put(key, { none: true });
        return rec;
      });
      inflight[key] = p;
      return p;
    }
    return { estimate: estimate, get: get, clear: function () { cache.clear(); } };
  }

  function blendFlows(list) {
    /* weighted average of same-shape flows: [{f, w}] */
    var base = null, i, k, ws = 0;
    for (i = 0; i < list.length; i++) if (list[i].f && list[i].f.v) { base = list[i].f; break; }
    if (!base) return null;
    var out = new Float32Array(base.v.length);
    for (i = 0; i < list.length; i++) {
      var f = list[i].f;
      if (!f || !f.v || f.v.length !== out.length) continue;
      for (k = 0; k < out.length; k++) out[k] += f.v[k] * list[i].w;
      ws += list[i].w;
    }
    for (k = 0; k < out.length; k++) out[k] /= ws;
    return { cols: base.cols, rows: base.rows, v: out };
  }

  /* ---- generic animated raster layer ---- */
  function createAnimatedRasterLayer(o) {
    var renderer = createRenderer(o.canvas, o.renderer || {});
    var estimator = o.estimator || createMotionEstimator(o.estimatorOpts || {});
    var src = o.source;
    var locks = new Map(); /* pairKey → flow|null, frozen for the whole interval */
    var lastPair = "";
    var stats = { frames: 0, flowFrames: 0, mode: renderer.mode, lastSource: "" };
    Object.defineProperty(stats, "mode", { get: function () { return renderer.mode; }, enumerable: true });

    function flowRec(i0, i1) {
      var k = src.pairKey(i0, i1);
      var r = k ? estimator.get(k) : null;
      return r && !r.none ? r : null;
    }

    function requestFlow(i0, i1) {
      if (!o.motion || renderer.mode !== "webgl" || i1 === i0) return;
      var k = src.pairKey(i0, i1);
      if (!k || estimator.get(k)) return;
      var ia = src.images(i0), ib = src.images(i1);
      if (!ia || !ib || !ia.base || !ib.base) return;
      estimator.estimate(k, ia.base, ib.base, {
        channel: src.channel, prior: src.prior ? src.prior(i0, i1) : null,
        cols: src.cols || 4, rows: src.rows || 3, maxMagUv: src.maxMagUv || 0.12
      });
    }

    /* Temporal consistency: V is decided once per interval (at its first rendered
       frame) and frozen; neighbours' fields are blended in for smooth velocity
       changes across intervals. If no field is ready at interval start, the whole
       interval renders as a plain linear blend (never switches mid-interval). */
    function lockedFlow(i0, i1, t) {
      var k = src.pairKey(i0, i1);
      if (!k) return null;
      if (locks.has(k)) return locks.get(k);
      var cur = flowRec(i0, i1);
      var f = null;
      if (cur && t < 0.08) {
        var parts = [{ f: cur, w: 2 }];
        var prev = i0 > 0 ? flowRec(i0 - 1, i0) : null;
        var next = flowRec(i1, i1 + 1);
        if (prev) parts.push({ f: prev, w: 1 });
        if (next) parts.push({ f: next, w: 1 });
        f = blendFlows(parts);
        f.source = cur.source;
        locks.set(k, f);
      } else if (t < 0.08 && src.prior && !estimator.get(k)) {
        /* estimate still in flight at interval start: freeze the wind-only prior field
           for this interval (truthful, smooth) rather than waiting */
        var pr = src.prior(i0, i1);
        if (pr && isFinite(pr.dx) && isFinite(pr.dy)) {
          var nc = src.cols || 4, nr = src.rows || 3, vv = new Float32Array(nc * nr * 2);
          for (var q = 0; q < nc * nr; q++) { vv[q * 2] = pr.dx; vv[q * 2 + 1] = pr.dy; }
          f = { cols: nc, rows: nr, v: vv, source: "wind" };
          locks.set(k, f);
        }
      } else if (t >= 0.08) {
        locks.set(k, null); /* too late to start warping this interval */
      }
      while (locks.size > 64) locks.delete(locks.keys().next().value);
      return f;
    }

    function paintAt(frac, maxIndex) {
      var n = src.count();
      if (!n) return false;
      var max = maxIndex == null ? n - 1 : maxIndex;
      var i0 = Math.max(0, Math.min(max, Math.floor(frac)));
      var i1 = Math.min(max, i0 + 1);
      var t = Math.max(0, Math.min(1, frac - i0));
      if (i0 >= max) { i0 = max; i1 = max; t = 0; }
      var A = src.images(i0), B = i1 !== i0 ? src.images(i1) : null;
      if (src.kick) { src.kick(i0); src.kick(i1); src.kick(Math.min(max, i1 + 1)); }
      requestFlow(i0, i1);
      if (i1 + 1 <= max) requestFlow(i1, i1 + 1);
      if (i1 + 2 <= max) requestFlow(i1 + 1, i1 + 2);
      var baseA = A && A.base, baseB = B && B.base;
      if (!baseA && baseB) { baseA = baseB; baseB = null; t = 0; }
      if (!baseA) return false;
      if (!baseB) t = 0;
      var pairNow = i0 + ">" + i1;
      if (pairNow !== lastPair && baseB) {
        /* re-entering an interval (next loop / scrub): a null lock (was too late) may retry */
        var kk = src.pairKey(i0, i1);
        if (kk && locks.has(kk) && locks.get(kk) === null) locks.delete(kk);
      }
      var flow = (baseB && renderer.mode === "webgl" && o.motion) ? lockedFlow(i0, i1, t) : null;
      var passes = [{ a: baseA, b: baseB, alpha: 1 }];
      /* optional full-res pass (same flow; UV-space field is resolution independent) */
      var hiA = A && A.hi, hiB = B && B.hi;
      var fA = (A && A.hi) ? (A.hiFade != null ? A.hiFade : 1) : 0;
      var fB = (B && B.hi) ? (B.hiFade != null ? B.hiFade : 1) : 0;
      var hiFade = Math.max(fA, fB);
      if ((hiA || hiB) && hiFade > 0) {
        passes.push({ a: hiA || baseA, b: baseB ? (hiB || baseB) : null, alpha: hiFade });
      }
      var ok = renderer.render(passes, t, flow);
      if (ok) {
        stats.frames++;
        if (flow) stats.flowFrames++;
        stats.lastSource = flow ? (flow.source || "flow") : "linear";
        if (flow) {
          var mx = 0, my = 0, nn = flow.cols * flow.rows;
          for (var qq = 0; qq < nn; qq++) { mx += flow.v[qq * 2]; my += flow.v[qq * 2 + 1]; }
          stats.meanV = [+(mx / nn).toFixed(4), +(my / nn).toFixed(4)]; /* UV per interval */
        }
        stats.pair = pairNow;
      }
      lastPair = pairNow;
      return ok;
    }

    /* one-shot pair blend through the SAME renderer (scrub / bootstrap / radar step) */
    function paintImages(a, b, t) {
      if (!a) return false;
      return renderer.render([{ a: a, b: b || null, alpha: 1 }], b ? Math.max(0, Math.min(1, t)) : 0, null);
    }

    return {
      paintAt: paintAt,
      paintImages: paintImages,
      renderer: renderer,
      estimator: estimator,
      stats: stats,
      resetLocks: function () { locks.clear(); },
      clearFlows: function () { locks.clear(); estimator.clear(); }
    };
  }

  root.SunnyTween = {
    createRenderer: createRenderer,
    createMotionEstimator: createMotionEstimator,
    createAnimatedRasterLayer: createAnimatedRasterLayer
  };
})(typeof window !== "undefined" ? window : this);
