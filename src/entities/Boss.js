import * as THREE from 'three';
import { buildBoss } from './models.js';
import { damp, rand } from '../core/math.js';

const CORE_BASE = new THREE.Color('#ffe66d');
const CORE_HOT = new THREE.Color('#ff2a4d');
const WHITE = new THREE.Color(1, 1, 1);
const from = new THREE.Vector3();
const spot = new THREE.Vector3();

// HELIOS ENGINE. Three phases keyed off remaining HP; every phase swaps the
// bullet patterns and spins the rings faster.
export class Boss {
  constructor(scene) {
    this.model = buildBoss();
    this.model.visible = false;
    scene.add(this.model);
    this.pos = this.model.position;
    this.alive = false;
    this.radius = 8.4;
    this.color = new THREE.Color('#3ff0ff');
  }

  spawn(sector) {
    this.alive = true;
    this.model.visible = true;
    this.model.scale.setScalar(1.3);
    this.maxHp = 240 + 120 * (sector - 1);
    this.hp = this.maxHp;
    this.pos.set(0, 10, -420);
    this.state = 'enter';
    this.t = 0;
    this.phase = 1;
    this.invuln = 0;
    this.flash = 0;
    this.spiral = 0;
    this.spiralT = 0;
    this.cycle = 0;
    this.aimT = 2;
    this.ringT = 1.5;
    this.summonT = 4;
    this.boomT = 0;
  }

  get fighting() {
    return this.alive && this.state === 'fight';
  }

  hit(dmg) {
    if (!this.fighting || this.invuln > 0) return false;
    this.hp -= dmg;
    this.flash = 1;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dying';
      this.t = 0;
      return true;
    }
    return false;
  }

  update(dt, game) {
    if (!this.alive) return;
    const { core, coreMat, shell, rings, podRig } = this.model.userData;
    const diff = game.director.difficulty;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 7);
    this.invuln = Math.max(0, this.invuln - dt);

    const spin = 0.5 + this.phase * 0.5;
    rings[0].rotation.x += dt * 0.7 * spin;
    rings[1].rotation.y += dt * 0.5 * spin;
    rings[2].rotation.z += dt * 0.35 * spin;
    shell.rotation.y += dt * 0.15;
    shell.rotation.x += dt * 0.07;
    podRig.rotation.z += dt * 0.5 * spin;

    const pulse = 0.5 + 0.5 * Math.sin(this.t * (3 + this.phase * 2));
    // Hits tint the core towards white instead of brightening it. Under
    // sustained fire it would otherwise bloom into a blob that hides the boss.
    coreMat.color.copy(this.phase === 3 ? CORE_HOT : CORE_BASE).lerp(WHITE, this.flash * 0.45).multiplyScalar(1.15 + pulse * 0.35 + this.flash * 0.35);
    core.scale.setScalar(1 + this.flash * 0.06 + pulse * 0.04);

    if (this.state === 'enter') {
      this.pos.z = damp(this.pos.z, -92, 0.85, dt);
      this.pos.y = damp(this.pos.y, 8, 0.85, dt);
      if (this.t > 4.2) {
        this.state = 'fight';
        this.t = 0;
        game.onBossEngaged();
      }
      return;
    }

    if (this.state === 'dying') {
      this.boomT -= dt;
      this.model.position.x += Math.sin(this.t * 60) * 0.15;
      if (this.boomT <= 0) {
        this.boomT = 0.11;
        spot.set(rand(-6, 6), rand(-6, 6), rand(-3, 3)).add(this.pos);
        game.explodeAt(spot, this.phase === 3 ? CORE_HOT : this.color, 0.8);
      }
      if (this.t > 2.6) {
        this.alive = false;
        this.model.visible = false;
        game.onBossKilled(this);
      }
      return;
    }

    // -- fight ----------------------------------------------------------------
    this.pos.x = damp(this.pos.x, Math.sin(this.t * 0.4) * 10, 1.5, dt);
    this.pos.y = damp(this.pos.y, 8 + Math.sin(this.t * 0.8) * 2.6, 1.5, dt);
    this.pos.z = damp(this.pos.z, -92 + Math.sin(this.t * 0.3) * 8, 1.5, dt);

    const next = this.hp / this.maxHp > 0.66 ? 1 : this.hp / this.maxHp > 0.33 ? 2 : 3;
    if (next !== this.phase) {
      this.phase = next;
      this.invuln = 1.4;
      game.onBossPhase(this, next);
    }
    if (this.invuln > 0) return;

    from.copy(this.pos).setZ(this.pos.z + 6);
    const enemies = game.enemies;

    if (this.phase === 1) {
      // Rotating spiral that switches on and off, plus aimed triples.
      this.cycle = (this.cycle + dt) % 4.8;
      if (this.cycle < 3.2) {
        this.spiralT -= dt;
        if (this.spiralT <= 0) {
          this.spiralT = 0.1;
          this.spiral += 0.5;
          enemies.ring(game, from, 1, 11, 34 * diff, this.spiral);
          game.sfx.enemyShot(this.pos.x / 20);
        }
      }
      this.aimT -= dt;
      if (this.aimT <= 0) {
        this.aimT = 1.7;
        for (const a of [-0.08, 0, 0.08]) enemies.aimed(game, from, 48 * diff, a, 0.4);
      }
    } else if (this.phase === 2) {
      this.ringT -= dt;
      if (this.ringT <= 0) {
        this.ringT = 2.3;
        this.spiral += Math.PI / 18;
        enemies.ring(game, from, 18, 14, 36 * diff, this.spiral);
        game.sfx.ringShot(this.pos.x / 20);
      }
      this.aimT -= dt;
      if (this.aimT <= 0) {
        this.aimT = 2.8;
        for (const a of [-0.14, -0.07, 0, 0.07, 0.14]) enemies.aimed(game, from, 46 * diff, a, 0.3);
      }
      this.summonT -= dt;
      if (this.summonT <= 0) {
        this.summonT = 8;
        for (let i = 0; i < 4; i++) {
          enemies.spawn('mote', {
            x: this.pos.x + (i - 1.5) * 4, y: this.pos.y, z: this.pos.z + 4,
            speed: 50, amp: 4, freq: 1.4, phase: i, shooter: false,
          });
        }
      }
    } else {
      // Desperation: double spiral + hornet escorts.
      this.spiralT -= dt;
      if (this.spiralT <= 0) {
        this.spiralT = 0.085;
        this.spiral += 0.33;
        enemies.ring(game, from, 2, 12, 38 * diff, this.spiral);
        game.sfx.enemyShot(this.pos.x / 20);
      }
      this.aimT -= dt;
      if (this.aimT <= 0) {
        this.aimT = 1.9;
        for (const a of [-0.06, 0, 0.06]) enemies.aimed(game, from, 50 * diff, a, 0.5);
      }
      this.summonT -= dt;
      if (this.summonT <= 0) {
        this.summonT = 6;
        for (const side of [-1, 1]) {
          enemies.spawn('hornet', {
            x: this.pos.x + side * 9, y: this.pos.y, z: this.pos.z,
            anchorX: side * 8, anchorY: 6, diveZ: -95,
          });
        }
      }
    }
  }

  clear() {
    this.alive = false;
    this.model.visible = false;
  }
}
