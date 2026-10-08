import * as THREE from 'three';
import { buildMote, buildLancer, buildHornet, buildWarden, buildSplitter } from './models.js';
import { DESPAWN_Z } from '../config.js';
import { clamp, damp, rand } from '../core/math.js';

// `od` is how much each kill fills the Overdrive meter (1 = full).
export const ENEMY_TYPES = {
  mote: { hp: 1, radius: 2.3, score: 100, build: buildMote, color: '#ff3ea5', drop: 0.035, od: 0.035 },
  lancer: { hp: 4, radius: 2.8, score: 250, build: buildLancer, color: '#ffb347', drop: 0.12, od: 0.07 },
  hornet: { hp: 2, radius: 2.3, score: 150, build: buildHornet, color: '#ff2a4d', drop: 0.05, od: 0.05 },
  warden: { hp: 16, radius: 4.2, score: 800, build: buildWarden, color: '#ffe66d', drop: 1, od: 0.2 },
  splitter: { hp: 7, radius: 3.4, score: 400, build: buildSplitter, color: '#b26bff', drop: 0.3, od: 0.1 },
};

const tmpDir = new THREE.Vector3();
const tmpFrom = new THREE.Vector3();
const tmpVel = new THREE.Vector3();

class Enemy {
  constructor(type, scene) {
    this.type = type;
    this.def = ENEMY_TYPES[type];
    this.model = this.def.build();
    this.model.visible = false;
    scene.add(this.model);
    this.pos = this.model.position;
    this.vel = new THREE.Vector3();
    this.color = new THREE.Color(this.def.color);
    this.alive = false;
  }

  init(opts) {
    this.alive = true;
    this.model.visible = true;
    this.model.scale.setScalar(1);
    this.model.rotation.set(0, 0, 0);
    this.hp = this.def.hp * (opts.hpScale || 1);
    this.maxHp = this.hp;
    this.radius = this.def.radius;
    this.t = 0;
    this.state = 'enter';
    this.punch = 0;
    this.fired = false;
    this.fireT = rand(0.6, 1.4);
    this.burst = 0;
    this.burstT = 0;
    this.vel.set(0, 0, 0);
    Object.assign(this, opts);
    this.pos.set(opts.x ?? 0, opts.y ?? 6, opts.z ?? -260);
    this.baseX = this.pos.x;
    this.baseY = this.pos.y;
  }

  hit(dmg) {
    this.hp -= dmg;
    this.punch = 1;
    return this.hp <= 0;
  }

  kill() {
    this.alive = false;
    this.model.visible = false;
  }
}

export class Enemies {
  constructor(scene) {
    this.scene = scene;
    this.pools = {};
    this.active = [];
    for (const type of Object.keys(ENEMY_TYPES)) this.pools[type] = [];
  }

  prewarm(counts) {
    for (const [type, n] of Object.entries(counts)) {
      for (let i = 0; i < n; i++) this.pools[type].push(new Enemy(type, this.scene));
    }
  }

  spawn(type, opts = {}) {
    let e = this.pools[type].find((x) => !x.alive);
    if (!e) {
      e = new Enemy(type, this.scene);
      this.pools[type].push(e);
    }
    e.init(opts);
    this.active.push(e);
    return e;
  }

  // -- bullet patterns ------------------------------------------------------
  aimed(game, from, speed, angle = 0, lead = 0.35) {
    const p = game.player.pos;
    const t = Math.abs(p.z - from.z) / speed;
    tmpDir.set(
      p.x + game.player.vel.x * t * lead - from.x,
      p.y + game.player.vel.y * t * lead - from.y,
      p.z - from.z
    ).normalize();
    if (angle) tmpDir.applyAxisAngle(THREE.Object3D.DEFAULT_UP, angle);
    game.bullets.enemy.spawn(from, tmpVel.copy(tmpDir).multiplyScalar(speed));
  }

  // Fires `count` bullets that open into a circle of `radius` by the time
  // they reach the player's plane. Leaves gaps to thread through.
  ring(game, from, count, radius, speed, offset = 0) {
    for (let i = 0; i < count; i++) {
      const a = offset + (i / count) * Math.PI * 2;
      tmpDir.set(Math.cos(a) * radius, Math.sin(a) * radius, -from.z).normalize();
      game.bullets.enemy.spawn(from, tmpVel.copy(tmpDir).multiplyScalar(speed));
    }
  }

  // -- behaviour --------------------------------------------------------------
  update(dt, game) {
    const diff = game.director.difficulty;
    const player = game.player.pos;

    for (const e of this.active) {
      if (!e.alive) continue;
      e.t += dt;
      e.punch = Math.max(0, e.punch - dt * 6);
      const s = 1 + e.punch * 0.22;
      e.model.scale.setScalar(s);

      switch (e.type) {
        case 'mote': {
          e.pos.z += e.speed * dt;
          e.pos.x = e.baseX + Math.sin(e.t * e.freq + e.phase) * e.amp;
          e.pos.y = clamp(e.baseY + Math.cos(e.t * e.freq * 0.7 + e.phase) * e.amp * 0.3, 1, 16);
          e.model.userData.spin.rotation.z += dt * 3;
          e.model.rotation.y = Math.sin(e.t * 2 + e.phase) * 0.4;
          if (e.shooter && !e.fired && e.pos.z > -120) {
            e.fired = true;
            this.aimed(game, tmpFrom.copy(e.pos).setZ(e.pos.z + 1), 40 * diff);
            game.sfx.enemyShot(e.pos.x / 20);
          }
          if (e.pos.z > DESPAWN_Z) e.kill();
          break;
        }

        case 'lancer': {
          if (e.state === 'enter') {
            e.pos.z = damp(e.pos.z, e.holdZ, 1.6, dt);
            e.pos.x = damp(e.pos.x, e.anchorX, 1.4, dt);
            e.pos.y = damp(e.pos.y, e.anchorY, 1.4, dt);
            if (e.t > 2.4) {
              e.state = 'hold';
              e.holdT = 0;
            }
          } else if (e.state === 'hold') {
            e.holdT += dt;
            e.pos.x = damp(e.pos.x, e.anchorX + Math.sin(e.holdT * 0.9 + e.phase) * 6, 3, dt);
            e.pos.y = damp(e.pos.y, e.anchorY + Math.sin(e.holdT * 1.3) * 1.5, 3, dt);
            e.fireT -= dt;
            if (e.fireT <= 0) {
              e.burst = 3;
              e.burstT = 0;
              e.fireT = 2.6 / diff;
            }
            if (e.burst > 0) {
              e.burstT -= dt;
              if (e.burstT <= 0) {
                this.aimed(game, tmpFrom.copy(e.pos).setZ(e.pos.z + 1.5), 46 * diff, 0, 0.5);
                game.sfx.enemyShot(e.pos.x / 20);
                e.burst--;
                e.burstT = 0.14;
              }
            }
            if (e.holdT > e.life) e.state = 'exit';
          } else {
            e.vel.y += 28 * dt;
            e.pos.y += e.vel.y * dt;
            e.pos.z -= 35 * dt;
            if (e.pos.y > 50) e.kill();
          }
          e.model.lookAt(player.x, player.y, player.z + 30);
          e.model.rotation.z += Math.sin(e.t * 2) * 0.1;
          break;
        }

        case 'hornet': {
          if (e.state === 'enter') {
            e.pos.z += 62 * dt;
            e.pos.x = damp(e.pos.x, e.anchorX, 1.2, dt);
            e.pos.y = damp(e.pos.y, e.anchorY, 1.2, dt);
            if (e.pos.z > e.diveZ) {
              e.state = 'dive';
              e.vel.set(0, 0, 62);
              game.sfx.lock(e.pos.x / 20);
            }
          } else {
            if (e.pos.z < player.z - 5) {
              tmpDir.subVectors(player, e.pos).normalize().multiplyScalar(88 * Math.sqrt(diff));
              e.vel.lerp(tmpDir, 1 - Math.exp(-2.3 * dt));
            }
            e.vel.z = Math.max(e.vel.z, 40);
            e.pos.addScaledVector(e.vel, dt);
          }
          tmpDir.copy(e.pos).add(e.state === 'dive' ? e.vel : tmpVel.set(0, 0, 1));
          e.model.lookAt(tmpDir);
          e.model.userData.spin.rotation.z += dt * 9;
          if (e.pos.z > DESPAWN_Z) e.kill();
          break;
        }

        case 'splitter': {
          e.model.userData.spin.rotation.y += dt * 1.2;
          e.model.userData.sats.rotation.z += dt * 2.2;
          if (e.state === 'enter') {
            e.pos.z = damp(e.pos.z, e.holdZ, 1.1, dt);
            e.pos.x = damp(e.pos.x, e.anchorX + Math.sin(e.t * 0.8) * 5, 1.5, dt);
            e.pos.y = damp(e.pos.y, e.anchorY, 1.5, dt);
            e.fireT -= dt;
            if (e.fireT <= 0 && e.t > 2) {
              e.fireT = 2.4 / diff;
              this.aimed(game, tmpFrom.copy(e.pos).setZ(e.pos.z + 2), 42 * diff, 0, 0.3);
              game.sfx.enemyShot(e.pos.x / 20);
            }
            if (e.t > 7) e.state = 'charge';
          } else {
            // drifts at the player, so it has to be dealt with
            e.pos.z += 34 * dt;
            e.pos.x = damp(e.pos.x, player.x, 0.6, dt);
            e.pos.y = damp(e.pos.y, player.y, 0.6, dt);
            if (e.pos.z > DESPAWN_Z) e.kill();
          }
          break;
        }

        case 'warden': {
          const [ringA, ringB] = e.model.userData.rings;
          ringA.rotation.z += dt * 1.4;
          ringB.rotation.y += dt * 0.9;
          e.model.userData.spin.rotation.y += dt * 0.4;
          if (e.state === 'enter') {
            e.pos.z = damp(e.pos.z, e.holdZ, 1.0, dt);
            e.pos.x = damp(e.pos.x, e.anchorX, 1.0, dt);
            if (e.t > 3.5) {
              e.state = 'hold';
              e.holdT = 0;
              e.ringT = 0.5;
            }
          } else if (e.state === 'hold') {
            e.holdT += dt;
            e.pos.y = damp(e.pos.y, e.anchorY + Math.sin(e.holdT * 0.8) * 2, 2, dt);
            e.pos.x = damp(e.pos.x, e.anchorX + Math.sin(e.holdT * 0.5) * 4, 2, dt);
            e.ringT -= dt;
            if (e.ringT <= 0) {
              e.ringT = 3.1 / diff;
              e.ringFlip = !e.ringFlip;
              this.ring(game, tmpFrom.copy(e.pos).setZ(e.pos.z + 2), 12, 13, 36 * diff, e.ringFlip ? Math.PI / 12 : 0);
              game.sfx.ringShot(e.pos.x / 20);
            }
            e.fireT -= dt;
            if (e.fireT <= 0) {
              e.fireT = 2.2 / diff;
              for (const a of [-0.07, 0, 0.07]) this.aimed(game, tmpFrom.copy(e.pos).setZ(e.pos.z + 2), 44 * diff, a, 0.3);
            }
            if (e.holdT > e.life) e.state = 'exit';
          } else {
            e.pos.z -= 45 * dt;
            e.pos.y += 6 * dt;
            if (e.pos.z < -330) e.kill();
          }
          e.model.lookAt(player.x, player.y, player.z + 40);
          break;
        }
      }
    }

    // compact
    let w = 0;
    for (let r = 0; r < this.active.length; r++) {
      if (this.active[r].alive) this.active[w++] = this.active[r];
    }
    this.active.length = w;
  }

  count() {
    return this.active.length;
  }

  clear() {
    for (const e of this.active) e.kill();
    this.active.length = 0;
  }
}
