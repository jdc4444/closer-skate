# CLOSER — an infinite disco, on rollerskates

A gravity-shifting rollerskating game inspired by Art Camp's treatment for
Elton John's "Hold Me Closer": *"gliding on the walls and ceilings, through
windows, on rooftops... as buildings curve and whirl around the dancers.
The city becomes an endless nightclub."* Now staged as a neon-noir,
cyberpunk night city: dark glass towers full of lit windows, kanji neon,
animated billboards, streetlights over wet mirror asphalt, ground and
flying traffic, and a troupe of articulated skaters at your back.

## How it plays

Your "down" is whatever surface your wheels are on:

- Skate **into** a tall facade and you ride **up** it.
- Run off a roof lip and you **wrap around the edge** onto the wall — or all
  the way around a slab onto its **underside**, upside down over the street.
- **Jump** between rooftops (gravity follows the surface you left), or leap
  *at* a building and attach to its face mid-air.
- Pass **through window openings** in perforated walls for bonus flow.

A kindred spirit named **TINY** leads a route across streets, facades,
rooftops and the underside of a great arch. Stay close and you **LINK**
(held-hands chain, 3× flow). Out-skate the leader and **you lead the night**
(5× flow) — the pack follows *your* line until you crash and they sweep past.
A new skater joins each era: Bennie, Levon, Nikita, Daniel, Rocket.

Eras crossfade every 400 m — Boardwalk '72, Neon Avenue '82, The Whirl '92,
Midnight Club 2002, The Ballroom — then the Infinite Disco, forever. The sky
gradient is fixed to *true* world-up, so riding a wall visibly tips the whole
sky sideways.

## Controls

| Key | Action |
| --- | --- |
| ← → / A D | carve |
| ↑ / W | push faster |
| ↓ / S | brake |
| Space | jump |
| M | sound on/off |
| R | reset flow + pack |

Music is a fully procedural WebAudio disco (kick, claps, hats, bassline,
sidechain-pumping pads) plus skate-roll noise tied to your speed.

## Architecture

- `src/surface.js` — surface locomotion on axis-aligned architecture:
  support/wall queries, convex edge-wrap, concave wall-climb, rotating
  platform support.
- Rendering: PMREM neon environments for glass reflections, a true planar
  Reflector as the wet street, PCF soft shadows, bloom, film grain.
- `src/city.js` — endless chain of authored set-pieces (Boulevard, Tower
  wall-ride, Window Wall, Rooftop Run, the Fold arch with its upside-down
  underside, Canyon), each contributing collision boxes + the pack's route.
- `src/sky.js` — world-fixed gradient dome, sun, clouds below the city.
- `src/skaters.js` — procedural rigs, ribbon light-trails, hand-hold links.
- `src/audio.js` — the disco engine.
- `src/main.js` — physics, pack AI, camera, eras, HUD, bloom/shadow pipeline.

Test hooks: `window.__auto` (route-following autopilot),
`window.__test.{push,jump,trip,warp}`, `window.__freeze`, `window.__game`
(state snapshot).

## Run

```bash
npm install
npm run dev   # http://localhost:3501
```

three.js + vite. No assets — city, skaters, music and grain are all
generated at runtime.
