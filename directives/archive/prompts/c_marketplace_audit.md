# Lane C — audit: what a stubbed content marketplace and "public games" need

Issued 2026-10-10 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/C.md`,
then this file. Your two surface passes are accepted and the surface map is ready for
the push; this pass is outside your usual folders and is **read-only**. No git but
read-only, no deploy, no server started, no Traveller rule from memory.

## Johnny, 2026-10-10

> "After we get this stuff working I want to stub out the content marketplace and the
> option that refs can set their game to public and show the current party ship
> location as a non-interactive element on other user's maps if they're sharing the
> same base truth map. The goal is that when people are playing you can sorta see where
> all the other 'games' are happening across the galaxy. But we need to get the galaxy
> builder working, and then the content marketplace working first."

So the order is: the galaxy Builder (in flight), then the marketplace, then public
games. Nothing is built in this pass. Johnny needs to know what is already there, what
"stub" would mean in files and routes, and what he has to decide.

## Goal

Write `findings/marketplace_gap_audit.md`. It is the only file you write besides your
report and the Progress lines here.

## What to read

- Specs: `directives/plan.md` (the package and marketplace slices, "Out of scope",
  the order near line 239), `directives/architecture.md` §2 (objects, pointers,
  manifests, packages), `directives/data_model.md`, `directives/api.md`,
  `directives/manifesto.md` §2 sentence 5 and §4 (marketplace: free sharing, snapshot
  on publish, locked to exact hex coordinates; relocation is a stretch goal).
- Tree: `packages/shared/src/schemas/` (package manifest, overlay v3),
  `apps/api/src/` (routes, `universe/`, any package or publish code, the D1 schema and
  migrations), `apps/web/src/` (router, any marketplace, package, install or share
  screen), `apps/web/src/campaign/` and `workspace/party.ts` for where the party's
  ship position lives, `apps/web/src/map/` for the layers that draw vessels
  (`campaign_layer.ts`, `vessel_marks.ts`).
- `directives/contracts/b_builder.md` for what a referee's own universe holds today.
- `findings/campaign_gap_audit.md` (Lane E, today) for the format and for what it
  already says about sharing and players. Do not repeat it; cite it.

## The note, four sections

1. **Marketplace: what the specs promise, one line each**, with the spec section, and
   for each: live at `3d28e33` / on disk unpushed / part built (say what is missing) /
   not started. Cover: making a package from a universe, the manifest, publish and
   snapshot, the catalogue and its listing, search and tags, the package page, install
   as a merge at the same hex ids, updates and versions, propose to canonical,
   unpublish and reports, attribution and the fair-use line.
2. **What "stubbed" could mean, as three sizes**, each with the files it would add, by
   lane (A browser logic, B server and shared schemas, D screens, E surrounding
   screens), and what a person could do at the end of it:
   a. screens and routes that exist and say "coming", nothing stored;
   b. publish and list work for the referee's own account only, install not yet;
   c. publish, list and install working end to end with no review step.
   Say which contract Lane B would have to publish first for each.
3. **Public games: what it needs.** Where the party's current ship position is stored
   today and in what coordinates (hex, body, in-flight); what "the same base truth map"
   can be tested against (truth version, universe parent, something else: say what the
   data model actually has); what a read-only public position feed would be (which
   store, how fresh, how many markers a sector view might have to draw); where a
   non-interactive marker layer would sit in `map/`; what must never leak (names of
   players, private records, positions of a game not set to public).
4. **Decisions for Johnny before any design**, each as one question written out in
   full with your recommended answer first and what it blocks. At least: what a
   listing shows; who may publish; whether anything is moderated; what "public" shows
   about a game (ship only, ship and game name, referee name); how stale a position
   may be; whether a referee may be public at hex precision only; opt-in default.

## Gates

None of the four apply (no code changes). Your gate: `git status --porcelain` before
and after shows no file of yours changed except the note, this prompt's Progress and
the report; paste both.

## Stop rule

Stop when the note and the report are written. Do not design screens, do not write
schemas, do not edit any spec.

Write `directives/reports/c_marketplace_audit.md` from
`directives/reports/_TEMPLATE.md`, with the counts per status and every question for
Johnny copied in full. After each meaningful step append one line under Progress:
"done: X. next: Y."

## Progress
done: read the slice 4–5 specs, the package schema, the D1 and universe tables, the party position, and the map marks. next: write findings/marketplace_gap_audit.md.
done: wrote findings/marketplace_gap_audit.md and reports/c_marketplace_audit.md. Porcelain matches the start of the pass. next: stop.
