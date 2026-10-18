# Agent D — fly it like an RTS: select, set waypoints, press Play

Issued 2026-10-06 by the orchestrator. Do this after `d_ghost_wiring.md` is reported.

## What Johnny asked

*"As far as course plotting, I think we would want to support in-system waypoints … Think
Homeworld RTS where the user can control units and set waypoints, click play, speed up or
down time and watch the ship signal fly to the location. If a ship is docked on a planet, I
want a Sci-fi tag to pop out to indicate the ship is on the planet and the user can click on
the tag to select the ship."*

After `d_ghost_wiring.md` a ship can be plotted one leg at a time, to a body or to a point
in open space. This step makes it a **course**, and makes ships things you can pick up on
the picture. Slingshots round a planet are in the backlog (`plan.md`, "After 5"): not here.

## First, three things left open by `d_ghost_wiring.md` (accepted and pushed), ruled

- **A press just beside a body is that body.** Today the readout's inverse snaps a point
  within 14 px of a body to that body's present place, so the press sets a fixed point
  the body then moves away from. Inside that snap distance the destination is the body
  itself, as if the body had been pressed; a point is only ever set in open picture.
- **The leg uses the settled figure, not the rounded one.** The hours field shows a tenth
  of an hour, and the arrival line was up to three minutes from the estimate's own
  arrival. Unless the referee has typed the hours, the leg's arrival is the settled
  arrival exactly; the field shows it rounded.
- **A point's words name a body.** "Holding at 26.9 AU" does not say where. Agent A is
  changing `pointWords` to name the nearest body and the distance to it always, not only
  within 0.05 AU. Nothing for you to build; check the strip, the Track section, the Party
  tab and the Where block read well with the longer words, at every width.
- Seen in `k21_wired_point.png`: the hairline readout ("29.5 AU · ship 11.9 AU") is drawn
  through the ship's own name when the pointer is near the ship. The readout is the
  renderer's (Agent A's now); say whether your side can keep them apart, or ask A.

## Design it in a short note first, then build in the same step

`findings/orbit_course_design.md`, with one mockup of each of the three things below at
Regina. No stop for a ruling unless the look truly forks; record your choices.

## Build

1. **Select a ship on the picture.** A press on a ship's mark selects it, as its chip in
   the ship list does. The hit test is Agent A's pure function in `orbit/ships.ts` (A is
   adding it in `a_course_preview.md`; if it is not there, say so and build the rest).
   The selected ship reads as selected on the picture and in the list at once. Keyboard:
   the ship list already reaches every ship; keep it the way in.
2. **The docked tag.** A ship docked at, or in orbit round, a body gets a **tag that pops
   out from that body**: the ship's designator and name, on a leader, in the family of the
   selection tag the view already draws (`--orbit-tag`), an HTML control over the picture
   so it can be pressed and reached by keyboard. Pressing it selects the ship. Several
   ships at one body: one tag each, stacked without overlap, or one tag that opens to the
   list when there are more than fit (say the number). It appears and leaves with the
   tokens' motion and not at all under reduced motion; it follows the body as the clock
   runs; it never covers the body's own name. Its place comes from Agent A's function for
   where a docked ship sits, and you set A's flag so the renderer does not also draw that
   ship's designator. A ship under way or holding at a point keeps its designator and has
   no tag.
3. **Waypoints.** With a ship selected and plotting on, **each press adds a waypoint**: a
   body, or a point in open space. The card becomes the course: the waypoints in order,
   each leg's distance, time and arrival, and the totals; one G for the course, with the
   hours of any leg still typeable; the last waypoint removable (and by Esc, one step at a
   time, before Esc leaves plotting), the whole course clearable. **"Add course"** writes
   the legs in order through `appendLeg`, each departing when the one before arrives; one
   toast with one Undo takes them all back. Each leg is flown from rest to rest, because
   that is the travel rule Johnny supplied: say so once, quietly, in the card.
   The `preview` you feed becomes the course (Agent A is giving the renderer a list of
   legs; until it lands, feed the last leg as now and say so).
4. **Watch it fly.** After "Add course" the view is ready to play: the clock is on the
   course's departure, Play is one press, and the speed can be stepped faster and slower
   from the keyboard as well as from the Time drawer (two commands, keys of your choosing,
   none doing two things). While a selected ship is under way the strip counts down to its
   next waypoint and names it.
5. Commands first for every new control; the Keys table true; contrast pairs for the tag.

## Check

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. In the browser,
signed in, on the real chart at Regina: select a docked ship by its tag; plot three
waypoints (a point past the 100D ring, another world, a point); add the course; press Play
and step the speed up; watch the mark fly each leg and stop at each waypoint; Undo the
course; two ships docked at one world; the tag at column, half and full, in a 520 px
window, by keyboard, with reduced motion. Screenshots `fu28_*`. Notes into
`findings/orbit_view_design.md`.

`OrbitRenderer.ts`, `orbit/ships.ts`, `orbit/distance.ts`, `dossier/`, `orbit/card.ts`,
`BodyCard.vue`, `surface/`, `campaign/`, `packages/` stay closed: ask for what you need.
No git. Stop and report, in the brief's format.
