import { shipInfo } from './ships.js';
import { h, statBlock, fleetCards, captainButton, modeSwitch, ctaButton, pennantSvg, FRIENDS, BOATSWAIN } from './ui.js';

const DOORS = [
  { name: 'Причал', on: true },
  { name: 'Верфь' },
  { name: 'Таверна' },
  { name: 'Рынок' },
  { name: 'Журнал' },
];

export class VariantA {
  constructor(app) {
    this.app = app;
    this.offs = [];
    this.timers = [];
  }

  async enter() {
    const app = this.app;
    app.setLight({ el: 34, az: 210, dusk: 0, exposure: 0.95, zenith: '#2F64B8', horizon: '#C9DCEB', sun: '#FFF0D8', sunPower: 3.4, clouds: 0.42, hemi: 0.6 });
    const L = app.hero.info.length;
    app.rig.orbit({ target: () => app.hero.pos, lookHeight: L * 0.36, dist: L * 2.1, az: 148, el: 7, minDist: L * 1.1, maxDist: L * 3.6, fov: 40, autoRotate: 1.2, idleDelay: 8 });
    app.rig.flyTo(null, 1.8);

    const root = h('div', { class: 'va' });
    this.root = root;
    const top = h('div', { class: 'va-top' });
    const cap = captainButton(app, root);
    this.cap = cap;
    this.modes = modeSwitch(app);
    const cta = ctaButton(app, 'В море', () => this.depart());
    top.append(cap, h('div', { class: 'va-launch' }, cta, this.modes), h('div'));
    const doors = h('nav', { class: 'va-doors', 'aria-label': 'Гавань' }, DOORS.map((d) => h('span', { class: d.on ? 'on' : '' }, d.name, d.on ? '' : h('span', { class: 'soon', text: 'скоро' }))));

    this.slots = h('div', { class: 'va-slots' });
    this.voice = h('div', { class: 'v-line', text: BOATSWAIN[0] });
    const left = h('div', { class: 'va-left' },
      h('div', { class: 'va-h' }, h('span', { text: 'Компания' }), this.count = h('span')),
      this.slots,
      h('div', { class: 'va-voice' }, h('div', {}, h('div', { class: 'v-who', text: 'Боцман' }), this.voice)));
    this._renderSlots();

    this.roleEl = h('div', { class: 'va-role' });
    this.nameEl = h('h1', { class: 'va-name' });
    this.gunsEl = h('p', { class: 'va-guns' });
    this.stats = statBlock();
    this.ammo = h('div', { class: 'chip-row' });
    const right = h('section', { class: 'va-right', 'aria-label': 'Корабль' }, this.roleEl, this.nameEl, this.gunsEl, this.stats, this.ammo);

    const fleet = h('div', { class: 'va-fleet' });
    const { off } = fleetCards(app, fleet, (id) => this.pick(id));
    this.offs.push(off);
    fleet.append(h('div', { class: 'slot-free', text: 'Свободное место у причала' }));
    const fleetWrap = h('div', { class: 'va-fleet-wrap' },
      h('div', { class: 'va-fleet-head' }, h('span', { class: 'va-h', text: 'Флот · 7 из 8 мест' }), h('span', { class: 'va-h', text: '' })),
      fleet);
    this.hint = h('div', { class: 'va-hint passthrough', text: 'Тяни мышью — осмотреть корабль · колесо — ближе' });

    root.append(top, doors, left, right, fleetWrap, this.hint);
    document.getElementById('ui').append(root);
    this._showShip(app.state.shipId);

    this.offs.push(app.on((ev, data) => {
      if (ev === 'hero') this._showShip(data.id);
      if (ev === 'captain') this._renderSlots();
    }));
    let vi = 0;
    this.timers.push(setInterval(() => {
      vi = (vi + 1) % BOATSWAIN.length;
      this.voice.style.opacity = '0';
      this.timers.push(setTimeout(() => { this.voice.textContent = BOATSWAIN[vi]; this.voice.style.opacity = '1'; }, 600));
    }, 9000));
    const hideHint = () => { this.hint.style.opacity = '0'; };
    app.renderer.domElement.addEventListener('pointerdown', hideHint, { once: true });
  }


  _showShip(id) {
    const info = shipInfo(id);
    this.roleEl.textContent = info.role;
    this.nameEl.textContent = info.name;
    this.gunsEl.textContent = `${info.guns} · людей ${info.stats.crew}`;
    this.stats.set(id);
    this.ammo.replaceChildren(...info.ammo.map((a) => h('span', { class: 'chip', text: a })));
    const L = info.length;
    const o = this.app.rig.orbitOpts;
    if (o) {
      o.lookHeight = L * 0.36;
      o.minDist = L * 1.1;
      o.maxDist = L * 3.6;
      this.app.rig.orbitState.targetDist = L * 2.1;
    }
  }

  _renderSlots() {
    const app = this.app;
    const me = h('div', { class: 'va-slot' }, pennantSvg(app.state.captain.flag),
      h('div', {}, h('div', { class: 's-name', text: app.state.captain.name }), h('div', { class: 's-ship', text: shipInfo(app.state.shipId).name })),
      h('span', { class: 'ready', text: 'готов' }));
    const rows = [me];
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
    this.count.textContent = `${1 + app.state.friends.filter(Boolean).length} / 4`;
  }

  async invite(i) {
    const app = this.app;
    app.audio.tick('press');
    const used = new Set(app.state.friends.filter(Boolean).map((f) => f.name));
    const pick = FRIENDS.find((f) => !used.has(f.name));
    if (!pick) return;
    const f = { ...pick, ready: false };
    app.state.friends[i] = f;
    this._renderSlots();
    this.modes.querySelectorAll('button')[1].click();
    const ship = await app.placeFriend(i + 1, f.ship, f.flag);
    f.shipObj = ship;
    app.audio.play('cry_1.ogg', -20, 1.05);
    this.timers.push(setTimeout(() => { f.ready = true; this._renderSlots(); app.audio.play('creak_2.ogg', -16); }, 9000));
  }

  async pick(id) {
    if (id === this.app.state.shipId) return;
    this.app.audio.play('creak_0.ogg', -14, 1.1);
    await this.app.placeHero(id);
    this._renderSlots();
  }

  depart() {
    this.root.style.transition = 'opacity 0.6s';
    this.root.style.opacity = '0';
    this.root.style.pointerEvents = 'none';
    this.app.departure.start({ mode: this.app.state.mode, title: 'Поднять якорь!' });
  }

  exit() {
    this.offs.forEach((f) => f());
    this.timers.forEach((t) => { clearInterval(t); clearTimeout(t); });
    this.cap?.dispose();
    this.root?.remove();
  }

  update() {}
}
