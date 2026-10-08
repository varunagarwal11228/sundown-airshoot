import * as THREE from 'three';
import { DESPAWN_Z } from '../config.js';

const dummy = new THREE.Object3D();
const ahead = new THREE.Vector3();

// Pooled bullets drawn with one InstancedMesh per side: a full screen of
// bullet-hell costs two draw calls.
export class BulletPool {
  constructor(scene, geometry, material, max) {
    this.max = max;
    this.list = [];
    for (let i = 0; i < max; i++) {
      this.list.push({
        alive: false,
        pos: new THREE.Vector3(),
        prev: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        damage: 1,
        scale: 1,
      });
    }
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.cursor = 0;
  }

  spawn(pos, vel, damage = 1, scale = 1) {
    for (let n = 0; n < this.max; n++) {
      const b = this.list[this.cursor];
      this.cursor = (this.cursor + 1) % this.max;
      if (b.alive) continue;
      b.alive = true;
      b.pos.copy(pos);
      b.prev.copy(pos);
      b.vel.copy(vel);
      b.life = 0;
      b.damage = damage;
      b.scale = scale;
      b.pierce = false;
      b.lastHit = null;
      return b;
    }
    return null;
  }

  update(dt, orient, time) {
    let n = 0;
    for (const b of this.list) {
      if (!b.alive) continue;
      b.prev.copy(b.pos);
      b.pos.addScaledVector(b.vel, dt);
      b.life += dt;
      if (b.pos.z > DESPAWN_Z || b.pos.z < -420 || Math.abs(b.pos.x) > 140 || b.pos.y < -5 || b.pos.y > 90 || b.life > 8) {
        b.alive = false;
        continue;
      }
      dummy.position.copy(b.pos);
      if (orient) {
        ahead.copy(b.pos).add(b.vel);
        dummy.lookAt(ahead);
        dummy.scale.setScalar(b.scale);
      } else {
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(b.scale * (0.9 + 0.18 * Math.sin(time * 22 + b.life * 9)));
      }
      dummy.updateMatrix();
      this.mesh.setMatrixAt(n++, dummy.matrix);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (const b of this.list) b.alive = false;
    this.mesh.count = 0;
  }
}

export class Bullets {
  constructor(scene) {
    this.time = 0;
    this.player = new BulletPool(
      scene,
      new THREE.BoxGeometry(0.13, 0.13, 3.2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.5, 2.0) }),
      180
    );
    this.enemy = new BulletPool(
      scene,
      new THREE.IcosahedronGeometry(0.46, 1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 2.3, 2.9) }),
      420
    );
  }

  // Enemy bullets get their own (possibly slowed) timestep for Overdrive.
  update(dt, enemyDt = dt) {
    this.time += dt;
    this.player.update(dt, true, this.time);
    this.enemy.update(enemyDt, false, this.time);
  }

  clear() {
    this.player.clear();
    this.enemy.clear();
  }
}
