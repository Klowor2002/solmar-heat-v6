# Solmar Heat

![make.fun competition gta6-01](https://make.fun/badge/gta6-01.svg)
![entry rank](https://make.fun/badge/gta6-01/Klowor2002/solmar-heat-v6/rank.svg)
![entry reward](https://make.fun/badge/gta6-01/Klowor2002/solmar-heat-v6/reward.svg)

An entry to the [gta6-01 bounty on make.fun](https://make.fun/bounty/gta6-01):
a 3D open-world crime game that runs entirely in the browser. One coastal
city at dusk, one ex-getaway driver trying to go straight, and a fixer who
has eight jobs that say otherwise.

## The game

You are Jax Moreno. Mona Reyes, the Old Town fixer, pulls you back in for a
chain of eight story jobs — a first pickup, a stolen sports car to fence, a
shootout with the Vultures in an alley, a timed getaway under a three-star
heat, a pier deal that goes loud, a defense of the safehouse garage, a
night run to the bank, and finally the Solmar Bank score itself. Finish all
eight and the story closes; get caught or dropped on the way and it ends
early.

Around the story, the city keeps its own economy running. Steal any car on
the street and fence it at Reyes Chop Shop. Run courier drops and a
checkpoint street race whenever you need cash. Hunt down ten golden tokens
hidden on rooftops and side streets. The Solmar police answer everything:
a five-star wanted system with patrol cars that ram and foot cops who
shoot, and heat that only cools when you break their line of sight.

## What's in the world

- **Solmar City** — a 10×10-block grid with procedurally varied buildings,
  lit windows, painted signs (Solmar Bank, Reyes Chop Shop, Mona's Garage,
  Solmar Tower, the Lagoon Hotel, the hospital), palm-lined sidewalks,
  street lamps, a working pier, a beach, the sea, hills, and drifting
  clouds.
- **Traffic with a memory** — cars hold their lanes, pause for each other,
  and turn at intersections instead of driving through buildings.
- **People** — 28 pedestrians who stroll, panic and run when the shooting
  starts; Vulture gang members who close in and return fire; police who
  pursue on foot and in cars.
- **Driving** — arcade handling with handbrake drift, speed-sensitive
  steering, ramming damage and a chase camera that leans into the speed.
- **Effects and sound** — pooled particle sparks, debris and pickup
  sparkles, camera shake, damage vignette, and a fully procedural WebAudio
  soundtrack: engine, sirens, gunfire, and a little two-oscillator radio
  loop on SOLMAR FM. No audio files anywhere.
- **A full HUD** — cash, objective line, wanted stars, clock, radio,
  health and sprint bars, weapon and ammo, speedometer, and a live
  circular minimap with blips for the police, the mission marker and the
  tokens.
- **Saving** — progress persists in `localStorage`: money, missions done,
  tokens, story completion, and where you left Jax standing.

## Run it

With Node 22 (or any static file server):

```
node serve.ts            # then open http://localhost:8080
```

`serve.ts` serves the `game/` folder and nothing else. The game itself is
dependency-light by design: everything in `game/` is plain HTML, CSS and
JavaScript modules, with three.js 0.170.0 vendored at
`game/vendor/three.min.js` so a round never depends on a CDN being up.

For the make.fun hand-in, `main.ts` copies `game/` and `screenshots/`
into the output directory and writes the dossier:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Controls

| Keys | Action |
| --- | --- |
| WASD | Move / drive |
| Mouse | Look (click the game to capture the pointer) |
| Shift | Sprint |
| Space | Jump / handbrake |
| E | Enter / exit / steal a car |
| Mouse click | Shoot or punch |
| 1 / 2 | Fists / pistol |
| R | Reload |
| M | Start the next story mission |
| T | Courier run (after mission 1) |
| G | Street race (while driving) |
| H | Horn |
| Esc | Pause |

## Screenshots

Four staged frames, each reproducible from `shots.json` — the game stages
itself deterministically with `?shot=<name>&seed=1`, pre-simulates 150
fixed steps, and freezes:

1. `1-cover.jpg` — the Getaway chase down the central avenue, three stars.
2. `2-street.jpg` — on foot in the Old Town, first job's marker ahead.
3. `3-mission.jpg` — the Vulture alley shootout, pistol drawn.
4. `4-city.jpg` — the whole grid from the air, tower and sea included.

Add `&debug=1` to any shot URL and the game prints a verification readout
(positions, wanted level, error count) in the corner instead of hiding it.

## Layout

```
game/
  index.html        the page, the HUD, the screens
  src/              the game, one module per system:
                    utils, city, vehicles, peds, player, police, combat,
                    missions, effects, audio, hud, save, shots, main
  vendor/           three.js 0.170.0, vendored
screenshots/        the four staged frames above
main.ts             the make.fun hand-in program
serve.ts            the local dev server
shots.json          the screenshot staging list
vendor/             the make.fun dossier library (kit plumbing)
```

## Notes

Built for the make.fun gta6-01 competition. New to make.fun? Join with
referral code **ebgtn94a**. MIT licensed — see `LICENSE`.
