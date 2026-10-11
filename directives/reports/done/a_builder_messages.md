Found: the prompt's Progress was empty, and no sentence in this pass was half-renamed. hand.ts, form.ts, routes/builder.ts, and the Builder contract already had other lanes' uncommitted edits. I left that logic in place.
Finished: every row of findings/builder_messages.md is applied, or left as the table said, and the quoting tests and the contract quotes match.
Backed out: nothing.

# Lane A builder messages report
Prompt: prompts/a_builder_messages.md
Status: done

## Changed files
- packages/generation/src/hand.ts: sentence text only, plus `fieldLabel` / `holdText` so a refusal names the form label. Conditions, status, and which check fires are unchanged. `bounded` takes an optional label so a star's Orbits field is not called Parent.
- packages/generation/src/form.ts: the same, for profile cells, the Architect of Worlds star cap, the Hill sphere note, age disagreement, regeneration, unknown fields, and read-only fields.
- apps/api/src/universe/sectors.ts: the sector sentences in the table. Charted slot, undo, and "a hex names a slot" stay.
- apps/api/src/universe/hexes.ts: hex address, hex changed, and the generation pin. "Nothing to remove." and "Already undone." stay.
- apps/api/src/routes/builder.ts: `This system can't be stored...` and `This hex changed...`. The charted-slot sentence stays.
- apps/web/src/builder/draft.ts: a bare 400 is matched by form label, not by a raw id.
- apps/web/src/builder/store.ts: the slot-in-use compare, and the conflict sentence `blank` throws.
- apps/web/src/workspace/build/SystemEditor.vue: the remove comment now quotes `Removing this star also removes 4 bodies.` The profile-roll filter on that same line is Lane D's edit. I did not add it.
- tests/web/builder_draft.test.js, tests/web/builder_store.test.js, tests/web/build_grow.test.js, tests/web/build_hand.test.js (the remove sentence only; the classText assertion and the new tests are Lane D's), tests/generation/hand.test.js, tests/generation/form.test.js, tests/generation/roll_body.test.js, tests/api/builder_close.test.js, tests/api/builder_sector_generate.test.js, tests/api/builder_sector_logic.test.js: expected sentences.
- directives/contracts/b_builder.md: quoted sentences only.
- findings/builder_messages.md: the table as applied.

Rows marked changed by Lane A, and why, are in that findings file. Short version: a profile cell says "Type one character."; a number, a length, a kind, and a new id each say what that check actually wants. "Type one character." on AU would have been the wrong instruction. The star-limit sentence and the bad-id sentence used to be the same words, so they are now two sentences. Where the proposal had no next step, one was added.

`tests/web/build_hand.test.js` line 220 (the star rows and `classText`) passed in this run. That assertion is Lane D's, in the working tree. I did not edit it.

## Gates
npm test: fail, one test, not in this pass.

```
test at tests\web\orbit_disc_texture.test.js:1:1
✖ tests\web\orbit_disc_texture.test.js
SyntaxError: The requested module '../../apps/web/src/orbit/disc_batch.ts' does not provide an export named 'discWantsTexture'
```

1367 passed, 15 skipped, 1 failed. The failure is Lane C's orbit texture file. I did not change it.

npm run check: pass (`manifesto: clean`)
typecheck: pass (`tsc --noEmit -p apps/api`)
npm run build: pass (`vue-tsc -b` and the Vite build)
fourth gate: pass. `RUN_API_TESTS=1 node --test --test-concurrency=2 "tests/api/builder*.test.js"` — 24 passed, 0 failed. Each worker test uses its own port (18831–18836) and a temp persist directory, and stops the worker. Those ports were closed after the run.

Grep for the old sentences under `apps/`, `packages/`, `tests/`, and `directives/contracts/`: no remaining `bodies go with this star`, `The hex changed.`, `The sector changed.`, `Unknown field `, `Invalid hex key.`, `Invalid sector.`, `A world orbits a star.`, `That system cannot be stored.`, or the other replaced sentences. One hit is not a Builder sentence: `apps/web/src/orbit/course.ts` says a place on a route "cannot be edited."

## Contract published
contracts/b_builder.md (quoted sentences only; the file already had other uncommitted contract text)

## Needs from others
- Lane B: three places still tell fields or conflicts apart by the sentence. A code would let them stop.
  1. `draft.ts` `fieldIdIn`. A bare 400 carries no field id. The client uses the label only when one field on the form has it. Name, Notes, Order, and Spectral class repeat, so those stay unnamed.
  2. `store.ts` adopts `details.current` only when the message is `That slot is in use. Choose another slot.` Other 409s also send `details.current`.
  3. `store.ts` `blank` throws its own copy of `This hex changed. Reload it, then try again.` when `outcome.status === 'conflict'`. The person does not see the server's sentence on that path.
- Lane D: two screens keep their own words, on purpose. `hand_acts.ts` says `Add a star first.` The server says `A world needs a star.` `sector_acts.ts` says `That sector slot is in use. Select an empty sector slot.` before it calls the server. The server says `That slot is in use. Choose another slot.`

## Questions for Johnny
none
