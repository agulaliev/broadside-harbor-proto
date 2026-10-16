(function () {
'use strict';

// 4. «Веер»: залп нарисован так, как полетит, — дуга от каждой пушки до воды или борта цели, искры попаданий, линия
// падения. Пока заряжают, дуги дорастают к цели; после залпа видны летящие ядра.

const L = window.AimLab;
const K = L.kit;

// Часть дуги по времени полёта: от доли f0 до f1 (точки дуги идут через равное время).
function cut(points, f0, f1) {
  const n = points.length - 1;
  const at = (f) => {
    const x = L.clamp(f, 0, 1) * n;
    const i = Math.min(Math.floor(x), n - 1);
    return L.mix3(points[i], points[i + 1], x - i);
  };
  const out = [at(f0)];
  for (let i = Math.ceil(f0 * n + 1e-6); i < f1 * n; i++) out.push(points[i]);
  out.push(at(f1));
  return out;
}

function spark(g, y, p, r, color) {
  const d = r * 0.7;
  K.strokes(g, y, [[[p[0] - r, p[1]], [p[0] + r, p[1]]], [[p[0], p[1] - r], [p[0], p[1] + r]],
    [[p[0] - d, p[1] - d], [p[0] + d, p[1] + d]], [[p[0] - d, p[1] + d], [p[0] + d, p[1] - d]]], color, 1.25);
}

L.register({
  id: 'fan',
  n: 4,
  title: 'Веер',
  idea: 'Дуги полёта от каждой пушки: залп виден так, как полетит.',
  why: 'Самый зрелищный и понятный новичку: видно, что стреляет весь борт, какие ядра дойдут до цели, а какие лягут в воду. Наводка чувствуется руками.',
  shows: [
    'Дуги — путь ядра от каждой пушки, кто куда долетит; растут к цели, пока заряжают.',
    'Искра — ядро попадёт в борт или палубу; кружок на воде — ляжет мимо.',
    'После залпа видны летящие ядра.',
    'Цвет: золото — заряжено и попадёт, белый — мимо или заряжают, красный — не достать.',
  ],
  inspired: [
    { name: 'Assassin’s Creed IV: Black Flag Resynced', url: 'https://www.ubisoft.com/en-gb/game/assassins-creed/news/6HoFbBC1ib71obvtWVxMyS/assassins-creed-black-flag-resynced-deep-dive-into-hud-customization', note: 'дуги залпа бортом — их не прячет даже «Минимальный» интерфейс' },
    { name: 'Sid Meier’s Pirates!', url: 'https://en.wikipedia.org/wiki/Sid_Meier%27s_Pirates!_(2004_video_game)', note: 'залп бортом по готовым пушкам' },
    { name: 'Sea of Thieves', url: 'https://seaofthieves.wiki.gg/wiki/Cannon', note: 'ядро идёт по дуге, наводка на глаз' },
  ],
  game: 'Дуги уже считает игра (путь каждого ядра). На экране — draw_polyline_colors с затуханием к началу; за кормой цели дуга режется силуэтом (Geometry2D.clip_polyline_with_polygon); кольца и точки — готовыми сетками. 2D-слой в Godot — около 0,2 мс на кадр: у каждой дуги свой вызов со своим буфером.',
  settings: [
    { key: 'from', title: 'Начало дуг (доля полёта)', type: 'range', min: 0, max: 0.8, step: 0.05, value: 0.5 },
    { key: 'line', title: 'Линия падения', type: 'bool', value: true },
    { key: 'sparks', title: 'Искры попаданий', type: 'bool', value: true },
    { key: 'balls', title: 'Летящие ядра', type: 'bool', value: true },
    { key: 'number', title: 'Число', type: 'select', value: 'none',
      options: [['none', 'Нет'], ['reload', 'Перезарядка'], ['hits', 'Попаданий из залпа']] },
  ],
  presets: {
    clean: { from: 0.5, line: false, sparks: true, balls: true, number: 'none' },
    full: { from: 0.1, line: true, sparks: true, balls: true, number: 'hits' },
  },
  draw(g, ctx, s) {
    const st = K.state(ctx);
    const y = K.style(s);
    if (s.balls) K.flying(g, y, ctx);
    if (!st || st.behind) return;
    const a = st.a;
    const tone = st.blocked ? y.warn : st.loaded ? (st.onTarget ? y.ready : y.idle) : L.withA(y.idle, y.idle[3] * 0.55);
    const target = st.target;
    const hullPoly = target ? K.hull(ctx, target) : null;
    const tdist = target ? ctx.cam.distance(target.c) : Infinity;
    const f0 = s.from;
    const grow = st.loaded ? 1 : 0.25 + 0.75 * st.readiness;
    const ends = [];
    a.guns.forEach((gun, i) => {
      if (!gun.j || gun.x || !gun.arc || gun.arc.length < 2) return;
      const m = a.struck ? a.struck[i] : null;
      const hit = m && (m[3] === 1 || m[3] === 2);
      const pts = hit ? K.arcUntil(gun, m) : gun.arc;
      const f1 = f0 + (1 - f0) * grow;
      const world = cut(pts, f0, f1);
      const near = [];
      const far = [];
      for (const p of world) (ctx.cam.distance(p) > tdist + 2 ? far : near).push(p);
      if (near.length && far.length) far.unshift(near[near.length - 1]);
      const runs = [];
      for (const r of ctx.cam.polyline(near)) runs.push(r);
      for (const r of ctx.cam.polyline(far)) runs.push(...(hullPoly ? K.lineMinusConvex(r, hullPoly) : [r]));
      for (const r of runs) {
        if (r.length < 2) continue;
        const colors = r.map((_, j) => L.withA(tone, tone[3] * L.smooth(0, 0.6, j / (r.length - 1))));
        const w = Math.max(1, y.w * 0.75);
        if (y.shadow) g.polylineColors(r, colors.map((col) => [0, 0, 0, col[3] * 0.4]), w + 2, true);
        g.polylineColors(r, colors, w, true);
      }
      if (grow < 1) return;
      const end = K.project(ctx, hit ? m : gun.land);
      if (!end) return;
      const hidden = !hit && hullPoly && ctx.cam.distance(gun.land) > tdist && L.geo.inside(hullPoly, end);
      ends.push({ o: gun.o, p: end, hit, hidden });
    });
    ends.sort((p, q) => p.o - q.o);
    if (s.line && ends.length > 1) {
      const pts = ends.filter((e) => !e.hidden).map((e) => e.p);
      if (pts.length > 1) K.stroke(g, y, pts, L.withA(tone, tone[3] * 0.6), 1);
    }
    for (const e of ends) {
      if (e.hidden) continue;
      if (e.hit) {
        if (s.sparks) spark(g, y, e.p, 4.5 * y.scale, st.loaded ? y.ready : y.soft);
      } else {
        K.ringMark(g, y, e.p, 3 * y.scale, L.withA(tone, tone[3] * 0.85), 1.2, 2.5);
      }
    }
    let text = '';
    if (s.number === 'reload' && !st.loaded) text = L.fmt.seconds(st.left, 1);
    else if (s.number === 'hits') text = st.loaded ? st.hits.hit + '/' + st.hits.total : L.fmt.seconds(st.left, 1);
    if (text) K.text(g, y, [st.mark[0] + 16 * y.scale, st.mark[1] - 10 * y.scale], text, y.text, st.loaded && st.onTarget ? y.ready : y.idle, 0);
  },
});
})();
