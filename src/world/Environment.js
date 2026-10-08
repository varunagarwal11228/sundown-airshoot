import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';

const SUN_POS = new THREE.Vector3(0, 120, -1500);
const GRID_CELL = 8;

const skyShader = {
  uniforms: {
    uTop: { value: new THREE.Color() },
    uMid: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uFog: { value: new THREE.Color() },
    uSunGlow: { value: new THREE.Color() },
    uSunDir: { value: SUN_POS.clone().normalize() },
  },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uTop, uMid, uHorizon, uFog, uSunGlow, uSunDir;
    varying vec3 vDir;
    void main() {
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.2, h));
      col = mix(col, uTop, smoothstep(0.16, 0.6, h));
      col += uHorizon * exp(-abs(h) * 26.0) * 0.4;
      float s = max(dot(d, uSunDir), 0.0);
      col += uSunGlow * (pow(s, 12.0) * 0.32 + pow(s, 80.0) * 0.22);
      col = mix(col, uFog, smoothstep(0.01, -0.06, h));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

const sunShader = {
  uniforms: {
    uA: { value: new THREE.Color() },
    uB: { value: new THREE.Color() },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uA, uB;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p);
      float disc = smoothstep(1.0, 0.985, r);
      // Retro venetian cuts: thin at the equator, wider toward the bottom,
      // drifting down so the sun looks like it's still sinking.
      float y = vUv.y;
      float band = fract(y * 11.0 + uTime * 0.18);
      float cut = smoothstep(0.62, 0.0, y) * 0.75;
      float open = smoothstep(cut - 0.02, cut + 0.02, band);
      vec3 col = mix(uB, uA, smoothstep(0.05, 0.95, y));
      float a = disc * open;
      gl_FragColor = vec4(col * 1.05, a);
    }
  `,
};

const floorShader = {
  uniforms: {
    uGrid: { value: new THREE.Color() },
    uFloor: { value: new THREE.Color() },
    uFog: { value: new THREE.Color() },
    uSun: { value: new THREE.Color() },
    uOffset: { value: 0 },
    uPulse: { value: 0 },
    uFogFar: { value: 1150 },
  },
  vertexShader: /* glsl */ `
    varying vec3 vWorld;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uGrid, uFloor, uFog, uSun;
    uniform float uOffset, uPulse, uFogFar;
    varying vec3 vWorld;
    void main() {
      vec2 p = vec2(vWorld.x, vWorld.z + uOffset) / ${GRID_CELL.toFixed(1)};
      vec2 f = abs(fract(p - 0.5) - 0.5);
      vec2 aa = f / fwidth(p);
      float line = 1.0 - min(min(aa.x, aa.y), 1.0);
      float glow = exp(-min(f.x, f.y) * 14.0) * 0.28;

      float dist = length(vWorld.xz - cameraPosition.xz);
      float near = 1.0 - smoothstep(60.0, uFogFar, dist);
      float wave = 0.5 + 0.5 * sin(vWorld.z * 0.02 - uPulse * 3.0);

      vec3 col = uFloor;
      col += uGrid * (line * (1.9 + wave * 0.7) + glow) * near * near;
      // Sun reflection streak down the middle of the floor.
      float streak = exp(-abs(vWorld.x) / 55.0) * smoothstep(-200.0, -1100.0, vWorld.z);
      col += uSun * streak * 0.35;
      col = mix(uFog, col, near);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

function ridgeGeometry(rng, { width, cols, rows, height, valley }) {
  const heights = [];
  let h = 0.5;
  for (let i = 0; i <= cols; i++) {
    // Random walk + occasional spikes reads more "mountain" than smooth noise.
    h += (rng() - 0.5) * 0.5;
    h = Math.min(1, Math.max(0.15, h));
    const spike = rng() < 0.12 ? rng() * 0.45 : 0;
    const u = i / cols;
    const centre = Math.abs(u - 0.5) * 2;
    const valleyMask = 0.18 + 0.82 * Math.min(1, Math.pow(centre / valley, 2));
    heights.push((h + spike) * height * valleyMask);
  }

  const pos = [];
  const idx = [];
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    for (let i = 0; i <= cols; i++) {
      const x = (i / cols - 0.5) * width;
      const jitter = r > 0 && r < rows ? (rng() - 0.5) * (width / cols) * 0.5 : 0;
      pos.push(x + jitter, -30 + (heights[i] + 30) * t, 0);
    }
  }
  const stride = cols + 1;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) {
      const a = r * stride + i, b = a + 1, c = a + stride, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);

  const top = [];
  for (let i = 0; i <= cols; i++) top.push(pos[(rows * stride + i) * 3], pos[(rows * stride + i) * 3 + 1], 0.5);
  const ridge = new THREE.BufferGeometry();
  ridge.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
  return { geo, ridge };
}

export class Environment {
  constructor(scene, palette) {
    this.palette = palette;
    this.offset = 0;
    this.time = 0;

    scene.fog = new THREE.Fog(0x000000, 160, 1250);
    this.fog = scene.fog;

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(2000, 32, 16),
      new THREE.ShaderMaterial({ ...skyShader, side: THREE.BackSide, depthWrite: false, fog: false })
    );
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    this.sun = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({ ...sunShader, transparent: true, depthWrite: false, fog: false })
    );
    this.sun.scale.setScalar(560);
    this.sun.position.copy(SUN_POS);
    this.sun.renderOrder = -7; // after the star dome, so stars don't sit on the disc
    scene.add(this.sun);

    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(2600, 1500, 1, 1),
      new THREE.ShaderMaterial({ ...floorShader, fog: false })
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.set(0, 0, -600);
    scene.add(this.floor);

    // Three mountain bands. Each one tracks the camera by a different amount,
    // which is what sells the parallax when the ship slides sideways.
    const rng = mulberry32(2189);
    this.ranges = [];
    const bands = [
      { z: -1150, width: 3200, cols: 70, rows: 3, height: 210, valley: 0.22, follow: 0.92, shade: 0.55, wire: false },
      { z: -950, width: 2600, cols: 60, rows: 4, height: 150, valley: 0.3, follow: 0.75, shade: 0.3, wire: false },
      { z: -760, width: 2200, cols: 54, rows: 5, height: 95, valley: 0.4, follow: 0.5, shade: 0.0, wire: true },
    ];
    for (const b of bands) {
      const { geo, ridge } = ridgeGeometry(rng, b);
      const group = new THREE.Group();
      const body = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
      const line = new THREE.Line(ridge, new THREE.LineBasicMaterial({ color: 0xffffff, fog: false, transparent: true }));
      group.add(body, line);
      let wire = null;
      if (b.wire) {
        wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          color: 0xffffff, wireframe: true, transparent: true, opacity: 0.16, fog: false, depthWrite: false,
        }));
        wire.position.z = 0.2;
        group.add(wire);
      }
      group.position.z = b.z;
      scene.add(group);
      this.ranges.push({ ...b, group, body, line, wire });
    }

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1.4);
    this.key = new THREE.DirectionalLight(0xffffff, 2.4);
    this.key.position.copy(SUN_POS).normalize();
    this.rim = new THREE.DirectionalLight(0xffffff, 1.6);
    this.rim.position.set(-0.6, -0.4, 1);
    scene.add(this.hemi, this.key, this.rim);
  }

  pulse() {
    this.floor.material.uniforms.uPulse.value = this.time;
  }

  // `dim` (0..1) darkens the whole backdrop during play so enemies and
  // bullets read clearly against it. The menu runs at full brightness.
  update(dt, speed, camera, dim = 1) {
    const c = this.palette.c;
    // The sky and grid are the biggest bright areas, so they dim harder.
    const skyDim = Math.pow(dim, 1.5);
    const gridDim = Math.pow(dim, 1.25);
    this.time += dt;
    this.offset = (this.offset + speed * dt) % GRID_CELL;

    this.sky.position.copy(camera.position);
    const su = this.sky.material.uniforms;
    su.uTop.value.copy(c.skyTop).multiplyScalar(skyDim);
    su.uMid.value.copy(c.skyMid).multiplyScalar(skyDim);
    su.uHorizon.value.copy(c.horizon).multiplyScalar(skyDim);
    su.uFog.value.copy(c.fog).multiplyScalar(skyDim);
    su.uSunGlow.value.copy(c.sunB).multiplyScalar(skyDim);

    // The sun sits at "infinity": it rides with the camera.
    this.sun.position.set(camera.position.x + SUN_POS.x, SUN_POS.y, SUN_POS.z + camera.position.z);
    this.sun.lookAt(camera.position.x, SUN_POS.y * 0.6, camera.position.z);
    const sn = this.sun.material.uniforms;
    sn.uA.value.copy(c.sunA).multiplyScalar(dim);
    sn.uB.value.copy(c.sunB).multiplyScalar(dim);
    sn.uTime.value = this.time;

    const fu = this.floor.material.uniforms;
    fu.uGrid.value.copy(c.grid).multiplyScalar(gridDim);
    fu.uFloor.value.copy(c.floor).multiplyScalar(dim);
    fu.uFog.value.copy(c.fog).multiplyScalar(skyDim);
    fu.uSun.value.copy(c.sunB).multiplyScalar(skyDim);
    fu.uOffset.value = this.offset;
    this.floor.position.x = camera.position.x;

    this.fog.color.copy(c.fog).multiplyScalar(skyDim);

    for (const r of this.ranges) {
      r.group.position.x = camera.position.x * r.follow;
      r.group.position.y = (camera.position.y - 5) * r.follow * 0.5;
      r.body.material.color.copy(c.mountain).lerp(c.fog, r.shade).multiplyScalar(dim);
      r.line.material.color.copy(c.ridge).multiplyScalar((r.wire ? 2.6 : 1.2 - r.shade) * dim);
      if (r.wire) r.wire.material.color.copy(c.ridge).multiplyScalar(dim);
    }

    this.hemi.color.copy(c.horizon);
    this.hemi.groundColor.copy(c.floor);
    this.key.color.copy(c.sunB);
    this.rim.color.copy(c.accent);
  }
}
