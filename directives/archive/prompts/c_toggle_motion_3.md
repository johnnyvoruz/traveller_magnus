# Agent C — the toggle motion, third pass, and a look at the city lights

Issued 2026-10-06 by the orchestrator. **If you are part-way through the jump bubble
(`c_jump_bubble.md`), finish and report that first.** If you have not begun it, do this
first and the bubble after.

Johnny has seen the second pass live. His words: *"toggle animations are okay, let's have the
moon and day night also radiate from the orbiting sun, and then add some fades to the teal,
because it just POPS on, so some transparency fades would really put the ux/ui motion design
polish that I'm looking for, also ring planets textures sorta POP in and out, if we can fade
those as well it would be nice."* And separately: *"a visual texture bug on the planets that
the city texture is on the atmosphere layer and not the planet layer."*

## 1. Moons and Day/night radiate from the star

Bands, rings and paths already grow out of their star. Moons and Day/night must read as the
same gesture: **one wave that leaves the star and travels outward.**

- A front leaves each star and reaches the farthest body of that star on the picture over
  `--t-long`. A body's own sweep starts when the front reaches it, so bodies near the star
  go first and the outer ones last. A companion's worlds answer to their own star.
- On each disc the sweep runs **away from that star**: it enters at the limb facing the star
  and leaves at the far limb. (Day/night already does; the Moons wave crosses left to right
  today.) A body's own sweep takes `--t-slow` from the moment the front reaches it.
- The front itself may be drawn: one thin `--signal` ring growing from the star, faint, and
  fainter as it travels, so the eye ties the bodies' sweeps together. Keep it only if it
  reads as one gesture; show a frame of it.
- A hide is the exact reverse: the front runs back into the star, the outer bodies first.

## 2. Nothing teal pops

Today the wireframe, the solid band and the small moons' bands appear and vanish at full
strength. **No teal element may arrive or leave between two frames at more than a trace of
alpha.**

- Every teal element eases its alpha up from nothing at the start of its sweep and down to
  nothing at its end.
- The solid Day/night band has soft edges: alpha falls off across its leading and trailing
  edges; it is not a hard block.
- The wireframe's lines fade behind the front as now, and also fade in ahead of it.
- A test: for a run sampled finely, the teal alpha at the first and last sample is zero, and
  the step between neighbouring samples never exceeds a small share of full strength (name
  the share as a constant with its reason).

## 3. Ringed planets

The rings' textures pop in and out. Find each moment they do (the exchange between the flat
rings and the shaded ones when Day/night is switched; a Moons toggle; tiles arriving after
the sweep has passed) and cross-fade it: over the body's own sweep when a toggle caused it,
over `--t-base` when a tile simply arrived late. The same for a shaded disc whose tiles
arrive after its sweep has finished: it fades up; it does not appear.

## 4. Unchanged rules

Durations and curves from the tokens through the computed style; no millisecond literal.
Reduced motion snaps. Nothing animates on load. The settled frame is the picture that never
moved. No frame over 50 ms through a Moons toggle and a Day/night toggle at Regina; report
the longest of each.

## 5. The city lights: diagnose first

Look at a heavily populated world in the orbit view and in the dossier's surface map, in the
default (vanilla) mode and in enhanced. Report, before changing anything:

- what is wrong on screen (the cities drift with the clouds? sit above them? show on the
  day side? are drawn on the air shell?), with a frame;
- where it is drawn (`surface/vanilla/gl_shaders.ts` has the city colour in the surface
  shade and a `uCityHaze` term in the air; `surface/profile.ts` `cityLight`);
- **whether the legacy app draws it the same way**, with the legacy lines;
- which fixture digests a fix would change.

Then: if our port differs from the legacy, fix the port to match it. **If the legacy does the
same thing, change nothing and say so**: making vanilla differ from the legacy is Johnny's
choice, and the orchestrator will put it to him with your frames.

## Check

`npm test` and `npm run check` green, pasted. Frames to `findings/ui_design_shots/`:
`fu14c_moons_{early,mid,late}.png`, `fu14c_daynight_{early,mid,late}.png`,
`fu14c_rings_{early,mid,late}.png`, a GIF of each, and `city_lights_{vanilla,enhanced}.png`.
Do not touch `views/`, `ShipStrip.vue`, `ship_list.ts`, `ship_marks.ts`, `campaign/`,
`workspace/`, the drawers, `TimeControls`, `HeaderClock`. Stop and report.
