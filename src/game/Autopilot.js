import { BOUNDS } from '../config.js';
import { clamp, damp } from '../core/math.js';

// Flies the ship by itself for the idle demo. It looks like an Input object
// to the Player (same pointer/firing/dash API), so the player code doesn't
// know or care who is steering.
export class Autopilot {
  constructor(game) {
    this.game = game;
    this.pointer = { x: 0, y: 0 };
    this.aim = { x: 0, y: 5 };
    this.wander = 0;
    this.dashFlag = false;
    this.firing = true;
  }

  reset() {
    this.aim.x = 0;
    this.aim.y = 5;
    this.wander = 0;
    this.dashFlag = false;
  }

  axis() {
    return { x: 0, y: 0 };
  }

  pointerActive() {
    return true;
  }

  get dash() {
    const d = this.dashFlag;
    this.dashFlag = false;
    return d;
  }

  get emp() {
    const g = this.game;
    let close = 0;
    for (const b of g.bullets.enemy.list) if (b.alive && b.pos.z > -25) close++;
    return close > 14;
  }

  get overdrive() {
    return this.game.player.od >= 1;
  }

  update(dt) {
    const g = this.game;
    const p = g.player.pos;
    this.wander += dt;

    // Chase the closest thing in front of us.
    let target = null, bestZ = -Infinity;
    for (const e of g.enemies.active) {
      if (!e.alive || e.pos.z > -18 || e.pos.z < -230) continue;
      if (e.pos.z > bestZ) {
        bestZ = e.pos.z;
        target = e.pos;
      }
    }
    if (!target && g.boss.fighting) target = g.boss.pos;
    let tx = target ? target.x : Math.sin(this.wander * 0.6) * 8;
    let ty = target ? target.y : 5 + Math.sin(this.wander * 0.9) * 2;

    // Sidestep: look at where each incoming bullet will cross our plane.
    let danger = false;
    for (const b of g.bullets.enemy.list) {
      if (!b.alive || b.vel.z <= 0) continue;
      const tHit = (p.z - b.pos.z) / b.vel.z;
      if (tHit < 0 || tHit > 1.2) continue;
      const hx = b.pos.x + b.vel.x * tHit - p.x;
      const hy = b.pos.y + b.vel.y * tHit - p.y;
      const d2 = hx * hx + hy * hy;
      if (d2 > 9) continue;
      const w = ((9 - d2) / 9) * (1.3 - tHit);
      const sx = hx >= 0 ? 1 : -1;
      tx -= (hx + sx * 0.6) * w * 4;
      ty -= hy * w * 3;
      if (d2 < 2.2 && tHit < 0.25) danger = true;
    }
    for (const e of g.enemies.active) {
      if (e.alive && e.type === 'hornet' && e.state === 'dive' && e.pos.z > -25) {
        const dx = e.pos.x - p.x;
        if (Math.abs(dx) < 4) tx -= Math.sign(dx || 1) * 6;
      }
    }
    if (danger && g.player.dashCd <= 0) this.dashFlag = true;

    this.aim.x = damp(this.aim.x, clamp(tx, -BOUNDS.x, BOUNDS.x), 6, dt);
    this.aim.y = damp(this.aim.y, clamp(ty, BOUNDS.yMin, BOUNDS.yMax), 6, dt);

    // Convert back to the normalised pointer coords Player expects.
    this.pointer.x = this.aim.x / (BOUNDS.x * 1.25);
    this.pointer.y = (((this.aim.y - BOUNDS.yMin) / (BOUNDS.yMax - BOUNDS.yMin)) * 2 - 1) / 1.2;
  }
}
