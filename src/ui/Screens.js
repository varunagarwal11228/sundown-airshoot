import { Store } from '../core/Store.js';
import { fmt, pad } from '../core/math.js';
import { AUTHOR, VERSION } from '../config.js';
import { t } from '../text.js';

const $ = (id) => document.getElementById(id);
const PANELS = ['menu', 'howto', 'scores', 'settings', 'credits', 'hud', 'pause', 'gameover'];

// Screen router + keyboard/gamepad menu navigation.
export class Screens {
  constructor(game) {
    this.game = game;
    this.current = null;
    this.focus = 0;
    this.items = [];
    this.stickLatch = false;
    this.lastEntry = null;

    $('menu-build').textContent = 'v' + VERSION;
    $('credit-author').textContent = AUTHOR;

    document.querySelectorAll('[data-action]').forEach((btn) => {
      // Keep DOM focus off buttons; focus is drawn by us, and a focused
      // button would also fire a native click on Enter/Space.
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => this.action(btn.dataset.action));
      btn.addEventListener('pointerenter', () => {
        const i = this.items.indexOf(btn);
        if (i >= 0 && i !== this.focus) this.setFocus(i);
      });
    });

    this.bindSettings();

    $('go-entry').addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitScore();
    });
    $('go-name').addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
    });

    addEventListener('keydown', (e) => this.onKey(e));
  }

  show(id, { keepHud = false } = {}) {
    for (const p of PANELS) {
      const on = p === id || (keepHud && p === 'hud');
      $(p).classList.toggle('is-active', on);
    }
    this.current = id;
    const list = $(id).querySelectorAll('.menu-list button, .panel-foot button');
    this.items = [...list];
    this.focus = 0;
    if (id === 'scores') this.renderBoard();
    if (id === 'settings') this.syncSettings();
    if (id === 'menu') {
      $('menu-best').textContent = fmt(Store.best());
      $('menu-by').textContent = t('menu.by', { name: AUTHOR });
      $('scores').dataset.back = 'menu';
    }
    this.setFocus(0, true);
  }

  setFocus(i, silent = false) {
    if (!this.items.length) return;
    this.focus = (i + this.items.length) % this.items.length;
    this.items.forEach((b, n) => b.classList.toggle('is-focus', n === this.focus));
    if (!silent) this.game.sfx?.ui('move');
  }

  get navigable() {
    return this.current && this.current !== 'hud';
  }

  onKey(e) {
    if (!this.navigable) return;
    const active = document.activeElement;
    const inForm = active && (active.tagName === 'INPUT' || active.tagName === 'SELECT');
    const code = e.code;
    if (code === 'Escape') {
      if (inForm) active.blur();
      if ($(this.current).dataset.back) {
        e.preventDefault();
        this.action('back');
      }
      return;
    }
    if (inForm) return;
    const row = this.current === 'gameover';
    if (code === 'ArrowDown' || code === 'KeyS' || (row && code === 'ArrowRight')) {
      e.preventDefault();
      this.setFocus(this.focus + 1);
    } else if (code === 'ArrowUp' || code === 'KeyW' || (row && code === 'ArrowLeft')) {
      e.preventDefault();
      this.setFocus(this.focus - 1);
    } else if (code === 'Enter' || code === 'Space') {
      e.preventDefault();
      this.items[this.focus]?.click();
    } else if (code === 'Backspace' && $(this.current).dataset.back) {
      e.preventDefault();
      this.action('back');
    }
  }

  // Gamepad menu navigation, called from the game loop when not flying.
  pollPad(input) {
    if (!this.navigable) return;
    const y = input.pad.y;
    if (Math.abs(y) > 0.6) {
      if (!this.stickLatch) this.setFocus(this.focus + (y < 0 ? 1 : -1));
      this.stickLatch = true;
    } else {
      this.stickLatch = false;
    }
    if (input.hit('Pad0')) this.items[this.focus]?.click();
    if (input.hit('Pad1') && $(this.current).dataset.back) this.action('back');
  }

  action(name) {
    const g = this.game;
    const sfx = g.sfx;
    switch (name) {
      case 'start':
        sfx?.ui('select');
        g.startRun();
        break;
      case 'howto':
      case 'scores':
      case 'settings':
      case 'credits':
        sfx?.ui('select');
        this.show(name);
        break;
      case 'back': {
        sfx?.ui('back');
        const target = $(this.current).dataset.back || 'menu';
        if (target === 'gameover-done') {
          $('scores').dataset.back = 'menu';
          this.show('gameover');
        } else {
          this.show(target);
        }
        break;
      }
      case 'resume':
        sfx?.ui('select');
        g.resume();
        break;
      case 'restart':
        sfx?.ui('select');
        g.restart();
        break;
      case 'quit':
        sfx?.ui('back');
        g.quitToMenu();
        break;
      case 'reset-scores': {
        // Two clicks: a stray click at an event table shouldn't wipe the board.
        const label = document.querySelector('[data-action="reset-scores"] span');
        clearTimeout(this.resetTimer);
        if (!this.resetArmed) {
          this.resetArmed = true;
          label.textContent = t('settings.resetConfirm');
          sfx?.ui('move');
          this.resetTimer = setTimeout(() => {
            this.resetArmed = false;
            label.textContent = t('settings.reset');
          }, 3000);
        } else {
          this.resetArmed = false;
          Store.resetScores();
          this.game.best = Store.best();
          sfx?.ui('back');
          label.textContent = t('settings.resetDone');
          this.resetTimer = setTimeout(() => (label.textContent = t('settings.reset')), 2000);
        }
        break;
      }
    }
  }

  // -- settings -------------------------------------------------------------
  bindSettings() {
    const form = $('settings-form');
    form.addEventListener('input', (e) => {
      const el = e.target;
      const s = Store.settings;
      if (el.type === 'range') s[el.name] = parseFloat(el.value);
      else if (el.type === 'checkbox') s[el.name] = el.checked;
      else s[el.name] = el.value;
      Store.saveSettings();
      this.syncSettings();
      this.game.applySettings(el.name);
    });
  }

  syncSettings() {
    const form = $('settings-form');
    const s = Store.settings;
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'range') {
        el.value = s[el.name];
        el.nextElementSibling.textContent = Math.round(s[el.name] * 100);
      } else if (el.type === 'checkbox') el.checked = !!s[el.name];
      else {
        el.value = s[el.name];
        if (el.tagName === 'SELECT' && el.selectedIndex < 0) el.selectedIndex = 0;
      }
    }
  }

  // -- leaderboard ----------------------------------------------------------
  renderBoard() {
    const board = $('board');
    board.innerHTML = '';
    for (const s of Store.scores) {
      const li = document.createElement('li');
      if (s === this.lastEntry) li.className = 'is-new';
      li.innerHTML = `<span class="who"></span><span class="where"></span><b>${fmt(s.score)}</b>`;
      const diff = s.difficulty && s.difficulty !== 'normal' ? ` · ${t('settings.' + s.difficulty)}` : '';
      li.querySelector('.where').textContent = t('scores.level', { n: s.sector || 1, nn: pad(s.sector || 1) }) + diff;
      li.querySelector('.who').textContent = s.name;
      board.appendChild(li);
    }
  }

  // -- game over ------------------------------------------------------------
  showGameOver(stats) {
    this.pendingStats = stats;
    $('go-title').textContent = t(stats.newBest ? 'go.record' : 'go.lost');
    $('go-score').textContent = fmt(stats.score);
    $('go-best').textContent = stats.newBest ? t('go.personal') : t('go.best', { n: fmt(stats.best) });
    $('go-stats').innerHTML = [
      ['go.level', `${stats.sector} · ${stats.wave > 4 ? 'B' : stats.wave}`],
      ['go.kills', fmt(stats.kills)],
      ['go.accuracy', `${stats.accuracy}%`],
      ['go.chain', fmt(stats.maxChain)],
      ['go.time', stats.time],
      ['go.bosses', String(stats.bosses)],
    ].map(([k, v]) => `<div><dt>${t(k)}</dt><dd>${v}</dd></div>`).join('');

    const medals = $('go-medals');
    medals.innerHTML = '';
    if (!stats.medals.length) {
      const em = document.createElement('em');
      em.textContent = t('medal.none');
      medals.appendChild(em);
    }
    for (const key of stats.medals) {
      const span = document.createElement('span');
      span.textContent = t('medal.' + key);
      medals.appendChild(span);
    }

    const entry = $('go-entry');
    entry.hidden = !Store.qualifies(stats.score);
    this.show('gameover');
    if (!entry.hidden) {
      const input = $('go-name');
      input.value = '';
      setTimeout(() => input.focus(), 350);
    }
  }

  submitScore() {
    const stats = this.pendingStats;
    if (!stats) return;
    const name = ($('go-name').value || 'ACE').padEnd(3, '-');
    this.lastEntry = Store.addScore({ name, score: stats.score, sector: stats.sector, difficulty: Store.settings.difficulty });
    this.pendingStats = null;
    $('go-entry').hidden = true;
    $('go-name').blur();
    this.game.best = Store.best();
    this.game.sfx?.pickup();
    this.show('scores');
    $('scores').dataset.back = 'gameover-done';
  }
}
