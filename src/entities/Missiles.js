import * as THREE from 'three';
import { BulletPool } from './Bullets.js';
import { rand } from '../core/math.js';

const steer = new THREE.Vector3();
const SMOKE = new THREE.Color(0.55, 0.42, 0.6);
const FLAME = new THREE.Color(3, 1.3, 0.35);

// Homing missiles from the "missiles" pickup. They launch sideways out of
// the wings, curve onto the nearest target and leave a smoke trail.
export class Missiles {
  constructor(scene) {
    const geo = new THREE.ConeGeometry(0.2, 1.5, 6);
    geo.rotateX(Math.PI / 2); // nose along +z, the pool points +z down the velocity
    this.pool = new BulletPool(scene, geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.5, 0.5) }), 40);
    this.time = 0;
    this.count = 0;
  }

  get list() {
    return this.pool.list;
  }

  launch(from, side) {
    const m = this.pool.spawn(from, steer.set(side * 28, rand(4, 10), -35), 3);
    if (!m) return;
    m.speed = 40;
    m.target = null;
    m.pick = this.count++ % 2; // alternate between the two closest targets
  }

  findTarget(game, m) {
    const near = [];
    for (const e of game.enemies.active) {
      if (!e.alive || e.pos.z > m.pos.z - 4 || e.pos.z < -260) continue;
      near.push([e.pos.distanceToSquared(m.pos), e]);
    }
    if (game.boss.fighting) near.push([game.boss.pos.distanceToSquared(m.pos) * 0.5, game.boss]);
    if (!near.length) return null;
    near.sort((a, b) => a[0] - b[0]);
    return (near[m.pick] || near[0])[1];
  }

  update(dt, game) {
    this.time += dt;
    for (const m of this.pool.list) {
      if (!m.alive) continue;
      const tgt = m.target;
      if (!tgt || !tgt.alive || (tgt === game.boss && !game.boss.fighting)) m.target = this.findTarget(game, m);
      m.speed = Math.min(170, m.speed + 260 * dt);
      if (m.target) {
        steer.subVectors(m.target.pos, m.pos).normalize().multiplyScalar(m.speed);
        m.vel.lerp(steer, 1 - Math.exp(-(3 + m.life * 6) * dt));
      } else {
        steer.set(0, 0, -m.speed);
        m.vel.lerp(steer, 1 - Math.exp(-2 * dt));
      }
      m.vel.setLength(m.speed);
      game.fx.emit(m.pos.x, m.pos.y, m.pos.z, rand(-1, 1), rand(-1, 1), rand(-1, 1), SMOKE, rand(0.7, 1.1), rand(0.35, 0.55), 1.5, 0.9);
      game.fx.emit(m.pos.x, m.pos.y, m.pos.z, 0, 0, 0, FLAME, 0.7, 0.08, 0, 0);
      if (m.life > 3.2) m.alive = false;
    }
    this.pool.update(dt, true, this.time);
  }

  clear() {
    this.pool.clear();
  }
}
