Found: an old one-hex Undo sent the live rev and wiped a later Keep, and a job Undo hid `{ restored, conflicts }` behind `null`.
Finished: the store sends the rev the act wrote, refuses that Undo with the server sentence, and returns the job's count and the hex keys it left.
Backed out: nothing. Density was not started. `directives/reports/b_generate_density.md` is not written, and there is no copy under `reports/done/`.

# Lane A undo faults report
Prompt: prompts/a_undo_faults.md
Status: done

## Changed files
- apps/web/src/builder/types.ts: `UndoOutcome` is `{ id, restored, left, message }`.
- apps/web/src/builder/index.ts: exports `UndoOutcome`.
- apps/web/src/builder/store.ts: a one-hex Undo posts `baseRev` of the rev that act wrote. A 409 `hex_changed` keeps the token and returns the server sentence, with `restored` 0 and the hex key in `left`. A job Undo with `conflicts` returns `restored` and those keys, `message` empty, and drops the token. `details.code` `slot_in_use` and `hex_changed` replace the two sentence matches. `blank` throws the server sentence on a conflict.
- apps/web/src/builder/draft.ts: a refused field is `details.code` `field` (`FieldRefusalDetails`). The sentence is still the message text.
- tests/web/builder_store.test.js: the stale generate Undo posts `{ toRev: 0, baseRev: 1 }` and leaves the later name; a job Undo with one conflict returns the count and the key, and a second Undo is `null`. The slot fake sends `slot_in_use`.
- tests/web/builder_draft.test.js: the refused draft fake sends `{ code: 'field', id: 'profile.st' }`.
- findings/builder_undo_faults.md: no contract change from B; the words and the state Lane D should show.

## Gates
npm test: fail. 1404 passed, 4 failed, 16 skipped. The two new store tests passed. The four failures are Lane C surface files. They were not edited here.

- tests/web/surface_enhanced_map.test.js: a row of the sheet is the latitude the vanilla projection gives it (255 !== 253)
- tests/web/surface_gl.test.js: orbit disc shaders match js/planet_gl.js
- tests/web/surface_oracle.test.js: surface oracle is deterministic and matches fixtures (regina-w0 differs)
- tests/web/surface_service.test.js: enhanced is its own sheet, and vanilla is the same before and after it

npm run check: pass (`manifesto: clean`)
typecheck: pass (`tsc --noEmit -p apps/api`)
npm run build: pass (`vue-tsc -b && vite build`)
fourth gate: pass. Private wrangler on port 18842, inspector 19842, its own persist directory. `stopDev` ran. After the run the only sockets on 18842 were TIME_WAIT. Nothing was listening.

Same sequence both times. Own map, truthVersion null, MgT2E top-down, roll 0, filledToo. Generate `blank/1910`, Keep field `name` to `F later edit`, Undo the generate token. Then generate `blank/0101` and `blank/0102`, Keep `name` on `blank/0101` to `F edit survives`, Undo the job.

Before, universe `01M4PQY8PX137RJJRZFSKN8PGP`, against the old store:

- POST generate `blank/1910` → 200 `{ rows: [{ hexKey: "blank/1910", rev: 1, name: "Weinberg" }] }`. Store: rev 1, name Weinberg, undo `undo-1`.
- POST keep hash `0f363dfbbbf2fb83f6fda2783da072b037c45e5d7164b9de8594416346f6523b` baseRev 1 changes `[{ id: "name", value: "F later edit" }]` → 200 rev 2, name `F later edit`. Store undo `undo-2`.
- POST revert sent `{ toRev: 0, baseRev: 2 }` → 200 rev 0. Store returned `null`. The row was gone.
- POST generate `blank/0101`, `blank/0102` → 202 job `01M4PQY8ZHXBNG11H5ZQ2A196P`. Store job done, undo `undo-3`.
- POST keep `blank/0101` hash `b6f9af0c9070511b2a06d668aec445719d9f2647d300f4930a364d27220947fc` baseRev 1, name `F edit survives` → 200 rev 2.
- POST `jobs/01M4PQY8ZHXBNG11H5ZQ2A196P/undo` `{}` → 200 `{ restored: 1, conflicts: ["blank/0101"] }`. Store returned `null`. After reload, `blank/0101` was still rev 2 `F edit survives`. `blank/0102` was gone.

After, universe `01M4PR5NKQJ6A1K29TXAYZQX3J`, against this store:

- POST generate `blank/1910` → 200 rev 1, name Weinberg. Store undo `undo-1`.
- POST keep the same hash, baseRev 1, name `F later edit` → 200 rev 2.
- POST revert sent `{ toRev: 0, baseRev: 1 }` → 409 `{ message: "This hex changed. Reload it, then try again.", code: "hex_changed" }`. Store returned `{ id: "undo-1", restored: 0, left: ["blank/1910"], message: "This hex changed. Reload it, then try again." }`. The row stayed rev 2, name `F later edit`.
- POST generate the two hexes → 202 job `01M4PR5NW7YVXCV5EMZPHVF96Z`.
- POST keep `blank/0101` the same hash, baseRev 1, name `F edit survives` → 200 rev 2.
- POST that job's undo `{}` → 200 `{ restored: 1, conflicts: ["blank/0101"] }`. Store returned `{ id: "undo-3", restored: 1, left: ["blank/0101"], message: "" }`. `blank/0101` stayed rev 2 `F edit survives`. `blank/0102` was gone.

Whose fault. One hex: the store. Contract: Undo is `POST .../revert` `{ toRev: <rev before>, baseRev: <rev now> }`, and "A stale `baseRev` writes nothing." The server wiped the name only because it was given the Keep's rev. Many hexes: the store. Contract: "A hex whose rev is no longer the rev the job wrote is listed in `conflicts` and left alone." The server left `blank/0101`. The store dropped that answer. The screen says nothing because `acts.ts` ignores the return. That is Lane D, once the store hands over the report.

## Contract published
none

## Needs from others
- Lane B: none. The undo routes already refuse a stale `baseRev` and already list a moved job hex in `conflicts`.
- Lane D: read `UndoOutcome` in `offerUndo`. Show the server sentence when `message` is set. When `message` is empty and `left` is not, show once `Undo put back N systems. M had changed, so they were left as they are: <keys>.` The job token is spent. The one-hex refusal token stays. A return with `left` is not a Restore token. The words are in `findings/builder_undo_faults.md`.

## Questions for Johnny
none
