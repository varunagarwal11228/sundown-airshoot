# Changelog

## 2.1.0 (2026-10-08)

New look, and enemies are much easier to see.

- Fixed: the lock-on marker used to sit on top of the enemy as a bright gold glow and hide it. It's now a set of thin brackets around the target.
- Enemies are lit in their own colour (pink, orange, red, purple, yellow) with a soft rim glow, so you see a solid shape instead of a light.
- Enemy eyes, the boss core and Warden rings no longer bloom into blobs of light. Bloom is gentler overall.
- Enemies are 35–60% bigger, hold position closer to you, and don't fade with distance. The camera is slightly more zoomed in during play.

- New type: Kanit Black Italic for the logo and headings, Barlow Condensed for menus and HUD, Barlow for body text, Mr Dafoe for the neon script.
- New logo: chrome "SUNDOWN" with a horizon split and a neon "Airshoot" script, styled like an 80s arcade cabinet.
- Slanted shapes everywhere (menu highlight, health bars, buttons, medals) to match the italic type.
- Normal letter spacing, no numbered menu items, no decorative separators.
- Simpler loading screen: logo, progress bar and one status line. Step timings moved to the browser console.
- "a game by ..." line on the main menu.
- Added `package.json`, `manifest.json`, `LICENSE`, `.gitignore`, a game design document and this changelog.
- Fixed: `Play Sundown Airshoot.bat` built a broken file address (an extra "0" at the end). It now also works from folders with spaces.
- Fixed: dying during Overdrive left the golden tint on the game-over screen.
- Fixed: double-clicking "Play Again" could restart twice.
- "Reset high scores" now asks for a second click, so a stray click can't wipe the leaderboard.
- Pickups glow less, so they read as icons instead of lights.
- Fixed: under sustained fire the boss core blazed white and hid the boss. Hits now only tint it.
- Screenshot mode (`?shot=menu`, `play`, `boss`) and README screenshots.
- `Create Desktop Shortcut.bat`: rebuilds the Desktop icon after the folder is moved.

## 2.0.0 (2026-10-08)

Renamed from Sundown Protocol to **Sundown Airshoot**.

- Overdrive: kills fill a meter, R triggers 6 seconds of bullet time with piercing shots.
- Homing missiles power-up.
- Aiming reticle that locks onto targets.
- New enemy: the Splitter.
- Warp jump between levels.
- Floating score popups and end-of-run medals.
- Tutorial tips for new players.
- Difficulty setting (Easy, Normal, Hard).
- Demo mode after 30 seconds idle on the menu.
- Adaptive resolution when the frame rate drops.
- Softer sun on the menu, menu camera adapts to screen shape.

## 1.1.0 (2026-10-08)

- All on-screen text rewritten in simple English, with a Sci-fi option and a text size option in Settings. Every line lives in `src/text.js`.
- Background dims during play so bullets are easier to see (Settings > Background in game).
- Enemy bullets changed to white-hot so they stand out against every colour theme.
- Bigger, brighter boss.
- HUD tilt changed to a 2D skew so it renders on every GPU.

## 1.0.0 (2026-10-08)

First playable version.

- Three.js scene with bloom and a custom lens shader.
- Neon grid, striped sun, mountains, city and pylons with parallax scrolling.
- Spring-based flight, dash, bomb, shield.
- Four enemy types and a three-phase boss.
- Procedural synthwave soundtrack and sound effects (Web Audio API).
- Fluid simulation loading screen.
- Local leaderboard, settings, pause and game over screens.
- Single-file offline build and a desktop shortcut.
