(function () {
'use strict';

// 3. «Упреждение»: где будет цель, когда долетят ядра, — призрак корпуса (в «Полном» — и ромб, куда навести); сам прицел — тихая
// линейка с рисками упреждения на узлы хода цели (как в «кораблях»). Перезарядка — черта под линейкой.

const L = window.AimLab;
const K = L.kit;
const KNOT = 0.5144;

L.register({
  id: 'lead',
  n: 3,
  title: 'Упреждение',
  idea: 'Призрак цели в миг попадания; прицел — линейка упреждения. В «Полном» — ещё ромб: куда навести.',
  why: 'По идущей цели мажут чаще всего из-за упреждения. Здесь оно видно прямо: бледный корпус стоит там, где цель встретит ядра, — свёл с ним середину линейки, и залп ляжет в цель. Стреляет рука: ромб «сюда» — только в «Полном».',
  shows: [
    'Ромб (в «Полном») — куда навести середину прицела, чтобы ядра встретили цель; залит — заряжено и попадёт.',
    'Бледный корпус впереди идущей цели — где она будет, когда долетят ядра; тонкая линия — её путь до встречи.',
    'Линейка — сам прицел: середина — куда ляжет залп, риски — упреждение на 2, 5 или 10 узлов хода цели.',
    'Черта под линейкой — зарядка: доросла до конца — заряжено.',
  ],
  inspired: [
    { name: 'War Thunder', url: 'https://forum.warthunder.com/t/hornet-s-sting-improvements-and-new-features/220585', note: 'указатель упреждения у пушек самолётов; на кораблях в аркаде упреждение берут расчёты' },
    { name: 'World of Warships', url: 'https://wiki.worldofwarships.com/Ship:Gunnery_and_Aiming', note: 'упреждение на глаз, время полёта под прицелом' },
    { name: 'Sid Meier’s Pirates!', url: 'https://en.wikipedia.org/wiki/Sid_Meier%27s_Pirates!_(2004_video_game)', note: 'ядра летят долго — упреждение берёт игрок' },
    'прицелы с вычислением упреждения (гироприцел) — точка встречи',
  ],
  game: 'Призрак уже считает игра (корпус цели в миг попадания). Контур призрака и путь цели — draw_polyline, линейка и риски — draw_line, ромб — draw_colored_polygon; риски — по пикселям на метр у метки. 2D-слой в Godot — около 0,01 мс на кадр в «Чистом» и 0,05 — в «Полном».',
  settings: [
    { key: 'ghost', title: 'Призрак цели', type: 'bool', value: true },
    { key: 'line', title: 'Путь цели до встречи', type: 'bool', value: true },
    { key: 'pip', title: 'Ромб «сюда навести»', type: 'bool', value: true },
    { key: 'ticks', title: 'Риски упреждения', type: 'bool', value: true },
    { key: 'still', title: 'Призрак и у стоящей цели', type: 'bool', value: false },
    { key: 'number', title: 'Число', type: 'select', value: 'time',
      options: [['none', 'Нет'], ['time', 'Время полёта'], ['reload', 'Перезарядка'], ['distance', 'Дальность']] },
  ],
  presets: {
    clean: { ghost: true, line: false, pip: false, ticks: false, still: false, number: 'reload' },
    full: { ghost: true, line: true, pip: true, ticks: true, still: false, number: 'time' },
  },
  draw(g, ctx, s) {
    const st = K.state(ctx);
    if (!st || st.behind) return;
    const y = K.style(s);
    const a = st.a;
    const c = st.mark;
    const tone = st.blocked ? y.warn : st.loaded && st.onTarget ? y.ready : y.idle;
    const gh = a.ghost;
    const target = st.target;
    if (gh && target && gh.id === target.id) {
      const moving = K.lead(ctx, target) > 1.5 || s.still;
      const pip = K.project(ctx, [gh.c[0], gh.water + gh.top * 0.5, gh.c[2]]);
      if (moving && s.ghost) {
        const sil = K.ghostHull(ctx);
        const soft = st.onTarget ? y.soft : y.idle;
        if (sil) {
          g.polygon(sil, L.withA(soft, soft[3] * 0.1));
          K.stroke(g, y, L.geo.closed(sil), L.withA(soft, soft[3] * 0.6), 1.25);
        }
      }
      if (moving && s.line && pip) {
        const from = K.project(ctx, [target.c[0], target.water + target.top * 0.5, target.c[2]]);
        if (from) K.stroke(g, y, [from, pip], L.withA(y.idle, 0.45), 1);
      }
      if (pip && s.pip) K.diamond(g, y, pip, 5 * y.scale, tone, st.onTarget && st.loaded);
    }
    const R = 64 * y.scale;
    const gap = 7 * y.scale;
    K.strokes(g, y, [[[c[0] - R, c[1]], [c[0] - gap, c[1]]], [[c[0] + gap, c[1]], [c[0] + R, c[1]]]], tone, y.w);
    K.stroke(g, y, [[c[0], c[1] + 4], [c[0], c[1] + 12 * y.scale]], tone, y.w);
    if (s.ticks && st.flight > 0) {
      const dist = Math.max(ctx.cam.distance(a.mark || a.center), 5);
      const knot = ctx.cam.pixelsPerMetre(dist) * KNOT * st.flight;
      const per = [2, 5, 10, 20].find((n) => n * knot >= 9 * y.scale) || 20;
      const step = per * knot;
      if (step >= 4) {
        const ticks = [];
        for (let i = 1; i * step <= R + 0.5; i++) {
          const h = (i % 2 === 0 ? 6 : 3.5) * y.scale;
          for (const sgn of [-1, 1]) {
            const x = c[0] + sgn * i * step;
            ticks.push([[x, c[1] - h], [x, c[1]]]);
          }
        }
        K.strokes(g, y, ticks, L.withA(tone, tone[3] * 0.85), Math.max(1, y.w * 0.75));
      }
    }
    const under = c[1] + 18 * y.scale;
    const fill = st.loaded ? 1 : st.readiness;
    g.line([c[0] - R, under], [c[0] + R, under], L.withA(y.idle, 0.25), 2, true);
    if (fill > 0) {
      const color = st.loaded ? tone : y.idle;
      K.stroke(g, y, [[c[0] - R, under], [c[0] - R + 2 * R * fill, under]], color, 2);
    }
    let text = '';
    if (s.number === 'time' && st.flight > 0) text = L.fmt.seconds(st.flight, 1);
    else if (s.number === 'reload' && !st.loaded) text = L.fmt.seconds(st.left, 1);
    else if (s.number === 'distance') text = L.fmt.distance(st.range);
    if (text) K.text(g, y, [c[0], under + 20], text, y.text, y.idle);
  },
});
})();
