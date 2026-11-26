# Skylane Archipelago — Island Air Rally

[![make.fun bounty](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![make.fun rank](https://make.fun/badge/best-flight-game-20261126-0057/muhamadfajar160299-ctrl/makefun-entry-flight-game-20261126/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![make.fun reward](https://make.fun/badge/best-flight-game-20261126-0057/muhamadfajar160299-ctrl/makefun-entry-flight-game-20261126/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

An original flight game built for the [make.fun best flight game bounty](https://make.fun/bounty/best-flight-game-20261126-0057). Fly the Kestrel-9 sport plane over the Halcyon Isles: thread golden rings, hop between two island strips, and drop supplies into the harbor buoy ring — then bring her home in one piece. Fuel and damage turn every sortie into decisions; the wind, the stall and the sea do not forgive.

## Play

Serve `game/` with any static server and open `index.html` in desktop Chrome:

```sh
python3 -m http.server 8080 --directory game
# open http://localhost:8080
```

No network, no build step, no borrowed assets: every pixel is drawn by the game's own canvas renderer and every sound is synthesized live with WebAudio.

## Controls

| Input | Action |
| --- | --- |
| W / S or ↑ / ↓ | Pitch |
| A / D or ← / → | Bank |
| Q / E | Rudder |
| R / F or mouse wheel | Throttle |
| Mouse (click to lock) | Steer |
| Space | Action — drop a crate |
| C | Chase / cockpit camera |
| G | Landing gear |
| P | Pause |
| M | Music on/off |

## Missions

1. **Golden Gate Run** — fly all 8 golden rings over the isles, then land at Halcyon Field for the bonus.
2. **Twin Strip Hop** — take off from Halcyon Field, land on Coral Strip across the water, then land back home.
3. **Harbor Drop** — drop 3 supply crates inside the buoy ring at North Bay, then land at Halcyon.
4. **Free Flight** — no clock, no cargo. Land anywhere to refuel.

## How it is built

- `game/src/terrain.js` — procedural Halcyon Isles: heightfield, airfields, pines, clouds.
- `game/src/plane.js` — the Kestrel-9 polygon model and the arcade flight model.
- `game/src/render.js` — software 3D renderer: sky, sea, terrain mesh, runway, rings, buildings.
- `game/src/hud.js` — HUD and the lit cockpit instruments (airspeed, altimeter, attitude, heading).
- `game/src/missions.js` — mission state machines: rings, landings, drops, scoring.
- `game/src/audio.js` — synthesized engine, wind, chimes and a quiet pad.
- `game/src/input.js` — keyboard and pointer-lock mouse steering.
- `game/src/main.js` — game loop, states, menu, screenshot staging.
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with `vendor/makefun-game.ts`.

## License

MIT — see [LICENSE](LICENSE).
