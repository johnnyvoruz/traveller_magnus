# Orbit picture: room between the rings (Lane A)

Issued 2026-10-18 by the orchestrator. Johnny's brief, 2026-10-18 in chat: "everything feels nearly too clumped
together, and linear distance doesn't do much help at all." His shot was Capital (Core 2118, G2 V, mainworld a moon of a
large gas giant), zoomed in about 3.5 times. True scale and linear scale have both been tried and rejected; do not
propose them again.

Everything here is in `apps/web/src/orbit/` (Lane A's folder) and `tests/web/`. No engine, no `rules/`, no legacy
file, no parity concern: the layout is web-side only. New files over edits where a new file makes sense; the three
steps below are small enough to go into the existing files.

## Why it clumps (read before touching anything)

- `maths.ts:89` maps AU to the ring radius with `log(1 + au) / log(1 + maxAU)`. The orbit table (`orbit_au.ts`) runs
  0.4, 0.7, 1.0, 1.6, 2.8, 5.2, 10, 20 AU. With an outer orbit near 20 AU the three innermost rings are 5 to 6 percent of
  the span apart, about 25 px on a fitted stage.
- A large gas giant is 14 px base radius (`maths.ts:41`) and its moons sit at `planetR + (10 + index * 6) * z`
  (`layout.ts:75`), so six moons reach 46 px past the disc. One body's footprint is wider than the gap to the next ring.
- **Zoom is pure magnification.** `starBodyRadius`, `worldBodyRadius`, `satelliteRadius`, `orbitHole` and
  `moonOrbitRadius` (`layout.ts:50-78`) all multiply by the same `z` as the ring radii (`starFrame`, `layout.ts:583-584`:
  `maxPx = baseMaxR * view.zoom`). Zooming in never opens a gap. That is the fault to fix.
- Every body with a diameter gets a 100D circle (`queueJumps`, `layout.ts:703`). In Johnny's shot those circles are
  more than half the ink.

## Step 1: bodies grow slower than orbits

In `layout.ts`, next to `zoomScale`:

```ts
/** Discs, moon spacing and the hole grow slower than the rings, so zooming in opens the gaps. */
export const BODY_ZOOM_EXP = 0.5;
export function bodyScale(z: number): number {
    return Math.pow(Math.max(1, z || 1), BODY_ZOOM_EXP);
}
```

Then change exactly these five functions to use `bodyScale(z)` where they now use `z`:

- `starBodyRadius` (line 50), `worldBodyRadius` (55), `satelliteRadius` (60): `basePx * bodyScale(z)`.
- `orbitHole` (65): `starRadiusPx + 14 * bodyScale(z)`.
- `moonOrbitRadius` (75): `base + (10 + index * 6) * bodyScale(z)`.

Do not change `scaleR`, `unitT`, `starFrame`'s `maxPx`, the ring radii, or anything in `maths.ts`. Everything that
already calls these five functions (`starFrame`, `placeWorld`, `layoutWorldSet`, `sceneBounds`, `subSystemRadius`, the
renderer) picks the change up; do not re-derive sizes anywhere else. Hit-target margins such as `8 * z` and `7 * z`
stay as they are.

At the fitted view `z` is 1 and `bodyScale(1)` is 1, so the fitted picture does not move. Only zoomed-in views change.

Tests. `tests/web/orbit_layout.test.js:40` ("disc radii are the base size times the zoom scale") and `:52` ("moons sit
10 px out") assert the old formula at `z > 1`; update their expected values to `basePx * Math.sqrt(z)` and
`10 * Math.sqrt(z)`, and rename them to say "times the body scale". `:201` ("a scene places every body where the
legacy formulas put it") builds `primaryR` and `hole` from `1.5`; change those two lines to `Math.sqrt(1.5)` and
leave the rest. `:356` (Regina at every zoom) should pass untouched. Add one new test: at `z = 4` the gap between
two adjacent rings grows by 4 while a world's disc grows by 2. `orbit_disc_batch.test.js`, `orbit_hand.test.js` and
`orbit_lineup.test.js` also import these functions; the hits test at `orbit_layout.test.js:270` reads radii from the
scene and adapts by itself. If any other test fails after this step, read it before editing it: a test that asserts a
size at `z = 1` should not have moved, and then the fault is yours. The line-ups (`lineup.ts`) share the five
functions, so their discs scale the same way; that is intended and needs no edit there.

## Step 2: 100D circles only where they are read

Add `selected?: string | null` to `View` (`layout.ts:478`) and pass it through `viewOf` (`camera.ts:46`, a sixth
parameter, default `null`) and `fitCamera` (`camera.ts:58`, same). The stage calls both at `stage.ts:106` and `:110`.
The stage has no selected key today. Add `selected: string | null = null` to `OrbitStage` (`stage.ts:65`) and pass it
at those two call sites. The key comes from `OrbitCanvas.vue`: `props.selected` (`OrbitCanvas.vue:39`) is already
watched at `:906`; in that watcher set `stage.selected = key` and ask the stage for a fresh picture the same way the
layers watcher at `:888` does. `OrbitCanvas.vue` is in `apps/web/src/orbit/`, yours. Do not touch
`apps/web/src/views/OrbitView.vue`: Lane C has it claimed in `streams/claims.md`, and nothing in it needs to change.

In `queueJumps` (`layout.ts:703`) add one condition: a world's circle is queued only when `w.mainworld`,
`w.mainworldBelt`, or `w.key === view.selected`. The star's circle (`layout.ts:761`) and the companion stars' circles
(`:765`) stay; a moon never had one. The Jump limit layer toggle (`view.jump === false`) still removes all of them.

`fitCamera` measures the picture through `sceneBounds`, which does not read the jump rings, so the fit does not change.

Tests. `orbit_layout.test.js:308` ("the 100D circles: the star, each world whose circle clears its disc") asserts a
circle per world; change it to assert the star's circle plus the mainworld's only, then a second case with
`selected` set to another world's key that adds that world's circle. Selecting a body already redraws the scene, so
no renderer change is needed; confirm by reading how `state.selected` reaches `OrbitRenderer.ts:1933`.

## Step 3: push crowded rings apart

Only after Steps 1 and 2 are green. The rings keep their log radii where they already have room, and move outward
only where a neighbour's footprint overlaps. The order of rings never changes, so the distance readouts stay true.

Add to `layout.ts`:

```ts
/** Clear space between one ring's footprint and the next, in px at z = 1. */
export const RING_GAP = 6;

/** How far a world's drawing reaches past its ring: its disc, its rings, its moons or a belt's band. */
export function worldExtent(w: PlanWorld, view: View): number { ... }

/**
 * The ring radius of every world in a set, by key. Starts from scaleR and pushes a ring outward when its footprint
 * and the previous ring's footprint would overlap. Worlds are walked in AU order; belts count with a 7 * z band.
 */
export function ringRadii(list: PlanWorld[], maxAU: number, maxPx: number, hole: number, view: View): Map<string, number> { ... }
```

`worldExtent`: a belt is `7 * view.z`; otherwise start from `worldBodyRadius(w.body, view.z)`, then if
`view.moons !== false` and the world has moons, use `moonOrbitRadius(r, lastMoonIndex, w.ringed, view.z) +
satelliteRadius(lastMoon, view.z)`; else if ringed, `r * RING_OUTER`. Read `placeWorld` (`layout.ts:640`) for how
moon indices and `w.ringed` are used so the extent matches what is drawn.

`ringRadii`: sort a copy of the list by `au`; for each world, `r = scaleR(...)`; if there is a previous world,
`r = Math.max(r, prevR + prevExtent + extent + RING_GAP * view.z)`; store `r`, carry `r` and `extent` forward. Two
worlds with the same AU keep the same ring only if both extents fit; otherwise the second is pushed like any other.

Then use it: `layoutWorldSet` (`layout.ts:680`) computes the map once and reads a world's radius from it in both
loops instead of calling `scaleR`; `sceneBounds` (`layout.ts:798-806`) does the same, so the fit includes the
pushed rings. `starFrame`'s companion push (`layout.ts:600-606`) keeps calling `scaleR`; leave it. `hundredDpx` is a
delta centred on the body and needs no change.

In linear mode (`view.linear`) skip the push entirely and return plain `scaleR` values: linear is the "show me real
spacing" switch and must stay honest.

Tests. New file `tests/web/orbit_ring_spacing.test.js` using `tests/web/orbit_fixture.js`: (a) two worlds 0.4 and
0.7 AU, the inner a large gas giant with six moons, moons on: the outer ring is at least inner ring + both extents +
`RING_GAP`; (b) the same with moons off: the push is smaller; (c) two worlds at 1 and 20 AU: neither ring moves from
its `scaleR` value; (d) linear on: nothing moves; (e) rings are strictly increasing in AU order. Update
`orbit_layout.test.js:201` only if its fixture now triggers a push; say so in the report with the old and new values.

## Check, in this order

1. `npm test`, `npm run check`, `npm run typecheck`, `npm run build` after each step. A red gate stops the step.
2. Open the orbit view on a crowded system (Core 2118 Capital, or Spinward Marches 1910 Regina) with `npm run dev`
   on your own port. Take four screenshots into `directives/reports/shots/a_orbit_spacing/`: fitted view before and
   after, and zoomed in about 3 times before and after. "Before" shots come from `git stash` of your own files only,
   taken before you start editing, so take them first. Name them `fit_before.png`, `fit_after.png`,
   `zoom_before.png`, `zoom_after.png`.
3. Report the ring radii for Capital's inner four orbits at `z = 1` and `z = 3`, before and after, as a small table.

## Do not

- Do not touch `maths.ts`, `orbit_au.ts`, `OrbitRenderer.ts` beyond what Step 2 needs, or any lineup code
  (`lineup.ts`): the line-ups have their own spacing.
- Do not change the fitted picture: `bodyScale(1)` must be 1 and the push must leave uncrowded rings where they were.
- Do not change the habitable band, the belt band width, the star's base size, or the orbit table.
- Do not add a settings switch or a layer toggle for any of this. If you believe one is needed, ask in the report.
- Do not round or snap radii. Sharpness is Johnny's rule: no change may make the picture softer.

## Report

`directives/reports/a_orbit_spacing.md` from `_TEMPLATE.md`. Under "Changed files" list every file with one line.
Include the radius table and the four screenshot paths. If Step 3 turns out to need the companion-star push in
`starFrame` to also read the map, say so under "Questions for Johnny" with your recommended answer first, and stop
before doing it.

## Progress
