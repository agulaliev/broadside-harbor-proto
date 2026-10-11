import * as THREE from 'three';
import { shipInfo } from './ships.js';
import { h, statBlock, fleetCards, captainButton, modeSwitch, ctaButton, pennantSvg, FRIENDS } from './ui.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const OVERVIEW = { pos: V(15, 72, 75), look: V(-5, 0, -110), fov: 50 };

const PLACES = [
  { key: 'pier', name: 'Причал', what: 'компания и выход в море', lift: 22 },
  { key: 'shipyard', name: 'Верфь', what: 'флот: выбрать корабль', lift: 20 },
  { key: 'tavern', name: 'Таверна', what: 'команда и офицеры', lift: 14, soon: true },
  { key: 'market', name: 'Рынок', what: 'продать добычу', lift: 12, soon: true },
  { key: 'lighthouse', name: 'Маяк', what: 'журнал рейсов', lift: 26 },
  { key: 'fort', name: 'Форт', what: 'полигон у берега', lift: 18 },
];

export class VariantC {
  constructor(app) {
    this.app = app;
    this.offs = [];
    this.timers = [];
    this.open = null;
    this.hot = null;
  }

  async enter() {
    const app = this.app;
    app.setLight({ el: 22, az: 150, dusk: 1, exposure: 1.35, zenith: '#0C1838', horizon: '#3E5480', sun: '#9DB6E0', sunPower: 1.3, clouds: 0.3, hemi: 0.5 });
    app.rig.hold(OVERVIEW, { parallax: 7 });
    app.rig.flyTo(null, 2.2);

    const root = h('div', { class: 'vc' });
    this.root = root;
    const cap = captainButton(app, root);
    this.cap = cap;
    const top = h('div', { class: 'vc-top' }, h('div', { class: 'vc-logo' }, 'Broadside', h('small', { text: 'Своя гавань' })), cap);
    this.labels = h('div', { class: 'vc-labels' });
    this.labelEls = PLACES.map((p) => {
      const el = h('button', {
        type: 'button', class: `vc-label${p.soon ? ' soon' : ''}`, 'aria-label': `${p.name}: ${p.what}`,
        onmouseenter: () => { app.audio.tick('hover'); this._hot(p.key); },
        onmouseleave: () => this._hot(null),
        onclick: () => this.go(p.key),
      }, h('div', { class: 'l-box' }, h('span', { class: 'l-name', text: p.name }), h('span', { class: 'l-what', text: p.what })), h('i', { class: 'l-stem' }), h('i', { class: 'l-pin' }));
      el.dataset.key = p.key;
      return el;
    });
    this.labels.append(...this.labelEls);
    this.modes = modeSwitch(app);
    this.launch = h('div', { class: 'vc-launch' }, ctaButton(app, 'В море', () => this.depart()), this.modes);
    this.panel = h('aside', { class: 'vc-panel', 'aria-live': 'polite' });
    this.hint = h('div', { class: 'vc-hint passthrough', text: 'Наведи на постройку — подпись, щёлкни — камера полетит туда' });
    root.append(this.labels, top, this.launch, this.panel, this.hint);
    document.getElementById('ui').append(root);

    this.boxes = PLACES.map((p) => ({ key: p.key, box: new THREE.Box3().setFromObject(app.harbor.places[p.key].group) }));
    this.ray = new THREE.Raycaster();
    this._move = (e) => {
      if (this.open || app.departure.active || e.target !== app.renderer.domElement) return;
      const m = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      this.ray.setFromCamera(m, app.camera);
      let best = null, bestD = Infinity;
      const hit = new THREE.Vector3();
      for (const b of this.boxes) {
        if (this.ray.ray.intersectBox(b.box, hit)) {
          const d = hit.distanceTo(this.ray.ray.origin);
          if (d < bestD) { bestD = d; best = b.key; }
        }
      }
      if (best !== this.hot) {
        if (best) app.audio.tick('hover');
        this._hot(best);
      }
      app.renderer.domElement.style.cursor = best ? 'pointer' : '';
    };
    this._click = () => { if (this.hot && !this.open) this.go(this.hot); };
    app.renderer.domElement.addEventListener('pointermove', this._move);
    app.renderer.domElement.addEventListener('click', this._click);
    this._keys = (e) => { if (e.key === 'Escape' && this.open) this.back(); };
    window.addEventListener('keydown', this._keys);
    this.offs.push(app.on((ev) => {
      if (ev === 'hero' && this.open === 'shipyard') this._shipyardInfo();
      if (ev === 'captain' && this.open === 'pier') this._renderSlots();
    }));
  }

  _hot(key) {
    this.hot = key;
    this.labelEls.forEach((el) => el.classList.toggle('hot', el.dataset.key === key));
  }

  _shipPose(az, distK, shift) {
    const ship = this.app.hero;
    const L = ship.info.length;
    const look = ship.pos.clone().add(V(0, L * 0.34, 0));
    const a = THREE.MathUtils.degToRad(az);
    const d = L * distK;
    return { pos: V(look.x + Math.sin(a) * d, look.y + L * 0.12, look.z - Math.cos(a) * d), look, fov: 40, shift };
  }

  _pose(key) {
    const c = this.app.harbor.places[key].center;
    switch (key) {
      case 'pier': return this._shipPose(205, 2.3, -0.13);
      case 'shipyard': return this._shipPose(235, 2.1, -0.13);
      case 'tavern': return { pos: V(c.x + 34, c.y + 10, c.z + 52), look: V(c.x + 4, c.y - 1, c.z), fov: 40, shift: -0.13 };
      case 'market': return { pos: V(c.x + 30, c.y + 12, c.z + 50), look: V(c.x, c.y - 1, c.z), fov: 40, shift: -0.13 };
      case 'lighthouse': return { pos: V(c.x - 70, c.y + 14, c.z + 85), look: V(c.x, c.y + 4, c.z), fov: 40, shift: -0.13 };
      case 'fort': return { pos: V(c.x + 80, c.y + 22, c.z + 95), look: V(c.x, c.y, c.z), fov: 40, shift: -0.13 };
      default: return OVERVIEW;
    }
  }

  async go(key) {
    const app = this.app;
    app.audio.tick('press');
    this.open = key;
    this._hot(null);
    app.renderer.domElement.style.cursor = '';
    this.labels.classList.add('away');
    this.launch.style.opacity = '0';
    this.launch.style.pointerEvents = 'none';
    this.hint.style.opacity = '0';
    const pose = this._pose(key);
    app.rig.hold(pose);
    app.rig.flyTo({ ...pose, arc: 26 }, 2.0);
    this._fillPanel(key);
    this.timers.push(setTimeout(() => { if (this.open === key) this.panel.classList.add('open'); }, 700));
  }

  back() {
    const app = this.app;
    app.audio.tick('press');
    this.open = null;
    this.panel.classList.remove('open');
    this.labels.classList.remove('away');
    this.launch.style.opacity = '';
    this.launch.style.pointerEvents = '';
    app.rig.hold(OVERVIEW, { parallax: 7 });
    app.rig.flyTo({ ...OVERVIEW, arc: 30 }, 2.0);
  }

  _fillPanel(key) {
    const app = this.app;
    const p = PLACES.find((x) => x.key === key);
    const back = h('button', { type: 'button', class: 'vc-back', onclick: () => this.back() }, '← Гавань');
    const kids = [back, h('h2', { text: p.name })];
    if (key === 'pier') {
      this.slots = h('div', { class: 'va-slots' });
      this._renderSlots();
      const modes = modeSwitch(app);
      kids.push(h('p', { class: 'p-lead', text: 'Здесь собирается компания. Все готовы — отдаём швартовы.' }), this.slots, modes,
        h('div', {}, ctaButton(app, 'В море', () => this.depart())));
    } else if (key === 'shipyard') {
      this.yardName = h('div', { class: 'va-role' });
      this.yardStats = statBlock();
      const grid = h('div', { class: 'vc-fleet' });
      const { off } = fleetCards(app, grid, (id) => app.placeHero(id));
      this.offs.push(off);
      kids.push(h('p', { class: 'p-lead', text: 'Корабль, выбранный здесь, встаёт к причалу.' }), this.yardName, this.yardStats, grid);
    } else if (key === 'tavern') {
      kids.push(h('p', { class: 'p-lead', text: 'Офицеры и команда. У каждого офицера — своя особенность корабля.' }),
        ...[['Боцман', 'чинит быстрее'], ['Канонир', 'перезарядка'], ['Штурман', 'ход и поворот'], ['Лекарь', 'люди после абордажа']].map(([a, b]) => h('div', { class: 'vc-notice' }, h('b', { text: a }), h('span', { text: b }))),
        h('p', { class: 'p-body', style: 'color:var(--ink-dim)', text: 'Появится вместе с прогрессом гавани.' }));
    } else if (key === 'market') {
      kids.push(h('p', { class: 'p-lead', text: 'Добыча из рейсов превращается здесь в улучшения гавани и флота.' }),
        h('p', { class: 'p-body', style: 'color:var(--ink-dim)', text: 'Появится вместе с добычей и прогрессом.' }));
    } else if (key === 'lighthouse') {
      kids.push(h('p', { class: 'p-lead', text: 'Журнал последних рейсов компании.' }),
        ...[['У Чёрных скал', '2 купца · пират потоплен · +840 добычи'], ['Пролив Ветров', 'абордаж фрегата · +1 200'], ['Песчаная коса', 'потеряли шлюп · +310']].map(([a, b]) => h('div', { class: 'vc-notice' }, h('b', { text: a }), h('span', { class: 'ex', text: b }))));
    } else if (key === 'fort') {
      kids.push(h('p', { class: 'p-lead', text: 'Мишени у берега: пристрелять пушки и научиться залпу, без потерь.' }),
        h('div', {}, ctaButton(app, 'На полигон', () => { app.state.mode = 'range'; this.depart(); })));
    }
    this.panel.replaceChildren(...kids);
    if (key === 'shipyard') this._shipyardInfo();
  }

  _shipyardInfo() {
    const info = shipInfo(this.app.state.shipId);
    this.yardName.textContent = `${info.name} · ${info.role}`;
    this.yardStats.set(info.id);
    const pose = this._pose('shipyard');
    this.app.rig.hold(pose);
    this.app.rig.flyTo(null, 1.2);
  }

  _renderSlots() {
    const app = this.app;
    const rows = [h('div', { class: 'va-slot' }, pennantSvg(app.state.captain.flag),
      h('div', {}, h('div', { class: 's-name', text: app.state.captain.name }), h('div', { class: 's-ship', text: shipInfo(app.state.shipId).name })),
      h('span', { class: 'ready', text: 'готов' }))];
    for (let i = 0; i < 3; i++) {
      const f = app.state.friends[i];
      if (f) {
        rows.push(h('div', { class: 'va-slot' }, pennantSvg(f.flag),
          h('div', {}, h('div', { class: 's-name', text: f.name }), h('div', { class: 's-ship', text: shipInfo(f.ship).name })),
          h('span', { class: f.ready ? 'ready' : 'ready wait', text: f.ready ? 'готов' : 'подходит' })));
      } else {
        rows.push(h('button', { type: 'button', class: 'va-slot empty', onmouseenter: () => app.audio.tick('hover'), onclick: () => this.invite(i) }, '+ Позвать друга'));
      }
    }
    this.slots.replaceChildren(...rows);
  }

  async invite(i) {
    const app = this.app;
    app.audio.tick('press');
    const used = new Set(app.state.friends.filter(Boolean).map((f) => f.name));
    const pick = FRIENDS.find((f) => !used.has(f.name));
    if (!pick) return;
    const f = { ...pick, ready: false };
    app.state.friends[i] = f;
    app.state.mode = 'friends';
    this._renderSlots();
    await app.placeFriend(i + 1, f.ship, f.flag);
    app.audio.play('cry_1.ogg', -20, 1.05);
    this.timers.push(setTimeout(() => { f.ready = true; if (this.open === 'pier') this._renderSlots(); }, 9000));
  }

  depart() {
    const app = this.app;
    this.panel.classList.remove('open');
    this.labels.classList.add('away');
    this.launch.style.opacity = '0';
    this.launch.style.pointerEvents = 'none';
    this.open = 'depart';
    app.departure.start({ mode: app.state.mode, title: 'Поднять якорь!' });
  }

  exit() {
    const app = this.app;
    this.offs.forEach((f) => f());
    this.timers.forEach((t) => clearTimeout(t));
    app.renderer.domElement.removeEventListener('pointermove', this._move);
    app.renderer.domElement.removeEventListener('click', this._click);
    app.renderer.domElement.style.cursor = '';
    window.removeEventListener('keydown', this._keys);
    this.cap?.dispose();
    this.root?.remove();
  }

  update() {
    if (!this.labelEls || this.open) return;
    const app = this.app;
    const w = window.innerWidth, hgt = window.innerHeight;
    const top = document.getElementById('ui').getBoundingClientRect().top;
    const v = new THREE.Vector3();
    PLACES.forEach((p, i) => {
      const el = this.labelEls[i];
      v.copy(app.harbor.places[p.key].center).add(V(0, p.lift, 0)).project(app.camera);
      if (v.z > 1) { v.x = -v.x; v.y = -v.y; }
      const edge = Math.abs(v.x) > 0.9 || Math.abs(v.y) > 0.9 || v.z > 1;
      const x = Math.min(Math.max(v.x, -0.9), 0.9), y = Math.min(Math.max(v.y, -0.75), 0.75);
      el.classList.toggle('edge', edge);
      el.classList.toggle('edge-left', edge && v.x < 0);
      el.style.transform = `translate(${((x + 1) / 2) * w}px, ${((1 - y) / 2) * hgt - top}px) translate(-50%, -100%)`;
    });
  }
}
