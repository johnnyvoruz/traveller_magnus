# Lane D — the refusal at its field, one spinner, the toast's new flags; then density and the allowance

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/D.md`,
`directives/agent_d_brief.md`, then this file. No git but read-only, no deploy, no
`rules/`, no Traveller rule from memory. Your Undo-words report is accepted. Johnny's
answers: a left hex named by its number is clear enough (yes); the Undo offer stays on
a refused one-hex Undo (yes). The Keep failure you found
("w.solarDayHours.toFixed is not a function") is with Lane B, first in its queue.

## 1. A refusal at its field (Lane A has reported)

`directives/reports/done/a_form_followups.md` and `findings/builder_density_ready.md`:
a Keep refusal with a field id is on the draft as `{ id, text, holds: true }`; draw it
with `messagesFor(field.id)` at that field in the hand designer and the system editor,
scroll it into view, focus it, and do not also show `edit.error` for the same
sentence. A refusal with no field id stays at the top. Lookups now show on the first
form: check it and drop any workaround.

## 2. One spinner for the app (Johnny: yes)

Lift `workspace/build/BuildSpin.vue` to `apps/web/src/design/` (your name for it;
same ring, same tokens, still under reduced motion), use it in Build from there, and
in `shell/ToastStrip.vue` in place of the ring Lane E drew there (**lent to you for
that one swap**). Nothing else in the strip.

## 3. The job toast uses the strip's new flags (Lane E has reported)

`directives/reports/done/e_toast_shell.md`: the strip is mounted once in `App.vue` and
shows on every route. `showToast` takes `busy: true` (the ring, announced once), and an
action takes `close: false`. So: the running job's toast is `busy`; Stop is
`close: false` and changes that same toast's words to "Stopping." instead of opening a
second toast; the result replaces it. And the store now remembers a running job across
routes: add `job` and `stopJob` to `workspace/build/seam.ts`, read `job` when Build
opens so the pane's progress and the toast pick a running job up after a route change,
and drop your own "put the toast back when the next store opens" code if the store now
covers it. Test: start a job, go to `/account`, come back: one toast throughout,
progress by the button again, Undo works on the result.

## 4. Density on the Generate sheet

**Only when `directives/reports/a_density_store.md` or its copy in `reports/done/`
exists.** The design is part 2 of `prompts/d_generate_feedback.md` (a dropdown: "Every
selected hex", "Sparse (2 in 6)", "Standard (3 in 6)", "Dense (4 in 6)"; Standard the
default; the current choice on the button's second line). With A's new fields: mark
each hex as it lands from the landed keys (drop the revision reading), say "N systems
generated, M hexes left empty" from `placed` and `leftEmpty` (not from `done`), and
word progress honestly: the server reports in steps of up to 32 hexes. If A's report
is not there, skip and say so.

## 5. The daily allowance

Only when B's `b_generate_cap` report exists and A's note says the store exposes it:
as part 4 of `prompts/d_undo_words.md`. If not, skip and say so.

## Copy

Every sentence follows the Google developer documentation style guide; add new strings
to the design note's table.

## Owned files (this pass)

`apps/web/src/workspace/build/`, a new file in `apps/web/src/design/` for the spinner,
one swap in `apps/web/src/shell/ToastStrip.vue`, `tests/web/build_*.test.js`, your
token lines, shots `kb11_*`, `directives/reports/d_density_sheet.md`. Not yours:
`builder/`, `apps/api`, `packages/`, the dossier files, `views/`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
a browser pass on your own ports and Vite cache, stopped after: a bad star number
refused at its field by pointer and keyboard; lookups on the first form; a subsector
job followed to `/account` and back with one toast; Stop from the toast; each later
part that ran; column, half, full, 520 px; reduced motion once.

## Stop rule

Stop when parts 1 to 3 pass, with 4 and 5 built if their files were there, and the
report is written.

Write `directives/reports/d_density_sheet.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress
