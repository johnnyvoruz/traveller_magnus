# Builder, step 3: new sectors and subsectors, and a system designed by hand

Issued 2026-10-08 by the orchestrator. Common rules: `directives/swarm_restart.md`. Read
`prompts/builder_step1.md` (its rulings at the foot), `prompts/builder_step2.md` and
`prompts/builder_step2_close.md` first. The engines are 1.1.0 and a new world generator
is coming: **nothing in this step may depend on what an engine produces.**

## First, two things left from step 2

- **Agent A:** `shell/pane.ts` about line 229, `campaignRedirect` (applied in `router.ts`
  about line 79) strips `panel=dossier` from every address, so since your `dossierDefault`
  fix and D's dropped guard **the sector and subsector panes cannot be opened at all**.
  It leaves `panel=dossier` alone on a sector's and a subsector's address. A test. This
  is first, and it is small: report it at once so D can go on.
- **Agent D:** Agent B's four fixes **are on disk** (your report was written before they
  landed: the stale tree is a 409 with the current row; a profile cell takes one
  character; a name change moves nothing else; a star change keeps the name and typed
  fields). Run the item 5 pass of `builder_step2_close.md` now, with "Take theirs"
  clicked, and re-shoot the scope panes once A's line is in.
- **Agent B, from D:** a blank system at hex 2008 came back named "Lesotho" with a full
  mainworld profile (`AA70953-E`) after one world was added and kept. A blank system is
  blank: no name, no profile, nothing rolled, until the referee types it or asks for a
  roll. Find where the name and the profile came from and stop it (see part 2 below).

## What Johnny asked (2026-10-08)

> "The hex selection is working only for sectors and subsectors that are created. How do
> we create additional sectors and subsectors? And then we also want to be able to do a
> manual system creation where someone can CRUD their own system design with any / all
> settings and add planets and pair them and whatever they want to do within the context
> of the system designer (updated world gen is around the corner, but manual stuff should
> be A-OK). Also do you have a clean way to segment these newly created systems /
> subsectors / sectors so they don't merge with our truth layer and can be shared with
> our upcoming content marketplace?"

## Part 1: sectors and subsectors that are the referee's own

Defaults taken until Johnny says otherwise (they are put to him):
- **A sector is a place on the grid of sectors plus a name.** On a universe pinned to the
  chart, a referee may make a sector in any slot the chart leaves empty; a charted
  sector is never replaced, only overlaid hex by hex as now. On a blank universe every
  slot is empty and the referee makes the first sector anywhere.
- **A subsector is one of a sector's sixteen (A to P): it always exists and is never
  "created"; what the referee owns is its name.** So subsector CRUD is name, rename,
  clear its hexes, generate its hexes.
- A sector the referee made can be renamed, moved to another empty slot (its hexes go
  with it: a sector's identity is not its slot; `plan.md` Slice 2, "sector layout… as
  layout, not identity") and deleted with Undo. Deleting keeps a copy first, as a job
  does.

**Agent B:** in the universe Durable Object: the sector rows (an id that is not the slot,
the slot, the name, sixteen subsector names, `rev`), the routes to list, make, rename,
move, delete and undo, and the hex routes of step 1 working inside a sector the referee
made exactly as inside a charted one (generate one and many, remove, restore). The
contract first in `packages/shared`, then the ready note. Say how a hex key names a hex
in a sector that has no chart slug, and keep that answer away from every existing key.
**Agent A:** the store (`builder/`): the sectors of the open universe laid over the
chart's, a sector made by hand addressable and drawable (the map draws an empty sector's
grid and name), the sector and subsector panes working on it.
**Agent D:** in Build, an empty sector slot can be selected and offers "New sector";
the sector pane names, renames, moves and deletes; the subsector pane names and renames;
as designed in your section 5, command first.

## Part 2: a system designed by hand

Today the editor is the legacy editor's: changing a star, a world or an orbit re-runs
the bottom-up generator over the whole system. That stays for a generated system. **A
system designed by hand is a second mode in which the engine never runs:**
- Every field of every body is the referee's to type: stars (any number, and which
  orbits which), worlds and moons added, removed, reordered and moved between parents
  ("pair them": a companion star, a binary's shared worlds, a moon given to another
  world), the mainworld chosen, every profile cell, names, notes, bases, zone,
  allegiance. Nothing is rolled unless the referee presses "Roll" on that one field, and
  nothing else moves when they do.
- A blank system starts in this mode, empty. A generated system can be switched into it
  ("Design by hand"), which is one-way for that system and says so; Undo still returns
  the kept version before.
- **No rule is checked**, as ruled. The form refuses only what cannot be stored (a
  profile cell with two characters; a moon whose parent does not exist).

**The seam matters more here than anywhere.** A hand-designed system must outlive the
generator rebuild untouched. So it is stored as **a system document of our own, with its
own schema in `packages/shared`** (stars, worlds, moons, their parents and order, the
fields above), not as an engine's tree. Agent B: define it; `formOf` and `applyForm` for
this kind read and write that document only; `chartEntry` for it is made from the
document's own mainworld; the dossier and the orbit view get it through one adapter in
`packages/generation` that presents the document in the shape their existing walk
reads (say what the walk needs and what a hand-made system cannot give, e.g. orbital
elements nobody typed: the picture draws what it can and the rest is absent, never
invented). Agent A: the handle and the store carry the kind. Agent D: the designer, in
the editor's own language: add, remove, reorder, re-parent, by pointer and by keyboard.

## Part 3: kept apart from the chart, and ready to be shared (answer and proof)

By design (`architecture.md` section 2, `data_model.md`) a universe is a layer over the
chart: its rows point at objects of its own and the chart is never written. Agent B,
**prove it for everything built so far and in this step, in
`findings/builder_isolation.md`:** where each kind of object is stored (bucket and key),
that no route of the Builder can write under `truth/` or the public `objects/`, a test
that generating, editing, removing and designing in a universe leaves the public bucket
byte for byte as it was, and that a second account cannot read the first's rows or
objects. Then, **the shape of a package, not built:** what a "shareable piece" would be
for the marketplace (a sector, a subsector, a set of systems): its manifest (hex keys,
`baseHash` where it overlays the chart, tree hashes, the sector rows, names), what
installing it into another universe would write, and what in this step's data would get
in the way. Findings only.

## Everyone

Gates pasted; a browser pass on your own ports for what has a screen; what you built,
stubbed, skipped; questions. Stop and report.

## Added 2026-10-08, from Johnny on the live site: a generated system has no orbit view

"There is no orbit view for a system that is currently auto generated." Agent D's pass
saw the orbit view's header and body chips for a generated system but never the picture
(its local copy drew none for a charted system either), so this went out unseen.

**Agent A, second after the pane line, and reported on its own so it can be pushed
alone:** on your own ports, with a universe pinned to the chart (D's notes in
`findings/builder_system_design.md` say how it made one locally), generate a Mongoose
system and an Architect of Worlds system, open each one's orbit view, and make the
picture draw: stars, worlds, moons, the body chips, the dossier beside it, the planet
surfaces. Find where it stops. The likely place: the orbit view and the surface service
fetch a system's tree from the public objects by hash, and a universe's own objects are
private and come through the API; and the tree may be asked for before the builder's
rows are loaded on a cold address. Whatever it is, a generated system, an edited one, a
blank one with a star, and a charted one all open, on a cold load of the orbit address
and from the map. Where a system has nothing to draw (a blank one with no worlds), the
view says so in words rather than showing an empty stage. Tests for the fetch path;
screenshots `kb_orbit_*`; the surface service is Agent C's lane: if the fault is there,
give the exact change and I will hand it on.
