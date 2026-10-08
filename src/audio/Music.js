import { kick, snare, hat, crash, bass, pad, arp, lead } from './instruments.js';

// Chords: bass root, pad voicing, arpeggio notes (MIDI numbers).
const Am = { root: 45, pad: [57, 60, 64], arp: [69, 72, 76, 81] };
const F = { root: 41, pad: [57, 60, 65], arp: [65, 69, 72, 77] };
const C = { root: 48, pad: [55, 60, 64], arp: [67, 72, 76, 79] };
const G = { root: 43, pad: [55, 59, 62], arp: [67, 71, 74, 79] };
const E = { root: 40, pad: [56, 59, 64], arp: [64, 68, 71, 76] };

const Dm = { root: 38, pad: [57, 62, 65], arp: [62, 65, 69, 74] };
const Bb = { root: 46, pad: [58, 62, 65], arp: [58, 62, 65, 70] };
const Gm = { root: 43, pad: [55, 58, 62], arp: [67, 70, 74, 79] };
const A = { root: 45, pad: [57, 61, 64], arp: [69, 73, 76, 81] };

// Melodies are [step, midi, lengthInSteps] per bar.
const RUN_MELODY = [
  [[0, 76, 3], [4, 74, 2], [6, 72, 2], [8, 74, 4], [12, 76, 2], [14, 69, 2]],
  [[0, 72, 6], [6, 74, 2], [8, 72, 2], [10, 69, 2], [12, 67, 4]],
  [[0, 67, 2], [2, 69, 2], [4, 72, 4], [8, 76, 4], [12, 79, 4]],
  [[0, 79, 4], [4, 76, 2], [6, 74, 6], [12, 71, 4]],
];
const BOSS_MELODY = [
  [[0, 74, 2], [2, 77, 2], [4, 81, 4], [8, 79, 2], [10, 77, 2], [12, 76, 4]],
  [[0, 74, 4], [4, 77, 4], [8, 82, 6], [14, 81, 2]],
  [[0, 79, 2], [2, 77, 2], [4, 74, 4], [8, 70, 4], [12, 74, 4]],
  [[0, 73, 4], [4, 76, 4], [8, 81, 6], [14, 80, 2]],
];

const ARP_ORDER = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 1, 2];

const SONGS = {
  menu: { bpm: 96, chords: [Am, F, C, G], drums: 'soft', bassMode: 'long', arpMode: 'eighths', melody: null, padCut: 1100 },
  run: { bpm: 112, chords: [Am, F, C, G], drums: 'full', bassMode: 'octaves', arpMode: 'sixteenths', melody: RUN_MELODY, padCut: 1500 },
  boss: { bpm: 128, chords: [Dm, Bb, Gm, A], drums: 'drive', bassMode: 'gallop', arpMode: 'sixteenths', melody: BOSS_MELODY, padCut: 1800 },
  over: { bpm: 72, chords: [Am, F, C, E], drums: null, bassMode: 'long', arpMode: 'quarters', melody: null, padCut: 700 },
};

// Look-ahead sequencer (the "two clocks" pattern): a JS timer wakes every
// 25 ms and schedules any 16th-notes that fall inside the next 120 ms on the
// sample-accurate audio clock. Song changes wait for the next bar line.
export class Music {
  constructor(audio) {
    this.a = audio;
    this.song = null;
    this.pending = null;
    this.step = 0;
    this.bar = 0;
    this.nextTime = 0;
    this.intensity = 0.3;
    this.timer = null;
  }

  play(name) {
    if (!this.a.ok) return;
    if (!this.timer) this.timer = setInterval(() => this.tick(), 25);
    if (!this.song) {
      this.switchTo(name);
      this.nextTime = this.a.now + 0.06;
      this.step = 0;
    } else if (this.song.name !== name) {
      this.pending = name;
    }
  }

  stop() {
    this.song = null;
    this.pending = null;
  }

  setIntensity(v) {
    this.intensity = Math.max(0, Math.min(1, v));
  }

  switchTo(name) {
    this.song = { name, ...SONGS[name] };
    this.bar = 0;
    this.a.setDelayTime((60 / this.song.bpm) * 0.75);
    this.freshStart = name !== 'menu';
  }

  tick() {
    if (!this.song) return;
    // Background tabs throttle timers to ~1 Hz; don't machine-gun the
    // backlog when we come back, just pick up from now.
    if (this.nextTime < this.a.now - 0.2) this.nextTime = this.a.now + 0.05;
    const horizon = this.a.now + 0.12;
    while (this.nextTime < horizon) {
      if (this.step % 16 === 0 && this.pending) {
        this.switchTo(this.pending);
        this.pending = null;
      }
      this.schedule(this.step % 16, this.nextTime);
      this.nextTime += 60 / this.song.bpm / 4;
      this.step++;
      if (this.step % 16 === 0) this.bar++;
    }
  }

  schedule(s, t) {
    const a = this.a;
    const song = this.song;
    const stepDur = 60 / song.bpm / 4;
    const chord = song.chords[this.bar % song.chords.length];
    const hot = this.intensity;

    if (s === 0) {
      pad(a, t, chord.pad, stepDur * 16, song.padCut + hot * 600);
      if (this.freshStart) {
        crash(a, t);
        this.freshStart = false;
      }
    }

    // drums
    if (song.drums === 'full' || song.drums === 'drive') {
      if (s % 4 === 0) kick(a, t);
      if (song.drums === 'drive' && s === 14 && this.bar % 2 === 1) kick(a, t, 0.7);
      if (s === 4 || s === 12) snare(a, t);
      if (hot > 0.55 || song.drums === 'drive') {
        hat(a, t, s === 14, s % 4 === 2 ? 1 : 0.55);
      } else if (s % 4 === 2) {
        hat(a, t, s === 14);
      }
    } else if (song.drums === 'soft') {
      if (s === 0 && this.bar % 2 === 0) kick(a, t, 0.45);
      if (s % 4 === 2) hat(a, t, false, 0.4);
    }

    // bass
    const r = chord.root;
    if (song.bassMode === 'octaves') {
      if (s % 2 === 0) bass(a, t, s % 4 === 0 ? r : r + 12, stepDur * 1.8, 0.35 + hot * 0.5);
    } else if (song.bassMode === 'gallop') {
      if (s % 4 !== 1) bass(a, t, s % 8 === 0 ? r : r + 12, stepDur * 0.9, 0.8);
    } else if (song.bassMode === 'long' && s === 0) {
      bass(a, t, r, stepDur * 14, 0.15);
    }

    // arpeggio
    const note = chord.arp[ARP_ORDER[s] % chord.arp.length];
    if (song.arpMode === 'sixteenths') arp(a, t, note, 0.25 + hot * 0.6, 1);
    else if (song.arpMode === 'eighths' && s % 2 === 0) arp(a, t, note, 0.2, 0.8);
    else if (song.arpMode === 'quarters' && s % 4 === 0) arp(a, t, note - 12, 0.05, 0.9);

    // lead: second half of every 8-bar phrase (every phrase once it's hot)
    if (song.melody) {
      const phrase = this.bar % 8;
      const play = phrase >= 4 || (hot > 0.7 && song.name === 'run');
      if (play) {
        for (const [st, m, len] of song.melody[this.bar % song.melody.length]) {
          if (st === s) lead(a, t, m, len * stepDur);
        }
      }
    }
  }
}
