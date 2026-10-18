# D step3_close_2 report
Prompt: prompts/d_step3_close_2.md
Status: done

Built on Agent A's handle (`add`, `unset`, `blank(hexKey)`; findings/builder_handle_ready.md) and B's contract (contracts/b_builder.md). Shots `kb3_close2_*` in findings/ui_design_shots/; pass script findings/builder_pass_src/r1.mjs.

## What was built
1. **Adds and removes wait for Keep** (ruling 1).
   - The screen names a new body as the server would (`s<n>`, `b<n>`, never an id in use or pending), adds it to the draft, and sets its kind and parent in the same draft. A just-added body can be named at once.
   - The per-add and per-remove toasts are gone. The bar counts each added body as one change, and what is typed into a body just added counts with it. A row reads "New" until it is kept.
   - Discard drops everything; one Keep is one revision. `keepStay` is removed.
2. **A star can be removed with what orbits it** (ruling 3). The star is no longer greyed.
   - The remove enters the draft. When it takes others with it (a star with worlds or paired stars, or a world with moons), `DesignAsk.vue` asks first: "All N bodies orbiting this star will also be removed".
   - N is counted from the server's draft answer: the bodies that answer dropped, less the one named. For a world the server sends no sentence, so its count comes from the answer's list.
   - Cancel calls `unset('<id>.remove')` and everything returns. Remove leaves it in the draft. Keep is held while the ask is open.
   - The server's own "N bodies go with this star." line is not repeated at the top of the editor.
3. **Blank sends no edition.** `BlankOpener` and `openBlank` take the hex alone; the 'MgT2E' label is gone from `BuildPane` and `commands`.
4. **The right-click menu and the bar's More menu** show neither "Design by hand…" nor "Generate" until the server has said which the system is (`handMode`: hand, generated, or null).
5. **The pane covering a centred hex** was already built under d_select_hexes (MapView `area`, `aim`, `clearPane`; findings §18 item 6), all in D's lines, so nothing new here. It was checked then: a hex under the pane (x 114, pane edge 598) ended at x 663.

## Changed files (this pass)
- apps/web/src/workspace/build/hand.ts: `removeChanges` sends one `.remove`; `removeTakesOthers`, `removeWords` (no client numbers), `removedWith` (the server's count), `nextId`, `formIds`; `handChangeCount` counts added bodies; `handUi.removing`. `removeWhy` is removed.
- apps/web/src/workspace/build/hand_acts.ts: `addBody` and `removeBody` work in the draft; new `confirmRemove`, `cancelRemove`, `handMode`. `isHandHex` now reads `handMode`.
- apps/web/src/workspace/build/edit.ts: `edit.added`, `addField`, `unsetField`; `keepStay` is removed; `BlankOpener` and `openBlank` drop the edition.
- apps/web/src/workspace/build/DesignAsk.vue: a `remove` mode alongside "Design by hand".
- apps/web/src/workspace/build/HandDesigner.vue: the ask above the rows; "New" on added rows; a just-added body stays selected; new words (nothing is stored at once).
- apps/web/src/workspace/build/BuildBar.vue: change count includes adds; Keep held while the ask is open; More waits for `handMode`.
- apps/web/src/workspace/build/commands.ts: menu waits for `handMode`; Keep held while asking; Blank sends the hex alone.
- apps/web/src/workspace/build/BuildPane.vue: Blank sends the hex alone.
- apps/web/src/workspace/build/SystemEditor.vue: one line; a remove's server message is not repeated at the top by hand.
- tests/web/build_hand.test.js: the adds and removes tests rewritten (draft, ask, Cancel, one Keep); new count, server-count and naming tests. The stub handle now behaves like A's (`add` appends, `unset`).
- tests/web/build_editor.test.js: the blank test expects the hex alone.
- Shared files: none touched in this pass. DossierPanel.vue lines 23, 136 and 523 are from earlier passes (listed in reports/d_select_hexes.md).

## Gates
npm test:      pass (tests 1311, pass 1297, fail 0, skipped 14)
npm run check: FAIL, 2 violations, neither mine: `apps/web/src/workspace/journal/JournalBody.vue: window.` (line 106) and `getElementById` (line 129). That file is lane E's, modified 19:49 with the new mention files. Not touched.
typecheck:     pass
npm run build: pass (index chunk 319.40 kB; pin 450 kB)

## Browser pass (own API 8797, Vite 5197, headless Edge, signed in as dev-admin)
- **Blank** on 2021: the stored form reads `mode hand, edition absent`. The request body could not be read in the page, because the store holds its own fetch; what the server stored shows what it was sent.
- **Adds, then Discard:** two stars, three worlds (one a gas giant), two moons, two just-added bodies named (Vell, Ostra). The bar read "7 changes" and the server stayed at rev 1. Discard asked, then dropped them all; still rev 1.
- **Adds, then Keep:** the same again and Keep: rev 2, one revision. Reload: all seven bodies and both names are there.
- **Remove the star Vell** (two worlds and two moons under it): the ask read "All 4 bodies orbiting this star will also be removed", with Keep held. Cancel brought all seven back with no change counted. Again, then Remove: one change, server still rev 2. Keep: rev 3. Undo: rev 4, all seven back. The case with a paired star was proved in the unit test (count 6 and the server's sentence), not in the browser: my test system's second star was not paired.
- **Right-click on a cold hex:** first frame "Edit | Remove"; after the answer, "Edit | Design by hand… | Remove". The item never shows the wrong word.
- **Signed out:** no Build switch, no strip, no bar; pressing B does nothing.
- Console: no error.

## Contract published
none

## Needs from others
- Lane E: `workspace/journal/JournalBody.vue` fails `npm run check` (`window.`, `getElementById`), so the check gate is red for everyone until it is fixed.
- Lane B: still the one-act "make a sector and generate" (see reports/d_select_hexes.md).

## Questions for Johnny
1. When the right-click menu learns a system is generated, "Design by hand…" appears between Edit and Remove, so Remove moves down one line a moment after the menu opens. Should the menu reserve that line from the start? Suggested: yes, a muted placeholder line of the same height ("Checking…") that becomes the item, so nothing shifts.
