import * as THREE from 'three';
import { rand } from '../core/math.js';

const vert = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aAlpha > 0.0 ? min(aSize * uScale / -mv.z, 90.0) : 0.0;
    vColor = aColor;
    vAlpha = aAlpha;
  }
`;

const frag = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor * (0.55 + a * 1.1), a * a * vAlpha);
  }
`;

// One big additive point cloud with a ring-buffer allocator. Cheap enough to
// throw thousands of sparks per second at it.
export class Particles {
  constructor(scene, max = 6000) {
    this.max = max;
    this.cursor = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.life0 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.flow = new Float32Array(max); // how much the world scroll carries it

    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aColor', this.aCol);
    geo.setAttribute('aSize', this.aSize);
    geo.setAttribute('aAlpha', this.aAlpha);

    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 800 } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.tmpColor = new THREE.Color();
  }

  setScale(h, pixelRatio, fov) {
    this.material.uniforms.uScale.value = (h * pixelRatio) / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
  }

  emit(x, y, z, vx, vy, vz, color, size, life, drag = 2, flow = 1) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = color.r; this.col[i3 + 1] = color.g; this.col[i3 + 2] = color.b;
    this.size[i] = this.size0[i] = size;
    this.life[i] = this.life0[i] = life;
    this.alpha[i] = 1;
    this.drag[i] = drag;
    this.flow[i] = flow;
  }

  // Spherical burst. `color` may be a THREE.Color or an array to pick from.
  burst(p, { count = 40, speed = 30, size = 1.2, life = 0.8, color, drag = 2.5, flow = 0.6, spread = 1 }) {
    const colors = Array.isArray(color) ? color : [color];
    for (let n = 0; n < count; n++) {
      const u = rand(-1, 1), a = rand(0, Math.PI * 2), r = Math.sqrt(1 - u * u);
      const s = speed * rand(0.25, 1);
      this.emit(
        p.x, p.y, p.z,
        Math.cos(a) * r * s * spread, u * s * spread, Math.sin(a) * r * s,
        colors[n % colors.length], size * rand(0.5, 1.3), life * rand(0.5, 1.2), drag, flow
      );
    }
  }

  update(dt, worldSpeed) {
    const { pos, vel, life, life0, alpha, size, size0, drag, flow } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) {
        if (alpha[i] !== 0) alpha[i] = 0;
        continue;
      }
      life[i] -= dt;
      const i3 = i * 3;
      const k = Math.exp(-drag[i] * dt);
      vel[i3] *= k; vel[i3 + 1] *= k; vel[i3 + 2] *= k;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += (vel[i3 + 2] + worldSpeed * flow[i]) * dt;
      const t = Math.max(life[i] / life0[i], 0);
      alpha[i] = t * t * (3 - 2 * t);
      size[i] = size0[i] * (0.35 + 0.65 * t);
    }
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aSize.needsUpdate = true;
    this.aAlpha.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
  }
}
