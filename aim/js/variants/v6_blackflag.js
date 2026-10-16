(function () {
'use strict';

// 6. «Чёрный флаг» — прицел бортом Assassin's Creed IV Black Flag как есть: белая полупрозрачная завеса путей ядер от
// борта до места падения; пока расчёты сводят стволы, завеса сужается. У цели светится борт, если его пушки заряжены;
// в «Полном» — уязвимое место (ромб на корме или носу: отсюда залп войдёт продольно), летящие ядра и число попаданий.

const L = window.AimLab;
const K = L.kit;

L.register({
  id: 'blackflag',
  n: 6,
  title: 'Чёрный флаг',
  idea: 'Прицел бортом из AC IV Black Flag: белая завеса путей ядер, она сужается, пока расчёты сводят стволы.',
  why: 'Копия того, за что любят морской бой AC IV: залп виден целиком, как белая завеса от борта до цели, а не точкой. Держишь прицел — расчёты сводят стволы, и завеса стягивается к цели: сведение стволов в игре настоящее, пути ядер — её же. Свечение заряженного борта цели и уязвимое место — тоже из AC IV, но по правилам игры: зарядка чужих приходит в снимке, продольный огонь бьёт корпус вдвое.',
  shows: [
    'Белая завеса — пути ядер всех пушек борта до воды или борта цели; низ завесы — линия падения. Пока заряжают — бледнее.',
    'Расчёты сводят стволы — завеса сужается к точке наводки; залп сразу, без сведения, ложится веером.',
    'Оранжевая линия по борту цели — его пушки заряжены и смотрят на нас (у AC IV пушки врага светятся перед залпом).',
    'В «Полном»: красный ромб на корме или носу цели — оттуда залп войдёт продольно (вдвое по корпусу, сбивает пушки); залит — войдёт сейчас.',
    'Число у метки — секунды до зарядки; в «Полном», когда заряжено, — сколько ядер попадёт.',
  ],
  inspired: [
    { name: 'Assassin’s Creed IV: Black Flag', url: 'https://www.gamerguides.com/assassins-creed-iv-black-flag/guide/main-walkthrough/sequence-02/memory-06-the-treasure-fleet', note: 'левый курок — белый указатель: куда и под каким углом пойдут ядра; выше или ниже — по дальности' },
    { name: 'Assassin’s Creed Black Flag Resynced', url: 'https://www.youtube.com/watch?v=wfdHJKFToq4&t=479s', note: 'предпросмотр выстрела — белая полупрозрачная завеса с яркой кромкой до воды' },
    { name: 'Assassin’s Creed Black Flag Resynced', url: 'https://www.ubisoft.com/en-gb/game/assassins-creed/news/6HoFbBC1ib71obvtWVxMyS/assassins-creed-black-flag-resynced-deep-dive-into-hud-customization', note: '«Aiming Arc» — своя ручка интерфейса, остаётся и в «Минимальном»' },
    { name: 'Assassin’s Creed IV: Black Flag', url: 'https://www.youtube.com/watch?v=HfFiMNAXvbI&t=294s', note: 'уязвимые места — красные ромбы в белой обводке' },
  ],
  game: 'Завеса — пути ядер, которые игра уже считает (с нынешним сведением стволов), одним набором треугольников с цветом у вершин (canvas_item_add_triangle_array); края — draw_polyline_colors, линия падения — отрезками draw_line; за целью завеса вырезана её силуэтом. Свечение борта — зарядка чужих из снимка (put_brief). 2D-слой в Godot — около 0,11 мс на кадр: дороже всего — края завесы, ломаные с цветом у точек.',
  settings: [
    { key: 'from', title: 'Начало завесы (доля полёта)', type: 'range', min: 0, max: 0.6, step: 0.05, value: 0.3 },
    { key: 'fill', title: 'Плотность завесы', type: 'range', min: 0, max: 0.5, step: 0.02, value: 0.3 },
    { key: 'edges', title: 'Края завесы', type: 'bool', value: true },
    { key: 'land', title: 'Линия падения', type: 'bool', value: true },
    { key: 'glow', title: 'Борт цели светится, если заряжен', type: 'bool', value: true },
    { key: 'weak', title: 'Уязвимое место: корма или нос', type: 'bool', value: false },
    { key: 'balls', title: 'Летящие ядра', type: 'bool', value: false },
    { key: 'number', title: 'Число', type: 'select', value: 'reload',
      options: [['none', 'Нет'], ['reload', 'Перезарядка'], ['hits', 'Попаданий из залпа']] },
  ],
  presets: {
    clean: { from: 0.3, fill: 0.3, edges: true, land: true, glow: true, weak: false, balls: false, number: 'reload' },
    full: { from: 0.1, fill: 0.34, edges: true, land: true, glow: true, weak: true, balls: true, number: 'hits' },
  },
  draw(g, ctx, s) {
    const y = K.style(s);
    if (s.balls) K.flying(g, y, ctx);
    const st = K.state(ctx);
    if (!st || st.behind) return;
    const target = st.target;
    const ac = K.acColors(s, y);
    if (s.glow && target) {
      const side = K.facing(ctx, target);
      if (side && side.ready >= 1) K.glow(g, y, ctx, side.line, ac.fire);
    }
    const base = st.blocked ? y.warn : y.idle;
    const color = st.loaded ? base : L.withA(base, base[3] * 0.6);
    K.sheet(g, y, ctx, st, { from: s.from, fill: s.fill, edge: s.edges ? 0.6 : 0, land: s.land ? 0.9 : 0, color });
    if (s.weak) {
      const wp = K.weakPoint(ctx, st);
      const p = wp ? K.project(ctx, wp.at) : null;
      if (p) K.weakMark(g, y, p, 6 * y.scale, ac.weak, K.effect(ctx, st).kind === 'rake');
    }
    let text = '';
    if (!st.loaded && s.number !== 'none') text = L.fmt.seconds(st.left, 1);
    else if (s.number === 'hits' && st.hits.total) text = st.hits.hit + '/' + st.hits.total;
    if (text) K.text(g, y, [st.mark[0] + 16 * y.scale, st.mark[1] - 10 * y.scale], text, y.text, y.idle, 0);
  },
});
})();
