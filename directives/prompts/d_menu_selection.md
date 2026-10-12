# Lane D — a right-click inside a selection keeps the selection; then the daily allowance

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/D.md`,
`directives/agent_d_brief.md`, then this file. No git but read-only, no deploy, no
`rules/`, no Traveller rule from memory. Your density-dropdown report is accepted,
with both lent edits; it goes out in version 1.1.6.

## 1. The right-click menu on many hexes

Your own finding: with nine hexes selected, a right press on one of them opened the
single-hex menu ("Empty hex 1002"); the selection was gone by the time the menu read
it (`views/MapView.vue` about line 1541, which is yours). So "Generate up to N hexes"
with the density on its second line cannot be reached by right-click, only its unit
test.

- Reproduce with a real pointer in a headed or headless browser and say which event
  clears the selection (the press, the release, or the context-menu event) and whether
  it is the same on a touch long-press.
- Rule to build: a right press, or a long-press, **on a hex that is in the selection**
  keeps the selection and opens the menu for the selection; on a hex **outside** the
  selection it selects that one hex and opens its menu, as now. The keyboard's menu
  key follows the same rule from the focused hex.
- A test at the level the bug lives (the pointer handling in `map/input.ts` or the
  view), failing on today's code.
- While you are in that code: does a plain left click on a selected hex still do what
  §18 of the design note says? Do not change it; say what it does.

## 2. The daily allowance

**Only when `directives/reports/b_generate_cap.md` or its copy in `reports/done/`
exists, and Lane A's note says the store exposes the allowance.** As part 4 of
`prompts/d_undo_words.md`: "N of 100 left today" on the Generate sheet and by the
Generate button for many hexes, quiet while there is plenty, plain when the selection
would pass it, the button off, the reset time in the person's own time zone; an admin
sees none of it; the server's refusal shown in the same place. With density on, "up
to N" may be more than what is left while the roll would write fewer: say which number
the server checks (read the contract) and word the sentence to match it. If either
file is missing, skip and say so.

## Not yours this turn

`apps/web/src/map/MapRenderer.ts`: Lane A has three places in it for the zoomed-out
dots. If A's report names a line it needs in `MapView.vue`, the orchestrator will
bring it to you.

## Copy

Every sentence follows the Google developer documentation style guide.

## Owned files (this pass)

`apps/web/src/views/MapView.vue`, `apps/web/src/map/input.ts`, `map/camera.ts`,
`apps/web/src/workspace/build/`, `tests/web/build_*.test.js` and a test for the
pointer rule, shots `kb13_*`, `directives/reports/d_menu_selection.md`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
a browser pass on your own ports and Vite cache, stopped after: select nine hexes,
right-click one of them: the selection stays and the menu reads "Generate up to 9
hexes" with the density line; choose it: the job runs; right-click a hex outside:
that hex alone; the menu key; one hex as before.

## Stop rule

Stop when part 1 passes (and part 2 if its files were there) and the report is written.

Write `directives/reports/d_menu_selection.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress
