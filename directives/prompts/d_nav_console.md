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

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. In the browser,
signed in, on the real chart at Regina: select a ship three ways and see plotting start;
choose a thrust; sweep the pointer and watch the ghosts and the figures; commit three
waypoints; add the course; press Play; release the ship and select a body normally.
Column, half, full, 520 px and 1,100 px; keyboard; reduced motion. Screenshots `fu29_*`
beside `ref_plot_card_today.png`. Notes into `findings/orbit_view_design.md`.

`OrbitRenderer.ts`, `orbit/ships.ts`, `orbit/distance.ts`, `dossier/`, `orbit/card.ts`,
`BodyCard.vue`, `surface/`, `campaign/`, `packages/` stay closed: ask for what you need.
No git. Stop and report, in the brief's format.
