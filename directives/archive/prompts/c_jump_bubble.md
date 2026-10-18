# Agent C — the jump bubble

Issued 2026-10-06 by the orchestrator. The moon distance and the second toggle pass are
accepted and pushed; Johnny judges the motion on the live site.

## Why

Johnny, on what the ship MVP is: *"once outside the minimum jump distance, with the next
system marked, press Jump: the jump bubble appears, fades, and appears at the destination a
week later."* Today a ship that jumps simply stops being drawn (`placeShips` cannot place a
leg whose far end is another system), and a week later it is simply there in the other
system. Nothing may pop (`manifesto.md`, Graceful).

## Build, in `orbit/ships.ts` and `OrbitRenderer.ts`

1. **`placeShips` knows a jump.** While a ship's leg at `days` is a jump in progress:
   - in the system the jump **leaves** (the leg's `from` is on this picture), the ship has no
     mark, but the function reports where it left from;
   - in the system the jump **reaches** (the leg's `to` is on this picture), it has no mark
     until arrival; at and after arrival it is a normal mark at `to`.
   Give the renderer what it needs to see the two moments (entering jump here; arriving
   here) as data on the result. Keep `ShipMark` as it is for every other case, so Agent D's
   calls in `OrbitCanvas.vue` and `ship_marks.ts` still compile; if a type they use must
   change, stop and say which.
2. **The bubble.** When a ship enters jump on this picture, a bubble swells from the mark and
   fades, taking the designator and its name with it. When a ship arrives on this picture,
   the bubble appears first and the designator comes out of it. One or two thin strokes in
   `--attention` (amber is the strip's colour for a jump), the same family as the wireframe
   designators: no sprite, no glow beyond what the view already uses. Over `--t-long` out
   and `--t-slow` in, from the computed style; no literal.
3. **The same rules as the toggles.** The run starts on the frame the state changes
   (whether the clock played across the moment or the referee scrubbed across it); a scrub
   back across it plays the reverse; nothing animates on the first paint; reduced motion
   snaps; `layersBusy` (or its like) keeps the canvas painting; the settled frame is the
   picture that never moved.
4. **The stand-in** (`?campaignStandIn=`, dev only) gains one ship that jumps out and one
   that arrives, a few seconds apart on the running clock, so it can be seen without a
   campaign.

## Not in this step

Where exactly the ship comes out (the 100-diameter circle of the target world) and a leg
that ends in open space: Agent A changes the anchor first. Draw the arrival at `to`, as
`placeShips` does now.

## Check

- Tests: the two moments reported by `placeShips` at dates either side of departure and
  arrival, in the leaving system and in the reaching one; a toggle-style test that a ship
  entering jump schedules a run and that the settled frame equals one that never ran.
- `npm test` and `npm run check` green, pasted. Frames
  `findings/ui_design_shots/k12_bubble_{out,in}_{early,mid,late}.png` and a GIF of each.
- Do not touch `OrbitCanvas.vue` beyond the paint check, `views/`, `ShipStrip.vue`,
  `ship_list.ts`, `ship_marks.ts`, `campaign/`, `workspace/`. Stop and report.
