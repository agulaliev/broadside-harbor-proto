(function () {
'use strict';

// ★ «Флагман» — гибрид: цель в уголках с полосой на борту (5), уголки дышат с качкой (2), призрак идущей цели (3), пятно
// на воде бледной обводкой — недолёт и перелёт (1), летящие ядра (4). В «Чистом» — только правда (принцип владельца:
// игрок учится стрелять сам, картинка не врёт) и одно число — секунды зарядки; подсказки (число попаданий, ромб,
// стрелка) — в «Полном».

const L = window.AimLab;
const K = L.kit;

L.register({
  id: 'hybrid',
  n: '★',
  title: 'Флагман',
  idea: 'Гибрид лучшего: цель в уголках и полоса на борту; качка, упреждение и пятно на воде — тихо и только когда нужны.',
  why: 'Решение «стрелять или нет» принимается по цели — уголки и полоса на борту (из «Мишени»). Качка видна тем, что уголки отходят и бледнеют (из «Сведения»), у идущей цели — бледный корпус там, где она будет (из «Упреждения»), бледное пятно на воде показывает недолёт и перелёт (из «Пятна»). В «Чистом» — только то, что правда, и одно число; подсказки — в «Полном». Ни пунктира, ни лишних надписей.',
  shows: [
    'Уголки вокруг цели — захват. Дорастают, пока заряжают; качает — отходят от корпуса и бледнеют, палуба ровная — плотно обнимают цель.',
    'Полоса на борту — что накроет залп. Число у уголков — секунды до зарядки; в «Полном» — ещё сколько ядер попадёт.',
    'Бледная обводка на воде — где упадут ядра: видно, недолёт или перелёт. За корпусами её не видно.',
    'У идущей цели — бледный корпус там, где она будет, когда долетят ядра; в «Полном» — и ромб в его середине.',
    'Цвет: золото — заряжено и больше половины ядер в цель, светлое золото — часть, белый — мимо или заряжают, красный — не достать или цель вне сектора.',
  ],
  inspired: [
    { name: 'World of Tanks', url: 'https://worldoftanks.asia/en/content/tank-academy/all-about-reticle-and-bullet-spread/', note: 'круг сведения сжимается, пока стоишь и целишься' },
    { name: 'World of Tanks', url: 'https://modernarmor.worldoftanks.com/cms/guides/game-hud', note: 'цвет прицела — по тому, пробьёт ли выстрел' },
    { name: 'World of Warships', url: 'https://wiki.worldofwarships.com/Ship:Gunnery_and_Aiming', note: 'эллипс разброса залпа, время полёта под прицелом' },
    { name: 'Assassin’s Creed IV: Black Flag Resynced', url: 'https://www.ubisoft.com/en-gb/game/assassins-creed/news/6HoFbBC1ib71obvtWVxMyS/assassins-creed-black-flag-resynced-deep-dive-into-hud-customization', note: 'наборы интерфейса; дуги залпа остаются даже в «Минимальном»' },
  ],
  game: 'Собирается из тех же частей, что пять вариантов: прямоугольник силуэта цели, HullSpot по попаданиям, пятно залпа на ровной палубе, призрак цели. Один слой CanvasItem поверх интерфейса; 2D-слой в Godot — около 0,16 мс на кадр в «Чистом» и 0,25 — в «Полном» (дороже всего — пятно, вырезанное за корпусами).',
  settings: [
    { key: 'spot', title: 'Пятно на воде', type: 'select', value: 'line',
      options: [['none', 'Нет'], ['line', 'Обводка'], ['fill', 'Обводка и заливка']] },
    { key: 'cover', title: 'Полоса на борту', type: 'bool', value: true },
    { key: 'breath', title: 'Уголки дышат с качкой', type: 'bool', value: true },
    { key: 'lead', title: 'Упреждение у идущей цели', type: 'select', value: 'ghost',
      options: [['none', 'Нет'], ['ghost', 'Где будет цель'], ['pip', 'Где будет цель и ромб']] },
    { key: 'hint', title: 'Стрелка при промахе', type: 'bool', value: false },
    { key: 'balls', title: 'Летящие ядра', type: 'bool', value: false },
    { key: 'count', title: 'Число', type: 'select', value: 'reload',
      options: [['reload', 'Секунды зарядки'], ['hits', 'И попаданий: 5'], ['slash', 'И попаданий из залпа: 5/7'], ['none', 'Нет']] },
    { key: 'distance', title: 'Дальность', type: 'bool', value: false },
  ],
  presets: {
    clean: { spot: 'line', cover: true, breath: true, lead: 'ghost', hint: false, balls: false, count: 'reload', distance: false },
    full: { spot: 'fill', cover: true, breath: true, lead: 'pip', hint: true, balls: true, count: 'slash', distance: true },
  },
  draw(g, ctx, s) {
    const y = K.style(s);
    if (s.balls) K.flying(g, y, ctx);
    const st = K.state(ctx);
    if (!st || st.behind) return;
    const a = st.a;
    const share = st.hits.share;
    const tone = st.blocked ? y.warn : share >= 0.6 ? y.ready : st.hits.hit > 0 ? y.soft : y.idle;
    const swell = s.breath && !st.steady ? L.clamp(st.sway / st.tolerance, 1, 2) : 1;
    const color = L.withA(tone, tone[3] * (st.loaded ? 1 : 0.85) * (0.55 + 0.45 / swell));
    const target = st.target;
    const depth = a.center ? ctx.cam.distance(a.center) : st.distance;
    const covers = K.covers(ctx, depth + 5, -1);
    if (s.spot !== 'none') {
      const calm = K.ring(ctx, a.spot_steady || a.spot || []);
      if (calm.length > 2) {
        const water = st.blocked ? y.warn : st.loaded && st.onTarget ? y.ready : y.idle;
        if (s.spot === 'fill') K.fill(g, calm, covers, L.withA(water, water[3] * 0.12));
        K.strokes(g, y, K.linesMinusAll(L.geo.closed(calm), covers), L.withA(water, water[3] * 0.5), 1.25);
      }
    }
    if (s.lead !== 'none' && target && K.lead(ctx, target) > 3) {
      const gh = a.ghost;
      const sil = K.ghostHull(ctx);
      if (sil) {
        g.polygon(sil, L.withA(y.idle, y.idle[3] * 0.07));
        K.stroke(g, y, L.geo.closed(sil), L.withA(y.idle, y.idle[3] * 0.45), 1);
      }
      const pip = K.project(ctx, [gh.c[0], gh.water + gh.top * 0.5, gh.c[2]]);
      if (pip && s.lead === 'pip') K.diamond(g, y, pip, 4.5 * y.scale, color, st.loaded && st.onTarget);
    }
    if (s.cover && st.onTarget) {
      const band = K.band(ctx, target);
      if (band) {
        K.fillBand(g, band, L.withA(tone, tone[3] * (st.loaded ? 0.36 : 0.2)));
        K.stroke(g, y, L.geo.closed(band), color, 1.25);
      }
    }
    let box = null;
    const hull = target ? K.hull(ctx, target) : null;
    if (hull) {
      const b = L.geo.bounds(hull);
      const pad = (6 + (swell - 1) * 12) * y.scale;
      box = { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
      if (!K.onScreen(box)) box = null;
    }
    if (box) {
      const arm = Math.max(5, Math.min(14 * y.scale, box.w * 0.25, box.h * 0.45));
      if (!st.loaded) K.corners(g, y, box, arm, L.withA(y.idle, 0.3), y.w * 0.8, 1);
      K.corners(g, y, box, arm, color, y.w, st.loaded ? 1 : st.readiness);
    }
    K.dot(g, y, st.mark, 1.75 * y.scale, color);
    const hint = s.hint ? K.hint(ctx, st) : null;
    if (hint) {
      const at = [st.mark[0] + hint.dir[0] * 16 * y.scale, st.mark[1] + hint.dir[1] * 16 * y.scale];
      K.chevron(g, y, at, hint.dir, 6 * y.scale, st.blocked ? y.warn : y.idle);
    }
    const lines = [];
    if (s.count !== 'none') {
      if (!st.loaded) lines.push([L.fmt.seconds(st.left, 1), y.text, y.idle]);
      else if (st.hits.total && box && s.count !== 'reload') {
        lines.push([s.count === 'slash' ? st.hits.hit + '/' + st.hits.total : String(st.hits.hit), y.big, L.withA(tone, 1)]);
      }
    }
    if (s.distance) lines.push([L.fmt.distance(st.range), y.small, L.withA(y.idle, y.idle[3] * 0.85)]);
    let at = box ? [box.x + box.w + 6, box.y + 4] : [st.mark[0] + 12 * y.scale, st.mark[1] - 4];
    for (const [text, size, col] of lines) {
      K.text(g, y, at, text, size, col, 0);
      at = [at[0], at[1] + size + 2];
    }
  },
});
})();
