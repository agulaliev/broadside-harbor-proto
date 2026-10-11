import { CATALOG, STAT_MAX, shipInfo } from './ships.js';

export const FLAGS = ['#BF140F', '#1F45A8', '#D9B21A', '#1A1A1A', '#EDE6D1', '#1E6B3A', '#6B2A8C', '#D9661A'];

export const MODES = [
  { id: 'alone', label: 'Одному' },
  { id: 'friends', label: 'С друзьями' },
  { id: 'range', label: 'Полигон' },
];

export const FRIENDS = [
  { name: 'Мурат', ship: 'brig', flag: '#1F45A8' },
  { name: 'Ренат', ship: 'frigate', flag: '#D9B21A' },
  { name: 'Тимур', ship: 'sloop', flag: '#1E6B3A' },
];

export const BOATSWAIN = [
  'Ветер с запада, капитан. Самое время.',
  'Пушки вычищены, порох сухой.',
  'Ребята в таверне спрашивают, когда выходим.',
  'Купцы видели паруса у Чёрных скал.',
  'Трюм пуст — добычи ждём.',
];

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}

const SVG = 'http://www.w3.org/2000/svg';

export function pennantSvg(color) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 30 18');
  s.setAttribute('class', 'pennant');
  s.setAttribute('aria-hidden', 'true');
  const pole = document.createElementNS(SVG, 'rect');
  pole.setAttribute('x', '0'); pole.setAttribute('y', '0'); pole.setAttribute('width', '1.6'); pole.setAttribute('height', '18');
  pole.setAttribute('fill', '#B98A3E');
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', 'M1.6 1 L29 6.5 L1.6 12 Z');
  p.setAttribute('fill', color);
  s.append(pole, p);
  s.setColor = (c) => p.setAttribute('fill', c);
  return s;
}

const ICONS = {
  settings: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.3 4.7-1.7 1 .1 2-1.9 1.9-2-.1-1 1.7h-2.6l-1-1.7-2 .1-1.9-1.9.1-2-1.7-1v-2.6l1.7-1-.1-2 1.9-1.9 2 .1 1-1.7h2.6l1 1.7 2-.1 1.9 1.9-.1 2 1.7 1Z',
  log: 'M6 3h10l3 3v15H6zM9 9h7M9 13h7M9 17h4',
  exit: 'M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10',
  people: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5 8c.5-3 2.6-5 5-5s4.5 2 5 5M16 11a2.5 2.5 0 1 0 0-5M17 14c1.8.4 3.2 2.2 3.5 5',
};

export function icon(name) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', ICONS[name]);
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '1.5');
  p.setAttribute('stroke-linejoin', 'round');
  p.setAttribute('stroke-linecap', 'round');
  s.append(p);
  return s;
}

export function iconButton(app, name, tip, onclick) {
  return h('button', { type: 'button', class: 'icon-btn tip', 'data-tip': tip, 'aria-label': tip, onmouseenter: () => app.audio.tick('hover'), onclick: () => { app.audio.tick('press'); onclick?.(); } }, icon(name));
}

const STAT_ROWS = [
  { key: 'speed', label: 'Ход', unit: 'уз', fmt: (v) => v.toFixed(1) },
  { key: 'turn', label: 'Поворот', unit: 'с', fmt: (v) => String(Math.round(v)), invert: true },
  { key: 'salvo', label: 'Залп', unit: 'фн', fmt: (v) => String(Math.round(v)) },
  { key: 'hullHp', label: 'Корпус', unit: '', fmt: (v) => String(Math.round(v)) },
  { key: 'range', label: 'Дальность', unit: 'м', fmt: (v) => String(Math.round(v)) },
];

export function statBlock() {
  const rows = STAT_ROWS.map((r) => {
    const bar = h('i');
    const val = h('span', { class: 's-val' });
    const row = h('div', { class: 'stat' }, h('span', { class: 's-label', text: r.label }), h('span', { class: 's-bar' }, bar), val);
    return { r, bar, val, row };
  });
  const el = h('div', { class: 'va-stats' }, rows.map((x) => x.row));
  el.set = (id) => {
    const info = shipInfo(id);
    for (const { r, bar, val } of rows) {
      const v = info.stats[r.key];
      const k = r.invert ? 1 - (v - 8) / (STAT_MAX[r.key] - 8) : v / STAT_MAX[r.key];
      bar.style.width = `${Math.round(Math.min(Math.max(k, 0.06), 1) * 100)}%`;
      val.replaceChildren(r.fmt(v), r.unit ? h('small', { text: r.unit }) : '');
    }
  };
  return el;
}

export function fleetCard(app, id, onpick) {
  const info = shipInfo(id);
  const img = h('img', { alt: '' });
  const thumb = h('div', { class: 'thumb' }, img);
  const setThumb = () => {
    const url = app.thumbs.get(id);
    if (url) { img.src = url; thumb.classList.remove('loading'); } else thumb.classList.add('loading');
  };
  setThumb();
  const card = h('button', {
    type: 'button', class: 'fleet-card', 'aria-pressed': String(app.state.shipId === id), 'aria-label': `${info.name}, ${info.role}`,
    onmouseenter: () => app.audio.tick('hover'),
    onclick: () => { app.audio.tick('press'); onpick(id); },
  }, thumb, h('div', { class: 'meta' }, h('span', { class: 'name', text: info.short || info.name }), h('span', { class: 'role', text: info.role })));
  card.dataset.id = id;
  card.refreshThumb = setThumb;
  return card;
}

export function fleetCards(app, container, onpick) {
  const cards = CATALOG.map((c) => fleetCard(app, c.id, onpick));
  container.append(...cards);
  const off = app.on((ev, data) => {
    if (ev === 'thumb') cards.find((c) => c.dataset.id === data)?.refreshThumb();
    if (ev === 'hero') cards.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.id === data.id)));
  });
  return { cards, off };
}

export function captainButton(app, parent) {
  const pen = pennantSvg(app.state.captain.flag);
  const name = h('div', { class: 'c-name', text: app.state.captain.name || 'Капитан' });
  const btn = h('button', { type: 'button', class: 'va-captain', 'aria-haspopup': 'dialog', onmouseenter: () => app.audio.tick('hover') },
    pen, h('div', {}, name, h('div', { class: 'c-sub', text: 'капитан' })));
  const input = h('input', { type: 'text', maxlength: '24', value: app.state.captain.name, 'aria-label': 'Имя капитана' });
  const sw = FLAGS.map((c) => h('button', { type: 'button', 'aria-label': `Вымпел ${c}`, style: `background:${c}`, 'aria-pressed': String(c === app.state.captain.flag) }));
  const pop = h('div', { class: 'popover', role: 'dialog', 'aria-label': 'Капитан', hidden: true },
    h('label', { text: 'Имя капитана' }), input, h('label', { text: 'Вымпел' }), h('div', { class: 'swatches' }, sw));
  input.addEventListener('input', () => {
    app.state.captain.name = input.value.trim() || 'Капитан';
    name.textContent = app.state.captain.name;
    app.save();
    app.emit('captain');
  });
  sw.forEach((b, i) => b.addEventListener('click', () => {
    app.audio.tick('press');
    const c = FLAGS[i];
    app.state.captain.flag = c;
    sw.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    pen.setColor(c);
    app.hero?.setFlagColor(c);
    app.save();
    app.emit('captain');
  }));
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    app.audio.tick('press');
    const r = btn.getBoundingClientRect();
    const ui = document.getElementById('ui').getBoundingClientRect();
    pop.style.left = `${r.left - ui.left}px`;
    pop.style.top = `${r.bottom - ui.top + 8}px`;
    pop.hidden = !pop.hidden;
    if (!pop.hidden) input.focus();
  });
  const close = (e) => { if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) pop.hidden = true; };
  document.addEventListener('pointerdown', close);
  parent.append(pop);
  btn.dispose = () => document.removeEventListener('pointerdown', close);
  const off = app.on((ev) => { if (ev === 'captain') { name.textContent = app.state.captain.name; pen.setColor(app.state.captain.flag); } });
  const oldDispose = btn.dispose;
  btn.dispose = () => { oldDispose(); off(); };
  return btn;
}

export function modeSwitch(app, onchange) {
  const wrap = h('div', { class: 'va-modes', role: 'group', 'aria-label': 'Режим' });
  const btns = MODES.map((m) => h('button', {
    type: 'button', 'aria-pressed': String(app.state.mode === m.id),
    onmouseenter: () => app.audio.tick('hover'),
    onclick: () => {
      app.audio.tick('press');
      app.state.mode = m.id;
      btns.forEach((b, i) => b.setAttribute('aria-pressed', String(MODES[i].id === m.id)));
      onchange?.(m.id);
    },
  }, m.label));
  wrap.append(...btns);
  return wrap;
}

export function ctaButton(app, label, onclick) {
  return h('button', { type: 'button', class: 'cta', onmouseenter: () => app.audio.tick('hover'), onclick: () => { app.audio.tick('press'); onclick(); } }, label);
}

export function heroName(id) {
  const i = shipInfo(id);
  return i.name;
}
