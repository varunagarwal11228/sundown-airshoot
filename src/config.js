export const AUTHOR = 'Varun Agarwal';
export const GAME_NAME = 'Sundown Airshoot';
export const VERSION = '2.1.0';

// Play volume: the ship lives on the z = 0 plane, enemies come in from -z.
export const BOUNDS = { x: 15, yMin: 1.6, yMax: 11.5 };
export const SPAWN_Z = -260;
export const DESPAWN_Z = 30;

export const SPEED = {
  menu: 24,
  flight: 72,
  boss: 52,
  dead: 8,
};

export const PLAYER = {
  hull: 100,
  shieldMax: 50,
  stiffness: 70,      // spring pulling the ship toward the aim point
  damping: 13,        // < 2*sqrt(stiffness) on purpose: a little overshoot reads as weight
  fireInterval: 0.085,
  rapidInterval: 0.05,
  boltSpeed: 280,
  dashTime: 0.42,
  dashCooldown: 1.5,
  invuln: 1.0,
  bombs: 1,
  bombsMax: 3,
  overdriveTime: 6,
};

// Settings > Difficulty. `enemy` scales fire rate and bullet speed,
// `damage` scales what hits do to you.
export const DIFFICULTY = {
  easy: { enemy: 0.8, damage: 0.6, score: 0.8 },
  normal: { enemy: 1, damage: 1, score: 1 },
  hard: { enemy: 1.25, damage: 1.35, score: 1.3 },
};

export const WAVES_PER_SECTOR = 4;
export const COMBO_WINDOW = 2.4;
export const MULT_MAX = 8;

export const SECTORS = [
  {
    name: 'Sundown Basin',
    skyTop: '#06011a', skyMid: '#2b0a52', horizon: '#ff3d7f',
    sunA: '#ffe66d', sunB: '#ff2e88',
    grid: '#ff2bd6', floor: '#0b0318', fog: '#2a0b47',
    mountain: '#12042e', ridge: '#ff4fd8', accent: '#3ff0ff',
  },
  {
    name: 'Glass Midnight',
    skyTop: '#01020c', skyMid: '#0a1a4a', horizon: '#1fb6ff',
    sunA: '#d6fbff', sunB: '#3d5afe',
    grid: '#22e1ff', floor: '#030818', fog: '#071a3d',
    mountain: '#040a24', ridge: '#3ff0ff', accent: '#ff3ea5',
  },
  {
    name: 'Ember Reach',
    skyTop: '#100004', skyMid: '#420713', horizon: '#ff6a00',
    sunA: '#fff1a8', sunB: '#ff2a00',
    grid: '#ff7a1a', floor: '#120206', fog: '#2e0609',
    mountain: '#170306', ridge: '#ffb347', accent: '#ffe66d',
  },
  {
    name: 'Aurora Shelf',
    skyTop: '#00110d', skyMid: '#013a33', horizon: '#00ffa3',
    sunA: '#f4ff9e', sunB: '#00d6a0',
    grid: '#3dffb8', floor: '#001410', fog: '#00261f',
    mountain: '#000f0b', ridge: '#7dffcf', accent: '#ff3ea5',
  },
];
