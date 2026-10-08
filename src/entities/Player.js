import * as THREE from 'three';
import { buildShip } from './models.js';
import { BOUNDS, PLAYER } from '../config.js';
import { clamp, damp, lerp, rand, sign, easeInOutCubic } from '../core/math.js';

const shieldShader = {
  uniforms: {
    uColor: { value: new THREE.Color('#3ff0ff') },
    uTime: { value: 0 },
    uAlpha: { value: 0 },
    uFlash: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec3 vN;
    varying vec3 vView;
    varying vec3 vPos;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vView = normalize(-mv.xyz);
      vPos = position;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform float uTime, uAlpha, uFlash;
    varying vec3 vN;
    varying vec3 vView;
    varying vec3 vPos;
    void main() {
      float fres = pow(1.0 - abs(dot(vN, vView)), 2.4);
      float bands = 0.6 + 0.4 * sin(vPos.y * 18.0 - uTime * 7.0);
      float a = (fres * bands + uFlash * 0.5) * uAlpha;
      gl_FragColor = vec4(uColor * (1.4 + uFlash * 2.5), a);
    }
  `,
};

const tmp = new THREE.Vector3();
const tmpVel = new THREE.Vector3();
const trailColor = new THREE.Color('#3ff0ff').multiplyScalar(0.8);
const trailHot = new THREE.Color('#ff3ea5').multiplyScalar(0.9);
const muzzleColor = new THREE.Color('#b5f8ff').multiplyScalar(1.1);

export class Player {
  constructor(scene) {
    this.model = buildShip();
    this.model.rotation.order = 'YXZ';
    scene.add(this.model);

    const shieldGeo = new THREE.SphereGeometry(1, 32, 20);
    this.shield = new THREE.Mesh(
      shieldGeo,
      new THREE.ShaderMaterial({
        ...shieldShader,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      })
    );
    this.shield.scale.set(3.1, 1.3, 2.6);
    this.model.add(this.shield);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.time = 0;
    this.reset();
  }

  reset() {
    this.pos.set(0, 5, 0);
    this.vel.set(0, 0, 0);
    this.target.copy(this.pos);
    this.hull = PLAYER.hull;
    this.shieldHp = 0;
    this.shieldFlash = 0;
    this.invuln = 0;
    this.dashT = 0;
    this.dashCd = 0;
    this.dashDir = 1;
    this.bombs = PLAYER.bombs;
    this.fireCd = 0;
    this.spreadT = 0;
    this.rapidT = 0;
    this.missileT = 0;
    this.missileCd = 0;
    this.od = 0;    // Overdrive meter, 0..1
    this.odT = 0;   // seconds of Overdrive left
    this.bank = 0;
    this.pitch = 0;
    this.side = 0;
    this.alive = true;
    this.shots = 0;
    this.model.visible = true;
    this.model.position.copy(this.pos);
  }

  get dashReady() {
    return 1 - clamp(this.dashCd / PLAYER.dashCooldown, 0, 1);
  }

  // Menu / attract mode: just hover and look pretty.
  idle(dt, fx) {
    this.time += dt;
    this.pos.set(0, 5 + Math.sin(this.time * 1.3) * 0.3, 0);
    this.vel.set(0, Math.cos(this.time * 1.3) * 0.4, 0);
    this.bank = Math.sin(this.time * 0.7) * 0.14;
    this.pitch = Math.sin(this.time * 0.9) * 0.04;
    this.applyTransform(0);
    this.updateEngines(dt, fx, 0.6);
    this.updateShield(dt);
  }

  update(dt, game) {
    this.time += dt;
    const input = game.control; // real input, or the autopilot in demo mode
    const axis = input.axis();

    if (input.pointerActive()) {
      this.target.x = clamp(input.pointer.x * BOUNDS.x * 1.25, -BOUNDS.x, BOUNDS.x);
      this.target.y = clamp(lerp(BOUNDS.yMin, BOUNDS.yMax, (input.pointer.y * 1.2 + 1) / 2), BOUNDS.yMin, BOUNDS.yMax);
    } else {
      this.target.x = clamp(this.target.x + axis.x * 32 * dt, -BOUNDS.x, BOUNDS.x);
      this.target.y = clamp(this.target.y + axis.y * 26 * dt, BOUNDS.yMin, BOUNDS.yMax);
      // Let go of the keys and the aim point eases back under the ship,
      // so the spring doesn't keep dragging you after you stop steering.
      if (axis.x === 0) this.target.x = damp(this.target.x, this.pos.x, 4, dt);
      if (axis.y === 0) this.target.y = damp(this.target.y, this.pos.y, 4, dt);
    }

    // Dash: impulse + barrel roll + i-frames.
    this.dashCd = Math.max(0, this.dashCd - dt);
    if (input.dash && this.dashCd <= 0) {
      const dx = this.target.x - this.pos.x;
      this.dashDir = axis.x !== 0 ? sign(axis.x) : Math.abs(dx) > 0.8 ? sign(dx) : sign(this.vel.x || 1);
      this.vel.x += this.dashDir * 46;
      if (!input.pointerActive()) this.target.x = clamp(this.target.x + this.dashDir * 8, -BOUNDS.x, BOUNDS.x);
      this.dashT = PLAYER.dashTime;
      this.dashCd = PLAYER.dashCooldown;
      game.onDash(this.dashDir);
    }
    if (this.dashT > 0) this.dashT = Math.max(0, this.dashT - dt);

    // Damped spring toward the aim point. Slightly under-damped, which is
    // where the floaty-but-responsive handling comes from.
    const k = PLAYER.stiffness, c = this.dashT > 0 ? PLAYER.damping * 0.35 : PLAYER.damping;
    this.vel.x += ((this.target.x - this.pos.x) * k - this.vel.x * c) * dt;
    this.vel.y += ((this.target.y - this.pos.y) * k - this.vel.y * c) * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    if (Math.abs(this.pos.x) > BOUNDS.x + 1.5) {
      this.pos.x = sign(this.pos.x) * (BOUNDS.x + 1.5);
      this.vel.x *= -0.3;
    }
    if (this.pos.y < BOUNDS.yMin - 0.5 || this.pos.y > BOUNDS.yMax + 1) {
      this.pos.y = clamp(this.pos.y, BOUNDS.yMin - 0.5, BOUNDS.yMax + 1);
      this.vel.y *= -0.3;
    }

    const roll = this.dashT > 0 ? -this.dashDir * Math.PI * 2 * easeInOutCubic(1 - this.dashT / PLAYER.dashTime) : 0;
    this.bank = damp(this.bank, clamp(-this.vel.x * 0.045, -0.95, 0.95), 9, dt);
    this.pitch = damp(this.pitch, clamp(this.vel.y * 0.035, -0.5, 0.5), 9, dt);
    this.applyTransform(roll);

    // Weapons
    this.spreadT = Math.max(0, this.spreadT - dt);
    this.rapidT = Math.max(0, this.rapidT - dt);
    this.missileT = Math.max(0, this.missileT - dt);
    this.fireCd -= dt;
    if (input.firing && this.fireCd <= 0) {
      this.fire(game);
      let interval = this.rapidT > 0 ? PLAYER.rapidInterval : PLAYER.fireInterval;
      if (this.odT > 0) interval *= 0.55;
      this.fireCd = interval;
    }

    if (this.missileT > 0) {
      this.missileCd -= dt;
      if (this.missileCd <= 0) {
        this.missileCd = 0.8;
        for (const tip of this.model.userData.muzzles) {
          tmp.copy(tip);
          this.model.localToWorld(tmp);
          game.missiles.launch(tmp, Math.sign(tip.x));
        }
        game.sfx.missile(this.pos.x / BOUNDS.x);
      }
    }

    // Overdrive
    if (this.odT > 0) {
      this.odT = Math.max(0, this.odT - dt);
      if (this.odT === 0) game.onOverdriveEnd();
    } else if (input.overdrive && this.od >= 1) {
      this.od = 0;
      this.odT = PLAYER.overdriveTime;
      game.onOverdrive();
    }

    if (input.emp && this.bombs > 0) {
      this.bombs--;
      game.detonateEmp();
    }

    if (this.invuln > 0) {
      this.invuln -= dt;
      this.model.visible = this.invuln <= 0 || Math.floor(this.invuln * 18) % 2 === 0;
    } else {
      this.model.visible = true;
    }

    this.updateEngines(dt, game.fx, 1 + (this.dashT > 0 ? 1.2 : 0));
    this.updateShield(dt);
  }

  applyTransform(roll) {
    this.model.position.copy(this.pos);
    this.model.rotation.set(this.pitch, clamp(-this.vel.x * 0.012, -0.25, 0.25), this.bank + roll);
  }

  updateEngines(dt, fx, boost) {
    const { flames, flameMat, exhausts } = this.model.userData;
    for (const f of flames) f.scale.set(1, 1, (0.75 + Math.random() * 0.45) * boost);
    flameMat.opacity = 0.35 + Math.random() * 0.2;
    if (!fx) return;
    for (const e of exhausts) {
      tmp.copy(e);
      this.model.localToWorld(tmp);
      for (let n = 0; n < 2; n++) {
        fx.emit(
          tmp.x + rand(-0.08, 0.08), tmp.y + rand(-0.08, 0.08), tmp.z,
          rand(-1, 1), rand(-1, 1), 10,
          boost > 1.5 ? trailHot : trailColor, rand(0.3, 0.55), rand(0.16, 0.28), 1, 1
        );
      }
    }
  }

  updateShield(dt) {
    this.shieldFlash = Math.max(0, this.shieldFlash - dt * 3);
    const u = this.shield.material.uniforms;
    u.uTime.value = this.time;
    u.uFlash.value = this.shieldFlash;
    u.uAlpha.value = damp(u.uAlpha.value, this.shieldHp > 0 ? 0.18 + (this.shieldHp / PLAYER.shieldMax) * 0.3 : this.shieldFlash, 8, dt);
    this.shield.visible = u.uAlpha.value > 0.01;
  }

  fire(game) {
    const { muzzles } = this.model.userData;
    this.side ^= 1;
    tmp.copy(muzzles[this.side]);
    this.model.localToWorld(tmp);
    tmp.z = Math.min(tmp.z, this.pos.z - 0.5);

    const speed = PLAYER.boltSpeed;
    tmpVel.set(0, 0, -speed);
    const aim = game.aimAssist(tmp);
    if (aim) {
      const t = (tmp.z - aim.z) / speed;
      if (t > 0.02) {
        tmpVel.x = clamp((aim.x - tmp.x) / t, -45, 45);
        tmpVel.y = clamp((aim.y - tmp.y) / t, -45, 45);
      }
    }
    const od = this.odT > 0;
    const bolt = game.bullets.player.spawn(tmp, tmpVel, od ? 2 : 1);
    if (bolt) bolt.pierce = od;
    this.shots++;

    if (this.spreadT > 0) {
      for (const s of [-1, 1]) {
        tmpVel.set(s * 22, 0, -speed);
        const b = game.bullets.player.spawn(tmp.set(this.pos.x + s * 0.6, this.pos.y, this.pos.z - 1), tmpVel, od ? 2 : 1);
        if (b) b.pierce = od;
        this.shots++;
      }
    }

    game.fx.emit(tmp.x, tmp.y, tmp.z - 0.6, 0, 0, -20, muzzleColor, 1.1, 0.05, 0, 0);
    game.sfx.laser(this.pos.x / BOUNDS.x);
  }

  hurt(amount, game) {
    if (!this.alive || this.invuln > 0 || this.dashT > 0 || game.demo) return false;
    if (this.shieldHp > 0) {
      const absorbed = Math.min(this.shieldHp, amount);
      this.shieldHp -= absorbed;
      amount -= absorbed;
      this.shieldFlash = 1;
      game.sfx.shieldHit();
    }
    if (amount > 0) {
      this.hull = Math.max(0, this.hull - amount);
      game.onPlayerDamaged(amount);
    }
    this.invuln = PLAYER.invuln;
    if (this.hull <= 0) this.alive = false;
    return true;
  }
}
