import * as THREE from 'three';
import { Sea, waveHeight } from './sea.js';
import { Harbor, Gulls, landHeight } from './world.js';
import { CATALOG, EXTRA, loadShip, Ship, shipInfo, renderThumb } from './ships.js';
import { spawnPeople } from './people.js';
import { Audio } from './audio.js';
import { CameraRig } from './camera.js';
import { Departure } from './departure.js';
import { VariantA } from './variant_a.js';
import { VariantB } from './variant_b.js';
import { VariantC } from './variant_c.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.25, 9000);
camera.position.set(60, 12, -10);

const loading = document.getElementById('loading');
const bar = loading.querySelector('.load-bar i');
const loadNote = loading.querySelector('.load-note');
let loaded = 0, total = 1;
THREE.DefaultLoadingManager.onProgress = (_url, l, t) => {
  loaded = l;
  total = t;
  bar.style.width = `${Math.round((l / Math.max(t, 1)) * 100)}%`;
};

const sea = new Sea(scene, renderer);
const harbor = new Harbor(scene);
const gulls = new Gulls(scene, new THREE.Vector3(10, 0, -60), 18);
const audio = new Audio();

const state = {
  shipId: 'corvette',
  captain: { name: 'agulaliev', flag: '#BF140F' },
  mode: 'alone',
  friends: [],
};
try {
  const saved = JSON.parse(localStorage.getItem('broadside-proto') || '{}');
  Object.assign(state, saved.state || {});
} catch (e) { /* без сохранения */ }

function save() {
  try { localStorage.setItem('broadside-proto', JSON.stringify({ state: { shipId: state.shipId, captain: state.captain }, variant: app.variantId })); } catch (e) { /* без сохранения */ }
}

const app = {
  THREE, renderer, scene, camera, sea, harbor, gulls, audio, state, save,
  ships: [], hero: null, people: [], npc: [], thumbs: new Map(), listeners: new Set(),
  variantId: 'A',
  rig: null,
  departure: null,
  time: 0,
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit(ev, data) { for (const fn of this.listeners) fn(ev, data); },
};
window.app = app;
app.rig = new CameraRig(app);
app.departure = new Departure(app);

async function placeHero(id) {
  const info = shipInfo(id);
  const template = await loadShip(id);
  const berth = harbor.berth(0, info.beam);
  const old = app.hero;
  const ship = new Ship(id, template, { x: berth.x, z: berth.z, heading: berth.heading, swing: 0.4, flagColor: state.captain.flag });
  scene.add(ship.root);
  if (old) {
    scene.remove(old.root);
    app.ships = app.ships.filter((s) => s !== old);
  }
  app.hero = ship;
  app.ships.push(ship);
  state.shipId = id;
  save();
  app.emit('hero', ship);
  return ship;
}
app.placeHero = placeHero;

async function placeFriend(slot, id, flag) {
  const info = shipInfo(id);
  const template = await loadShip(id);
  const berth = harbor.berth(slot, info.beam);
  const ship = new Ship(id, template, { x: berth.x, z: berth.z + 120, heading: berth.heading, swing: 0.4, flagColor: flag });
  ship.arrive = { from: berth.z + 120, to: berth.z, t: 0 };
  ship.setSails(0.6);
  scene.add(ship.root);
  app.ships.push(ship);
  return ship;
}
app.placeFriend = placeFriend;

async function placeNpc() {
  const list = [
    { id: 'merchant', x: -95, z: 110, heading: 250 },
    { id: 'merchant', x: 210, z: 150, heading: 240 },
    { id: 'brig', x: 150, z: 30, heading: 255 },
    { id: 'fishing_boat', x: 60, z: 70, heading: 90, sail: true, loop: { cx: 40, cz: 60, r: 70, w: 0.012 } },
    { id: 'fishing_boat', x: -170, z: 30, heading: 250, sail: true, loop: { cx: -120, cz: 20, r: 55, w: -0.016 } },
    { id: 'galleon', x: 280, z: 300, heading: 260 },
  ];
  for (const n of list) {
    const template = await loadShip(n.id);
    const s = new Ship(n.id, template, { x: n.x, z: n.z, heading: n.heading, swing: 2.5, flagColor: shipInfo(n.id).pennant });
    if (n.sail) s.setSails(1);
    s.loop = n.loop ? { ...n.loop, a: Math.atan2(n.z - n.loop.cz, n.x - n.loop.cx) } : null;
    scene.add(s.root);
    app.npc.push(s);
  }
}

async function placePeople() {
  const p = harbor.places.pier;
  const y = p.deckY + 0.09;
  const list = [
    { role: 'boatswain', x: p.x + 2.2, y, z: -58, ry: 1.9, clip: 'idle' },
    { role: 'sailor_old', x: p.x + 1.4, y, z: -70, ry: 1.2, clip: 'idle_02' },
    { role: 'sailor_young', x: p.x - 1.2, y, z: -82, ry: -0.6, clip: 'idle_3' },
    { role: 'gunner', x: p.x - 2.0, y, z: -96, ry: 0.4, clip: 'idle_4' },
    { role: 'navigator', x: 38, z: -136, ry: 2.6, clip: 'idle_5', ground: true },
    { role: 'surgeon', x: 46, z: -139, ry: -2.2, clip: 'idle', ground: true },
    { role: 'marine', x: -30, z: -136, ry: 3.0, clip: 'idle_3', ground: true },
  ];
  for (const l of list) if (l.ground) l.y = landHeight(l.x, l.z);
  app.people = await spawnPeople(scene, list);
}

const VARIANTS = { A: VariantA, B: VariantB, C: VariantC };
let current = null;

async function setVariant(id) {
  app.departure.reset();
  if (current) current.exit();
  document.getElementById('fade').style.opacity = '0';
  app.variantId = id;
  save();
  document.querySelectorAll('[data-variant]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.variant === id)));
  current = new VARIANTS[id](app);
  app.current = current;
  await current.enter();
}
app.setVariant = setVariant;

app.setLight = ({ el, az, dusk, exposure, zenith, horizon, sun, sunPower, clouds, hemi }) => {
  const u = sea.uniforms;
  if (zenith) u.uZenith.value.set(zenith);
  if (horizon) u.uHorizon.value.set(horizon);
  if (sun) u.uSunColor.value.set(sun);
  if (clouds !== undefined) u.uCloudCover.value = clouds;
  sea.setSun(el, az);
  sea.updateEnvironment();
  sea.sun.intensity = sunPower ?? 1.2 + Math.min(el, 20) * 0.16;
  if (hemi) sea.hemi.intensity = hemi;
  harbor.setDusk(dusk);
  renderer.toneMappingExposure = exposure;
};

document.getElementById('back-harbor').addEventListener('click', () => {
  audio.tick('press');
  app.departure.reset();
  setVariant(app.variantId);
});

const aboutBtn = document.getElementById('about-btn');
const about = document.getElementById('about');
aboutBtn.addEventListener('click', () => {
  about.hidden = !about.hidden;
  aboutBtn.setAttribute('aria-expanded', String(!about.hidden));
});

document.querySelectorAll('[data-variant]').forEach((b) => b.addEventListener('click', () => {
  audio.tick('press');
  setVariant(b.dataset.variant);
}));
window.addEventListener('keydown', (e) => {
  if (e.target.closest('input')) return;
  if (e.key === '1') setVariant('A');
  if (e.key === '2') setVariant('B');
  if (e.key === '3') setVariant('C');
  if (e.key === 'f' || e.key === 'F') document.getElementById('fps').hidden = !document.getElementById('fps').hidden;
});

const soundBtn = document.getElementById('sound');
soundBtn.addEventListener('click', async () => {
  if (!audio.ctx) {
    await audio.start();
    soundBtn.setAttribute('aria-pressed', 'true');
    soundBtn.querySelector('span').textContent = 'Звук включён';
  } else {
    const on = soundBtn.getAttribute('aria-pressed') !== 'true';
    audio.setVolume(on ? 1 : 0);
    soundBtn.setAttribute('aria-pressed', String(on));
    soundBtn.querySelector('span').textContent = on ? 'Звук включён' : 'Звук выключен';
  }
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const fpsEl = document.getElementById('fps');
let frames = 0, fpsT = 0;
const clock = new THREE.Clock();

function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  app.time += dt;
  const t = app.time;
  for (const s of app.ships) {
    if (s.arrive) {
      s.arrive.t = Math.min(s.arrive.t + dt / 9, 1);
      const e = 1 - Math.pow(1 - s.arrive.t, 3);
      s.pos.z = THREE.MathUtils.lerp(s.arrive.from, s.arrive.to, e);
      s.setSails(0.6 * (1 - Math.min(s.arrive.t * 1.6, 1)));
      if (s.arrive.t >= 1) s.arrive = null;
    }
    s.update(dt, t);
  }
  for (const s of app.npc) {
    if (s.loop) {
      s.loop.a += s.loop.w * dt;
      s.pos.set(s.loop.cx + Math.cos(s.loop.a) * s.loop.r, 0, s.loop.cz + Math.sin(s.loop.a) * s.loop.r);
      const tx = -Math.sin(s.loop.a) * Math.sign(s.loop.w), tz = Math.cos(s.loop.a) * Math.sign(s.loop.w);
      s.heading = THREE.MathUtils.radToDeg(Math.atan2(tx, -tz));
      s.swing = 0;
    }
    s.update(dt, t);
  }
  for (const p of app.people) p.update(dt);
  app.departure.update(dt, t);
  current?.update(dt, t);
  app.rig.update(dt, t);
  sea.update(dt, camera, app.hero ? app.hero.pos : null);
  harbor.update(dt, t, renderer);
  gulls.update(dt, t);
  renderer.render(scene, camera);
  frames++;
  fpsT += dt;
  if (fpsT > 0.5) {
    fpsEl.textContent = `${Math.round(frames / fpsT)} к/с · ${renderer.info.render.calls} вызовов`;
    frames = 0;
    fpsT = 0;
  }
  requestAnimationFrame(loop);
}

async function boot() {
  loadNote.textContent = 'Поднимаем гавань…';
  await placeHero(CATALOG.some((c) => c.id === state.shipId) ? state.shipId : 'corvette');
  loadNote.textContent = 'Швартуем корабли…';
  await Promise.all([placeNpc(), placePeople()]);
  let variant = 'A';
  try { variant = JSON.parse(localStorage.getItem('broadside-proto') || '{}').variant || 'A'; } catch (e) { /* */ }
  if (location.hash === '#B' || location.hash === '#C' || location.hash === '#A') variant = location.hash.slice(1);
  await setVariant(variant);
  if (app.rig.fly) {
    app.rig.fly.resolve();
    app.rig.fly = null;
  }
  requestAnimationFrame(loop);
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 1200);
  for (const c of CATALOG) {
    try {
      app.thumbs.set(c.id, await renderThumb(c.id));
      app.emit('thumb', c.id);
    } catch (e) {
      console.warn('снимок', c.id, e);
    }
  }
}

boot().catch((e) => {
  console.error(e);
  loadNote.textContent = 'Не загрузилось: ' + e.message;
});
