# Agent D — the plot card becomes the ship's nav console

Issued 2026-10-06 by the orchestrator. Do this after `d_waypoints.md` is reported.

## What Johnny asked

Looking at the plot card as it is live (`findings/ui_design_shots/ref_plot_card_today.png`):
*"Let's really take this modal / popup and make it look like a sci-fi ship UI. Also when I
select the ship it should automatically go into plotting mode, and then when in plotting
mode, it should have me select the velocity so that when I move the plotter around, we see
the planet ghosts move."*

Three changes: the flow, the live preview, and the look. You are the lead design agent:
this one is yours to make sing. The bar is the legacy app's polish and
`design_reference.md`; the card today is a plain form.

## 0. Added 2026-10-06, after Johnny used the live waypoints build (`d4bb7e8`)

Your waypoints step and the ship tags are **accepted and pushed**. His notes on the live
site, with a screenshot (`findings/ui_design_shots/ref_right_stack_misaligned.png`):

> *"Ship not being selected on click, and then I want to be able to click and drag to move
> waypoints that have been placed. Course cards still don't look amazing. Also line up
> these alerts and buttons or whatever so they're all right aligned? All these
> notifications / controls / alerts need to move down like the card in the left. Also when
> I click on the vessel to select it, I want to see its pathing and be able to edit it.
> Think basic RTS controls."*

These join this step. In order:

**0a. A live defect first: a ship is not selected by a press.** Reproduce it on
`https://traveller.voyage` itself, signed in: press a ship's tag, press its designator,
with plotting off and with plotting on, with one ship and with two, at a body and holding
at a point. In `OrbitCanvas.vue` `onUp`, a press while plotting never asks whether a ship is
under it, so it lays a waypoint instead; find whatever else stops it. **A press on a ship
or its tag always selects that ship**, in or out of plotting; when plotting, it switches
the console to that ship and lays no waypoint. A test for the rule, and say why your own
browser pass did not catch it.

**0b. The right-hand stack lines up and rides under the drawer.** The status strip, the
ship list, the destination row, the course card and the toasts each end at a different
place on the right in his screenshot. **One right edge for all of them** (the picture's
gutter), whatever their widths. And they do what Agent E's info card now does on the left:
with no drawer open they start 18 px below the top of the picture; with a drawer open they
start 18 px below it, moving with the drawer's own tokens (`--drawer-height` is already on
`.orbit-stage`; read `orbit/BodyCard.vue` for how the card follows it; do not edit that
file). Nothing in the stack shifts sideways as its words change.

**0c. Selecting a ship shows its route, and the route can be edited.** Agent A is giving
the picture a `route` (the selected ship's stored legs from now on, drawn as the committed
course), `waypointAt` for picking a waypoint up, and `replaceLegsFrom` in
`campaign/track.ts` (`prompts/a_route_edit.md`). With those:
- a selected ship's route is on the picture and its legs are in the console, without
  plotting anything new;
- **a waypoint can be dragged**, in a course being plotted and in a stored route: press it,
  drag, release. Over a body it becomes that body (the snap you already have); in open
  picture, a point. While dragging, the console's figures and the ghosts follow, as the
  live plotter does. Every leg from the moved waypoint on is re-timed, each from rest to
  rest at the course's thrust, unless its hours were typed;
- a waypoint can be removed (a control on its row, and a key while it is focused), and one
  can be added after the last, as now;
- an edit to a stored route is one change with one Undo, written through
  `replaceLegsFrom`; legs that have already departed are history and are shown as such,
  not editable;
- from the keyboard: each waypoint's row in the console is reachable, and can be removed
  or have its destination changed to another body there. Dragging needs a pointer; say so.
If A's three pieces are not on disk when you reach this, build 0a, 0b and sections 1 to 3,
and say so.

**They are on disk (2026-10-06, reviewed and accepted).** What you have:
- `OrbitCanvas.vue` takes a `route` prop (a `FlightPreview`: the selected ship's stored legs
  from the frame's date on). Given one, the picture draws the committed course solid; a
  `preview` is drawn dashed over it from the first waypoint that differs.
- The canvas exposes `waypoints()`: `{ route, preview }`, each a list of
  `{ index, x, y }` for this frame (`DrawnWaypoint` in `orbit/ships.ts`).
- `waypointAt(waypoints, point, ship)` in `orbit/ships.ts`: the index under a picture
  point within the body snap, null on the ship itself, so a press on the ship still
  selects it.
- `replaceLegsFrom(recordId, index, legs, notBefore)` in `campaign/track.ts`: one commit;
  it refuses a leg that has departed at `notBefore` ("That leg has already departed."),
  an index past the end, a bad leg, more than 500 legs, and legs out of time order. Show
  its message as it is.
- A is changing one thing in the renderer while you work: under a preview, the route's old
  tail from the parting waypoint is drawn dimmer with no tags. Nothing for you to do.

**"Course cards still don't look amazing"** is section 3 below: that is the bar.

## 1. The flow

- **Selecting a ship puts the view in plotting mode for it** (its chip in the list, its
  mark on the picture, its docked tag). The console opens with it. The P key and the View
  drawer's toggle still work.
- **There is one obvious way out** that is not hunting for a toggle: releasing the ship
  (pressing it again, Esc at the end of its chain, a control on the console) leaves
  plotting, and a press on a body is a selection again. Say what it is, and make sure a
  referee who only wanted to look at a ship's status is not trapped into plotting.
- **Thrust first.** The console opens on the G chooser (Johnny said "velocity"; the control
  is the thrust in G, 1 to 6, as now). The last thrust used for that ship is offered; the
  first time, none is assumed and the chooser asks. No Traveller default from memory.

## 2. The plotter is live

- **While the pointer moves over the picture in plotting mode, the preview follows it.**
  The place under the pointer (a body inside the snap distance, otherwise the point) is
  measured from the ship, or from the course's last waypoint, at the chosen thrust: the
  console shows distance, time and arrival for "here", and **the ghosts move as the pointer
  moves**, because the arrival date under the pointer changes. A press commits the
  waypoint, as `d_waypoints.md` built it.
- It must stay light: at most one settle per frame, the dated layouts cached as you do
  now, no frame over 50 ms while sweeping the pointer across Regina. Report the longest.
- Where the picture has no answer under the pointer (inside the star's hole, a line-up
  layout), the console says so and the ghosts rest at the last waypoint's arrival.
- Keyboard: the same from the keyboard, by stepping through the bodies as destinations
  (the body chips already order them); a point needs a pointer, and that is said.

## 3. The look: a ship's navigation console

Design it first, in the same step: `findings/orbit_nav_console_design.md`, with mockups of
the console after a ship is selected, with the pointer sweeping (the live figures), and
with a three-waypoint course, at the wide stage, beside a half panel, and in a 520 px
window. Then build it. No stop for a ruling unless the look truly forks; Johnny judges it
live and will send notes.

What it must be:
- **Read as an instrument, not a form.** The view already has the pieces of the language:
  the amber selection tag, the Scout Survey readout (mono, `--signal` on `--bg-2`), the
  ship sheet's chamfered panels, cyan tabs and rust value tags, the wireframe designators.
  Copy from them; do not invent a fourth style. Numbers are instruments: tabular, mono,
  the arrival the largest thing on it.
- The thrust as a throttle, not six small buttons; the course as a readout of legs; the
  two fuel lines and the estimate's words kept, quietly; "Add course" the one filled
  control; nothing that warns or refuses (the MVP only measures).
- One panel system: this is the picture's overlay card, not a new modal. Tokens only, and
  a new token only with a reason, in `tokens.css`. It holds one width per layout; nothing
  in it shifts as the figures change under a sweeping pointer (the readouts are fixed at
  their longest, as the date readout is). Motion from the tokens; none under reduced
  motion. Every control reached and worked by keyboard, the 2 px amber focus ring,
  contrast pairs for every new pair.

## Check

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. For section 0:
a ship selected by tag and by designator, plotting on and off; the right-hand stack's
right edges measured (one number) and its top measured closed and under each drawer; a
stored route shown on select; a waypoint dragged to a point and onto a body, in a new
course and in a stored one; one removed; Undo. Then, in the browser,
signed in, on the real chart at Regina: select a ship three ways and see plotting start;
choose a thrust; sweep the pointer and watch the ghosts and the figures; commit three
waypoints; add the course; press Play; release the ship and select a body normally.
Column, half, full, 520 px and 1,100 px; keyboard; reduced motion. Screenshots `fu29_*`
beside `ref_plot_card_today.png`. Notes into `findings/orbit_view_design.md`.

`OrbitRenderer.ts`, `orbit/ships.ts`, `orbit/distance.ts`, `dossier/`, `orbit/card.ts`,
`BodyCard.vue`, `surface/`, `campaign/`, `packages/` stay closed: ask for what you need.
No git. Stop and report, in the brief's format.
