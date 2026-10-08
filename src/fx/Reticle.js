import * as THREE from 'three';

const AIM = new THREE.Color('#3ff0ff').multiplyScalar(1.1);
const OD = new THREE.Color('#ffb347').multiplyScalar(1.4);
const LOCK = new THREE.Color('#ffe66d').multiplyScalar(1.1);

// Two small square sights along the line of fire (the classic rail-shooter
// trick for judging depth), plus thin corner brackets that frame whatever
// the aim assist has locked. The brackets sit around the target, never on
// top of it, so the enemy itself stays readable.
export class Reticle {
  constructor(scene) {
    const sightMat = () => new THREE.MeshBasicMaterial({
      color: AIM.clone(), transparent: true, opacity: 0.8,
      depthTest: false, depthWrite: false, fog: false,
    });
    const square = (r, w) => new THREE.RingGeometry(r - w, r, 4, 1, Math.PI / 4);

    this.near = new THREE.Mesh(square(0.55, 0.07), sightMat());
    this.far = new THREE.Mesh(square(0.8, 0.08), sightMat());

    // Four L-shaped corners on a unit square; scaled to the target's size.
    const pts = [];
    const k = 0.38;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pts.push(sx, sy, 0, sx - sx * k, sy, 0);
      pts.push(sx, sy, 0, sx, sy - sy * k, 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.lockMat = new THREE.LineBasicMaterial({ color: LOCK, transparent: true, opacity: 0, depthTest: false, fog: false });
    this.brackets = new THREE.LineSegments(geo, this.lockMat);

    for (const m of [this.near, this.far, this.brackets]) {
      m.renderOrder = 20;
      m.visible = false;
      scene.add(m);
    }
    this.target = null;
    this.snap = 0;
  }

  setVisible(on) {
    this.near.visible = this.far.visible = this.brackets.visible = on;
  }

  update(dt, game) {
    const p = game.player.pos;
    const cam = game.camera;

    this.near.position.set(p.x, p.y, p.z - 20);
    this.far.position.set(p.x, p.y, p.z - 55);
    for (const m of [this.near, this.far, this.brackets]) m.quaternion.copy(cam.quaternion);
    this.near.scale.setScalar(this.near.position.distanceTo(cam.position) / 34);
    this.far.scale.setScalar(this.far.position.distanceTo(cam.position) / 34);

    const color = game.player.odT > 0 ? OD : AIM;
    this.near.material.color.copy(color);
    this.far.material.color.copy(color);

    const target = game.aimTarget(p);
    if (target !== this.target) {
      this.target = target;
      this.snap = 1; // brackets start wide and close in
    }
    this.snap = Math.max(0, this.snap - dt * 5);
    const shown = target ? 0.9 : 0;
    this.lockMat.opacity += (shown - this.lockMat.opacity) * Math.min(1, dt * 14);
    if (target) {
      this.brackets.position.copy(target.pos);
      const size = (target.radius || 2) * 1.35 * (1 + this.snap * 0.6);
      this.brackets.scale.set(size, size, 1);
    }
  }
}
