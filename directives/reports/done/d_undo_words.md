# D undo_words report
Prompt: prompts/d_undo_words.md
Status: partial. Part 1 is built and passed in the browser. Parts 2 to 4 weren't started because their files weren't on disk:
- part 2: `directives/reports/a_form_followups.md` (or its copy in `reports/done/`);
- part 3: `b_generate_density` (and `findings/builder_density_ready.md` still says density isn't on the store's call);
- part 4: `b_generate_cap`.

## Changed files
- `apps/web/src/workspace/build/undo_words.ts` (new): reads what `undo` answers and says it.
  - **Nothing** (`null`): nothing more is said.
  - **`message` set:** the server's sentence, with Undo offered again.
  - **`left` with no message:** one toast naming the hexes, capped at four with "and K more". No Undo, since the token is spent. The left hexes are marked on the map while it shows.
  - **A failure:** said in the store's words.
  - **A report vs a Restore token:** told apart by `left`.
- `apps/web/src/workspace/build/seam.ts`: `UndoOutcome`; `undo` may return it.
- `apps/web/src/workspace/build/acts.ts`: `offerUndo` goes through `runUndo` (generate, keep, a job, remove, restore).
- `apps/web/src/workspace/build/edit.ts`: the draft's Keep and Blank system Undo toasts go through it too.
- `apps/web/src/workspace/build/grow_acts.ts`: `takeBack` and `putBack` say a report as a report; only a token without `left` becomes Restore.
- `apps/web/src/workspace/build/BuildMarks.vue`: `build-mark-left`, amber, for the hexes an Undo left.
- Tests:
  - `tests/web/build_undo_words.test.js` (new, 7): lists, sentences, the report test, refusal, partial, nothing, failure;
  - `tests/web/build_grow.test.js` (+1: a grow Undo that left hexes offers no Restore).
- `findings/builder_system_design.md` §27, with its strings.
- Shots `findings/ui_design_shots/kb10_*`; pass scripts `findings/builder_pass_src/udlib.mjs`, `ud4.mjs`, `ud5.mjs`.

## Gates
npm test:      pass. 1443 tests, 1426 pass, 0 fail (Lane C's surface tests are green now).
npm run check: pass (manifesto: clean)
typecheck:     pass. `npm run build` passes (index 161.13 kB).
fourth gate:   pass. Production bundle (`vite preview` through my own config and dependency cache), my API on 8797 with its own state directory, CDP 9397, inspector 9247; all stopped after.

**Lane A's sequence 1 (one hex):**
- Steps: an empty hex, Generate, Keep ("Generated Kiyohira."), then Edit, a new mainworld name, Keep ("Kept your changes to Kiyohira."), then Undo on the generate toast (pointer).
- Result: "This hex changed. Reload it, then try again." with Undo.
- That Undo pressed by keyboard (focused, then Enter): the same sentence again. The system stays as kept (Kiyohira, with the later name).
- Shots at half, column, full and 520 px: `kb10_refused_*`.

**Lane A's sequence 2 (a job):**
- Steps: Generate subsector H (80 systems), Remove one of them (2511, Josefina), then Undo the job (pointer).
- Result: "Undo put back 79 systems. 1 system had changed, so it was left as it is: 2511." with no Undo.
- Hex 2511 was marked in amber on the map, and the mark cleared when the toast left.
- Shots at half, column, full and 520 px: `kb10_partial_*`.
- That toast has no button, so there was nothing to press by keyboard. Keyboard was covered in sequence 1.
- The left hex is named by its number because it holds no system after the Remove. A hex that was renamed would be named by its new name.

**Found on the way, not mine:** keeping a new name on a freshly generated system fails on the server on most systems.
- Seven of eight hexes in a row answered "w.solarDayHours.toFixed is not a function", shown twice at the top of the editor.
- Repro: my universe, an empty hex in Hollow Reach Two, Generate, Keep, Edit, type a new mainworld name, Keep.
- This is why sequence 2 uses Remove as the later change, not a rename.

## Contract published
none

## Needs from others
- **Lane B,** possibly with the engine: Keep on a generated system's draft throws "w.solarDayHours.toFixed is not a function" on most fresh MgT2E systems (repro above). It blocks editing any newly generated system.
- **Lane A,** the form follow-ups report for part 2. Lane B, `b_generate_density` and `b_generate_cap`, then Lane A's notes, for parts 3 and 4.

## Questions for Johnny
1. When a job's Undo leaves a hex because it was removed after the job, the toast names it by number ("left as it is: 2511"), since it holds no system any more. Is that clear enough? I suggest yes: the amber mark on the map shows which hex it is while the toast is up. The alternative is to say "2511, which you removed", which needs the hex's last name kept somewhere.
2. A refused one-hex Undo says the server's sentence, "This hex changed. Reload it, then try again.", and offers Undo again. Pressing Undo again gives the same sentence until the later change is undone. Should the offer stay? I suggest yes, as Lane A recommends: the token is still good, and undoing the later change first (its own toast) lets this Undo work.
