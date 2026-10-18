# Agent A — dragging a waypoint: the worlds move, every point stays, the cursor says "edit", right-click ends plotting

Issued 2026-10-07 by the orchestrator. **Do this now; the live sheet design
(`a_live_sheet_design.md`) waits behind it.** The push is made (`1f5eccc`, live): the nav
console, the route on the picture, your route editing. This replaces
`a_readout_avoid.md`, which is folded in as item 5.

## What Johnny said, on the live build

> "The one key key key thing that is missing from the drag to drop waypoint is that the
> celestial bodies MUST move their orbits in order for me to see where the waypoint will
> be via time (the new nav modal is badass though), and then I want to right click to
> stop plotting points, and then if I move a mid point, a point after the selected point
> I'm moving vanishes during the move. I want to keep all the other points visible when
> moving points around, and the cursor needs to change when I'm hovering over an existing
> point so it looks like I can edit it; right now it looks like I'm going to drop another
> point on top of the existing point. Man that nav panel looks AMAZING!!!"

## Why you, and what you may touch

The picture is yours (`OrbitRenderer.ts`, `orbit/ships.ts`), and Agent D is building the
character sheet in `workspace/`. **For this step you also have D's orbit files**:
`orbit/OrbitCanvas.vue`, `orbit/course.ts`, `orbit/ship_marks.ts`, `orbit/commands.ts`,
`orbit/NavConsole.vue`, `views/OrbitView.vue`. D will not edit them meanwhile. Agent E
has a few lines to change in `views/OrbitView.vue` (the Campaign control): re-read that
file before each edit. List every line you change in a file that is not yours.

**It must be seen in a browser, signed in, with a real vessel** (the stand-in does not
exercise the drag). `directives/agent_d_brief.md` has the local harness D and E sign in
with: read it. Start **your own** local API on a free port with its own state directory
and your own Vite pointed at it (a stuck process holds 8787; do not touch it), and stop
both when done. If you cannot sign in locally, stop and say so before building: this
step is not to be shipped on tests alone.

## 0. First, say what happens today

On the build as pushed, at Regina, with a ship holding a stored three-leg route: sweep
the pointer with the plotter live; drag a waypoint of a course being laid; drag the last
stored waypoint; drag a middle one. For each, write down which bodies are drawn where
they **will be**, at which date, and which waypoints, lines, numbers and tags are on the
picture during the move. That table is the start of your report; Johnny's notes 1 and 3
are in it somewhere.

## 1. While a waypoint is in hand, the worlds are where they will be

The whole point of dragging is choosing a place **at a time**. While a waypoint is held
(a new course's or a stored route's), and likewise under the live plotter's pointer:
- **every body of the system** is shown at the arrival date of the point in hand, and
  follows as the drag changes that date, frame by frame: not only the body being aimed
  at. The language is the one the view has: the real picture stays on the view's date,
  the "then" is the holographic outline, with its arc from where the body is now. If the
  outlines are there today and he did not see them, they are too quiet for a drag: make
  them read at a glance while a point is in hand (tokens only; say what you changed), and
  settle back when it is dropped;
- the point in hand snaps to a body **where it will be**, not where it is;
- waypoints after the held one show their own bodies at their own re-timed arrivals;
- the console's figures agree with the picture on every frame.
**Added 2026-10-07, minutes later, after Johnny looked again:** *"Oh, I see now, only one
world is moving and the effect is so subtle that it's difficult to see. I don't think
it's showing where the moons will be. I realized I'm in a bad system where some of these
planets take a hundred years to complete an orbit."* So item 0's table will show what he
found, and the fix is three things:
- **All of them, not one.** Today only the body aimed at is drawn at its arrival. Every
  planet, and **every moon**, is shown at the arrival of the point in hand. Moons matter
  most: they are what moves in the days a flight takes, and a moon as a destination must
  be shown where it will be around a parent that has itself moved.
- **Not subtle.** A referee must see it without looking for it. The outline, its arc
  from now to then, and the contrast between "now" and "then" are yours to strengthen
  while a point is in hand (tokens only; the contrast test for any new pair). Show him
  the before and after of the same drag in the report.
- **The look, from Johnny (a third message):** *"I think the planet outline could stay,
  but we need like a ghost planet in the center, so it's like a holographic teal version
  of the planet, or we can re-use those wireframe spheres we use in the moons reveal
  animation."* So the "then" of a body is **the outline, with a ghost planet inside
  it**, not an empty ring. Build it with **the wireframe sphere of the Moons reveal**
  (it is in `OrbitRenderer.ts`, Agent C's motion work: read it and call it, do not copy
  it; C is not in the file now), at the body's own size, in the teal of that reveal,
  with a low teal fill so it reads as a solid hologram and not a cage, still (no sweep)
  while a point is held, and oriented as the reveal draws it. Moons get the same at
  their own size, down to the size where a sphere is noise, below which a filled teal
  dot stands in (say the threshold). Also make **one comparison frame** of his other
  option, the body's own disc tinted teal and translucent, beside the wireframe one
  (`k32_ghost_wire_vs_tint.png`), with what each costs per frame, so he can choose; the
  tree is left on the wireframe.
- **A body that will not have moved says so.** In a system where a planet takes a
  century to go round, a week moves it less than its own disc. Then there is no outline
  to see and it looks like a fault. Give a body whose "then" is within its own disc a
  quiet, deliberate mark that it holds its place (say what), so "it will be right here"
  reads as an answer. Check the step at Regina and in one such slow system (name it).

Light: the dated layouts cached as they are now, one settle per frame, **no presented
frame at or over 50 ms** while dragging across Regina with a five-leg route; the worst
number in the report. Under reduced motion the outlines jump rather than glide.

## 2. Every other waypoint stays on the picture during a move

Moving a middle waypoint makes the one after it vanish. While any waypoint is held, the
**whole** course is drawn: the legs before it, the held one, and every leg after it,
re-timed, each with its number and its line. Find the cause and name it (the dim "old
tail" rule from your last step, and a preview that stops at the held waypoint, are the
first places to look). The stored route's old shape may stay as a faint under-drawing,
or go: choose, and it must never be the only trace of a waypoint. A test for a drag of
the first, a middle and the last waypoint of a four-leg route: four waypoints, four
numbers, on every frame.

## 3. A waypoint looks like something you can pick up

- Over a waypoint that can be moved: the cursor is `grab`, the mark answers (a hover
  state in the renderer: say what, in the tokens); while held, `grabbing`.
- Over one that cannot (under way, already flown): no grab, and the console's words say
  why, as now.
- **Over an existing waypoint the plotter offers nothing new**: no "lay a waypoint here"
  preview under the pointer, so it never looks as if a second point will land on the
  first. A press there picks it up; it never lays one.
- `pressMeans` (D's one rule for a press) learns the waypoint: ship first, then an
  existing waypoint, then plotting. Its tests extended.

## 4. Laying points ends two ways, and then the pointer is an arrow for editing

**Added from Johnny's fourth message:** *"And then after we click on a planet to dock at,
that should sorta switch the plotter tool to just a regular arrow and now the user can
make course edits."* So the view has two states with a ship in hand, and they must look
different:
- **Laying.** The plotter's cursor; the reading and the ghost worlds follow the pointer;
  a press in open space lays a point and the laying goes on.
- **Editing.** The regular arrow. Nothing new is offered under the pointer. Waypoints
  are picked up and moved (item 3's grab over them), removed, or changed in the console.
  A press on a body is a selection again.

Laying ends, and editing begins, when either happens:
1. **a press on a body**: that body is laid as the waypoint the ship arrives at, and the
   laying stops there (he has said where he is going);
2. **a right-click** (below).

To lay more after that (a second world, a point beyond): the console's control and P
start the laying again from the last waypoint; say so in the console's words, quietly.
The course is still uncommitted in both states until "Add course". Tests for the state
after each kind of press; in the browser, lay two points in open space and then a
planet, and see the arrow.

### Right-click

On the picture, while waypoints are being laid: a right-click ends the laying. What has
been laid **stays** in the console as the course, uncommitted, exactly as if he had
stopped pressing; the ship stays in hand; a left press on a body is a selection again.
The browser's own menu is suppressed on the picture only, and only while a ship is in
hand. It is a command first ("Stop plotting", in the Keys table, with the right-click
named beside it); Esc and Release keep their meanings. Say how he starts laying again
(the console's control, P). *Johnny has been asked whether right-click should instead
add the course; build this, in one place, so that is a one-line change.*

## 5. The pointer's readout keeps clear of the ship tags

`PlotReadout` gains an optional `avoid?: { x, y, w, h }[]` (picture pixels, the space
the readout is placed in); `readoutPlace` treats each box as it treats a name's box.
You now hold `OrbitCanvas.vue` and the tags' wiring too, so measure the tag boxes
(`orbit/ShipTags.vue`: read, and the least lines) and pass them. A test, and
`fu29_stack_under_drawer.png` re-shot with the readout clear.

## 6. The browser checks D could not make, since you are there

D's second pass on the nav console was pushed on its tests alone. In your browser:
drag the first waypoint straight after "Add course", then Play and pause and see it
become "Under way"; drag a waypoint while the clock runs at a day a second; a route with
two legs, a jump and a leg beyond: drag, release, Play, Undo. Anything wrong is fixed
here, in the files you hold, and listed.

## Check

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Screenshots
and two short GIFs (a drag of a middle waypoint with the worlds moving; a right-click)
as `k32_*`. Column, half, full; keyboard still reaches everything it did; reduced
motion. Not yours even now: `workspace/`, `surface/`, `dossier/`, `packages/`,
`apps/api`. No git. Stop and report, with the table from item 0 first.
