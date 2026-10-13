# Lane D — generating many hexes always asks for the density; a right-click inside a selection keeps it; then the daily allowance

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/D.md`,
`directives/agent_d_brief.md`, then this file. No git but read-only, no deploy, no
`rules/`, no Traveller rule from memory. Your density-dropdown report is accepted,
with both lent edits; it goes out in version 1.1.6.

## 0. First: generating many hexes always asks for the density (Johnny, 2026-10-11)

Two rulings on your density-dropdown report:

- "Density choice should be whenever we have multiple hexes selected we prompt for
  density selection." So the choice is **asked every time**, not carried silently on
  the button from the last run.
- The plain wording, not the dice: he chose your alternative ("About half of the
  empty hexes") over "Standard, 3 in 6".

Build:

- **Every way of generating more than one hex opens the same small prompt before
  anything runs**: the pane's Generate button for a selection, the `G` key, the
  right-click menu's Generate item, the palette's command, and Generate in an empty
  sector slot. One prompt, one component; in the pane it opens in place by the button
  (not a window-covering modal), from the menu and the palette it opens the pane's.
- The prompt: the heading says what is selected ("80 empty hexes in Subsector C"),
  then "Hexes to fill" as four choices that can all be read at once (a short list of
  radio rows reads better than a closed select here; a select is acceptable if the
  pane is too narrow: say which you built and why), then **Generate** and Cancel.
  Enter generates, Escape cancels, focus starts on the selected choice and returns to
  the control that opened it.
- **The words of the four choices**, name first, then the plain meaning:
  "Sparse: about a third of the empty hexes", "Standard: about half of the empty
  hexes", "Dense: about two thirds of the empty hexes", "Every hex: all of the empty
  hexes". The "2 in 6" figures move to a one-line hint under the list for people who
  want the roll ("Each empty hex is rolled once: 2, 3, or 4 chances in 6.").
- **Preselected:** the last choice made in this universe, or Standard the first time.
  It is still shown and still has to be confirmed: nothing runs without the prompt.
- The Generate button for a selection goes back to one line ("Generate…", with the
  ellipsis that says a choice follows; the count stays in the prompt's heading). Drop
  the second line and `densityLine` where nothing else uses it.
- The full Generate sheet (engine, method) keeps its "Hexes to fill" row with the
  same four wordings; choosing Generate there does not ask a second time.
- **One hex never asks**: Generate, preview, Keep, as today.
- The words while it runs and after are unchanged from your last pass.
- Tests: each entry point opens the prompt and none runs a job without it; Cancel
  writes nothing; the preselection; one hex is not asked.

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
a browser pass on your own ports and Vite cache, stopped after: the density prompt from each of its five entry points, by pointer and by
keyboard, Cancel and Generate, the preselection after a reload; select nine hexes,
right-click one of them: the selection stays, the menu's Generate opens the prompt,
and the job runs after it; right-click a hex outside:
that hex alone; the menu key; one hex as before.

## Stop rule

Stop when parts 0 and 1 pass (and part 2 if its files were there) and the report is written.

Write `directives/reports/d_menu_selection.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress
done: part 0 built (density_ask.ts and DensityAsk.vue: every many-hex Generate asks first, in the pane; four radio rows in the plain words, the hint, preselected from the universe; the button and menu say "Generate…"; the sheet runs without asking; one hex never asks; a new sector is named first); part 1 built (input.ts ignores a secondary press, which was taken as a click on release and selected one hex; MapView's menu and the menu key follow menuKeysFor); tests, including the pointer test failing on the old code; gates green (1465 pass). Part 2 skipped: b_generate_cap not on disk. next: browser pass kb13_*.
done: browser pass kb13_* (the prompt from the pane by pointer and keyboard, G, the menu, the palette, an empty slot; Cancel, Enter, Escape, focus back; Sparse preselected after a reload; nine hexes kept by a real right press, the menu's Generate asking then running; outside gives one hex; Shift+F10 both ways; one hex not asked); servers stopped; gates (2 red, Lane A's dots and Lane B's allowance in flight); §30; report written. next: part 2 when b_generate_cap is reported.
