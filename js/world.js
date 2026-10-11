import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TEX = 'assets/ships/textures/';
const texLoader = new THREE.TextureLoader();

function tex(name, srgb, repeat = 1) {
  const t = texLoader.load(TEX + name);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
function fbm(x, z, oct = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, z * f); f *= 2.03; a *= 0.5; }
  return s;
}
const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };

export function shoreZ(x) {
  return -112 + 10 * Math.sin(x / 70) + 6 * Math.sin(x / 23 + 1.3);
}

export function landHeight(x, z) {
  const sz = shoreZ(x);
  const main = smooth(0, 26, sz - z);
  const dW = Math.hypot((x + 330) / 135, (z - 10) / 210);
  const west = smooth(1.05, 0.8, dW);
  const dE = Math.hypot((x - 280) / 72, (z + 55) / 86);
  const east = smooth(1.05, 0.78, dE);
  const mask = Math.max(main, west, east);
  const back = Math.max(0, (sz - z) - 40);
  let h = 2.2 + Math.min(back, 400) * 0.16 * smooth(0, 120, back) + fbm(x * 0.012, z * 0.012) * 55 * smooth(30, 260, back);
  const town = smooth(10, 0, Math.abs(x - 10) / 18 - 6) * smooth(130, 40, back);
  h = h * (1 - town * 0.75) + 3.0 * town * 0.75;
  h += west * (1 - main) * (fbm(x * 0.02 + 7, z * 0.02) * 26 + 6 * smooth(0.95, 0.3, dW));
  h += east * (1 - main) * (fbm(x * 0.05, z * 0.05 + 3) * 14 + 4);
  return THREE.MathUtils.lerp(-9, h, mask) + (mask < 0.5 ? (mask - 0.5) * 6 : 0);
}

const SAND = new THREE.Color(0.78, 0.68, 0.5);
const GRASS = new THREE.Color(0.25, 0.36, 0.16);
const GRASS2 = new THREE.Color(0.36, 0.42, 0.2);
const ROCK = new THREE.Color(0.42, 0.38, 0.33);
const DIRT = new THREE.Color(0.55, 0.45, 0.32);

function buildTerrain() {
  const W = 1500, D = 1100, nx = 300, nz = 220;
  const geo = new THREE.PlaneGeometry(W, D, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -D / 2 + 300);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = landHeight(x, z);
    pos.setY(i, h);
    const slope = Math.abs(landHeight(x + 2, z) - h) + Math.abs(landHeight(x, z + 2) - h);
    if (h < 2.6) c.copy(SAND);
    else c.copy(GRASS).lerp(GRASS2, fbm(x * 0.03, z * 0.03, 3));
    if (h > 2.6 && Math.abs(x - 10) < 120 && shoreZ(x) - z < 150) c.lerp(DIRT, 0.45);
    c.lerp(ROCK, smooth(1.6, 3.2, slope));
    c.multiplyScalar(0.92 + hash2(x * 0.5, z * 0.5) * 0.16);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 });
  const u = { uTime: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = u.uTime;
    sh.vertexShader = 'varying float vH; varying vec2 vXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vH = position.y; vXZ = position.xz;');
    sh.fragmentShader = 'uniform float uTime; varying float vH; varying vec2 vXZ;\nfloat th(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\nfloat tn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(th(i), th(i+vec2(1,0)), f.x), mix(th(i+vec2(0,1)), th(i+vec2(1,1)), f.x), f.y); }\n' + sh.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float dn = tn(vXZ * 0.21) * 0.5 + tn(vXZ * 0.9) * 0.3 + tn(vXZ * 3.1) * 0.2;
      diffuseColor.rgb *= 0.78 + dn * 0.42;
      float wet = 1.0 - smoothstep(-0.2, 0.9, vH);
      diffuseColor.rgb *= 1.0 - wet * 0.35;
      float lap = 0.18 + sin(uTime * 0.9) * 0.16;
      float foam = smoothstep(0.32, 0.0, abs(vH - lap)) * 0.85;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9), foam);`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.userData.uniforms = u;
  return mesh;
}

function boxGeo(w, h, d, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}
function cylGeo(r1, r2, h, seg, x = 0, y = 0, z = 0) {
  const g = new THREE.CylinderGeometry(r1, r2, h, seg);
  g.translate(x, y, z);
  return g;
}
function roofGeo(w, d, rise, overhang = 0.5) {
  const hw = w / 2 + overhang, hd = d / 2 + overhang;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, 0);
  shape.lineTo(hw, 0);
  shape.lineTo(0, rise);
  shape.lineTo(-hw, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: hd * 2, bevelEnabled: false });
  g.translate(0, 0, -hd);
  return g.index ? g.toNonIndexed() : g;
}

function canvasTexture(w, h, draw, repeat) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  return t;
}

export class Harbor {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.dusk = 0;
    this.places = {};
    this.animated = [];
    this.lights = [];
    this._materials();
    this.terrain = buildTerrain();
    this.group.add(this.terrain);
    this._pier(0, -112, -28, true);
    this._pier(96, -108, -46, false);
    this._town();
    this._shipyard();
    this._lighthouse();
    this._fort();
    this._palms();
    this._forest();
    this._smoke();
  }

  _materials() {
    const woodMap = tex('wood_deck_basecolor_0be71492.jpg', true, 1);
    const woodN = tex('wood_deck_normal_0addb7cf.jpg', false, 1);
    const woodR = tex('wood_deck_roughness_8afaf198.jpg', false, 1);
    this.mWood = new THREE.MeshStandardMaterial({ map: woodMap, normalMap: woodN, roughnessMap: woodR, color: 0xb9a68e });
    this.mOldWood = new THREE.MeshStandardMaterial({ map: tex('wood_basecolor_e6125861.jpg', true, 1), normalMap: tex('wood_normal_3015dc71.jpg', false, 1), roughnessMap: tex('wood_roughness_b1d90a33.jpg', false, 1), color: 0x8a7a68 });
    this.mPile = new THREE.MeshStandardMaterial({ color: 0x3b3026, roughness: 0.95 });
    this.mRope = new THREE.MeshStandardMaterial({ map: tex('rope_basecolor_4469ebf7.jpg', true, 1), roughness: 0.9 });
    this.mIron = new THREE.MeshStandardMaterial({ color: 0x24272a, roughness: 0.55, metalness: 0.7 });
    this.mCanvas = new THREE.MeshStandardMaterial({ map: tex('canvas_basecolor_35888391.jpg', true, 1), roughness: 0.95, side: THREE.DoubleSide });
    const plaster = canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#d8d0c0';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        const v = 180 + Math.random() * 60;
        g.fillStyle = `rgba(${v},${v - 6},${v - 18},${0.06 + Math.random() * 0.08})`;
        g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 2 + Math.random() * 6);
      }
      g.fillStyle = 'rgba(80,60,40,0.10)';
      g.fillRect(0, h - 26, w, 26);
    });
    this.plaster = plaster;
    const tiles = canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#a24a2c';
      g.fillRect(0, 0, w, h);
      for (let row = 0; row < 16; row++) {
        for (let col = 0; col < 10; col++) {
          const x = col * 26 + (row % 2) * 13, y = row * 16;
          const v = Math.random() * 30 - 15;
          g.fillStyle = `rgb(${150 + v},${70 + v * 0.6},${44 + v * 0.4})`;
          g.beginPath();
          g.ellipse(x + 13, y + 10, 12, 9, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = 'rgba(40,15,8,0.35)';
          g.fillRect(x, y + 14, 26, 2);
        }
      }
    });
    this.tiles = tiles;
    this.windowsMat = new THREE.MeshStandardMaterial({ color: 0x1c1712, emissive: 0xffa040, emissiveIntensity: 0, roughness: 0.4 });
    this.lampMat = new THREE.MeshStandardMaterial({ color: 0x332211, emissive: 0xffb258, emissiveIntensity: 0.4 });
  }

  plasterMat(color) {
    return new THREE.MeshStandardMaterial({ map: this.plaster, color, roughness: 0.92 });
  }

  roofMat(color = 0xffffff) {
    return new THREE.MeshStandardMaterial({ map: this.tiles, color, roughness: 0.85 });
  }

  _pier(x, zStart, zEnd, main) {
    const g = new THREE.Group();
    const len = zEnd - zStart;
    const width = main ? 7 : 6;
    const deckY = 1.9;
    const planks = [];
    for (let z = zStart; z < zEnd; z += 0.9) {
      const jitter = (hash2(x, z) - 0.5) * 0.08;
      planks.push(boxGeo(width, 0.18, 0.84, x, deckY + jitter * 0.3, z + 0.45));
    }
    const deck = new THREE.Mesh(mergeGeometries(planks), this.mWood);
    deck.material = this.mWood.clone();
    deck.material.map = this.mWood.map.clone();
    deck.material.map.repeat.set(0.4, 3);
    deck.material.map.needsUpdate = true;
    deck.castShadow = deck.receiveShadow = true;
    g.add(deck);
    const piles = [];
    for (let z = zStart + 2; z <= zEnd; z += 4.2) {
      for (const s of [-1, 1]) piles.push(cylGeo(0.26, 0.3, 7, 8, x + s * (width / 2 - 0.2), deckY - 3.2, z));
    }
    const beams = [];
    beams.push(boxGeo(0.3, 0.35, len, x - width / 2 + 0.15, deckY - 0.3, zStart + len / 2));
    beams.push(boxGeo(0.3, 0.35, len, x + width / 2 - 0.15, deckY - 0.3, zStart + len / 2));
    const pm = new THREE.Mesh(mergeGeometries([...piles, ...beams]), this.mPile);
    pm.castShadow = true;
    g.add(pm);
    const bollards = [];
    for (let z = zStart + 8; z < zEnd - 2; z += 12) {
      for (const s of [-1, 1]) {
        bollards.push(cylGeo(0.22, 0.26, 0.7, 10, x + s * (width / 2 - 0.5), deckY + 0.42, z));
        bollards.push(cylGeo(0.3, 0.3, 0.1, 10, x + s * (width / 2 - 0.5), deckY + 0.8, z));
      }
    }
    const bm = new THREE.Mesh(mergeGeometries(bollards), this.mIron);
    bm.castShadow = true;
    g.add(bm);
    const r = rng(main ? 11 : 23);
    const barrels = [], crates = [];
    for (let i = 0; i < (main ? 14 : 7); i++) {
      const z = zStart + 6 + r() * (len - 14);
      const side = r() < 0.5 ? -1 : 1;
      const px = x + side * (width / 2 - 1.3 - r() * 1.2);
      if (r() < 0.55) {
        const lathe = new THREE.LatheGeometry([0, 0.42, 0.5, 0.52, 0.5, 0.42, 0].map((rad, k) => new THREE.Vector2(rad, k * 0.16)), 12);
        lathe.translate(px, deckY + 0.09, z);
        barrels.push(lathe);
        if (r() < 0.4) {
          const l2 = lathe.clone();
          l2.translate(0.95, 0, 0.2);
          barrels.push(l2);
        }
      } else {
        const s = 0.7 + r() * 0.5;
        crates.push(boxGeo(s, s, s, px, deckY + 0.09 + s / 2, z, r()));
        if (r() < 0.5) crates.push(boxGeo(s * 0.8, s * 0.8, s * 0.8, px, deckY + 0.09 + s + s * 0.4, z, r()));
      }
    }
    if (barrels.length) {
      const m = new THREE.Mesh(mergeGeometries(barrels), this.mOldWood);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    if (crates.length) {
      const m = new THREE.Mesh(mergeGeometries(crates), this.mOldWood);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    const lamps = [];
    for (let z = zStart + 10; z < zEnd; z += 20) {
      for (const s of main ? [-1, 1] : [1]) {
        const lx = x + s * (width / 2 - 0.25);
        lamps.push({ x: lx, z });
      }
    }
    const posts = [], heads = [];
    for (const l of lamps) {
      posts.push(cylGeo(0.07, 0.09, 3.2, 6, l.x, deckY + 1.6, l.z));
      heads.push(boxGeo(0.34, 0.45, 0.34, l.x, deckY + 3.35, l.z));
    }
    g.add(new THREE.Mesh(mergeGeometries(posts), this.mIron));
    const hm = new THREE.Mesh(mergeGeometries(heads), this.lampMat);
    g.add(hm);
    if (main) {
      for (const l of lamps.filter((_, i) => i % 2 === 0).slice(0, 3)) {
        const pl = new THREE.PointLight(0xffa24a, 0, 22, 1.6);
        pl.position.set(l.x, deckY + 3.3, l.z);
        g.add(pl);
        this.lights.push(pl);
      }
    }
    const coils = [];
    for (let i = 0; i < (main ? 5 : 2); i++) {
      const t = new THREE.TorusGeometry(0.42, 0.1, 6, 16);
      t.rotateX(Math.PI / 2);
      t.translate(x + (r() < 0.5 ? -1 : 1) * (width / 2 - 0.9), deckY + 0.16, zStart + 10 + r() * (len - 20));
      coils.push(t);
    }
    g.add(new THREE.Mesh(mergeGeometries(coils), this.mRope));
    this.group.add(g);
    const key = main ? 'pier' : 'pier2';
    this.places[key] = { group: g, center: new THREE.Vector3(x, deckY, (zStart + zEnd) / 2), x, width, deckY, zStart, zEnd };
  }

  berth(i, beam) {
    const p = this.places.pier, p2 = this.places.pier2;
    const off = (pier) => pier.width / 2 + beam / 2 + 1.4;
    const list = [
      { x: p.x + off(p), z: -64, heading: 180 },
      { x: p.x - off(p), z: -64, heading: 180 },
      { x: p2.x + off(p2), z: -72, heading: 180 },
      { x: p2.x - off(p2), z: -72, heading: 180 },
    ];
    return list[i];
  }

  _house(x, z, w, d, floors, color, rot, roofColor = 0xffffff) {
    const g = new THREE.Group();
    const base = landHeight(x, z);
    const h = floors * 3.3;
    const walls = new THREE.Mesh(boxGeo(w, h + 1.5, d, 0, (h - 1.5) / 2, 0), this.plasterMat(color));
    walls.material.map = this.plaster.clone();
    walls.material.map.repeat.set(w / 8, h / 8);
    walls.material.map.needsUpdate = true;
    walls.castShadow = walls.receiveShadow = true;
    g.add(walls);
    const roof = new THREE.Mesh(roofGeo(w, d, Math.min(w, d) * 0.42 + 0.6), this.roofMat(roofColor));
    roof.position.y = h;
    roof.castShadow = true;
    g.add(roof);
    const wins = [];
    for (let f = 0; f < floors; f++) {
      const y = f * 3.3 + 1.7;
      const nW = Math.max(1, Math.floor(w / 3));
      for (let k = 0; k < nW; k++) {
        const wx = -w / 2 + (k + 0.5) * (w / nW);
        wins.push(boxGeo(0.9, 1.3, 0.08, wx, y, d / 2 + 0.02));
        wins.push(boxGeo(0.9, 1.3, 0.08, wx, y, -d / 2 - 0.02));
      }
      const nD = Math.max(1, Math.floor(d / 3.5));
      for (let k = 0; k < nD; k++) {
        const wz = -d / 2 + (k + 0.5) * (d / nD);
        wins.push(boxGeo(0.08, 1.3, 0.9, w / 2 + 0.02, y, wz));
      }
    }
    const wm = new THREE.Mesh(mergeGeometries(wins), this.windowsMat);
    g.add(wm);
    const trims = [];
    trims.push(boxGeo(w + 0.3, 0.25, d + 0.3, 0, h, 0));
    if (hash2(x, z) > 0.4) trims.push(boxGeo(0.6, 2.2, 0.6, w * 0.25, h + Math.min(w, d) * 0.3 + 0.7, 0));
    const tm = new THREE.Mesh(mergeGeometries(trims), this.mOldWood);
    tm.castShadow = true;
    g.add(tm);
    g.position.set(x, base, z);
    g.rotation.y = rot;
    this.group.add(g);
    if (trims.length > 1) {
      const chim = new THREE.Vector3(w * 0.25, h + Math.min(w, d) * 0.3 + 1.9, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot).add(g.position);
      (this.chimneys ||= []).push(chim);
    }
    return g;
  }

  _town() {
    const colors = [0xf2ead8, 0xe8d6a8, 0xd9b48a, 0xc7d6d8, 0xe9c9b0, 0xf0e2c4, 0xb8c9b5, 0xe2b98f];
    const r = rng(7);
    const town = new THREE.Group();
    const tavern = this._house(-34, -146, 14, 10, 2, 0xe2c79b, 0.08, 0xd8c0a8);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshStandardMaterial({
      map: canvasTexture(256, 128, (g, w, h) => {
        g.fillStyle = '#3a2412';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = '#c99a4a';
        g.lineWidth = 6;
        g.strokeRect(6, 6, w - 12, h - 12);
        g.fillStyle = '#e8c27a';
        g.font = 'bold 52px Georgia, serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('ЯКОРЬ', w / 2, h / 2 + 2);
      }),
      side: THREE.DoubleSide,
    }));
    sign.position.set(4, 3.6, 5.4);
    tavern.add(sign);
    this.places.tavern = { group: tavern, center: tavern.position.clone().add(new THREE.Vector3(0, 6, 0)) };
    const market = new THREE.Group();
    const stripes = [['#b8352c', '#efe3c8'], ['#2f5f7a', '#efe3c8'], ['#3d6b3a', '#efe3c8'], ['#b8862c', '#efe3c8']];
    for (let i = 0; i < 6; i++) {
      const sx = 34 + (i % 3) * 9, sz = -142 - Math.floor(i / 3) * 10;
      const base = landHeight(sx, sz);
      const st = stripes[i % stripes.length];
      const awn = new THREE.MeshStandardMaterial({
        map: canvasTexture(128, 64, (g, w, h) => {
          for (let k = 0; k < 8; k++) {
            g.fillStyle = k % 2 ? st[0] : st[1];
            g.fillRect(k * 16, 0, 16, h);
          }
        }),
        side: THREE.DoubleSide,
        roughness: 0.95,
      });
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(6, 4.4, 1, 1), awn);
      roof.rotation.x = -Math.PI / 2 + 0.32;
      roof.position.set(sx, base + 3.1, sz);
      roof.castShadow = true;
      market.add(roof);
      const posts = [];
      for (const dx of [-2.8, 2.8]) for (const dz of [-2, 2]) posts.push(cylGeo(0.08, 0.08, dz < 0 ? 3.6 : 2.6, 6, sx + dx, base + (dz < 0 ? 1.8 : 1.3), sz + dz));
      posts.push(boxGeo(5, 1, 1.6, sx, base + 0.5, sz + 0.6));
      const pm = new THREE.Mesh(mergeGeometries(posts), this.mOldWood);
      pm.castShadow = true;
      market.add(pm);
      const goods = [];
      for (let k = 0; k < 5; k++) goods.push(new THREE.SphereGeometry(0.22, 8, 6).translate(sx - 2 + k * 1, base + 1.15, sz + 0.5));
      const gm = new THREE.Mesh(mergeGeometries(goods), new THREE.MeshStandardMaterial({ color: [0xd8a030, 0x9a2e20, 0x6c8a2a, 0xc86a22][i % 4], roughness: 0.6 }));
      market.add(gm);
    }
    this.group.add(market);
    this.places.market = { group: market, center: new THREE.Vector3(43, landHeight(43, -147) + 5, -147) };
    const wh = this._house(140, -132, 26, 12, 1, 0xcfc2a8, -0.05, 0xc89880);
    this.places.warehouse = { group: wh, center: wh.position.clone().add(new THREE.Vector3(0, 5, 0)) };
    const spots = [];
    for (let i = 0; i < 46; i++) {
      const x = -190 + r() * 380;
      const z = shoreZ(x) - 34 - r() * (i < 20 ? 70 : 170);
      if (Math.abs(x + 34) < 14 && z > -160) continue;
      if (x > 25 && x < 70 && z > -165) continue;
      if (x > 120 && x < 165 && z > -145) continue;
      if (x < -140) continue;
      if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 15)) continue;
      spots.push({ x, z });
    }
    for (const s of spots) {
      const w = 7 + r() * 6, d = 6 + r() * 4;
      const floors = r() < 0.35 ? 2 : 1;
      const g = this._house(s.x, s.z, w, d, floors, colors[Math.floor(r() * colors.length)], (r() - 0.5) * 0.5, r() < 0.3 ? 0xd9b8a0 : 0xffffff);
      town.add(g);
    }
    const tower = this._house(-6, -212, 8, 8, 4, 0xf0e6d0, 0, 0xc07050);
    const bell = new THREE.Mesh(cylGeo(0.1, 0.1, 6, 6, 0, 18, 0), this.mIron);
    tower.add(bell);
    this.places.town = { group: town, center: new THREE.Vector3(0, 20, -200) };
  }

  _shipyard() {
    const g = new THREE.Group();
    const x = -150, z = -96;
    const base = landHeight(x, z - 20);
    const ramp = new THREE.Mesh(boxGeo(16, 0.6, 70, 0, 0, 0), this.mOldWood);
    ramp.rotation.x = 0.07;
    ramp.position.set(x, base * 0.4 - 0.8, z - 10);
    ramp.receiveShadow = true;
    g.add(ramp);
    const ribs = [];
    for (let i = 0; i < 13; i++) {
      const rz = z - 34 + i * 3.2;
      const tube = new THREE.TorusGeometry(5.2 - Math.abs(i - 6) * 0.25, 0.22, 5, 18, Math.PI);
      tube.rotateZ(Math.PI);
      tube.translate(x, 6.8 + (i * 3.2) * 0.07 * -1 + 2.5, rz);
      ribs.push(tube);
    }
    ribs.push(boxGeo(0.6, 0.6, 42, x, 1.6, z - 15));
    const ribMesh = new THREE.Mesh(mergeGeometries(ribs), this.mOldWood);
    ribMesh.rotation.x = 0;
    ribMesh.castShadow = true;
    g.add(ribMesh);
    const sc = [];
    for (let i = 0; i < 7; i++) {
      for (const s of [-1, 1]) sc.push(cylGeo(0.12, 0.12, 13, 5, x + s * 7.5, 6.5, z - 34 + i * 6.2));
    }
    for (let k = 1; k < 4; k++) for (const s of [-1, 1]) sc.push(boxGeo(0.25, 0.25, 40, x + s * 7.5, k * 3.3, z - 16));
    g.add(new THREE.Mesh(mergeGeometries(sc), this.mPile));
    const shear = [];
    shear.push(cylGeo(0.25, 0.32, 22, 6, 0, 11, 0).rotateZ(0.18).translate(x + 13, 0, z - 40));
    shear.push(cylGeo(0.25, 0.32, 22, 6, 0, 11, 0).rotateZ(-0.18).translate(x + 5, 0, z - 40));
    g.add(new THREE.Mesh(mergeGeometries(shear), this.mOldWood));
    const shed = this._house(x - 22, z - 40, 16, 10, 1, 0xb59b7c, 0.02, 0xa08070);
    g.add(shed);
    this.group.add(g);
    this.places.shipyard = { group: g, center: new THREE.Vector3(x, 8, z - 18) };
  }

  _lighthouse() {
    const g = new THREE.Group();
    const x = 292, z = -56;
    const base = landHeight(x, z);
    const parts = [];
    for (let i = 0; i < 6; i++) parts.push({ geo: cylGeo(2.8 - i * 0.18, 2.8 - (i + 1) * 0.18, 4, 18, 0, 2 + i * 4, 0), red: i % 2 === 1 });
    const white = new THREE.MeshStandardMaterial({ map: this.plaster, color: 0xf3efe6, roughness: 0.8 });
    const red = new THREE.MeshStandardMaterial({ color: 0xa8302a, roughness: 0.75 });
    g.add(new THREE.Mesh(mergeGeometries(parts.filter((p) => !p.red).map((p) => p.geo)), white));
    g.add(new THREE.Mesh(mergeGeometries(parts.filter((p) => p.red).map((p) => p.geo)), red));
    g.children.forEach((m) => { m.castShadow = true; });
    const gallery = new THREE.Mesh(cylGeo(2.6, 2.6, 0.35, 18, 0, 24.2, 0), this.mIron);
    g.add(gallery);
    this.lampRoom = new THREE.Mesh(cylGeo(1.3, 1.3, 2.4, 12, 0, 25.6, 0), new THREE.MeshStandardMaterial({ color: 0x332c22, emissive: 0xffd28a, emissiveIntensity: 0.6, roughness: 0.2 }));
    g.add(this.lampRoom);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.8, 12).translate(0, 27.7, 0), red);
    g.add(cap);
    const beamGeo = new THREE.ConeGeometry(9, 140, 24, 1, true);
    beamGeo.translate(0, -70, 0);
    beamGeo.rotateZ(Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.beam = new THREE.Mesh(beamGeo, beamMat);
    this.beam.position.y = 25.6;
    g.add(this.beam);
    const house = this._house(x - 9, z + 6, 7, 6, 1, 0xf0e8da, 0.3, 0xc06048);
    house.position.y = landHeight(x - 9, z + 6);
    g.position.set(x, base, z);
    this.group.add(g);
    this.places.lighthouse = { group: g, center: new THREE.Vector3(x, base + 16, z) };
  }

  _fort() {
    const g = new THREE.Group();
    const cx = -330, cz = 40;
    const base = landHeight(cx, cz);
    const stone = new THREE.MeshStandardMaterial({ map: this.plaster, color: 0xa9a08e, roughness: 0.95 });
    const walls = [];
    const R = 26, n = 5;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3;
      pts.push(new THREE.Vector2(Math.cos(a) * R, Math.sin(a) * R));
    }
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const len = a.distanceTo(b);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      walls.push(boxGeo(len, 6, 3, 0, 3, 0).rotateY(-ang).translate(mid.x, 0, mid.y));
      walls.push(boxGeo(6, 7, 6, 0, 3.5, 0).rotateY(-ang + 0.785).translate(a.x, 0, a.y));
      for (let k = 0; k < len / 2.4; k++) {
        const t = (k + 0.5) / (len / 2.4);
        const p = a.clone().lerp(b, t);
        walls.push(boxGeo(1.1, 1, 3.1, 0, 6.5, 0).rotateY(-ang).translate(p.x, 0, p.y));
      }
    }
    const wm = new THREE.Mesh(mergeGeometries(walls), stone);
    wm.castShadow = wm.receiveShadow = true;
    g.add(wm);
    const guns = [];
    for (let i = 0; i < 6; i++) {
      const a = 0.6 + i * 0.35;
      const p = new THREE.Vector3(Math.cos(a) * (R - 3), 6.4, Math.sin(a) * (R - 3));
      const barrel = cylGeo(0.22, 0.32, 3, 8, 0, 0, 0).rotateZ(Math.PI / 2).rotateY(-a).translate(p.x, p.y, p.z);
      guns.push(barrel);
    }
    g.add(new THREE.Mesh(mergeGeometries(guns), this.mIron));
    const pole = new THREE.Mesh(cylGeo(0.12, 0.15, 16, 6, 0, 8, 0), this.mOldWood);
    g.add(pole);
    const flagGeo = new THREE.PlaneGeometry(5, 3.2, 12, 1).translate(2.5, 14.2, 0);
    this.fortFlag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: 0xc0201a, side: THREE.DoubleSide }));
    this.fortFlagBase = flagGeo.attributes.position.array.slice();
    g.add(this.fortFlag);
    const keep = this._house(cx + 2, cz - 4, 10, 10, 2, 0xb7ad98, 0.3, 0x9a7060);
    keep.position.y = base + 2;
    g.position.set(cx, base, cz);
    this.group.add(g);
    this.places.fort = { group: g, center: new THREE.Vector3(cx, base + 8, cz) };
  }

  _palms() {
    const r = rng(31);
    const trunks = [], leaves = [];
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f6a2a, roughness: 0.8, side: THREE.DoubleSide });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b5338, roughness: 0.95 });
    let placed = 0;
    for (let i = 0; i < 160 && placed < 46; i++) {
      const x = -320 + r() * 650;
      const z = shoreZ(x) - 4 - r() * 26;
      const h = landHeight(x, z);
      if (h < 1.2 || h > 9) continue;
      if (Math.abs(x) < 6 || Math.abs(x - 96) < 6 || (x > -175 && x < -125)) continue;
      placed++;
      const height = 7 + r() * 6;
      const lean = (r() - 0.5) * 0.5;
      const segs = 6;
      let px = x, py = h, pz = z;
      const dirA = r() * Math.PI * 2;
      for (let s = 0; s < segs; s++) {
        const t = new THREE.CylinderGeometry(0.2 - s * 0.015, 0.24 - s * 0.015, height / segs, 6);
        const bend = lean * (s / segs) * 2.2;
        t.rotateZ(bend);
        t.rotateY(dirA);
        const dx = Math.sin(bend) * (height / segs);
        t.translate(px - Math.cos(dirA) * dx * 0.5, py + height / segs / 2, pz + Math.sin(dirA) * dx * 0.5);
        trunks.push(t);
        px -= Math.cos(dirA) * dx;
        pz += Math.sin(dirA) * dx;
        py += height / segs;
      }
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + r();
        const leaf = new THREE.PlaneGeometry(4.2, 0.9, 6, 1);
        const p = leaf.attributes.position;
        for (let v = 0; v < p.count; v++) {
          const lx = p.getX(v) + 2.1;
          p.setX(v, lx);
          p.setY(v, p.getY(v) * (1 - lx / 4.6) - lx * lx * 0.07);
        }
        leaf.rotateX(-Math.PI / 2 + 0.25);
        leaf.rotateY(a);
        leaf.translate(px, py + 0.1, pz);
        leaves.push(leaf);
      }
    }
    const tm = new THREE.Mesh(mergeGeometries(trunks), trunkMat);
    tm.castShadow = true;
    const lm = new THREE.Mesh(mergeGeometries(leaves), leafMat);
    lm.castShadow = true;
    this.group.add(tm, lm);
    this.palmLeaves = lm;
  }

  _forest() {
    const r = rng(77);
    const crown = new THREE.IcosahedronGeometry(1, 1);
    crown.scale(2.4, 3.4, 2.4);
    crown.translate(0, 5.2, 0);
    const trunk = new THREE.CylinderGeometry(0.22, 0.32, 3.2, 5);
    trunk.translate(0, 1.6, 0);
    const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 1 });
    const spots = [];
    const avoid = [[-150, -96, 45], [292, -56, 40], [-330, 40, 55], [10, -150, 150]];
    for (let i = 0; i < 9000 && spots.length < 2600; i++) {
      const x = -720 + r() * 1440, z = -790 + r() * 900;
      const h = landHeight(x, z);
      if (h < 4.5) continue;
      if (avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar)) continue;
      const slope = Math.abs(landHeight(x + 3, z) - h) + Math.abs(landHeight(x, z + 3) - h);
      if (slope > 4.5) continue;
      const dens = fbm(x * 0.008 + 3, z * 0.008, 3);
      if (dens < 0.42 + r() * 0.2) continue;
      spots.push({ x, z, h, s: 0.7 + r() * 0.8, ry: r() * 6.28, c: r() });
    }
    const cm = new THREE.InstancedMesh(crown, crownMat, spots.length);
    const tm = new THREE.InstancedMesh(trunk, trunkMat, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    const dark = new THREE.Color(0.13, 0.22, 0.1), light = new THREE.Color(0.3, 0.4, 0.16), autumn = new THREE.Color(0.42, 0.36, 0.14);
    spots.forEach((p, i) => {
      q.setFromEuler(e.set(0, p.ry, 0));
      m.compose(new THREE.Vector3(p.x, p.h - 0.3, p.z), q, new THREE.Vector3(p.s, p.s * (0.85 + p.c * 0.4), p.s));
      cm.setMatrixAt(i, m);
      tm.setMatrixAt(i, m);
      col.copy(dark).lerp(light, p.c);
      if (p.c > 0.86) col.lerp(autumn, 0.6);
      cm.setColorAt(i, col);
    });
    cm.instanceMatrix.needsUpdate = true;
    tm.instanceMatrix.needsUpdate = true;
    cm.receiveShadow = true;
    this.group.add(cm, tm);
  }

  _smoke() {
    const pts = this.chimneys || [];
    const per = 14;
    const geo = new THREE.BufferGeometry();
    const n = pts.length * per;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const c = pts[Math.floor(i / per)];
      pos.set([c.x, c.y, c.z], i * 3);
      seed[i] = (i % per) / per;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.smokeU = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(0.9, -0.35) }, uPx: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.smokeU,
      transparent: true,
      depthWrite: false,
      vertexShader: `attribute float seed; uniform float uTime; uniform vec2 uWind; uniform float uPx; varying float vA;
        void main(){ float life = fract(seed + uTime*0.06); vec3 p = position + vec3(uWind.x*life*22.0, life*16.0, uWind.y*life*22.0);
        vA = (1.0-life)*smoothstep(0.0,0.12,life)*0.32; vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv;
        gl_PointSize = (2.0 + life*9.0) * uPx * 300.0 / -mv.z; }`,
      fragmentShader: `varying float vA; void main(){ vec2 d = gl_PointCoord-0.5; float a = smoothstep(0.5,0.0,length(d))*vA; gl_FragColor = vec4(vec3(0.72,0.7,0.68), a); }`,
    });
    this.smoke = new THREE.Points(geo, mat);
    this.smoke.frustumCulled = false;
    this.group.add(this.smoke);
  }

  setDusk(k) {
    this.dusk = k;
    this.windowsMat.emissiveIntensity = k * 2.2;
    this.lampMat.emissiveIntensity = 0.3 + k * 3.5;
    for (const l of this.lights) l.intensity = k * 18;
    this.beam.material.opacity = k * 0.14;
    this.lampRoom.material.emissiveIntensity = 0.6 + k * 4;
  }

  update(dt, t, renderer) {
    this.terrain.userData.uniforms.uTime.value = t;
    if (this.smokeU) {
      this.smokeU.uTime.value = t;
      this.smokeU.uPx.value = renderer.getPixelRatio();
    }
    this.beam.rotation.y = t * 0.45;
    const p = this.fortFlag.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const bx = this.fortFlagBase[i * 3], by = this.fortFlagBase[i * 3 + 1];
      const u = bx / 5;
      p.setXYZ(i, bx, by, Math.sin(u * 6 - t * 6) * u * 0.5);
    }
    p.needsUpdate = true;
  }
}

export class Gulls {
  constructor(scene, center, count = 16) {
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, -0.9, 0.1, -0.1, 0, 0, -0.25, 0, 0, 0.25, 0.9, 0.1, -0.1, 0, 0, -0.25], 3));
    wing.computeVertexNormals();
    this.mesh = new THREE.InstancedMesh(wing, new THREE.MeshStandardMaterial({ color: 0xe8e6e0, side: THREE.DoubleSide, roughness: 0.8 }), count);
    this.birds = [];
    const r = rng(5);
    for (let i = 0; i < count; i++) {
      this.birds.push({ r: 30 + r() * 110, h: 16 + r() * 34, w: (0.12 + r() * 0.12) * (r() < 0.5 ? 1 : -1), a: r() * 6.28, cx: center.x + (r() - 0.5) * 80, cz: center.z + (r() - 0.5) * 60, flap: r() * 10, s: 1.6 + r() * 0.6 });
    }
    this.dummy = new THREE.Object3D();
    this.wingL = new THREE.Matrix4();
    scene.add(this.mesh);
  }

  update(dt, t) {
    this.birds.forEach((b, i) => {
      b.a += b.w * dt;
      const x = b.cx + Math.cos(b.a) * b.r, z = b.cz + Math.sin(b.a) * b.r;
      const y = b.h + Math.sin(t * 0.5 + i) * 2;
      this.dummy.position.set(x, y, z);
      const tangent = Math.atan2(-Math.sin(b.a) * Math.sign(b.w), Math.cos(b.a) * Math.sign(b.w));
      this.dummy.rotation.set(0, -tangent, Math.sign(b.w) * 0.35);
      const flap = Math.sin(t * 7 + b.flap);
      this.dummy.scale.set(b.s, b.s * (0.4 + Math.max(flap, -0.6) * 0.9), b.s);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
