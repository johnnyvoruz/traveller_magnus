# Agent D — the ghosts, wired (steps 2 and 5 of your own design)

Issued 2026-10-06 by the orchestrator. Do this after `d_part2_go.md` is reported.

Agent A has drawn your design (`findings/plot_ghosts_design.md`): `realDistanceKmBetween` in
`orbit/distance.ts`; the ghosts, the flight line and their motion in `OrbitRenderer.ts`,
from a `preview` the renderer is given (`{ toKey, departs, arrives, tag? }` or null);
`placeShips` running a flight on the straight line from where `from` was at departure to
where `to` will be at arrival. `OrbitCanvas.vue` has an optional `preview` prop and a dev
stand-in for it (`?ghost=`, `?line=`). Read A's frames (`findings/ui_design_shots/k21_*`)
beside your mockups before you start, and say in your report where the drawing departs
from your design and whether it matters.

## Build

1. **`settleFlight` wired** (`views/OrbitView.vue`, `orbit/ShipStrip.vue`): the plot card's
   distance, time and hours come from it, over `realDistanceKmBetween`, as your note's
   sections 2.3 and 6.2 say; "roughly" when it does not settle; the reaction-drive line
   follows the settled hours.
2. **The `preview` fed:** `{ toKey, departs, arrives: departs + the hours in the field }`
   while a plot preview is open, null otherwise; the tag as your design words it.
3. **`bodiesAtOf` answers for a date.** A found that `orbit/ship_marks.ts` `bodiesAtOf`
   ignores its `days` and answers from the frame's picture, so a real ship's flight still
   samples today's places and the straight line is only true in the stand-in. Make it
   answer `(anchor, days)` from a layout of the frame's view at that date (the same call
   the renderer makes for the ghosts), without laying the scene out more than it must: say
   what is cached and for how long.
4. **The browser pass of your section 6.4,** on the real chart, signed in: a short flight
   and one of several days at Regina; the ghosts follow the G chooser and typed hours; Add
   leg, then scrub the flight and see the mark run a straight line and end on the body;
   reduced motion; a 520 px and a 1,100 px window; no frame over 50 ms with a preview open.

## Not in this step

Places in open space (Agent A is building them now in `packages/shared`, `distance.ts`,
`ships.ts`; your plotting click on empty space, the words and Jump from a point come in
the prompt after this one). `OrbitRenderer.ts`, `orbit/ships.ts`, `orbit/distance.ts`,
`dossier/`, `orbit/card.ts`, `BodyCard.vue`, `surface/`, `campaign/` stay closed.

## Check

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted (name any failure
that is another agent's). Screenshots `k21_wired_*` beside your `fu21_*`. Notes into
`findings/orbit_view_design.md`. No git. Stop and report, in the brief's format.
