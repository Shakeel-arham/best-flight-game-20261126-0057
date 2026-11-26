# Canyon Courier

A desert-canyon mail run: a small prop plane, a winding canyon, glowing
rings to thread, and a runway waiting at the far end. Fly it in any desktop
browser — no network, no build step, no libraries.

## How to play

Open `game/index.html` in desktop Chrome (or serve `game/` with any static
server, e.g. `python3 -m http.server` from inside `game/`).

- **W / S** — throttle up / down
- **Arrow keys** — pitch and roll (Up climbs, Down dives, Left/Right bank)
- **A / D** — roll left / right
- **Mouse** — move to steer, hold the pointer where you want to go
- **1 / 2 / 3** — pick a mission from the menu (or **Enter** for Dawn Delivery)
- **R** — fly again after a crash or a landing

The autopilot flies a demo behind the menu until you first touch a key or
the mouse.

## The missions

1. **Dawn Delivery** — thread 8 rings, land on the far strip. Full tank.
2. **Canyon Sprint** — thread 12 rings before the 150-second clock runs out.
3. **Night Freight** — thread 6 rings on half a tank. No mistakes.

Threading a ring scores 100 points (plus a combo bonus for consecutive
rings) and tops the tank up a little. Clipping a ring post or scraping a
canyon wall costs hull. Run out of fuel and the engine quits — glide her
down or she goes into the canyon floor. Land slow and centred on the far
strip to finish, with a bonus for the fuel you bring home.

## The HUD

Altitude (feet), speed (knots), heading, score, rings, fuel and hull across
the top; an attitude indicator, a compass tape and a throttle gauge along
the bottom. The engine hum, ring chime and crash thud are synthesized with
WebAudio oscillators — no audio files.

## Deterministic screenshots

`?shot=start|play|end&seed=N&t=S` places the plane in a fixed composed
scene: `start` is the takeoff roll on the home strip, `play` is mid-flight
with a ring ahead, `end` is the landing approach over the far strip. The
same seed builds the same canyon every time; `t` advances the flight a
fixed number of autopilot seconds before the frame freezes.

## Files

- `game/index.html` — canvas page, loads the scripts
- `game/src/config.js` — tuning constants and the colour palette
- `game/src/input.js` — keyboard and mouse state
- `game/src/world.js` — seeded canyon, rings and runways
- `game/src/render.js` — pseudo-3D renderer and HUD
- `game/src/main.js` — game loop, physics, collisions, autopilot
- `game/src/shots.js` — deterministic screenshot presets
- `game/src/audio.js` — WebAudio engine hum, chimes and thuds
- `main.ts` — entry program: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json`
- `vendor/makefun-game.ts` — the kit's dossier builder, unchanged

## License

MIT — see `LICENSE`.
