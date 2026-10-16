(function () {
'use strict';

// Сверка 1:1: нынешний прицел, нарисованный страницей поверх кадра игры без прицела, против кадра игры с прицелом.
// Как в Godot (Forward+, Metal): ленты прицела — прозрачная 3D-сетка в HDR-картинке сцены с MSAA 4×, проверка глубины
// по сцене, смешивание в линейном свете, затем AgX, sRGB и дизеринг; кольцо и буквы — 2D поверх; сверху — интерфейс.
// Фон HDR берётся из готового кадра без прицела обратным AgX: так ленты ложатся на ту же воду, что в игре.
// Картинку с MSAA страница хранит строкой 0 вверху, как Godot на Metal: иначе точки MSAA внутри пикселя отражены по
// вертикали, и края лент сглаживаются не так, как в игре.

const L = window.AimLab;

const FULL_VS = `#version 300 es
precision highp float;
const vec2 P[3] = vec2[](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }`;

const COMMON = `
const mat3 INSET = mat3(
  0.544814746488245, 0.140416948464053, 0.0888104196149096,
  0.373787398372697, 0.754137554567394, 0.178871756420858,
  0.0813978551390581, 0.105445496968552, 0.732317823964232);
const mat3 OUTSET = mat3(
  1.96488741169489, -0.299313364904742, -0.164352742528393,
  -0.855988495690215, 1.32639796461980, -0.238183969428088,
  -0.108898916004672, -0.0270845997150571, 1.40253671195648);
uniform vec4 u_awp;
const float CROSS = 0.18;
const float SHOULDER = 1.0 - 0.18;
vec3 awp_curve(vec3 x) {
  vec3 s = x - CROSS;
  vec3 slope_s = u_awp.z * s;
  s = slope_s * (1.0 + s / u_awp.w) / (1.0 + (slope_s / SHOULDER));
  s += CROSS;
  vec3 t = pow(x, vec3(u_awp.x));
  t = t / (t + u_awp.y);
  return mix(s, t, lessThan(x, vec3(CROSS)));
}
float awp_inverse1(float y) {
  if (y < CROSS) {
    float t = u_awp.y * y / max(1.0 - y, 1e-6);
    return pow(max(t, 0.0), 1.0 / u_awp.x);
  }
  float Y = y - CROSS;
  float a2 = u_awp.z / u_awp.w;
  float a1 = u_awp.z * (1.0 - Y / SHOULDER);
  return CROSS + 2.0 * Y / (a1 + sqrt(max(a1 * a1 + 4.0 * a2 * Y, 0.0)));
}
vec3 agx(vec3 c) {
  c = max(vec3(0.0), c);
  c = INSET * c;
  c = awp_curve(c);
  c = min(vec3(1.0), c);
  return OUTSET * c;
}
vec3 agx_inverse(vec3 c) {
  vec3 w = inverse(OUTSET) * c;
  w = clamp(w, vec3(0.0), vec3(0.999));
  vec3 v = vec3(awp_inverse1(w.r), awp_inverse1(w.g), awp_inverse1(w.b));
  return max(inverse(INSET) * v, vec3(0.0));
}
vec3 linear_to_srgb(vec3 color) {
  const vec3 a = vec3(0.055);
  return mix((vec3(1.0) + a) * pow(max(color, vec3(0.0)), vec3(1.0 / 2.4)) - a, 12.92 * color, lessThan(color, vec3(0.0031308)));
}
vec3 srgb_to_linear(vec3 color) {
  const vec3 a = vec3(0.055);
  return mix(pow((color + a) * (1.0 / (vec3(1.0) + a)), vec3(2.4)), color * (1.0 / 12.92), lessThan(color, vec3(0.04045)));
}
uniform float u_height;
uniform float u_top;
vec2 godot_coord() { return u_top > 0.5 ? gl_FragCoord.xy : vec2(gl_FragCoord.x, u_height - gl_FragCoord.y); }
vec3 dither(vec2 frag) {
  vec3 d = vec3(dot(vec2(171.0, 231.0), frag));
  d = fract(d / vec3(103.0, 71.0, 97.0));
  return (d - 0.5) / 255.0;
}
`;

// Фон — сетка по центрам пикселей с глубиной кадра: глубина воды между центрами берётся по плоскости, и каждая точка
// MSAA получает свою, как в игре (Godot сводит глубину MSAA средним по точкам, то есть глубиной в центре пикселя).
const GRID_VS = `#version 300 es
precision highp float;
uniform sampler2D u_d;
uniform vec2 u_depth;
uniform vec2 u_clip;
uniform vec2 u_size;
void main() {
  int cols = int(u_size.x) + 1;
  int cell = gl_VertexID / 6;
  int corner = gl_VertexID - cell * 6;
  ivec2 o = corner == 0 ? ivec2(0, 0) : corner == 1 ? ivec2(1, 0) : corner == 2 ? ivec2(0, 1)
    : corner == 3 ? ivec2(0, 1) : corner == 4 ? ivec2(1, 0) : ivec2(1, 1);
  ivec2 v = ivec2(cell % cols, cell / cols) + o;
  ivec2 p = clamp(v - 1, ivec2(0), ivec2(u_size) - 1);
  vec3 b = floor(texelFetch(u_d, p, 0).rgb * 255.0 * 64.0 / 255.0 + 1e-4);
  float q = b.r * 4096.0 + b.g * 64.0 + b.b;
  float metres = u_depth.x * exp(q / 262143.0 * log(u_depth.y / u_depth.x));
  float zv = -metres;
  float zn = clamp((u_clip.x * zv + u_clip.y) / (-zv), -1.0, 1.0);
  vec2 at = (vec2(v) - 0.5) / u_size * 2.0 - 1.0;
  gl_Position = vec4(at, zn, 1.0);
}`;

const BACK_FS = `#version 300 es
precision highp float;
${COMMON}
uniform sampler2D u_c;
uniform float u_all;
layout(location = 0) out vec4 o_hdr;
layout(location = 1) out vec4 o_cov;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec3 s = texelFetch(u_c, p, 0).rgb - dither(godot_coord());
  o_hdr = vec4(agx_inverse(srgb_to_linear(clamp(s, 0.0, 1.0))), 1.0);
  o_cov = vec4(u_all);
}`;

const RIBBON_VS = `#version 300 es
precision highp float;
in vec3 a_pos;
in vec4 a_color;
uniform vec3 u_o;
uniform vec3 u_x;
uniform vec3 u_y;
uniform vec3 u_z;
uniform mat4 u_p;
uniform vec2 u_clip;
out vec4 v_color;
void main() {
  vec3 d = a_pos - u_o;
  vec3 v = vec3(dot(d, u_x), dot(d, u_y), dot(d, u_z));
  vec4 c = u_p * vec4(v, 1.0);
  gl_Position = vec4(c.x, -c.y, (u_clip.x * v.z + u_clip.y), c.w);
  v_color = a_color;
}`;

const RIBBON_FS = `#version 300 es
precision highp float;
in vec4 v_color;
uniform float u_alpha;
layout(location = 0) out vec4 o_hdr;
layout(location = 1) out vec4 o_cov;
void main() {
  float a = v_color.a * u_alpha;
  o_hdr = vec4(v_color.rgb, a);
  o_cov = vec4(1.0, 1.0, 1.0, a > 0.0 ? 1.0 : 0.0);
}`;

const FINAL_FS = `#version 300 es
precision highp float;
${COMMON}
uniform sampler2D u_c;
uniform sampler2D u_hdr;
uniform sampler2D u_cov;
out vec4 o_color;
void main() {
  ivec2 p = ivec2(gl_FragCoord.x, u_height - 1.0 - floor(gl_FragCoord.y));
  ivec2 f = p;
  if (texelFetch(u_cov, f, 0).r <= 0.0) {
    o_color = vec4(texelFetch(u_c, p, 0).rgb, 1.0);
    return;
  }
  vec3 hdr = texelFetch(u_hdr, f, 0).rgb;
  vec3 s = linear_to_srgb(agx(hdr)) + dither(godot_coord());
  o_color = vec4(s, 1.0);
}`;

function awpParams(env) {
  const c = env.agx_contrast;
  const white = Math.max(2.0, env.agx_white) * 1.0;
  const toeA = (1 / 0.18 - 1) * Math.pow(0.18, c);
  const denom = Math.pow(0.18, c) + toeA;
  const slope = (c * Math.pow(0.18, c - 1) * toeA) / (denom * denom);
  let w = white - 0.18;
  w = (w * w) / (1 - 0.18);
  w *= slope;
  return [c, toeA, slope, w];
}

class Proof {
  constructor(canvas, glyphAtlas, glyphs) {
    this.painter = new L.Painter(canvas, glyphAtlas);
    this.canvas2d = new L.Canvas(glyphs);
    const gl = this.painter.gl;
    this.gl = gl;
    this.float = !!gl.getExtension('EXT_color_buffer_float');
    if (!this.float) return;
    this.back = L.compile(gl, GRID_VS, BACK_FS);
    this.ribbon = L.compile(gl, RIBBON_VS, RIBBON_FS);
    this.final = L.compile(gl, FULL_VS, FINAL_FS);
    this.empty = gl.createVertexArray();
    const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
    this.samples = samples;
    const rb = (format) => {
      const r = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, r);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, format, L.W, L.H);
      return r;
    };
    this.msaa = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaa);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb(gl.RGBA16F));
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.RENDERBUFFER, rb(gl.RGBA8));
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb(gl.DEPTH_COMPONENT32F));
    this.ready = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    const tex = (internal, format, type) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, L.W, L.H, 0, format, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      return t;
    };
    this.hdrTex = tex(gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
    this.covTex = tex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    this.hdrFb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.hdrFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.hdrTex, 0);
    this.covFb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.covFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.covTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.vao = gl.createVertexArray();
    this.vbuf = gl.createBuffer();
    this.cbuf = gl.createBuffer();
  }

  // Порядок прозрачных сеток — как сортирует Godot: дальняя середина рамки — раньше; узлы одной середины — по порядку детей.
  static order(frame) {
    const cam = frame.cam;
    const list = [];
    const items = Array.isArray(frame.quads) ? frame.quads : [];
    for (const item of items) {
      const q = item.v ? item : items[item.same];
      if (!item.on || !(item.a > 0) || !q || !q.v.length) continue;
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < q.v.length; i += 3) {
        x0 = Math.min(x0, q.v[i]); x1 = Math.max(x1, q.v[i]);
        y0 = Math.min(y0, q.v[i + 1]); y1 = Math.max(y1, q.v[i + 1]);
        z0 = Math.min(z0, q.v[i + 2]); z1 = Math.max(z1, q.v[i + 2]);
      }
      const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
      list.push({ q, alpha: item.a, depth: Math.hypot(c[0] - cam.o[0], c[1] - cam.o[1], c[2] - cam.o[2]), xray: item.xray });
    }
    list.sort((a, b) => b.depth - a.depth);
    return list;
  }

  // images: {c, d, m} — ImageBitmap кадров сверки; reticle — рисовать ли кольцо (2D) поверх.
  render(scene, k, images, opts = {}) {
    const gl = this.gl;
    const frame = scene.frame(k);
    const env = scene.doc.env;
    const awp = awpParams(env);
    const cam = frame.cam;
    const n = cam.near;
    const f = cam.far;
    const clip = [-(f + n) / (f - n), (-2 * f * n) / (f - n)];
    const texC = L.texture(gl, images.c);
    const texD = L.texture(gl, images.d);
    const texM = L.texture(gl, images.m);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaa);
    gl.viewport(0, 0, L.W, L.H);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.ALWAYS);
    gl.clearDepth(1.0);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.useProgram(this.back);
    this._common(this.back, awp, true);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texC);
    gl.uniform1i(gl.getUniformLocation(this.back, 'u_c'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texD);
    gl.uniform1i(gl.getUniformLocation(this.back, 'u_d'), 1);
    gl.uniform2f(gl.getUniformLocation(this.back, 'u_depth'), scene.doc.depth[0], scene.doc.depth[1]);
    gl.uniform2f(gl.getUniformLocation(this.back, 'u_clip'), clip[0], clip[1]);
    gl.uniform2f(gl.getUniformLocation(this.back, 'u_size'), L.W, L.H);
    gl.uniform1f(gl.getUniformLocation(this.back, 'u_all'), opts.roundtrip ? 1 : 0);
    gl.bindVertexArray(this.empty);
    gl.drawArrays(gl.TRIANGLES, 0, 6 * (L.W + 1) * (L.H + 1));
    gl.useProgram(this.ribbon);
    const u = (name) => gl.getUniformLocation(this.ribbon, name);
    gl.uniform3fv(u('u_o'), cam.o);
    gl.uniform3fv(u('u_x'), cam.x);
    gl.uniform3fv(u('u_y'), cam.y);
    gl.uniform3fv(u('u_z'), cam.z);
    gl.uniformMatrix4fv(u('u_p'), false, new Float32Array(cam.p));
    gl.uniform2f(u('u_clip'), clip[0], clip[1]);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    const order = opts.order || Proof.order(frame);
    gl.bindVertexArray(this.vao);
    for (const item of order) {
      const q = item.q;
      gl.depthFunc(item.xray ? gl.ALWAYS : gl.LESS);
      gl.uniform1f(u('u_alpha'), item.alpha);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(q.v), gl.STREAM_DRAW);
      const lp = gl.getAttribLocation(this.ribbon, 'a_pos');
      gl.enableVertexAttribArray(lp);
      gl.vertexAttribPointer(lp, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cbuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(q.c), gl.STREAM_DRAW);
      const lc = gl.getAttribLocation(this.ribbon, 'a_color');
      gl.enableVertexAttribArray(lc);
      gl.vertexAttribPointer(lc, 4, gl.UNSIGNED_BYTE, true, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, q.v.length / 3);
    }
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaa);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.hdrFb);
    gl.blitFramebuffer(0, 0, L.W, L.H, 0, 0, L.W, L.H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.covFb);
    gl.blitFramebuffer(0, 0, L.W, L.H, 0, 0, L.W, L.H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, L.W, L.H);
    gl.useProgram(this.final);
    this._common(this.final, awp, false);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texC);
    gl.uniform1i(gl.getUniformLocation(this.final, 'u_c'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.hdrTex);
    gl.uniform1i(gl.getUniformLocation(this.final, 'u_hdr'), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.covTex);
    gl.uniform1i(gl.getUniformLocation(this.final, 'u_cov'), 2);
    gl.bindVertexArray(this.empty);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (opts.reticle !== false) {
      this.canvas2d.reset();
      L.drawReticle(this.canvas2d, frame.rt);
      this.painter.draw(this.canvas2d);
    }
    if (opts.hud !== false) this.painter.texture(texM, true);
    gl.deleteTexture(texC);
    gl.deleteTexture(texD);
    gl.deleteTexture(texM);
    return this.painter.pixels();
  }

  _common(prog, awp, top) {
    const gl = this.gl;
    gl.uniform4f(gl.getUniformLocation(prog, 'u_awp'), awp[0], awp[1], awp[2], awp[3]);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_height'), L.H);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_top'), top ? 1 : 0);
  }
}
L.Proof = Proof;

// Пиксели картинки (ImageBitmap) как они есть, без поправок цвета.
L.bytesOf = function (bitmap) {
  const c = document.createElement('canvas');
  c.width = bitmap.width;
  c.height = bitmap.height;
  const g = c.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
  g.drawImage(bitmap, 0, 0);
  return g.getImageData(0, 0, c.width, c.height).data;
};

// Сравнение двух кадров RGBA: где различаются, насколько; region — где вообще есть прицел (маска).
L.compare = function (a, b, region) {
  const hist = new Uint32Array(256);
  let sum = 0;
  let count = 0;
  let max = 0;
  let inRegion = 0;
  let exact = 0;
  let le2 = 0;
  let le8 = 0;
  for (let i = 0, p = 0; i < a.length; i += 4, p++) {
    if (region && !region[p]) continue;
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    hist[d]++;
    sum += d;
    count++;
    if (d > max) max = d;
    if (d === 0) exact++;
    if (d <= 2) le2++;
    if (d <= 8) le8++;
    inRegion++;
  }
  return { pixels: count, mean: count ? sum / count : 0, max, exact, le2, le8, hist };
};
})();
