(function () {
'use strict';

// 5. «Мишень»: ничего на воде — только цель. Уголки вокруг неё и на борту подсвечено то, что накроет залп; в «Полном» —
// ещё число попаданий и при промахе стрелка, куда довести прицел. Перезарядка — уголки дорастают.

const L = window.AimLab;
const K = L.kit;

L.register({
  id: 'target',
  n: 5,
  title: 'Мишень',
  idea: 'Только цель: уголки и подсвеченный борт — что накроет залп; в «Полном» — число попаданий и стрелка «куда довести».',
  why: 'Меньше всего лишнего на экране: решение «стрелять или нет» принимается по цели — полоса на борту показывает, что накроет залп. В «Полном» — сколько ядер попадёт и стрелка, куда довести при промахе.',
  shows: [
    'Уголки вокруг цели — захват; дорастают, пока заряжают.',
    'Полоса на борту — что накроет залп. Число у уголков — секунды до зарядки; в «Полном» — сколько ядер попадёт.',
    'Мимо — в «Полном» стрелка от метки, куда довести прицел: выше, ниже или вбок; красная — цель вне сектора пушек, нужно довернуть корабль.',
    'Точка — середина залпа. На воде не рисуется ничего.',
  ],
  inspired: [
    { name: 'World of Tanks', url: 'https://modernarmor.worldoftanks.com/cms/guides/game-hud', note: 'цвет прицела — по тому, пробьёт ли выстрел' },
    { name: 'Skull and Bones', url: 'https://www.ubisoft.com/en-us/game/skull-and-bones/news-updates/1GVGIA7jDPyT3tnch9aYKo/devblog-strategizing-your-attack', note: 'уязвимые места подсвечены на корпусе цели' },
    { name: 'Sea of Thieves', url: 'https://seaofthieves.wiki.gg/wiki/Cannon', note: 'на экране ничего лишнего, наводка на глаз' },
    { name: 'Blackwake', url: 'https://steamcommunity.com/app/420290/discussions/0/3103515084632361015', note: 'прицела нет вовсе: борт наводят кораблём' },
  ],
  game: 'Рамка — прямоугольник силуэта цели на экране (уголки — отрезками draw_line), полоса — HullSpot по попаданиям залпа (набор треугольников). Самый тихий вариант: на воде ничего, только цель. 2D-слой в Godot — около 0,05 мс на кадр.',
  settings: [
    { key: 'cover', title: 'Подсветка борта', type: 'bool', value: true },
    { key: 'hint', title: 'Стрелка при промахе', type: 'bool', value: true },
    { key: 'hint_m', title: 'Метры у стрелки', type: 'bool', value: false },
    { key: 'dot', title: 'Точка прицела', type: 'bool', value: true },
    { key: 'count', title: 'Число', type: 'select', value: 'slash',
      options: [['reload', 'Секунды зарядки'], ['slash', 'И попаданий: 5/7'], ['of', 'И попаданий: 5 из 7'], ['hits', 'И попаданий: 5'], ['none', 'Нет']] },
  ],
  presets: {
    clean: { cover: true, hint: false, hint_m: false, dot: true, count: 'reload' },
    full: { cover: true, hint: true, hint_m: true, dot: true, count: 'slash' },
  },
  draw(g, ctx, s) {
    const st = K.state(ctx);
    if (!st || st.behind) return;
    const y = K.style(s);
    const a = st.a;
    const share = st.hits.share;
    const tone = st.blocked ? y.warn : share >= 0.6 ? y.ready : st.hits.hit > 0 ? y.soft : y.idle;
    const color = st.loaded ? tone : L.withA(tone, tone[3] * 0.8);
    const target = st.target;
    const hull = target ? K.hull(ctx, target) : null;
    let box = null;
    if (hull) {
      const b = L.geo.bounds(hull);
      const pad = 6 * y.scale;
      box = { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
      if (!K.onScreen(box)) box = null;
    }
    if (box) {
      const arm = Math.max(5, Math.min(14 * y.scale, box.w * 0.25, box.h * 0.45));
      if (!st.loaded) K.corners(g, y, box, arm, L.withA(y.idle, 0.3), y.w * 0.8, 1);
      K.corners(g, y, box, arm, color, y.w, st.loaded ? 1 : st.readiness);
    }
    if (s.cover && st.onTarget) {
      const band = K.band(ctx, target);
      if (band) {
        K.fillBand(g, band, L.withA(tone, tone[3] * (st.loaded ? 0.38 : 0.2)));
        K.stroke(g, y, L.geo.closed(band), color, 1.25);
      }
    }
    if (s.dot) K.dot(g, y, st.mark, 1.75 * y.scale, color);
    const hint = s.hint ? K.hint(ctx, st) : null;
    if (hint) {
      const dir = hint.dir;
      const at = [st.mark[0] + dir[0] * 16 * y.scale, st.mark[1] + dir[1] * 16 * y.scale];
      K.chevron(g, y, at, dir, 6 * y.scale, st.blocked ? y.warn : y.idle);
      if (s.hint_m && hint.metres >= 1) {
        const text = (dir[1] < 0 ? '+' : dir[1] > 0 ? '−' : '') + Math.round(hint.metres) + ' м';
        const tx = dir[0] ? at[0] + dir[0] * 12 : at[0];
        const ty = dir[1] ? at[1] + dir[1] * 12 + (dir[1] > 0 ? 12 : 0) : at[1] + 5;
        K.text(g, y, [tx, ty], text, y.small, y.idle, dir[0] < 0 ? 1 : dir[0] > 0 ? 0 : 0.5);
      }
    }
    if (box && s.count !== 'none') {
      let text = '';
      let tcol = color;
      if (!st.loaded) {
        text = L.fmt.seconds(st.left, 1);
        tcol = y.idle;
      } else if (st.hits.total && s.count !== 'reload') {
        const h = st.hits.hit;
        text = s.count === 'of' ? h + ' из ' + st.hits.total : s.count === 'hits' ? String(h) : h + '/' + st.hits.total;
      }
      K.text(g, y, [box.x + box.w + 6, box.y + 4], text, st.loaded ? y.big : y.text, L.withA(tcol, 1), 0);
    }
  },
});
})();
