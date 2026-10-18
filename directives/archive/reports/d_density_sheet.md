# D density_sheet report
Prompt: prompts/d_density_sheet.md
Status: partial.
- Parts 1 to 3 are built and passed in the browser. Part 3 has one gap, from the store (below).
- Parts 4 (density) and 5 (the daily allowance) aren't started: neither `directives/reports/a_density_store.md` nor `b_generate_cap` is on disk, nor in `reports/done/`.

## Changed files
- `apps/web/src/workspace/build/SystemEditor.vue`: a refused field's sentence stays at its field, and `edit.error` is no longer repeated at the top for the same sentence. On a Keep refusal at a field, the editor selects that field's body (by hand), scrolls the field into view and focuses it.
- `apps/web/src/workspace/build/BuildBar.vue`:
  - the held Keep's tooltip points at the refused field;
  - the spinner now comes from `design/`.
- `apps/web/src/design/Spinner.vue` (new): the app's one spinner. Same ring and tokens; stands still under reduced motion.
- `apps/web/src/workspace/build/BuildSpin.vue`: removed. `BuildPane.vue` and `BuildBar.vue` use `Spinner`.
- `apps/web/src/shell/ToastStrip.vue` (lent for one swap): the busy ring is `<Spinner>`. Its own ring CSS (now dead) is removed, and the header comment says where the ring lives.
- `tests/web/toast_shell.test.js` (Lane E's file): one line, outside my files.
  - It pinned the strip's own ring CSS (`.toast-spin-arc { animation: none; }`), which the swap removes.
  - It now checks that the strip imports `design/Spinner.vue` and that the spinner stands still under reduced motion. Lane E, please confirm.
- `apps/web/src/workspace/build/job_toast.ts`:
  - the running toast is `busy`; Stop is `close: false` and changes that same toast to "Stopping. …";
  - a job followed across a route change is taken over, or picked up when Build opens;
  - `jobUndo` chooses the token the current store knows, or none;
  - `takenOver`, and `NO_JOB_UNDO`.
- `apps/web/src/workspace/build/acts.ts`, `grow_acts.ts`:
  - Stop goes through the followed store first;
  - a taken-over job's late end is ignored;
  - the result offers the right token, or says Undo isn't available.
- `apps/web/src/workspace/build/seam.ts`: `job` and `stopJob` on `BuildStore`, and `FollowedJob`.
- Tests: `tests/web/build_flight.test.js`, now:
  - the busy toast and its Stop;
  - a job picked up from the store;
  - a job taken over after a route change;
  - the token choice, including none.
- `findings/builder_system_design.md` §28, with its strings.
- Shots `findings/ui_design_shots/kb11_*`; pass scripts `findings/builder_pass_src/ds1.mjs` to `ds5.mjs`.

## Gates
npm test:      pass. 1459 tests, 1441 pass, 0 fail.
npm run check: pass (manifesto: clean)
typecheck:     pass. `npm run build` passes (index 166.74 kB).
fourth gate:   pass, with the gap below. Production bundle (`vite preview` through my own config and dependency cache), my API on 8797 with its own state directory, CDP 9397, inspector 9247; all stopped after.
- **Lookups on the first form** (Okyrhoe K1 V): mass "0.78", temperature "5040", before any change. No workaround of mine to drop: the gap was Lane A's `cloneForm`, now fixed.
- **A bad star number:**
  - By pointer (click the box, type 0, leave it): the sentence is at the Temperature field; the top is empty.
  - By keyboard (Shift+Tab back in, −1, Tab out): the same.
  - Keep is held while it stands; Ctrl+Enter keeps nothing.
  - Shots at half, column, full and 520 px: `kb11_refused_*`.
  - The sentence still reads "This field cannot hold that. …": Lane B's `fieldLabel`, in its queue.
  - Not seen in a browser: a refusal at Keep itself (the server would have to refuse a field the draft accepted). The scroll and focus run on that path only; draft-time refusals stay where you're typing.
- **A subsector job across routes** (CDP latency while it runs):
  - The toast shows the ring and "Generating 80 hexes · 0 of 80 Stop", on `/account` too.
  - Back on the map: the same single toast, and the progress by the Generate button again.
  - Stop from the toast: the same toast says "Stopping. Generating 80 hexes · 0 of 80" at once, with no Stop.
  - Reduced motion: every ring's animation is `none`.
  - Shots: `kb11_job_back`, `kb11_job_back_early`, `kb11_job_stopping`, `kb11_job_result`, `kb11_job_reduced`, `kb11_job_account`, and `kb11_job_column`, `_full` and `_520`.
- **Undo after the trip,** run A (the job's request had answered before I left, 1.5 s latency): the next store took the job over. The result was "Generated 80 systems." with Undo, and Undo emptied the subsector again.
- **Undo after the trip,** run B (I left within 0.5 s, 6 s latency, so the request hadn't answered):
  - The next store never followed the job; it adopts only when it's created.
  - The result came from the closed store, whose token the current store doesn't know.
  - It now says: "Generated 80 systems in Subsector D. Undo isn't available, because you left the map while the job ran. To take these systems back, select them, and then select Remove." Before this, its Undo did nothing at all.
  - Seen once in an earlier run: after a route trip and Stop, the job's toast went and no result came. It didn't come back after the take-over change.
- My test map is tidy: subsector D is emptied again.

## Contract published
none

## Needs from others
- **Lane A,** `builder/store.ts`: a store adopts a followed job only when it's created (`adoptJob()` in `openMap`). A job whose generate request answers after its store closed is remembered by that closed store, but the store opened meanwhile never takes it up, so Undo on its result can't work. Either:
  - let an open store take up a job remembered after it opened (the same `adoptJob` when `rememberJob` runs and another store is open for that universe); or
  - let the next store accept the first store's token.

  With either, the "Undo isn't available" line goes, and I'll drop it.
- **Lane E,** confirm the one assertion I changed in `tests/web/toast_shell.test.js` (above).
- **Lane B,** still: `fieldLabel` gives "This field" for numbered owners (`star.0.temp`); and Keep on most fresh generated systems throws "w.solarDayHours.toFixed is not a function".

## Questions for Johnny
1. When you leave the map within a second or two of starting a job, the result can't be undone from the toast until Lane A's store change lands. It says so, and says to select the systems and Remove them. Is that acceptable for now? I suggest yes: it's true, it's rare (leaving within the first request), and Lane A's fix removes it.
