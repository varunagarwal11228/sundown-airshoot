import * as THREE from 'three';
import { easeOutCubic } from '../core/math.js';

const tmp = new THREE.Vector3();

// Expanding billboard rings in the world, plus a matching screen-space ripple
// that the lens shader uses to bend the image (the "fluid" refraction look).
export class Shockwaves {
  constructor(scene, lensUniforms, size = 14) {
    this.lens = lensUniforms;
    this.geo = new THREE.RingGeometry(0.86, 1, 64);
    this.pool = [];
    for (let i = 0; i < size; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, t: 1, dur: 1, radius: 1, strength: 0, world: new THREE.Vector3(), alive: false });
    }
    this.cursor = 0;
  }

  spawn(pos, { color, radius = 10, duration = 0.6, strength = 0.03 }) {
    const s = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    s.alive = true;
    s.t = 0;
    s.dur = duration;
    s.radius = radius;
    s.strength = strength;
    s.world.copy(pos);
    s.mesh.visible = true;
    s.mesh.position.copy(pos);
    s.mesh.material.color.copy(color).multiplyScalar(2.2);
  }

  update(dt, camera, worldSpeed) {
    const live = [];
    for (const s of this.pool) {
      if (!s.alive) continue;
      s.t += dt / s.dur;
      if (s.t >= 1) {
        s.alive = false;
        s.mesh.visible = false;
        continue;
      }
      const e = easeOutCubic(s.t);
      s.world.z += worldSpeed * 0.4 * dt;
      s.mesh.position.copy(s.world);
      s.mesh.scale.setScalar(0.5 + s.radius * e);
      s.mesh.quaternion.copy(camera.quaternion);
      s.mesh.material.opacity = (1 - s.t) * (1 - s.t);
      live.push(s);
    }

    // Feed the four strongest ripples to the lens shader.
    live.sort((a, b) => b.strength * (1 - b.t) - a.strength * (1 - a.t));
    const slots = this.lens.uShock.value;
    for (let i = 0; i < slots.length; i++) {
      const s = live[i];
      if (!s || s.strength <= 0) {
        slots[i].set(0, 0, 0, 0);
        continue;
      }
      tmp.copy(s.world).project(camera);
      if (tmp.z > 1) {
        slots[i].set(0, 0, 0, 0);
        continue;
      }
      const e = easeOutCubic(s.t);
      slots[i].set(tmp.x * 0.5 + 0.5, tmp.y * 0.5 + 0.5, 0.02 + e * 0.35 * Math.min(1, s.radius / 14), s.strength * (1 - s.t));
    }
  }

  clear() {
    for (const s of this.pool) {
      s.alive = false;
      s.mesh.visible = false;
    }
    for (const v of this.lens.uShock.value) v.set(0, 0, 0, 0);
  }
}
