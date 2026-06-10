# CLOSER — an infinite disco, on rollerskates

A gravity-shifting rollerskating game inspired by Art Camp's treatment for
Elton John's "Hold Me Closer": *"gliding on the walls and ceilings, through
windows, on rooftops... as buildings curve and whirl around the dancers.
The city becomes an endless nightclub."*

You skate the **inside of an endless rotating city**. Gravity always points
into your wheels, so carving left or right rolls the whole metropolis around
you — streets curl up the walls, towers hang overhead, and a sun glows at the
end of the tunnel.

A kindred spirit named **TINY** leads a weaving line through the city.
Stay close and you **LINK** — the held-hands chain — and your flow multiplies.
Overtake the leader and **you lead the night**: the pack follows *your* line,
through denser city, for even more flow. Each era a new skater joins the pack:
Bennie, Levon, Nikita, Daniel, Rocket.

Every 400 metres the night changes era — Boardwalk '72, Neon Avenue '82,
The Whirl '92, Midnight Club 2002, The Ballroom — and then the Infinite Disco.

## Controls

| Key | Action |
| --- | --- |
| ← → / A D | carve (rolls the city around you) |
| ↑ / W | push faster |
| ↓ / S | brake |
| Space | jump (land on rooftops, skate them) |
| M | sound on/off |
| R | restart |

Music is a fully procedural WebAudio disco (no samples): four-on-the-floor
kick, claps, hats, a bassline, sidechain-pumping pads, and skate-roll noise
tied to your speed.

## Run

```bash
npm install
npm run dev   # http://localhost:3501
```

Built with three.js + vite. No assets — everything (city, skaters, music,
grain) is generated at runtime.
