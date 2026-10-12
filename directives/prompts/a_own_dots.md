# Lane A — the referee's own systems as dots on the zoomed-out map

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/A.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Do `prompts/a_form_followups.md` first if it has no report yet.

## Why

Johnny, 2026-10-11: "when I manually generate systems in map, they only display at a
certain zoom level (whenever hexes are in view); we will want to draw the dots on the
zoomed out views as well."

## What the orchestrator read

`apps/web/src/map/MapRenderer.ts`: at the tiers above `hex`, `overviewPoints` (about
line 376) draws one dot per occupied cell from `sector.cells`, a string per sector
that comes from the published chart's overview (`setChart`, about line 193). A system
the referee generated, designed by hand or removed is not in that string, so:

- a generated or hand-made system has no dot until the hex tier;
- a charted system the referee removed still has its dot;
- a sector of the referee's own has no cells at all, so it is empty when zoomed out.

Confirm each of the three in a browser before you build.

## What to build

- At every tier that draws overview dots, the dots are the referee's map: the chart's
  cells, plus every hex of theirs that holds a system (generated or by hand), minus
  every charted hex they removed, in charted sectors and in sectors of their own.
- Where the data comes from is yours to settle and is the real work. The Builder
  store loads hex rows for sectors near the view at the hex tier; zoomed out, many
  sectors are on screen. Read `directives/contracts/b_builder.md` for what the server
  gives cheaply (a per-sector summary of occupied hexes, the sector list's counts, the
  hexes list with a sector filter). If there is a cheap answer, use it, cache it per
  sector, and refresh a sector when one of its hexes is written, generated, removed,
  restored or undone. **If the server has no answer that is cheap for a whole
  universe (say the cost: requests and bytes for a referee with 20 sectors touched),
  stop there and write the exact route you want from Lane B in the report**; do not
  page every hex of every sector to draw dots.
- The dots appear and go without a flash when a job lands or an Undo runs, and a job
  in flight shows its dots as its hexes land where that is known.
- Signed out, or with no universe: exactly today's drawing.
- Same dot, same colour, same size as a charted system: on the zoomed-out map a
  system is a system. (If you think the referee's own should look different, build it
  the same and put the question in the report.)
- Draw time: the overview tier's `ms` for a view with 40 sectors, before and after;
  not more than 1 ms slower on the same machine.

## Owned files (this pass)

`apps/web/src/builder/`, and lent for this pass: `apps/web/src/map/MapRenderer.ts`
(`overviewPoints`, `setChart` and one new setter for the overlay; nothing else).
Yours: tests in `tests/web/`, a note `findings/map_own_dots.md` if Lane B or Lane D
needs anything, `directives/reports/a_own_dots.md`. Read only: `views/MapView.vue`
(Lane D's; if the renderer needs a call from the view, give the exact line in the
report), `map/tiers.ts`, `apps/api`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
a browser pass on your own API port, state directory and Vite cache, stopped after:
generate a subsector in a charted sector and one in a sector of your own, remove one
charted system; zoom out through every tier: dots present, the removed one gone;
Undo: dots gone at once; reload zoomed out: dots there without visiting the hex tier
first; signed out: unchanged. Shots `ka_dots_*` at each tier, before and after.

## Stop rule

Stop when it passes and the report is written, or at the route you need from Lane B.

Write `directives/reports/a_own_dots.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress
