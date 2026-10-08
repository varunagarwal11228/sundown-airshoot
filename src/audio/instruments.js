// Every sound in the game is synthesised from oscillators and filtered noise.
// Each function schedules one note at audio time `t`.

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function envGain(ctx, t, peak, attack, hold, release) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  if (hold > 0) g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  return g;
}

function sends(a, node, { delay = 0, reverb = 0 }) {
  if (delay > 0) {
    const s = a.ctx.createGain();
    s.gain.value = delay;
    node.connect(s).connect(a.delayIn);
  }
  if (reverb > 0) {
    const s = a.ctx.createGain();
    s.gain.value = reverb;
    node.connect(s).connect(a.reverbIn);
  }
}

export function noiseHit(a, t, { dur = 0.1, freq = 2000, type = 'highpass', q = 0.7, gain = 0.3, dest, attack = 0.001, sweepTo } = {}) {
  const { ctx } = a;
  const src = ctx.createBufferSource();
  src.buffer = a.noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  f.Q.value = q;
  const g = envGain(ctx, t, gain, attack, 0, dur);
  src.connect(f).connect(g).connect(dest || a.sfx);
  const offset = Math.random() * (a.noise.duration - dur - 0.1);
  src.start(t, Math.max(0, offset), dur + attack + 0.05);
  return g;
}

// -- drums --------------------------------------------------------------------
export function kick(a, t, vel = 1) {
  const { ctx } = a;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
  const g = envGain(ctx, t, 0.95 * vel, 0.003, 0.02, 0.38);
  o.connect(g).connect(a.drums);
  o.start(t);
  o.stop(t + 0.5);
  noiseHit(a, t, { dur: 0.012, freq: 3500, gain: 0.25 * vel, dest: a.drums });

  // sidechain pump on the pads and bass
  a.duck.gain.cancelScheduledValues(t);
  a.duck.gain.setValueAtTime(0.3, t);
  a.duck.gain.linearRampToValueAtTime(1, t + 0.24);
}

export function snare(a, t, vel = 1) {
  const { ctx } = a;
  const g = noiseHit(a, t, { dur: 0.2, freq: 1800, type: 'bandpass', q: 0.6, gain: 0.5 * vel, dest: a.drums });
  sends(a, g, { reverb: 0.3 });
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(200, t);
  o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
  const og = envGain(ctx, t, 0.3 * vel, 0.002, 0, 0.1);
  o.connect(og).connect(a.drums);
  o.start(t);
  o.stop(t + 0.15);
}

export function hat(a, t, open = false, vel = 1) {
  noiseHit(a, t, { dur: open ? 0.24 : 0.04, freq: 7800, gain: (open ? 0.12 : 0.1) * vel, dest: a.drums });
}

export function crash(a, t) {
  const g = noiseHit(a, t, { dur: 1.6, freq: 5000, gain: 0.18, dest: a.drums, sweepTo: 9000 });
  sends(a, g, { reverb: 0.5 });
}

// -- tonal ------------------------------------------------------------------
export function bass(a, t, midi, dur, bright = 0.5) {
  const { ctx } = a;
  const f = mtof(midi);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 7;
  const peak = 500 + bright * 1400;
  filter.frequency.setValueAtTime(160, t);
  filter.frequency.exponentialRampToValueAtTime(peak, t + 0.012);
  filter.frequency.exponentialRampToValueAtTime(260, t + Math.max(0.08, dur * 0.9));
  const g = envGain(ctx, t, 0.3, 0.005, Math.max(0, dur - 0.06), 0.06);
  for (const det of [-8, 8]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = det;
    o.connect(filter);
    o.start(t);
    o.stop(t + dur + 0.1);
  }
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = f;
  const sg = ctx.createGain();
  sg.gain.value = 0.6;
  sub.connect(sg).connect(g);
  sub.start(t);
  sub.stop(t + dur + 0.1);
  filter.connect(g).connect(a.duck);
}

export function pad(a, t, notes, dur, cutoff = 1300) {
  const { ctx } = a;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.6;
  filter.frequency.setValueAtTime(cutoff * 0.5, t);
  filter.frequency.linearRampToValueAtTime(cutoff, t + dur * 0.5);
  filter.frequency.linearRampToValueAtTime(cutoff * 0.7, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.055, t + Math.min(0.6, dur * 0.3));
  g.gain.setValueAtTime(0.055, t + dur);
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.9);
  for (const m of notes) {
    for (const det of [-11, 11]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(m);
      o.detune.value = det;
      o.connect(filter);
      o.start(t);
      o.stop(t + dur + 1);
    }
  }
  filter.connect(g).connect(a.duck);
  sends(a, g, { reverb: 0.7 });
}

export function arp(a, t, midi, bright = 0.5, level = 1) {
  const { ctx } = a;
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.value = mtof(midi);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900 + bright * 3200;
  filter.Q.value = 3;
  const g = envGain(ctx, t, 0.06 * level, 0.003, 0, 0.2);
  o.connect(filter).connect(g).connect(a.music);
  sends(a, g, { delay: 0.55, reverb: 0.2 });
  o.start(t);
  o.stop(t + 0.3);
}

export function lead(a, t, midi, dur) {
  const { ctx } = a;
  const f = mtof(midi);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 3200;
  filter.Q.value = 2;
  const g = envGain(ctx, t, 0.085, 0.02, Math.max(0, dur - 0.05), 0.22);

  const vib = ctx.createOscillator();
  vib.frequency.value = 5.6;
  const vibDepth = ctx.createGain();
  vibDepth.gain.setValueAtTime(0, t);
  vibDepth.gain.linearRampToValueAtTime(9, t + Math.min(0.35, dur));
  vib.connect(vibDepth);

  for (const [type, det] of [['sawtooth', -5], ['square', 5]]) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = det;
    vibDepth.connect(o.detune);
    o.connect(filter);
    o.start(t);
    o.stop(t + dur + 0.3);
  }
  vib.start(t);
  vib.stop(t + dur + 0.3);
  filter.connect(g).connect(a.music);
  sends(a, g, { delay: 0.35, reverb: 0.45 });
}
