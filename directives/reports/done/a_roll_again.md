Found: Progress had one line and the draft already appended a repeated profile roll. The contract says a later roll uses the next number, so this was not a stop.
Finished: two rolls of one body leave as two entries and count as one change. Discard drops them. Keep and Keep mine send them in order. A roll whose body is gone is dropped.
Backed out: nothing.

# Lane A roll again report
Prompt: prompts/a_roll_again.md
Status: done

## Changed files
- apps/web/src/builder/draft.ts: `rollAgain` appends an id that ends in `.profile.roll` even when it is already in the list. Every other id is still sent once. Keep mine keeps each profile roll whose body is still on the form, in order, and drops a roll whose body is gone.
- tests/web/builder_draft.test.js: two profile rolls in one draft (two entries on the draft and on Keep, `handChangeCount` is 1), Discard before anything is sent, and Keep mine carrying the two and dropping `b9.profile.roll`. A generated field rolled twice stays one entry in the existing `system.age` test.
- findings/builder_roll_again_ready.md: three lines for Lane D.

`types.ts` and `index.ts` did not change. `workspace/`, `packages/`, and `apps/api` were not edited. The contract was read and not edited.

## Gates
npm test: pass. 1384 passed, 16 skipped, 0 failed. `tests/web/orbit_disc_texture.test.js`, `surface_service.test.js`, and `orbit_renderer.test.js` were not red.
npm run check: pass (`manifesto: clean`)
typecheck: pass (`tsc --noEmit -p apps/api`)
npm run build: pass (`vue-tsc -b` and the Vite build)
fourth gate: pass. The three new tests in `tests/web/builder_draft.test.js`, plus the existing generated-field roll, cover two entries and one change, one entry for `system.age`, Discard, and Keep mine.

## Contract published
none

## Needs from others
- Lane D: the second Roll profile press is still blocked in `apps/web/src/workspace/build/hand_acts.ts`, and `edit.rolled` still stores the id once. The draft will send each press in order. The bar's `handChangeCount` already counts that id once. See `findings/builder_roll_again_ready.md`.

## Questions for Johnny
none
