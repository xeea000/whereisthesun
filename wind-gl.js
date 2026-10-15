// workspace/whereisthesun/wind-gl.js
/* SUNNY GPU wind particles (opt67), adapted from mapbox/webgl-wind by Vladimir Agafonkin.
 * webgl-wind licence (ISC): Copyright (c) 2017, Mapbox. Permission to use, copy, modify,
 * and/or distribute this software for any purpose with or without fee is hereby granted,
 * provided that the above copyright notice and this permission notice appear in all copies.
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO
 * THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS.
 * Changes for SUNNY: the wind texture is in screen space (CSS px per second, built by
 * app.js from the Open-Meteo u/v grid for the current view), particle positions are
 * screen fractions, respawn is uniform over the view so spread stays even, and trails
 * fade with a small floor so no ghost pixels stay behind. Positions are stored in RGBA
 * textures (two 8-bit channels per axis), so no float textures are needed. */
(function () {
  "use strict";
  var MAX_V = 100;
  var QUAD_VS = "precision mediump float;attribute vec2 a_pos;varying vec2 v_tex;" +
    "void main(){v_tex=a_pos;gl_Position=vec4(2.0*a_pos-1.0,0.0,1.0);}";
  var SCREEN_FS = "precision mediump float;uniform sampler2D u_screen;uniform float u_opacity;varying vec2 v_tex;" +
    "void main(){vec4 c=texture2D(u_screen,v_tex);gl_FragColor=max(c*u_opacity-vec4(1.5/255.0),0.0);}";
  var UPDATE_FS = "precision highp float;uniform sampler2D u_particles;uniform sampler2D u_wind;" +
    "uniform vec2 u_res;uniform float u_dt;uniform float u_seed;uniform float u_drop;varying vec2 v_tex;" +
    "float rand(vec2 co){vec3 r=vec3(12.9898,78.233,4375.85453);float t=dot(r.xy,co);return fract(sin(t)*(r.z+t));}" +
    "void main(){vec2 tc=v_tex;vec4 c=texture2D(u_particles,tc);vec2 pos=vec2(c.r/255.0+c.b,c.g/255.0+c.a);" +
    "vec4 w=texture2D(u_wind,pos);vec2 vel=(w.rg*2.0-1.0)*" + MAX_V.toFixed(1) + ";" +
    "pos=pos+vel*u_dt/u_res;vec2 seed=(pos+tc)*u_seed;" +
    "float drop=step(1.0-u_drop-w.b*0.01,rand(seed));" +
    "if(w.a<0.5||pos.x<0.0||pos.y<0.0||pos.x>1.0||pos.y>1.0)drop=1.0;" +
    "vec2 rp=vec2(rand(seed+1.3),rand(seed+2.1));pos=mix(pos,rp,drop);" +
    "gl_FragColor=vec4(fract(pos*255.0),floor(pos*255.0)/255.0);}";
  var DRAW_VS = "precision mediump float;attribute float a_index;uniform sampler2D u_particles;" +
    "uniform sampler2D u_wind;uniform float u_res;uniform float u_size;varying float v_speed;" +
    "void main(){vec4 c=texture2D(u_particles,vec2((mod(a_index,u_res)+0.5)/u_res,(floor(a_index/u_res)+0.5)/u_res));" +
    "vec2 pos=vec2(c.r/255.0+c.b,c.g/255.0+c.a);v_speed=texture2D(u_wind,pos).b;" +
    "gl_PointSize=u_size;gl_Position=vec4(2.0*pos.x-1.0,1.0-2.0*pos.y,0.0,1.0);}";
  var DRAW_FS = "precision mediump float;uniform vec3 u_color;uniform float u_alpha;varying float v_speed;" +
    "void main(){float a=u_alpha*(0.55+0.45*v_speed);gl_FragColor=vec4(u_color*a,a);}";
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
  function texture(gl, filter, data, w, h) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return t;
  }
  function bindTex(gl, t, unit) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
  }
  function randomState(n) {
    var a = new Uint8Array(n * n * 4);
    for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return a;
  }
  function Wind(canvas, count) {
    var gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: false, alpha: true });
    if (!gl) throw new Error("no webgl");
    this.gl = gl;
    this.canvas = canvas;
    this.res = Math.ceil(Math.sqrt(count));
    this.quadProg = program(gl, QUAD_VS, SCREEN_FS);
    this.updateProg = program(gl, QUAD_VS, UPDATE_FS);
    this.drawProg = program(gl, DRAW_VS, DRAW_FS);
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    var idx = new Float32Array(this.res * this.res);
    for (var i = 0; i < idx.length; i++) idx[i] = i;
    this.index = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.index);
    gl.bufferData(gl.ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.fb = gl.createFramebuffer();
    this.windTex = null;
    this.resetParticles();
    this.w = 0;
    this.h = 0;
  }
  function resetParticles() {
    var gl = this.gl;
    var s = randomState(this.res);
    this.stateA = texture(gl, gl.NEAREST, s, this.res, this.res);
    this.stateB = texture(gl, gl.NEAREST, s, this.res, this.res);
  }
  /* field: {cols, rows, data: Uint8Array RGBA}: R,G = velocity x,y (0.5 = still), B = speed 0..1, A = 255 where wind is known */
  function setField(field) {
    var gl = this.gl;
    if (this.windTex) gl.deleteTexture(this.windTex);
    this.windTex = texture(gl, gl.LINEAR, field.data, field.cols, field.rows);
    this.clear();
  }
  function resize() {
    var gl = this.gl;
    var w = this.canvas.width;
    var h = this.canvas.height;
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    var blank = new Uint8Array(w * h * 4);
    this.screenA = texture(gl, gl.NEAREST, blank, w, h);
    this.screenB = texture(gl, gl.NEAREST, blank, w, h);
  }
  function clear() {
    var gl = this.gl;
    this.resize();
    var t = [this.screenA, this.screenB];
    for (var i = 0; i < 2; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t[i], 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clear(gl.COLOR_BUFFER_BIT);
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
  function drawParticles(color, alpha, size) {
    var gl = this.gl;
    var p = this.drawProg;
    gl.useProgram(p.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.index);
    gl.enableVertexAttribArray(p.a_index);
    gl.vertexAttribPointer(p.a_index, 1, gl.FLOAT, false, 0, 0);
    bindTex(gl, this.windTex, 0);
    bindTex(gl, this.stateA, 1);
    gl.uniform1i(p.u_wind, 0);
    gl.uniform1i(p.u_particles, 1);
    gl.uniform1f(p.u_res, this.res);
    gl.uniform1f(p.u_size, size);
    gl.uniform3f(p.u_color, color[0], color[1], color[2]);
    gl.uniform1f(p.u_alpha, alpha);
    gl.drawArrays(gl.POINTS, 0, this.res * this.res);
  }
  /* one animation step: fade trails, draw particles, show, then move particles. vis 0..1 */
  function frame(dt, vis, dpr) {
    if (!this.windTex) return;
    var gl = this.gl;
    this.resize();
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.viewport(0, 0, this.w, this.h);
    var q = this.quadProg;
    gl.useProgram(q.p);
    bindTex(gl, this.screenA, 2);
    gl.uniform1i(q.u_screen, 2);
    gl.uniform1f(q.u_opacity, 0.9 + 0.075 * vis);
    gl.disable(gl.BLEND);
    this.quadPass(q, this.screenB);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    var size = (1 + 1.4 * vis) * dpr;
    if (vis > 0.5) this.drawParticles([0, 0.08, 0.16], 0.5 * (vis - 0.5), size + 1.5 * dpr);
    this.drawParticles([0.92, 0.96, 1], 0.25 + 0.6 * vis, size);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND);
    gl.useProgram(q.p);
    bindTex(gl, this.screenB, 2);
    gl.uniform1f(q.u_opacity, 1);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.quadPass(q, null);
    var t = this.screenA;
    this.screenA = this.screenB;
    this.screenB = t;
    var u = this.updateProg;
    gl.viewport(0, 0, this.res, this.res);
    gl.useProgram(u.p);
    bindTex(gl, this.windTex, 0);
    bindTex(gl, this.stateA, 1);
    gl.uniform1i(u.u_wind, 0);
    gl.uniform1i(u.u_particles, 1);
    gl.uniform2f(u.u_res, this.w / dpr, this.h / dpr);
    gl.uniform1f(u.u_dt, dt);
    gl.uniform1f(u.u_seed, Math.random());
    gl.uniform1f(u.u_drop, 0.012);
    this.quadPass(u, this.stateB);
    t = this.stateA;
    this.stateA = this.stateB;
    this.stateB = t;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  Wind.prototype.resetParticles = resetParticles;
  Wind.prototype.setField = setField;
  Wind.prototype.resize = resize;
  Wind.prototype.clear = clear;
  Wind.prototype.quadPass = quadPass;
  Wind.prototype.drawParticles = drawParticles;
  Wind.prototype.frame = frame;
  /* build the screen-space wind texture. sample(xCss, yCss) → {x, y} px/s or null; speed01 */
  function buildField(cols, rows, w, h, sample) {
    var data = new Uint8Array(cols * rows * 4);
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var k = (r * cols + c) * 4;
        var s = sample((c + 0.5) / cols * w, (r + 0.5) / rows * h);
        if (!s) {
          data[k] = 128;
          data[k + 1] = 128;
          continue;
        }
        data[k] = Math.round(Math.max(0, Math.min(1, s.x / MAX_V * 0.5 + 0.5)) * 255);
        data[k + 1] = Math.round(Math.max(0, Math.min(1, s.y / MAX_V * 0.5 + 0.5)) * 255);
        data[k + 2] = Math.round(Math.max(0, Math.min(1, s.speed01)) * 255);
        data[k + 3] = 255;
      }
    }
    return { cols: cols, rows: rows, data: data };
  }
  function create(canvas, count) {
    try {
      return new Wind(canvas, count);
    } catch (eW) {
      return null;
    }
  }
  window.SunnyWindGL = { create: create, buildField: buildField };
})();
