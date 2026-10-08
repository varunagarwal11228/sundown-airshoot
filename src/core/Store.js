const KEY_SETTINGS = 'sundown.settings.v1';
const KEY_SCORES = 'sundown.scores.v1';

const DEFAULT_SETTINGS = {
  music: 0.7,
  sfx: 0.8,
  quality: 'high',
  shake: true,
  fps: false,
  playDim: '0.4',      // how bright the background is while flying (1 = full)
  textStyle: 'simple', // 'simple' or 'story', see src/text.js
  textSize: '1',
  difficulty: 'normal',
  hints: true,         // short tutorial tips at the start of a run
};

// Arcade-style par scores so the board isn't empty on a fresh machine.
const PAR_SCORES = [
  { name: 'KES', score: 30000, sector: 2, par: true },
  { name: 'HLX', score: 20000, sector: 2, par: true },
  { name: 'DSK', score: 12000, sector: 1, par: true },
  { name: 'NVA', score: 6000, sector: 1, par: true },
  { name: 'SUN', score: 2500, sector: 1, par: true },
];

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or storage disabled: settings just won't persist */
  }
}

const savedScores = read(KEY_SCORES, null);

export const Store = {
  settings: { ...DEFAULT_SETTINGS, ...read(KEY_SETTINGS, {}) },
  scores: Array.isArray(savedScores) ? savedScores : PAR_SCORES.map((s) => ({ ...s })),

  saveSettings() {
    write(KEY_SETTINGS, this.settings);
  },

  best() {
    const real = this.scores.filter((s) => !s.par);
    return real.length ? real[0].score : 0;
  },

  qualifies(score) {
    if (score <= 0) return false;
    return this.scores.length < 10 || score > this.scores[this.scores.length - 1].score;
  },

  addScore(entry) {
    const record = { ...entry, at: Date.now() };
    this.scores.push(record);
    this.scores.sort((a, b) => b.score - a.score);
    this.scores.length = Math.min(this.scores.length, 10);
    write(KEY_SCORES, this.scores);
    return record;
  },

  resetScores() {
    this.scores = PAR_SCORES.map((s) => ({ ...s }));
    write(KEY_SCORES, this.scores);
  },
};
