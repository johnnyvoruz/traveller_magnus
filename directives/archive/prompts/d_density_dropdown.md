# Lane D — the density dropdown on Generate; hexes marked as they land

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/D.md`,
`directives/agent_d_brief.md`, then this file. No git but read-only, no deploy, no
`rules/`, no Traveller rule from memory. Your density-sheet report is accepted (parts 1
to 3: the refusal at its field, `design/Spinner.vue`, the one job toast across
routes). Johnny has ruled that Undo is low priority: the "Undo isn't available,
because you left the map" sentence stays as you wrote it, and nothing more is built
for Undo in this pass.

## Why

Johnny, live: "if we select a subsector at a time, it's generating something in EVERY
SINGLE HEX … not every hex will be populated." The server and the store now take a
density. This pass puts it in front of the referee. It is the last piece.

## Read first

`directives/reports/done/a_density_store.md` and `findings/builder_density_ready.md`
(Lane A's store: `density` on `generate` and `generateGrowing`; progress carries
`leftEmpty`, `placed`, `landed`; `done` counts written, skipped, failed and left-empty
hexes together; systems generated is `placed.length`; progress arrives in steps of up
to 32). `directives/contracts/b_builder.md`, both generate sections, for the values.

## What to build

1. **The seam.** `workspace/build/seam.ts`: `density` on `generateMany` and on the
   grow body; `leftEmpty`, `placed`, `landed` on `JobProgress`. A's note says the
   store's screen adapter passes them at run time but the seam does not list them; if
   the adapter itself (`builder/screen.ts`, Lane A's) must change for `generateMany`
   to take `density`, stop on that line and report it.
2. **The dropdown** (Johnny: "make it a dropdown"). Wherever many hexes are generated:
   one labelled select, "Hexes to fill", four options in this order: "Every selected
   hex", "Sparse (2 in 6)", "Standard (3 in 6)", "Dense (4 in 6)". **Standard is the
   default.** The choice is remembered with the engine and method, per universe. On
   the Generate sheet it is a row with the others; on the pane's Generate button for a
   selection, and on the right-click menu, the current choice shows on the control's
   second line ("Standard, 3 in 6") so nobody fills a subsector by surprise. One hex
   shows no select and always generates.
3. **Honest numbers.** Before the run the count cannot be known: "Generate up to 80
   hexes". While it runs: "N of M hexes checked" (the server reports in steps of up to
   32, and `done` includes hexes left empty), not "N generated". After: "Generated 40
   systems in Subsector C. 40 hexes were left empty." from `placed.length` and
   `leftEmpty`, with skipped and failed as today. Singular and plural both read right.
4. **The map marks each hex as it lands** from `landed`, in place of reading
   revisions (`flight.ts`); a hex the roll left empty goes back to plain when its
   step reports. Unit test with a job that lands in three steps.
5. **Generating again fills nothing new at the same density** (the roll is seeded per
   hex): when a second run over the same hexes writes nothing, say so in one plain
   sentence and say what to do ("To fill a hex anyway, select it, and then select
   Generate." or better words of yours).

## Not in this pass

The daily allowance (`b_generate_cap` has no report yet): skip. Undo polish: none.

## Copy

Every sentence follows the Google developer documentation style guide; add new strings
to the design note's table.

## Owned files (this pass)

`apps/web/src/workspace/build/`, `tests/web/build_*.test.js`, your token lines, shots
`kb12_*`, `directives/reports/d_density_dropdown.md`. Not yours: `builder/`,
`apps/api`, `packages/`, `shell/`, the dossier files, `views/`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
a browser pass on your own ports and Vite cache, stopped after: a subsector at each of
the four choices (the systems counted on the map match the toast), the default on a
fresh universe, the choice remembered after a reload, one hex always filled, a second
run at the same density, a new sector slot with density, the right-click path; pointer
and keyboard; column, half, full, 520 px.

## Stop rule

Stop when it passes and the report is written, or at the adapter line in item 1.

Write `directives/reports/d_density_dropdown.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Added 2026-10-11 21:45 by the orchestrator: the adapter line is lent to you

Your blocked report is accepted and filed as `reports/done/d_density_dropdown_blocked.md`;
stopping there was right. Lane A is idle, so the line is lent to you for this pass
instead of a round trip:

- **`apps/web/src/builder/screen.ts`, `generateMany` only**: the fourth argument
  `density`, put on the body only when it is named, exactly as your report wrote it.
  Nothing else in `builder/`.
- One test for it in `tests/web/builder_store.test.js` beside Lane A's density tests
  (the screen adapter passes `density` through when named and omits it when not).
- Then items 1 to 5 above as written. Write your report as
  `directives/reports/d_density_dropdown.md` again (a new file), and list the two
  lent edits first under Changed files so Lane A can see them.

## Progress
done: read A's report and note; builder/screen.ts generateMany (lines 101-108) builds the body without density, so the seam alone cannot carry it; stopped at item 1 per the stop rule; blocked report written with the exact change for Lane A. next: items 1 to 5 once A's adapter takes density.
done: the lent line (screen.ts generateMany takes density) and its test in builder_store.test.js; items 1 to 5 built (seam types; Hexes to fill on the sheet, remembered per universe, the choice on the Generate button's and the menu's second line; hexes checked while running; placed and left empty after; marks from placed/landed and the checked count; the nothing-new sentence); tests; gates green (1450 pass). next: browser pass kb12_*.
done: browser pass kb12_* (default Standard; four choices with pane counts matching the toast; keyboard runs; second-run sentence; remembered after a reload; one hex; a new slot at Sparse; widths); the right-click many-hex menu not reached in headless Edge (selection cleared by the right press, MapView's), covered by a menuFor test; servers stopped; gates green (1454 pass); §29; report written. next: the orchestrator's next prompt.
