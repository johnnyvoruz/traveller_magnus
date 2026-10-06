# Agent D — ship MVP part 2: the measuring pass

Issued 2026-10-06 by the orchestrator. Read `directives/agent_d_brief.md` first, then
`directives/slice_2_campaign.md` K12 (all of it, to the end of "Rules supplied"), then your
own note `findings/orbit_view_design.md` §8q, which records part 1 exactly as you built it.

## Where things stand

- **Part 1 is accepted** (the ship list, real marks, the status strip, plotting mode, Jump):
  `orbit/ship_list.ts`, `ship_marks.ts`, `ShipStrip.vue`, `jump_state.ts`, the wiring in
  `views/OrbitView.vue` and `OrbitCanvas.vue`. You built it; a fresh session, read it before
  changing it.
- **Johnny has since supplied the rules** (`rules/mgt2e_space_travel.json`) and ruled on the
  MVP: *"For MVP we won't actually deduct fuel numbers from a ship, but I'd like to maybe put
  estimated numbers of time / distance / fuel measurements when plotting a course for a ship.
  If it needs data to be calculated due to mass, we can just set mass at 100 tons for now …
  The MVP design will essentially let anything go, it's just measuring and then for vNext we
  will tie in ship logic to plotting warnings / refueling."*
- So this step **measures**. Every number shown is an estimate and is labelled as one.
  Nothing is deducted, no ship field is read, **nothing warns and nothing refuses**.

## What you need from others (do not write your own)

- `apps/web/src/campaign/travel.ts` (Agent A): `transitSeconds(distanceKm, accelG)`,
  `jumpParsecsCounted(parsecs)`, `jumpFuelTons(hullTons, parsecs)`, `ASSUMED_HULL_TONS`,
  `rollJumpHours(random?) -> { hours, dice }`.
- `apps/web/src/orbit/distance.ts` (Agent C): `realDistanceKm(plan, fromKey, toKey, days)`,
  a number or null. The picture's own units are compressed; never measure on the picture.

If either file is absent when you reach its step, do the steps that do not need it, then
stop and report which is missing. Write no 148, 168, 100 or dice, and no formula, in your code.

## Steps

1. **The jump time is rolled.** Take `jumpHours`, `DEFAULT_JUMP_HOURS` and `jumpHoursOf`
   back out of `packages/shared` (schema, index, test): they were yours in part 1, nothing
   ever stored the setting, and the fixed 168 is superseded. The Jump preview gets an hours
   field filled from `rollJumpHours()`, with the roll shown beside it (for example
   "148 + 23 = 171 h"), a "Roll again" control, and the referee may type over it. The jump
   leg arrives that many hours after it departs.
2. **The jump estimate**, in the same preview: the distance in parsecs between this system's
   hex and the destination's, from the hex-distance helper the map already uses (find it; do
   not write a second), passed through `jumpParsecsCounted`; and the fuel,
   `jumpFuelTons(ASSUMED_HULL_TONS, parsecs)`, shown with its assumption in words, for
   example "about 20 tons · 100-ton hull assumed".
3. **The flight estimate**, in the plot card: the distance from `realDistanceKm` at the
   departure date (km, or AU when it reads better; one formatter in `design/units.ts`), and
   the time from `transitSeconds` at the chosen G. The hours field is **filled from the
   estimate** and follows the G chooser and the destination until the referee types over it;
   after that it stays theirs, with one quiet control to return to the estimate. Where the
   distance is null, say "distance unknown" and leave the field empty and required, as in
   part 1. **A flight shows no fuel**: the rules supplied price jumps only.
4. **The track on the vessel's record page** (`workspace/`, vessels only), as a section in
   the panel's own look: the legs in order (from → to, departs, arrives, mode, G), "Remove
   last leg" with undo by toast (`removeLastLeg`; undo appends it again), and an empty state
   of one sentence with one action that opens the orbit view of the vessel's system.
   "Where are we" already reads the track (`whereAreWe`); check it on the Party tab.
5. **Commands first.** Every new control is a registered command before it has chrome; the
   Keys table and its test stay true.

## Not in this step

The jump bubble; the arrival on the 100-diameter circle; a leg that ends in open space (your
part 1 flag, "the mark steps to the body at the jump": accepted as interim; A and C change the
model next, and you wire it after); the panes swap (follow-up 17); any warning, refusal,
refuelling or reading of the ship sheet (vNext).

## Check

- `npm test`, `npm run check`, `npm run typecheck`, `npm run build` green, pasted.
- In a browser against the real local API, with a vessel at Regina as the party's ship: plot
  a flight to another body and see distance and time appear and follow the G chooser; type
  over the hours, return to the estimate; add the leg; mark a destination system and see the
  parsecs, the rolled time and the fuel estimate; roll again; jump; open the vessel's page and
  see the legs; remove the last and undo. Signed out: none of it appears.
- Column, half and full; a 520 px and a 1,100 px window; keyboard for every control; reduced
  motion; contrast pairs for anything new; screenshots `k12b_*` in `findings/ui_design_shots/`.
- The step written into `findings/orbit_view_design.md` as §8r.

## Do not touch

`orbit/OrbitRenderer.ts`, `orbit/ships.ts`, `orbit/distance.ts`, `campaign/` (ask for a
helper by name), `router.ts`, `surface/`, `deckplan/`, `apps/api`, `rules/`. In
`packages/shared`, only the removal in step 1. Stop and report, in the brief's format.
