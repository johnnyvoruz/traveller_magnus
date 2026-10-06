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

## Then: places in open space (Johnny, 2026-10-06)

*"Right now we can only attach a ship to a planet, I want to see it on the map and I want to
plot points in-system and watch it fly around."* Agent A has built the data, the geometry
and the drawing: a system anchor may carry `point: { x, y }` in AU from the primary
(`packages/shared`); either end of `realDistanceKmBetween` is a body key or a point;
`pictureOfAu` is the forward map and the readout's inverse goes the other way;
`pointWords(plan, point, days)` words a point ("1.02 AU · near A-II · 0.02 AU"); a ship at a
point is drawn there, a flight to it runs the straight line, a jump from it swells its
bubble there; a docked ship is drawn beside its body. Read A's frames (`k22_*`). Your half:

5. **`bodiesAtOf` again** (with item 3): for a point it returns the picture of that AU in
   the frame's view; for a body, that body at that date; another system stays null. A found
   that a system anchor with no `bodyKey` becomes the mainworld there: keep or correct
   that, and say which and why.
6. **The plotting click on empty space.** In plotting mode a press on a body sets that body
   as the destination, as now; **a press on empty picture sets that point**, through the
   readout's inverse (where the inverse has no answer, nothing is set, and the readout is
   already blank there). The plot card names it with `pointWords`, estimates distance and
   time to it (a point does not move, so it settles at once and needs no ghost; the
   renderer draws a target at it from the same `preview`), and "Add leg" writes a leg whose
   `to` is that point, its words in `locationLabel`.
7. **A ship at a point, in words:** the strip, the Track section, the Party tab and the
   vessel's Where block say where it is from `locationLabel` or `pointWords` ("Holding at
   1.02 AU · near A-II"); the ship list still lists it as here.
8. **The 100D test and Jump.** A ship holding at a point is measured against the rings
   like any mark; outside them, Jump is live **from where the ship is**: the jump leg's
   `from` is the point. With that, the part 1 interim ("cut the flight short and step to
   the destination body") goes: Jump is offered when the ship is at rest outside every
   ring; under way, the strip says to plot a point past the limit and hold there (plain
   words; your wording). Say what happens to a track that already has a cut flight.
9. The browser pass: plot to a point past the 100D ring, watch the ship fly there with the
   clock running, hold, mark a destination system, jump, and see the bubble leave from the
   point; a point near a body; a point the inverse refuses; the Party tab and the Track
   section's words.

`OrbitRenderer.ts`, `orbit/ships.ts`, `orbit/distance.ts`, `dossier/`, `orbit/card.ts`,
`BodyCard.vue`, `surface/`, `campaign/`, `packages/` stay closed: ask for what you need.
Agent E has leave to change one CSS rule in `views/OrbitView.vue` (the body card's
`top: 56px`); leave that rule to E.

## Check

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted (name any failure
that is another agent's). Screenshots `k21_wired_*` beside your `fu21_*`. Notes into
`findings/orbit_view_design.md`. No git. Stop and report, in the brief's format.
