# D generate_feedback report
Prompt: prompts/d_generate_feedback.md
Status: partial. Parts 1, 3, 4 and 5 are built and passed. Part 2 (density) is not started: neither `directives/reports/b_generate_density.md` nor `reports/done/b_generate_density.md` was on disk.

## What Johnny met on 1.1.2 (part 1, reproduced first)
I reproduced it on a production build (`vite preview` of `apps/web/dist`, my API on 8797). The network was slowed with CDP `Network.emulateNetworkConditions`, latency 1,200 ms. I sampled the pane and the strip at +50 ms, 300 ms, 1 s, 3 s and 8 s.
- **One hex:**
  - The only sign was the Generate button's word, "Generating…", for 2 to 3 s.
  - No motion, and no mark on the map.
- **A subsector:**
  - The pane's bar did show at +50 ms, so it wasn't the 300 ms rule, and it wasn't off screen.
  - But it was a still line, "Generating 80 hexes 0 of 80", that never moved. The local job went from 0 to done between two polls.
  - The map showed nothing until all 80 systems arrived at once.
- **The pane closed:** nothing shows anywhere; the bar lives only in the pane.
- Shots: `kb8_repro_one`, `kb8_repro_sub`.

## Changed files
- `apps/web/src/workspace/build/BuildSpin.vue` (new). The app had no spinner: a ring at icon size that stands still under reduced motion. Decorative; words always sit beside it.
- `apps/web/src/workspace/build/flight.ts` (new): the job's hexes from the frame of the click, and which have landed.
  - A hex has landed once its row's revision moves past the one it had at the click (the store reloads the job's sectors at every poll).
  - Empty-slot keys follow their real keys.
- `apps/web/src/workspace/build/acts.ts`, `grow_acts.ts`: start and end the flight.
- `apps/web/src/workspace/build/BuildMarks.vue`, reading the flight from Build's state (no change to `MapView.vue`):
  - waiting hexes march in amber;
  - landed hexes get the signal wash;
  - a one-hex roll's hex marches until its preview is drawn.
- `apps/web/src/workspace/build/BuildStrip.vue`:
  - the job chip under the strip (spinner, words, "N of M", Stop), shown whether the pane is open or not;
  - the "your own map" note.
- `apps/web/src/workspace/build/BuildPane.vue`:
  - the spinner in the job bar and in the Generate button;
  - the bar laid over the pane's top, so nothing moves;
  - a busy button isn't dimmed.
- `apps/web/src/workspace/build/BuildBar.vue`: the spinner in "Rolling…".
- `apps/web/src/workspace/build/state.ts`: `jobLine`, `YOURS_NOTE`, `YOURS_KEY`.
- `apps/web/src/workspace/build/hand_acts.ts`: a second Roll profile press is no longer blocked (part 4).
- `apps/web/src/workspace/build/orbit_pick.ts` (`wrapFocus`) and `OrbitPicker.vue`: focus is held inside the picker and returns to Pick orbit (part 5).
- Tests:
  - `tests/web/build_flight.test.js` (new, 3);
  - `build_hand.test.js` (roll again, 1; the old blocked-roll check removed);
  - `build_orbit_picker.test.js` (focus wrap, 1).
- `findings/builder_system_design.md` §25, with its strings.
- Shots `findings/ui_design_shots/kb8_*`; pass scripts `findings/builder_pass_src/fb0.mjs` to `fb3.mjs`.

## Gates
npm test:      pass. 1413 tests, 1397 pass, 0 fail (the rest skip without RUN_API_TESTS).
npm run check: pass (manifesto: clean)
typecheck:     pass. `npm run build` passes too; index 159.63 kB.
fourth gate:   pass. Production build on my ports (preview 5197, API 8797 with its own state directory, CDP 9397, inspector 9247), all stopped after. Latency of 2,500 ms through CDP.
- **One hex, column:**
  - At +60 ms: the chip "Generating a system in 0101", the spinner turning, the hex marching on the map, and the button busy with its spinner (`kb8_one_column`).
  - Closing the pane during the roll cancels it (an existing rule), so the chip goes too (`kb8_one_pane_closed`).
- **A subsector:**
  - At +60 ms: the chip "Generating 80 hexes · 0 of 80" with Stop, the pane's bar with its spinner, and 80 hexes waiting in amber.
  - Shots during the one job: `kb8_sub_column`, `_half`, `_full`, `_520`, and `kb8_sub_waiting`.
  - Ended with the toast "Generated 80 systems in Subsector N." and Undo, which I pressed to leave the test map as it was.
  - No hex landed mid-job: this local server lands all 80 between two polls. The per-hex wash is covered by a unit test.
- **Reduced motion** (CDP `Emulation.setEmulatedMedia`): the spinner and the march have no animation; the words and the counts stay (`kb8_sub_reduced`).
- **Layout shift** (`layout-shift` PerformanceObserver, no other input):
  - one hex: 0.0001 at the press (the shorter label moves the key hint), then 0.013 when the preview replaces the pane;
  - subsector: 0 while the bar appears and runs, 0.0021 at the end (the pane's counts change).
- **The note:** shown the first time Build is on, also at 520 px (`kb8_yours_note`, `kb8_yours_note_520`). After Got it and a reload, it's gone.
- **Roll again** (part 4): the unit test only. No browser roll this pass.
- **Orbit picker focus**, keyboard only from the Pick orbit button:
  - Tab ×9 and Shift+Tab ×9 stay inside, coming round at both ends.
  - The arrow keys move the pick and keep focus (Orbit 2.7 → 2.8).
  - Focus pushed to the search box comes back to Close.
  - Escape returns to Pick orbit. Opened from the palette, Escape also returns to Pick orbit (`kb8_picker_focus`).
- No page errors in any run.

## Contract published
none

## Needs from others
- Lane B: `b_generate_density` for part 2 (density on the sheet).
- Lane A: optional. `JobProgress` with the hex keys landed since the last poll would let the map mark each landing without reading revisions. Today's revision reading works, so this isn't blocking.
- Whoever owns `workspace/Lightbox.vue` (Lane E has it on loan): the same Tab hole as the picker. `wrapFocus` in `build/orbit_pick.ts` and the `focusin` guard in `OrbitPicker.vue` show the fix.

## Questions for Johnny
1. "Whose map this is" is a note under the Build strip, shown the first time Build is on until you select Got it. Is that the right place? I suggest yes: everyone starting to build sees it before they act. A line in the Generate sheet's foot would reach only people who open the sheet.
2. The strip says "The Spinward Run · on the chart, v5". "On the chart" names which chart version the map sits on, but read alone it could suggest your changes go onto the chart. Should it say "your map over chart v5" instead? I suggest yes. It's one string in `BuildStrip.vue`, and it would keep the message you asked for in view all the time.
3. During a job, the pane's progress bar covers the first line of the pane (the tally of empty hexes), so nothing below it moves. Is that acceptable? I suggest yes: that count is out of date while the job runs, and it shows again the moment the job ends.
