import * as THREE from 'three';
import { waveHeight } from './sea.js';

const ease = (x) => x * x * (3 - 2 * x);

export class CameraRig {
  constructor(app) {
    this.app = app;
    this.cam = app.camera;
    this.mode = 'none';
    this.pos = new THREE.Vector3().copy(this.cam.position);
    this.look = new THREE.Vector3();
    this.fov = 42;
    this.shift = 0;
    this.shake = 0.12;
    this.orbitState = { az: 220, el: 9, dist: 60, targetDist: 60, vaz: 0, vel: 0, idle: 0, dragging: false };
    this.fly = null;
    this.parallax = new THREE.Vector2();
    this.mouse = new THREE.Vector2();
    this._bind();
  }

  _bind() {
    const el = this.app.renderer.domElement;
    let last = null;
    el.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'orbit' || !this.orbitOpts?.drag) return;
      last = { x: e.clientX, y: e.clientY };
      this.orbitState.dragging = true;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
    });
    el.addEventListener('pointermove', (e) => {
      this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
      if (!last) return;
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      this.orbitState.vaz = -dx * 0.18;
      this.orbitState.vel = dy * 0.08;
      this.orbitState.az += this.orbitState.vaz;
      this.orbitState.el = THREE.MathUtils.clamp(this.orbitState.el + this.orbitState.vel, 2, 38);
      this.orbitState.idle = 0;
    });
    const up = (e) => {
      if (!last) return;
      last = null;
      this.orbitState.dragging = false;
      el.style.cursor = '';
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => {
      if (this.mode !== 'orbit' || !this.orbitOpts?.zoom) return;
      e.preventDefault();
      const o = this.orbitOpts;
      this.orbitState.targetDist = THREE.MathUtils.clamp(this.orbitState.targetDist * (1 + e.deltaY * 0.0012), o.minDist, o.maxDist);
      this.orbitState.idle = 0;
    }, { passive: false });
  }

  orbit(opts) {
    this.mode = 'orbit';
    this.orbitOpts = { drag: true, zoom: true, autoRotate: 2.2, idleDelay: 6, minDist: 25, maxDist: 140, fov: 40, shift: 0, lookHeight: 6, ...opts };
    if (opts.az !== undefined) this.orbitState.az = opts.az;
    if (opts.el !== undefined) this.orbitState.el = opts.el;
    if (opts.dist !== undefined) this.orbitState.dist = this.orbitState.targetDist = opts.dist;
    this.orbitState.idle = 0;
  }

  shots(list, opts = {}) {
    this.mode = 'shots';
    this.shotList = list;
    this.shotIndex = 0;
    this.shotT = 0;
    this.shotOpts = { fade: true, ...opts };
  }

  follow(fn) {
    this.mode = 'follow';
    this.followFn = fn;
  }

  flyTo(pose, duration = 1.6) {
    if (this.fly) this.fly.resolve();
    return new Promise((resolve) => {
      this.fly = { from: { pos: this.pos.clone(), look: this.look.clone(), fov: this.fov }, to: pose, t: 0, d: duration, resolve };
    });
  }

  hold(pose, opts = {}) {
    this.mode = 'hold';
    this.holdPose = pose;
    this.holdOpts = { parallax: 0, ...opts };
  }

  _target() {
    const o = this.orbitOpts;
    const t = typeof o.target === 'function' ? o.target() : o.target;
    return t;
  }

  update(dt, t) {
    let pos = new THREE.Vector3(), look = new THREE.Vector3(), fov = this.fov, shift = this.shift;
    if (this.mode === 'orbit') {
      const o = this.orbitOpts, s = this.orbitState;
      s.idle += dt;
      if (!s.dragging) {
        s.vaz *= Math.exp(-dt * 3);
        s.az += s.vaz * dt * 8;
        if (s.idle > o.idleDelay && o.autoRotate) s.az += o.autoRotate * dt * Math.min((s.idle - o.idleDelay) / 3, 1);
      }
      s.dist += (s.targetDist - s.dist) * (1 - Math.exp(-dt * 5));
      const target = this._target();
      const az = THREE.MathUtils.degToRad(s.az), el = THREE.MathUtils.degToRad(s.el);
      look.copy(target).add(new THREE.Vector3(0, o.lookHeight, 0));
      pos.set(look.x + Math.sin(az) * Math.cos(el) * s.dist, look.y + Math.sin(el) * s.dist, look.z - Math.cos(az) * Math.cos(el) * s.dist);
      fov = o.fov;
      shift = o.shift;
    } else if (this.mode === 'shots') {
      const shot = this.shotList[this.shotIndex];
      this.shotT += dt;
      const p = Math.min(this.shotT / shot.duration, 1);
      const e = THREE.MathUtils.lerp(p, ease(p), 0.6);
      const a = shot.pose(0), b = shot.pose(1);
      pos.lerpVectors(a.pos, b.pos, e);
      look.lerpVectors(a.look, b.look, e);
      fov = THREE.MathUtils.lerp(a.fov ?? 40, b.fov ?? 40, e);
      shift = shot.shift ?? 0;
      const fadeEl = document.getElementById('fade');
      if (this.shotOpts.fade && fadeEl) {
        const out = shot.duration - this.shotT;
        const k = this.shotT < 0.45 ? 1 - this.shotT / 0.45 : out < 0.35 ? 1 - out / 0.35 : 0;
        fadeEl.style.opacity = String(Math.max(0, Math.min(k, 1)) * 0.92);
      }
      if (p >= 1) {
        this.shotIndex = (this.shotIndex + 1) % this.shotList.length;
        this.shotT = 0;
      }
    } else if (this.mode === 'follow') {
      const r = this.followFn(dt, t);
      pos.copy(r.pos);
      look.copy(r.look);
      fov = r.fov ?? fov;
      shift = r.shift ?? 0;
    } else if (this.mode === 'hold') {
      const h = this.holdPose;
      pos.copy(h.pos);
      look.copy(h.look);
      fov = h.fov ?? fov;
      shift = h.shift ?? 0;
      if (this.holdOpts.parallax) {
        this.parallax.lerp(this.mouse, 1 - Math.exp(-dt * 2.5));
        const dir = new THREE.Vector3().subVectors(look, pos);
        const right = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
        pos.addScaledVector(right, this.parallax.x * this.holdOpts.parallax);
        pos.y -= this.parallax.y * this.holdOpts.parallax * 0.4;
      }
    } else {
      pos.copy(this.pos);
      look.copy(this.look);
    }
    if (this.fly) {
      const f = this.fly;
      f.t += dt / f.d;
      const e = ease(Math.min(f.t, 1));
      const to = f.to || { pos: pos.clone(), look: look.clone(), fov };
      const arc = Math.sin(Math.PI * Math.min(f.t, 1)) * (to.arc ?? 0);
      pos = new THREE.Vector3().lerpVectors(f.from.pos, to.pos, e);
      pos.y += arc;
      look = new THREE.Vector3().lerpVectors(f.from.look, to.look, e);
      fov = THREE.MathUtils.lerp(f.from.fov, to.fov ?? f.from.fov, e);
      if (f.t >= 1) {
        this.fly = null;
        f.resolve();
      }
    }
    const minY = waveHeight(pos.x, pos.z, t) + 1.6;
    if (pos.y < minY) pos.y = minY;
    this.pos.copy(pos);
    this.look.copy(look);
    this.fov = fov;
    this.shift += (shift - this.shift) * (1 - Math.exp(-dt * 4));
    const sh = this.shake;
    this.cam.position.copy(pos).add(new THREE.Vector3(Math.sin(t * 0.7) * sh, Math.sin(t * 1.1 + 1.3) * sh, Math.sin(t * 0.9 + 2.1) * sh));
    this.cam.lookAt(look);
    this.cam.rotateZ(THREE.MathUtils.degToRad(0.2 * Math.sin(t * 1.3 + 2)));
    if (Math.abs(this.cam.fov - fov) > 0.01) {
      this.cam.fov = fov;
    }
    const w = window.innerWidth, h = window.innerHeight;
    if (Math.abs(this.shift) > 0.001) this.cam.setViewOffset(w, h, -this.shift * w, 0, w, h);
    else this.cam.clearViewOffset();
    this.cam.updateProjectionMatrix();
  }
}

export function shipShot(app, { az, dist, height, look, fov = 40, duration = 12, shift = 0 }) {
  return {
    duration,
    shift,
    pose: (k) => {
      const ship = app.hero;
      const L = ship.info.length;
      const a = THREE.MathUtils.degToRad(ship.heading + THREE.MathUtils.lerp(az[0], az[1], k));
      const d = THREE.MathUtils.lerp(dist[0], dist[1], k) * L;
      const target = new THREE.Vector3(ship.pos.x, look * L, ship.pos.z);
      const pos = new THREE.Vector3(target.x + Math.sin(a) * d, THREE.MathUtils.lerp(height[0], height[1], k) * L, target.z - Math.cos(a) * d);
      return { pos, look: target, fov };
    },
  };
}

export function worldShot({ from, to, lookFrom, lookTo, fov = 40, duration = 12, shift = 0 }) {
  return {
    duration,
    shift,
    pose: (k) => ({
      pos: new THREE.Vector3().lerpVectors(from, to, k),
      look: new THREE.Vector3().lerpVectors(lookFrom, lookTo ?? lookFrom, k),
      fov,
    }),
  };
}
