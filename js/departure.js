import * as THREE from 'three';

const MODE_TEXT = {
  alone: 'Одному — бой с ботами',
  friends: 'С друзьями — компания выходит вместе',
  range: 'Полигон — мишени у берега',
};

export class Departure {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.t = 0;
  }

  start(opts = {}) {
    const app = this.app;
    const ship = app.hero;
    if (!ship || this.active) return;
    this.active = true;
    this.t = 0;
    this.opts = opts;
    this.ship = ship;
    this.startPos = ship.pos.clone();
    this.startHeading = ship.heading;
    this.followers = app.ships.filter((s) => s !== ship && !s.arrive);
    this.followers.forEach((f, i) => { f._dep = { pos: f.pos.clone(), heading: f.heading, delay: 1.2 + i * 0.7 }; });
    app.audio.play('sail_flap.ogg', -10);
    app.audio.play(`cry_${Math.floor(Math.random() * 3)}.ogg`, -16, 0.95);
    setTimeout(() => app.audio.play('creak_1.ogg', -12, 0.8), 600);
    setTimeout(() => app.audio.play('wash_slow.ogg', -14), 1800);
    const camStart = { pos: app.rig.pos.clone(), look: app.rig.look.clone(), fov: app.rig.fov };
    const L = ship.info.length;
    app.rig.follow((dt) => {
      const k = Math.min(this.t / 3.2, 1);
      const e = k * k * (3 - 2 * k);
      const f = ship.forward();
      const chasePos = ship.pos.clone().addScaledVector(f, -L * 1.55).add(new THREE.Vector3(-f.z * L * 0.55, L * 0.42, f.x * L * 0.55));
      const chaseLook = ship.pos.clone().addScaledVector(f, L * 0.9).add(new THREE.Vector3(0, L * 0.25, 0));
      return {
        pos: camStart.pos.clone().lerp(chasePos, e),
        look: camStart.look.clone().lerp(chaseLook, e),
        fov: THREE.MathUtils.lerp(camStart.fov, 48, e),
        shift: 0,
      };
    });
    const cap = document.getElementById('caption');
    cap.querySelector('.cap-title').textContent = opts.title || 'Поднять якорь!';
    cap.querySelector('.cap-sub').textContent = MODE_TEXT[opts.mode] || '';
    cap.classList.add('show');
    setTimeout(() => cap.classList.remove('show'), 3200);
  }

  update(dt, t) {
    if (!this.active) return;
    this.t += dt;
    const ship = this.ship;
    ship.setSails(Math.min(this.t / 2.6, 1));
    const sp = THREE.MathUtils.clamp((this.t - 1.0) / 4.5, 0, 1);
    ship.speed = sp * sp * 7.5;
    ship.heel = sp * 0.06;
    ship.heading = this.startHeading + Math.sin(Math.min(this.t / 9, 1) * Math.PI * 0.5) * 18;
    const f = ship.forward();
    this.app.sea.setWake(0, ship.pos.x + f.x * ship.info.length * 0.45, ship.pos.z + f.z * ship.info.length * 0.45, ship.info.beam * 0.7, sp * 0.9);
    this.app.sea.setWake(1, ship.pos.x - f.x * ship.info.length * 0.6, ship.pos.z - f.z * ship.info.length * 0.6, ship.info.beam * 1.2, sp * 0.7);
    this.app.sea.setWake(2, ship.pos.x - f.x * ship.info.length * 1.3, ship.pos.z - f.z * ship.info.length * 1.3, ship.info.beam * 1.6, sp * 0.45);
    for (const fl of this.followers) {
      const d = fl._dep;
      const tt = this.t - d.delay;
      if (tt <= 0) continue;
      fl.setSails(Math.min(tt / 2.6, 1));
      const s2 = THREE.MathUtils.clamp((tt - 1) / 4.5, 0, 1);
      fl.speed = s2 * s2 * 7.2;
      fl.heel = s2 * 0.06;
    }
    const fade = document.getElementById('fade');
    if (this.t > 7.2) fade.style.opacity = String(Math.min((this.t - 7.2) / 1.1, 1));
    if (this.t > 8.6 && !this.ended) {
      this.ended = true;
      document.getElementById('endcard').hidden = false;
      document.getElementById('endcard').querySelector('.end-mode').textContent = MODE_TEXT[this.opts.mode] || '';
    }
  }

  reset() {
    if (!this.active) return;
    const ship = this.ship;
    ship.pos.copy(this.startPos);
    ship.heading = this.startHeading;
    ship.speed = 0;
    ship.heel = 0;
    ship.setSails(0);
    for (const fl of this.followers) {
      fl.pos.copy(fl._dep.pos);
      fl.heading = fl._dep.heading;
      fl.speed = 0;
      fl.heel = 0;
      fl.setSails(0);
    }
    for (let i = 0; i < 3; i++) this.app.sea.setWake(i, 0, 0, 1, 0);
    this.active = false;
    this.ended = false;
    document.getElementById('endcard').hidden = true;
    const fade = document.getElementById('fade');
    fade.style.transition = 'opacity 1.2s ease';
    requestAnimationFrame(() => { fade.style.opacity = '0'; });
    setTimeout(() => { fade.style.transition = ''; }, 1300);
  }
}
