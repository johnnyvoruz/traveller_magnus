# Lane D — your own systems as dots on the zoomed-out map; then the daily allowance

Issued 2026-10-12 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/D.md`,
`directives/agent_d_brief.md`, then this file. No git but read-only, no deploy, no
`rules/`, no Traveller rule from memory. Your density-prompt and right-click report is
accepted (parts 0 and 1); it goes out in version 1.1.8. The order of the four choices
stays as built (fewest to most).

## 1. Now: the zoomed-out dots (Johnny: a referee's own systems must show when zoomed out)

Lane A built the store and the renderer (`directives/reports/done/a_own_dots_2.md`,
`findings/map_own_dots.md`). The live map does not use them until two calls are in
`views/MapView.vue`, which is yours. A wrote both, with their places:

- in `frame()`, after the hex-tier block that calls `bound.load`: when the tier is not
  `hex`, build the chart's `slug -> cells` map from the overview and call
  `builder.noteDots(drawn.sectorsOnScreen, chartDots)`;
- in the watch that follows `store.tick()`, before `markDirty()`:
  `renderer.setDotOverlay(builder ? builder.dotOverlay() : null)`.

Add them as written, or say what you changed and why (for one: building a new Map on
every overview frame is wasteful if the overview has not changed; keep it if A's
`noteDots` needs a fresh one, cache it if not). Nothing else in the renderer; if the
renderer needs a line, name it in the report and stop that part.

Then the browser pass A could not do, on a private API and your own Vite cache:

- generate a few systems in an empty part of a charted sector, zoom out past the hex
  tier: the new dots are there at every zoomed-out tier, the same mark as a chart dot;
- remove a charted system: its dot goes; Undo: it comes back;
- make an own sector and generate in it: its dots show zoomed out;
- generate a subsector with the density prompt, zoom out while the job runs: dots
  arrive as hexes land, with no reload;
- signed out: the published chart only, and no dots request (read the network log);
- a cold view of the whole chart: the count of dots requests (A's test says pages of
  32, once) and none on a second look; panning does not ask again for a sector held;
- frame time while panning zoomed out, before and after, on the full chart.

Shots `kb14_dots_*`.

## 2. The daily allowance

**Start only when `directives/reports/a_allowance_store.md` (or its copy in
`reports/done/`) and `findings/builder_allowance_store.md` exist.** If either is
missing when you reach this part, write the report for part 1, say part 2 waits, and
stop. Lane B's side is done: `directives/contracts/b_builder.md`, "Daily generation
allowance".

- **Where it shows:** in the density prompt (many hexes), on the full Generate sheet,
  and by the one-hex Generate and Roll again. Quiet while there is plenty: no line at
  all above 20 left. At 20 or fewer: "N of 100 left today." (the limit from the
  server, not a typed 100).
- **When the request would pass it:** the Generate button is off and one plain
  sentence says why and when it resets, in the person's own time zone ("You can
  generate 12 more systems today. The allowance resets at 7:00 PM."). The server
  checks the density roll's writes, not the "up to N" count: read A's note for the
  number and word the sentence to match what the server will do. With a density that
  may write fewer than what is left, do not switch the button off on a guess: say
  what you chose and why.
- **The server's refusal** (429 `generation_allowance`) is shown in the same place,
  with the server's sentence plus the local reset time; nothing is marked on the map;
  the toast does not start.
- **An admin sees none of it** (`limit` null).
- **At zero:** the line stays up without a selection, so a person knows why before
  they select anything.
- Tests for each state; the copy in `findings/builder_system_design.md`.

## Copy

Every sentence follows the Google developer documentation style guide.

## Owned files (this pass)

`apps/web/src/views/MapView.vue`, `apps/web/src/workspace/build/`,
`tests/web/build_*.test.js`, shots `kb14_*`, `directives/reports/d_dots_allowance.md`.
Not yours: `apps/web/src/map/MapRenderer.ts`, `apps/web/src/builder/` (Lane A).

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
the browser pass in part 1; for part 2, a non-admin account with its stored limit set
low on your private API (the contract says one row sets it): plenty, 20 left, a
selection larger than what is left, zero, the refusal, an admin, column, half, full,
520 px.

## Stop rule

Stop when part 1 passes and its report is written, with part 2 done if its two files
were there.

Write `directives/reports/d_dots_allowance.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

