import { noiseHit, mtof } from './instruments.js';

const clampPan = (p) => Math.max(-1, Math.min(1, p || 0));

// Gameplay sound effects. All synthesised; throttled so a bullet storm
// doesn't turn into a wall of clipping.
export class Sfx {
  constructor(audio) {
    this.a = audio;
    this.last = {};
  }

  get ok() {
    return this.a.ok && this.a.ctx.state === 'running';
  }

  throttle(key, ms) {
    const now = performance.now();
    if (this.last[key] && now - this.last[key] < ms) return true;
    this.last[key] = now;
    return false;
  }

  out(pan) {
    const p = this.a.ctx.createStereoPanner();
    p.pan.value = clampPan(pan);
    p.connect(this.a.sfx);
    return p;
  }

  osc(type, f0, f1, t, dur, gain, dest, attack = 0.002) {
    const { ctx } = this.a;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return g;
  }

  laser(pan) {
    if (!this.ok || this.throttle('laser', 40)) return;
    const t = this.a.now;
    const out = this.out(pan * 0.6);
    const jitter = 1 + (Math.random() - 0.5) * 0.06;
    this.osc('square', 1500 * jitter, 240, t, 0.09, 0.045, out);
    this.osc('sine', 3200 * jitter, 900, t, 0.06, 0.03, out);
  }

  enemyShot(pan) {
    if (!this.ok || this.throttle('eshot', 70)) return;
    this.osc('triangle', 520, 780, this.a.now, 0.07, 0.03, this.out(pan * 0.5));
  }

  ringShot(pan) {
    if (!this.ok) return;
    const t = this.a.now;
    const out = this.out(pan * 0.5);
    this.osc('sawtooth', 300, 900, t, 0.25, 0.05, out, 0.01);
    noiseHit(this.a, t, { dur: 0.2, freq: 1500, type: 'bandpass', gain: 0.08, dest: out, sweepTo: 5000 });
  }

  lock(pan) {
    if (!this.ok || this.throttle('lock', 120)) return;
    const t = this.a.now;
    const out = this.out(pan);
    this.osc('square', 1760, 1760, t, 0.05, 0.03, out);
    this.osc('square', 1760, 1760, t + 0.08, 0.05, 0.03, out);
  }

  hit(pan) {
    if (!this.ok || this.throttle('hit', 30)) return;
    const t = this.a.now;
    const out = this.out(pan * 0.5);
    noiseHit(this.a, t, { dur: 0.035, freq: 2800, gain: 0.08, dest: out });
    this.osc('sine', 1900, 1100, t, 0.05, 0.035, out);
  }

  explode(size = 1, pan = 0) {
    if (!this.ok || this.throttle('boom' + Math.round(Math.random() * 2), 45)) return;
    const t = this.a.now;
    const out = this.out(pan * 0.6);
    const dur = 0.35 + size * 0.35;
    const g = noiseHit(this.a, t, { dur, freq: 3400, type: 'lowpass', q: 1, gain: 0.35 * Math.min(size, 1.6), dest: out, sweepTo: 140 });
    const rv = this.a.ctx.createGain();
    rv.gain.value = 0.35;
    g.connect(rv).connect(this.a.reverbIn);
    this.osc('sine', 120, 38, t, 0.3 + size * 0.1, 0.5 * Math.min(size, 1.4), out, 0.004);
  }

  bigBoom() {
    if (!this.ok) return;
    const t = this.a.now;
    const g = noiseHit(this.a, t, { dur: 2.4, freq: 5000, type: 'lowpass', q: 0.8, gain: 0.6, dest: this.a.sfx, sweepTo: 80 });
    const rv = this.a.ctx.createGain();
    rv.gain.value = 0.6;
    g.connect(rv).connect(this.a.reverbIn);
    this.osc('sine', 90, 22, t, 1.6, 0.8, this.a.sfx, 0.01);
    this.osc('sawtooth', 60, 30, t, 1.2, 0.12, this.a.sfx, 0.01);
  }

  playerHit() {
    if (!this.ok) return;
    const t = this.a.now;
    const { ctx } = this.a;
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.a.distCurve;
    shaper.connect(this.a.sfx);
    this.osc('sawtooth', 260, 60, t, 0.4, 0.22, shaper);
    noiseHit(this.a, t, { dur: 0.25, freq: 900, type: 'bandpass', gain: 0.3, dest: this.a.sfx });
  }

  shieldHit() {
    if (!this.ok) return;
    const t = this.a.now;
    this.osc('sine', 1250, 900, t, 0.25, 0.08, this.a.sfx);
    this.osc('sine', 1880, 1300, t, 0.2, 0.05, this.a.sfx);
  }

  pickup() {
    if (!this.ok) return;
    const t = this.a.now;
    [84, 88, 91, 96].forEach((m, i) => {
      const g = this.osc('triangle', mtof(m), mtof(m), t + i * 0.055, 0.18, 0.09, this.a.sfx);
      const rv = this.a.ctx.createGain();
      rv.gain.value = 0.3;
      g.connect(rv).connect(this.a.reverbIn);
    });
  }

  dash(dir) {
    if (!this.ok) return;
    const t = this.a.now;
    const out = this.out(dir * 0.7);
    const { ctx } = this.a;
    const src = ctx.createBufferSource();
    src.buffer = this.a.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2.5;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(3200, t + 0.15);
    f.frequency.exponentialRampToValueAtTime(600, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random(), 0.5);
  }

  emp() {
    if (!this.ok) return;
    const t = this.a.now;
    const g = this.osc('sine', 240, 28, t, 1.3, 0.6, this.a.sfx, 0.01);
    const rv = this.a.ctx.createGain();
    rv.gain.value = 0.7;
    g.connect(rv).connect(this.a.reverbIn);
    noiseHit(this.a, t, { dur: 1.2, freq: 7000, type: 'lowpass', gain: 0.35, dest: this.a.sfx, sweepTo: 200 });
    this.osc('square', 2400, 120, t, 0.5, 0.05, this.a.sfx);
  }

  combo(mult) {
    if (!this.ok) return;
    const m = 72 + mult * 2;
    this.osc('triangle', mtof(m), mtof(m), this.a.now, 0.12, 0.06, this.a.sfx);
    this.osc('triangle', mtof(m + 7), mtof(m + 7), this.a.now + 0.05, 0.14, 0.05, this.a.sfx);
  }

  chord(notes = [69, 72, 76], len = 0.9) {
    if (!this.ok) return;
    const t = this.a.now;
    const { ctx } = this.a;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(4000, t);
    f.frequency.exponentialRampToValueAtTime(400, t + len);
    f.connect(this.a.sfx);
    const rv = ctx.createGain();
    rv.gain.value = 0.4;
    f.connect(rv).connect(this.a.reverbIn);
    for (const m of notes) {
      this.osc('sawtooth', mtof(m), mtof(m), t, len, 0.05, f, 0.01);
      this.osc('sawtooth', mtof(m) * 1.005, mtof(m) * 1.005, t, len, 0.04, f, 0.01);
    }
  }

  warning() {
    if (!this.ok) return;
    const t = this.a.now;
    const { ctx } = this.a;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    f.connect(this.a.sfx);
    for (let i = 0; i < 6; i++) {
      const hi = i % 2 === 0;
      this.osc('square', hi ? 587 : 440, hi ? 587 : 440, t + i * 0.4, 0.36, 0.07, f, 0.01);
    }
  }

  ui(kind = 'move') {
    if (!this.ok) return;
    const t = this.a.now;
    if (kind === 'move') this.osc('sine', 1320, 1320, t, 0.04, 0.04, this.a.sfx);
    else if (kind === 'select') {
      this.osc('square', 880, 880, t, 0.06, 0.035, this.a.sfx);
      this.osc('square', 1320, 1320, t + 0.06, 0.09, 0.035, this.a.sfx);
    } else if (kind === 'back') {
      this.osc('square', 660, 440, t, 0.1, 0.03, this.a.sfx);
    }
  }

  missile(pan) {
    if (!this.ok || this.throttle('missile', 150)) return;
    const t = this.a.now;
    const out = this.out(pan * 0.6);
    noiseHit(this.a, t, { dur: 0.35, freq: 900, type: 'bandpass', q: 1.2, gain: 0.12, dest: out, sweepTo: 2600, attack: 0.02 });
    this.osc('sawtooth', 180, 420, t, 0.25, 0.03, out, 0.01);
  }

  odReady() {
    if (!this.ok) return;
    const t = this.a.now;
    this.osc('triangle', mtof(81), mtof(81), t, 0.15, 0.07, this.a.sfx);
    this.osc('triangle', mtof(88), mtof(88), t + 0.1, 0.25, 0.07, this.a.sfx);
  }

  overdrive() {
    if (!this.ok) return;
    const t = this.a.now;
    const g = noiseHit(this.a, t, { dur: 0.9, freq: 400, type: 'bandpass', q: 2, gain: 0.3, dest: this.a.sfx, sweepTo: 8000, attack: 0.3 });
    const rv = this.a.ctx.createGain();
    rv.gain.value = 0.5;
    g.connect(rv).connect(this.a.reverbIn);
    this.osc('sawtooth', 110, 440, t, 0.9, 0.08, this.a.sfx, 0.2);
    this.chord([69, 76, 81, 85], 1.4);
  }

  overdriveEnd() {
    if (!this.ok) return;
    this.osc('sawtooth', 440, 110, this.a.now, 0.6, 0.06, this.a.sfx, 0.01);
  }

  // Long rising whoosh for the jump between levels.
  warp() {
    if (!this.ok) return;
    const t = this.a.now;
    const g = noiseHit(this.a, t, { dur: 2.8, freq: 200, type: 'bandpass', q: 1.4, gain: 0.35, dest: this.a.sfx, sweepTo: 9000, attack: 1.2 });
    const rv = this.a.ctx.createGain();
    rv.gain.value = 0.5;
    g.connect(rv).connect(this.a.reverbIn);
    this.osc('sine', 55, 220, t, 2.6, 0.25, this.a.sfx, 1.0);
  }

  engage() {
    if (!this.ok) return;
    const t = this.a.now;
    noiseHit(this.a, t, { dur: 1.1, freq: 300, type: 'bandpass', q: 1.5, gain: 0.25, dest: this.a.sfx, sweepTo: 6000, attack: 0.6 });
    this.chord([57, 64, 69, 72], 1.8);
  }
}
