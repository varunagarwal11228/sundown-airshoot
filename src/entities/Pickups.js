import * as THREE from 'three';
import { buildPickup, PICKUP_COLORS } from './models.js';
import { DESPAWN_Z } from '../config.js';

export const PICKUP_TYPES = Object.keys(PICKUP_COLORS);

const pull = new THREE.Vector3();

export class Pickups {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.active = [];
  }

  spawn(type, pos) {
    let p = this.pool.find((x) => !x.alive && x.type === type);
    if (!p) {
      const model = buildPickup(type);
      this.scene.add(model);
      p = { type, model, pos: model.position, vel: new THREE.Vector3(), color: new THREE.Color(PICKUP_COLORS[type]) };
      this.pool.push(p);
    }
    p.alive = true;
    p.t = Math.random() * 10;
    p.model.visible = true;
    p.pos.copy(pos);
    p.vel.set(0, 0, 26);
    this.active.push(p);
  }

  update(dt, game) {
    const player = game.player;
    for (const p of this.active) {
      p.t += dt;
      const { frame, core, halo } = p.model.userData;
      frame.rotation.y += dt * 1.6;
      frame.rotation.x += dt * 0.7;
      core.rotation.y -= dt * 2.5;
      halo.rotation.x = Math.PI / 2 + Math.sin(p.t * 2) * 0.3;
      halo.scale.setScalar(1 + Math.sin(p.t * 6) * 0.08);

      // Magnet: once you're close, it comes to you.
      pull.subVectors(player.pos, p.pos);
      const d = pull.length();
      if (player.alive && d < 10) {
        p.vel.addScaledVector(pull.normalize(), 140 * dt);
      }
      p.pos.addScaledVector(p.vel, dt);
      p.pos.y += Math.sin(p.t * 3) * 0.6 * dt;

      if (player.alive && d < 2.6) {
        p.alive = false;
        p.model.visible = false;
        game.collect(p.type, p.pos, p.color);
      } else if (p.pos.z > DESPAWN_Z) {
        p.alive = false;
        p.model.visible = false;
      }
    }
    this.active = this.active.filter((p) => p.alive);
  }

  clear() {
    for (const p of this.active) {
      p.alive = false;
      p.model.visible = false;
    }
    this.active = [];
  }
}
