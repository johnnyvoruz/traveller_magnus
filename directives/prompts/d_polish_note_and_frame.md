# Lane D — the Generate note and one shared modal frame

Issued 2026-10-14 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/board.md`, `directives/lanes/D.md`,
`directives/reports/done/d_first_run_review.md` ("The modal frame"),
`directives/reports/done/d_menu_and_job_error.md` (question 2), then this file. No git
but read-only, no deploy, no `rules/`.

Live is 1.1.12, engine 1.2.0, truth v10. Johnny said yes to both items on 2026-10-14.

## Do

1. **The note.** `apps/web/src/workspace/build/GenerateSheet.vue` line 71: the `'top down'`
   text becomes `'from the star outward'`, so it matches the method's label in
   `workspace/build/state.ts` 87. `'bottom up'` stays as it is.
2. **One modal frame.** In `design/base.css`, add `.ui-modal` (the fixed layer),
   `.ui-modal-scrim` and `.ui-modal-card`, lifted from the Lightbox's frame as it is
   drawn today: same scrim, same card, same motion. Change these four to use them and
   drop their own copies: `workspace/Lightbox.vue`, `workspace/build/OrbitPicker.vue`,
   `workspace/PersonCard.vue`, `workspace/PlanModal.vue`. After this, no component
   borrows `.lightbox-card`, and the person card and the deck plan look right without
   the Lightbox's chunk loaded.
3. Nothing else changes in how the four look. A difference you cannot avoid goes in the
   report with its shot.

## Owned files (this pass)

`GenerateSheet.vue` (one line), `design/base.css` (the three classes), the four
components above (lent: `PersonCard.vue` and `PlanModal.vue`), any test you add under
`tests/web/`, `directives/reports/d_polish_note_and_frame.md`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. **Browser:**
a before-and-after shot of each of the four dialogs at 1600 px and 520 px, opened from a
cold page (the person card and the deck plan first, before anything loads the
Lightbox). Shots go in `findings/ui_design_shots/` as `kb17_*`. Start Vite with its own
cache directory.

## Stop rule

Stop when the gates pass and the report is written.

Write `directives/reports/d_polish_note_and_frame.md` from `directives/reports/_TEMPLATE.md`.
After each meaningful step append one line under Progress: "done: X. next: Y."

## Progress

- done: item 1, GenerateSheet.vue's note reads "from the star outward". next: the before shots of the four dialogs, cold, at 1600 and 520 px.
- done: before shots kb17_before_* (8) and measurements; base.css has .ui-modal, .ui-modal-scrim, .ui-modal-card (and the bar's three: .ui-modal-bar, -title, -meta); the four dialogs use them and drop their copies. next: after shots and the measurement diff.
- done: after shots kb17_after_* (8; at 1600 px pixel-identical, at 520 px the cards identical and the pane behind them is Lane E's in-flight sheet); tests/web/modal_frame.test.js (4). next: the four command gates.
- done: npm test green on the rerun (one timing flake in renderer.test.js on the first run, under the browser pass's load); check clean; typecheck passes; build passes (index 178.33 kB); servers stopped; notes §35. next: the report.
- done: the report is written (directives/reports/d_polish_note_and_frame.md). next: nothing.
