const MOVE_KEYS = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
};

const BLOCK_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

export class Input {
  constructor() {
    this.keys = new Set();
    this.edges = new Set();         // keys/buttons pressed since last frame
    this.pointer = { x: 0, y: 0, moved: 0 };
    this.mouseDown = false;
    this.touching = false;
    this.capture = false;           // true while flying: swallow scroll keys etc.
    this.pad = { x: 0, y: 0, fire: false };
    this.padPrev = [];
    this.lastActivity = performance.now(); // for the idle demo mode

    addEventListener('keydown', (e) => {
      if (this.capture && BLOCK_DEFAULT.has(e.code)) e.preventDefault();
      if (!e.repeat) this.edges.add(e.code);
      this.keys.add(e.code);
      this.lastActivity = performance.now();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
      this.touching = false;
    });

    addEventListener('pointermove', (e) => {
      this.pointer.x = (e.clientX / innerWidth) * 2 - 1;
      this.pointer.y = -((e.clientY / innerHeight) * 2 - 1);
      this.pointer.moved = this.lastActivity = performance.now();
    });
    addEventListener('pointerdown', (e) => {
      this.pointer.x = (e.clientX / innerWidth) * 2 - 1;
      this.pointer.y = -((e.clientY / innerHeight) * 2 - 1);
      this.pointer.moved = performance.now();
      this.lastActivity = performance.now();
      this.edges.add('Pointer');
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 1) this.edges.add('Mouse1');
      if (e.button === 2) this.edges.add('Mouse2');
      if (e.pointerType === 'touch') this.touching = true;
    });
    addEventListener('pointerup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.pointerType === 'touch') this.touching = false;
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    // middle click is Overdrive, not autoscroll
    addEventListener('mousedown', (e) => {
      if (e.button === 1) e.preventDefault();
    });
  }

  down(code) {
    return this.keys.has(code);
  }

  hit(...codes) {
    return codes.some((c) => this.edges.has(c));
  }

  axis() {
    const any = (list) => list.some((k) => this.keys.has(k));
    let x = (any(MOVE_KEYS.right) ? 1 : 0) - (any(MOVE_KEYS.left) ? 1 : 0);
    let y = (any(MOVE_KEYS.up) ? 1 : 0) - (any(MOVE_KEYS.down) ? 1 : 0);
    if (Math.abs(this.pad.x) > Math.abs(x)) x = this.pad.x;
    if (Math.abs(this.pad.y) > Math.abs(y)) y = this.pad.y;
    return { x, y };
  }

  // Mouse is "in charge" if it moved in the last couple of seconds and no
  // keys/stick are being held. Lets players switch freely mid-run.
  pointerActive() {
    const a = this.axis();
    return a.x === 0 && a.y === 0 && performance.now() - this.pointer.moved < 2500;
  }

  get firing() {
    return this.mouseDown || this.touching || this.keys.has('Space') || this.keys.has('KeyJ') || this.pad.fire;
  }

  get dash() {
    return this.hit('ShiftLeft', 'ShiftRight', 'Mouse2', 'KeyK', 'Pad1');
  }

  get emp() {
    return this.hit('KeyE', 'KeyQ', 'KeyL', 'Pad2');
  }

  get overdrive() {
    return this.hit('KeyR', 'Mouse1', 'Pad3');
  }

  get pause() {
    return this.hit('Escape', 'KeyP', 'Pad9');
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find((p) => p && p.connected);
    if (!gp) {
      this.pad.x = this.pad.y = 0;
      this.pad.fire = false;
      return;
    }
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    this.pad.x = dz(gp.axes[0] || 0);
    this.pad.y = -dz(gp.axes[1] || 0);
    if (gp.buttons[14]?.pressed) this.pad.x = -1;
    if (gp.buttons[15]?.pressed) this.pad.x = 1;
    if (gp.buttons[12]?.pressed) this.pad.y = 1;
    if (gp.buttons[13]?.pressed) this.pad.y = -1;

    const pressed = gp.buttons.map((b) => b.pressed);
    this.pad.fire = !!(pressed[0] || pressed[7]);
    pressed.forEach((p, i) => {
      if (p && !this.padPrev[i]) this.edges.add('Pad' + i);
    });
    if (pressed.some(Boolean) || this.pad.x || this.pad.y) this.lastActivity = performance.now();
    if (pressed[5] && !this.padPrev[5]) this.edges.add('Pad2');
    if (pressed[4] && !this.padPrev[4]) this.edges.add('Pad1');
    this.padPrev = pressed;
  }

  endFrame() {
    this.edges.clear();
  }
}
