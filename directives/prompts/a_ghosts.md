# Agent A — where the bodies will be: the ghosts in the orbit picture

Issued 2026-10-06 by the orchestrator. Do this after `a_panes_steps_2_4.md` is reported.

Johnny: *"when plotting courses, we're going to want to know where the planets will be at
that time … holographic outlines of the celestial bodies of where they would be at that time
so the user can plot their location correctly."* Agent D has designed it:
**`findings/plot_ghosts_design.md` is the specification.** Read all of it, with its mockups
(`findings/ui_design_shots/fu21_*`). Its section 5 says "Agent C draws"; **you draw it**:
Agent C is on the planets' city lights in `surface/` and is out of these files.

## Your files for this step

`apps/web/src/orbit/OrbitRenderer.ts`, `orbit/ships.ts`, `orbit/distance.ts`, their tests
(`tests/web/orbit_renderer.test.js`, `orbit_ships.test.js`, `orbit_distance.test.js`,
`orbit_fixture.js`), and **one thing in `orbit/OrbitCanvas.vue`**: the new `preview` prop
and its hand-off to the renderer, nothing else in that file (Agent D is in it for another
fix; say which lines you added). Read the renderer's recent work first: the layer toggles'
motion, the jump bubble and the plotting readout all follow one pattern (a run starts on
the frame a state changes, tokens' durations from the computed style, nothing on first
paint, reduced motion snaps, the settled frame is the picture that never moved). The ghosts
follow it too.

Not yours: `views/`, `orbit/ShipStrip.vue`, `estimates.ts`, `ship_list.ts`, `ship_marks.ts`
(Agent D's), `surface/`, `dossier/`, `campaign/`.

## Build, in this order; one report at the end

Until Johnny says otherwise, the design's option 1 (the destination, and any world that
will visibly move) and the amber destination ghost; keep both easy to change.

a. **`orbit/distance.ts`:** `realDistanceKmBetween(plan, fromKey, fromDays, toKey, toDays)`
   as the note's section 5.5 says, with its test; `realDistanceKm` becomes that function
   with one date twice, and its tests stay green.
b. **The ghosts and the flight line** (sections 2.1, 2.2, 3, 5.1 to 5.3), drawn from a
   `preview` the renderer is given: `{ toKey, departs, arrives }` or null. The dev stand-in
   (`?campaignStandIn=`) shows a preview so it can be seen before D wires the real one.
c. **`placeShips` on the straight line** (sections 2.4, 5.4), last and alone: a flight's
   mark runs from where `from` was at departure to where `to` will be at arrival. It needs
   the bodies' places at two dates other than the frame's; `bodiesAtOf` in
   `orbit/ship_marks.ts` is Agent D's and answers for the frame's picture only. Do not edit
   it: take the places from a layout at each date inside your own code, or, if that cannot
   be done without it, stop at this step and say exactly what `bodiesAtOf` must become.
   Tests as section 5.4 lists.

## Check

`npm test`, `npm run check`, `npm run build` green, pasted. In a browser, as in your panes
step: frames `k21_ghosts_{short,days}.png` and `k21_line_{early,mid,late}.png` for a flight
scrubbed along its straight line, each beside D's mockup; no frame over 50 ms with a preview
open at Regina, the longest reported. Stop your dev server. No git. Stop and report.
