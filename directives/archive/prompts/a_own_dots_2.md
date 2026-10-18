# Lane A — the referee's own systems as dots on the zoomed-out map (the route exists now)

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/A.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your density-store report is accepted. Lane D made the four-line change to
`builder/screen.ts` `generateMany` (a fourth argument `density`) and added one test
beside yours in `tests/web/builder_store.test.js`, on loan, because you were idle:
read both and say in your report if either is not as you would have it.

## Goal

`prompts/a_own_dots.md` as written (read it: what to draw, the three gaps, the same
dot as a charted system, the draw-time budget, the browser pass and the shots). It was
blocked on a route. Lane B has built it.

## The route (read the contract, `directives/contracts/b_builder.md`, the dots section)

- `GET /api/universes/:id/hexes/:sector/dots` answers `{ cells, stamp }`. `cells` is
  1,280 characters in the overview's order: index `(col - 1) * 40 + (row - 1)`. `.` is
  empty; any other character is a system. `ETag` is the quoted sha256 of `cells`;
  `If-None-Match` answers 304.
- `GET /api/universes/:id/hexes/dots?sectors=a,b,c` does the same for up to 32
  sectors: `{ sectors: [{ sector, cells, stamp }], stamp }`. Owner only; 401 signed
  out, 404 for a stranger.
- A charted sector starts from the pinned version's overview string with the
  referee's rows applied; a sector of their own starts as 1,280 dots.

## What that settles, and what is still yours

- Ask for the sectors on screen at the overview tiers in pages of 32, once, and keep
  each sector's `cells` and `stamp`; ask again with `If-None-Match` only for a sector
  one of whose hexes was written, generated, removed, restored or undone, or when a
  job reports landed hexes there. Do not poll.
- A referee who has changed nothing must cost nothing extra to draw: if the answer
  for a charted sector equals the chart's own string, keep using the chart's.
  Say how many requests a cold load of a 40-sector view makes, and the bytes.
- The renderer draws from the overlaid string where there is one
  (`map/MapRenderer.ts` `overviewPoints`, `setChart`, one new setter: lent to you for
  this pass; nothing else in that file).
- If the map view must call the new setter, `views/MapView.vue` is Lane D's: give the
  exact line in the report (D is asked to keep out of the renderer this turn).

## Owned files (this pass)

`apps/web/src/builder/`, the three places in `apps/web/src/map/MapRenderer.ts` named
above, tests in `tests/web/`, shots `ka_dots_*`, `directives/reports/a_own_dots_2.md`.
Not yours: `views/`, `workspace/`, `apps/api`, `packages/`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted (Lane C may
be finishing surface work: a red surface test is named and passed over). Fourth gate:
the browser pass of `a_own_dots.md` on your own API port, state directory and Vite
cache, stopped after.

## Stop rule

Stop when it passes and the report is written, or at the line you need in
`MapView.vue`.

Write `directives/reports/a_own_dots_2.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: the dots route is in the contract, and the renderer still draws only the published cells. next: overlay setter and the store cache.
done: overlay setter, store cache, and the dots tests are green, including Undo clearing a generated dot at once. next: the four gates and the report, stopping at the MapView lines.
done: npm test, check, typecheck, and build passed. next: the report is written, partial, at the two MapView lines.
