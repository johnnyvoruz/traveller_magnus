# Agent C — a moon's real distance, then the toggle motion as Johnny wants it

Issued 2026-10-06 by the orchestrator. `orbit/distance.ts` and the `keepHeld` change are
accepted. Two steps, in this order; report after both.

## 1. A moon's real distance (small; Agent D's flight estimate is waiting on it)

`realDistanceKm` answers null for a moon, and the commonest flight in the game starts or ends
on one (Regina is a moon of Regina A-IV). The engines already turn a moon's orbit into
kilometres: `packages/engines/src/mgt2e_world_engine.js` lines 698, 2258 and 2269 compute
`pd * parent.diamKm` (planet diameters times the parent's diameter). Use exactly that, read
from the plan's bodies:

- A moon's place is its parent's place plus `pd * parent.diamKm / AU_KM`, at the angle the
  layout gives that moon at `days` (the same `bodyAngle`, period and epoch the picture uses).
- Null when the moon has no numeric `pd` or the parent has no numeric `diamKm`. The fallback
  `m.pd || 20` in `orbit/maths.ts` is for the drawn period; it is **not** a distance.
- A moon to its own parent, a moon to a sister moon, a moon to another world: all answered.
- Tests for each, and for each null. The existing tests stay green.

## 2. The toggle motion, from Johnny's eye on the live site

His words: *"The path animation reveal is correct (a little fast), but when you hide it, it
just instantly vanishes, I want to reverse the reveal animation. The moon animation is super
lame and stuttery, I want a wave of teal wireframe to sweep over the planet, either triangles
or quads, and for day / night, it can just be a solid teal sci-fi microanimation."*
His two pictures are `findings/ui_design_shots/ref_fu14_wireframe_a.png` (a sphere of
triangles) and `ref_fu14_wireframe_b.png` (a sphere of latitude and longitude lines). Look at
both before drawing.

**2a. Hiding is the reveal played backwards.** Today a hide runs the shrink through
`--ease-out`: the ring is at a quarter of its size and a quarter of its alpha within the
first fifth of the time, so it reads as vanishing. For every easing channel (habitable,
jump rings, paths, moons' paths, scan, mainworld), the share at time `u` of a hide is exactly
the reveal's share at `1 - u`. A toggle reversed in mid-run carries on from where it is.
A test pins it: for sampled `u`, hide equals reveal at `1 - u`; and a quarter of the way into
a hide the ring is still drawn at more than half its size.

**2b. A little slower.** The growth and shrink of bands, rings and paths run over `--t-slow`,
not `--t-base`. Read from the computed style as now; no literal.

**2c. Moons: a wave of teal wireframe sweeps over the planet.** Replace the ring flash.
- When Moons is switched, each world that has moons, and each moon large enough to show it,
  is overlaid with a **wireframe globe** in `--signal`: latitude and longitude lines (the
  quads of picture b), one-pixel strokes, clipped to the disc, with a little tilt so the
  parallels read as ellipses and the thing reads as a sphere.
- The wireframe is not shown whole. A **wave** crosses the disc from one limb to the other:
  the lines are bright at the wavefront and fade out behind it, so what the eye sees is a
  band of wireframe travelling over the planet, once.
- The moons arrive with the wave: each moon's disc and its orbit path come up as the wave
  passes, and go as the wave runs back on a hide (2a applies: the hide is the reverse).
- Over `--t-long` (the tokens call it the scanner reveal). Under a size where the lines
  would smear, draw the simplest thing that still reads as the same sweep, and say where
  the line is (a named constant in pixels, with its reason).
- Triangles (picture a) are the alternative Johnny allows. Quads are chosen because they are
  a handful of ellipses, crisp at 20 to 60 px. If quads do not read well at the sizes on
  screen, say so with a frame; do not switch on your own.

**2d. Day/night: a solid teal micro-animation.** No wireframe. When Day/night is switched, a
solid `--signal` fill sweeps each disc once, from the lit limb to the terminator, and settles
into the night side as it is drawn today; the hide is the reverse. Over `--t-slow`. The sweep
must **cover the exchange** between the flat discs and the shaded ones (`settleDiscs` only
paints shaded discs while Day/night is on, and tiles arrive a frame or more later): nothing
may pop underneath it.

**2e. Stutter.** Find it and remove it. Measure the frame intervals through one Moons toggle
and one Day/night toggle at Regina in a browser, before and after, and report the longest of
each. The manifesto's line is no frame over 50 ms. If the cause is outside the renderer (the
disc service, the canvas's paint check), say exactly where; change `OrbitCanvas.vue` only as
far as the paint check needs, and list the lines.

**Unchanged rules.** Durations and curves from the tokens through the computed style; no
millisecond literal. Reduced motion snaps. Nothing animates on load. The settled frame is the
picture that never moved (the parity shots still match). The toggle test stays and grows.

## Check

- `npm test` and `npm run check` green, pasted.
- Frames to `findings/ui_design_shots/`: `fu14b_paths_hide_{early,mid,late}.png`,
  `fu14b_moons_{early,mid,late}.png`, `fu14b_daynight_{early,mid,late}.png`, and a GIF of
  each toggle if you can make one.
- Do not touch `views/`, `ShipStrip.vue`, `ship_list.ts`, `ship_marks.ts`, `campaign/`,
  `workspace/`, the drawers, `TimeControls`. Stop and report.
