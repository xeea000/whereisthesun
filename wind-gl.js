// workspace/whereisthesun/wind-gl.js
/* SUNNY GPU wind particles (opt67), adapted from mapbox/webgl-wind by Vladimir Agafonkin.
 * webgl-wind licence (ISC): Copyright (c) 2017, Mapbox. Permission to use, copy, modify,
 * and/or distribute this software for any purpose with or without fee is hereby granted,
 * provided that the above copyright notice and this permission notice appear in all copies.
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO
 * THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS.
 * Changes for SUNNY (opt70): particles live in map space (Web Mercator, kept in float64 on
 * the CPU) and move along the fixed geographic field from wind-field.js, so the flow is
 * tied to places, not to the camera. Each frame they are projected to the screen and drawn
 * as GPU points over a fading trail texture. Panning or zooming never resets them: trails
 * fade faster while the map moves, and only particles that leave the view, age out or
 * crowd one spot respawn, into the emptiest part of the screen, so spread stays even. */
(function () {
  "use strict";
  var QUAD_VS = "precision mediump float;attribute vec2 a_pos;varying vec2 v_tex;" +
    "void main(){v_tex=a_pos;gl_Position=vec4(2.0*a_pos-1.0,0.0,1.0);}";
  var SCREEN_FS = "precision mediump float;uniform sampler2D u_screen;uniform float u_opacity;varying vec2 v_tex;" +
    "void main(){vec4 c=texture2D(u_screen,v_tex);gl_FragColor=max(c*u_opacity-vec4(1.5/255.0),0.0);}";
  var DRAW_VS = "precision mediump float;attribute vec3 a_p;uniform float u_size;varying float v_a;" +
    "void main(){v_a=a_p.z;gl_PointSize=u_size;gl_Position=vec4(a_p.xy,0.0,1.0);}";
  var DRAW_FS = "precision mediump float;uniform vec3 u_color;uniform float u_alpha;varying float v_a;" +
    "void main(){float a=u_alpha*v_a;gl_FragColor=vec4(u_color*a,a);}";
  var GX = 16;
  var GY = 10;
  function shader(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var out = { p: p };
    var n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var u = gl.getActiveUniform(p, i).name;
      out[u] = gl.getUniformLocation(p, u);
    }
    n = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (i = 0; i < n; i++) {
      var a = gl.getActiveAttrib(p, i).name;
      out[a] = gl.getAttribLocation(p, a);
    }
    return out;
  }
  function texture(gl, w, h) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  }
  /* Web Mercator: x, y in 0..1 (y down) */
  function toLngLat(x, y) {
    return [x * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI];
  }
  function toMerc(lng, lat) {
    var s = Math.sin(lat * Math.PI / 180);
    return [(lng + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
  }
  /* screen = A * (merc - m0) + s0, from three projected points (handles bearing) */
  function affine(map) {
    var c = map.getCenter();
    var m0 = toMerc(c.lng, c.lat);
    var d = 1e-4 / Math.pow(2, Math.max(0, map.getZoom() - 4));
    var p0 = map.project(toLngLat(m0[0], m0[1]));
    var px = map.project(toLngLat(m0[0] + d, m0[1]));
    var py = map.project(toLngLat(m0[0], m0[1] + d));
    var a = (px.x - p0.x) / d, b = (py.x - p0.x) / d, c2 = (px.y - p0.y) / d, e = (py.y - p0.y) / d;
    var det = a * e - b * c2;
    return { a: a, b: b, c: c2, e: e, ia: e / det, ib: -b / det, ic: -c2 / det, ie: a / det, m0: m0, s0: [p0.x, p0.y] };
  }
  function Wind(canvas, count, field) {
    this.field = field || null;
    var gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: false, alpha: true });
    if (!gl) throw new Error("no webgl");
    this.gl = gl;
    this.canvas = canvas;
    this.n = count;
    this.quadProg = program(gl, QUAD_VS, SCREEN_FS);
    this.drawProg = program(gl, DRAW_VS, DRAW_FS);
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    this.pbuf = gl.createBuffer();
    this.verts = new Float32Array(count * 3);
    this.fb = gl.createFramebuffer();
    this.mx = new Float64Array(count);
    this.my = new Float64Array(count);
    this.age = new Float32Array(count);
    this.life = new Float32Array(count);
    this.cells = new Int16Array(GX * GY);
    this.seeded = false;
    this.w = 0;
    this.h = 0;
    this.drawn = 0;
    this.respawns = 0;
  }
  function resize() {
    var gl = this.gl;
    var w = this.canvas.width;
    var h = this.canvas.height;
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.screenA = texture(gl, w, h);
    this.screenB = texture(gl, w, h);
  }
  function cellOf(sx, sy, vw, vh) {
    var cx = Math.floor(sx / vw * GX);
    var cy = Math.floor(sy / vh * GY);
    return cx < 0 || cy < 0 || cx >= GX || cy >= GY ? -1 : cy * GX + cx;
  }
  /* put particle k at a random spot in the emptiest screen cell */
  function respawn(k, A, vw, vh) {
    var start = Math.floor(Math.random() * GX * GY);
    var best = start;
    for (var q = 0; q < GX * GY; q++) {
      var ci = (start + q) % (GX * GY);
      if (this.cells[ci] < this.cells[best]) best = ci;
      if (this.cells[best] === 0) break;
    }
    this.cells[best]++;
    this.respawns++;
    var sx = ((best % GX) + Math.random()) / GX * vw - A.s0[0];
    var sy = (Math.floor(best / GX) + Math.random()) / GY * vh - A.s0[1];
    this.mx[k] = A.m0[0] + A.ia * sx + A.ib * sy;
    this.my[k] = A.m0[1] + A.ic * sx + A.ie * sy;
    this.age[k] = 0;
    this.life[k] = 3 + Math.random() * 5;
  }
  /* advance, project and pack the particles; returns how many to draw */
  function step(map, dt, vw, vh, moving) {
    var A = affine(map);
    var k, sx, sy, ci;
    var field = this.field || window.SunnyWindField;
    this.cells.fill(0);
    for (k = 0; k < this.n; k++) {
      sx = A.a * (this.mx[k] - A.m0[0]) + A.b * (this.my[k] - A.m0[1]) + A.s0[0];
      sy = A.c * (this.mx[k] - A.m0[0]) + A.e * (this.my[k] - A.m0[1]) + A.s0[1];
      ci = cellOf(sx, sy, vw, vh);
      if (ci >= 0 && this.seeded) this.cells[ci]++;
    }
    if (!this.seeded) {
      for (k = 0; k < this.n; k++) {
        respawn.call(this, k, A, vw, vh);
        this.age[k] = Math.random() * this.life[k];
      }
      this.seeded = true;
    }
    var mean = this.n / (GX * GY);
    var m = 0;
    for (k = 0; k < this.n; k++) {
      var ll = toLngLat(this.mx[k], this.my[k]);
      var s = field.sample(ll[0], ll[1]);
      sx = A.a * (this.mx[k] - A.m0[0]) + A.b * (this.my[k] - A.m0[1]) + A.s0[0];
      sy = A.c * (this.mx[k] - A.m0[0]) + A.e * (this.my[k] - A.m0[1]) + A.s0[1];
      ci = cellOf(sx, sy, vw, vh);
      this.age[k] += dt;
      var crowded = !moving && ci >= 0 && this.cells[ci] > mean * 2.2 && Math.random() < 0.02;
      if (ci < 0 || this.age[k] > this.life[k] || crowded || (!s && Math.random() < 0.01)) {
        if (ci >= 0) this.cells[ci]--;
        respawn.call(this, k, A, vw, vh);
        continue;
      }
      if (!s) continue;
      var sp = Math.sqrt(s.u * s.u + s.v * s.v);
      if (sp < 0.05) continue;
      var pps = Math.max(10, Math.min(90, 8 + sp * 3.6 * 1.6));
      var dxs = A.a * s.u - A.b * s.v;
      var dys = A.c * s.u - A.e * s.v;
      var len = Math.sqrt(dxs * dxs + dys * dys) || 1;
      dxs = dxs / len * pps * dt;
      dys = dys / len * pps * dt;
      this.mx[k] += A.ia * dxs + A.ib * dys;
      this.my[k] += A.ic * dxs + A.ie * dys;
      var fade = Math.min(1, this.age[k] / 0.3, (this.life[k] - this.age[k]) / 0.4);
      this.verts[m * 3] = (sx + dxs) / vw * 2 - 1;
      this.verts[m * 3 + 1] = 1 - (sy + dys) / vh * 2;
      this.verts[m * 3 + 2] = fade * (0.55 + 0.45 * Math.min(1, sp / 17));
      m++;
    }
    return m;
  }
  function quadPass(prog, target) {
    var gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? this.fb : null);
    if (target) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(prog.a_pos);
    gl.vertexAttribPointer(prog.a_pos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  function drawPoints(color, alpha, size) {
    var gl = this.gl;
    var p = this.drawProg;
    gl.useProgram(p.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pbuf);
    gl.enableVertexAttribArray(p.a_p);
    gl.vertexAttribPointer(p.a_p, 3, gl.FLOAT, false, 0, 0);
    gl.uniform1f(p.u_size, size);
    gl.uniform3f(p.u_color, color[0], color[1], color[2]);
    gl.uniform1f(p.u_alpha, alpha);
    gl.drawArrays(gl.POINTS, 0, this.drawn);
  }
  /* one frame: move particles, fade trails (faster while the map moves), draw, show. vis 0..1 */
  function frame(map, dt, vis, dpr) {
    var gl = this.gl;
    this.resize();
    var moving = false;
    try { moving = map.isMoving() || map.isZooming() || map.isRotating(); } catch (eM) {}
    this.drawn = this.step(map, dt, this.w / dpr, this.h / dpr, moving);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pbuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.verts.subarray(0, this.drawn * 3), gl.DYNAMIC_DRAW);
    gl.disable(gl.DEPTH_TEST);
    gl.viewport(0, 0, this.w, this.h);
    var q = this.quadProg;
    gl.useProgram(q.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.screenA);
    gl.uniform1i(q.u_screen, 0);
    gl.uniform1f(q.u_opacity, moving ? 0.55 : 0.9 + 0.075 * vis);
    gl.disable(gl.BLEND);
    this.quadPass(q, this.screenB);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    var size = (1 + 1.4 * vis) * dpr;
    if (vis > 0.5) this.drawPoints([0, 0.08, 0.16], 0.5 * (vis - 0.5), size + 1.5 * dpr);
    this.drawPoints([0.92, 0.96, 1], 0.25 + 0.6 * vis, size);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND);
    gl.useProgram(q.p);
    gl.bindTexture(gl.TEXTURE_2D, this.screenB);
    gl.uniform1f(q.u_opacity, 1);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.quadPass(q, null);
    var t = this.screenA;
    this.screenA = this.screenB;
    this.screenB = t;
  }
  function particleState() {
    return { n: this.n, drawn: this.drawn, respawns: this.respawns, mx: Array.prototype.slice.call(this.mx, 0, 50), my: Array.prototype.slice.call(this.my, 0, 50) };
  }
  Wind.prototype.resize = resize;
  Wind.prototype.step = step;
  Wind.prototype.quadPass = quadPass;
  Wind.prototype.drawPoints = drawPoints;
  Wind.prototype.frame = frame;
  Wind.prototype.state = particleState;
  var last = null;
  /* field: any object with sample(lon, lat) returning {u, v} or null; wind by default */
  function create(canvas, count, field) {
    try {
      var w = new Wind(canvas, count, field);
      if (!field) last = w;
      return w;
    } catch (eW) {
      return null;
    }
  }
  function debug() {
    return last ? last.state() : null;
  }
  window.SunnyWindGL = { create: create, debug: debug };
})();
