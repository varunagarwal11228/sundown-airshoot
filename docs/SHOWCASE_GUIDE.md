# Showcase day guide

## The night before

1. Copy the whole `sundown-airshoot` folder to a USB drive as a backup.
2. Double-click **Sundown Airshoot** on the Desktop and play one full level, boss included.
3. Settings: set **Difficulty** to **Easy** for visitors. Most people at an event have never played it and should get to see the boss.
4. Settings: if the laptop has no graphics card or feels slow, set **Graphics** to **Low**. (The game also lowers its resolution by itself if it detects a low frame rate.)
5. Settings: click **Reset high scores** twice (the second click confirms) so visitors start with a fresh leaderboard.
6. Charge the laptop. Plug it in at the event; laptops slow down a lot on battery saver.
7. Bring a mouse. If you have a gamepad (Xbox/PS), bring it too; it just works.
8. Bring headphones or a small speaker. The music is half the show.

## At the table

1. Open the game and leave it on the **main menu**. After 30 seconds with nobody touching it, **demo mode** starts: the game plays itself with an AI pilot. It's a good way to draw people in. Any key or mouse movement brings the menu back.
2. Press **F** for full screen.
3. Let visitors play. Tutorial tips appear for the first 20 seconds, so you don't need to explain much: mouse to fly, hold click to shoot, Shift to dodge.
4. When they die, they type 3 initials into the leaderboard and see their medals. People come back to beat each other's scores.

## 3-minute demo script

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | Reload the game, move the mouse on the loading screen | "The loading screen is a real fluid simulation running on the graphics card. The coloured ink follows the mouse." |
| 0:20 | Main menu | "The menu is a live 3D scene. The music is not a file: it's a synthesiser I wrote with the Web Audio API, playing notes in real time." |
| 0:40 | Start, fly side to side | "The ship is pulled toward the mouse by a spring, so it feels smooth. Watch the background: stars, mountains, buildings and towers all move at different speeds. That's parallax scrolling, and it gives the depth." |
| 1:00 | Point at the square sights | "These sights show where my shots will go. When gold brackets appear around an enemy, I'm locked on." |
| 1:15 | Shoot a group, build a combo | "Kill enemies quickly and the multiplier climbs to x8. Every explosion sends out a shockwave that bends the screen, done with my own shader." |
| 1:40 | When the Overdrive bar is full, press R | "This is Overdrive. Enemies and their bullets slow down, but I don't, and my shots go straight through everything." |
| 2:00 | Press Shift through a bullet, then E | "Dash makes you invincible for a moment. The bomb clears every bullet on screen." |
| 2:15 | Open Settings | "There's difficulty, a background dimmer to make bullets easier to see, graphics quality, and the text can switch between simple English and a sci-fi style." |
| 2:35 | Show the code (VS Code) | "It's about 6,100 lines of JavaScript in 32 modules, and a Python script packs it all into one file that works offline. There's also a design document in the docs folder." |

To skip straight to the boss for a demo, open the browser console (F12) while playing and run:

```js
__sundown.enemies.clear(); __sundown.director.wave = 4; __sundown.director.state = 'gap'; __sundown.director.delay = 0;
```

To fill the Overdrive bar instantly, run `__sundown.player.od = 1` and then press R.

## Questions you might get (and simple answers)

**What did you use to build it?**
JavaScript with the Three.js library for 3D. Three.js handles talking to WebGL (the graphics card). The shaders, game logic, audio and UI are my own code.

**Where are the 3D models from?**
They are built in code from basic shapes: cylinders, cones, extruded 2D outlines. See `src/entities/models.js`. The glowing outlines are an edge-detection geometry drawn in bright colours, and the bloom pass makes them glow.

**How does the glow work?**
The scene is rendered into a high-dynamic-range buffer. Anything brighter than a threshold is blurred and added back on top (bloom). Neon lines are given colour values above 1.0 on purpose so they cross that threshold.

**How does Overdrive slow things down?**
The game keeps two clocks. The player always moves with the normal frame time. Enemies, their bullets and the wave timeline get the frame time multiplied by 0.45. So the same update code just runs slower for them (`simulate()` in `src/game/Game.js`).

**How do the homing missiles work?**
Each frame a missile finds a target, works out the direction to it, and turns its velocity part of the way toward that direction. The turn gets stronger the longer it flies, which gives that curving path. See `src/entities/Missiles.js`.

**How does the demo mode play by itself?**
The autopilot (`src/game/Autopilot.js`) pretends to be the mouse. It aims at the nearest enemy, and for every incoming bullet it calculates where the bullet will cross the ship's plane. If one will land close, it steers away, and if it's about to hit, it dashes.

**How is the music made without audio files?**
The Web Audio API has oscillators (sine, square, sawtooth waves) and filters. A kick drum is a sine wave that drops quickly in pitch. A snare is filtered white noise. The sequencer (`src/audio/Music.js`) wakes up every 25 ms and schedules the next notes a little ahead of time on the audio clock, which is far more precise than JavaScript timers.

**What is parallax scrolling?**
Things far away seem to move slower than things close by. The game has several background layers, each moving at its own speed (`src/world/Parallax.js`), so the scene feels deep even though you never really move forward.

**How does collision detection work?**
Every enemy is treated as a sphere. Bullets are fast, so instead of checking only where a bullet is now, I check the whole line it travelled this frame against each sphere. That stops bullets passing through enemies between frames.

**How do you keep it fast?**
Nothing is created during gameplay. Enemies, bullets and particles come from pools made at load time and get reused. All bullets of one kind are drawn as a single instanced mesh, so 400 bullets cost one draw call. If the frame rate still drops, the game renders at a lower resolution.

**What is the fluid simulation?**
It solves a simplified version of the Navier-Stokes equations on the GPU each frame: move the ink along the flow, add swirl, then remove pressure so the fluid doesn't compress. Each step is a small shader working on a texture (`src/ui/FluidSim.js`).

**How does the difficulty work?**
Each wave gets a points budget that grows with the level. The wave director spends it on enemy groups (cheap drones, expensive heavies) and spaces them out in time (`src/game/Director.js`). The Easy/Normal/Hard setting then scales enemy fire rate, bullet speed and damage.

**What was the hardest part?**
Pick the one you found most interesting when going through the code. Common good answers: getting the music to stay in time, making the controls feel smooth, making the autopilot dodge believably, or getting bullets readable against the busy background (that's why the background dims during play).

**Why does it look like this?**
I wanted it to feel like an 80s arcade cabinet: a chrome logo with a neon script, a sunset palette and italic type. The slant in the letters is repeated in the menus, bars and buttons so the whole UI feels like one design. The background dims during play and each enemy has its own colour so the action stays readable.

**What would you add next?**
Online leaderboard, more levels and enemy types, mobile touch controls, an upgrade shop between levels.

## If something goes wrong

| Problem | Fix |
| --- | --- |
| No sound | Click once inside the game window. Browsers block audio until the first click. Check the laptop volume and Settings > Music. |
| Low frame rate | Settings > Graphics > Low. Plug in the charger. Close other apps. |
| Black screen | Update the graphics driver, or open `dist/SundownAirshoot.html` in Chrome instead. |
| Shortcut does nothing (folder was moved) | Double-click `Create Desktop Shortcut.bat` in the game folder, or open `dist/SundownAirshoot.html` directly. |
| Text too small on a big screen | Settings > Text size > Large. |
| Demo mode starts while you're talking | It only starts after 30 seconds on the main menu with no input. Moving the mouse stops it. |
