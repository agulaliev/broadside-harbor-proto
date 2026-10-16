(function () {
'use strict';

// 2. «Сведение»: одна рамка там, куда ляжет середина залпа; её ширина — разлёт залпа поперёк, высота — разброс по
// высоте борта цели сейчас. Качка раздувает рамку, на ровной палубе она сжимается — тогда и стрелять. Цвет — сколько
// ядер попадёт. Перезарядка — стойки рамки дорастают снизу вверх.

const L = window.AimLab;
const K = L.kit;

function bracket(x, y0, y1, arm) {
  return [[x + arm, y1], [x, y1], [x, y0], [x + arm, y0]];
}

L.register({
  id: 'converge',
  n: 2,
  title: 'Сведение',
  idea: 'Рамка разброса: сжимается, когда палуба ровная, цвет — сколько ядер попадёт.',
  why: 'Как круг сведения в «танках»: видно не только куда, но и насколько кучно ляжет залп прямо сейчас, и когда качка даёт выстрелить.',
  shows: [
    'Рамка — где ляжет середина залпа: ширина — разлёт ядер поперёк, высота — разброс по высоте борта цели.',
    'Качает — рамка раздувается (до двух с половиной раз) и бледнеет; палуба выровнялась — рамка сжимается, по бокам встают риски: стрелять.',
    'Цвет — сколько ядер попадёт: золото — больше половины, светлое — часть, белый — мимо, красный — не достать.',
    'Стойки рамки дорастают снизу вверх, пока заряжают. Пока расчёты ждут ровной палубы, рамка мигает.',
  ],
  inspired: [
    { name: 'World of Tanks', url: 'https://worldoftanks.asia/en/content/tank-academy/all-about-reticle-and-bullet-spread/', note: 'круг сведения сжимается, пока стоишь и целишься' },
    { name: 'World of Tanks', url: 'https://worldoftanks.com/en/news/general-news/some-changes-coming-86-update/', note: 'снаряды ложатся внутри круга сведения' },
    { name: 'World of Warships', url: 'https://wiki.worldofwarships.com/Ship:Gunnery_and_Aiming', note: 'эллипс разброса залпа' },
    { name: 'Naval Action', url: 'https://steamcommunity.com/app/311310/discussions/1/458606877333004075', note: 'разлёт сужается, пока держишь прицел' },
  ],
  game: 'Ширина — пятно залпа на экране, высота — длинная ось эллипса разброса × наклон падения ядра. Рамка — отрезками draw_line, точка — готовой сеткой (draw_mesh): самый дешёвый вариант, 2D-слой в Godot — около 0,02 мс на кадр.',
  settings: [
    { key: 'gauge', title: 'Шкала качки', type: 'bool', value: true },
    { key: 'pulse', title: 'Мигать, пока ждёт волну', type: 'bool', value: true },
    { key: 'center', title: 'Точка середины', type: 'bool', value: true },
    { key: 'number', title: 'Число', type: 'select', value: 'hits',
      options: [['none', 'Нет'], ['hits', 'Попаданий из залпа'], ['reload', 'Перезарядка'], ['distance', 'Дальность']] },
  ],
  presets: {
    clean: { gauge: false, pulse: true, center: true, number: 'reload' },
    full: { gauge: true, pulse: true, center: true, number: 'hits' },
  },
  draw(g, ctx, s) {
    const st = K.state(ctx);
    if (!st || st.behind) return;
    const y = K.style(s);
    const a = st.a;
    const c = st.mark;
    const dist = Math.max(ctx.cam.distance(a.mark || a.center), 5);
    const ppm = ctx.cam.pixelsPerMetre(dist);
    let half = 10 * y.scale;
    const calm = a.spot_steady || a.spot;
    if (calm && calm.length > 2) {
      const b = L.geo.bounds(K.ring(ctx, calm));
      if (b.w > 0) half = L.clamp(b.w * 0.5, half, 180);
    }
    const ells = a.ellipses_steady || a.ellipses || [];
    const ell = ells[Math.floor(ells.length / 2)];
    const long = ell ? ell[4] : 6;
    let tall = L.clamp(long * Math.tan(K.descent(a)) * ppm, 5 * y.scale, 80);
    const swell = st.steady ? 1 : L.clamp(st.sway / st.tolerance, 1, 2.5);
    half *= swell;
    tall *= swell;
    const x0 = c[0] - half;
    const x1 = c[0] + half;
    const y0 = c[1] - tall;
    const y1 = c[1] + tall;
    const arm = Math.min(7 * y.scale, half * 0.5);
    let color = st.blocked ? y.warn : !st.loaded ? y.idle : st.hits.share >= 0.6 ? y.ready : st.hits.hit > 0 ? y.soft : y.idle;
    if (swell > 1) color = L.withA(color, color[3] * (0.45 + 0.55 / swell));
    if (s.pulse && st.waiting && !st.steady && st.loaded) {
      color = L.withA(color, color[3] * (0.55 + 0.45 * Math.cos(ctx.t * Math.PI * 4)));
    }
    const left = bracket(x0, y0, y1, arm);
    const right = bracket(x1, y0, y1, -arm);
    const fill = st.loaded ? 1 : st.readiness;
    if (fill < 1) {
      const faint = L.withA(y.idle, y.idle[3] * 0.3);
      K.square(g, y, [left, right], faint, y.w * 0.8);
    }
    K.square(g, y, [K.part(left, 0, fill), K.part(right, 0, fill)], color, y.w);
    if (st.loaded && st.steady) {
      const tick = 4 * y.scale;
      K.strokes(g, y, [[[x0, c[1]], [x0 + tick, c[1]]], [[x1, c[1]], [x1 - tick, c[1]]]], color, y.w);
    }
    if (s.center) K.dot(g, y, c, 1.6 * y.scale, color);
    let right_edge = x1 + 10;
    if (s.gauge) {
      const gx = x1 + 12 * y.scale;
      const gh = 34 * y.scale;
      const top = c[1] - gh * 0.5;
      const bottom = c[1] + gh * 0.5;
      const span = 10;
      const at = (v) => bottom - (L.clamp(v, 0, span) / span) * gh;
      g.line([gx, top], [gx, bottom], L.withA(y.idle, 0.28), 2, true);
      g.line([gx, at(0)], [gx, at(st.tolerance)], L.withA(y.ready, 0.75), 2, true);
      const m = at(st.sway);
      K.stroke(g, y, [[gx - 4, m], [gx + 4, m]], st.steady ? y.ready : y.idle, 2);
      right_edge = gx + 10;
    }
    let text = '';
    let tone = y.idle;
    if (s.number === 'hits' && st.loaded && st.hits.total) {
      text = st.hits.hit + '/' + st.hits.total;
      tone = color;
    } else if ((s.number === 'hits' || s.number === 'reload') && !st.loaded) {
      text = L.fmt.seconds(st.left, 1);
    } else if (s.number === 'distance') {
      text = L.fmt.distance(st.range);
    }
    if (text) K.text(g, y, [right_edge, c[1] + 6], text, y.text, L.withA(tone, 1), 0);
  },
});
})();
