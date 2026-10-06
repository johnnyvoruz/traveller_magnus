# Agent C — the toggle motion, fourth pass: Moons off, Day/night, and the lost shadows

Issued 2026-10-06 by the orchestrator. Do this **after you have reported city lights step 1**
(`c_city_lights_1.md`) and before step 2. It is small, and Johnny is looking at it now.

His words, on the live site: *"when I click moons, the moon animate on is incredible, but
when I click moons off, the texture vanishes immediately and it doesn't have the same
effect, also the animation is so good, we should use it again for the day/night, also the
moons is incorrectly removing the shadow / shadow casting effects from the planets, we want
to keep those."*

## 1. Moons off is Moons on, backwards, textures included

Today a hide runs the wave back, but the moons' shaded textures are gone on its first frame
(the moons leave the disc batch the moment the switch is off, so their tiles are dropped).
**For the whole of a hide the moons stay drawn as they were, shaded tiles and all, and the
returning wave takes them away as it took them in.** Keep them in the batch, and their
tiles held, until the run ends; then release them. A reverse in mid-run carries on from
where it is. A test: a quarter of the way into a hide the moons are still in the batch and
still drawn; on the settled frame they are gone and their tiles released.

## 2. Day/night uses the Moons wave

Replace the solid teal band. When Day/night is switched, the same latitude-and-longitude
wireframe wave crosses each disc, leaving its star as one front as now, and the shading
arrives behind it (and leaves ahead of it on a hide). One implementation of the wave, used
by both switches; the fades, the size thresholds and the timing rules you already built
apply to both. If both switches are flipped together, one wave, not two stacked.

## 3. The Moons switch must not touch a planet's shadows

With Moons off, the planets lose their shadow effects. **Find exactly what changes** (the
disc batch is given `moonsShown`; say what the shader or the batch drops with it: moon-cast
shadows, eclipse terms, ring shadows, the night side itself) and report it in one
paragraph. Then make it so: **a planet is lit and shadowed identically with Moons on and
off.** The switch shows and hides the moons and their paths, and nothing else. A test that
a planet's shade request is the same with the switch on and off.

## Rules that stay

Durations and curves from the tokens through the computed style; no millisecond literal;
reduced motion snaps; nothing animates on load; the settled frame is the picture that never
moved; no frame over 50 ms at Regina through a Moons toggle and a Day/night toggle, each
way, the longest reported.

**Agent A is working in `orbit/OrbitRenderer.ts` at the same time** (ships, ghosts, places
in open space) and in `orbit/ships.ts` and `orbit/distance.ts`. Edit only the layer-toggle
code and the disc calls; re-read the file immediately before each edit; leave A's parts
alone. A failing test in A's files is A's.

## Check

`npm test` and `npm run check` green, pasted (name any failure that is A's). Frames
`fu14d_moons_off_{early,mid,late}.png`, `fu14d_daynight_{on,off}_{early,mid,late}.png`,
`fu14d_shadows_moons_{on,off}.png` of the same planet at the same date, and a GIF of each
toggle. Stop and report.
