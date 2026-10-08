import { FluidSim } from './FluidSim.js';
import { easeOutCubic } from '../core/math.js';
import { t } from '../text.js';

// Yield so the new status line paints before heavy work. The timeout covers
// background tabs where rAF is paused.
const frame = () => new Promise((r) => {
  requestAnimationFrame(() => r());
  setTimeout(r, 60);
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Boot screen. Steps are real work (shader compiles, geometry, audio graph),
// timed to the console, with a minimum on-screen time so the intro breathes.
export class Loader {
  constructor() {
    this.root = document.getElementById('loader');
    this.fill = document.getElementById('progress-fill');
    this.label = document.getElementById('progress-label');
    this.pct = document.getElementById('progress-pct');
    this.engageBtn = document.getElementById('engage');
    this.shown = 0;
    this.target = 0;
    this.fluid = new FluidSim(document.getElementById('fluid'));
    if (!this.fluid.ok) this.root.style.background = 'radial-gradient(circle at 50% 40%, #2b0a52, #0b0418 70%)';
    this.animate = this.animate.bind(this);
    this.raf = requestAnimationFrame(this.animate);
  }

  animate() {
    this.shown += (this.target - this.shown) * 0.08;
    if (Math.abs(this.target - this.shown) < 0.001) this.shown = this.target;
    const p = easeOutCubic(this.shown);
    this.fill.style.transform = `scaleX(${p})`;
    this.pct.textContent = `${Math.round(p * 100)}%`;
    this.raf = requestAnimationFrame(this.animate);
  }

  async run(steps, minMs = 2600) {
    const start = performance.now();
    for (let i = 0; i < steps.length; i++) {
      const [text, fn] = steps[i];
      this.label.textContent = text;

      await frame();
      const t0 = performance.now();
      await fn();
      const ms = performance.now() - t0;
      // pace the steps so each status line is readable
      const budget = (minMs / steps.length) - ms;
      if (budget > 0) await wait(budget);

      console.debug(`[boot] ${text}: ${ms.toFixed(1)} ms`);
      this.target = (i + 1) / steps.length;
      this.fluid.pulse(this.target);
    }
    this.label.textContent = t('boot.ready', { s: ((performance.now() - start) / 1000).toFixed(2) });
    await wait(350);
  }

  // Resolve on the first click / key / pad press. Browsers only let audio
  // start from a user gesture, so this doubles as the audio unlock.
  waitForEngage() {
    this.engageBtn.hidden = false;
    return new Promise((resolve) => {
      const go = (e) => {
        if (e && e.type === 'keydown' && ['F5', 'F11', 'F12'].includes(e.key)) return;
        removeEventListener('keydown', go);
        removeEventListener('pointerdown', go);
        clearInterval(padPoll);
        resolve();
      };
      const padPoll = setInterval(() => {
        const pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
        if (pads.some((p) => p && p.buttons.some((b) => b.pressed))) go();
      }, 100);
      addEventListener('keydown', go);
      addEventListener('pointerdown', go);
    });
  }

  // Screenshot mode: drop the loader instantly.
  skip() {
    cancelAnimationFrame(this.raf);
    this.root.style.display = 'none';
    this.fluid.destroy();
  }

  async leave() {
    if (this.fluid.ok) this.fluid.burst(10);
    this.root.classList.add('is-leaving');
    this.root.classList.remove('is-active');
    const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        const t = Math.min(1, (performance.now() - t0) / 1100);
        if (this.fluid.ok) this.fluid.fade = 1 - t;
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      tick();
    });
    cancelAnimationFrame(this.raf);
    this.root.style.display = 'none';
    this.fluid.canvas.style.display = 'none';
    this.fluid.destroy();
  }
}
