# Sundown Airshoot: CV and portfolio details

Copy whichever parts fit your CV. The short version suits a one-page resume; the longer one suits a portfolio, LinkedIn or a project report.

---

## Project title

**Sundown Airshoot | 3D Arcade Shooter Game (Three.js, WebGL, Web Audio)**

**Live demo:** https://varunagarwal11228.github.io/sundown-airshoot/  
**Code:** https://github.com/varunagarwal11228/sundown-airshoot

## Tech stack (one line)

JavaScript (ES Modules), Three.js, WebGL2, GLSL shaders, Web Audio API, HTML5, CSS3, Gamepad API, Python (build tooling)

---

## Resume bullets: short version (pick 3 or 4)

- Built a 3D arcade shooter in JavaScript and Three.js with 5 enemy types, a 3-phase boss, procedural wave generation, combo scoring, medals and a local leaderboard (about 6,100 lines across 32 modules).
- Designed an Overdrive bullet-time mechanic (separate time scales for player and enemies, piercing shots) and homing missiles with steering and smoke trails.
- Wrote custom GLSL shaders for the sky, sun, neon grid, shields and a post-processing pass (bloom, chromatic aberration, shockwave refraction, warp zoom blur), plus multi-layer parallax scrolling for depth.
- Created the full soundtrack and all sound effects in code with the Web Audio API: a look-ahead step sequencer, synth voices, reverb, echo and sidechain compression, with no audio files.
- Built an AI autopilot for an attract/demo mode that dodges bullets by predicting where they cross the player's plane.
- Implemented a real-time GPU fluid simulation (Navier-Stokes) in raw WebGL2 for an interactive loading screen.
- Optimised with object pooling, instanced rendering (hundreds of bullets in 2 draw calls) and adaptive resolution, and packaged it as an offline single-file desktop app with a custom Python bundler.

## Resume bullets: detailed version

**Gameplay and systems**
- Designed the game loop as a state machine (loading, menu, demo, playing, paused, dying, game over) with time scaling for slow-motion moments.
- Built spring-damper flight controls (the ship eases toward the cursor with a slight overshoot), banking, barrel-roll dash with invincibility frames, and a follow camera with lag, FOV kick and trauma-based screen shake.
- Overdrive: a meter filled by kills that triggers 6 seconds of bullet time. Enemies, enemy bullets and the spawn timeline run on a slowed clock while the player runs at full speed with piercing, double-damage shots.
- Homing missiles that pick between the two nearest targets, turn harder the longer they fly, and deal splash damage.
- Wave director that builds each wave from a difficulty budget, so every run is different and difficulty rises by level. Easy/Normal/Hard settings scale enemy fire, bullet speed and damage.
- Five enemy behaviours (formation flyers, strafing shooters, homing kamikazes, ring-firing heavies, splitters that break into drones) and a boss whose attack patterns change at 66% and 33% health.
- Swept segment-vs-sphere collision tests so fast bullets cannot skip through small targets.
- Autopilot for demo mode with target selection, bullet-path prediction and automatic dodging.

**Graphics and visual design**
- Three.js scene with an HDR post-processing chain: UnrealBloom, a custom lens shader and ACES tone mapping.
- Six parallax layers (star dome, three dust bands, mountain ranges, city, pylons, gates) moving at different speeds.
- All 3D models generated in code (extruded shapes, low-poly geometry, neon edge outlines). No external model files.
- Tuned for readability: enemies lit in their own colours with rim glow, background dimming during play, white-hot enemy bullets, lock-on brackets that frame targets instead of covering them.
- GPU particle system with 7,000 pooled particles for explosions, engine trails, missile smoke and sparks.
- Visual identity in an 80s arcade style: chrome italic logo with neon script, a consistent slanted UI motif, and a typographic system (Kanit, Barlow Condensed, Barlow).

**Audio**
- Music sequencer with the "two clocks" scheduling pattern: a JS timer schedules notes ahead on the sample-accurate audio clock, and song changes wait for the next bar line.
- Synthesised drums, bass, pads, arpeggios and lead, routed through a mixer with convolution reverb, a feedback delay and a compressor.
- Sound effects panned in stereo to match where things happen on screen.

**UI/UX and tooling**
- Animated menus, HUD, pause and game-over screens, full keyboard and gamepad navigation.
- 3D aiming reticle with lock-on brackets, floating score popups, tutorial tips for first-time players, medals on the results screen.
- Settings saved in localStorage: volume, difficulty, graphics quality, background brightness, text style (simple English or sci-fi), text size, tips.
- Adaptive resolution that steps down automatically when the frame rate drops.
- Python build script that packs every ES module, font and icon into one HTML file using an import map of data URLs, so the game runs offline by double-click.
- Project documentation: README, game design document, changelog, MIT licence, package.json and a web app manifest.

---

## Skills to list

Game development · game design · 3D graphics · Three.js · WebGL / WebGL2 · GLSL shaders · post-processing · particle systems · procedural generation · game AI · collision detection · physics (spring-damper) · Web Audio API · procedural audio · UI/UX design · typography · performance optimisation · JavaScript (ES6+) · Python scripting

---

## Portfolio description (2 or 3 lines)

Sundown Airshoot is a synthwave-style 3D arcade shooter that runs in the browser. Everything you see and hear (models, shaders, music and sound effects) is generated in code. It has a bullet-time Overdrive mode, homing missiles, a 3-phase boss, a fluid-simulation loading screen, a self-playing demo mode, and it runs offline from a single file.

## 30-second pitch (for the event)

"This is Sundown Airshoot, a 3D shooter I built with Three.js. There are no image or sound files in it. The ships are built from code, the visual effects are my own shaders, and the music you're hearing is a synthesiser I programmed, playing live. Kill enemies to fill the Overdrive bar, press R, and time slows down while your shots go through everything. Want to try? Mouse to fly, click to shoot, Shift to dodge."

---

## LinkedIn post (draft)

> Just finished my game dev project for the JSS University showcase: **Sundown Airshoot**, a 3D arcade shooter that runs in the browser.
>
> Things I enjoyed building:
> - A bullet-time "Overdrive" mode where enemies slow down but you don't
> - Custom GLSL shaders for the neon grid, the sunset and the warp jump between levels
> - A soundtrack made completely in code with the Web Audio API (no audio files at all)
> - A demo mode where an AI pilot plays the game by itself and dodges bullets
>
> Built with JavaScript, Three.js and WebGL. Happy to share the code with anyone curious.
>
> #gamedev #threejs #webgl #javascript #indiegame

---

## GitHub repo

- **Name:** `sundown-airshoot`
- **Description:** 3D synthwave arcade shooter in Three.js. Bullet time, homing missiles, procedural music, custom shaders, runs offline from one file.
- **Topics:** `game` `threejs` `webgl` `glsl` `web-audio` `shooter` `javascript` `gamedev` `procedural-generation`

The folder is ready to upload as it is: README, LICENSE, CHANGELOG, `.gitignore` and `package.json` are already there. Add 3 or 4 screenshots and a short GIF of gameplay to the README; recruiters look at those first.

---

## Numbers you can quote

| Metric | Value |
| --- | --- |
| Code | ~6,100 lines of JavaScript in 32 modules, ~550 lines of CSS, ~220 lines of Python tooling |
| Custom shaders | 9 (sky, sun, floor grid, stars/dust, particles, shield, lens pass, fluid solver set) |
| Enemy types | 5 + a 3-phase boss |
| Power-ups | 6 (spread, rapid fire, shield, repair, bomb, homing missiles) |
| Parallax layers | 6 |
| Music tracks | 4 (menu, gameplay, boss, game over), all generated live |
| Particles | up to 7,000 on screen |
| Build | 1 HTML file, about 4.4 MB, works offline |
| External assets | 0 images, 0 audio files, 0 3D models (only fonts) |
