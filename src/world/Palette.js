import { Color } from 'three';
import { SECTORS } from '../config.js';
import { easeInOutCubic } from '../core/math.js';

const KEYS = Object.keys(SECTORS[0]).filter((k) => k !== 'name');

function toColors(def) {
  const out = {};
  for (const k of KEYS) out[k] = new Color(def[k]);
  return out;
}

// Live colour set for the whole world. Every material that cares reads from
// `palette.c` each frame, so a sector change is just a cross-fade here.
export class Palette {
  constructor() {
    this.index = 0;
    this.c = toColors(SECTORS[0]);
    this.from = toColors(SECTORS[0]);
    this.to = toColors(SECTORS[0]);
    this.t = 1;
    this.duration = 1;
  }

  get name() {
    return SECTORS[this.index % SECTORS.length].name;
  }

  set(index, duration = 4) {
    this.index = index;
    for (const k of KEYS) this.from[k].copy(this.c[k]);
    this.to = toColors(SECTORS[index % SECTORS.length]);
    this.duration = duration;
    this.t = duration > 0 ? 0 : 1;
    if (duration <= 0) for (const k of KEYS) this.c[k].copy(this.to[k]);
  }

  update(dt) {
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / this.duration);
    const e = easeInOutCubic(this.t);
    for (const k of KEYS) this.c[k].lerpColors(this.from[k], this.to[k], e);
  }
}
