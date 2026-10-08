import { WAVES_PER_SECTOR, SPAWN_Z, DIFFICULTY } from '../config.js';
import { Store } from '../core/Store.js';
import { rand, randInt, pick, clamp } from '../core/math.js';
import { t } from '../text.js';

const GROUPS = [
  { kind: 'motes', cost: 3, weight: 4, from: [1, 1] },
  { kind: 'lancers', cost: 3, weight: 3, from: [1, 1] },
  { kind: 'hornets', cost: 3, weight: 3, from: [1, 2] },
  { kind: 'warden', cost: 7, weight: 1.3, from: [1, 3] },
  { kind: 'splitter', cost: 4, weight: 1.6, from: [1, 3] },
];

// Paces the run: builds each wave from a point budget, runs the spawn
// timeline, and hands over to the boss after the last wave of a sector.
export class Director {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.sector = 1;
    this.wave = 0;
    this.queue = [];
    this.t = 0;
    this.state = 'idle';
    this.delay = 0;
    this.damaged = false;
  }

  get difficulty() {
    const base = clamp(1 + (this.sector - 1) * 0.17 + Math.max(0, this.wave - 1) * 0.035, 1, 1.9);
    return base * (DIFFICULTY[Store.settings.difficulty] || DIFFICULTY.normal).enemy;
  }

  get waveLine() {
    return t(`wave.${((this.wave - 1) % 4) + 1}`);
  }

  start() {
    this.reset();
    this.state = 'gap';
    this.delay = 1.6;
  }

  update(dt) {
    if (this.state === 'gap') {
      this.delay -= dt;
      if (this.delay <= 0) this.next();
    } else if (this.state === 'wave') {
      this.t += dt;
      while (this.queue.length && this.queue[0].at <= this.t) this.queue.shift().run();
      if (!this.queue.length && this.game.enemies.count() === 0) {
        this.state = 'gap';
        this.delay = 3.4;
        this.game.onWaveClear(this.wave, !this.damaged);
      }
    } else if (this.state === 'boss-intro') {
      this.delay -= dt;
      if (this.delay <= 0) {
        this.state = 'boss';
        this.game.boss.spawn(this.sector);
      }
    }
  }

  next() {
    this.wave++;
    this.damaged = false;
    if (this.wave > WAVES_PER_SECTOR) {
      this.state = 'boss-intro';
      this.delay = 3.2;
      this.game.onBossIncoming(this.sector);
      return;
    }
    this.queue = this.compose().sort((a, b) => a.at - b.at);
    this.t = 0;
    this.state = 'wave';
    this.game.onWaveStart(this.sector, this.wave);
  }

  bossDown() {
    this.sector++;
    this.wave = 0;
    this.state = 'gap';
    this.delay = 6;
  }

  compose() {
    const s = this.sector, w = this.wave;
    const budget = 9 + w * 4 + (s - 1) * 6;
    const open = GROUPS.filter((g) => s > g.from[0] || w >= g.from[1]);
    const gap = Math.max(0.55, 1 - (s - 1) * 0.12);
    const events = [];
    let spent = 0, at = 1.0, wardens = 0;

    // First wave of the game always opens with an easy mote line.
    if (s === 1 && w === 1) {
      events.push(...this.motes(at, 'line'));
      spent += 3;
      at += 3;
    }

    while (spent < budget) {
      let g = this.weighted(open);
      if (g.kind === 'warden' && wardens >= Math.min(2, s)) g = open[0];
      if (g.kind === 'warden') wardens++;
      events.push(...this[g.kind](at));
      spent += g.cost;
      at += rand(2.3, 3.4) * gap * (g.kind === 'warden' ? 1.7 : 1);
    }
    return events;
  }

  weighted(list) {
    const total = list.reduce((n, g) => n + g.weight, 0);
    let r = Math.random() * total;
    for (const g of list) {
      r -= g.weight;
      if (r <= 0) return g;
    }
    return list[0];
  }

  spawn(at, type, opts) {
    const hpScale = 1 + (this.sector - 1) * 0.25;
    return { at, run: () => this.game.enemies.spawn(type, { hpScale, ...opts }) };
  }

  motes(at, form = pick(['line', 'snake', 'vee', 'pincer'])) {
    const out = [];
    const shooters = this.sector > 1 || this.wave >= 3;
    const speed = 52 + this.sector * 4;
    if (form === 'line') {
      const y = rand(3, 9);
      for (let i = 0; i < 5; i++) {
        out.push(this.spawn(at, 'mote', { x: -12 + i * 6, y, z: SPAWN_Z, speed, amp: 2, freq: 1.6, phase: i * 0.7, shooter: shooters && i === 2 }));
      }
    } else if (form === 'snake') {
      const x = rand(-8, 8), y = rand(3, 9);
      for (let i = 0; i < 6; i++) {
        out.push(this.spawn(at + i * 0.3, 'mote', { x, y, z: SPAWN_Z, speed, amp: 8, freq: 1.2, phase: 0, shooter: shooters && i % 3 === 0 }));
      }
    } else if (form === 'vee') {
      const y = rand(4, 8);
      for (let i = 0; i < 5; i++) {
        const d = Math.abs(i - 2);
        out.push(this.spawn(at, 'mote', { x: (i - 2) * 4, y: y + d * 0.8, z: SPAWN_Z - d * 10, speed, amp: 1, freq: 2, phase: i, shooter: shooters && d === 0 }));
      }
    } else {
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          out.push(this.spawn(at + i * 0.35, 'mote', { x: side * 9, y: rand(3, 8), z: SPAWN_Z, speed, amp: 5, freq: 1.4, phase: side > 0 ? Math.PI : 0, shooter: shooters && i === 1 }));
        }
      }
    }
    return out;
  }

  lancers(at) {
    const n = clamp(1 + (this.sector > 1 ? 1 : 0) + (this.wave >= 3 ? 1 : 0), 1, 3);
    const out = [];
    for (let i = 0; i < n; i++) {
      const anchorX = (i - (n - 1) / 2) * 9 + rand(-2, 2);
      const anchorY = rand(4, 10);
      out.push(this.spawn(at + i * 0.4, 'lancer', {
        x: anchorX * 2.2, y: anchorY + 12, z: SPAWN_Z,
        anchorX, anchorY, holdZ: rand(-75, -55), life: rand(8, 11), phase: rand(0, 6),
      }));
    }
    return out;
  }

  hornets(at) {
    const out = [];
    const n = randInt(2, 3 + (this.sector > 1 ? 1 : 0));
    for (let i = 0; i < n; i++) {
      const x = rand(-12, 12), y = rand(3, 10);
      out.push(this.spawn(at + i * 0.55, 'hornet', { x, y, z: SPAWN_Z, anchorX: x, anchorY: y, diveZ: rand(-95, -75) }));
    }
    return out;
  }

  splitter(at) {
    const anchorX = rand(-9, 9), anchorY = rand(4, 9);
    return [this.spawn(at, 'splitter', { x: anchorX * 1.5, y: anchorY + 10, z: SPAWN_Z, anchorX, anchorY, holdZ: rand(-95, -75) })];
  }

  warden(at) {
    const anchorX = rand(-6, 6), anchorY = rand(5, 8);
    return [this.spawn(at, 'warden', { x: anchorX, y: anchorY + 14, z: SPAWN_Z - 40, anchorX, anchorY, holdZ: -95, life: 18 })];
  }
}
