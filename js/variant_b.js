import * as THREE from 'three';
import { CATALOG, loadShip, Ship, shipInfo } from './ships.js';
import { shipShot, worldShot } from './camera.js';
import { h, captainButton, MODES, FRIENDS } from './ui.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class VariantB {
  constructor(app) {
    this.app = app;
    this.offs = [];
    this.timers = [];
    this.idle = 0;
    this.review = null;
  }

  async enter() {
    const app = this.app;
    app.setLight({ el: 4, az: 268, dusk: 0.5, exposure: 0.95, zenith: '#2B3F78', horizon: '#FF9450', sun: '#FFA55E', sunPower: 2.6, clouds: 0.5, hemi: 0.35 });
    document.getElementById('grain').classList.add('on');
    this._startShots();

    const root = h('div', { class: 'vb vb-bars' }, h('div', { class: 'vb-vignette passthrough' }));
    this.root = root;
    const ui = h('div', { class: 'vb-ui' });
    this.ui = ui;
    const cap = captainButton(app, root);
    this.cap = cap;
    cap.classList.add('vb-cap-btn');

    const sub = h('div', { class: 'vb-sub', role: 'group', 'aria-label': 'Режим' },
      MODES.map((m) => h('button', { type: 'button', onmouseenter: () => app.audio.tick('hover'), onclick: () => { app.audio.tick('press'); app.state.mode = m.id; this.depart(); } }, m.label)));
    const sea = h('button', { type: 'button', class: 'vb-link primary', 'aria-expanded': 'false', onmouseenter: () => app.audio.tick('hover') }, 'В море');
    sea.addEventListener('click', () => {
      app.audio.tick('press');
      const open = !sub.classList.contains('open');
      sub.classList.toggle('open', open);
      sea.setAttribute('aria-expanded', String(open));
    });
    const link = (label, fn) => h('button', { type: 'button', class: 'vb-link', onmouseenter: () => app.audio.tick('hover'), onclick: () => { app.audio.tick('press'); fn(); } }, label);
    const menu = h('nav', { class: 'vb-menu', 'aria-label': 'Главное меню' },
      h('div', { class: 'vb-item' }, sea, sub),
      h('div', { class: 'vb-item' }, link('Флот', () => this.openReview())),
      h('div', { class: 'vb-item' }, link('Позвать друга', () => this.invite())));
    this.main = h('div', { class: 'vb-main' }, h('h1', { class: 'vb-logo', text: 'Broadside' }), h('p', { class: 'vb-tag', text: 'Своя гавань. Свой флот.' }), menu);

    this.shipName = h('div', { class: 'vb-ship-name' });
    this.shipRole = h('div', { class: 'vb-ship-role' });
    this.side = h('div', { class: 'vb-side' }, this.shipRole, this.shipName, h('div', { class: 'vb-cap' }, cap));
    this.toastEl = h('div', { class: 'vb-review-title passthrough', style: 'opacity:0;transition:opacity .5s' });
    this.hint = h('div', { class: 'vb-hint passthrough', text: 'Не трогай мышь — меню спрячется' });

    this.reviewBar = h('div', { class: 'vb-review', hidden: true });
    this.reviewTitle = h('div', { class: 'vb-review-title passthrough', hidden: true });

    ui.append(this.main, this.side, this.hint);
    root.append(ui, this.reviewTitle, this.reviewBar, this.toastEl);
    document.getElementById('ui').append(root);
    this._showShip();

    this.offs.push(app.on((ev) => { if (ev === 'hero') this._showShip(); }));
    this._onMove = () => {
      this.idle = 0;
      if (this.ui.classList.contains('hidden') && !this.review && !app.departure.active) this.ui.classList.remove('hidden');
    };
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('keydown', this._onMove);
  }

  _startShots() {
    const app = this.app;
    const pier = app.harbor.places.pier;
    const shots = [
      shipShot(app, { az: [28, 48], dist: [1.75, 1.45], height: [0.16, 0.22], look: 0.32, fov: 34, duration: 13 }),
      worldShot({ from: V(110, 9, 30), to: V(70, 14, 10), lookFrom: V(-20, 8, -90), lookTo: V(-40, 10, -100), fov: 36, duration: 12 }),
      shipShot(app, { az: [150, 132], dist: [1.05, 1.2], height: [0.07, 0.1], look: 0.5, fov: 46, duration: 11 }),
      worldShot({ from: V(pier.x - 6, 3.6, -26), to: V(pier.x - 5, 3.9, -40), lookFrom: V(pier.x + 2, 2.6, -62), lookTo: V(pier.x + 2, 3.0, -70), fov: 38, duration: 10 }),
      worldShot({ from: V(-40, 7, 60), to: V(-70, 9, 40), lookFrom: V(-180, 10, -40), lookTo: V(-200, 12, -60), fov: 40, duration: 12 }),
      shipShot(app, { az: [-70, -95], dist: [2.2, 2.0], height: [0.5, 0.42], look: 0.3, fov: 36, duration: 12 }),
    ];
    app.rig.shots(shots, { fade: true });
  }

  _showShip() {
    const info = shipInfo(this.app.state.shipId);
    this.shipName.textContent = info.name;
    this.shipRole.textContent = info.role;
  }

  toast(text) {
    this.toastEl.replaceChildren(h('span', { text }));
    this.toastEl.style.opacity = '1';
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { this.toastEl.style.opacity = '0'; }, 3600);
  }

  async invite() {
    const app = this.app;
    const used = new Set(app.state.friends.filter(Boolean).map((f) => f.name));
    const i = app.state.friends.filter(Boolean).length;
    const pick = FRIENDS.find((f) => !used.has(f.name));
    if (!pick || i >= 3) { this.toast('Компания в сборе: четыре корабля'); return; }
    app.state.friends[i] = { ...pick, ready: false };
    app.state.mode = 'friends';
    this.toast(`${pick.name} идёт к твоему причалу — ${shipInfo(pick.ship).name.toLowerCase()}`);
    await app.placeFriend(i + 1, pick.ship, pick.flag);
    app.audio.play('cry_1.ogg', -20, 1.05);
  }

  async openReview() {
    const app = this.app;
    this.ui.classList.add('hidden');
    document.getElementById('fade').style.opacity = '0';
    if (!this.review) {
      this.review = { ships: [], index: 0, x: 0 };
      let x = -60;
      for (const c of CATALOG) {
        const template = await loadShip(c.id);
        const s = new Ship(c.id, template, { x, z: 150, heading: 270, swing: 0.6, flagColor: app.state.captain.flag });
        s.setSails(1);
        app.scene.add(s.root);
        this.review.ships.push(s);
        x += c.length + 34;
      }
      if (!this.root.isConnected) { this._dropReview(); return; }
    }
    const r = this.review;
    r.index = Math.max(0, CATALOG.findIndex((c) => c.id === app.state.shipId));
    r.focus = r.ships[r.index].pos.clone();
    const target = () => {
      const s = r.ships[r.index];
      const L = s.info.length;
      return { pos: V(r.focus.x - L * 0.55, L * 0.42, r.focus.z + L * 1.75), look: V(r.focus.x, L * 0.32, r.focus.z), fov: 38 };
    };
    app.rig.follow((dt) => {
      const s = r.ships[r.index];
      r.focus.lerp(s.pos, 1 - Math.exp(-dt * 2.2));
      return target();
    });
    app.rig.flyTo(null, 1.6);
    const names = CATALOG.map((c, i) => h('button', {
      type: 'button', 'aria-current': String(i === r.index), onmouseenter: () => app.audio.tick('hover'),
      onclick: () => this._focus(i),
    }, c.short || c.name));
    this.reviewNames = names;
    this.reviewBar.replaceChildren(...names, h('button', { type: 'button', class: 'vb-back', onclick: () => this.closeReview() }, 'Назад'));
    this.reviewBar.hidden = false;
    this.reviewTitle.hidden = false;
    this._focus(r.index, true);
    this._keys = (e) => {
      if (e.key === 'ArrowRight') this._focus(Math.min(r.index + 1, r.ships.length - 1));
      if (e.key === 'ArrowLeft') this._focus(Math.max(r.index - 1, 0));
      if (e.key === 'Escape') this.closeReview();
    };
    window.addEventListener('keydown', this._keys);
  }

  async _focus(i, silent) {
    const app = this.app;
    const r = this.review;
    r.index = i;
    if (!silent) app.audio.tick('press');
    this.reviewNames.forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
    const c = CATALOG[i];
    this.reviewTitle.replaceChildren('Смотр флота', h('b', { text: c.name }), h('span', { text: `${c.role} · ${c.guns}` }));
    if (app.state.shipId !== c.id) await app.placeHero(c.id);
  }

  closeReview() {
    const app = this.app;
    app.audio.tick('press');
    window.removeEventListener('keydown', this._keys);
    this.reviewBar.hidden = true;
    this.reviewTitle.hidden = true;
    this.ui.classList.remove('hidden');
    this.idle = 0;
    const fade = document.getElementById('fade');
    fade.style.transition = 'opacity .5s';
    fade.style.opacity = '1';
    setTimeout(() => {
      this._dropReview();
      this._startShots();
      fade.style.transition = '';
    }, 520);
  }

  _dropReview() {
    if (!this.review) return;
    for (const s of this.review.ships) this.app.scene.remove(s.root);
    this.review = null;
  }

  depart() {
    const app = this.app;
    this.ui.classList.add('hidden');
    document.getElementById('fade').style.opacity = '0';
    app.departure.start({ mode: app.state.mode, title: 'Поднять якорь!' });
  }

  exit() {
    this.offs.forEach((f) => f());
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('keydown', this._onMove);
    if (this._keys) window.removeEventListener('keydown', this._keys);
    clearTimeout(this._toastT);
    this._dropReview();
    this.cap?.dispose();
    this.root?.remove();
    document.getElementById('grain').classList.remove('on');
    document.getElementById('fade').style.opacity = '0';
  }

  update(dt) {
    if (this.review) for (const s of this.review.ships) s.update(dt, this.app.time);
    if (this.review || this.app.departure.active) return;
    this.idle += dt;
    if (this.idle > 6 && !this.ui.classList.contains('hidden')) {
      this.ui.classList.add('hidden');
      this.main.querySelector('.vb-sub')?.classList.remove('open');
    }
  }
}
