import * as THREE from 'three';

const G = 9.81;

// Волны гавани: зыбь 118° (λ 160 м, 4 составляющих ±12°) и мелкая ветровая волна; амплитуды как у игры при amplitude_scale 0.3.
function buildWaves() {
  const waves = [];
  const swellDir = 118;
  for (let i = 0; i < 4; i++) {
    const across = (i / 3) * 2 - 1;
    waves.push({ dir: swellDir + 12 * across, len: 160 * (0.9 + 0.07 * i), amp: 0.42 / 2, q: 0.35, phase: i * 2.1 });
  }
  const wind = 70;
  const lens = [42, 27, 18, 12.5, 8.6, 6.1, 4.4, 3.1];
  lens.forEach((len, i) => {
    const spread = ((i * 0.618) % 1) * 2 - 1;
    waves.push({ dir: wind + spread * 38, len, amp: 0.011 * len * 0.55, q: 0.55, phase: i * 1.7 + 0.4 });
  });
  for (const w of waves) {
    const rad = THREE.MathUtils.degToRad(w.dir);
    w.dx = Math.sin(rad);
    w.dz = -Math.cos(rad);
    w.k = (2 * Math.PI) / w.len;
    w.w = Math.sqrt(G * w.k);
  }
  return waves;
}

export const WAVES = buildWaves();

export function waveHeight(x, z, t) {
  let ox = x, oz = z;
  for (let pass = 0; pass < 2; pass++) {
    let dx = 0, dz = 0;
    for (const w of WAVES) {
      const th = w.k * (w.dx * ox + w.dz * oz) - w.w * t + w.phase;
      const c = Math.cos(th) * w.q * w.amp;
      dx += w.dx * c;
      dz += w.dz * c;
    }
    ox = x - dx;
    oz = z - dz;
  }
  let h = 0;
  for (const w of WAVES) h += w.amp * Math.sin(w.k * (w.dx * ox + w.dz * oz) - w.w * t + w.phase);
  return h;
}

export const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform float uTime;
uniform float uCloudCover;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
  return s;
}
vec3 skyColor(vec3 dir, bool withClouds) {
  float y = dir.y;
  float h = clamp(y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.38));
  float sunAmt = max(dot(dir, uSunDir), 0.0);
  col += uSunColor * (pow(sunAmt, 6.0) * 0.35 + pow(sunAmt, 64.0) * 0.6);
  float hb = exp(-abs(y) * 14.0);
  col = mix(col, uHorizon * 1.05 + uSunColor * 0.12 * pow(sunAmt, 3.0), hb * 0.65);
  if (y < 0.0) col = mix(col, uGround, clamp(-y * 3.0, 0.0, 1.0));
  if (withClouds && y > 0.01) {
    vec2 uv = dir.xz / (y + 0.08) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
    float n = fbm(uv * 0.9);
    float c = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.32, n);
    float lit = pow(max(dot(normalize(vec3(dir.x, 0.3, dir.z)), uSunDir), 0.0), 2.0);
    vec3 cloudCol = mix(uHorizon * 0.55 + uZenith * 0.25, uSunColor * 1.1 + vec3(0.25, 0.12, 0.08), lit * 0.8 + 0.1);
    float fade = smoothstep(0.01, 0.18, y);
    col = mix(col, cloudCol, c * fade * 0.85);
  }
  return col;
}
`;

export class Sea {
  constructor(scene, renderer, opts = {}) {
    this.scene = scene;
    this.renderer = renderer;
    this.time = 0;
    this.sunElevation = opts.sunElevation ?? 12;
    this.sunAzimuth = opts.sunAzimuth ?? 285;
    this.uniforms = {
      uSunDir: { value: new THREE.Vector3() },
      uSunColor: { value: new THREE.Color('#FFC78C') },
      uZenith: { value: new THREE.Color('#385C9E') },
      uHorizon: { value: new THREE.Color('#FABD85') },
      uGround: { value: new THREE.Color('#081421') },
      uTime: { value: 0 },
      uCloudCover: { value: 0.35 },
      uCamPos: { value: new THREE.Vector3() },
      uDeep: { value: new THREE.Color('#020F1D') },
      uShallow: { value: new THREE.Color('#0A3345') },
      uScatter: { value: new THREE.Color('#086661') },
      uFogDist: { value: 2600 },
      uWaveA: { value: [] },
      uWaveB: { value: [] },
      uWakes: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    };
    for (const w of WAVES) {
      this.uniforms.uWaveA.value.push(new THREE.Vector4(w.dx, w.dz, w.k, w.w));
      this.uniforms.uWaveB.value.push(new THREE.Vector4(w.amp, w.q, w.phase, 0));
    }
    this.setSun(this.sunElevation, this.sunAzimuth);
    this._buildSky();
    this._buildWater();
    this.sun = new THREE.DirectionalLight(0xffc78c, 3.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    const sc = this.sun.shadow.camera;
    sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 600;
    this.sunTarget = new THREE.Object3D();
    this.sun.target = this.sunTarget;
    scene.add(this.sun, this.sunTarget);
    this.hemi = new THREE.HemisphereLight(0x8fa6c4, 0x1a2a30, 0.45);
    scene.add(this.hemi);
    this.updateEnvironment();
  }

  setSun(elevation, azimuth) {
    this.sunElevation = elevation;
    this.sunAzimuth = azimuth;
    const el = THREE.MathUtils.degToRad(elevation);
    const az = THREE.MathUtils.degToRad(azimuth);
    this.sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    this.uniforms.uSunDir.value.copy(this.sunDir);
  }

  _buildSky() {
    const geo = new THREE.SphereGeometry(5000, 48, 24);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
          vec4 p = projectionMatrix * viewMatrix * vec4((modelMatrix * vec4(position, 1.0)).xyz, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: SKY_GLSL + /* glsl */ `
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          vec3 c = skyColor(d, true);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
  }

  _buildWater() {
    const rings = 150, segs = 192;
    const pos = [], idx = [];
    pos.push(0, 0, 0);
    let r = 0.6;
    const radii = [];
    for (let i = 0; i < rings; i++) {
      radii.push(r);
      r *= 1.055;
      r += 0.35;
    }
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        pos.push(Math.cos(a) * radii[i], 0, Math.sin(a) * radii[i]);
      }
    }
    for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
    for (let i = 0; i < rings - 1; i++) {
      for (let j = 0; j < segs; j++) {
        const a = 1 + i * segs + j, b = 1 + i * segs + ((j + 1) % segs);
        const c = 1 + (i + 1) * segs + j, d = 1 + (i + 1) * segs + ((j + 1) % segs);
        idx.push(a, b, c, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const n = WAVES.length;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        #define NW ${n}
        uniform vec4 uWaveA[NW];
        uniform vec4 uWaveB[NW];
        uniform float uTime;
        uniform vec3 uCamPos;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        varying float vCrest;
        void main() {
          vec3 p = position + vec3(uCamPos.x, 0.0, uCamPos.z);
          float dist = length(position.xz);
          float fade = 1.0 - smoothstep(600.0, 2200.0, dist);
          vec3 disp = vec3(0.0);
          vec3 nrm = vec3(0.0, 1.0, 0.0);
          float crest = 0.0;
          for (int i = 0; i < NW; i++) {
            vec4 A = uWaveA[i];
            vec4 B = uWaveB[i];
            float amp = B.x * fade;
            float th = A.z * dot(A.xy, p.xz) - A.w * uTime + B.z;
            float s = sin(th), c = cos(th);
            disp.x += A.x * B.y * amp * c;
            disp.z += A.y * B.y * amp * c;
            disp.y += amp * s;
            nrm.x -= A.x * A.z * amp * c;
            nrm.z -= A.y * A.z * amp * c;
            nrm.y -= B.y * A.z * amp * s;
            crest += B.y * A.z * amp * s;
          }
          vec3 world = p + disp;
          vWorld = world;
          vNormalW = normalize(nrm);
          vCrest = crest;
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }`,
      fragmentShader: SKY_GLSL + /* glsl */ `
        uniform vec3 uCamPos;
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uScatter;
        uniform float uFogDist;
        uniform vec4 uWakes[8];
        varying vec3 vWorld;
        varying vec3 vNormalW;
        varying float vCrest;
        vec2 ripple(vec2 p, float t, float fp) {
          vec2 g = vec2(0.0);
          float a = 0.05;
          vec2 d = vec2(0.8, 0.6);
          float k = 1.6;
          for (int i = 0; i < 6; i++) {
            float th = k * dot(d, p) - sqrt(9.81 * k) * t + float(i) * 1.7;
            g += d * k * a * cos(th) * (1.0 - smoothstep(0.25, 1.1, k * fp));
            d = vec2(d.x * 0.6 - d.y * 0.8, d.x * 0.8 + d.y * 0.6);
            k *= 1.55;
            a *= 0.62;
          }
          return g;
        }
        void main() {
          vec3 V = normalize(uCamPos - vWorld);
          float dist = length(uCamPos - vWorld);
          float fp = length(fwidth(vWorld.xz));
          vec2 rg = ripple(vWorld.xz, uTime, fp) * (1.0 - smoothstep(30.0, 420.0, dist));
          vec3 N = normalize(vNormalW + vec3(-rg.x, 0.0, -rg.y) * 0.6);
          float ndv = max(dot(N, V), 0.0);
          float F = min(0.02 + 0.98 * pow(1.0 - ndv, 5.0), 0.72);
          vec3 R = reflect(-V, N);
          R.y = abs(R.y);
          vec3 refl = skyColor(normalize(R), false) * 0.78;
          float facing = pow(1.0 - ndv, 1.4);
          vec3 body = mix(uShallow, uDeep, clamp(facing * 1.2, 0.0, 1.0));
          float sss = pow(max(dot(V, -uSunDir) * 0.5 + 0.5, 0.0), 4.0) * clamp(vCrest * 3.0 + 0.35, 0.0, 1.0);
          body += uScatter * uSunColor * sss * 0.9;
          vec3 col = mix(body, refl, F);
          float spec = pow(max(dot(R, uSunDir), 0.0), 900.0) * 18.0 + pow(max(dot(R, uSunDir), 0.0), 90.0) * 0.6;
          col += uSunColor * spec;
          float foam = smoothstep(0.42, 0.75, vCrest + vnoise(vWorld.xz * 0.35) * 0.25);
          for (int i = 0; i < 8; i++) {
            vec4 w = uWakes[i];
            if (w.w <= 0.0) continue;
            float d = length(vWorld.xz - w.xy);
            float ring = exp(-d * d / (w.z * w.z));
            foam += ring * w.w * smoothstep(0.35, 0.8, vnoise(vWorld.xz * 1.3 + uTime * 0.3));
          }
          col = mix(col, vec3(0.86, 0.88, 0.86), clamp(foam, 0.0, 1.0) * 0.7);
          vec3 fogDir = normalize(vWorld - uCamPos);
          vec3 horizon = skyColor(normalize(vec3(fogDir.x, 0.02, fogDir.z)), false);
          float fogA = 1.0 - exp(-pow(dist / uFogDist, 1.6));
          col = mix(col, horizon, clamp(fogA, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.water = new THREE.Mesh(geo, mat);
    this.water.frustumCulled = false;
    this.water.receiveShadow = false;
    this.scene.add(this.water);
  }

  updateEnvironment() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
      fragmentShader: SKY_GLSL + `varying vec3 vDir; void main(){ vec3 d = normalize(vDir); vec3 c = skyColor(d, false); if (d.y < 0.0) c = mix(c, vec3(0.03,0.08,0.1), clamp(-d.y*4.0,0.0,1.0)); gl_FragColor = vec4(c,1.0);} `,
    });
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat));
    if (this.envRT) this.envRT.dispose();
    this.envRT = pm.fromScene(envScene, 0.02);
    this.scene.environment = this.envRT.texture;
    pm.dispose();
    this.sun.color.copy(this.uniforms.uSunColor.value);
  }

  setWake(i, x, z, radius, strength) {
    this.uniforms.uWakes.value[i].set(x, z, radius, strength);
  }

  update(dt, camera, focus) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    this.uniforms.uCamPos.value.copy(camera.position);
    this.sky.position.copy(camera.position);
    const f = focus || camera.position;
    this.sunTarget.position.set(f.x, 0, f.z);
    this.sun.position.copy(this.sunTarget.position).addScaledVector(this.sunDir, 300);
  }
}
