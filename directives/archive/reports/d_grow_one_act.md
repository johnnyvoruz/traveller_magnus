# D grow_one_act report
Prompt: prompts/d_grow_one_act.md
Status: done

Built on Lane A's `generateGrowing` and grow undo (findings/builder_grow_ready.md) and B's
contract (contracts/b_builder.md, "Make sectors and generate, as one Undo"). This replaces the
blocked report of earlier today. Shots `kb5_grow_*` and `kb5_menu_*` are in
findings/ui_design_shots/. The scripts are findings/builder_pass_src/g0.mjs, g2.mjs and g3.mjs.
Design note: findings/builder_system_design.md §20.

## What must be true: how each holds
1. **One request, one toast, one Undo.**
   - In the browser, each of these made exactly one `POST /generate` (from my API's log) and
     showed one toast with Undo:
     - one slot, 4 hexes (202);
     - one slot, 1 hex (201, the inline act);
     - two slots, 4 hexes;
     - across the edge of an existing sector into an empty slot, 2 + 2 hexes.
   - The toast reads "Generated 4 systems in 2 new sectors: Ostra, Pell."
2. **Undo is one request.**
   - Each Undo above was one `POST /sectors/undo-generate` (200), and the sectors were gone.
   - Across the edge: the home sector went from 83 to 85 rows, and back to 83 after the Undo.
   - The two-call `takeBack`, `grown.undo` and "Undo stopped part way" are deleted.
3. **Undo while running.**
   - 320 hexes in a new slot. The job bar shows Undo beside Stop once the server has answered
     ("Generating 320 hexes 0 of 320 Undo Stop").
   - Pressing it made one `POST /sectors/undo-generate` (447 ms, the job running). The bar closed,
     the sector was gone, and the toast read "Undone: removed the new sector Rath and every
     system generated with it." No "Generated" toast followed.
4. **Restore after Undo: built, but not shown yet.**
   - After an Undo, the screen offers Restore whenever the store's undo answers with a token.
     Restore then runs the undo of the undo through that token. This is unit-tested
     (`build_grow.test.js`).
   - In the browser no Restore shows, because `builder/screen.ts` `asBuildStore.undo` still
     returns nothing (A's ready note says so). Lane A's one line below turns it on.
5. **Server errors in their own words.**
   - In the browser: "That slot holds a charted sector." and "That slot is in use." showed
     beside the name boxes.
   - The selection and the typed name stayed, and no toast appeared (shot `kb5_grow_refused.png`).
   - A refused Undo or Restore shows the server's message as the toast (unit test).
6. **The "Checking…" line** (board, Decisions, 2026-10-11: yes).
   - In the browser, the first frame was "Edit @588 | Checking… (muted) @623 | Remove @669".
     After the answer it was "Edit @588 | Design by hand… @623 | Remove @669", so Remove did not
     move.
   - To keep the line one height in all three cases, the hand-system "Generate a system" item
     lost its second line ("A preview first; keeping it replaces…"). The preview already says
     "Keeping it replaces the system you designed by hand."
   - The `kb5_menu_checking.png` image shows the second state: the screenshot landed after the
     answer. The text log has the first frame.

## Changed files
- apps/web/src/workspace/build/grow_acts.ts:
  - one request through `store.generateGrowing`, and one Undo;
  - `growUi.undoRunning` for Undo while the job runs;
  - Restore when given a token;
  - refusals shown in the server's words;
  - new `screenProgress`, `madeWords`, `sectorsSaid`.
- apps/web/src/workspace/build/acts.ts: `generateMany` lost its `grown` path and "Undo stopped part way"; new `holdJob` lets Stop and X reach the grow job.
- apps/web/src/workspace/build/seam.ts:
  - `BuildStore.generateGrowing`, with `GrowBody`, `GrowProgress` and `GrowHandle`;
  - `undo` may answer with a Restore token (`Promise<UndoToken | null | void>`), so A's current wrapper still fits.
- apps/web/src/workspace/build/BuildPane.vue: Undo in the job bar while a grow job runs; the fine print says Undo works while generating.
- apps/web/src/workspace/build/commands.ts: the muted "Checking…" line; the hand-system Generate item is one line.
- tests/web/build_grow.test.js (new, 6 tests): one request per act, two slots and across an edge, Undo and Restore, no Restore without a token, Undo while running, refusals.
- tests/web/build_hand.test.js: the cold-menu test expects "Checking…" and a one-line Generate.
- findings/builder_system_design.md §20; findings/builder_pass_src/g0.mjs, g2.mjs, g3.mjs.
- Not touched: `builder/`, `apps/api`, `packages/`, the shared files, MapView.vue.

## Gates
npm test:      pass (tests 1337, pass 1322, fail 0, skipped 15)
npm run check: pass (manifesto: clean)
typecheck:     pass
npm run build: pass (index chunk 324.69 kB; pin 450 kB)
fourth gate:   pass. Browser pass on my own API (8797, own state directory), Vite (5197) and headless Edge (9397), all stopped after; ports free. The request counts come from the API's log.

## Contract published
none

## Needs from others
- Lane A: in `builder/screen.ts`, change `undo: async (token) => { await builder.undo(token); }` to `undo: (token) => builder.undo(token)`. The seam already accepts it. Restore then shows in the toast after a grow Undo, with no change on D's side.

## Left in my own test state (not product)
- An own sector "Twice" at slot (-6,-4) of the dev universe in my state directory. The first pass made it through the inline act, as a test that a refused slot is reported. Harmless; local only.

## Questions for Johnny
none
