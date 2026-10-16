(function () {
'use strict';

// Страница: сцены (видео кадров игры без прицела + данные прицела на каждый кадр), варианты поверх, настройки,
// сравнение двух, сверка 1:1 нынешнего прицела и код настроек в ссылке.

const L = window.AimLab;
const K = L.kit;
const $ = (s, root = document) => root.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const kid of kids) if (kid !== null && kid !== undefined) e.append(kid);
  return e;
};

const SCENES = [
  { id: 'brig150', chip: '150 м' },
  { id: 'brig60', chip: '60 м, двойные' },
  { id: 'snap', chip: 'Залп сразу' },
  { id: 'brig300', chip: '300 м' },
  { id: 'roll', chip: 'Качка' },
  { id: 'moving', chip: 'Цель на ходу' },
  { id: 'line', chip: 'Линейный' },
  { id: 'chase', chip: 'Погонные' },
  { id: 'edge', chip: 'Вне сектора' },
  { id: 'battle', chip: 'Бой 7 на 7' },
  { id: 'stern', chip: 'Кормой к нам' },
  { id: 'angle', chip: 'Под углом' },
];
const SPECIAL = {
  now: { id: 'now', n: 0, title: 'Как сейчас', idea: 'Нынешний прицел игры — кадры, снятые самой игрой.' },
  none: { id: 'none', n: '·', title: 'Без прицела', idea: 'Тот же кадр без прицела — фон, поверх которого рисуются варианты.' },
};

const app = {
  scene: null,
  sceneId: 'brig150',
  k: 0,
  playing: false,
  rate: 1,
  bg: 'b',
  compare: false,
  panes: ['now', 'hybrid'],
  focus: 1,
  pixel: false,
  settings: {},
  preset: {},
  glyphs: null,
  atlas: null,
  scenes: {},
  videos: {},
  stages: [],
  token: 0,
};

function variantList() {
  const order = (v) => (v.n === '★' ? 99 : v.n);
  return [SPECIAL.now, ...L.variants.slice().sort((a, b) => order(a) - order(b)), SPECIAL.none];
}

function variantOf(id) {
  return L.variantById[id] || SPECIAL[id] || null;
}

function shown() {
  return app.compare ? app.panes.slice() : [app.panes[app.focus]];
}

function defaults(v) {
  const s = {};
  for (const d of K.COMMON.concat(v.settings || [])) s[d.key] = d.value;
  return s;
}

function settingsFor(id) {
  const v = L.variantById[id];
  if (!v) return {};
  if (!app.settings[id]) applyPreset(id, 'clean');
  return app.settings[id];
}

function applyPreset(id, name) {
  const v = L.variantById[id];
  if (!v) return;
  app.settings[id] = Object.assign(defaults(v), (v.presets && v.presets[name]) || {});
  app.preset[id] = name;
}

function digits(step) {
  return (String(step).split('.')[1] || '').length;
}

// --- Видео сцены: b — без прицела, c — без прицела и интерфейса, a — с нынешним прицелом.
function video(kind) {
  const key = app.sceneId + ':' + kind;
  if (!app.videos[key]) {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.loop = true;
    v.preload = 'auto';
    v.setAttribute('playsinline', '');
    v.setAttribute('muted', '');
    v.src = 'scenes/' + app.sceneId + '/' + kind + '.mp4';
    v.playbackRate = app.rate;
    $('#videos').append(v);
    app.videos[key] = v;
  }
  return app.videos[key];
}

function kinds() {
  const list = [app.bg];
  if (shown().includes('now')) list.push('a');
  return list;
}

function waitEvent(target, name) {
  return new Promise((resolve) => target.addEventListener(name, resolve, { once: true }));
}

async function seekAll(k) {
  const token = ++app.token;
  const t = (k + 0.5) / L.FPS;
  await Promise.all(kinds().map(video).map(async (v) => {
    if (v.readyState < 1) await waitEvent(v, 'loadedmetadata');
    if (Math.abs(v.currentTime - t) > 0.25 / L.FPS || v.seeking || v.readyState < 2) {
      const done = waitEvent(v, 'seeked');
      v.currentTime = t;
      await done;
    }
  }));
  if (token === app.token) draw();
}

function frameOf(v) {
  return L.clamp(Math.round(v.currentTime * L.FPS - 0.5), 0, app.scene.count - 1);
}

function startPlaying() {
  if (app.playing || !app.scene) return;
  app.playing = true;
  app.token++;
  $('#play').textContent = '❚❚';
  const vids = kinds().map(video);
  const master = vids[0];
  for (const v of vids) {
    v.playbackRate = app.rate;
    if (v !== master) v.currentTime = master.currentTime;
    const p = v.play();
    if (p && p.catch) p.catch(() => {});
  }
  const session = app.token;
  const tick = (now, meta) => {
    if (!app.playing || session !== app.token) return;
    const time = meta && meta.mediaTime !== undefined ? meta.mediaTime : master.currentTime;
    app.k = L.clamp(Math.round(time * L.FPS), 0, app.scene.count - 1);
    for (const v of vids) {
      if (v !== master && Math.abs(v.currentTime - master.currentTime) > 1.5 / L.FPS) v.currentTime = master.currentTime;
    }
    draw();
    schedule();
  };
  const schedule = () => {
    if (master.requestVideoFrameCallback) master.requestVideoFrameCallback(tick);
    else requestAnimationFrame(() => tick(0, null));
  };
  schedule();
}

function stopPlaying() {
  if (!app.playing) return;
  app.playing = false;
  $('#play').textContent = '▶';
  for (const v of Object.values(app.videos)) v.pause();
  app.k = frameOf(video(app.bg));
  seekAll(app.k);
  writeHash();
}

function restart() {
  if (app.playing) {
    stopPlaying();
    startPlaying();
  } else {
    seekAll(app.k);
  }
}

// --- Рисование кадра во всех окнах.
function draw() {
  if (!app.scene) return;
  shown().forEach((id, i) => {
    const st = app.stages[i];
    if (!st || !st.painter) return;
    const vid = video(id === 'now' ? 'a' : app.bg);
    if (vid.readyState < 2) {
      st.wait.textContent = 'Загружается видео…';
      return;
    }
    st.wait.textContent = '';
    st.painter.begin();
    st.painter.image(vid);
    const v = L.variantById[id];
    if (v) {
      st.g.reset();
      try {
        v.draw(st.g, L.context(app.scene, app.k), settingsFor(id));
      } catch (e) {
        st.wait.textContent = 'Ошибка варианта: ' + e.message;
        console.error(e);
      }
      st.painter.draw(st.g);
    }
  });
  $('#scrub').value = app.k;
  $('#time').textContent = L.fmt.dec(app.k / L.FPS, 1) + ' с · ' + app.k;
}

// --- Окна: два холста заводятся один раз, второй виден только при сравнении.
function makeStage(i) {
  const canvas = el('canvas', { width: L.W, height: L.H });
  const label = el('div', { class: 'label' });
  const wait = el('div', { class: 'wait', text: 'Загружается…' });
  const pick = el('select', { class: 'pick', 'aria-label': 'Вариант окна' });
  for (const v of variantList()) pick.append(el('option', { value: v.id, text: v.n + ' · ' + v.title }));
  pick.addEventListener('click', (e) => e.stopPropagation());
  pick.addEventListener('change', () => {
    app.panes[i] = pick.value;
    app.focus = i;
    refreshUi();
    restart();
  });
  const box = el('div', { class: 'stage' }, canvas, label, wait, pick);
  box.addEventListener('click', () => {
    if (!app.compare || app.focus === i) return;
    app.focus = i;
    refreshUi();
  });
  $('#stages').append(box);
  const st = { box, canvas, label, wait, pick, painter: null, g: new L.Canvas(app.glyphs) };
  try {
    st.painter = new L.Painter(canvas, app.atlas);
  } catch (e) {
    wait.innerHTML = '';
    wait.append(el('span', { class: 'err', text: 'Нужен браузер с WebGL2.' }));
  }
  return st;
}

function layoutStages() {
  $('#stages').classList.toggle('two', app.compare);
  const scale = 1 / (window.devicePixelRatio || 1);
  app.stages.forEach((st, i) => {
    st.box.hidden = i > 0 && !app.compare;
    st.pick.hidden = !app.compare;
    st.label.hidden = app.compare;
    st.box.classList.toggle('focus', app.compare && app.focus === i);
    st.box.classList.toggle('pixel', app.pixel);
    st.canvas.style.width = app.pixel ? L.W * scale + 'px' : '';
    st.canvas.style.height = app.pixel ? L.H * scale + 'px' : '';
  });
  const list = shown();
  list.forEach((id, i) => {
    const st = app.stages[i];
    const v = variantOf(id);
    st.pick.value = id;
    st.label.innerHTML = '';
    st.label.append(el('b', { text: String(v.n) }), v.title + (L.variantById[id] ? ' · ' + presetTitle(app.preset[id]) : ''));
  });
}

function presetTitle(p) {
  return p === 'full' ? 'полный' : p === 'custom' ? 'свой' : 'чистый';
}

// --- Вкладки, сцены, переключатели.
function buildTabs() {
  const root = $('#tabs');
  for (const v of variantList()) {
    const b = el('button', { class: 'tab' + (v.n === '★' ? ' star' : ''), 'data-id': v.id }, el('b', { text: String(v.n) }), v.title);
    b.addEventListener('click', () => choose(v.id));
    root.append(b);
  }
}

function choose(id) {
  app.panes[app.focus] = id;
  refreshUi();
  restart();
}

function buildScenes() {
  const root = $('#scenes');
  for (const s of SCENES) {
    const b = el('button', { class: 'chip', 'data-id': s.id, text: s.chip });
    b.addEventListener('click', () => loadScene(s.id));
    root.append(b);
  }
}

function refreshUi() {
  const current = app.panes[app.focus];
  for (const b of document.querySelectorAll('#tabs .tab')) b.classList.toggle('on', b.dataset.id === current);
  for (const b of document.querySelectorAll('#scenes .chip')) b.classList.toggle('on', b.dataset.id === app.sceneId);
  for (const b of document.querySelectorAll('#bg button')) b.classList.toggle('on', b.dataset.v === app.bg);
  for (const b of document.querySelectorAll('#speed button')) b.classList.toggle('on', Number(b.dataset.v) === app.rate);
  $('#compare').classList.toggle('on', app.compare);
  $('#pixel').classList.toggle('on', app.pixel);
  if (app.scene) $('#sceneNote').textContent = app.scene.title;
  layoutStages();
  buildAbout(current);
  buildSettings(current);
  writeHash();
}

// --- Описание варианта.
function buildAbout(id) {
  const v = variantOf(id);
  const root = $('#about');
  root.innerHTML = '';
  root.append(el('h2', {}, el('small', { text: String(v.n) }), v.title));
  root.append(el('p', { class: 'lead', text: v.idea || '' }));
  if (v.why) root.append(el('p', { text: v.why }));
  if (v.shows) {
    root.append(el('h3', { text: 'Что на экране' }));
    const ul = el('ul');
    for (const s of v.shows) ul.append(el('li', { text: s }));
    root.append(ul);
  }
  if (v.inspired) {
    root.append(el('h3', { text: 'Откуда идея' }));
    const ul = el('ul');
    for (const s of v.inspired) {
      if (typeof s === 'string') ul.append(el('li', { text: s }));
      else ul.append(el('li', {}, el('a', { href: s.url, target: '_blank', rel: 'noopener', text: s.name }), s.note ? ' — ' + s.note : ''));
    }
    root.append(ul);
  }
  if (v.game) {
    root.append(el('h3', { text: 'В игре' }));
    root.append(el('p', { class: 'muted', text: v.game }));
  }
  if (id === 'now') {
    root.append(el('p', { class: 'muted', text: 'Ниже на странице — сверка: этот прицел, нарисованный страницей, против кадра игры.' }));
  }
}

// --- Настройки варианта.
function buildSettings(id) {
  const root = $('#settings');
  root.innerHTML = '';
  app.codeInput = null;
  const v = L.variantById[id];
  root.append(el('h2', { text: 'Настройки' }));
  if (!v) {
    root.append(el('p', { class: 'muted', text: 'У этого окна настроек нет — выберите вариант 1–5 или гибрид.' }));
    shareBlock(root);
    return;
  }
  const s = settingsFor(id);
  const presets = el('div', { class: 'presets' });
  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Набор' });
  for (const [key, title] of [['clean', 'Чистый'], ['full', 'Полный']]) {
    const b = el('button', { class: app.preset[id] === key ? 'on' : '', text: title });
    b.addEventListener('click', () => {
      applyPreset(id, key);
      refreshUi();
      redraw();
    });
    seg.append(b);
  }
  const tag = el('span', { class: 'muted', text: app.preset[id] === 'custom' ? 'свой набор' : '' });
  presets.append(seg, tag);
  root.append(presets);
  const changed = () => {
    app.preset[id] = 'custom';
    tag.textContent = 'свой набор';
    for (const b of seg.querySelectorAll('button')) b.classList.remove('on');
    layoutStages();
    writeHash();
    redraw();
  };
  for (const d of (v.settings || []).concat(K.COMMON)) {
    const row = el('div', { class: 'row' }, el('label', { text: d.title }));
    let control;
    if (d.type === 'bool') {
      control = el('div', { class: 'switch' + (s[d.key] ? ' on' : ''), role: 'switch', tabindex: '0', 'aria-checked': String(!!s[d.key]), 'aria-label': d.title });
      const flip = () => {
        s[d.key] = !s[d.key];
        control.classList.toggle('on', s[d.key]);
        control.setAttribute('aria-checked', String(s[d.key]));
        changed();
      };
      control.addEventListener('click', flip);
      control.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          flip();
        }
      });
    } else if (d.type === 'range') {
      const input = el('input', { type: 'range', min: d.min, max: d.max, step: d.step, value: s[d.key], 'aria-label': d.title });
      const val = el('span', { class: 'val', text: L.fmt.dec(Number(s[d.key]), digits(d.step)) });
      input.addEventListener('input', () => {
        s[d.key] = Number(input.value);
        val.textContent = L.fmt.dec(s[d.key], digits(d.step));
        changed();
      });
      control = el('div', { class: 'range' }, input, val);
    } else {
      control = el('select', { 'aria-label': d.title });
      for (const [value, title] of d.options) control.append(el('option', { value, text: title }));
      control.value = s[d.key];
      control.addEventListener('change', () => {
        s[d.key] = control.value;
        changed();
      });
    }
    row.append(control);
    root.append(row);
  }
  shareBlock(root);
}

function shareBlock(root) {
  const code = el('input', { readonly: '', 'aria-label': 'Код настроек', value: encodeState() });
  code.addEventListener('focus', () => code.select());
  const copy = el('button', { class: 'btn', text: 'Копировать' });
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code.value);
      copy.textContent = 'Скопировано';
    } catch (e) {
      code.select();
      copy.textContent = 'Выделено';
    }
    setTimeout(() => (copy.textContent = 'Копировать'), 1500);
  });
  const apply = el('input', { placeholder: 'Вставьте код и нажмите Enter', 'aria-label': 'Применить код' });
  apply.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const scene = app.sceneId;
    if (decodeState(apply.value.trim().replace(/^.*#s[.=]/, ''))) {
      const id = app.sceneId;
      app.sceneId = scene;
      if (id !== scene) loadScene(id);
      else {
        refreshUi();
        restart();
      }
    } else {
      apply.value = '';
      apply.placeholder = 'Код не подошёл';
    }
  });
  root.append(el('h3', { text: 'Код настроек' }), el('div', { class: 'share' }, code, copy), el('div', { class: 'share' }, apply),
    el('p', { class: 'muted', text: 'Ссылкой — адрес этой страницы и в конце #s. с кодом: откроется с теми же сценой, кадром и настройками.' }));
  app.codeInput = code;
}

function redraw() {
  if (!app.playing) draw();
}

// --- Код состояния: сцена, кадр, окна, фон и отличия настроек от набора.
function b64(s) {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64(s) {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(t + '==='.slice((t.length + 3) % 4))));
}

function encodeState() {
  const sets = {};
  for (const id of Object.keys(app.settings)) {
    const v = L.variantById[id];
    if (!v) continue;
    const base = Object.assign(defaults(v), (v.presets && v.presets[app.preset[id] === 'full' ? 'full' : 'clean']) || {});
    const diff = {};
    for (const [k, val] of Object.entries(app.settings[id])) if (base[k] !== val) diff[k] = val;
    const p = app.preset[id] === 'full' ? 'f' : app.preset[id] === 'custom' ? 'x' : 'c';
    if (p === 'c' && !Object.keys(diff).length) continue;
    sets[id] = Object.keys(diff).length ? { p, d: diff } : { p };
  }
  const o = { s: app.sceneId, k: app.k, p: app.panes, f: app.focus };
  if (app.compare) o.c = 1;
  if (app.bg !== 'b') o.b = app.bg;
  if (Object.keys(sets).length) o.v = sets;
  return b64(JSON.stringify(o));
}

function decodeState(code) {
  let o;
  try {
    o = JSON.parse(unb64(code));
  } catch (e) {
    return false;
  }
  if (!o || typeof o !== 'object') return false;
  if (o.s && SCENES.some((x) => x.id === o.s)) app.sceneId = o.s;
  if (Number.isFinite(o.k)) app.k = Math.max(0, Math.floor(o.k));
  if (Array.isArray(o.p)) {
    const ok = o.p.filter((id) => variantOf(id)).slice(0, 2);
    if (ok.length === 2) app.panes = ok;
  }
  app.compare = !!o.c;
  app.focus = o.f === 0 ? 0 : 1;
  app.bg = o.b === 'c' ? 'c' : 'b';
  for (const [id, st] of Object.entries(o.v || {})) {
    const v = L.variantById[id];
    if (!v || !st) continue;
    applyPreset(id, st.p === 'f' ? 'full' : 'clean');
    const known = defaults(v);
    for (const [k, val] of Object.entries(st.d || {})) if (k in known && typeof val === typeof known[k]) app.settings[id][k] = val;
    if (st.p === 'x') app.preset[id] = 'custom';
  }
  return true;
}

let hashTimer = 0;
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const code = encodeState();
    try {
      history.replaceState(null, '', '#s.' + code);
    } catch (e) {
      // Адрес страницы может быть закрыт песочницей — код остаётся в поле настроек.
    }
    if (app.codeInput) app.codeInput.value = code;
  }, 150);
}

// --- Сцена.
async function loadScene(id) {
  const was = app.playing;
  if (was) {
    app.playing = false;
    for (const v of Object.values(app.videos)) v.pause();
  }
  if (id !== app.sceneId) {
    for (const [key, v] of Object.entries(app.videos)) {
      v.pause();
      v.removeAttribute('src');
      v.load();
      v.remove();
      delete app.videos[key];
    }
  }
  app.sceneId = id;
  try {
    if (!app.scenes[id]) app.scenes[id] = new L.Scene(id, await L.loadJSON('scenes/' + id + '/data.txt'));
  } catch (e) {
    for (const st of app.stages) st.wait.textContent = 'Не загрузились данные сцены: ' + e.message;
    return;
  }
  if (app.sceneId !== id) return;
  app.scene = app.scenes[id];
  app.k = L.clamp(app.k, 0, app.scene.count - 1);
  $('#scrub').max = app.scene.count - 1;
  buildMarks();
  refreshUi();
  proof.scene();
  await seekAll(app.k);
  if (was) startPlaying();
}

function buildMarks() {
  const root = $('#timeline');
  for (const m of root.querySelectorAll('.mark')) m.remove();
  const n = Math.max(app.scene.count - 1, 1);
  app.scene.frames.forEach((f, k) => {
    const kinds = new Set(f.ev.map((e) => e.k));
    for (const kind of ['fire', 'hit']) {
      if (!kinds.has(kind)) continue;
      const m = el('span', { class: 'mark ' + kind });
      m.style.left = 'calc(8px + (100% - 16px) * ' + (k / n).toFixed(4) + ')';
      root.append(m);
    }
  });
}

// --- Сверка 1:1: нынешний прицел, нарисованный страницей поверх кадра игры без прицела, против кадра игры с прицелом.
const proof = {
  split: 0.5,
  diff: false,
  visible: false,
  dirty: true,
  busy: false,
  engine: null,
  got: null,
  want: null,

  build() {
    const root = $('#proof');
    root.append(el('h2', { text: 'Сверка 1:1: страница рисует, как игра' }));
    root.append(el('p', { class: 'muted', text: 'Слева от шторки — кадр, снятый игрой с нынешним прицелом. Справа — тот же прицел, ' +
      'нарисованный этой страницей поверх кадра игры без прицела: ленты на воде — как Godot (MSAA 4×, глубина сцены, AgX), кольцо ' +
      'и буквы — тем же 2D, которым рисуются варианты. Тяните шторку; «Разница ×16» показывает, где страница отличается от игры.' }));
    const shutter = el('div', { class: 'shutter' });
    this.page = el('canvas', { width: L.W, height: L.H });
    this.game = el('canvas', { width: L.W, height: L.H });
    this.divider = el('div', { class: 'divider' });
    shutter.append(this.page, this.game, this.divider, el('span', { class: 'tag l', text: 'игра' }), el('span', { class: 'tag r', text: 'страница' }));
    const bar = el('div', { class: 'bar', style: 'margin:10px 0' });
    this.pick = el('select', { class: 'btn', 'aria-label': 'Кадр сверки' });
    this.pick.addEventListener('change', () => this.render());
    this.diffBtn = el('button', { class: 'btn', text: 'Разница ×16' });
    this.diffBtn.addEventListener('click', () => {
      this.diff = !this.diff;
      this.diffBtn.classList.toggle('on', this.diff);
      this.show();
    });
    bar.append(el('span', { class: 'muted', text: 'Кадр:' }), this.pick, this.diffBtn);
    this.live = el('p', { class: 'muted', text: '' });
    root.append(shutter, bar, this.live, numbersTable());
    const place = (x) => {
      this.split = L.clamp(x, 0, 1);
      this.game.style.clipPath = 'inset(0 ' + (100 - this.split * 100).toFixed(2) + '% 0 0)';
      this.divider.style.left = (this.split * 100).toFixed(2) + '%';
    };
    place(this.split);
    const drag = (e) => {
      const r = shutter.getBoundingClientRect();
      place((e.clientX - r.left) / r.width);
    };
    shutter.addEventListener('pointerdown', (e) => {
      shutter.setPointerCapture(e.pointerId);
      drag(e);
    });
    shutter.addEventListener('pointermove', (e) => {
      if (shutter.hasPointerCapture(e.pointerId)) drag(e);
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((list) => {
        this.visible = list.some((x) => x.isIntersecting);
        if (this.visible && this.dirty) this.render();
      }, { rootMargin: '200px' }).observe(shutter);
    } else {
      this.visible = true;
    }
  },

  frames() {
    const published = (L.PROOF && L.PROOF.published && L.PROOF.published[app.sceneId]) || [];
    return published.filter((k) => app.scene.checks.includes(k));
  },

  scene() {
    this.pick.innerHTML = '';
    for (const k of this.frames()) this.pick.append(el('option', { value: k, text: k + ' (' + L.fmt.dec(k / L.FPS, 1) + ' с)' }));
    this.dirty = true;
    if (this.visible) this.render();
  },

  async render() {
    this.dirty = false;
    const k = Number(this.pick.value);
    if (!this.pick.value || !Number.isFinite(k)) {
      this.live.textContent = 'У этой сцены нет кадров сверки на странице.';
      return;
    }
    if (this.busy) {
      this.dirty = true;
      return;
    }
    this.busy = true;
    this.live.textContent = 'Считаю кадр ' + k + '…';
    const scene = app.scene;
    const base = 'scenes/' + scene.name + '/check/';
    const pad = String(k).padStart(4, '0');
    try {
      const [a, c, d, m] = await Promise.all(['a', 'c', 'd', 'm'].map((x) => L.loadImage(base + x + '_' + pad + '.webp')));
      this.game.getContext('2d').drawImage(a, 0, 0);
      if (!this.engine) {
        this.engine = new L.Proof(this.page, app.atlas, app.glyphs);
        if (!this.engine.float || !this.engine.ready) throw new Error('нет буферов с плавающей точкой');
      }
      const images = { a, c, d, m };
      const without = this.engine.render(scene, k, images, { order: [], reticle: false });
      this.got = this.engine.render(scene, k, images, {});
      this.want = L.bytesOf(a);
      const r = measure(this.got, this.want, without);
      this.live.textContent = 'Кадр ' + k + ': пикселей прицела ' + r.pixels.toLocaleString('ru-RU') + '; совпали точно ' + pct(r.exact, r.pixels) +
        ', отличаются не больше чем на 2 уровня из 255 — ' + pct(r.le2, r.pixels) + ', не больше 8 — ' + pct(r.le8, r.pixels) +
        '; среднее отличие ' + L.fmt.dec(r.mean, 2) + ' (без прицела было бы ' + L.fmt.dec(r.without, 1) + ').';
      this.show();
    } catch (e) {
      this.live.textContent = 'Сверку на этом устройстве нарисовать нельзя (' + e.message + '); цифры по всем кадрам — в таблице ниже.';
    }
    this.busy = false;
    if (this.dirty && this.visible) this.render();
  },

  show() {
    if (!this.engine || !this.got) return;
    let px = this.got;
    if (this.diff) {
      px = new Uint8Array(this.got.length);
      for (let i = 0; i < px.length; i += 4) {
        const d = Math.max(Math.abs(this.got[i] - this.want[i]), Math.abs(this.got[i + 1] - this.want[i + 1]), Math.abs(this.got[i + 2] - this.want[i + 2]));
        const v = Math.min(255, d * 16);
        px[i] = v;
        px[i + 1] = d > 2 ? v * 0.35 : v;
        px[i + 2] = d > 2 ? 0 : v;
        px[i + 3] = 255;
      }
    }
    const gl = this.engine.gl;
    const tex = L.texture(gl, null);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, L.W, L.H, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
    this.engine.painter.begin();
    this.engine.painter.texture(tex, false);
    gl.deleteTexture(tex);
  },
};

function pct(a, b) {
  return L.fmt.dec((100 * a) / Math.max(b, 1), 1) + ' %';
}

function measure(got, want, base) {
  let pixels = 0, exact = 0, le2 = 0, le8 = 0, sum = 0, without = 0;
  for (let i = 0; i < want.length; i += 4) {
    let drawn = false;
    let seen = 0;
    for (let c = 0; c < 3; c++) {
      if (got[i + c] !== base[i + c]) drawn = true;
      seen = Math.max(seen, Math.abs(want[i + c] - base[i + c]));
    }
    if (!drawn && seen < 3) continue;
    const d = Math.max(Math.abs(got[i] - want[i]), Math.abs(got[i + 1] - want[i + 1]), Math.abs(got[i + 2] - want[i + 2]));
    pixels++;
    sum += d;
    without += seen;
    if (d === 0) exact++;
    if (d <= 2) le2++;
    if (d <= 8) le8++;
  }
  return { pixels, exact, le2, le8, mean: sum / Math.max(pixels, 1), without: without / Math.max(pixels, 1) };
}

function numbersTable() {
  const data = L.PROOF;
  const box = el('div', { class: 'scroll-x' });
  if (!data || !data.frames) return box;
  if (data.reticle) {
    const r = data.reticle;
    box.append(el('h3', { text: 'Кольцо и числа прицела (2D) — те же вызовы, что у вариантов' }));
    box.append(el('p', { text: 'Все ' + r.frames + ' кадров сверки: ' + r.pixels.toLocaleString('ru-RU') + ' пикселей, точно ' + pct(r.exact, r.pixels) +
      ', самое большое отличие — ' + r.max + ' ' + (r.max === 1 ? 'уровень' : 'уровня') + ' из 255.' }));
  }
  const t = el('table', { class: 'nums' });
  t.append(el('tr', {}, ...['Сцена, кадр', 'Пикселей', 'Точно', '≤ 2 уровня', '≤ 8', 'Среднее', 'Без прицела'].map((x) => el('th', { text: x }))));
  const row = (title, r, strong) => el('tr', {}, ...[title, r.pixels.toLocaleString('ru-RU'), pct(r.exact, r.pixels), pct(r.le2, r.pixels), pct(r.le8, r.pixels),
    L.fmt.dec(r.mean, 2), L.fmt.dec(r.without, 1)].map((x) => el('td', strong ? { text: x, style: 'color:var(--gold-2)' } : { text: x })));
  for (const r of data.frames) t.append(row(((SCENES.find((s) => s.id === r.scene) || {}).chip || r.scene) + ', ' + r.frame, r, false));
  if (data.total) t.append(row('Все кадры', data.total, true));
  box.append(el('h3', { text: 'Весь кадр с лентами на воде — все кадры сверки' }), t);
  if (data.note) box.append(el('p', { class: 'muted', text: data.note }));
  return box;
}

// --- Запуск.
async function start() {
  const hash = location.hash.replace(/^#/, '');
  const fromHash = /^s[.=]/.test(hash) && decodeState(hash.slice(2));
  if (!fromHash && window.matchMedia('(min-width: 1101px)').matches) app.compare = true;
  try {
    app.glyphs = await L.loadJSON('glyphs.json');
    app.atlas = await L.loadImage('glyphs.png');
  } catch (e) {
    $('#stages').append(el('p', { class: 'err', text: 'Не загрузились буквы игры: ' + e.message }));
    return;
  }
  buildTabs();
  buildScenes();
  app.stages = [makeStage(0), makeStage(1)];
  proof.build();
  $('#play').addEventListener('click', () => (app.playing ? stopPlaying() : startPlaying()));
  $('#prev').addEventListener('click', () => step(-1));
  $('#next').addEventListener('click', () => step(1));
  $('#scrub').addEventListener('input', (e) => {
    if (app.playing) stopPlaying();
    app.k = Number(e.target.value);
    seekAll(app.k);
    writeHash();
  });
  for (const b of document.querySelectorAll('#speed button')) {
    b.addEventListener('click', () => {
      app.rate = Number(b.dataset.v);
      for (const v of Object.values(app.videos)) v.playbackRate = app.rate;
      refreshUi();
    });
  }
  for (const b of document.querySelectorAll('#bg button')) {
    b.addEventListener('click', () => {
      app.bg = b.dataset.v;
      refreshUi();
      restart();
    });
  }
  $('#compare').addEventListener('click', toggleCompare);
  $('#pixel').addEventListener('click', () => {
    app.pixel = !app.pixel;
    layoutStages();
    $('#pixel').classList.toggle('on', app.pixel);
  });
  window.addEventListener('resize', () => app.pixel && layoutStages());
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, select, textarea, [role=switch]')) return;
    if (e.key === ' ') {
      e.preventDefault();
      app.playing ? stopPlaying() : startPlaying();
    } else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'c' || e.key === 'C' || e.key === 'с' || e.key === 'С') toggleCompare();
    else if (/^[0-6]$/.test(e.key)) {
      const v = variantList()[Number(e.key)];
      if (v) choose(v.id);
    }
  });
  await loadScene(app.sceneId);
}

function toggleCompare() {
  app.compare = !app.compare;
  refreshUi();
  restart();
}

function step(d) {
  if (!app.scene) return;
  if (app.playing) stopPlaying();
  app.k = (app.k + d + app.scene.count) % app.scene.count;
  seekAll(app.k);
  writeHash();
}

window.AimApp = app;
start();
})();
