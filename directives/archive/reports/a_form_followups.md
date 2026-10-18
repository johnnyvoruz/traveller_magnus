Found: the first form dropped a star's lookup, a field refusal on Keep reached the editor only as a thrown sentence, and leaving the map dropped a running job's Undo.
Finished: the draft copies every form-field property, Keep names the refused field, and the next store picks up a running job and can Undo it.
Backed out: nothing. Density and the daily allowance were not started. Neither `directives/reports/b_generate_density.md` nor `directives/reports/b_generate_cap.md` is written, and neither has a copy under `reports/done/`.

# Lane A form followups report
Prompt: prompts/a_form_followups.md
Status: done

## Changed files
- apps/web/src/builder/draft.ts: `cloneForm` copies `lookup`. The other `FormField` properties were already copied. `edition` and `mode` were already copied.
- apps/web/src/builder/store.ts: a Keep refusal with `details.code` `field` becomes `{ id, text, holds: true }` on the draft. A generate job is remembered after the store that started it closes. The next store for that universe takes the progress and a new Undo token. `job` is that ref. `stopJob` asks the store that is still polling to stop.
- apps/web/src/builder/screen.ts: `asBuildStore` passes `job` and `stopJob` through. The seam type does not list them.
- tests/web/builder_draft.test.js: a hand star's `lookup` survives the first read, and the fixture's keys are `FormField.shape`, so a new schema property fails this test until the clone carries it. Keep of a field refusal names that field.
- tests/web/builder_store.test.js: close a store while a job is running, open another, the progress continues, and Undo on the new token posts the job undo.
- findings/builder_density_ready.md: the field-refusal shape and the followed job, for Lane D. The density lines above them are unchanged.

## Gates
npm test: fail. 1423 passed, 1 failed, 17 skipped. The new draft and store tests passed. The failure is Lane C and was not edited here.

- tests/web/surface_hybrid.test.js: day and night frames: terrain untouched, glow on the line, cheap per frame

npm run check: pass (`manifesto: clean`)
typecheck: pass (`tsc --noEmit -p apps/api`)
npm run build: pass (`vue-tsc -b && vite build`)
fourth gate: pass. The three tests named above pass. Against a private wrangler on port 18844, inspector 19844, its own persist directory, universe `01M4PVGCFRYBANJK4XKR53NQ8B`: generate 16 hexes `blank/0101` through `blank/1601`. Before close the job was `{ total: 16, done: 0, state: "running" }`. The next store adopted `{ state: "running", done: 0, total: 16, undo: "undo-1" }`, then saw `running:0` and `done:16`. Undo returned null. `blank/0101` was gone. `stopDev` ran.

There is no `GET /jobs` list. The running job is remembered in the browser, one per universe, until it finishes while a store is open or until Undo. A store opened after the job has already finished on a store that stayed open does not take a second token.

## Contract published
none

## Needs from others
- Lane B: none for this pass. Density and the allowance wait on `b_generate_density` and `b_generate_cap`.
- Lane D: the shape is in `findings/builder_density_ready.md`. Draw a field refusal with `messagesFor(field.id)`, and do not also show `edit.error` for that same sentence. After a route change, read `job` on the build store (`{ progress, undo }` or null) and call `stopJob` from the stop control. The seam type in `workspace/build/seam.ts` does not list `job` or `stopJob` yet.

## Questions for Johnny
none
