(function () {
'use strict';

// Общее для вариантов прицела: цвета, состояние залпа из данных кадра, силуэты судов на экране, то, что на воде прячется
// за корпусом, и рисование с тенью. Всё рисование — вызовы Canvas, то есть CanvasItem Godot: draw_polyline, draw_arc,
// draw_colored_polygon, draw_string_outline + draw_string. Вырезание за корпусом в игре — Geometry2D.clip_polygons и
// clip_polyline_with_polygon по тому же выпуклому силуэту.

const L = window.AimLab;
const K = (L.kit = {});
const TAU = Math.PI * 2;
K.TAU = TAU;

K.PALETTES = {
  gold: { title: 'Золото', ready: [1.0, 0.72, 0.3, 1], soft: [1.0, 0.87, 0.62, 1], idle: [1, 1, 1, 0.92], warn: [1.0, 0.42, 0.35, 1] },
  ice: { title: 'Лёд', ready: [0.42, 0.88, 1.0, 1], soft: [0.76, 0.95, 1.0, 1], idle: [1, 1, 1, 0.92], warn: [1.0, 0.45, 0.4, 1] },
  green: { title: 'Изумруд', ready: [0.48, 1.0, 0.56, 1], soft: [0.8, 1.0, 0.82, 1], idle: [1, 1, 1, 0.92], warn: [1.0, 0.45, 0.4, 1] },
  safe: { title: 'Для дальтоников', ready: [0.9, 0.62, 0.0, 1], soft: [0.98, 0.84, 0.52, 1], idle: [1, 1, 1, 0.92], warn: [0.34, 0.71, 0.91, 1] },
};
K.SHADOW = [0, 0, 0, 0.5];
K.SIZES = [11, 12, 13, 14, 16, 18, 20];

K.COMMON = [
  { key: 'palette', title: 'Цвета', type: 'select', value: 'gold',
    options: Object.keys(K.PALETTES).map((k) => [k, K.PALETTES[k].title]) },
  { key: 'width', title: 'Толщина линий', type: 'range', min: 1, max: 3, step: 0.25, value: 1.75 },
  { key: 'opacity', title: 'Яркость', type: 'range', min: 0.4, max: 1, step: 0.05, value: 0.95 },
  { key: 'scale', title: 'Размер', type: 'range', min: 0.75, max: 1.5, step: 0.05, value: 1 },
  { key: 'shadow', title: 'Тень под линиями', type: 'bool', value: true },
];

// Стиль кадра из настроек: цвета с яркостью, толщина, размеры букв.
K.style = function (s) {
  const p = K.PALETTES[s.palette] || K.PALETTES.gold;
  const o = s.opacity === undefined ? 1 : s.opacity;
  const c = (col) => [col[0], col[1], col[2], col[3] * o];
  const scale = s.scale || 1;
  return {
    ready: c(p.ready), soft: c(p.soft), idle: c(p.idle), warn: c(p.warn),
    shadow: s.shadow === false ? null : [0, 0, 0, 0.5 * o],
    w: s.width || 1.75,
    scale,
    big: K.textSize(18, scale),
    text: K.textSize(16, scale),
    small: K.textSize(13, scale),
  };
};

// Ближайший размер букв, для которого Godot ставит буквы с долей точки так же, как страница (до 20).
K.textSize = function (base, scale) {
  const want = base * scale;
  let best = K.SIZES[0];
  for (const s of K.SIZES) if (Math.abs(s - want) < Math.abs(best - want)) best = s;
  return best;
};

// Состояние залпа: то же, что видит игра (заряжено, готово, качка, достаёт ли), и что получится (кто куда попадёт).
K.state = function (ctx) {
  const a = ctx.aim;
  if (!a || !a.guns || !a.mark_screen) return null;
  const hits = K.hits(a);
  const focus = a.focus || 0;
  const readiness = L.clamp(a.readiness === undefined ? 1 : a.readiness, 0, 1);
  const target = K.targetShip(ctx);
  const unreach = focus !== 0 && a.focus_reach + 1e-3 < a.need;
  const outside = target ? K.outside(ctx, target) : 0;
  return {
    a,
    readiness,
    loaded: !!a.loaded,
    ready: !!a.ready,
    left: a.left || 0,
    reload: a.reload || 0,
    unreach,
    outside,
    blocked: unreach || outside !== 0,
    steady: !!a.steady,
    waiting: !!a.waiting,
    sway: a.sway || 0,
    tolerance: a.tolerance || 2,
    hits,
    onTarget: hits.hit > 0,
    mark: a.mark_screen,
    behind: !!a.behind,
    flight: a.flight ? a.flight.t : 0,
    range: a.arc_range || a.want || 0,
    target,
    distance: target ? ctx.cam.distance(target.c) : a.arc_range || 0,
    ammo: a.ammo,
  };
};

// Кто куда попадёт: по ядру на пушку (HullSpot.Kind: 0 — недолёт, 1 — борт, 2 — палуба, 3 — перелёт).
K.hits = function (a) {
  const out = { hit: 0, board: 0, deck: 0, short: 0, over: 0, total: 0, share: 0 };
  for (const s of a.struck || []) {
    if (!s) continue;
    out.total++;
    if (s[3] === 1) out.board++;
    else if (s[3] === 2) out.deck++;
    else if (s[3] === 3) out.over++;
    else out.short++;
  }
  out.hit = out.board + out.deck;
  out.share = out.total ? out.hit / out.total : 0;
  return out;
};

// Цель прицела: в кого упрётся полёт, чей призрак считает игра, на ком захват; иначе — чужое судно ближе всех к метке
// на экране (так же может выбрать и игра: всё это клиент знает).
K.targetShip = function (ctx) {
  const a = ctx.aim;
  const id = (a.flight && a.flight.target) || (a.ghost && a.ghost.id) || a.focus;
  return (id && ctx.ships.find((s) => s.id === id)) || K.nearest(ctx);
};

K.nearest = function (ctx, radius = 260) {
  const m = ctx.aim.mark_screen;
  if (!m) return null;
  let best = null;
  let bd = radius;
  for (const s of ctx.ships) {
    if (s.id === ctx.scene.player || s.rel === 0 || s.sink) continue;
    const p = K.project(ctx, [s.c[0], s.water, s.c[2]]);
    if (!p) continue;
    const d = Math.hypot(p[0] - m[0], p[1] - m[1]);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
};

// Цель вне сектора пушек: ни одна точка корпуса (в миг попадания) не лежит между крайними доворотами ствола.
// 0 — в секторе; 1 — за краем b, −1 — за краем a.
K.outside = function (ctx, ship) {
  const sec = ctx.aim.sector;
  if (!sec || !ship || !ship.plan) return 0;
  const gh = ctx.aim.ghost && ctx.aim.ghost.id === ship.id ? ctx.aim.ghost : ship;
  const cross = (p, q) => p[0] * q[1] - p[1] * q[0];
  const ab = Math.sign(cross(sec.a, sec.b)) || 1;
  const mid = [sec.a[0] + sec.b[0], sec.a[1] + sec.b[1]];
  let beyondA = 0;
  let beyondB = 0;
  for (const p of gh.plan) {
    const d = [p[0] - sec.o[0], p[1] - sec.o[2]];
    const pastA = cross(sec.a, d) * ab >= 0;
    const beforeB = cross(d, sec.b) * ab >= 0;
    if (pastA && beforeB && d[0] * mid[0] + d[1] * mid[1] > 0) return 0;
    if (pastA) beyondB++;
    else beyondA++;
  }
  return beyondB >= beyondA ? 1 : -1;
};

// Сколько секунд подряд до этого кадра верно test(кадр) (0 — если сейчас неверно).
K.since = function (ctx, test) {
  let n = 0;
  for (let j = ctx.k; j >= 0; j--) {
    if (!test(ctx.scene.frame(j))) break;
    n++;
  }
  return n ? (n - 1) / L.FPS : 0;
};

// Силуэт корпуса на экране без мачт: выпуклая оболочка плана по воде и по верху борта. Им же вырезается то, что на воде
// за судном: точка на воде внутри силуэта лежит за ближним урезом воды, значит, закрыта бортом.
K.hull = function (ctx, ship) {
  if (!ship || !ship.plan) return null;
  const r = L.shipOnScreen(ctx.cam, ship, false);
  return r ? r.poly : null;
};

K.project = (ctx, p) => {
  const r = ctx.cam.project(p);
  return r.behind ? null : [r.x, r.y];
};

// Замкнутый контур из мира на экран (точки за камерой выкидываются — контуры прицела всегда впереди).
K.ring = function (ctx, points) {
  const out = [];
  for (const p of points) {
    const s = K.project(ctx, p);
    if (s) out.push(s);
  }
  return out;
};

// Суда, которые могут закрыть точку на воде на расстоянии depth: ближе неё и с силуэтом на экране.
K.covers = function (ctx, depth, except) {
  const out = [];
  for (const ship of ctx.ships) {
    if (ship.id === ctx.scene.player || ship.id === except || ship.sink) continue;
    if (ctx.cam.distance(ship.c) - 25 > depth) continue;
    const poly = K.hull(ctx, ship);
    if (poly && poly.length >= 3) out.push(poly);
  }
  return out;
};

function area(poly) {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return s * 0.5;
}
K.area = area;

// Отсечение многоугольника полуплоскостью (Сазерленд — Ходжмен): оставить, где side(p) ≥ 0.
function clipHalf(poly, a, b, keepLeft, sign) {
  const out = [];
  const side = (p) => sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) * (keepLeft ? 1 : -1);
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const sp = side(p);
    const sq = side(q);
    if (sp >= 0) out.push(p);
    if ((sp >= 0) !== (sq >= 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

// Выпуклый многоугольник минус выпуклый силуэт: куски вне силуэта полуплоскостями его сторон — выпуклые и без дыр.
K.minusConvex = function (poly, convex) {
  if (!convex || convex.length < 3) return [poly];
  const sign = area(convex) >= 0 ? 1 : -1;
  const pieces = [];
  let rest = poly;
  for (let i = 0; i < convex.length && rest.length >= 3; i++) {
    const a = convex[i];
    const b = convex[(i + 1) % convex.length];
    const out = clipHalf(rest, a, b, false, sign);
    if (out.length >= 3 && Math.abs(area(out)) > 0.25) pieces.push(out);
    rest = clipHalf(rest, a, b, true, sign);
  }
  return pieces;
};

// Ломаная минус выпуклый силуэт (как Geometry2D.clip_polyline_with_polygon): куски снаружи.
K.lineMinusConvex = function (points, convex) {
  if (!convex || convex.length < 3) return [points];
  const sign = area(convex) >= 0 ? 1 : -1;
  const runs = [];
  let run = [];
  const flush = () => {
    if (run.length > 1) runs.push(run);
    run = [];
  };
  for (let i = 0; i + 1 < points.length; i++) {
    const p = points[i];
    const q = points[i + 1];
    let t0 = 0;
    let t1 = 1;
    let inside = true;
    for (let e = 0; e < convex.length && inside; e++) {
      const a = convex[e];
      const b = convex[(e + 1) % convex.length];
      const nx = -(b[1] - a[1]) * sign;
      const ny = (b[0] - a[0]) * sign;
      const fp = nx * (p[0] - a[0]) + ny * (p[1] - a[1]);
      const fq = nx * (q[0] - a[0]) + ny * (q[1] - a[1]);
      if (fp < 0 && fq < 0) inside = false;
      else if (fp < 0) t0 = Math.max(t0, fp / (fp - fq));
      else if (fq < 0) t1 = Math.min(t1, fp / (fp - fq));
    }
    const at = (t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    if (!inside || t0 >= t1) {
      if (!run.length) run.push(p);
      run.push(q);
      continue;
    }
    if (t0 > 0) {
      if (!run.length) run.push(p);
      run.push(at(t0));
    }
    flush();
    if (t1 < 1) run.push(at(t1), q);
  }
  flush();
  return runs;
};

K.linesMinusAll = function (points, convexes) {
  let parts = [points];
  for (const c of convexes) {
    const next = [];
    for (const p of parts) next.push(...K.lineMinusConvex(p, c));
    parts = next;
  }
  return parts;
};

// Заливка пятна на воде за вычетом силуэтов судов — готовыми треугольниками (в игре — один
// RenderingServer.canvas_item_add_triangle_array). Пятно — оболочка эллипсов, выпуклое; на экране берётся его выпуклая
// оболочка (волны чуть гнут контур), силуэт режет её полуплоскостями своих сторон на выпуклые куски, каждый — веером.
// В игре те же куски дают Geometry2D.intersect_polygons по сторонам силуэта (выпуклое с выпуклым). draw_colored_polygon
// для вырезанного контура не годится: такие контуры Godot на треугольники порой не разбивает и не рисует.
K.fill = function (g, ring, covers, color) {
  if (ring.length < 3) return;
  const shape = L.geo.hull(ring);
  if (shape.length < 3) return;
  const box = L.geo.bounds(shape);
  let parts = [shape];
  for (const h of covers) {
    const r = L.geo.bounds(h);
    if (r.x > box.x + box.w || r.y > box.y + box.h || r.x + r.w < box.x || r.y + r.h < box.y) continue;
    const next = [];
    for (const part of parts) next.push(...K.minusConvex(part, h));
    parts = next;
  }
  const pts = [];
  const idx = [];
  for (const part of parts) {
    const base = pts.length;
    pts.push(...part);
    for (let k = 1; k + 1 < part.length; k++) idx.push(base, base + k, base + k + 1);
  }
  if (idx.length) g.triangles(pts, idx, color);
};

// Заливка полосы на борту (K.band: нижний край, затем верхний в обратном порядке) — четырёхугольниками полосы.
K.fillBand = function (g, band, color) {
  const n = band.length / 2;
  if (n < 2 || !Number.isInteger(n)) {
    g.polygon(band, color);
    return;
  }
  const idx = [];
  for (let i = 0; i + 1 < n; i++) idx.push(i, i + 1, 2 * n - 2 - i, i, 2 * n - 2 - i, 2 * n - 1 - i);
  g.triangles(band, idx, color);
};

// Перо: отрезок — draw_line (у Godot это примитивы без своего буфера вершин, доли микросекунды), ломаная —
// draw_polyline (свой буфер вершин на вызов, 10–18 мкс): прямое прицел рисует отрезками.
K.line = function (g, points, color, width) {
  if (points.length === 2) g.line(points[0], points[1], color, width, true);
  else g.polyline(points, color, width, true);
};

// Линия с тенью: сначала тёмная шире, поверх — цветная (так её видно и на пене, и на небе).
K.stroke = function (g, st, points, color, width) {
  if (points.length < 2) return;
  if (st.shadow) K.line(g, points, st.shadow, width + 2);
  K.line(g, points, color, width);
};

K.strokes = function (g, st, runs, color, width) {
  if (st.shadow) for (const r of runs) if (r.length > 1) K.line(g, r, st.shadow, width + 2);
  for (const r of runs) if (r.length > 1) K.line(g, r, color, width);
};

K.arc = function (g, st, c, r, a0, a1, color, width, count = 48) {
  if (st.shadow) g.arc(c, r, a0, a1, count, st.shadow, width + 2, true);
  g.arc(c, r, a0, a1, count, color, width, true);
};

// Строка серединой в точке at (align 0.5) с обводкой — как AimReticle._text игры.
K.text = function (g, st, at, text, size, color, align = 0.5, outline = 4) {
  if (!text) return;
  const width = g.stringSize(text, size);
  const x = L.clamp(at[0] - width * align, 6, Math.max(L.W - 6 - width, 6));
  if (outline) g.text([x, at[1]], text, size, [0, 0, 0, 0.8 * (color[3] === undefined ? 1 : Math.min(1, color[3] + 0.1))], outline);
  g.text([x, at[1]], text, size, color, 0);
};

// Точка и кольцо — готовыми сетками (draw_mesh): draw_circle заводит свой буфер на каждый вызов (10–15 мкс), сетка —
// доли микросекунды.
K.dot = function (g, st, p, r, color) {
  if (st.shadow) g.mesh(L.discMesh(r + 1.25), p, st.shadow);
  g.mesh(L.discMesh(r), p, color);
};

K.ringMark = function (g, st, p, r, color, width, shadow) {
  if (st.shadow) g.mesh(L.ringMesh(r, shadow), p, st.shadow);
  g.mesh(L.ringMesh(r, width), p, color);
};

// Пунктир по ломаной: куски длиной dash через gap.
K.dashed = function (g, st, points, color, width, dash, gap, phase = 0) {
  K.strokes(g, st, L.geo.dashes(points, dash, gap, phase), color, width);
};

// Рамка хоть краем на экране (подпись цели за краем экрана не рисуется — решение владельца 16 октября).
K.onScreen = (box) => box.x + box.w > 0 && box.y + box.h > 0 && box.x < L.W && box.y < L.H;

// Уголки рамки вокруг прямоугольника: длина плеча arm; fill — доля начерченных плеч (перезарядка).
K.corners = function (g, st, box, arm, color, width, fill = 1) {
  const x0 = box.x;
  const y0 = box.y;
  const x1 = box.x + box.w;
  const y1 = box.y + box.h;
  const a = arm * L.clamp(fill, 0, 1);
  if (a < 0.5) return;
  K.square(g, st, [
    [[x0, y0 + a], [x0, y0], [x0 + a, y0]],
    [[x1 - a, y0], [x1, y0], [x1, y0 + a]],
    [[x1, y1 - a], [x1, y1], [x1 - a, y1]],
    [[x0 + a, y1], [x0, y1], [x0, y1 - a]],
  ], color, width);
};

// Ломаные с прямыми углами (уголки, скобки) — отрезками draw_line: у сгиба входящий отрезок заходит за угол на
// полширины, исходящий начинается через полширины — угол квадратный, как у ломаной, и без наложения.
K.square = function (g, st, runs, color, width) {
  const pass = (c, w) => {
    const h = L.aaWidth(w) * 0.5;
    for (const r of runs) {
      for (let i = 0; i + 1 < r.length; i++) {
        const p = r[i];
        const q = r[i + 1];
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (len < 1e-6) continue;
        const d = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
        const from = i > 0 ? [p[0] + d[0] * h, p[1] + d[1] * h] : p;
        const to = i + 2 < r.length ? [q[0] + d[0] * h, q[1] + d[1] * h] : q;
        g.line(from, to, c, w, true);
      }
    }
  };
  if (st.shadow) pass(st.shadow, width + 2);
  pass(color, width);
};

// Где ляжет залп относительно цели: вдоль выстрела (+ — перелёт) и поперёк, в метрах; half — полудлина цели поперёк.
K.miss = function (ctx) {
  const a = ctx.aim;
  const g = a.ghost;
  if (!g || !a.center || !a.ahead) return null;
  let fx = a.ahead[0];
  let fz = a.ahead[2];
  const n = Math.hypot(fx, fz) || 1;
  fx /= n;
  fz /= n;
  const dx = a.center[0] - g.c[0];
  const dz = a.center[2] - g.c[2];
  const along = dx * fx + dz * fz;
  const across = dx * -fz + dz * fx;
  let half = 0;
  let deep = 0;
  for (const p of g.plan) {
    const px = p[0] - g.c[0];
    const pz = p[1] - g.c[2];
    half = Math.max(half, Math.abs(px * -fz + pz * fx));
    deep = Math.max(deep, Math.abs(px * fx + pz * fz));
  }
  return { along, across, half, deep };
};

// Перевод «метров вдоль выстрела» в шаг прицела по вертикали на экране у цели (для подсказки «выше/ниже»).
K.rangeToScreen = function (ctx, metres) {
  const a = ctx.aim;
  if (!a.center || !a.ahead) return 0;
  const p0 = ctx.cam.point(a.center);
  const p1 = ctx.cam.point([a.center[0] + a.ahead[0] * metres, a.center[1], a.center[2] + a.ahead[2] * metres]);
  return p1[1] - p0[1];
};

// Угол падения ядра средней пушки у воды, радианы (для перевода разброса по дальности в высоту на борту цели).
K.descent = function (a) {
  const gun = (a.guns || []).find((x) => x.j && !x.x) || (a.guns || [])[0];
  if (!gun || !gun.arc || gun.arc.length < 3) return 0.06;
  const p = gun.arc[gun.arc.length - 2];
  const q = gun.arc[gun.arc.length - 1];
  const run = Math.hypot(q[0] - p[0], q[2] - p[2]);
  return Math.atan2(Math.max(p[1] - q[1], 0), Math.max(run, 1e-3));
};

// Полоса на ближнем борту цели, которую накроет залп: вдоль борта — от крайнего до крайнего попадания (± разлёт ядра
// поперёк), по высоте — от низшего до высшего (± разброс по дальности, переведённый в высоту углом падения). Считается
// в осях призрака (цель в миг попадания), рисуется на судне сейчас — полоса держится за видимый корпус.
K.band = function (ctx, ship) {
  const a = ctx.aim;
  const gh = a.ghost;
  if (!gh || !ship || !ship.plan) return null;
  const hits = (a.struck || []).filter((m) => m && (m[3] === 1 || m[3] === 2));
  if (!hits.length) return null;
  const axes = (o) => {
    const n = Math.hypot(o.fwd[0], o.fwd[2]) || 1;
    return { c: o.c, f: [o.fwd[0] / n, o.fwd[2] / n], r: [o.fwd[2] / n, -o.fwd[0] / n] };
  };
  const g = axes(gh);
  const now = axes(ship);
  const ell = (a.ellipses || [])[Math.floor((a.ellipses || []).length / 2)];
  const wide = ell ? ell[5] : 1;
  const rise = Math.min(ell ? ell[4] * Math.tan(K.descent(a)) : 1, 12);
  let u0 = Infinity;
  let u1 = -Infinity;
  let h0 = Infinity;
  let h1 = -Infinity;
  for (const m of hits) {
    const u = (m[0] - g.c[0]) * g.f[0] + (m[2] - g.c[2]) * g.f[1];
    u0 = Math.min(u0, u - wide);
    u1 = Math.max(u1, u + wide);
    h0 = Math.min(h0, m[1] - gh.water - rise);
    h1 = Math.max(h1, m[1] - gh.water + rise);
  }
  const eye = ctx.cam.o;
  const side = Math.sign((eye[0] - now.c[0]) * now.r[0] + (eye[2] - now.c[2]) * now.r[1]) || 1;
  const rim = [];
  for (const p of ship.plan) {
    const dx = p[0] - now.c[0];
    const dz = p[1] - now.c[2];
    const v = (dx * now.r[0] + dz * now.r[1]) * side;
    if (v >= -0.05) rim.push([dx * now.f[0] + dz * now.f[1], v]);
  }
  if (rim.length < 2) return null;
  rim.sort((p, q) => p[0] - q[0]);
  u0 = Math.max(u0, rim[0][0]);
  u1 = Math.min(u1, rim[rim.length - 1][0]);
  h0 = L.clamp(h0, 0, ship.top);
  h1 = L.clamp(h1, 0, ship.top);
  if (u1 - u0 < 0.2 || h1 - h0 < 0.05) return null;
  const across = (u) => {
    for (let i = 1; i < rim.length; i++) {
      if (u <= rim[i][0]) {
        const t = (u - rim[i - 1][0]) / Math.max(rim[i][0] - rim[i - 1][0], 1e-6);
        return L.lerp(rim[i - 1][1], rim[i][1], L.clamp(t, 0, 1));
      }
    }
    return rim[rim.length - 1][1];
  };
  const at = (u, h) => {
    const v = across(u) * side + 0.15 * side;
    return [now.c[0] + now.f[0] * u + now.r[0] * v, ship.water + h, now.c[2] + now.f[1] * u + now.r[1] * v];
  };
  const steps = 10;
  const lower = [];
  const upper = [];
  for (let i = 0; i <= steps; i++) {
    const u = L.lerp(u0, u1, i / steps);
    lower.push(at(u, h0));
    upper.push(at(u, h1));
  }
  const ring = K.ring(ctx, lower.concat(upper.reverse()));
  return ring.length > 2 ? ring : null;
};

// Упреждение: на сколько метров цель уйдёт, пока летят ядра (призрак против корпуса сейчас).
K.lead = function (ctx, ship) {
  const gh = ctx.aim.ghost;
  if (!gh || !ship || gh.id !== ship.id) return 0;
  return Math.hypot(gh.c[0] - ship.c[0], gh.c[2] - ship.c[2]);
};

// Контур призрака (цель в миг попадания) на экране: план корпуса на высоте lift над его водой.
K.ghostRing = function (ctx, lift = 0) {
  const gh = ctx.aim.ghost;
  return gh ? K.ring(ctx, gh.plan.map((p) => [p[0], gh.water + lift, p[1]])) : [];
};

// Силуэт призрака на экране: выпуклая оболочка плана по воде и по верху борта (как K.hull у судна).
K.ghostHull = function (ctx) {
  const gh = ctx.aim.ghost;
  if (!gh || !gh.plan) return null;
  const pts = [];
  for (const p of gh.plan) {
    pts.push([p[0], gh.water - 0.3, p[1]]);
    pts.push([p[0], gh.water + gh.top, p[1]]);
  }
  const screen = K.ring(ctx, pts);
  return screen.length > 2 ? L.geo.hull(screen) : null;
};

// Ромб «сюда навести»: залит — заряжено и попадёт.
K.diamond = function (g, st, p, r, color, filled) {
  const d = [[p[0], p[1] - r], [p[0] + r, p[1]], [p[0], p[1] + r], [p[0] - r, p[1]]];
  if (filled) g.polygon(d, L.withA(color, color[3] * 0.85));
  K.stroke(g, st, L.geo.closed(d), color, 1.5);
};

// Галочка-стрелка: острие в сторону dir (единичный вектор экрана).
K.chevron = function (g, st, c, dir, size, color) {
  const [dx, dy] = dir;
  const tip = [c[0] + dx * size, c[1] + dy * size];
  const l = [c[0] - dy * size * 0.8, c[1] + dx * size * 0.8];
  const r = [c[0] + dy * size * 0.8, c[1] - dx * size * 0.8];
  K.stroke(g, st, [l, tip, r], color, 2);
};

// Куда довести прицел при промахе: вбок (мимо поперёк или цель вне сектора), выше (недолёт) или ниже (перелёт);
// metres — на сколько метров. null — попадает или цели нет.
K.hint = function (ctx, st) {
  const target = st.target;
  if (!target || st.hits.hit > 0 || !st.hits.total) return null;
  const m = K.miss(ctx);
  if (!m) return null;
  if (st.outside || Math.abs(m.across) > m.half + 1) {
    const side = K.project(ctx, [target.c[0], target.water + target.top * 0.5, target.c[2]]);
    return { dir: side && side[0] < st.mark[0] ? [-1, 0] : [1, 0], metres: Math.abs(m.across) - m.half };
  }
  return m.along < 0 ? { dir: [0, -1], metres: -m.along } : { dir: [0, 1], metres: m.along };
};

// Летящие ядра — точкой (след ядра в воздухе игра рисует сама). Хвоста нет: в выгрузке у ядра нет номера, и «то же
// ядро кадром раньше» по близости путается с соседним — выходила пила.
K.flying = function (g, st, ctx) {
  for (const b of ctx.balls) {
    const p = K.project(ctx, b);
    if (p) K.dot(g, st, p, 1.8, st.idle);
  }
};

// Точки дуги полёта пушки до места, где ядро встретит цель (по пятну на борту), иначе до воды.
K.arcUntil = function (gun, stop) {
  if (!stop) return gun.arc;
  let best = gun.arc.length - 1;
  let bestD = Infinity;
  for (let i = 0; i < gun.arc.length; i++) {
    const p = gun.arc[i];
    const d = Math.hypot(p[0] - stop[0], p[2] - stop[2]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const out = gun.arc.slice(0, best + 1);
  out.push([stop[0], stop[1], stop[2]]);
  return out;
};

// Видимая доля ломаной: от a до b её длины (для «растущих» дуг и обводки перезарядки).
K.part = (points, a, b) => (b > a ? L.geo.slice(points, a, b) : []);

K.lerpPoint = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

const DEG = Math.PI / 180;
const flat = (v) => {
  const n = Math.hypot(v[0], v[2]) || 1;
  return [v[0] / n, v[2] / n];
};

// Правила урона корпусу по углу — CombatSettings по умолчанию (config/combat_default.tres их не меняет) и
// ShipDamage.RAKE_END: продольно (ядро вошло в корму или нос не круче rake° к оси) — ×rake_hull; круче glance° к
// поперечнику — скользнёт, ×glance_damage; между — (cos / cos free°)^power; в палубу — ×0.6 без поправки на угол.
K.DAMAGE = { rake: 30, rakeEnd: 0.3, rakeHull: 2, glance: 70, glanceDamage: 0.25, free: 20, power: 2, deck: 0.6 };

// Как залп встретит борт цели — по тем же правилам, что ShipDamage.rake / apply, для каждого попадания HullSpot
// (направление — отрезок пути ядра у места попадания, цель — в миг прихода ядер).
// kind: rake — продольно хотя бы половина попаданий, full — множитель ≥ 0.8, glance — больше половины скользнёт,
// slant — иначе; none — ни одного попадания. mult — средний множитель урона корпусу на попадание.
K.effect = function (ctx, st) {
  const a = st.a;
  const gh = a.ghost;
  const out = { kind: 'none', mult: 0, hits: 0, rake: 0, glance: 0 };
  if (!gh || !gh.plan || !st.target || gh.id !== st.target.id) return out;
  const D = K.DAMAGE;
  const f = flat(gh.fwd);
  const r = [-f[1], f[0]];
  const cls = ctx.scene.classes && ctx.scene.classes[st.target.cls];
  let length = cls ? cls.length : 0;
  if (!length) {
    let u0 = Infinity;
    let u1 = -Infinity;
    for (const p of gh.plan) {
      const u = (p[0] - gh.c[0]) * f[0] + (p[1] - gh.c[2]) * f[1];
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
    }
    length = Math.max(u1 - u0, 1);
  }
  let sum = 0;
  (a.guns || []).forEach((gun, i) => {
    const m = a.struck ? a.struck[i] : null;
    if (!m || !(m[3] === 1 || m[3] === 2) || !gun.arc) return;
    out.hits++;
    if (m[3] === 2) {
      sum += D.deck;
      return;
    }
    const arc = gun.arc;
    let best = 0;
    let bd = Infinity;
    for (let j = 0; j < arc.length; j++) {
      const dd = Math.hypot(arc[j][0] - m[0], arc[j][2] - m[2]);
      if (dd < bd) {
        bd = dd;
        best = j;
      }
    }
    const j0 = Math.min(best, arc.length - 2);
    const d = flat([arc[j0 + 1][0] - arc[j0][0], 0, arc[j0 + 1][2] - arc[j0][2]]);
    const fx = d[0] * r[0] + d[1] * r[1];
    const fz = -(d[0] * f[0] + d[1] * f[1]);
    const s = -((m[0] - gh.c[0]) * f[0] + (m[2] - gh.c[2]) * f[1]) / length;
    const end = (s > D.rakeEnd && fz < 0) || (s < -D.rakeEnd && fz > 0);
    if (end && Math.abs(fz) >= Math.cos(D.rake * DEG)) {
      out.rake++;
      sum += D.rakeHull;
      return;
    }
    const facing = Math.abs(fx);
    if (facing < Math.cos(D.glance * DEG)) {
      out.glance++;
      sum += D.glanceDamage;
      return;
    }
    sum += Math.pow(Math.min(facing / Math.cos(D.free * DEG), 1), D.power);
  });
  if (!out.hits) return out;
  out.mult = sum / out.hits;
  out.kind = out.rake * 2 >= out.hits ? 'rake' : out.mult >= 0.8 ? 'full' : out.glance * 2 > out.hits ? 'glance' : 'slant';
  return out;
};

// Уязвимое место по правилу игры (у AC IV — красные ромбы на корпусе): корма или нос цели, если ядра отсюда идут не
// круче rake° к её оси — залп, наведённый туда, войдёт продольно. Точка — середина транца (носа) на высоте пушек,
// на судне сейчас (как полоса на борту — держится за видимый корпус).
K.weakPoint = function (ctx, st) {
  const a = st.a;
  const ship = st.target;
  if (!ship || !ship.plan || !a.ahead) return null;
  const gh = a.ghost && a.ghost.id === ship.id ? a.ghost : ship;
  const fa = flat(gh.fwd);
  const dir = flat(a.ahead);
  const fz = -(dir[0] * fa[0] + dir[1] * fa[1]);
  if (Math.abs(fz) < Math.cos(K.DAMAGE.rake * DEG)) return null;
  const stern = fz < 0;
  const f = flat(ship.fwd);
  const s = stern ? -1 : 1;
  let reach = 0;
  for (const p of ship.plan) reach = Math.max(reach, ((p[0] - ship.c[0]) * f[0] + (p[1] - ship.c[2]) * f[1]) * s);
  return { stern, at: [ship.c[0] + f[0] * reach * s, ship.water + ship.top * 0.55, ship.c[2] + f[1] * reach * s] };
};

// Борт судна, что смотрит на нас (мы не дальше FACING° от его траверза: довернуть на залп — секунды; кормой или носом
// к нам — null), и зарядка его пушек (0…1, −1 — пушек нет): зарядку чужих клиент знает из снимка (Protocol.put_brief —
// ShipState.reloads и loaded). Линия — по плану корпуса на высоте пушек, средние 85 % длины.
K.FACING = 30;
K.facing = function (ctx, ship) {
  const own = ctx.own;
  if (!own || !ship || !ship.plan || !ship.reload || ship.sink) return null;
  const f = flat(ship.fwd);
  const r = [-f[1], f[0]];
  const to = flat([own.c[0] - ship.c[0], 0, own.c[2] - ship.c[2]]);
  const across = to[0] * r[0] + to[1] * r[1];
  if (Math.abs(across) < Math.cos(K.FACING * DEG)) return null;
  const side = across >= 0 ? 1 : -1;
  const ready = ship.reload[side > 0 ? 0 : 1];
  const rim = [];
  let u0 = Infinity;
  let u1 = -Infinity;
  for (const p of ship.plan) {
    const dx = p[0] - ship.c[0];
    const dz = p[1] - ship.c[2];
    const u = dx * f[0] + dz * f[1];
    u0 = Math.min(u0, u);
    u1 = Math.max(u1, u);
    const v = (dx * r[0] + dz * r[1]) * side;
    if (v >= -0.05) rim.push([u, v]);
  }
  const mid = (u0 + u1) * 0.5;
  const half = (u1 - u0) * 0.425;
  const keep = rim.filter((p) => Math.abs(p[0] - mid) <= half).sort((p, q) => p[0] - q[0]);
  const h = ship.water + ship.top * 0.6;
  const line = keep.map(([u, v]) => {
    const w = (v + 0.3) * side;
    return [ship.c[0] + f[0] * u + r[0] * w, h, ship.c[2] + f[1] * u + r[1] * w];
  });
  return { ready, line };
};

// Цвета AC IV: свечение заряженных пушек — оранжевое, уязвимое место — красное; в палитре «Для дальтоников» — её warn.
K.acColors = function (s, y) {
  if (s.palette === 'safe') return { fire: y.warn, weak: y.warn };
  const o = s.opacity === undefined ? 1 : s.opacity;
  return { fire: [1.0, 0.56, 0.2, o], weak: [0.95, 0.22, 0.16, o] };
};

// Уязвимое место — ромб с белой обводкой (как у AC IV); залит — залп войдёт продольно, пуст — войдёт, если навести сюда.
K.weakMark = function (g, st, p, r, color, filled) {
  const d = [[p[0], p[1] - r], [p[0] + r, p[1]], [p[0], p[1] + r], [p[0] - r, p[1]]];
  g.polygon(d, L.withA(color, color[3] * (filled ? 0.9 : 0.35)));
  K.stroke(g, st, L.geo.closed(d), L.withA(st.idle, st.idle[3] * (filled ? 1 : 0.7)), 1.25);
};

// Свечение заряженного борта (у AC IV пушки врага светятся перед залпом): широкая бледная линия и узкая яркая.
K.glow = function (g, st, ctx, line, color) {
  const beat = 0.75 + 0.25 * Math.cos(ctx.t * Math.PI * 2.4);
  for (const run of ctx.cam.polyline(line)) {
    g.polyline(run, L.withA(color, color[3] * 0.2 * beat), 9, true);
    g.polyline(run, L.withA(color, color[3] * 0.95 * beat), 2, true);
  }
};

// Круг, в который ляжет весь залп (2σ), — как круг сведения World of Tanks, но из правды залпа: середины падений пушек
// вокруг метки (сводят расчёты стволы — сходятся) плюс разброс одного ядра в сечении на дальности цели, как конус у
// танков: поперёк — wide, по высоте — long через угол падения (не больше 12 м). Эллипс на воде вдоль полёта при пологом
// падении тянется на сотню метров к камере — его проекцией круг раздувался бы на весь экран при каждом недолёте.
// steady — на ровной палубе и со сведёнными стволами: до какого круга он сожмётся.
K.spread = function (ctx, st, steady) {
  const a = st.a;
  const c = st.mark;
  const ells = (steady && a.ellipses_steady) || a.ellipses || [];
  const ell = ells[Math.floor(ells.length / 2)];
  const dist = Math.max(ctx.cam.distance(a.mark || a.center), 5);
  const ppm = ctx.cam.pixelsPerMetre(dist);
  let one = 0;
  if (ell) one = Math.max(ell[5], Math.min(ell[4] * Math.tan(K.descent(a)), 12)) * ppm;
  let span = 0;
  if (!steady) {
    (a.guns || []).forEach((gun, i) => {
      if (!gun.j || gun.x || !gun.land) return;
      const m = a.struck ? a.struck[i] : null;
      const p = K.project(ctx, m && (m[3] === 1 || m[3] === 2) ? m : gun.land);
      if (p) span = Math.max(span, Math.hypot(p[0] - c[0], p[1] - c[1]));
    });
  }
  return span + one;
};

// Завеса залпа — прицел бортом AC IV Black Flag: полупрозрачная поверхность между путями ядер соседних пушек от доли
// полёта o.from до места, где ядро встретит борт цели или воду; края — пути крайних пушек, низ — линия падения. Пути —
// игры, с нынешним сведением: сводят расчёты стволы — завеса сужается. Что за целью — вырезано её силуэтом. Завеса —
// один набор треугольников с цветом у вершин (не больше SHEET_ARCS путей: крайние и равномерно между ними).
K.SHEET_ARCS = 9;
K.SHEET_STEPS = 10;
K.sheet = function (g, y, ctx, st, o) {
  const a = st.a;
  const runs = [];
  (a.guns || []).forEach((gun, i) => {
    if (!gun.j || gun.x || !gun.arc || gun.arc.length < 2) return;
    const m = a.struck ? a.struck[i] : null;
    const hit = !!m && (m[3] === 1 || m[3] === 2);
    runs.push({ o: gun.o, pts: hit ? K.arcUntil(gun, m) : gun.arc });
  });
  if (!runs.length) return;
  runs.sort((p, q) => p.o - q.o);
  let pick = runs;
  if (runs.length > K.SHEET_ARCS) {
    pick = [];
    for (let k = 0; k < K.SHEET_ARCS; k++) pick.push(runs[Math.round((k * (runs.length - 1)) / (K.SHEET_ARCS - 1))]);
  }
  const n = K.SHEET_STEPS;
  const from = L.clamp(o.from, 0, 0.9);
  const fr = [];
  for (let j = 0; j <= n; j++) fr.push(from + ((1 - from) * j) / n);
  const at = (pts, f) => {
    const x = f * (pts.length - 1);
    const i = Math.min(Math.floor(x), pts.length - 2);
    return L.mix3(pts[i], pts[i + 1], x - i);
  };
  const fade = (f) => L.smooth(from, from + 0.3 * (1 - from) + 1e-3, f) * (0.35 + 0.65 * f);
  const col = (f, k) => L.withA(o.color, o.color[3] * k * fade(f));
  const target = st.target;
  const hullPoly = target ? K.hull(ctx, target) : null;
  const box = hullPoly ? L.geo.bounds(hullPoly) : null;
  const tdist = target ? ctx.cam.distance(target.c) : Infinity;
  const grid = pick.map((r) => fr.map((f) => ctx.cam.project(at(r.pts, f))));
  if (o.fill > 0 && grid.length > 1) {
    const P = [];
    const C = [];
    const I = [];
    for (let r = 0; r + 1 < grid.length; r++) {
      for (let j = 0; j < n; j++) {
        const q = [grid[r][j], grid[r][j + 1], grid[r + 1][j + 1], grid[r + 1][j]];
        if (q.some((v) => v.behind)) continue;
        const quad = q.map((v) => [v.x, v.y]);
        if (hullPoly && Math.min(q[0].depth, q[1].depth, q[2].depth, q[3].depth) > tdist + 2) {
          const b = L.geo.bounds(quad);
          if (!(b.x > box.x + box.w || b.y > box.y + box.h || b.x + b.w < box.x || b.y + b.h < box.y)) {
            const mid = col((fr[j] + fr[j + 1]) * 0.5, o.fill);
            for (const part of K.minusConvex(quad, hullPoly)) {
              const base = P.length;
              for (const p of part) {
                P.push(p);
                C.push(mid);
              }
              for (let k = 1; k + 1 < part.length; k++) I.push(base, base + k, base + k + 1);
            }
            continue;
          }
        }
        const base = P.length;
        P.push(...quad);
        C.push(col(fr[j], o.fill), col(fr[j + 1], o.fill), col(fr[j + 1], o.fill), col(fr[j], o.fill));
        I.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    if (I.length) g.trianglesColors(P, I, C);
  }
  const sides = o.edge > 0 ? (pick.length > 1 ? [pick[0], pick[pick.length - 1]] : [pick[0]]) : [];
  const w = Math.max(1, y.w * 0.75);
  for (const r of sides) {
    const world = fr.map((f) => at(r.pts, f));
    const near = [];
    const far = [];
    for (const p of world) (ctx.cam.distance(p) > tdist + 2 ? far : near).push(p);
    if (near.length && far.length) far.unshift(near[near.length - 1]);
    const parts = [];
    for (const s of ctx.cam.polyline(near)) parts.push(s);
    for (const s of ctx.cam.polyline(far)) parts.push(...(hullPoly ? K.lineMinusConvex(s, hullPoly) : [s]));
    for (const s of parts) {
      if (s.length < 2) continue;
      const colors = s.map((_, j) => L.withA(o.color, o.color[3] * o.edge * L.smooth(0, 0.5, j / (s.length - 1))));
      if (y.shadow) g.polylineColors(s, colors.map((c) => [0, 0, 0, c[3] * 0.4]), w + 2, true);
      g.polylineColors(s, colors, w, true);
    }
  }
  if (o.land > 0) {
    const ends = grid.map((row) => row[n]);
    const segs = [];
    for (let r = 0; r + 1 < ends.length; r++) {
      const p = ends[r];
      const q = ends[r + 1];
      if (p.behind || q.behind) continue;
      const s = [[p.x, p.y], [q.x, q.y]];
      if (hullPoly && p.depth > tdist + 2 && q.depth > tdist + 2) segs.push(...K.lineMinusConvex(s, hullPoly));
      else segs.push(s);
    }
    K.strokes(g, y, segs, L.withA(o.color, o.color[3] * o.land), y.w);
  }
};
})();
