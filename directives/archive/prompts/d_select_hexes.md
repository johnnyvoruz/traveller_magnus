# Agent D — selecting hexes in Build, made best in class

Issued 2026-10-10 by the orchestrator. Common rules: `directives/swarm_restart.md`, your
brief. This comes **before** `prompts/d_step3_close_2.md` (that one waits on Agent A).
It is design and build in one pass: a short section 18 in
`findings/builder_system_design.md` first (the model below, your corrections to it, the
states drawn as `kb4_*`), then the build, then a browser pass.

## Johnny, on the live Builder (2026-10-10)

> "The building UX is pretty bad. If I click on a hex and it's on the left side of the
> screen, when I select it, it's immediately covered by the pane that appears. I think
> we need hover over so you know what hex you're selecting. We're sorta fighting between
> select clicks and moving the map around clicks: when I click and drag I'm getting a
> select box, which, yes, I will need a select box, but I also need to ensure I'm moving
> around the map. I think we need more cursor clues when it comes to adding and removing
> hexes. Will we be able to select hexes and it will create sectors / subsectors, so I
> can start to expand outside the existing sectors? Let's really dial in the select
> hexes experience and make it best-in-class."

## The model (defaults put to Johnny; build on them, say where you would differ)

1. **A plain drag always moves the map.** In Build and out of it, with a mouse, a pen or
   one finger. Nothing a person does by habit draws a box.
2. **The box is asked for:** Shift+drag adds the boxed hexes, Alt+Shift+drag takes them
   away. For one hand or a trackpad the **Select hexes** tool (`S`, the switch you
   have) makes a plain drag a box; while it is on, the strip says so in words, the
   cursor is the box cursor, and **Space held, the middle button or two fingers still
   move the map**. Escape leaves the tool before it clears the selection.
3. **Click** selects one hex and replaces the selection. **Shift+click** adds or takes
   away that hex. A click on empty space in a sector selects that empty hex (as now); a
   click outside every sector is item 7.
4. **Hover.** The hex under the pointer is outlined before any press, with its number
   and, if filled, its name on a small chip that never covers the hex; empty and filled
   hexes read differently. It follows the pointer with no lag and costs no chart redraw
   (your SVG marks layer, not the canvas). Nothing on touch.
5. **Cursor clues.** The cursor and the hover outline say what the next press will do:
   move (grab, grabbing while dragging), select, add (a plus, with Shift over an
   unselected hex), take away (a minus, with Shift over a selected hex or Alt+Shift),
   box. The outline's tone follows: add in the selection's tone, take away in the
   removal tone you already use. While a box is dragged, the hexes it would add or take
   away are previewed and the count rides beside the pointer ("12 hexes, 7 empty").
   CSS cursors from tokens or inline SVG data in `tokens.css`; no image files.
6. **The pane never hides what was just selected.** The camera treats the chart that is
   not under the pane (and not under the rail or the build strip) as the visible area.
   When a selection would sit under the pane as it opens, the map glides just far
   enough to clear it, once, and never moves again while that pane stays open; with
   reduced motion it steps. Centring ("locate", cold loads, `setWidth` in `MapView.vue`
   about 660, 1501 and 1875 to 1882) uses the same visible area. Agent A found the same
   fault from the other side: a hex against the pane's edge lost its double-click.
7. **Growing past the chart's sectors, by selecting.** Today an empty slot is selected
   as a slot and offers "New sector". Make hexes there selectable like any others: in
   Build, an empty slot under the pointer shows its ghost grid and "Empty sector slot";
   a click, a Shift+click or a box there selects hexes of that slot, and the pane says
   what will happen: "These 14 hexes are in an empty slot. Generating here makes a new
   sector." with a name box (a sensible placeholder, never an invented name) and the
   usual Generate. Keep makes the sector, then the systems, as one act with one Undo
   that takes both back. A box that crosses from a sector into an empty slot works the
   same way and says how many sectors it will make. **A subsector is never made: every
   sector has its sixteen;** the pane names the subsector the hexes fall in ("Subsector
   F, unnamed") and offers the rename. Check `findings/builder_sector_ready.md`: if the
   server cannot make a sector and generate in it as one undoable act, build it as two
   calls behind the seam and write down exactly what Agent B must add; do not fake the
   Undo.
8. **Keyboard keeps up:** arrows move the hover-and-select hex, Shift+arrows grow, as
   designed in your section on selection keys; the same add and take-away tones.
9. **The selection is always countable and clearable:** the strip shows "N hexes" with
   the tally and a clear control; the cap (`SELECTION_CAP`) is said in words when hit,
   never silently.

## What you may touch

`workspace/build/`, `views/MapView.vue` (the Build pointer handlers, the marks, the
visible-area sums), `apps/web/src/map/input.ts` and `map/camera.ts` for the drag, the
box and the inset. In `input.ts` Agent A's second-press code (about line 159 on) stays
unless item 6 makes it needless: if it does, say so and leave it. Outside Build the
chart must behave exactly as it does today, apart from item 6. Not yours: `builder/`,
`apps/api`, `packages/`, `orbit/`, `surface/`.

## Check

The four gates pasted. Tests for the pointer rules as pure functions (which gesture is
a pan, a click, a box, add or take away; the visible-area sum; the glide that clears
the pane). A browser pass on your own ports with a real mouse path where you can
(pointer events with movement, not synthetic clicks only), `kb4_built_*`:
- drag pans in Build; Shift+drag boxes; Alt+Shift+drag takes away; the tool on and
  Space still pans;
- hover on an empty hex, a filled hex, a selected hex, an empty slot;
- each cursor state, shot;
- a hex at the far left selected: where it sits before and after the pane opens;
- a box across a sector edge into an empty slot, named, generated, Undo;
- at column, half, full and 520 px; a trackpad-style pass (no Shift); reduced motion;
  no frame at or over 50 ms while hovering across a full sector and while dragging a
  box over 400 hexes (paste the worst).

Every question for Johnny written out, recommended answer first. Stop and report in the
brief's format.

## File bus (added 2026-10-10, replaces "report in chat")

Lane rules: `directives/lanes/D.md`. Nothing is pasted to Johnny any more.
This prompt allows `map/input.ts` and `map/camera.ts` beyond your lane's folders: list each edit there. Agent A changed the blank opener in `views/MapView.vue` at 18:50 today (`(hexKey) => blank(hexKey)`); keep it.
When finished or blocked, write `directives/reports/d_select_hexes.md` from
`directives/reports/_TEMPLATE.md` (status, every changed file with one line each
including files outside your lane, the four gates, contract, needs, questions written
out in full with your recommended answer first), then stop. After each meaningful step
append one line under Progress below: "done: X. next: Y."

## Progress
- done: built, browser pass run, report written to reports/d_select_hexes.md (findings/builder_system_design.md §18). next: prompts/d_step3_close_2.md.
