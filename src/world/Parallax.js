import * as THREE from 'three';
import { rand, pick } from '../core/math.js';

// Everything that scrolls. Each layer has its own `factor` of world speed:
// far layers crawl, near layers rip past. Combined with the mountain bands
// in Environment that track the camera, that's the parallax stack:
//
//   sky dome (0) > mountains (camera-locked) > city (0.45) > dust (0.3..1.4)
//   > pylons + gates (1.0) > ship trail particles (free)

const pointsVert = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  attribute vec3 aColor;
  uniform float uScale, uTime, uFar, uMaxSize;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float z = -mv.z;
    float twinkle = 0.6 + 0.4 * sin(uTime * (1.2 + aSeed * 3.0) + aSeed * 50.0);
    vAlpha = twinkle * smoothstep(2.0, 30.0, z) * (1.0 - smoothstep(uFar * 0.7, uFar, z));
    gl_PointSize = clamp(aSize * uScale / z, 1.0, uMaxSize);
    vColor = aColor;
  }
`;

const pointsFrag = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d);
    gl_FragColor = vec4(vColor * uOpacity, a * vAlpha);
  }
`;

function pointsMaterial(far, maxSize, opacity) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uScale: { value: 800 },
      uTime: { value: 0 },
      uFar: { value: far },
      uMaxSize: { value: maxSize },
      uOpacity: { value: opacity },
    },
    vertexShader: pointsVert,
    fragmentShader: pointsFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  m.userData.opacity = opacity;
  return m;
}

const TINTS = ['#ffffff', '#ffd6f0', '#c9f6ff', '#ffe9b0'].map((c) => new THREE.Color(c));

function makeCloud(count, fill) {
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const seed = new Float32Array(count);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    fill(pos, i);
    seed[i] = Math.random();
    const t = pick(TINTS);
    col.set([t.r, t.g, t.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  return geo;
}

const dummy = new THREE.Object3D();

export class Parallax {
  constructor(scene, palette) {
    this.palette = palette;
    this.time = 0;
    this.materials = [];

    // -- far stars: a dome that rides with the camera (zero parallax) ------
    const domeGeo = makeCloud(1600, (p, i) => {
      const y = rand(0.04, 1);
      const a = rand(0, Math.PI * 2);
      const r = Math.sqrt(1 - y * y);
      p.set([Math.cos(a) * r * 1700, y * 1700, Math.sin(a) * r * 1700], i * 3);
    });
    domeGeo.attributes.aSize.array.forEach((_, i, arr) => (arr[i] = rand(3, 7)));
    this.dome = new THREE.Points(domeGeo, pointsMaterial(5000, 3.5, 1.3));
    this.dome.renderOrder = -8;
    this.dome.frustumCulled = false;
    scene.add(this.dome);
    this.materials.push(this.dome.material);

    // -- dust: three depth bands scrolling toward the camera ---------------
    this.dust = [
      { count: 700, factor: 0.32, x: 520, y: [30, 320], z: [-1300, 40], size: [5, 9], max: 3, op: 0.9 },
      { count: 380, factor: 0.75, x: 200, y: [6, 110], z: [-800, 40], size: [2.5, 4], max: 4, op: 1.0 },
      { count: 160, factor: 1.4, x: 70, y: [0.5, 45], z: [-360, 40], size: [1.2, 1.8], max: 6, op: 1.2 },
    ].map((cfg) => {
      const geo = makeCloud(cfg.count, (p, i) => {
        p.set([rand(-cfg.x, cfg.x), rand(cfg.y[0], cfg.y[1]), rand(cfg.z[0], cfg.z[1])], i * 3);
      });
      geo.attributes.aSize.array.forEach((_, i, arr) => (arr[i] = rand(cfg.size[0], cfg.size[1])));
      const pts = new THREE.Points(geo, pointsMaterial(-cfg.z[0], cfg.max, cfg.op));
      pts.frustumCulled = false;
      scene.add(pts);
      this.materials.push(pts.material);
      return { ...cfg, pts, range: cfg.z[1] - cfg.z[0] };
    });

    // -- pylons lining the corridor ----------------------------------------
    const PYLONS = 72;
    this.pylonRange = 1200;
    this.pylons = [];
    for (let i = 0; i < PYLONS; i++) {
      const side = i % 2 ? 1 : -1;
      this.pylons.push(this.rollPylon({ side, z: -(i / PYLONS) * this.pylonRange + 40 }));
    }
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.pylonMesh = new THREE.InstancedMesh(
      box,
      new THREE.MeshStandardMaterial({ color: 0x0c0820, roughness: 0.55, metalness: 0.4, flatShading: true }),
      PYLONS
    );
    this.capMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.capMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.capMat, PYLONS);
    this.stripMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.stripMesh = new THREE.InstancedMesh(box, this.stripMat, PYLONS);
    for (const m of [this.pylonMesh, this.capMesh, this.stripMesh]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      scene.add(m);
    }

    // -- distant city blocks, slower than the world: reads as "far" --------
    const BLOCKS = 170;
    this.cityRange = 1300;
    this.blocks = [];
    for (let i = 0; i < BLOCKS; i++) {
      const side = i % 2 ? 1 : -1;
      this.blocks.push({
        x: side * rand(75, 330),
        z: rand(-1250, 50),
        w: rand(10, 30),
        d: rand(10, 30),
        h: rand(18, 150) * (Math.random() < 0.15 ? 1.6 : 1),
        beacon: Math.random() < 0.35,
      });
    }
    this.cityMesh = new THREE.InstancedMesh(
      box,
      new THREE.MeshStandardMaterial({ color: 0x0a0618, roughness: 0.9, metalness: 0.1, flatShading: true }),
      BLOCKS
    );
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.beaconMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.beaconMat, BLOCKS);
    for (const m of [this.cityMesh, this.beaconMesh]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      scene.add(m);
    }

    // -- neon gates the ship flies through ----------------------------------
    this.gateRange = 1140;
    this.gateMatA = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.gateMatB = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.gates = [0, 1, 2].map((i) => {
      const g = new THREE.Group();
      const outer = [
        new THREE.Mesh(new THREE.BoxGeometry(0.9, 34, 0.9), this.gateMatA),
        new THREE.Mesh(new THREE.BoxGeometry(0.9, 34, 0.9), this.gateMatA),
        new THREE.Mesh(new THREE.BoxGeometry(60, 0.9, 0.9), this.gateMatA),
      ];
      outer[0].position.set(-30, 17, 0);
      outer[1].position.set(30, 17, 0);
      outer[2].position.set(0, 34, 0);
      const inner = [
        new THREE.Mesh(new THREE.BoxGeometry(0.35, 30, 0.35), this.gateMatB),
        new THREE.Mesh(new THREE.BoxGeometry(0.35, 30, 0.35), this.gateMatB),
        new THREE.Mesh(new THREE.BoxGeometry(53, 0.35, 0.35), this.gateMatB),
      ];
      inner[0].position.set(-27, 15, -3);
      inner[1].position.set(27, 15, -3);
      inner[2].position.set(0, 30, -3);
      g.add(...outer, ...inner);
      g.position.z = -300 - i * (this.gateRange / 3);
      scene.add(g);
      return g;
    });
  }

  rollPylon(p) {
    p.x = p.side * rand(24, 48);
    p.w = rand(1.6, 4.5);
    p.d = rand(1.6, 4.5);
    p.h = rand(5, 34) * (Math.random() < 0.2 ? 1.7 : 1);
    return p;
  }

  setPointScale(h, pixelRatio, fov) {
    const scale = (h * pixelRatio) / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    for (const m of this.materials) m.uniforms.uScale.value = scale;
  }

  update(dt, speed, camera, dim = 1) {
    const c = this.palette.c;
    this.time += dt;
    for (const m of this.materials) {
      m.uniforms.uTime.value = this.time;
      m.uniforms.uOpacity.value = m.userData.opacity * (0.35 + 0.65 * dim);
    }

    this.dome.position.copy(camera.position);

    for (const layer of this.dust) {
      const arr = layer.pts.geometry.attributes.position.array;
      const dz = speed * layer.factor * dt;
      for (let i = 2; i < arr.length; i += 3) {
        arr[i] += dz;
        if (arr[i] > layer.z[1]) arr[i] -= layer.range;
      }
      layer.pts.geometry.attributes.position.needsUpdate = true;
      layer.pts.position.x = camera.position.x * (1 - layer.factor) * 0.6;
    }

    // pylons
    const pdz = speed * dt;
    this.capMat.color.copy(c.ridge).multiplyScalar(3.2 * dim);
    this.stripMat.color.copy(c.accent).multiplyScalar(2.2 * dim);
    this.pylons.forEach((p, i) => {
      p.z += pdz;
      if (p.z > 40) {
        p.z -= this.pylonRange;
        this.rollPylon(p);
      }
      dummy.position.set(p.x, 0, p.z);
      dummy.scale.set(p.w, p.h, p.d);
      dummy.updateMatrix();
      this.pylonMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.set(p.x, p.h, p.z);
      dummy.scale.set(p.w * 1.12, 0.35, p.d * 1.12);
      dummy.updateMatrix();
      this.capMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.set(p.x - p.side * (p.w / 2 + 0.04), 0, p.z);
      dummy.scale.set(0.14, p.h * 0.85, 0.14);
      dummy.updateMatrix();
      this.stripMesh.setMatrixAt(i, dummy.matrix);
    });
    this.pylonMesh.instanceMatrix.needsUpdate = true;
    this.capMesh.instanceMatrix.needsUpdate = true;
    this.stripMesh.instanceMatrix.needsUpdate = true;

    // city
    const cdz = speed * 0.45 * dt;
    this.beaconMat.color.copy(c.horizon).multiplyScalar(2.5 * dim);
    this.blocks.forEach((b, i) => {
      b.z += cdz;
      if (b.z > 60) {
        b.z -= this.cityRange;
        b.h = rand(18, 150);
      }
      const x = b.x + camera.position.x * 0.3;
      dummy.position.set(x, 0, b.z);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.updateMatrix();
      this.cityMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, b.h + 1.2, b.z);
      const s = b.beacon ? 1.6 : 0;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      this.beaconMesh.setMatrixAt(i, dummy.matrix);
    });
    this.cityMesh.instanceMatrix.needsUpdate = true;
    this.beaconMesh.instanceMatrix.needsUpdate = true;

    // gates
    this.gateMatA.color.copy(c.ridge).multiplyScalar(2.6 * dim);
    this.gateMatB.color.copy(c.accent).multiplyScalar(1.8 * dim);
    for (const g of this.gates) {
      g.position.z += pdz;
      if (g.position.z > 40) g.position.z -= this.gateRange;
    }
  }
}
