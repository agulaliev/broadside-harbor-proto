const S = 'assets/sounds/';

export class Audio {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.loops = [];
    this.enabled = false;
  }

  async start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    this.enabled = true;
    const loops = [['sea.ogg', -8], ['wind.ogg', -17], ['rigging.wav', -20]];
    for (const [f, db] of loops) this._loop(f, db);
    this.master.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 2.5);
    this._creaks();
  }

  async _buf(name) {
    if (!this.buffers.has(name)) {
      this.buffers.set(name, fetch(S + name).then((r) => r.arrayBuffer()).then((a) => this.ctx.decodeAudioData(a)));
    }
    return this.buffers.get(name);
  }

  async _loop(name, db) {
    try {
      const b = await this._buf(name);
      const src = this.ctx.createBufferSource();
      src.buffer = b;
      src.loop = true;
      const g = this.ctx.createGain();
      g.gain.value = Math.pow(10, db / 20);
      src.connect(g).connect(this.master);
      src.start(0, Math.random() * b.duration);
      this.loops.push({ src, g, name });
    } catch (e) {
      console.warn('звук', name, e);
    }
  }

  async play(name, db = -12, rate = 1) {
    if (!this.ctx) return;
    try {
      const b = await this._buf(name);
      const src = this.ctx.createBufferSource();
      src.buffer = b;
      src.playbackRate.value = rate;
      const g = this.ctx.createGain();
      g.gain.value = Math.pow(10, db / 20);
      src.connect(g).connect(this.master);
      src.start();
    } catch (e) {
      console.warn('звук', name, e);
    }
  }

  _creaks() {
    const next = () => {
      if (!this.ctx) return;
      this.play(`creak_${Math.floor(Math.random() * 3)}.ogg`, -22 - Math.random() * 6, 0.9 + Math.random() * 0.2);
      setTimeout(next, 5000 + Math.random() * 7000);
    };
    setTimeout(next, 3000);
  }

  tick(kind = 'hover') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = kind === 'press' ? 900 : 2200;
    f.Q.value = 3;
    o.type = 'triangle';
    o.frequency.setValueAtTime(kind === 'press' ? 220 : 520, t);
    o.frequency.exponentialRampToValueAtTime(kind === 'press' ? 110 : 380, t + 0.08);
    g.gain.setValueAtTime(kind === 'press' ? 0.22 : 0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'press' ? 0.22 : 0.07));
    o.connect(f).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.25);
  }

  setVolume(v) {
    if (this.master) this.master.gain.linearRampToValueAtTime(v, this.ctx.currentTime + 0.4);
  }
}
