// Mixer graph:
//
//   instruments ─┬─> duck (sidechain) ─┐
//                ├─> drums ────────────┼─> music ─> musicFilter ─┐
//                ├─> delay send ──> delay ⟲ ──────┘              ├─> master ─> compressor ─> out
//                └─> reverb send ──> convolver ───────────────────┤
//   sfx ──────────────────────────────────────────────────────────┘

export class AudioEngine {
  constructor() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ok = !!Ctx;
    if (!this.ok) return;
    const ctx = (this.ctx = new Ctx({ latencyHint: 'interactive' }));

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 8;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.2;
    this.compressor.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.compressor);

    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 20000;
    this.musicFilter.Q.value = 0.8;
    this.musicFilter.connect(this.master);

    this.music = ctx.createGain();
    this.music.gain.value = 0.7;
    this.music.connect(this.musicFilter);

    this.duck = ctx.createGain();
    this.duck.connect(this.music);

    this.drums = ctx.createGain();
    this.drums.gain.value = 0.9;
    this.drums.connect(this.music);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.8;
    this.sfx.connect(this.master);

    // Dotted-eighth echo with a darkening feedback loop.
    this.delayIn = ctx.createGain();
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = 0.4;
    this.delayFb = ctx.createGain();
    this.delayFb.gain.value = 0.38;
    this.delayTone = ctx.createBiquadFilter();
    this.delayTone.type = 'lowpass';
    this.delayTone.frequency.value = 2800;
    this.delayIn.connect(this.delay);
    this.delay.connect(this.delayTone);
    this.delayTone.connect(this.delayFb);
    this.delayFb.connect(this.delay);
    this.delayOut = ctx.createGain();
    this.delayOut.gain.value = 0.42;
    this.delayTone.connect(this.delayOut);
    this.delayOut.connect(this.music);

    this.reverbIn = ctx.createGain();
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.8, 3.2);
    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = 0.55;
    this.reverbIn.connect(this.reverb);
    this.reverb.connect(this.reverbOut);
    this.reverbOut.connect(this.master);

    this.noise = this.noiseBuffer(3);
    this.distCurve = this.makeCurve(28);
  }

  // Synthetic hall: decaying stereo noise with a short pre-delay.
  impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const pre = Math.floor(rate * 0.018);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = pre; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - (i - pre) / (len - pre), decay);
      }
    }
    return buf;
  }

  noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  makeCurve(amount) {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
    }
    return curve;
  }

  get now() {
    return this.ctx.currentTime;
  }

  async resume() {
    if (this.ok && this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* the next user gesture will try again */
      }
    }
  }

  setVolumes(music, sfx) {
    if (!this.ok) return;
    this.music.gain.setTargetAtTime(music * 0.85, this.now, 0.05);
    this.sfx.gain.setTargetAtTime(sfx, this.now, 0.05);
  }

  // Low-pass the soundtrack (pause menu, death).
  muffle(cutoff = 20000, time = 0.25) {
    if (!this.ok) return;
    this.musicFilter.frequency.cancelScheduledValues(this.now);
    this.musicFilter.frequency.setTargetAtTime(cutoff, this.now, time);
  }

  setDelayTime(seconds) {
    if (!this.ok) return;
    this.delay.delayTime.setTargetAtTime(seconds, this.now, 0.1);
  }
}
