# Sundown Airshoot: game design document

Version 2.1 · Varun Agarwal

## 1. Concept

A short-session 3D arcade shooter. You fly down a neon corridor toward a sun that never sets, shooting down waves of drones and a boss at the end of each level. A run lasts 3 to 10 minutes, which suits an event table or a quick break.

**Pillars**

1. **Readable chaos.** Lots of bullets and explosions, but you can always see the threat. The background dims during play, enemy bullets are white-hot, and enemies are lit in their own colour.
2. **Feels good in the hands.** Spring-based movement, dash with invincibility, screen shake, slow motion on big moments.
3. **Made from nothing.** No image, model or audio files. Everything is generated in code, which is also the technical story for the showcase.

## 2. Core loop

```
fly and shoot  ->  kill quickly to build the combo  ->  fill Overdrive
      ^                                                     |
      |                                                     v
next level <- warp jump <- beat the boss <- survive 4 waves (power-ups help)
```

Moment to moment: line up the reticle, hold fire, slide out of bullet paths, dash through anything you can't avoid.

## 3. Controls

| Action | Keyboard / mouse | Gamepad |
| --- | --- | --- |
| Move | Mouse or W A S D / arrows | Left stick / D-pad |
| Shoot | Hold left click or Space | A / right trigger |
| Dash | Shift or right click | B / left bumper |
| Bomb | E or Q | X / right bumper |
| Overdrive | R or middle click | Y |
| Pause | Esc or P | Start |
| Full screen | F | |

The ship follows the mouse through a spring (stiffness 70, damping 13), so it overshoots slightly and settles. Keyboard and stick move an aim point instead, and the same spring follows it.

## 4. Player

| Stat | Value |
| --- | --- |
| Health | 100 |
| Shield | up to 50, absorbs damage first |
| Fire rate | 11.8 shots/s (20/s with Rapid Fire, nearly double in Overdrive) |
| Bolt speed | 280 units/s, with light aim assist toward a target on the line of fire |
| Dash | 0.42 s barrel roll, can't be hit, 1.5 s cooldown. Dashing into any enemy except a Warden destroys it (+250) |
| Bomb | start with 1, carry up to 3. Clears every enemy bullet, 6 damage to all enemies, 14 to the boss |
| Invulnerability after a hit | 1 s |
| Overdrive | 6 s. Enemies, their bullets and the spawn timer run at 45% speed. Shots deal 2 damage and pierce |

## 5. Enemies

| Enemy | Health | Score | Overdrive fill | Drop chance | Behaviour |
| --- | --- | --- | --- | --- | --- |
| Mote | 1 | 100 | 3.5% | 3.5% | Flies in formations (line, snake, V, pincer). From wave 3 onward, some fire one aimed shot. |
| Lancer | 4 | 250 | 7% | 12% | Slows to a hold position, strafes, fires 3-shot aimed bursts, leaves after ~10 s. |
| Hornet | 2 | 150 | 5% | 5% | Approaches, beeps when it locks on, then homes in and rams (22 damage). |
| Splitter | 7 | 400 | 10% | 30% | Holds back and shoots, then drifts at you. Breaks into 4 fast Motes when destroyed. |
| Warden | 16 | 800 | 20% | 100% | Heavy. Fires expanding rings of 12 bullets with a gap to fly through, plus aimed triples. |

Enemy health grows by 25% per level. Hitboxes are spheres a little larger than the visible hull.

### Boss: Helios Engine

Health 240 + 120 per level. Translucent armour, a glowing core, three spinning rings and six pods.

| Phase | Health | Attacks |
| --- | --- | --- |
| 1 | 100–66% | Rotating spiral that switches on and off, aimed triple shots |
| 2 | 66–33% | Rings of 18 bullets, 5-way aimed spread, summons 4 Motes every 8 s |
| 3 | 33–0% | Double spiral, aimed triples, two Hornets every 6 s |

Each phase change flashes the screen, clears the bullets on screen and gives the player 1.4 s of breathing room.

## 6. Power-ups

| Power-up | Effect |
| --- | --- |
| Spread Shot | Two extra angled bolts for 12 s |
| Rapid Fire | Fire rate 0.085 s → 0.05 s for 12 s |
| Homing Missiles | Two missiles every 0.8 s for 12 s, 3 damage plus splash |
| Shield | Shield to 50 |
| Repair | +30 health |
| Bomb | +1 bomb |

Drops are weighted: Repair becomes much more likely below 50 health, and Bomb never drops when you're already carrying 3.

## 7. Levels and difficulty

- 4 waves per level, then the boss, then a warp jump to the next level.
- Each wave has a points budget: `9 + 4 × wave + 6 × (level − 1)`. The director spends it on groups (Motes 3, Lancers 3, Hornets 3, Splitter 4, Warden 7) spaced 2.3–3.4 s apart, closer together on later levels.
- Hornets appear from wave 2, Splitters and Wardens from wave 3.
- Enemy fire rate and bullet speed scale with a difficulty value that rises 17% per level and 3.5% per wave (capped at 1.9×).
- Settings > Difficulty multiplies that: Easy 0.8× (and 60% damage taken), Hard 1.25× (135% damage taken, 1.3× score).
- Four colour themes in rotation: Sundown Basin, Glass Midnight, Ember Reach, Aurora Shelf.

## 8. Scoring

- Kill score × combo multiplier × difficulty bonus.
- The multiplier goes up by 1 for every 5 kills in a chain, up to ×8. The chain breaks after 2.4 s without a kill, or when you get hit.
- Wave clear: `500 × wave × level`, plus 1,500 if you took no damage.
- Boss: `5,000 × level`, and the hull is patched by 35.
- Medals at the end of a run: Sharpshooter (55%+ accuracy), Combo Master (30 chain), Boss Breaker, Untouchable (2 perfect waves), Survivor (3 minutes), Ace Pilot (100 kills), Time Bender (3 Overdrives).
- Local top-10 leaderboard with 3-letter initials. It starts with five par scores so it's never empty.

## 9. Art direction

- **Mood:** 80s synthwave arcade cabinet. Sunset palette, neon grid, chrome logo.
- **Readability rules:** the background dims to 40% during play. Enemies are lit in their own colour (pink, orange, red, purple, yellow), player shots are cyan, enemy bullets are white-hot, and pick-ups have distinct shapes.
- **Shapes:** low-poly flat-shaded hulls with neon edge outlines. Everything is built from code.
- **Type:** Kanit Black Italic for the logo and headings, Barlow Condensed for menus and HUD, Barlow for body text, Mr Dafoe for the neon script. The italic slant repeats in the UI shapes (menu highlight, bars, buttons).
- **Depth:** six parallax layers (stars, three dust bands, mountains, city, pylons, gates) moving at different speeds.
- **Effects:** HDR bloom, chromatic aberration, shockwave refraction, warp zoom blur, Overdrive colour grade, film grain, vignette.

## 10. Audio

- All sound is synthesised live with the Web Audio API.
- Music: a step sequencer with drums, octave bass, pads, arpeggio and lead. Menu 96 BPM, gameplay 112 BPM (A minor: Am, F, C, G), boss 128 BPM (D minor: Dm, B♭, Gm, A), game over 72 BPM. Song changes wait for the next bar.
- Gameplay intensity raises the hi-hat density, filter brightness and how often the lead plays.
- Sound effects are panned to where things happen on screen. The music is muffled when paused.

## 11. UI flow

```
Loader (fluid sim) -> Main menu -> Play -> HUD
                       |   |  |              |-> Pause -> Resume / Restart / Main menu
                       |   |  |              '-> Game over -> initials -> High scores
                       |   |  '-> Settings
                       |   '-> High scores
                       '-> How to Play, Credits
Main menu idle 30 s -> Demo mode (AI plays) -> any input -> Main menu
```

## 12. Accessibility and comfort

- Text style: Simple English or Sci-fi. Text size: Normal, Large, Extra large.
- Background brightness during play: Dim, Medium, Full.
- Screen shake can be turned off. Tutorial tips can be turned off.
- Full keyboard, mouse and gamepad support in menus and in game.
- Adaptive resolution keeps the frame rate up on weaker laptops.

## 13. Ideas for later

- Online leaderboard
- Upgrade shop between levels
- More enemy types and a second boss
- Touch controls for phones
- Ship colour choices
