import * as THREE from 'three';
import { Engine } from '../core/Engine.js';
import { Input } from '../core/Input.js';
import { Store } from '../core/Store.js';
import { clamp, damp, lerp, rand, fmt, pad, easeInOutCubic, segPointDistSq } from '../core/math.js';
import { SPEED, PLAYER, COMBO_WINDOW, MULT_MAX, DIFFICULTY } from '../config.js';
import { Palette } from '../world/Palette.js';
import { Environment } from '../world/Environment.js';
import { Parallax } from '../world/Parallax.js';
import { Player } from '../entities/Player.js';
import { Enemies } from '../entities/Enemies.js';
import { Boss } from '../entities/Boss.js';
import { Bullets } from '../entities/Bullets.js';
import { Pickups } from '../entities/Pickups.js';
import { Missiles } from '../entities/Missiles.js';
import { Reticle } from '../fx/Reticle.js';
import { Autopilot } from './Autopilot.js';
import { PICKUP_COLORS } from '../entities/models.js';
import { Particles } from '../fx/Particles.js';
import { Shockwaves } from '../fx/Shockwaves.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { Music } from '../audio/Music.js';
import { Sfx } from '../audio/Sfx.js';
import { Hud } from '../ui/Hud.js';
import { Screens } from '../ui/Screens.js';
import { Director } from './Director.js';
import { t, setTextStyle } from '../text.js';

const WHITE = new THREE.Color(2.2, 2.2, 2.2);
const CYAN = new THREE.Color('#3ff0ff');
const HIT_SPARK = new THREE.Color(2.5, 2.2, 1.6);
const BOLT = new THREE.Color(0.3, 1.5, 2.0);
const BOLT_OD = new THREE.Color(3.2, 1.6, 0.35);
const AMBER = new THREE.Color('#ffb347');
const MISSILE_HOT = new THREE.Color(3, 1.4, 0.4);
const DEMO_IDLE_MS = 30000;   // menu idle time before the demo starts
const DEMO_LENGTH = 110;      // seconds of demo before it loops back to the menu
const vPop = new THREE.Vector3();

const v1 = new THREE.Vector3();
const camPlay = new THREE.Vector3();
const camMenu = new THREE.Vector3();
const lookPlay = new THREE.Vector3();
const lookMenu = new THREE.Vector3();

const wobble = (time, a, b) => Math.sin(time * a) * 0.6 + Math.sin(time * b * 1.7 + 1.3) * 0.4;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.input = new Input();
    this.state = 'boot';
    this.time = 0;
    this.timeScale = 1;
    this.slowT = 0;
    this.slowTo = 1;
    this.speed = SPEED.menu;
    this.speedBoost = 0;
    this.camBlend = 0;
    this.camBlendTarget = 0;
    this.camPos = new THREE.Vector3(6, 7, 9);
    this.camLook = new THREE.Vector3(0, 5, 0);
    this.fov = 48;
    this.trauma = 0;
    this.damageFx = 0;
    this.flashFx = 0;
    this.dim = 1;
    this.demo = false;
    this.enemyScale = 1;   // < 1 during Overdrive: enemies and their bullets slow down
    this.odFx = 0;
    this.warp = 0;
    this.warpT = 0;
    this.warpDelay = 0;
    this.hints = [];
    this.perf = { t: 0, frames: 0, last: 0 };
    this.best = Store.best();
    this.resetRunStats();
  }

  resetRunStats() {
    this.score = 0;
    this.chain = 0;
    this.mult = 1;
    this.comboT = 0;
    this.maxChain = 0;
    this.kills = 0;
    this.hits = 0;
    this.bosses = 0;
    this.runTime = 0;
    this.perfectWaves = 0;
    this.overdrives = 0;
  }

  // Whatever is steering the ship: the player, or the autopilot in demo mode.
  get control() {
    return this.demo ? this.autopilot : this.input;
  }

  get diff() {
    return DIFFICULTY[Store.settings.difficulty] || DIFFICULTY.normal;
  }

  // Each entry is real setup work; the loader logs and times them.
  bootSteps() {
    return [
      [t('boot.1'), () => {
        this.engine = new Engine(this.canvas, Store.settings.quality);
        this.scene = this.engine.scene;
        this.camera = this.engine.camera;
      }],
      [t('boot.2'), () => {
        this.palette = new Palette();
        this.env = new Environment(this.scene, this.palette);
      }],
      [t('boot.3'), () => {
        this.parallax = new Parallax(this.scene, this.palette);
      }],
      [t('boot.4'), () => {
        this.player = new Player(this.scene);
        this.enemies = new Enemies(this.scene);
        this.enemies.prewarm({ mote: 18, lancer: 4, hornet: 6, warden: 2, splitter: 2 });
        this.boss = new Boss(this.scene);
        this.bullets = new Bullets(this.scene);
        this.missiles = new Missiles(this.scene);
        this.pickups = new Pickups(this.scene);
        this.reticle = new Reticle(this.scene);
        this.autopilot = new Autopilot(this);
      }],
      [t('boot.5'), () => {
        this.fx = new Particles(this.scene, Store.settings.quality === 'high' ? 7000 : 4000);
        this.shocks = new Shockwaves(this.scene, this.engine.lens.uniforms);
      }],
      [t('boot.6'), () => this.precompile()],
      [t('boot.7'), () => {
        this.audio = new AudioEngine();
        this.music = new Music(this.audio);
        this.sfx = new Sfx(this.audio);
        this.audio.setVolumes(Store.settings.music, Store.settings.sfx);
      }],
      [t('boot.8'), () => {
        this.hud = new Hud();
        this.director = new Director(this);
        this.screens = new Screens(this);
      }],
      [t('boot.9'), () => {
        this.state = 'menu';
        this.last = performance.now();
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
        this.bindGlobalKeys();
      }],
    ];
  }

  // Make every pooled model visible for one compile pass so the first enemy
  // of each type doesn't hitch the frame when it spawns.
  precompile() {
    const hidden = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    this.engine.renderer.compile(this.scene, this.camera);
    this.engine.render(0.016);
    for (const o of hidden) o.visible = false;
  }

  bindGlobalKeys() {
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyF' && document.activeElement?.tagName !== 'INPUT') this.toggleFullscreen();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing' && !this.demo) this.pause();
    });
  }

  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  async engage() {
    await this.audio.resume();
    this.sfx.engage();
    this.music.play('menu');
    this.screens.show('menu');
  }

  // Screenshot mode: fast-forwards a scene so a headless browser can capture
  // it. The autopilot flies; nothing here is saved.
  capture(kind) {
    let now = this.last;
    const run = (seconds) => {
      for (let i = 0; i < seconds * 60; i++) {
        now += 1000 / 60;
        this.tick(now);
      }
    };
    Store.settings.hints = false;
    this.fastForward = true; // simulate without drawing; only the final frame is rendered
    this.screens.show('menu');
    if (kind === 'menu') {
      run(4);
    } else {
      this.startRun(true);
      document.body.classList.remove('is-demo');
      if (kind === 'boss') {
        run(1);
        this.enemies.clear();
        this.director.wave = 4;
        this.director.state = 'gap';
        this.director.delay = 0;
        run(9);
        // hold it in phase 1 so the shot isn't a phase-change explosion
        for (let i = 0; i < 6; i++) {
          this.boss.hp = this.boss.maxHp;
          run(0.5);
        }
      } else {
        // A wave in full swing: one of each enemy type in the corridor.
        run(5);
        const E = this.enemies;
        E.spawn('lancer', { x: -9, y: 9, z: -70, anchorX: -9, anchorY: 9, holdZ: -62, life: 20, phase: 0 });
        E.spawn('warden', { x: 10, y: 9, z: -95, anchorX: 10, anchorY: 9, holdZ: -90, life: 20 });
        E.spawn('splitter', { x: 3, y: 12, z: -85, anchorX: 3, anchorY: 12, holdZ: -80 });
        E.spawn('hornet', { x: -3, y: 4, z: -60, anchorX: -3, anchorY: 4, diveZ: 999 });
        for (let i = 0; i < 4; i++) {
          E.spawn('mote', { x: -12 + i * 4.5, y: 7, z: -75 - i * 5, speed: 20, amp: 1.5, freq: 1.5, phase: i });
        }
        run(0.7);
      }
    }
    this.fastForward = false;
    document.getAnimations().forEach((a) => {
      try { a.finish(); } catch { /* infinite animations can't finish */ }
    });
    this.last = now;
  }

  applySettings(name) {
    const s = Store.settings;
    if (name === 'music' || name === 'sfx') this.audio.setVolumes(s.music, s.sfx);
    if (name === 'textStyle') setTextStyle(s.textStyle);
    if (name === 'textSize') document.documentElement.style.setProperty('--ui-scale', s.textSize);
    if (name === 'quality') {
      this.engine.setQuality(s.quality);
      this.shocks.lens = this.engine.lens.uniforms; // new composer, new uniforms
    }
  }

  // -- flow -------------------------------------------------------------------
  resetWorld() {
    this.enemies.clear();
    this.boss.clear();
    this.bullets.clear();
    this.missiles.clear();
    this.pickups.clear();
    this.fx.clear();
    this.shocks.clear();
    this.player.reset();
    this.director.reset();
    this.hud.reset();
    this.resetRunStats();
    this.reticle.setVisible(false);
    this.bullets.player.mesh.material.color.copy(BOLT);
    this.timeScale = 1;
    this.slowT = 0;
    this.enemyScale = 1;
    this.warpT = this.warpDelay = 0;
    this.hints = [];
  }

  startRun(demo = false) {
    if (this.state === 'playing') return;
    this.resetWorld();
    this.demo = demo;
    document.body.classList.toggle('is-demo', demo);
    if (demo) {
      this.autopilot.reset();
      this.demoStart = performance.now();
    } else if (Store.settings.hints) {
      // [seconds into the run, text key]
      this.hints = [[1.2, 'hint.move'], [5, 'hint.fire'], [9.5, 'hint.dash'], [14, 'hint.bomb'], [19, 'hint.od']];
    }
    this.best = Store.best();
    this.palette.set(0, this.palette.index === 0 ? 0.5 : 2);
    this.director.start();
    this.state = 'playing';
    this.camBlendTarget = 1;
    this.input.capture = !demo;
    document.body.classList.toggle('in-flight', !demo);
    this.reticle.setVisible(true);
    this.screens.show('hud');
    this.music.setIntensity(0.3);
    this.music.play('run');
    this.audio.muffle(20000);
    this.hud.setSector(1, 1, this.palette.name);
  }

  async restart() {
    if (this.state === 'transition') return;
    this.state = 'transition';
    const curtain = document.getElementById('curtain');
    curtain.classList.add('is-down');
    await wait(450);
    this.state = 'menu';
    this.startRun();
    this.camBlend = 1;
    curtain.classList.remove('is-down');
  }

  async quitToMenu() {
    if (this.state === 'transition') return;
    this.state = 'transition';
    const curtain = document.getElementById('curtain');
    curtain.classList.add('is-down');
    await wait(450);
    this.resetWorld();
    this.demo = false;
    document.body.classList.remove('is-demo');
    this.input.lastActivity = performance.now();
    this.state = 'menu';
    this.camBlendTarget = 0;
    this.camBlend = 0;
    this.input.capture = false;
    document.body.classList.remove('in-flight');
    this.palette.set(0, 0);
    this.audio.muffle(20000);
    this.music.play('menu');
    this.screens.show('menu');
    curtain.classList.remove('is-down');
  }

  pause() {
    if (this.state !== 'playing' || this.demo) return;
    this.state = 'paused';
    this.input.capture = false;
    document.body.classList.remove('in-flight');
    this.audio.muffle(600);
    this.screens.show('pause', { keepHud: true });
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.input.capture = true;
    document.body.classList.add('in-flight');
    this.audio.muffle(20000);
    this.screens.show('hud');
  }

  die() {
    this.state = 'dying';
    this.dyingT = 0;
    this.explodeAt(this.player.pos, CYAN, 2.4);
    this.explodeAt(this.player.pos, new THREE.Color('#ff3ea5'), 1.6);
    this.player.model.visible = false;
    this.reticle.setVisible(false);
    this.hud.hint(null);
    if (this.player.odT > 0) {
      // end Overdrive now, or its tint would hang over the game-over screen
      this.player.odT = 0;
      this.bullets.player.mesh.material.color.copy(BOLT);
    }
    this.sfx.bigBoom();
    this.slowmo(0.25, 1.4);
    this.flashFx = 0.6;
    this.trauma = 1;
    this.audio.muffle(500, 0.6);
    this.music.play('over');
    this.input.capture = false;
    document.body.classList.remove('in-flight');
  }

  gameOver() {
    this.state = 'gameover';
    const prevBest = this.best;
    const shots = this.player.shots;
    const secs = Math.floor(this.runTime);
    const stats = {
      score: this.score,
      best: Math.max(prevBest, this.score),
      newBest: this.score > prevBest && this.score > 0,
      sector: this.director.sector,
      wave: Math.max(1, this.director.wave),
      kills: this.kills,
      accuracy: shots ? Math.min(100, Math.round((this.hits / shots) * 100)) : 0,
      maxChain: this.maxChain,
      time: `${Math.floor(secs / 60)}:${pad(secs % 60)}`,
      bosses: this.bosses,
    };
    const medals = [];
    if (stats.accuracy >= 55 && shots > 60) medals.push('sharp');
    if (this.maxChain >= 30) medals.push('combo');
    if (this.bosses > 0) medals.push('boss');
    if (this.perfectWaves >= 2) medals.push('untouch');
    if (this.runTime >= 180) medals.push('survivor');
    if (this.kills >= 100) medals.push('ace');
    if (this.overdrives >= 3) medals.push('od');
    stats.medals = medals;
    this.audio.muffle(20000, 1.5);
    this.screens.showGameOver(stats);
  }

  slowmo(scale, seconds) {
    this.slowTo = scale;
    this.slowT = seconds;
  }

  // -- events from entities / director --------------------------------------
  onWaveStart(sector, wave) {
    this.hud.setSector(sector, wave, this.palette.name);
    const n = { n: sector, nn: pad(sector), w: wave };
    if (wave === 1) this.hud.banner(t('b.sector', n), this.palette.name);
    else this.hud.banner(t('b.wave', n), this.director.waveLine);
    this.music.setIntensity(0.25 + wave * 0.15 + (sector - 1) * 0.2);
  }

  onWaveClear(wave, perfect) {
    const bonus = 500 * wave * this.director.sector + (perfect ? 1500 : 0);
    if (perfect) this.perfectWaves++;
    this.score += bonus;
    this.hud.banner(t(perfect ? 'b.perfect' : 'b.clear'), `+${fmt(bonus)}`);
    this.sfx.chord(perfect ? [69, 73, 76, 81] : [69, 72, 76]);
    this.env.pulse();
  }

  onBossIncoming(sector) {
    this.hud.setSector(sector, 0, this.palette.name);
    this.hud.banner(t('b.warning'), t('b.bossIncoming'), true);
    this.sfx.warning();
    this.music.play('boss');
  }

  onBossEngaged() {
    this.hud.showBoss(true);
  }

  onBossPhase(boss, phase) {
    this.explodeAt(boss.pos, phase === 3 ? new THREE.Color('#ff2a4d') : new THREE.Color('#ffe66d'), 2.2);
    this.shocks.spawn(boss.pos, { color: WHITE, radius: 40, duration: 1, strength: 0.05 });
    this.hud.banner(t('b.breach'), t(phase === 2 ? 'b.armour' : 'b.core'), phase === 3);
    for (const b of this.bullets.enemy.list) b.alive = false;
    this.flashFx = 0.35;
  }

  onBossKilled(boss) {
    this.bosses++;
    const sector = this.director.sector;
    this.explodeAt(boss.pos, new THREE.Color('#ffe66d'), 3.2);
    this.explodeAt(boss.pos, CYAN, 2.4);
    this.shocks.spawn(boss.pos, { color: WHITE, radius: 70, duration: 1.4, strength: 0.08 });
    for (const e of this.enemies.active) this.killEnemy(e);
    this.clearEnemyBullets(true);
    this.sfx.bigBoom();
    this.slowmo(0.22, 1.3);
    this.flashFx = 0.9;
    this.trauma = 1;
    const bonus = 5000 * sector;
    this.score += bonus;
    this.player.hull = Math.min(PLAYER.hull, this.player.hull + 35);
    this.hud.showBoss(false);
    this.director.bossDown();
    this.palette.set(this.director.sector - 1, 5);
    this.hud.banner(t('b.sectorClear'), t('b.sectorClearSub', { n: fmt(bonus) }));
    this.music.play('run');
    this.warpDelay = 1.6; // then jump to the next level
  }

  onOverdrive() {
    this.overdrives++;
    this.sfx.overdrive();
    this.hud.banner(t('b.od'), t('b.odSub'));
    this.shocks.spawn(this.player.pos, { color: AMBER, radius: 50, duration: 0.9, strength: 0.06 });
    this.flashFx = 0.3;
    this.bullets.player.mesh.material.color.copy(BOLT_OD);
  }

  onOverdriveEnd() {
    this.sfx.overdriveEnd();
    this.bullets.player.mesh.material.color.copy(BOLT);
  }

  onDash(dir) {
    this.sfx.dash(dir);
    this.speedBoost = 26;
    this.fx.burst(this.player.pos, { count: 18, speed: 14, size: 1, life: 0.35, color: CYAN, flow: 1 });
  }

  onPlayerDamaged(amount) {
    this.chain = 0;
    this.mult = 1;
    this.comboT = 0;
    this.director.damaged = true;
    this.trauma = Math.min(1, this.trauma + 0.55);
    this.damageFx = 1;
    this.sfx.playerHit();
    this.fx.burst(this.player.pos, { count: 26, speed: 22, size: 1, life: 0.5, color: [new THREE.Color(3, 0.3, 0.5), HIT_SPARK], flow: 0.8 });
    if (amount >= 20) this.slowmo(0.5, 0.25);
  }

  detonateEmp() {
    const p = this.player.pos;
    this.sfx.emp();
    this.flashFx = 0.7;
    this.trauma = Math.min(1, this.trauma + 0.6);
    this.shocks.spawn(p, { color: WHITE, radius: 60, duration: 1.1, strength: 0.07 });
    this.fx.burst(p, { count: 160, speed: 70, size: 1.6, life: 0.9, color: [WHITE, CYAN], flow: 0.2, drag: 1.5 });
    this.clearEnemyBullets(true);
    for (const e of this.enemies.active) {
      if (e.alive && e.pos.z > -260) this.damageEnemy(e, 6, e.pos);
    }
    if (this.boss.fighting && this.boss.hit(14)) this.onBossDying();
  }

  clearEnemyBullets(sparks) {
    let n = 0;
    for (const b of this.bullets.enemy.list) {
      if (!b.alive) continue;
      b.alive = false;
      if (sparks && n++ < 120) this.fx.emit(b.pos.x, b.pos.y, b.pos.z, rand(-4, 4), rand(-4, 4), rand(-4, 4), WHITE, 1.4, 0.4, 2, 0.5);
    }
  }

  collect(type, pos, color) {
    const p = this.player;
    if (type === 'spread') p.spreadT = 12;
    else if (type === 'rapid') p.rapidT = 12;
    else if (type === 'shield') p.shieldHp = PLAYER.shieldMax;
    else if (type === 'repair') p.hull = Math.min(PLAYER.hull, p.hull + 30);
    else if (type === 'emp') p.bombs = Math.min(PLAYER.bombsMax, p.bombs + 1);
    else if (type === 'missile') {
      p.missileT = 12;
      p.missileCd = 0;
    }
    this.score += 100 * this.mult;
    this.hud.toast(t(`pickup.${type}`), PICKUP_COLORS[type]);
    this.sfx.pickup();
    this.fx.burst(pos, { count: 30, speed: 18, size: 1, life: 0.5, color: color.clone().multiplyScalar(2.5), flow: 1 });
  }

  choosePickup() {
    const hull = this.player.hull;
    const table = [
      ['spread', 3],
      ['rapid', 3],
      ['shield', 2],
      ['repair', hull < 50 ? 5 : hull < 80 ? 2 : 0.5],
      ['emp', this.player.bombs < PLAYER.bombsMax ? 1.3 : 0],
      ['missile', 2.4],
    ];
    const total = table.reduce((n, [, w]) => n + w, 0);
    let r = Math.random() * total;
    for (const [type, w] of table) {
      r -= w;
      if (r <= 0) return type;
    }
    return 'spread';
  }

  // Gentle aim assist: the enemy (or boss) sitting closest to the line of
  // fire. Bolts bend toward it and the reticle brackets it.
  aimTarget(origin) {
    let best = null, bestZ = -Infinity;
    for (const e of this.enemies.active) {
      if (!e.alive || e.pos.z > origin.z - 8) continue;
      const r = 2.2 + (origin.z - e.pos.z) * 0.012 + e.radius * 0.4;
      if (Math.abs(e.pos.x - origin.x) < r && Math.abs(e.pos.y - origin.y) < r && e.pos.z > bestZ) {
        best = e;
        bestZ = e.pos.z;
      }
    }
    if (!best && this.boss.fighting) {
      const b = this.boss.pos;
      if (Math.abs(b.x - origin.x) < 7 && Math.abs(b.y - origin.y) < 7) best = this.boss;
    }
    return best;
  }

  aimAssist(origin) {
    const target = this.aimTarget(origin);
    return target ? target.pos : null;
  }

  // -- combat -----------------------------------------------------------------
  explodeAt(pos, color, size = 1) {
    const hot = color.clone().multiplyScalar(2.6);
    this.fx.burst(pos, { count: Math.round(38 * size), speed: 24 * size, size: 1.2 * Math.sqrt(size), life: 0.8, color: [hot, WHITE, color.clone().multiplyScalar(1.5)], flow: 0.55 });
    this.fx.burst(pos, { count: Math.round(10 * size), speed: 6, size: 3.2 * size, life: 0.35, color: hot, drag: 5, flow: 0.4 });
    this.shocks.spawn(pos, { color, radius: 6 * size, duration: 0.5, strength: 0.018 * size });
    this.sfx.explode(size, pos.x / 20);
    this.trauma = Math.min(1, this.trauma + 0.1 * size);
  }

  damageEnemy(e, dmg, at) {
    this.fx.burst(at, { count: 5, speed: 16, size: 0.7, life: 0.22, color: HIT_SPARK, flow: 0.3 });
    if (e.hit(dmg)) this.killEnemy(e);
    else this.sfx.hit(e.pos.x / 20);
  }

  killEnemy(e) {
    if (!e.alive) return;
    e.kill();
    this.kills++;
    this.chain++;
    this.maxChain = Math.max(this.maxChain, this.chain);
    this.comboT = COMBO_WINDOW;
    const m = Math.min(MULT_MAX, 1 + Math.floor(this.chain / 5));
    if (m > this.mult) {
      this.mult = m;
      this.hud.popMult();
      this.sfx.combo(m);
    }
    const pts = Math.round(e.def.score * this.mult * this.diff.score);
    this.score += pts;
    this.popupAt(e.pos, `+${fmt(pts)}`, e.def.color, pts >= 1000);
    this.explodeAt(e.pos, e.color, e.type === 'warden' ? 1.8 : e.type === 'splitter' ? 1.4 : 1);
    if (Math.random() < e.def.drop) this.pickups.spawn(this.choosePickup(), e.pos);

    const p = this.player;
    if (p.odT <= 0 && p.od < 1) {
      p.od = Math.min(1, p.od + e.def.od);
      if (p.od >= 1 && !this.demo) {
        this.sfx.odReady();
        this.hud.toast(t('toast.odReady'), '#ffe66d');
      }
    }

    if (e.type === 'splitter') {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        this.enemies.spawn('mote', {
          x: e.pos.x + Math.cos(a) * 2.5, y: Math.max(2, e.pos.y + Math.sin(a) * 2.5), z: e.pos.z,
          speed: 64, amp: 2.5, freq: 2.2, phase: a, shooter: false,
        });
      }
    }
  }

  popupAt(pos, text, color, big = false) {
    vPop.copy(pos).project(this.camera);
    if (vPop.z > 1 || Math.abs(vPop.x) > 1.1 || Math.abs(vPop.y) > 1.1) return;
    this.hud.popup((vPop.x * 0.5 + 0.5) * innerWidth, (-vPop.y * 0.5 + 0.5) * innerHeight, text, color, big);
  }

  missileHit(pos, target) {
    this.fx.burst(pos, { count: 22, speed: 20, size: 1.1, life: 0.45, color: [MISSILE_HOT, WHITE], flow: 0.5 });
    this.shocks.spawn(pos, { color: AMBER, radius: 5, duration: 0.4, strength: 0.012 });
    this.sfx.explode(0.6, pos.x / 20);
    if (target === this.boss) {
      this.score += 30 * this.mult;
      if (this.boss.hit(3)) this.onBossDying();
    } else {
      this.damageEnemy(target, 3, pos);
    }
    for (const e of this.enemies.active) {
      if (e.alive && e !== target && e.pos.distanceToSquared(pos) < 25) this.damageEnemy(e, 1, e.pos);
    }
  }

  onBossDying() {
    this.slowmo(0.35, 0.8);
    this.hud.banner(t('b.failing'), t('b.failingSub'), true);
  }

  collisions() {
    const player = this.player;
    const enemies = this.enemies.active;
    const boss = this.boss;

    for (const b of this.bullets.player.list) {
      if (!b.alive) continue;
      const zMin = Math.min(b.prev.z, b.pos.z), zMax = Math.max(b.prev.z, b.pos.z);
      for (const e of enemies) {
        if (!e.alive) continue;
        const r = e.radius;
        if (e.pos.z + r < zMin || e.pos.z - r > zMax) continue;
        if (segPointDistSq(b.prev.x, b.prev.y, b.prev.z, b.pos.x, b.pos.y, b.pos.z, e.pos.x, e.pos.y, e.pos.z) < r * r) {
          if (b.pierce) {
            // Overdrive rounds go straight through, hitting each target once
            if (b.lastHit === e) continue;
            b.lastHit = e;
          } else {
            b.alive = false;
          }
          this.hits++;
          this.damageEnemy(e, b.damage, b.pos);
          if (!b.alive) break;
        }
      }
      if (b.alive && boss.alive && boss.state !== 'enter' && b.lastHit !== boss) {
        const r = boss.radius;
        if (boss.pos.z + r >= zMin && boss.pos.z - r <= zMax &&
          segPointDistSq(b.prev.x, b.prev.y, b.prev.z, b.pos.x, b.pos.y, b.pos.z, boss.pos.x, boss.pos.y, boss.pos.z) < r * r) {
          if (b.pierce) b.lastHit = boss;
          else b.alive = false;
          this.hits++;
          this.fx.burst(b.pos, { count: 4, speed: 14, size: 0.8, life: 0.2, color: HIT_SPARK, flow: 0.3 });
          if (boss.fighting) {
            this.sfx.hit(boss.pos.x / 20);
            this.score += 10 * this.mult;
            if (boss.hit(b.damage)) this.onBossDying();
          }
        }
      }
    }

    for (const m of this.missiles.list) {
      if (!m.alive) continue;
      let hit = null;
      for (const e of enemies) {
        if (!e.alive) continue;
        const r = e.radius + 0.6;
        if (segPointDistSq(m.prev.x, m.prev.y, m.prev.z, m.pos.x, m.pos.y, m.pos.z, e.pos.x, e.pos.y, e.pos.z) < r * r) {
          hit = e;
          break;
        }
      }
      if (!hit && boss.fighting) {
        const r = boss.radius + 0.6;
        if (segPointDistSq(m.prev.x, m.prev.y, m.prev.z, m.pos.x, m.pos.y, m.pos.z, boss.pos.x, boss.pos.y, boss.pos.z) < r * r) hit = boss;
      }
      if (hit) {
        m.alive = false;
        this.missileHit(m.pos, hit);
      }
    }

    if (!player.alive) return;
    const p = player.pos;
    const dmg = this.diff.damage;
    const hitR = 0.9 + 0.46;
    for (const b of this.bullets.enemy.list) {
      if (!b.alive || b.pos.z < -3 || b.prev.z > 3) continue;
      if (segPointDistSq(b.prev.x, b.prev.y, b.prev.z, b.pos.x, b.pos.y, b.pos.z, p.x, p.y, p.z) < hitR * hitR) {
        if (player.hurt(12 * (0.85 + this.director.difficulty * 0.15) * dmg, this)) b.alive = false;
      }
    }

    for (const e of enemies) {
      if (!e.alive || Math.abs(e.pos.z - p.z) > e.radius + 1.2) continue;
      const dx = e.pos.x - p.x, dy = e.pos.y - p.y, rr = e.radius * 0.8 + 0.9;
      if (dx * dx + dy * dy > rr * rr) continue;
      if (player.dashT > 0 && e.type !== 'warden') {
        // dashing through something counts as a kill
        this.killEnemy(e);
        this.score += 250;
        this.hud.toast(t('toast.ram'), '#3ff0ff');
      } else if (player.hurt((e.type === 'hornet' ? 22 : 15) * dmg, this) && e.type !== 'warden') {
        this.killEnemy(e);
      }
    }
  }

  // -- frame ------------------------------------------------------------------
  loop(now) {
    requestAnimationFrame(this.loop);
    this.watchPerformance(now);
    this.tick(now);
  }

  // Adaptive quality: if the real frame rate stays low during play, render at
  // a lower resolution instead of stuttering. Steps down, never back up.
  watchPerformance(now) {
    const p = this.perf;
    const dt = now - (p.last || now);
    p.last = now;
    if (this.state !== 'playing' || dt <= 0 || dt > 250) return;
    p.t += dt;
    p.frames++;
    if (p.t < 3000) return;
    const fps = (p.frames * 1000) / p.t;
    p.t = p.frames = 0;
    if (fps >= 42) return;
    const pr = this.engine.pixelRatio;
    const next = pr > 1.26 ? 1.25 : pr > 1.01 ? 1 : pr > 0.86 ? 0.85 : pr;
    if (next < pr) {
      this.engine.setPixelRatio(next);
      this.hud.toast(t('toast.quality'), '#3ff0ff');
    }
  }

  tick(now) {
    const raw = Math.min(Math.max((now - this.last) / 1000, 0), 0.05);
    this.last = now;
    const input = this.input;
    input.pollGamepad();

    if (this.slowT > 0) this.slowT -= raw;
    this.timeScale = damp(this.timeScale, this.slowT > 0 ? this.slowTo : 1, this.slowT > 0 ? 14 : 3, raw);
    const dt = raw * this.timeScale;
    this.time += raw;
    const od = this.player.odT > 0;
    this.enemyScale = damp(this.enemyScale, od ? 0.45 : 1, 8, raw);
    this.odFx = damp(this.odFx, od ? 1 : 0, 6, raw);

    switch (this.state) {
      case 'menu':
        this.player.idle(raw, this.fx);
        this.screens.pollPad(input);
        if (this.screens.current === 'menu' && performance.now() - input.lastActivity > DEMO_IDLE_MS) this.startRun(true);
        break;
      case 'playing':
        if (this.demo) {
          // any touch of the controls hands the game back to a human
          if (input.edges.size || input.mouseDown || input.pointer.moved > this.demoStart + 600 || this.runTime > DEMO_LENGTH) {
            this.quitToMenu();
            break;
          }
          this.autopilot.update(dt);
        } else if (input.pause) {
          this.pause();
          break;
        }
        this.runTime += dt;
        if (this.hints.length && this.runTime >= this.hints[0][0]) this.hud.hint(t(this.hints.shift()[1]));
        this.player.update(dt, this);
        this.simulate(dt);
        this.reticle.update(raw, this);
        if (!this.player.alive) this.die();
        break;
      case 'dying':
        this.dyingT += raw;
        this.simulate(dt);
        if (this.dyingT > 2.6) this.gameOver();
        break;
      case 'paused':
        if (input.pause) this.resume();
        else this.screens.pollPad(input);
        break;
      case 'gameover':
        this.simulate(dt * 0.4);
        this.screens.pollPad(input);
        break;
    }

    if (this.state !== 'paused') this.updateWorld(dt, raw);
    this.updateCamera(raw);
    this.updateLens(raw);
    if (this.state === 'playing' || this.state === 'dying') this.hud.update(raw, this, Store.settings);
    if (!this.fastForward) this.engine.render(raw);
    input.endFrame();
  }

  simulate(dt) {
    const edt = dt * this.enemyScale;
    if (this.state === 'playing') this.director.update(edt);
    this.enemies.update(edt, this);
    this.boss.update(edt, this);
    this.bullets.update(dt, edt);
    this.missiles.update(dt, this);
    this.pickups.update(dt, this);
    this.collisions();
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) {
        this.chain = 0;
        this.mult = 1;
      }
    }
  }

  updateWorld(dt, raw) {
    let target = SPEED.flight;
    if (this.state === 'menu') target = SPEED.menu;
    else if (this.state === 'dying' || this.state === 'gameover') target = SPEED.dead;
    else if (this.boss.alive) target = SPEED.boss;
    if (this.warpDelay > 0) {
      this.warpDelay -= raw;
      if (this.warpDelay <= 0) {
        this.warpT = 3;
        this.sfx.warp();
        this.hud.banner(t('b.warp'), t('b.warpSub'));
      }
    }
    if (this.warpT > 0) this.warpT = Math.max(0, this.warpT - raw);
    this.warp = this.warpT > 0 ? Math.sin(Math.PI * (1 - this.warpT / 3)) : 0;

    this.speedBoost = damp(this.speedBoost, 0, 3, raw);
    this.speed = damp(this.speed, target + this.speedBoost + this.warp * 320, this.warp > 0 ? 4 : 1.2, raw);

    const dimTarget = this.state === 'menu' ? 1 : parseFloat(Store.settings.playDim) || 1;
    this.dim = damp(this.dim, dimTarget, 2.2, raw);
    this.engine.bloom.strength = this.engine.bloomBase * (0.65 + 0.35 * this.dim);

    this.palette.update(raw);
    this.env.update(dt, this.speed, this.camera, this.dim);
    this.parallax.update(dt, this.speed, this.camera, this.dim);
    this.fx.update(dt, this.speed);
    this.shocks.update(dt, this.camera, this.speed);
  }

  updateCamera(dt) {
    const p = this.player.pos;
    const cam = this.camera;

    this.camBlend = damp(this.camBlend, this.camBlendTarget, 1.9, dt);
    const k = easeInOutCubic(clamp(this.camBlend, 0, 1));

    camPlay.set(p.x * 0.55, 4.4 + p.y * 0.5, 14.5);
    lookPlay.set(p.x * 0.75, 1.2 + p.y * 0.62, -45);

    // Menu shot: behind the ship's left shoulder, looking down the corridor
    // at the sun, so the ship sits in the right third clear of the menu text.
    // Narrower screens get less sideways offset so the ship stays in frame.
    const wide = clamp(cam.aspect / 1.78, 0.45, 1);
    camMenu.set(p.x - 3 * wide + Math.sin(this.time * 0.13) * 1.5, p.y + 2 + Math.sin(this.time * 0.31) * 0.5, p.z + 9.5 + (1 - wide) * 6);
    lookMenu.set(p.x - 6 * wide, p.y + 3.5, p.z - 30);

    v1.lerpVectors(camMenu, camPlay, k);
    const follow = lerp(3, 7.5, k);
    this.camPos.x = damp(this.camPos.x, v1.x, follow, dt);
    this.camPos.y = damp(this.camPos.y, v1.y, follow, dt);
    this.camPos.z = damp(this.camPos.z, v1.z, follow, dt);
    v1.lerpVectors(lookMenu, lookPlay, k);
    this.camLook.x = damp(this.camLook.x, v1.x, follow * 1.4, dt);
    this.camLook.y = damp(this.camLook.y, v1.y, follow * 1.4, dt);
    this.camLook.z = damp(this.camLook.z, v1.z, follow * 1.4, dt);

    this.trauma = Math.max(0, this.trauma - dt * 1.3);
    const shake = Store.settings.shake ? this.trauma * this.trauma : 0;
    const now = this.time;
    cam.position.set(
      this.camPos.x + shake * 0.9 * wobble(now, 23, 31),
      this.camPos.y + shake * 0.7 * wobble(now + 4, 27, 19),
      this.camPos.z
    );
    cam.lookAt(this.camLook);
    cam.rotation.z += -this.player.bank * 0.12 * k + shake * 0.05 * wobble(now + 9, 17, 29);

    const dash = this.player.dashT > 0 ? 9 : 0;
    this.fov = damp(this.fov, lerp(48, 57, k) + dash + this.speedBoost * 0.1 + this.warp * 24, 5, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    const h = innerHeight, pr = this.engine.pixelRatio;
    this.fx.setScale(h, pr, cam.fov);
    this.parallax.setPointScale(h, pr, cam.fov);
  }

  updateLens(dt) {
    const L = this.engine.lens.uniforms;
    this.damageFx = Math.max(0, this.damageFx - dt * 2.2);
    this.flashFx = Math.max(0, this.flashFx - dt * 2.8);
    L.uTime.value = this.time;
    L.uDamage.value = this.damageFx * 0.8 + (this.player.alive && this.player.hull < 30 && this.state === 'playing' ? 0.12 + 0.08 * Math.sin(this.time * 6) : 0);
    L.uFlash.value = this.flashFx * this.flashFx;
    L.uAberration.value = 0.0012 + this.damageFx * 0.006 + (this.player.dashT > 0 ? 0.004 : 0) + this.trauma * 0.003;
    const dead = this.state === 'dying' || this.state === 'gameover';
    L.uDesat.value = damp(L.uDesat.value, dead ? 0.7 : 0, 2, dt);
    L.uWarp.value = this.warp * 0.9;
    L.uOver.value = this.odFx;
  }
}
