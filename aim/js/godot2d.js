(function () {
'use strict';

// Рисование 2D так же, как CanvasItem в Godot 4.7: те же треугольники, те же «перья» сглаживания (FEATHER_SIZE), тот же
// порядок команд и смешивание в sRGB поверх кадра. Вариант прицела, нарисованный здесь, переносится в _draw() игры
// вызов в вызов: draw_line, draw_polyline, draw_arc, draw_rect, draw_circle, draw_colored_polygon, draw_mesh,
// draw_string(_outline), canvas_item_add_triangle_array.

const L = window.AimLab;
const FEATHER = 1.25;
const EPS = 0.00001;
const FLOATS = 9;

function remap(v, a0, a1, b0, b1) {
  return b0 + (b1 - b0) * ((v - a0) / (a1 - a0));
}

function compensated(w) {
  if (w > 0) {
    if (w <= FEATHER * 2 + EPS) return w * 0.5;
    if (w <= FEATHER * 4 + EPS) return remap(w, FEATHER * 2, FEATHER * 4, w * 0.5, w - FEATHER * 0.5);
    return w - FEATHER * 0.5;
  }
  return w;
}
L.aaWidth = compensated;

// Готовые сетки точки и кольца для draw_mesh: заводятся один раз на размер, а кадр только сдвигает и красит их (modulate),
// без своего буфера на вызов, как у draw_circle. Край — то же перо, что у сглаженного круга и линии Godot.
const meshes = new Map();

function rings(radii, alphas, count, center) {
  const points = [];
  const colors = [];
  const indices = [];
  for (let k = 0; k < radii.length; k++) {
    for (let i = 0; i < count; i++) {
      const a = Math.fround((Math.PI * 2 * i) / count);
      points.push([Math.cos(a) * radii[k], Math.sin(a) * radii[k]]);
      colors.push([1, 1, 1, alphas[k]]);
    }
  }
  for (let k = 0; k + 1 < radii.length; k++) {
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      indices.push(k * count + i, (k + 1) * count + i, k * count + j, k * count + j, (k + 1) * count + i, (k + 1) * count + j);
    }
  }
  if (center) {
    points.push([0, 0]);
    colors.push([1, 1, 1, 1]);
    for (let i = 0; i < count; i++) indices.push(radii.length * count, i, (i + 1) % count);
  }
  return { points, colors, indices };
}

// Сглаженная точка радиуса radius (как draw_circle со сглаживанием).
L.discMesh = function (radius, count = 16) {
  const key = 'disc ' + radius + ' ' + count;
  let m = meshes.get(key);
  if (!m) {
    const core = Math.max(radius - FEATHER * 0.25, 0);
    const border = core * 2 < 1 ? FEATHER * core : FEATHER;
    m = Object.assign(rings([core, core + border], [1, 0], count, true), { kind: 'disc', radius, width: 0, count });
    meshes.set(key, m);
  }
  return m;
};

// Сглаженное кольцо радиуса radius толщиной width (как draw_arc по кругу со сглаживанием).
L.ringMesh = function (radius, width, count = 32) {
  const key = 'ring ' + radius + ' ' + width + ' ' + count;
  let m = meshes.get(key);
  if (!m) {
    const half = compensated(width) * 0.5;
    const border = half * 2 < 1 ? FEATHER * half * 2 : FEATHER;
    const radii = [radius - half - border, radius - half, radius + half, radius + half + border].map((r) => Math.max(r, 0));
    m = Object.assign(rings(radii, [0, 1, 1, 0], count, false), { kind: 'ring', radius, width, count });
    meshes.set(key, m);
  }
  return m;
};

const v2 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  mul: (a, s) => [a[0] * s, a[1] * s],
  len: (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1]),
  norm(a) {
    const l2 = a[0] * a[0] + a[1] * a[1];
    if (l2 === 0) return [0, 0];
    const l = Math.sqrt(l2);
    return [a[0] / l, a[1] / l];
  },
  orth: (a) => [a[1], -a[0]],
  cross: (a, b) => a[0] * b[1] - a[1] * b[0],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1],
  zero: (a) => Math.abs(a[0]) < EPS && Math.abs(a[1]) < EPS,
  eqf(a, b) {
    if (a === b) return true;
    let tol = EPS * Math.abs(a);
    if (tol < EPS) tol = EPS;
    return Math.abs(a - b) < tol;
  },
  eq: (a, b) => v2.eqf(a[0], b[0]) && v2.eqf(a[1], b[1]),
};

function segmentDir(points, i, prev) {
  if (i === points.length - 1) return prev;
  const d = v2.norm(v2.sub(points[i + 1], points[i]));
  return v2.zero(d) ? prev : d;
}

function edgeOffset(seg, prev) {
  let bisector = v2.norm(v2.sub(v2.mul(prev, v2.len(seg)), v2.mul(seg, v2.len(prev))));
  let length = 1;
  const angle = Math.atan2(v2.cross(bisector, prev), v2.dot(bisector, prev));
  const s = Math.sin(angle);
  if (!(Math.abs(s) < EPS) && !v2.eq(seg, prev)) {
    length = L.clamp(1 / s, -3, 3);
  } else {
    bisector = v2.orth(seg);
  }
  if (v2.zero(bisector)) bisector = v2.orth(seg);
  return v2.mul(bisector, length);
}

class Canvas {
  constructor(glyphs) {
    this.glyphs = glyphs;
    this.data = new Float32Array(FLOATS * 3 * 65536);
    this.n = 0;
    this.missing = new Set();
  }

  reset() {
    this.n = 0;
  }

  _grow() {
    const next = new Float32Array(this.data.length * 2);
    next.set(this.data);
    this.data = next;
  }

  _vert(p, c, u = 0, v = 0, tex = 0) {
    if (this.n + FLOATS > this.data.length) this._grow();
    const d = this.data;
    let i = this.n;
    d[i++] = p[0];
    d[i++] = p[1];
    d[i++] = c[0];
    d[i++] = c[1];
    d[i++] = c[2];
    d[i++] = c[3];
    d[i++] = u;
    d[i++] = v;
    d[i++] = tex;
    this.n = i;
  }

  _tri(p0, c0, p1, c1, p2, c2) {
    this._vert(p0, c0);
    this._vert(p1, c1);
    this._vert(p2, c2);
  }

  // Четырёхугольник Godot (CommandPrimitive): треугольники 0-1-2 и 0-2-3.
  _quad(p, c) {
    this._tri(p[0], c[0], p[1], c[1], p[2], c[2]);
    this._tri(p[0], c[0], p[2], c[2], p[3], c[3]);
  }

  _strip(p, c) {
    for (let i = 0; i + 2 < p.length; i++) {
      this._tri(p[i], c[i], p[i + 1], c[i + 1], p[i + 2], c[i + 2]);
    }
  }

  line(from, to, color, width = -1, aa = false) {
    const diff = v2.sub(from, to);
    const dir = v2.norm(v2.orth(diff));
    if (aa) width = compensated(width);
    if (width < 0) {
      width = 1;
    }
    const t = v2.mul(dir, width * 0.5);
    const bl = v2.add(from, t);
    const br = v2.sub(from, t);
    const el = v2.add(to, t);
    const er = v2.sub(to, t);
    this._quad([bl, br, er, el], [color, color, color, color]);
    if (!aa) return;
    let border = FEATHER;
    if (width >= 0 && width < 1) border *= width;
    const dir2 = v2.norm(diff);
    const b1 = v2.mul(dir, border);
    const b2 = v2.mul(dir2, border);
    const tr = L.withA(color, 0);
    const c = color;
    this._quad([bl, v2.add(bl, b1), v2.add(el, b1), el], [c, tr, tr, c]);
    this._quad([br, v2.sub(br, b1), v2.sub(er, b1), er], [c, tr, tr, c]);
    this._quad([bl, v2.add(bl, b2), v2.add(br, b2), br], [c, tr, tr, c]);
    this._quad([el, v2.sub(el, b2), v2.sub(er, b2), er], [c, tr, tr, c]);
    this._quad([bl, v2.add(bl, b2), v2.add(v2.add(bl, b1), b2), v2.add(bl, b1)], [c, tr, tr, tr]);
    this._quad([br, v2.add(br, b2), v2.add(v2.sub(br, b1), b2), v2.sub(br, b1)], [c, tr, tr, tr]);
    this._quad([el, v2.sub(el, b2), v2.sub(v2.add(el, b1), b2), v2.add(el, b1)], [c, tr, tr, tr]);
    this._quad([er, v2.sub(er, b2), v2.sub(v2.sub(er, b1), b2), v2.sub(er, b1)], [c, tr, tr, tr]);
  }

  polyline(points, color, width = -1, aa = false) {
    this.polylineColors(points, [color], width, aa);
  }

  // canvas_item_add_polyline: полоса, за ней левое и правое перо; концы незамкнутой линии — ещё по перу.
  polylineColors(points, colors, width = -1, aa = false) {
    const n = points.length;
    if (n < 2) return;
    if (aa) width = compensated(width);
    if (width < 0) width = 1;
    const loop = v2.eq(points[0], points[n - 1]);
    let first = [0, 0];
    for (let i = 1; i < n; i++) {
      first = v2.norm(v2.sub(points[i], points[i - 1]));
      if (!v2.zero(first)) break;
    }
    let last = [0, 0];
    for (let i = n - 1; i >= 1; i--) {
      last = v2.norm(v2.sub(points[i], points[i - 1]));
      if (!v2.zero(last)) break;
    }
    const extra = aa && !loop ? 4 : 0;
    const P = new Array(n * 2 + extra);
    const C = new Array(n * 2 + extra);
    let color = [1, 1, 1, 1];
    let color2 = [1, 1, 1, 0];
    if (aa) {
      let border = FEATHER;
      if (width < 1) border *= width;
      const sideExtra = loop ? 0 : 5;
      const PL = new Array(n * 2 + sideExtra);
      const CL = new Array(n * 2 + sideExtra);
      const PR = new Array(n * 2 + sideExtra);
      const CR = new Array(n * 2 + sideExtra);
      let prev = [0, 0];
      for (let i = 0; i < n; i++) {
        const isFirst = i === 0;
        const isLast = i === n - 1;
        const seg = segmentDir(points, i, prev);
        if (isFirst && loop) prev = last;
        else if (isLast && loop) prev = first;
        let base;
        if (isFirst && !loop) base = v2.orth(first);
        else if (isLast && !loop) base = v2.orth(last);
        else base = edgeOffset(seg, prev);
        const edge = v2.mul(base, width * 0.5);
        const bord = v2.mul(base, border);
        const pos = points[i];
        const j = i * 2 + (loop ? 0 : 2);
        P[j] = v2.add(pos, edge);
        P[j + 1] = v2.sub(pos, edge);
        PL[j] = v2.add(pos, edge);
        PL[j + 1] = v2.add(v2.add(pos, edge), bord);
        PR[j] = v2.sub(pos, edge);
        PR[j + 1] = v2.sub(v2.sub(pos, edge), bord);
        if (i < colors.length) {
          color = colors[i];
          color2 = L.withA(color, 0);
        }
        C[j] = color;
        C[j + 1] = color;
        CL[j] = color;
        CL[j + 1] = color2;
        CR[j] = color;
        CR[j + 1] = color2;
        if (isFirst && !loop) {
          const bb = v2.mul(seg, -border);
          P[0] = v2.add(v2.add(pos, edge), bb);
          P[1] = v2.add(v2.sub(pos, edge), bb);
          C[0] = color2;
          C[1] = color2;
          PL[0] = v2.add(v2.add(pos, edge), bb);
          PL[1] = v2.add(v2.add(v2.add(pos, edge), bb), bord);
          CL[0] = color2;
          CL[1] = color2;
          PR[0] = v2.add(v2.sub(pos, edge), bb);
          PR[1] = v2.sub(v2.add(v2.sub(pos, edge), bb), bord);
          CR[0] = color2;
          CR[1] = color2;
        }
        if (isLast && !loop) {
          const eb = v2.mul(prev, border);
          const e = n * 2 + 2;
          P[e] = v2.add(v2.add(pos, edge), eb);
          P[e + 1] = v2.add(v2.sub(pos, edge), eb);
          C[e] = color2;
          C[e + 1] = color2;
          PL[e] = v2.add(pos, edge);
          PL[e + 1] = v2.add(v2.add(v2.add(pos, edge), eb), bord);
          PL[e + 2] = v2.add(v2.add(pos, edge), eb);
          CL[e] = color;
          CL[e + 1] = color2;
          CL[e + 2] = color2;
          PR[e] = v2.sub(pos, edge);
          PR[e + 1] = v2.sub(v2.add(v2.sub(pos, edge), eb), bord);
          PR[e + 2] = v2.add(v2.sub(pos, edge), eb);
          CR[e] = color;
          CR[e + 1] = color2;
          CR[e + 2] = color2;
        }
        prev = seg;
      }
      this._strip(P, C);
      this._strip(PL, CL);
      this._strip(PR, CR);
      return;
    }
    let prev = [0, 0];
    for (let i = 0; i < n; i++) {
      const isFirst = i === 0;
      const isLast = i === n - 1;
      const seg = segmentDir(points, i, prev);
      if (isFirst && loop) prev = last;
      else if (isLast && loop) prev = first;
      let base;
      if (isFirst && !loop) base = v2.orth(first);
      else if (isLast && !loop) base = v2.orth(last);
      else base = edgeOffset(seg, prev);
      const edge = v2.mul(base, width * 0.5);
      P[i * 2] = v2.add(points[i], edge);
      P[i * 2 + 1] = v2.sub(points[i], edge);
      if (i < colors.length) color = colors[i];
      C[i * 2] = color;
      C[i * 2 + 1] = color;
      prev = seg;
    }
    this._strip(P, C);
  }

  ellipseArc(center, major, minor, a0, a1, count, color, width = -1, aa = false) {
    const pts = new Array(count);
    const delta = L.clamp(a1 - a0, -Math.PI * 2, Math.PI * 2);
    for (let i = 0; i < count; i++) {
      const th = (i / (count - 1)) * delta + a0;
      pts[i] = [center[0] + major * Math.cos(th), center[1] + minor * Math.sin(th)];
    }
    this.polyline(pts, color, width, aa);
  }

  arc(center, radius, a0, a1, count, color, width = -1, aa = false) {
    this.ellipseArc(center, radius, radius, a0, a1, count, color, width, aa);
  }

  multiline(points, color, width = -1, aa = false) {
    for (let i = 0; i + 1 < points.length; i += 2) this.line(points[i], points[i + 1], color, width, aa);
  }

  rect(x, y, w, h, color, filled = true, width = -1, aa = false) {
    if (w < 0) {
      x += w;
      w = -w;
    }
    if (h < 0) {
      y += h;
      h = -h;
    }
    if (filled) {
      this._fillRect(x, y, w, h, color, aa);
    } else if (width >= w || width >= h) {
      this._fillRect(x - width * 0.5, y - width * 0.5, w + width, h + width, color, aa);
    } else {
      this.polyline([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], color, width, aa);
    }
  }

  _fillRect(x, y, w, h, color, aa) {
    if (aa) {
      const g = FEATHER * 0.25;
      x += g;
      y += g;
      w -= 2 * g;
      h -= 2 * g;
    }
    const p0 = [x, y];
    const p1 = [x, y + h];
    const p2 = [x + w, y + h];
    const p3 = [x + w, y];
    this._quad([p0, p1, p2, p3], [color, color, color, color]);
    if (!aa) return;
    let border = FEATHER;
    const size = Math.min(w, h);
    if (size >= 0 && size < 1) border *= size;
    const bl = [x, y];
    const br = [x, y + h];
    const el = [x + w, y];
    const er = [x + w, y + h];
    const b1 = [0, -border];
    const b2 = [-border, 0];
    const c = color;
    const tr = L.withA(color, 0);
    this._quad([bl, v2.add(bl, b1), v2.add(el, b1), el], [c, tr, tr, c]);
    this._quad([br, v2.sub(br, b1), v2.sub(er, b1), er], [c, tr, tr, c]);
    this._quad([bl, v2.add(bl, b2), v2.add(br, b2), br], [c, tr, tr, c]);
    this._quad([el, v2.sub(el, b2), v2.sub(er, b2), er], [c, tr, tr, c]);
    this._quad([bl, v2.add(bl, b2), v2.add(v2.add(bl, b1), b2), v2.add(bl, b1)], [c, tr, tr, tr]);
    this._quad([br, v2.add(br, b2), v2.add(v2.sub(br, b1), b2), v2.sub(br, b1)], [c, tr, tr, tr]);
    this._quad([el, v2.sub(el, b2), v2.sub(v2.add(el, b1), b2), v2.add(el, b1)], [c, tr, tr, tr]);
    this._quad([er, v2.sub(er, b2), v2.sub(v2.sub(er, b1), b2), v2.sub(er, b1)], [c, tr, tr, tr]);
  }

  circle(center, radius, color, filled = true, width = -1, aa = false) {
    this.ellipse(center, radius, radius, color, filled, width, aa);
  }

  ellipse(center, major, minor, color, filled = true, width = -1, aa = false) {
    if (filled) {
      this._fillEllipse(center, major, minor, color, aa);
    } else if (width >= 2 * Math.max(major, minor)) {
      this._fillEllipse(center, major + 0.5 * width, minor + 0.5 * width, color, aa);
    } else {
      const pts = [];
      const step = (Math.PI * 2) / 64;
      for (let i = 0; i < 64; i++) {
        const a = Math.fround(i * step);
        pts.push([Math.cos(a) * major + center[0], Math.sin(a) * minor + center[1]]);
      }
      pts.push(pts[0]);
      this.polyline(pts, color, width, aa);
    }
  }

  _fillEllipse(center, major, minor, color, aa) {
    const SEG = 64;
    if (aa) {
      major = Math.max(0, major - FEATHER * 0.25);
      minor = Math.max(0, minor - FEATHER * 0.25);
    }
    const step = (Math.PI * 2) / SEG;
    const ring = [];
    for (let i = 0; i <= SEG; i++) {
      const a = Math.fround(i * step);
      ring.push([Math.cos(a) * major + center[0], Math.sin(a) * minor + center[1]]);
    }
    for (let i = 0; i < SEG; i++) this._tri(center, color, ring[i], color, ring[i + 1], color);
    if (!aa) return;
    let border = FEATHER;
    const axis = Math.max(major, minor) * 2;
    if (axis >= 0 && axis < 1) border *= axis * 0.5;
    const tr = L.withA(color, 0);
    const P = [];
    const C = [];
    for (let i = 0; i <= SEG; i++) {
      const a = Math.fround(i * step);
      const c = Math.cos(a);
      const s = Math.sin(a);
      P.push([c * major + center[0], s * minor + center[1]]);
      P.push([c * (major + border) + center[0], s * (minor + border) + center[1]]);
      C.push(color, tr);
    }
    this._strip(P, C);
  }

  // draw_colored_polygon: разбиение на треугольники — как у Godot (L.triangulate); не разбился — Godot многоугольник не
  // рисует вовсе (ошибка «triangulation failed»), и страница тоже. Варианты дают сюда только выпуклые фигуры, а заливки
  // сложнее — треугольниками (triangles).
  polygon(points, color) {
    const idx = L.triangulate(points);
    if (!idx) {
      this.failed = (this.failed || 0) + 1;
      return;
    }
    for (let i = 0; i < idx.length; i += 3) this._tri(points[idx[i]], color, points[idx[i + 1]], color, points[idx[i + 2]], color);
  }

  // RenderingServer.canvas_item_add_triangle_array одним цветом: готовые треугольники, без разбиения.
  triangles(points, indices, color) {
    for (let i = 0; i + 2 < indices.length; i += 3) this._tri(points[indices[i]], color, points[indices[i + 1]], color, points[indices[i + 2]], color);
  }

  // Тот же canvas_item_add_triangle_array с цветом у каждой вершины.
  trianglesColors(points, indices, colors) {
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const a = indices[i];
      const b = indices[i + 1];
      const c = indices[i + 2];
      this._tri(points[a], colors[a], points[b], colors[b], points[c], colors[c]);
    }
  }

  // draw_mesh: готовая сетка (L.discMesh, L.ringMesh), сдвинутая в at; цвет вершины × modulate.
  mesh(m, at, modulate) {
    const P = m.points.map((p) => [p[0] + at[0], p[1] + at[1]]);
    const C = m.colors.map((c) => [c[0] * modulate[0], c[1] * modulate[1], c[2] * modulate[2], c[3] * modulate[3]]);
    const I = m.indices;
    for (let i = 0; i + 2 < I.length; i += 3) this._tri(P[I[i]], C[I[i]], P[I[i + 1]], C[I[i + 1]], P[I[i + 2]], C[I[i + 2]]);
  }

  // Ширина строки, как Font.get_string_size(...).x.
  textWidth(text, size) {
    const S = this._size(size);
    if (!S) return 0;
    let w = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const a = S.advance[ch];
      if (a === undefined) continue;
      w += a + (i + 1 < text.length ? S.kern[ch + text[i + 1]] || 0 : 0);
    }
    return w;
  }

  // Font.get_string_size(...).x: ширина строки Godot округляет вверх до целой точки (_shaped_text_get_size, ceil).
  stringSize(text, size) {
    return Math.ceil(this.textWidth(text, size));
  }

  textAscent(size) {
    const S = this._size(size);
    return S ? S.ascent : size;
  }

  _size(size) {
    return this.glyphs && this.glyphs.sizes[String(size)];
  }

  // draw_string / draw_string_outline (outline > 0): pos — начало строки на линии букв; align: 0 — от pos, 0.5 — серединой,
  // 1 — концом. Буквы — картинки Godot, сдвиг на долю точки и округление — как TextServerAdvanced::_font_draw_glyph.
  text(pos, text, size, color, outline = 0, align = 0) {
    const S = this._size(size);
    if (!S) {
      this.missing.add('размер ' + size);
      return;
    }
    const table = S['o' + outline];
    if (!table) {
      this.missing.add('обводка ' + outline);
      return;
    }
    let x = pos[0] - (align ? this.stringSize(text, size) * align : 0);
    const shifts = S.shifts;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const adv = S.advance[ch];
      if (adv === undefined) {
        this.missing.add(ch);
        continue;
      }
      const off = S.offset[ch];
      const gx = x + off[0];
      const gy = pos[1] + off[1];
      let q = 0;
      let cx;
      if (shifts === 4) {
        q = Math.floor(4 * (gx + 0.125)) - 4 * Math.floor(gx + 0.125);
        cx = Math.floor(gx + 0.125);
      } else if (shifts === 2) {
        q = Math.floor(2 * (gx + 0.25)) - 2 * Math.floor(gx + 0.25);
        cx = Math.floor(gx + 0.25);
      } else {
        cx = Math.floor(gx);
      }
      const cy = Math.floor(gy);
      const g = table[ch] && table[ch][q];
      if (g) {
        const x0 = cx + g[4];
        const y0 = cy + g[5];
        const w = g[6];
        const h = g[7];
        const u0 = g[0];
        const v0 = g[1];
        const p0 = [x0, y0];
        const p1 = [x0, y0 + h];
        const p2 = [x0 + w, y0 + h];
        const p3 = [x0 + w, y0];
        this._vert(p0, color, u0, v0, 1);
        this._vert(p1, color, u0, v0 + h, 1);
        this._vert(p2, color, u0 + w, v0 + h, 1);
        this._vert(p2, color, u0 + w, v0 + h, 1);
        this._vert(p3, color, u0 + w, v0, 1);
        this._vert(p0, color, u0, v0, 1);
      }
      x += adv + (i + 1 < text.length ? S.kern[ch + text[i + 1]] || 0 : 0);
    }
  }

  // Строка с обводкой, как у кольца игры: сначала обводка, поверх — буквы.
  label(pos, text, size, color, shadow, outline = 4, align = 0) {
    if (outline > 0 && shadow) this.text(pos, text, size, shadow, outline, align);
    this.text(pos, text, size, color, 0, align);
  }
}
L.Canvas = Canvas;

// Разбиение многоугольника Godot — Triangulate::triangulate (core/math/triangulate.cpp, 4.7.1) в float32: срезает «уши»
// по порядку; застрял — ещё круг с ослабленной проверкой (плоские треугольники); снова застрял — неудача (null).
const f32 = Math.fround;
const CMP_EPSILON = f32(0.00001);

function insideTriangle(Ax, Ay, Bx, By, Cx, Cy, Px, Py, includeEdges) {
  const ax = f32(Cx - Bx);
  const ay = f32(Cy - By);
  const bx = f32(Ax - Cx);
  const by = f32(Ay - Cy);
  const cx = f32(Bx - Ax);
  const cy = f32(By - Ay);
  const apx = f32(Px - Ax);
  const apy = f32(Py - Ay);
  const bpx = f32(Px - Bx);
  const bpy = f32(Py - By);
  const cpx = f32(Px - Cx);
  const cpy = f32(Py - Cy);
  const aCROSSbp = f32(f32(ax * bpy) - f32(ay * bpx));
  const cCROSSap = f32(f32(cx * apy) - f32(cy * apx));
  const bCROSScp = f32(f32(bx * cpy) - f32(by * cpx));
  return includeEdges ? aCROSSbp > 0 && bCROSScp > 0 && cCROSSap > 0 : aCROSSbp >= 0 && bCROSScp >= 0 && cCROSSap >= 0;
}

function snip(X, Y, u, v, w, n, V, relaxed) {
  const Ax = X[V[u]];
  const Ay = Y[V[u]];
  const Bx = X[V[v]];
  const By = Y[V[v]];
  const Cx = X[V[w]];
  const Cy = Y[V[w]];
  const threshold = relaxed ? -CMP_EPSILON : CMP_EPSILON;
  if (threshold > f32(f32(f32(Bx - Ax) * f32(Cy - Ay)) - f32(f32(By - Ay) * f32(Cx - Ax)))) return false;
  for (let p = 0; p < n; p++) {
    if (p === u || p === v || p === w) continue;
    if (insideTriangle(Ax, Ay, Bx, By, Cx, Cy, X[V[p]], Y[V[p]], relaxed)) return false;
  }
  return true;
}

L.triangulate = function (points) {
  const n = points.length;
  if (n < 3) return null;
  const X = new Float32Array(n);
  const Y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    X[i] = points[i][0];
    Y[i] = points[i][1];
  }
  let area = 0;
  for (let p = n - 1, q = 0; q < n; p = q++) area = f32(area + f32(f32(X[p] * Y[q]) - f32(Y[p] * X[q])));
  const V = new Int32Array(n);
  for (let v = 0; v < n; v++) V[v] = f32(area * 0.5) > 0 ? v : n - 1 - v;
  const out = [];
  let relaxed = false;
  let nv = n;
  let count = 2 * nv;
  for (let v = nv - 1; nv > 2;) {
    if (0 >= count--) {
      if (relaxed) return null;
      count = 2 * nv;
      relaxed = true;
    }
    let u = v;
    if (nv <= u) u = 0;
    v = u + 1;
    if (nv <= v) v = 0;
    let w = v + 1;
    if (nv <= w) w = 0;
    if (snip(X, Y, u, v, w, nv, V, relaxed)) {
      out.push(V[u], V[v], V[w]);
      for (let s = v, t = v + 1; t < nv; s++, t++) V[s] = V[t];
      nv--;
      count = 2 * nv;
    }
  }
  return out;
};

const VS = `#version 300 es
precision highp float;
in vec2 a_pos;
in vec4 a_color;
in vec2 a_uv;
in float a_tex;
uniform vec2 u_size;
uniform vec2 u_atlas;
out vec4 v_color;
out vec2 v_uv;
out float v_tex;
void main() {
  v_color = a_color;
  v_uv = a_uv / u_atlas;
  v_tex = a_tex;
  gl_Position = vec4(a_pos.x / u_size.x * 2.0 - 1.0, 1.0 - a_pos.y / u_size.y * 2.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec4 v_color;
in vec2 v_uv;
in float v_tex;
uniform sampler2D u_glyphs;
out vec4 o_color;
void main() {
  vec4 c = v_color;
  if (v_tex > 0.5) {
    c.a *= texture(u_glyphs, v_uv).r;
  }
  o_color = c;
}`;

const BG_VS = `#version 300 es
precision highp float;
const vec2 P[3] = vec2[](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 v_uv;
void main() {
  vec2 p = P[gl_VertexID];
  v_uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const BG_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_image;
uniform float u_premultiplied;
out vec4 o_color;
void main() {
  vec4 c = texture(u_image, v_uv);
  o_color = u_premultiplied > 0.5 ? c : vec4(c.rgb, 1.0);
}`;

function compile(gl, vs, fs) {
  const prog = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    gl.attachShader(prog, sh);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  return prog;
}
L.compile = compile;

L.texture = function (gl, source, filter) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  if (source) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter || gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter || gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
};

// Холст кадра 1600×900: фон (кадр игры) и поверх — 2D, как в игре, в той же 8-битной картинке.
class Painter {
  constructor(canvas, glyphAtlas) {
    this.canvas = canvas;
    canvas.width = L.W;
    canvas.height = L.H;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('Нет WebGL2');
    this.gl = gl;
    this.prog = compile(gl, VS, FS);
    this.bg = compile(gl, BG_VS, BG_FS);
    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    const stride = FLOATS * 4;
    const attr = (name, size, offset) => {
      const loc = gl.getAttribLocation(this.prog, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset * 4);
    };
    attr('a_pos', 2, 0);
    attr('a_color', 4, 2);
    attr('a_uv', 2, 6);
    attr('a_tex', 1, 8);
    gl.bindVertexArray(null);
    this.emptyVao = gl.createVertexArray();
    this.frameTex = L.texture(gl, null);
    this.glyphTex = glyphAtlas ? L.texture(gl, glyphAtlas) : L.texture(gl, null);
    this.atlasSize = glyphAtlas ? [glyphAtlas.width, glyphAtlas.height] : [1, 1];
  }

  begin() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, L.W, L.H);
    gl.disable(gl.BLEND);
  }

  // Кадр игры во весь холст точка в точку (видео или картинка).
  image(source, premultiplied = false) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.frameTex);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    this.texture(this.frameTex, premultiplied);
  }

  texture(tex, premultiplied = false) {
    const gl = this.gl;
    gl.useProgram(this.bg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(this.bg, 'u_image'), 0);
    gl.uniform1f(gl.getUniformLocation(this.bg, 'u_premultiplied'), premultiplied ? 1 : 0);
    if (premultiplied) {
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    } else {
      gl.disable(gl.BLEND);
    }
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
  }

  // Команды холста — одним вызовом; смешивание BLEND_MODE_MIX холста Godot.
  draw(canvas) {
    if (!canvas.n) return;
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.uniform2f(gl.getUniformLocation(this.prog, 'u_size'), L.W, L.H);
    gl.uniform2f(gl.getUniformLocation(this.prog, 'u_atlas'), this.atlasSize[0], this.atlasSize[1]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.glyphTex);
    gl.uniform1i(gl.getUniformLocation(this.prog, 'u_glyphs'), 0);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, canvas.data.subarray(0, canvas.n), gl.STREAM_DRAW);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, canvas.n / FLOATS);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  pixels() {
    const gl = this.gl;
    const px = new Uint8Array(L.W * L.H * 4);
    gl.readPixels(0, 0, L.W, L.H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const row = L.W * 4;
    const out = new Uint8Array(px.length);
    for (let y = 0; y < L.H; y++) out.set(px.subarray((L.H - 1 - y) * row, (L.H - y) * row), y * row);
    return out;
  }
}
L.Painter = Painter;
})();
