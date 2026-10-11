import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { waveHeight } from './sea.js';

export const CATALOG = [
  { id: 'brig', name: 'Бриг', role: 'на все руки', length: 32, beam: 8.5, wl: 0.6, hull: '#0B0A09', stripe: '#9E4C0B', pennant: '#BF140F',
    stats: { speed: 13.9, turn: 16, salvo: 42, hullHp: 72, range: 416, crew: 90 }, guns: '7 длинных 6-фунтовых на борт', ammo: ['ядра', 'книппели', 'двойные'] },
  { id: 'sloop', name: 'Шлюп', role: 'разведчик', length: 20, beam: 6, wl: 0.5, hull: '#291A0E', stripe: '#183321', pennant: '#1A1A1A',
    stats: { speed: 15.6, turn: 12, salvo: 30, hullHp: 36, range: 415, crew: 60 }, guns: '5 длинных 6-фунтовых на борт', ammo: ['ядра', 'книппели', 'картечь'] },
  { id: 'brigantine', name: 'Бригантина', role: 'налётчик', length: 26, beam: 7.5, wl: 0.54, hull: '#21150B', stripe: '#5C100B', pennant: '#BF140F',
    stats: { speed: 15.0, turn: 15, salvo: 39, hullHp: 58, range: 416, crew: 100 }, guns: '6 длинных 6-фунтовых и 3 вертлюжные', ammo: ['ядра', 'картечь', 'книппели'] },
  { id: 'corvette', name: 'Корвет', role: 'охотник', length: 30, beam: 8.5, wl: 0.6, hull: '#090808', stripe: '#8A1209', pennant: '#BF140F',
    stats: { speed: 14.0, turn: 16, salvo: 60, hullHp: 95, range: 416, crew: 140 }, guns: '10 длинных 6-фунтовых и 2 погонные', ammo: ['ядра', 'книппели', 'двойные'] },
  { id: 'frigate', name: 'Фрегат', role: 'громила', length: 38, beam: 10, wl: 0.9, hull: '#070C12', stripe: '#BD6E1F', pennant: '#BF140F',
    stats: { speed: 14.7, turn: 19, salvo: 312, hullHp: 134, range: 258, crew: 250 }, guns: '13 каронад 24 фн на борт', ammo: ['ядра', 'двойные', 'картечь'] },
  { id: 'galleon', name: 'Галеон', role: 'крепость', length: 45, beam: 12, wl: 1.3, hull: '#0A0705', stripe: '#490905', pennant: '#D9B21A',
    stats: { speed: 10.4, turn: 23, salvo: 108, hullHp: 280, range: 422, crew: 300 }, guns: '6 × 12 фн и 6 × 6 фн на борт', ammo: ['ядра', 'двойные', 'картечь'] },
  { id: 'ship_of_line', name: 'Линейный корабль', short: 'Линейный', role: 'линкор', length: 50, beam: 14, wl: 1.9, hull: '#08080A', stripe: '#BD6E1F', pennant: '#BF140F',
    stats: { speed: 10.9, turn: 27, salvo: 396, hullHp: 232, range: 412, crew: 650 }, guns: '21 орудие на борт, три палубы', ammo: ['ядра', 'книппели', 'двойные'] },
];

export const EXTRA = {
  merchant: { id: 'merchant', name: 'Торговец', length: 30, beam: 9, wl: 0.8, hull: '#1B110A', stripe: '#0E2B17', pennant: '#1F45A8' },
  fishing_boat: { id: 'fishing_boat', name: 'Рыбак', length: 11, beam: 3.8, wl: 0.2, hull: '#1F577A', stripe: '#D1C9A6', pennant: '#EBD633' },
};

export const STAT_MAX = { speed: 16, turn: 30, salvo: 400, hullHp: 280, range: 430 };

export function shipInfo(id) {
  return CATALOG.find((s) => s.id === id) || EXTRA[id];
}

const loader = new GLTFLoader();
const cache = new Map();

export function loadShip(id, onProgress) {
  if (!cache.has(id)) {
    cache.set(id, new Promise((resolve, reject) => {
      loader.load(`assets/ships/${id}/${id}.glb`, (gltf) => resolve(prepare(gltf.scene, shipInfo(id))), (e) => onProgress?.(e), reject);
    }));
  }
  return cache.get(id);
}

function prepare(root, info) {
  const hide = [];
  const tinted = new Map();
  root.traverse((o) => {
    const n = o.name || '';
    if (/_broken$/.test(n) || /^debris_/.test(n) || o.userData?.initially_visible === false) hide.push(o);
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const out = mats.map((m) => {
        const key = m.uuid;
        if (tinted.has(key)) return tinted.get(key);
        const c = m.clone();
        c.envMapIntensity = 0.8;
        const mn = (m.name || '').toLowerCase();
        if (mn.startsWith('paint_hull') && info.hull) c.color.set(info.hull);
        if (mn.startsWith('paint_stripe') && info.stripe) c.color.set(info.stripe);
        if (/sail|canvas|cloth/.test(mn)) { c.color.set('#EDE6D1'); c.side = THREE.DoubleSide; }
        tinted.set(key, c);
        return c;
      });
      o.material = Array.isArray(o.material) ? out : out[0];
    }
  });
  for (const o of hide) o.visible = false;
  return root;
}

function sailSets(model) {
  const set = [], furled = [];
  model.traverse((o) => {
    const n = o.name || '';
    if (!n.startsWith('sail_')) return;
    if (n.startsWith('sail_furled')) furled.push(o);
    else if (o.parent && !(o.parent.name || '').startsWith('sail_')) set.push(o);
  });
  set.sort((a, b) => sailOrder(a.name) - sailOrder(b.name));
  return { set, furled };
}

function sailOrder(name) {
  const m = name.match(/^sail_(\d+)_(\d+)/);
  if (m) {
    const j = +m[2];
    return (j === 1 ? 0 : j === 0 ? 10 : 20 + j) + +m[1] * 0.1;
  }
  return 30;
}

export class Ship {
  constructor(id, template, opts = {}) {
    this.id = id;
    this.info = shipInfo(id);
    this.root = new THREE.Group();
    this.model = template.clone(true);
    this.model.position.y = -this.info.wl;
    this.root.add(this.model);
    this.sails = sailSets(this.model);
    this.sailAmount = 0;
    this.setSails(0);
    this.heading = opts.heading ?? 0;
    this.pos = new THREE.Vector3(opts.x ?? 0, 0, opts.z ?? 0);
    this.speed = 0;
    this.heel = 0;
    this.bob = { heave: 0, pitch: 0, roll: 0 };
    this.swing = opts.swing ?? 1.5;
    this.swingPhase = Math.random() * 10;
    this.flag = this._addPennant(opts.flagColor ?? '#c0201a');
    this._box = new THREE.Box3().setFromObject(this.model);
    this.update(0, 0);
  }

  _addPennant(color) {
    let top = null;
    this.model.updateMatrixWorld(true);
    const box = new THREE.Box3();
    this.model.traverse((o) => {
      if (o.isMesh && /^mast_/.test(o.name)) {
        box.setFromObject(o);
        if (!top || box.max.y > top.y) top = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
      }
    });
    if (!top) {
      box.setFromObject(this.model);
      top = new THREE.Vector3(0, box.max.y, 0);
    }
    const len = Math.max(2.2, this.info.length * 0.16);
    const geo = new THREE.PlaneGeometry(len, len * 0.16, 16, 1);
    geo.translate(len / 2, 0, 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / len;
      pos.setY(i, pos.getY(i) * (1 - x * 0.92));
    }
    const uniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uLen: { value: len } };
    const mat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.85 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uniforms.uTime;
      sh.uniforms.uLen = uniforms.uLen;
      sh.vertexShader = 'uniform float uTime; uniform float uLen;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        float u = position.x / uLen;
        transformed.z += sin(u * 9.0 - uTime * 7.0) * u * uLen * 0.07;
        transformed.y += sin(u * 5.0 - uTime * 5.0) * u * uLen * 0.03;`);
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(top).add(new THREE.Vector3(0, 0.15, 0));
    mesh.castShadow = true;
    const holder = new THREE.Group();
    holder.position.copy(mesh.position);
    mesh.position.set(0, 0, 0);
    holder.add(mesh);
    holder.rotation.y = Math.PI / 2;
    this.model.add(holder);
    return { holder, mat, uniforms };
  }

  setFlagColor(c) {
    this.flag.mat.color.set(c);
  }

  setSails(a) {
    this.sailAmount = a;
    const n = this.sails.set.length;
    this.sails.set.forEach((s, i) => {
      const start = (i / Math.max(n, 1)) * 0.55;
      const k = THREE.MathUtils.clamp((a - start) / 0.45, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      s.visible = e > 0.01;
      s.scale.set(1, Math.max(e, 0.001), 1);
    });
    for (const f of this.sails.furled) f.visible = a < 0.35;
    if (!this.sails.furled.length && a < 0.01) for (const s of this.sails.set) { s.visible = true; s.scale.y = 0.08; }
  }

  forward() {
    const h = THREE.MathUtils.degToRad(this.heading);
    return new THREE.Vector3(Math.sin(h), 0, -Math.cos(h));
  }

  update(dt, t) {
    const f = this.forward();
    if (this.speed > 0) this.pos.addScaledVector(f, this.speed * dt);
    const L = this.info.length * 0.42, B = Math.max(2, this.info.length * 0.12);
    const side = new THREE.Vector3(-f.z, 0, f.x);
    const hb = waveHeight(this.pos.x + f.x * L, this.pos.z + f.z * L, t);
    const hs = waveHeight(this.pos.x - f.x * L, this.pos.z - f.z * L, t);
    const hp = waveHeight(this.pos.x - side.x * B, this.pos.z - side.z * B, t);
    const hr = waveHeight(this.pos.x + side.x * B, this.pos.z + side.z * B, t);
    const heave = (hb + hs + hp + hr) / 4;
    const pitch = Math.atan2(hb - hs, 2 * L);
    const roll = Math.atan2(hr - hp, 2 * B);
    const k = dt > 0 ? 1 - Math.exp(-dt * 2.2) : 1;
    this.bob.heave += (heave - this.bob.heave) * k;
    this.bob.pitch += (pitch - this.bob.pitch) * k;
    this.bob.roll += (roll - this.bob.roll) * k;
    const swing = Math.sin(t * 0.11 + this.swingPhase) * this.swing;
    this.root.position.set(this.pos.x, this.bob.heave - this.speed * 0.012, this.pos.z);
    this.root.rotation.order = 'YXZ';
    this.root.rotation.y = -THREE.MathUtils.degToRad(this.heading + swing);
    this.root.rotation.x = this.bob.pitch * 0.8 + this.speed * 0.0025;
    this.root.rotation.z = -this.bob.roll * 0.8 - this.heel;
    this.flag.uniforms.uTime.value = t;
  }

  size() {
    return this._box;
  }
}

let thumbRenderer = null;
let thumbEnv = null;

export async function renderThumb(id, w = 320, h = 180) {
  const template = await loadShip(id);
  const info = shipInfo(id);
  if (!thumbRenderer) {
    thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    thumbRenderer.setPixelRatio(1);
    thumbRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    thumbRenderer.toneMappingExposure = 1.05;
    thumbRenderer.localClippingEnabled = true;
    const pm = new THREE.PMREMGenerator(thumbRenderer);
    thumbEnv = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
  }
  thumbRenderer.setSize(w * 2, h * 2, false);
  const s = new Ship(id, template, { heading: 0, swing: 0 });
  s.setSails(1);
  s.root.position.set(0, 0, 0);
  s.root.rotation.set(0, -2.3, 0);
  const holder = new THREE.Scene();
  holder.environment = thumbEnv;
  holder.environmentIntensity = 0.55;
  const key = new THREE.DirectionalLight(0xffd6a8, 2.4);
  key.position.set(-30, 22, 25);
  const rim = new THREE.DirectionalLight(0x8fb0ff, 1.2);
  rim.position.set(25, 12, -35);
  holder.add(key, rim, s.root);
  const box = new THREE.Box3().setFromObject(s.root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  center.y = Math.max(center.y, size.y * 0.42);
  const cam = new THREE.PerspectiveCamera(24, w / h, 0.5, 800);
  const dist = Math.max(size.y * 2.05, info.length * 1.55);
  cam.position.set(center.x + dist * 0.74, center.y + dist * 0.16, center.z + dist * 0.67);
  cam.lookAt(center);
  thumbRenderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.05)];
  thumbRenderer.setClearColor(0x000000, 0);
  thumbRenderer.render(holder, cam);
  return thumbRenderer.domElement.toDataURL('image/png');
}
