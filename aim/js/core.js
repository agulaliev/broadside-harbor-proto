(function () {
'use strict';

const L = window.AimLab = window.AimLab || {};
L.W = 1600;
L.H = 900;
L.FPS = 30;
L.variants = [];
L.variantById = {};

L.register = function (variant) {
  L.variants.push(variant);
  L.variantById[variant.id] = variant;
};

L.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
L.lerp = (a, b, t) => a + (b - a) * t;
L.smooth = (a, b, x) => {
  const t = L.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

L.sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
L.add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
L.mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
L.dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
L.len = (a) => Math.sqrt(L.dot(a, a));
L.dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
L.mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Цвет — как Color в Godot: r, g, b, a от 0 до 1 в sRGB (интерфейс рисуется без перевода в линейный свет).
L.rgba = (r, g, b, a = 1) => [r, g, b, a];
L.alpha = (c, a) => [c[0], c[1], c[2], c[3] * a];
L.withA = (c, a) => [c[0], c[1], c[2], a];
L.mixColor = (a, b, t) => [L.lerp(a[0], b[0], t), L.lerp(a[1], b[1], t), L.lerp(a[2], b[2], t), L.lerp(a[3], b[3], t)];
L.hex = function (text, a = 1) {
  const h = text.replace('#', '');
  const v = (i) => parseInt(h.substr(i, 2), 16) / 255;
  return [v(0), v(2), v(4), h.length >= 8 ? v(6) : a];
};
L.toHex = (c) => '#' + [c[0], c[1], c[2]].map((v) => Math.round(L.clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('');

// Числа для игрока — как Fmt игры: запятая, «N м» с шагом 10 м, «N,N с».
L.fmt = {
  dec(v, digits = 1) {
    return v.toFixed(Math.max(digits, 0)).replace('.', ',');
  },
  distance(m) {
    const r = Math.round(Math.max(m, 0) / 10) * 10;
    return r < 1000 ? r + ' м' : L.fmt.dec(m / 1000, 1) + ' км';
  },
  metres(m) {
    return Math.round(m) + ' м';
  },
  seconds(v, digits = 0) {
    return L.fmt.dec(v, digits) + ' с';
  },
};

// Камера кадра: Camera3D.unproject_position Godot — точка в осях камеры, проекция, деление на w, ось y вниз.
class Camera {
  constructor(c) {
    this.o = c.o;
    this.x = c.x;
    this.y = c.y;
    this.z = c.z;
    this.p = c.p;
    this.near = c.near;
    this.far = c.far;
    this.fov = c.fov;
  }

  view(p) {
    const d0 = p[0] - this.o[0];
    const d1 = p[1] - this.o[1];
    const d2 = p[2] - this.o[2];
    return [
      d0 * this.x[0] + d1 * this.x[1] + d2 * this.x[2],
      d0 * this.y[0] + d1 * this.y[1] + d2 * this.y[2],
      d0 * this.z[0] + d1 * this.z[1] + d2 * this.z[2],
    ];
  }

  screenOfView(v) {
    const m = this.p;
    const cx = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12];
    const cy = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13];
    const cw = m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15];
    return [(cx / cw * 0.5 + 0.5) * L.W, (-cy / cw * 0.5 + 0.5) * L.H];
  }

  project(p) {
    const v = this.view(p);
    const s = this.screenOfView(v);
    return { x: s[0], y: s[1], depth: -v[2], behind: -v[2] < this.near };
  }

  point(p) {
    const r = this.project(p);
    return [r.x, r.y];
  }

  // Ломаная из мира на экран: отрезки за плоскостью камеры отрезаются, ломаная рвётся на куски.
  polyline(points, near = this.near + 0.05) {
    const out = [];
    let run = [];
    let prev = null;
    let prevV = null;
    for (const p of points) {
      const v = this.view(p);
      const inside = -v[2] >= near;
      if (prev !== null) {
        const prevIn = -prevV[2] >= near;
        if (prevIn !== inside) {
          const t = (near + prevV[2]) / (prevV[2] - v[2]);
          const cut = L.mix3(prevV, v, t);
          run.push(this.screenOfView(cut));
          if (!inside) {
            out.push(run);
            run = [];
          }
        }
      }
      if (inside) {
        run.push(this.screenOfView(v));
      }
      prev = p;
      prevV = v;
    }
    if (run.length > 1) {
      out.push(run);
    }
    return out.filter((r) => r.length > 1);
  }

  distance(p) {
    return -this.view(p)[2];
  }

  // Метров на точку экрана на расстоянии d по горизонтали (для толщин и шкал «в метрах»).
  pixelsPerMetre(d) {
    return this.p[0] * 0.5 * L.W / Math.max(d, 1e-3);
  }
}
L.Camera = Camera;

// Геометрия экрана.
L.geo = {
  hull(points) {
    const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (pts.length < 3) {
      return pts;
    }
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
  },
  inside(poly, p) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) {
        c = !c;
      }
    }
    return c;
  },
  bounds(points) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of points) {
      x0 = Math.min(x0, p[0]);
      y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]);
      y1 = Math.max(y1, p[1]);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  },
  closed(points) {
    const p = points.slice();
    if (p.length && (p[0][0] !== p[p.length - 1][0] || p[0][1] !== p[p.length - 1][1])) {
      p.push(p[0]);
    }
    return p;
  },
  length(points) {
    let s = 0;
    for (let i = 1; i < points.length; i++) {
      s += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    }
    return s;
  },
  // Куски ломаной от доли a до доли b её длины.
  slice(points, a, b) {
    const total = L.geo.length(points);
    const from = a * total;
    const to = b * total;
    const out = [];
    let s = 0;
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1];
      const q = points[i];
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const s0 = s;
      const s1 = s + d;
      if (s1 >= from && s0 <= to && d > 0) {
        const t0 = L.clamp((from - s0) / d, 0, 1);
        const t1 = L.clamp((to - s0) / d, 0, 1);
        const p0 = [p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0];
        const p1 = [p[0] + (q[0] - p[0]) * t1, p[1] + (q[1] - p[1]) * t1];
        if (!out.length) out.push(p0);
        out.push(p1);
      }
      s = s1;
    }
    return out;
  },
  // Пунктир: куски по dash точек через gap.
  dashes(points, dash, gap, phase = 0) {
    const total = L.geo.length(points);
    const out = [];
    const step = dash + gap;
    for (let s = -((phase % step) + step) % step; s < total; s += step) {
      const a = Math.max(s, 0);
      const b = Math.min(s + dash, total);
      if (b > a + 0.5) {
        out.push(L.geo.slice(points, a / total, b / total));
      }
    }
    return out;
  },
};

// Данные сцены: кадры выгрузки, события и вспомогательные выборки.
class Scene {
  constructor(name, doc) {
    this.name = name;
    this.doc = doc;
    this.title = doc.title;
    this.frames = doc.frames;
    this.count = doc.frames.length;
    this.player = doc.player;
    this.target = doc.target;
    this.classes = doc.classes;
    this.settings = doc.settings;
    this.checks = doc.checks;
    this.cameras = this.frames.map((f) => new Camera(f.cam));
    this.fired = [];
    this.frames.forEach((f, k) => {
      for (const e of f.ev) {
        if (e.k === 'fire') this.fired.push(k);
      }
    });
  }

  frame(k) {
    return this.frames[L.clamp(k, 0, this.count - 1)];
  }

  ship(k, id) {
    return this.frame(k).ships.find((s) => s.id === id) || null;
  }

  // События за последние seconds секунд до кадра k (с возрастом в секундах).
  recent(k, kind, seconds) {
    const out = [];
    const from = Math.max(0, k - Math.round(seconds * L.FPS));
    for (let j = from; j <= k && j < this.count; j++) {
      for (const e of this.frames[j].ev) {
        if (!kind || e.k === kind) out.push(Object.assign({ age: (k - j) / L.FPS, frame: j }, e));
      }
    }
    return out;
  }

  // Последний залп до кадра k включительно: кадр, где ушли ядра.
  lastVolley(k) {
    let last = -1;
    for (const f of this.fired) {
      if (f <= k) last = f;
    }
    return last;
  }
}
L.Scene = Scene;

// Кадр для варианта прицела: всё, что знает клиент в этот миг, и помощники.
L.context = function (scene, k) {
  const frame = scene.frame(k);
  const cam = scene.cameras[L.clamp(k, 0, scene.count - 1)];
  const ships = frame.ships;
  const own = ships.find((s) => s.id === scene.player) || null;
  const focusId = frame.aim && frame.aim.flight && frame.aim.flight.target ? frame.aim.flight.target : scene.target;
  const target = ships.find((s) => s.id === scene.target) || null;
  return {
    k,
    t: frame.t,
    scene,
    frame,
    cam,
    aim: frame.aim || {},
    rt: frame.rt || {},
    ships,
    own,
    target,
    focusId,
    balls: frame.balls || [],
    events: frame.ev || [],
  };
};

// Корпус судна на экране: план по воде и на высоте борта (+ мачты) — выпуклая оболочка и ближняя к камере глубина.
L.shipOnScreen = function (cam, ship, withMasts = true) {
  const pts = [];
  const plan = ship.plan;
  const water = ship.water;
  const top = water + ship.top;
  for (const p of plan) {
    pts.push([p[0], water - 0.6, p[1]]);
    pts.push([p[0], top, p[1]]);
  }
  if (withMasts && ship.mast > ship.top) {
    const c = ship.c;
    const f = ship.fwd;
    const half = (L.dist2(plan[0], plan[Math.floor(plan.length / 2)]) || 20) * 0.32;
    pts.push([c[0] + f[0] * half, water + ship.mast, c[2] + f[2] * half]);
    pts.push([c[0] - f[0] * half, water + ship.mast, c[2] - f[2] * half]);
  }
  const screen = [];
  let near = Infinity;
  for (const p of pts) {
    const r = cam.project(p);
    if (r.behind) continue;
    screen.push([r.x, r.y]);
    near = Math.min(near, r.depth);
  }
  if (screen.length < 3) return null;
  return { poly: L.geo.hull(screen), near, far: cam.distance(ship.c) };
};

L.loadJSON = async function (url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Не загрузился ' + url + ' (' + r.status + ')');
  let buf = new Uint8Array(await r.arrayBuffer());
  if (url.endsWith('.txt')) {
    const bin = atob(new TextDecoder().decode(buf).replace(/\s+/g, ''));
    buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  }
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const ds = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(ds).text());
  }
  return JSON.parse(new TextDecoder().decode(buf));
};

L.loadImage = async function (url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Не загрузился ' + url + ' (' + r.status + ')');
  const blob = await r.blob();
  return createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
};
})();
