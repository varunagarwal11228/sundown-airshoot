import * as THREE from 'three';

// All meshes are built in code: low-poly hulls, flat shading, and an outline
// pass via EdgesGeometry. Colours above 1.0 are intentional: they push the
// lines past the bloom threshold so they glow.

const cache = new Map();
const cached = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};

export const neon = (hex, k = 2.5) =>
  cached(`line:${hex}:${k}`, () => new THREE.LineBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), fog: false }));

export const glow = (hex, k = 3) =>
  cached(`glow:${hex}:${k}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), fog: false }));

// Enemy hulls are lit in their own colour (kept under the bloom threshold),
// so you read a solid shape instead of a glowing dot.
const skin = (hex) =>
  cached(`skin:${hex}`, () => new THREE.MeshStandardMaterial({
    color: 0x2a1d45, emissive: new THREE.Color(hex), emissiveIntensity: 0.45,
    metalness: 0.35, roughness: 0.5, flatShading: true, fog: false,
  }));

// Soft coloured rim light behind each enemy. Depth-tested, so the hull
// covers the middle and only the edge glows.
let haloTex = null;
function haloTexture() {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.3)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  haloTex = new THREE.CanvasTexture(c);
  return haloTex;
}
function halo(hex, size, opacity = 0.2) {
  const mat = cached(`halo:${hex}:${opacity}`, () => new THREE.SpriteMaterial({
    map: haloTexture(), color: new THREE.Color(hex), transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(size);
  sprite.renderOrder = 2;
  return sprite;
}

// Scales the inner model without touching the outer group, which the game
// rescales every frame for the hit "punch".
function sized(inner, k) {
  const outer = new THREE.Group();
  inner.scale.setScalar(k);
  outer.add(inner);
  outer.userData = inner.userData;
  return outer;
}

const hullMat = new THREE.MeshStandardMaterial({
  color: 0x1d1640, metalness: 0.55, roughness: 0.34, flatShading: true, side: THREE.DoubleSide,
});
const darkMat = new THREE.MeshStandardMaterial({
  color: 0x0e0a1f, metalness: 0.5, roughness: 0.45, flatShading: true,
});
const glassMat = new THREE.MeshStandardMaterial({
  color: 0x06202c, emissive: new THREE.Color('#3ff0ff'), emissiveIntensity: 0.55,
  metalness: 0.9, roughness: 0.12, flatShading: true,
});

function edged(geo, mat, lineMat, threshold = 18) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, mat));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, threshold), lineMat));
  return g;
}

// ---------------------------------------------------------------------------
// KESTREL-7, the player ship. Nose points down -z.
export function buildShip() {
  const root = new THREE.Group();
  const cyan = neon('#3ff0ff', 2.2);
  const pink = neon('#ff3ea5', 2.6);

  const hullGeo = new THREE.CylinderGeometry(0.06, 0.62, 3.8, 6, 1);
  hullGeo.rotateX(-Math.PI / 2);
  hullGeo.scale(1.15, 0.55, 1);
  const hull = edged(hullGeo, hullMat, cyan);
  hull.position.z = -0.2;
  root.add(hull);

  const canopyGeo = new THREE.SphereGeometry(0.4, 10, 6);
  canopyGeo.scale(0.75, 0.5, 1.9);
  const canopy = new THREE.Mesh(canopyGeo, glassMat);
  canopy.position.set(0, 0.24, -0.5);
  root.add(canopy);

  const wingShape = new THREE.Shape();
  wingShape.moveTo(0.25, -0.7);
  wingShape.lineTo(2.7, 0.75);
  wingShape.lineTo(2.85, 1.25);
  wingShape.lineTo(0.25, 1.35);
  wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.09, bevelEnabled: false });
  wingGeo.rotateX(Math.PI / 2);
  wingGeo.translate(0, 0.045, 0);
  const wingGeoL = wingGeo.clone().scale(-1, 1, 1);

  const wingR = edged(wingGeo, hullMat, cyan, 30);
  const wingL = edged(wingGeoL, hullMat, cyan, 30);
  wingR.position.y = wingL.position.y = -0.06;
  wingR.rotation.z = 0.07;
  wingL.rotation.z = -0.07;
  root.add(wingR, wingL);

  const tipGeo = new THREE.BoxGeometry(0.1, 0.1, 0.6);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(tipGeo, glow('#ff3ea5', 1.5));
    tip.position.set(side * 2.78, 0.12, 1.0);
    root.add(tip);
  }

  const finShape = new THREE.Shape();
  finShape.moveTo(-0.6, 0);
  finShape.lineTo(-1.55, 0);
  finShape.lineTo(-1.75, 0.82);
  finShape.lineTo(-1.3, 0.82);
  finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.06, bevelEnabled: false });
  finGeo.rotateY(Math.PI / 2);
  for (const side of [-1, 1]) {
    const fin = edged(finGeo, hullMat, pink, 30);
    fin.position.set(side * 0.36, 0.12, 0);
    fin.rotation.z = -side * 0.32;
    root.add(fin);
  }

  const nacelleGeo = new THREE.CylinderGeometry(0.2, 0.27, 1.05, 8);
  nacelleGeo.rotateX(Math.PI / 2);
  const flameGeo = new THREE.ConeGeometry(0.17, 1.8, 12, 1, true);
  flameGeo.rotateX(Math.PI / 2);
  flameGeo.translate(0, 0, 0.9);
  const flameMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#3ff0ff').multiplyScalar(1.6),
    transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const flames = [];
  const exhausts = [];
  for (const side of [-1, 1]) {
    const nac = edged(nacelleGeo, darkMat, pink, 25);
    nac.position.set(side * 0.52, -0.02, 1.3);
    const nozzle = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), glow('#b5f8ff', 1.2));
    nozzle.position.set(side * 0.52, -0.02, 1.84);
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(side * 0.52, -0.02, 1.86);
    root.add(nac, nozzle, flame);
    flames.push(flame);
    exhausts.push(new THREE.Vector3(side * 0.52, -0.02, 2.0));
  }

  root.userData = {
    flames,
    flameMat,
    exhausts,
    muzzles: [new THREE.Vector3(-0.95, -0.04, -0.7), new THREE.Vector3(0.95, -0.04, -0.7)],
  };
  return root;
}

// ---------------------------------------------------------------------------
// Enemies face +z (toward the player).
export function buildMote() {
  const c = '#ff3ea5';
  const g = new THREE.Group();
  const bodyGeo = new THREE.OctahedronGeometry(1.05, 0);
  bodyGeo.scale(1, 0.7, 1);
  const body = edged(bodyGeo, skin(c), neon(c, 2.4));
  const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), glow('#ffd6ec', 2));
  eye.position.z = 0.8;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.06, 4, 28), glow(c, 1.5));
  ring.rotation.x = Math.PI / 2;
  g.add(halo(c, 4.6), body, eye, ring);
  g.userData.spin = body;
  return sized(g, 1.6);
}

export function buildLancer() {
  const c = '#ffb347';
  const g = new THREE.Group();
  const line = neon(c, 2.4);
  const bodyGeo = new THREE.ConeGeometry(0.95, 3.0, 4);
  bodyGeo.rotateX(Math.PI / 2);
  bodyGeo.scale(1.7, 0.5, 1);
  g.add(halo(c, 6), edged(bodyGeo, skin(c), line));
  const podGeo = new THREE.BoxGeometry(0.42, 0.42, 1.9);
  for (const side of [-1, 1]) {
    const pod = edged(podGeo, skin(c), line);
    pod.position.set(side * 1.6, 0, -0.3);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.3), glow('#ff9a3d', 1.8));
    tip.position.set(side * 1.6, 0, 0.75);
    g.add(pod, tip);
  }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), glow('#ffd2a6', 2));
  eye.position.set(0, 0.14, 0.7);
  g.add(eye);
  return sized(g, 1.45);
}

export function buildHornet() {
  const c = '#ff2a4d';
  const g = new THREE.Group();
  const body = edged(new THREE.TetrahedronGeometry(1.15, 0), skin(c), neon(c, 2.6));
  const stingGeo = new THREE.ConeGeometry(0.22, 1.5, 5);
  stingGeo.rotateX(Math.PI / 2);
  const sting = new THREE.Mesh(stingGeo, glow('#ff8a9a', 2));
  sting.position.z = 1.1;
  g.add(halo(c, 4.4), body, sting);
  g.userData.spin = body;
  return sized(g, 1.6);
}

export function buildWarden() {
  const c = '#ffe66d';
  const g = new THREE.Group();
  const body = edged(new THREE.IcosahedronGeometry(2.0, 0), skin(c), neon(c, 2.2));
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.13, 6, 48), glow(c, 0.95));
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(3.7, 0.07, 4, 48), glow('#ff3ea5', 1));
  ringB.rotation.x = Math.PI / 2;
  const eye = new THREE.Mesh(new THREE.CircleGeometry(0.7, 6), glow('#fff3c4', 1.8));
  eye.position.z = 1.72;
  g.add(halo(c, 9, 0.1), body, ringA, ringB, eye);
  g.userData.spin = body;
  g.userData.rings = [ringA, ringB];
  return sized(g, 1.35);
}

// Splitter: a fat crystal with four orbiting shards that break off as
// fast drones when it dies.
export function buildSplitter() {
  const c = '#b26bff';
  const g = new THREE.Group();
  const coreGeo = new THREE.OctahedronGeometry(1.7, 0);
  coreGeo.scale(1, 1.3, 1);
  const core = edged(coreGeo, skin(c), neon(c, 2.4));
  const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), glow('#eedcff', 2));
  heart.position.z = 1.2;
  const sats = new THREE.Group();
  const satGeo = new THREE.TetrahedronGeometry(0.55, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const sat = edged(satGeo, skin(c), neon(c, 2.6));
    sat.position.set(Math.cos(a) * 2.7, Math.sin(a) * 2.7, 0);
    sats.add(sat);
  }
  g.add(halo(c, 8, 0.15), core, heart, sats);
  g.userData.spin = core;
  g.userData.sats = sats;
  return sized(g, 1.4);
}

// ---------------------------------------------------------------------------
// HELIOS ENGINE. Translucent armour over a hot core, three gyroscope rings.
export function buildBoss() {
  const g = new THREE.Group();

  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe66d').multiplyScalar(1.6), fog: false });
  const core = new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 16), coreMat);

  const shellGeo = new THREE.IcosahedronGeometry(5.2, 1);
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0x22163f, emissive: new THREE.Color('#3ff0ff'), emissiveIntensity: 0.12,
    metalness: 0.6, roughness: 0.3, flatShading: true,
    transparent: true, opacity: 0.82, depthWrite: false, fog: false,
  });
  const shell = new THREE.Group();
  shell.add(new THREE.Mesh(shellGeo, shellMat));
  shell.add(new THREE.LineSegments(new THREE.EdgesGeometry(shellGeo, 1), neon('#3ff0ff', 3)));

  const spikeGeo = new THREE.ConeGeometry(0.45, 3.2, 5);
  const up = new THREE.Vector3(0, 1, 0);
  for (const [x, y, z] of [[1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1], [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1]]) {
    const dir = new THREE.Vector3(x, y, z).normalize();
    const spike = edged(spikeGeo, darkMat, neon('#ff3ea5', 2.6));
    spike.quaternion.setFromUnitVectors(up, dir);
    spike.position.copy(dir).multiplyScalar(5.6);
    shell.add(spike);
  }

  const rings = [
    new THREE.Mesh(new THREE.TorusGeometry(8, 0.55, 8, 96), glow('#ff3ea5', 1.7)),
    new THREE.Mesh(new THREE.TorusGeometry(10.5, 0.38, 6, 110), glow('#3ff0ff', 1.5)),
    new THREE.Mesh(new THREE.TorusGeometry(13, 0.26, 4, 128), glow('#ffb347', 1.3)),
  ];
  rings[1].rotation.x = Math.PI / 2;
  rings[2].rotation.y = Math.PI / 2;

  const podRig = new THREE.Group();
  const pods = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const pod = edged(new THREE.OctahedronGeometry(1.5, 0), darkMat, neon('#ff3ea5', 3.2));
    pod.position.set(Math.cos(a) * 10.5, Math.sin(a) * 10.5, 0);
    podRig.add(pod);
    pods.push(pod);
  }

  g.add(core, shell, ...rings, podRig);
  g.userData = { core, coreMat, shell, rings, podRig, pods };
  return g;
}

// ---------------------------------------------------------------------------
export const PICKUP_COLORS = {
  spread: '#ff3ea5',
  rapid: '#ffe66d',
  shield: '#3ff0ff',
  repair: '#5dffa8',
  emp: '#ffffff',
  missile: '#ff8a3d',
};

export function buildPickup(type) {
  const color = PICKUP_COLORS[type];
  const g = new THREE.Group();
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(1.1, 0)), neon(color, 2.4));
  const coreGeo = {
    spread: () => new THREE.TetrahedronGeometry(0.5, 0),
    rapid: () => new THREE.BoxGeometry(0.6, 0.6, 0.6),
    shield: () => new THREE.IcosahedronGeometry(0.45, 0),
    repair: () => new THREE.BoxGeometry(0.75, 0.24, 0.24),
    emp: () => new THREE.TorusGeometry(0.38, 0.1, 6, 16),
    missile: () => new THREE.ConeGeometry(0.28, 0.9, 6),
  }[type]();
  const core = new THREE.Mesh(coreGeo, glow(color, 2.2));
  if (type === 'repair') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.24), glow(color, 2.2));
    core.add(bar);
  }
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.04, 4, 32), glow(color, 1.4));
  g.add(frame, core, halo);
  g.userData = { frame, core, halo };
  return g;
}
