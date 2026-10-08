# Agent D — the nav console, second pass: the first leg, the unmeasured parts, one collision

Issued 2026-10-07 by the orchestrator. `d_nav_console.md` is **accepted and called for
push** with Agent A's route work: the press rule (`pressMeans`), the right-hand stack on
one edge under the drawer, the route shown and editable, select-starts-plotting, thrust
first, the live plotter, the console's look. The console reads as an instrument now;
that was the bar.

Your decisions 1, 2 and 6 stand unless Johnny says otherwise (the last thrust offered
with the plotter live at once; Esc closes a drawer before it releases the ship; no
compact console at 520 px). His answers are added at the foot of this file when he gives
them. Decision 5 (a route that ends in a jump) is with him and is **not** in this step.

## 1. A leg that departs exactly now is still editable (your question 3)

Straight after "Add course" the first leg is history, because both rules count a leg
departing at the view's own date as departed. So the first waypoint of a course a referee
has just laid cannot be picked up, which is the very thing Johnny asked to be able to do
("click and drag to move waypoints that have been placed"). Ruling: **a leg is under way
only once the date has passed its departure.** At the instant of departure the ship has
not moved and the leg is editable.

- `orbit/course.ts` `storedRoute`: `underway` when `legs[0].departs < days`.
- `campaign/track.ts` `replaceLegsFrom`: refuse when `current[index].departs < notBefore`.
  **You may change that one comparison and its tests in `tests/web/campaign_track.test.js`**
  (Agent A is in `campaign/store.ts` and `commit.ts`, not in that file); list the lines.
  Nothing else in `campaign/`.
- Check the picture agrees: a leg at its departure instant is drawn whole from the ship,
  and the console does not say "Under way". If the renderer draws it otherwise, say so
  (that file is A's); do not edit it.
- Tests for both rules at the instant, one second before and one second after. In the
  browser: lay three waypoints, Add course, and at once drag the first; then press Play,
  pause, and see it has become "Under way".

## 2. What you said was not exercised, exercised

With route rows showing (a stored three-leg route and a course after it):
- the widths: column, half, full, 1,100 px and 520 px, no page scroll, nothing cut;
- the Tab walk through every new row control, in order, written out;
- reduced motion;
- **a route edit made while the clock is running** (drag a waypoint during Play at 1 day
  a second: say what happens when the leg being dragged departs under the pointer);
- a locked route (one that ends in a jump) in the browser: what the console says;
- a touch pointer, if your harness can make one; if not, say so once.

## 3. The pointer's readout against a ship's tag

In `findings/ui_design_shots/fu29_stack_under_drawer.png` the hairline readout at the
pointer is cut by the Far Margin tag ("40.… 77 AU"). Agent A's rule keeps the readout
clear of the marks' names; the tags are yours and it does not know their boxes. Keep the
readout clear of every tag box (move it to the pointer's other side, as A's rule does
for names). If that needs the tag boxes handed to the renderer, say what you need from A
rather than editing `OrbitRenderer.ts`.

## Not in this step, and why

- **Typed hours on a stored leg (your question 4).** Ruling: the leg records it. Agent A
  adds an optional field to the leg after the journal's store; you use it then. Until
  then the console's note that a re-timed route loses typed hours stays.
- **A route that ends in a jump (question 5):** Johnny's.
- Your four older design choices (question 7) keep their standing defaults.

## Check

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Screenshots
`fu30_*`. Notes into `findings/orbit_nav_console_design.md`. `OrbitRenderer.ts`,
`orbit/ships.ts`, `orbit/distance.ts`, `surface/`, `dossier/`, `packages/`, `apps/api`
and the rest of `campaign/` stay closed. No git. Stop and report, in the brief's format.

## Johnny's answers (2026-10-07): "all your recommendations sound reasonable, let's go with those"

- **The last thrust is offered and the plotter is live at once** for a ship that has
  flown: stays as you built it.
- **No compact console at 520 px** for now.
- **A route that ends in a jump is editable. This is section 4 of this step:**

## 4. A route with a jump after it can be edited

Today `storedRoute` marks such a route `locked`, because replacing its tail would take
the jump with it. Ruling: **the in-system waypoints before the jump can be moved, removed
and added to; the jump and every leg after it keep their own durations and move in
time** by however much the edited legs now end earlier or later.
- The jump still departs from wherever the last in-system leg now ends (a body or a
  point: both are already allowed as a jump's start). Its destination, its rolled hours
  and its note are untouched. Legs after it, in the other system, shift by the same
  amount and are otherwise untouched.
- One write through `replaceLegsFrom` with the edited legs followed by the shifted ones;
  one Undo restores the track exactly.
- The console shows the jump and what follows as rows that cannot be picked up, with
  their new dates as the drag moves; the words say they move with the course.
- If the shift would put any leg out of time order or past a limit, the edit is refused
  with the store's message, and nothing is written.
- A leg already under way, or already flown, is still history.
- Tests: move the last in-system waypoint later and earlier (the jump's departure and
  arrival move by the same amount, its duration equal to the hour); remove a waypoint;
  Undo. In the browser: a ship with two legs, a jump and one leg beyond; drag, release,
  press Play.
