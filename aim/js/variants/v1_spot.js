(function () {
'use strict';

// 1. «Пятно»: куда ляжет залп — пятно на воде (за корпусом его не видно) и след на борту цели. Пятно — разброс на ровной
// палубе (так стреляют по готовности); дымка вокруг — насколько шире ляжет залп, если стрелять сейчас, на качке.
// Перезарядка — обводка пятна дорисовывается по кругу; заряжено — обводка целиком.

const L = window.AimLab;
const K = L.kit;

function ringStart(ring) {
  let best = 0;
  for (let i = 1; i < ring.length; i++) if (ring[i][0] < ring[best][0]) best = i;
  return ring.slice(best).concat(ring.slice(0, best + 1));
}

L.register({
  id: 'spot',
  n: 1,
  title: 'Пятно',
  idea: 'Куда ляжет залп: пятно на воде и след на борту цели.',
  why: 'Самый прямой ответ на вопрос «куда я попаду»: видно недолёт, перелёт и какую часть борта накроет. Качка не раздувает пятно на полморя — пятно только бледнеет, и сразу ясно, ждать ли ровной палубы.',
  shows: [
    'Пятно на воде — где лягут ядра на ровной палубе; за корпусами судов его не видно, как настоящей воды.',
    'Качает — пятно бледнеет: залп сейчас ляжет шире; палуба выровнялась — пятно яркое, стрелять.',
    'Полоса на борту цели — часть борта, которую накроет залп.',
    'Обводка дорисовывается по кругу, пока заряжают; замкнулась — заряжено. Золото — заряжено и попадёт, белый — мимо, красный — не достать или цель вне сектора.',
    'Контур на воде впереди идущей цели — где она будет, когда долетят ядра.',
  ],
  inspired: [
    { name: 'World of Warships', url: 'https://wiki.worldofwarships.com/Ship:Gunnery_and_Aiming', note: 'эллипс разброса: где лягут снаряды залпа' },
    { name: 'Assassin’s Creed IV: Black Flag Resynced', url: 'https://www.ubisoft.com/en-gb/game/assassins-creed/news/6HoFbBC1ib71obvtWVxMyS/assassins-creed-black-flag-resynced-deep-dive-into-hud-customization', note: 'залп бортом с дугами наводки' },
    'нынешний прицел Broadside — пятно на воде и пятно на борту',
  ],
  game: 'Пятно на ровной палубе — VolleySpot.of по состоянию без вращения палубы (так ляжет залп по готовности). За корпусами судов пятно режется Geometry2D.intersect_polygons по сторонам силуэтов — куски выпуклые, заливка — наборами треугольников; обводка — clip_polyline_with_polygon и draw_polyline. 2D-слой в Godot — около 0,23–0,26 мс на кадр: дороже других из-за вырезания заливки.',
  settings: [
    { key: 'fill', title: 'Заливка пятна', type: 'bool', value: true },
    { key: 'cover', title: 'След на борту цели', type: 'bool', value: true },
    { key: 'ghost', title: 'Где будет цель', type: 'bool', value: true },
    { key: 'balls', title: 'Ядра по одному', type: 'bool', value: false },
    { key: 'center', title: 'Точка середины', type: 'bool', value: false },
    { key: 'number', title: 'Число', type: 'select', value: 'reload',
      options: [['none', 'Нет'], ['reload', 'Перезарядка'], ['distance', 'Дальность'], ['both', 'Перезарядка и дальность']] },
  ],
  presets: {
    clean: { fill: true, cover: true, ghost: true, balls: false, center: false, number: 'reload' },
    full: { fill: true, cover: true, ghost: true, balls: true, center: true, number: 'both' },
  },
  draw(g, ctx, s) {
    const st = K.state(ctx);
    if (!st || st.behind) return;
    const y = K.style(s);
    const a = st.a;
    const tone = st.blocked ? y.warn : st.loaded && st.onTarget ? y.ready : y.idle;
    const base = st.steady || st.blocked ? tone : L.withA(tone, tone[3] * 0.6);
    const depth = a.center ? ctx.cam.distance(a.center) : st.distance;
    const covers = K.covers(ctx, depth + 5, -1);
    let low = st.mark[1];
    const calm = K.ring(ctx, a.spot_steady || a.spot || []);
    if (s.ghost && st.target && K.lead(ctx, st.target) > 3) {
      const ghost = K.ghostRing(ctx, 0.05);
      const others = K.covers(ctx, depth + 5, st.target.id);
      if (ghost.length > 2) K.strokes(g, y, K.linesMinusAll(L.geo.closed(ghost), others), L.withA(y.idle, y.idle[3] * 0.55), 1.25);
    }
    if (calm.length > 2) {
      if (s.fill) K.fill(g, calm, covers, L.withA(base, base[3] * 0.16));
      const loop = ringStart(calm);
      const done = st.loaded ? 1 : st.readiness;
      if (done < 1) K.strokes(g, y, K.linesMinusAll(loop, covers), L.withA(base, base[3] * 0.28), Math.max(1, y.w * 0.75));
      K.strokes(g, y, K.linesMinusAll(K.part(loop, 0, done), covers), base, st.steady ? y.w : Math.max(1, y.w * 0.8));
      for (const p of calm) low = Math.max(low, p[1]);
    }
    if (s.cover && st.onTarget) {
      const band = K.band(ctx, st.target);
      if (band) {
        const tint = st.blocked ? y.warn : st.loaded ? y.ready : y.soft;
        K.fillBand(g, band, L.withA(tint, tint[3] * 0.3));
        K.stroke(g, y, L.geo.closed(band), tint, Math.max(1, y.w * 0.7));
        for (const p of band) low = Math.max(low, p[1]);
      }
    }
    if (s.balls && a.struck) {
      a.struck.forEach((m, i) => {
        if (!m) return;
        if (m[3] === 1 || m[3] === 2) {
          const p = K.project(ctx, m);
          if (p) K.dot(g, y, p, 2.25 * y.scale, st.loaded ? y.ready : y.soft);
          return;
        }
        const gun = a.guns[i];
        const p = gun && K.project(ctx, gun.land);
        if (!p || covers.some((c) => L.geo.inside(c, p))) return;
        K.ringMark(g, y, p, 2.6 * y.scale, L.withA(y.idle, 0.8), 1.2, 2.5);
      });
    }
    if (s.center) {
      const c = st.mark;
      const r = 3.5 * y.scale;
      K.stroke(g, y, [[c[0], c[1] - r], [c[0] + r, c[1]], [c[0], c[1] + r], [c[0] - r, c[1]], [c[0], c[1] - r]], base, 1.25);
    }
    const lines = [];
    if ((s.number === 'reload' || s.number === 'both') && !st.loaded) lines.push([L.fmt.seconds(st.left, 1), y.idle]);
    if (s.number === 'distance' || s.number === 'both') lines.push([L.fmt.distance(st.range), L.withA(y.idle, y.idle[3] * 0.85)]);
    let at = Math.min(low + 20, L.H - 8 - 17 * (lines.length - 1));
    for (const [text, color] of lines) {
      K.text(g, y, [st.mark[0], at], text, y.text, color);
      at += 17;
    }
  },
});
})();
