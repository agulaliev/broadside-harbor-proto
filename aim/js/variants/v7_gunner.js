(function () {
'use strict';

// 7. «Канонир» — сплав «Чёрного флага» (AC IV) и прицела World of Tanks. Круг сведения танков, но из правды залпа: все
// ядра лягут внутри; сводят расчёты стволы и стихает качка — круг сжимается; он же — перезарядка (дорастает по часовой).
// Цвет и значок в середине — как пробитие у танков, но по правилам урона игры: продольно ×2 (ромб), в борт (точка),
// наискось (кольцо), скользнёт (крест). К кругу сходится завеса путей ядер из AC IV; у цели светится заряженный борт.
// В «Полном» — уязвимое место (корма или нос, откуда залп войдёт продольно), предел сведения, попадания и множитель.

const L = window.AimLab;
const K = L.kit;

function mult(m) {
  const r = Math.round(m * 100) / 100;
  if (Math.abs(r - Math.round(r)) < 0.05) return '×' + Math.round(r);
  return '×' + L.fmt.dec(r, r < 0.5 ? 2 : 1);
}

function centre(g, y, p, kind, color) {
  const r = 3.2 * y.scale;
  if (kind === 'rake') K.diamond(g, y, p, 4.5 * y.scale, color, true);
  else if (kind === 'full') K.dot(g, y, p, 2 * y.scale, color);
  else if (kind === 'slant') K.ringMark(g, y, p, r, color, 1.25, 2.5);
  else if (kind === 'glance' || kind === 'blocked') {
    K.strokes(g, y, [[[p[0] - r, p[1] - r], [p[0] + r, p[1] + r]], [[p[0] - r, p[1] + r], [p[0] + r, p[1] - r]]], color, 1.5);
  } else K.dot(g, y, p, 1.5 * y.scale, color);
}

L.register({
  id: 'gunner',
  n: 7,
  title: 'Канонир',
  idea: 'AC IV × World of Tanks: круг сведения из правды залпа, цвет по углу попадания, к кругу сходится завеса путей ядер.',
  why: 'Лучшее из двух школ. От «танков» — круг сведения: видно, насколько кучно ляжет залп прямо сейчас, и он сжимается, пока расчёты сводят стволы и стихает качка; цвет — как пробитие, только здесь это угол встречи с бортом по правилам урона игры: войти с кормы или носа вдоль оси — вдвое, бить по касательной вдоль борта — ядра скользнут. От AC IV — завеса путей ядер, сходящаяся в круг, свечение заряженного борта цели и уязвимое место на корме. Всё — правда игры; в «Чистом» — круг, значок, завеса и секунды, подсказки — в «Полном».',
  shows: [
    'Круг — все ядра залпа лягут внутри. Сводят расчёты стволы и стихает качка — круг сжимается; риски внутрь — стволы сведены, палуба ровная: пора.',
    'Круг дорастает по часовой, пока заряжают; число справа — секунды до зарядки.',
    'Цвет и значок в середине — как ядра встретят борт: ромб — продольно, вдвое по корпусу; точка — в борт; кольцо — наискось, урон меньше; крест — скользнут; белый — мимо, красный — не достать.',
    'Завеса путей ядер (AC IV) сходится в круг; у цели светится борт, если его пушки заряжены; у идущей цели — бледный корпус там, где она будет.',
    'В «Полном»: красный ромб на корме или носу — уязвимое место; тонкий круг — до какого круга сожмётся; «5/7» попаданий, множитель урона (×2, ×0,5 — когда не ×1) и дальность.',
  ],
  inspired: [
    { name: 'World of Tanks', url: 'https://worldoftanks.asia/en/content/tank-academy/all-about-reticle-and-bullet-spread/', note: 'круг сведения сжимается, пока стоишь и целишься' },
    { name: 'World of Tanks', url: 'https://modernarmor.worldoftanks.com/cms/guides/game-hud', note: 'цвет прицела — по тому, пробьёт ли выстрел; перезарядка у прицела' },
    { name: 'Assassin’s Creed Black Flag Resynced', url: 'https://www.youtube.com/watch?v=wfdHJKFToq4&t=479s', note: 'белая завеса путей ядер — предпросмотр залпа' },
    { name: 'Assassin’s Creed IV: Black Flag', url: 'https://www.youtube.com/watch?v=HfFiMNAXvbI&t=294s', note: 'уязвимые места — красные ромбы в белой обводке' },
  ],
  game: 'Круг — середины падений пушек вокруг метки плюс эллипс разброса ядра (Gunnery.dispersion, HullSpot), рисуется draw_arc; угол встречи — те же правила, что ShipDamage.rake и apply, на попаданиях HullSpot; завеса — набор треугольников с цветом у вершин; свечение — зарядка чужих из снимка. 2D-слой в Godot — около 0,15 мс на кадр в «Чистом» и 0,17 — в «Полном»: дороже всего — края завесы и дуги круга.',
  settings: [
    { key: 'sheet', title: 'Завеса путей ядер (AC IV)', type: 'select', value: 'tail',
      options: [['none', 'Нет'], ['tail', 'Конец полёта'], ['full', 'Весь полёт']] },
    { key: 'pen', title: 'Цвет по углу попадания', type: 'bool', value: true },
    { key: 'snap', title: 'Риски «пора»', type: 'bool', value: true },
    { key: 'pulse', title: 'Мигать, пока ждёт волну', type: 'bool', value: true },
    { key: 'floor', title: 'До какого круга сожмётся', type: 'bool', value: false },
    { key: 'lead', title: 'Где будет идущая цель', type: 'bool', value: true },
    { key: 'glow', title: 'Борт цели светится, если заряжен', type: 'bool', value: true },
    { key: 'weak', title: 'Уязвимое место: корма или нос', type: 'bool', value: false },
    { key: 'balls', title: 'Летящие ядра', type: 'bool', value: false },
    { key: 'count', title: 'Число', type: 'select', value: 'reload',
      options: [['reload', 'Секунды зарядки'], ['slash', 'И попаданий: 5/7'], ['none', 'Нет']] },
    { key: 'mult', title: 'Множитель урона: ×2, ×0,6', type: 'bool', value: false },
    { key: 'distance', title: 'Дальность', type: 'bool', value: false },
  ],
  presets: {
    clean: { sheet: 'tail', pen: true, snap: true, pulse: true, floor: false, lead: true, glow: true, weak: false, balls: false,
      count: 'reload', mult: false, distance: false },
    full: { sheet: 'full', pen: true, snap: true, pulse: true, floor: true, lead: true, glow: true, weak: true, balls: true,
      count: 'slash', mult: true, distance: true },
  },
  draw(g, ctx, s) {
    const y = K.style(s);
    if (s.balls) K.flying(g, y, ctx);
    const st = K.state(ctx);
    if (!st || st.behind) return;
    const a = st.a;
    const c = st.mark;
    const target = st.target;
    const eff = K.effect(ctx, st);
    let kind = s.pen ? eff.kind : st.hits.hit > 0 ? 'full' : 'none';
    if (st.blocked) kind = 'blocked';
    const tone = st.blocked ? y.warn
      : s.pen ? (kind === 'rake' || kind === 'full' ? y.ready : kind === 'slant' ? y.soft : kind === 'glance' ? y.warn : y.idle)
        : st.hits.share >= 0.6 ? y.ready : st.hits.hit > 0 ? y.soft : y.idle;
    const ac = K.acColors(s, y);
    if (s.glow && target) {
      const side = K.facing(ctx, target);
      if (side && side.ready >= 1) K.glow(g, y, ctx, side.line, ac.fire);
    }
    if (s.lead && target && K.lead(ctx, target) > 3) {
      const sil = K.ghostHull(ctx);
      if (sil) {
        g.polygon(sil, L.withA(y.idle, y.idle[3] * 0.07));
        K.stroke(g, y, L.geo.closed(sil), L.withA(y.idle, y.idle[3] * 0.45), 1);
      }
    }
    if (s.sheet !== 'none') {
      const base = st.loaded ? tone : y.idle;
      const tail = s.sheet === 'tail';
      K.sheet(g, y, ctx, st, { from: tail ? 0.25 : 0.12, fill: tail ? 0.2 : 0.24, edge: tail ? 0.5 : 0.55, land: 0,
        color: L.withA(base, base[3] * (st.loaded ? 1 : 0.7)) });
    }
    const R = L.clamp(K.spread(ctx, st, false), 7 * y.scale, L.H * 0.3);
    let ring = st.loaded ? tone : L.withA(y.idle, y.idle[3] * 0.85);
    if (s.pulse && st.waiting && !st.steady && st.loaded) {
      ring = L.withA(ring, ring[3] * (0.55 + 0.45 * Math.cos(ctx.t * Math.PI * 4)));
    }
    const fill = st.loaded ? 1 : st.readiness;
    const top = -Math.PI / 2;
    const count = Math.round(L.clamp(R * 0.8, 24, 64));
    if (fill < 1) g.arc(c, R, top, top + K.TAU, count, L.withA(y.idle, y.idle[3] * 0.24), Math.max(1, y.w * 0.75), true);
    if (fill > 0) K.arc(g, y, c, R, top, top + K.TAU * fill, ring, y.w, count);
    if (s.floor) {
      const r0 = Math.max(K.spread(ctx, st, true), 4 * y.scale);
      if (R - r0 > 4) g.arc(c, r0, 0, K.TAU, 32, L.withA(tone, tone[3] * 0.4), 1, true);
    }
    if (s.snap && st.loaded && a.converged && st.steady && !st.blocked) {
      const t = 5 * y.scale;
      K.strokes(g, y, [[[c[0], c[1] - R], [c[0], c[1] - R + t]], [[c[0] + R, c[1]], [c[0] + R - t, c[1]]],
        [[c[0], c[1] + R], [c[0], c[1] + R - t]], [[c[0] - R, c[1]], [c[0] - R + t, c[1]]]], ring, y.w);
    }
    centre(g, y, c, kind, tone);
    if (s.weak) {
      const wp = K.weakPoint(ctx, st);
      const p = wp ? K.project(ctx, wp.at) : null;
      if (p) K.weakMark(g, y, p, 6 * y.scale, ac.weak, eff.kind === 'rake');
    }
    const lines = [];
    if (s.count !== 'none') {
      if (!st.loaded) lines.push([L.fmt.seconds(st.left, 1), y.text, y.idle]);
      else if (s.count === 'slash' && st.hits.total) lines.push([st.hits.hit + '/' + st.hits.total, y.big, L.withA(tone, 1)]);
    }
    if (s.mult && eff.hits && !st.blocked && Math.abs(eff.mult - 1) >= 0.05) lines.push([mult(eff.mult), y.small, L.withA(tone, 1)]);
    if (s.distance) lines.push([L.fmt.distance(st.range), y.small, L.withA(y.idle, y.idle[3] * 0.85)]);
    let at = [c[0] + R + 8 * y.scale, c[1] - 4];
    for (const [text, size, col] of lines) {
      K.text(g, y, at, text, size, col, 0);
      at = [at[0], at[1] + size + 2];
    }
  },
});
})();
