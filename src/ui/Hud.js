import { fmt, pad } from '../core/math.js';
import { PLAYER, COMBO_WINDOW } from '../config.js';
import { PICKUP_COLORS } from '../entities/models.js';
import { t } from '../text.js';

const $ = (id) => document.getElementById(id);

// DOM HUD. Every write is guarded by a cache so we only touch the DOM when a
// value actually changes; layout thrash is the usual reason web HUDs stutter.
export class Hud {
  constructor() {
    this.el = {
      score: $('hud-score'), mult: $('hud-mult'), chain: $('hud-chain'), combo: $('hud-combo'), comboBar: $('hud-combo-bar'),
      sector: $('hud-sector'), sectorName: $('hud-sector-name'), best: $('hud-best'),
      hull: $('hud-hull'), hullN: $('hud-hull-n'), shield: $('hud-shield'), shieldN: $('hud-shield-n'),
      dash: $('hud-dash'), dashFill: $('hud-dash-fill'), emp: $('hud-emp'), buffs: $('hud-buffs'),
      bossBar: $('boss-bar'), bossFill: $('boss-fill'),
      banner: $('banner'), bannerKicker: $('banner-kicker'), bannerTitle: $('banner-title'),
      toast: $('toast'), fps: $('fps'),
      od: $('hud-od'), odFill: $('hud-od-fill'), odLabel: $('hud-od-label'),
      hint: $('hint'), popups: $('popups'),
    };
    this.popPool = [];
    for (let i = 0; i < 18; i++) {
      const d = document.createElement('div');
      d.className = 'popup';
      this.el.popups.appendChild(d);
      this.popPool.push(d);
    }
    this.popCursor = 0;
    this.hintTimer = null;
    this.cache = {};
    this.shownScore = 0;
    this.frames = 0;
    this.fpsT = 0;
  }

  set(key, el, prop, value) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    if (prop === 'text') el.textContent = value;
    else if (prop === 'scale') el.style.transform = `scaleX(${value})`;
    else if (prop === 'html') el.innerHTML = value;
  }

  toggle(key, el, cls, on) {
    const k = key + cls;
    if (this.cache[k] === on) return;
    this.cache[k] = on;
    el.classList.toggle(cls, on);
  }

  reset() {
    this.cache = {};
    this.shownScore = 0;
    this.showBoss(false);
    this.hint(null);
    for (const d of this.popPool) d.classList.remove('is-on');
  }

  update(dt, game, settings) {
    const e = this.el;
    const p = game.player;

    this.shownScore += (game.score - this.shownScore) * Math.min(1, dt * 9);
    if (Math.abs(game.score - this.shownScore) < 1) this.shownScore = game.score;
    this.set('score', e.score, 'text', fmt(this.shownScore));

    this.set('mult', e.mult, 'text', 'x' + game.mult);
    this.set('chain', e.chain, 'text', t('hud.chain', { n: game.chain }));
    this.set('comboBar', e.comboBar, 'scale', (Math.max(0, game.comboT) / COMBO_WINDOW).toFixed(3));
    this.toggle('combo', e.combo, 'is-live', game.chain > 0);

    this.set('best', e.best, 'text', fmt(Math.max(game.best, game.score)));

    const hull = Math.ceil(p.hull);
    this.set('hull', e.hull, 'scale', (p.hull / PLAYER.hull).toFixed(3));
    this.set('hullN', e.hullN, 'text', String(hull));
    this.toggle('hullLow', e.hull.parentElement, 'is-low', p.hull < 30);
    this.set('shield', e.shield, 'scale', (p.shieldHp / PLAYER.shieldMax).toFixed(3));
    this.set('shieldN', e.shieldN, 'text', String(Math.ceil(p.shieldHp)));

    this.set('dash', e.dashFill, 'scale', p.dashReady.toFixed(2));
    this.toggle('dashReady', e.dash, 'is-ready', p.dashReady >= 1);
    this.set('emp', e.emp, 'html', Array.from({ length: PLAYER.bombsMax }, (_, i) => `<b class="${i < p.bombs ? 'on' : ''}"></b>`).join(''));

    const odActive = p.odT > 0;
    const odShown = odActive ? p.odT / PLAYER.overdriveTime : p.od;
    this.set('od', e.odFill, 'scale', odShown.toFixed(2));
    this.toggle('odReady', e.od, 'is-ready', p.od >= 1 && !odActive);
    this.toggle('odActive', e.od, 'is-active', odActive);
    this.set('odLabel', e.odLabel, 'text', t(p.od >= 1 && !odActive ? 'hud.odReady' : 'hud.od'));

    const buffs = [];
    if (p.spreadT > 0) buffs.push([t('pickup.spread'), p.spreadT, PICKUP_COLORS.spread]);
    if (p.rapidT > 0) buffs.push([t('pickup.rapid'), p.rapidT, PICKUP_COLORS.rapid]);
    if (p.missileT > 0) buffs.push([t('pickup.missile'), p.missileT, PICKUP_COLORS.missile]);
    this.set('buffs', e.buffs, 'html', buffs
      .map(([name, left, color]) => `<div style="color:${color}">${name}<i><em style="transform:scaleX(${(left / 12).toFixed(2)})"></em></i></div>`)
      .join(''));

    if (game.boss.alive) this.set('boss', e.bossFill, 'scale', (game.boss.hp / game.boss.maxHp).toFixed(3));

    if (settings.fps) {
      this.frames++;
      this.fpsT += dt;
      if (this.fpsT >= 0.5) {
        e.fps.textContent = `${Math.round(this.frames / this.fpsT)} fps`;
        this.frames = 0;
        this.fpsT = 0;
      }
    } else if (e.fps.textContent) {
      e.fps.textContent = '';
    }
  }

  setSector(sector, wave, name) {
    this.el.sector.innerHTML = `${pad(sector)} &middot; ${wave === 0 ? 'B' : wave}`;
    this.el.sectorName.textContent = name;
  }

  banner(kicker, title, warning = false) {
    const b = this.el.banner;
    this.el.bannerKicker.textContent = kicker;
    this.el.bannerTitle.textContent = title;
    b.classList.remove('is-on', 'is-warning');
    void b.offsetWidth; // restart the CSS animation
    b.classList.add('is-on');
    b.classList.toggle('is-warning', warning);
  }

  toast(text, color = '#fff') {
    const t = this.el.toast;
    t.textContent = text;
    t.style.color = color;
    t.classList.remove('is-on');
    void t.offsetWidth;
    t.classList.add('is-on');
  }

  popMult() {
    const m = this.el.mult;
    m.classList.remove('pop');
    void m.offsetWidth;
    m.classList.add('pop');
  }

  showBoss(on) {
    this.el.bossBar.classList.toggle('is-on', on);
  }

  // Short tutorial tip near the bottom of the screen. null hides it.
  hint(text, seconds = 3.4) {
    const h = this.el.hint;
    clearTimeout(this.hintTimer);
    if (!text) {
      h.classList.remove('is-on');
      return;
    }
    h.textContent = text;
    h.classList.remove('is-on');
    void h.offsetWidth;
    h.classList.add('is-on');
    this.hintTimer = setTimeout(() => h.classList.remove('is-on'), seconds * 1000);
  }

  // Floating "+250" where an enemy died. x/y are in CSS pixels.
  popup(x, y, text, color, big = false) {
    const d = this.popPool[this.popCursor];
    this.popCursor = (this.popCursor + 1) % this.popPool.length;
    d.textContent = text;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    d.style.color = color;
    d.classList.toggle('big', big);
    d.classList.remove('is-on');
    void d.offsetWidth;
    d.classList.add('is-on');
  }
}
