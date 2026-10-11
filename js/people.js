import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const models = new Map();
const clips = new Map();

function load(url) {
  return new Promise((res, rej) => loader.load(url, res, undefined, rej));
}

export function loadPerson(role) {
  if (!models.has(role)) {
    models.set(role, load(`assets/characters/meshy/${role}/${role}.glb`).then((g) => {
      g.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          o.frustumCulled = false;
        }
      });
      return g.scene;
    }));
  }
  return models.get(role);
}

export function loadClip(name) {
  if (!clips.has(name)) {
    clips.set(name, load(`assets/characters/meshy/anim/${name}.glb`).then((g) => {
      return g.animations[0] || null;
    }));
  }
  return clips.get(name);
}

export class Person {
  constructor(template, clip, opts = {}) {
    this.root = SkeletonUtils.clone(template);
    this.root.scale.setScalar(opts.scale ?? 1);
    this.mixer = new THREE.AnimationMixer(this.root);
    if (clip) {
      const a = this.mixer.clipAction(clip);
      a.play();
      a.time = Math.random() * clip.duration;
      a.timeScale = 0.85 + Math.random() * 0.3;
    }
    this.root.position.set(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0);
    this.root.rotation.y = opts.ry ?? 0;
  }

  update(dt) {
    this.mixer.update(dt);
  }
}

export async function spawnPeople(scene, list) {
  const out = [];
  for (const p of list) {
    try {
      const [tpl, clip] = await Promise.all([loadPerson(p.role), loadClip(p.clip || 'idle')]);
      const person = new Person(tpl, clip, p);
      (p.parent || scene).add(person.root);
      out.push(person);
    } catch (e) {
      console.warn('человек не загрузился', p.role, e);
    }
  }
  return out;
}
