Found: a fresh start for this prompt. Its Progress was empty, no report existed, and nothing in my files was half-done for it.
Finished: items 1 to 6, the gates and the browser pass.
Backed out: nothing.

# D menu_and_job_error report
Prompt: prompts/d_menu_and_job_error.md
Status: done. Item 1 (the push hold) is fixed and seen in the browser. Item 4 is built and unit-tested on my side, and needs two lines in Lane A's store before the sentence reaches the screen.

## Changed files
- apps/web/src/workspace/AccountMenu.vue: the backdrop and the pop-up are teleported to `body`; the pop-up is `position: fixed`; `body:has(.rail.is-expanded) .account-pop` carries the expanded rail's width over. Item 6: the line under the switch.
- apps/web/src/workspace/public_games.ts: `PUBLIC_GAMES_NO_PLACE`, `partyOnChart`.
- apps/web/src/views/MapView.vue: `ownName` is gone from the `watchPublicGames` call (Lane A's change had landed: the field is optional and not read).
- apps/web/src/workspace/build/one_sector.ts (new): the two sentences, `sectorsOf`, `oneSectorSay`.
- apps/web/src/workspace/build/acts.ts, grow_acts.ts: nothing is sent for two sectors; a job that failed whole says its sentence. `oneSectorFor(keys)` in acts.ts.
- apps/web/src/workspace/build/density_ask.ts, commands.ts: the density prompt is not opened, and Generate and "Generate with…" are off (G, Shift+G, the palette, the right-click lines); the right-click Generate line carries the sentence.
- apps/web/src/workspace/build/BuildPane.vue: Generate and "Change…" are off for two sectors, with the sentence under the button; no sector names are asked for two slots.
- apps/web/src/workspace/build/state.ts, seam.ts, job_toast.ts: `jobError`, `errorOf`, `JobProgress.error`; `jobToast` and `jobLine` say the sentence; the label "Full system, from the star outward".
- tests/web/menu_and_job_error.test.js (new, 6 tests); tests/web/build_grow.test.js (the two-slot test now expects nothing sent; a one-slot Undo and Restore test and a failed-job test added); tests/web/packages_entry.test.js (reads the menu from the render's teleports); tests/web/build_screens.test.js (the label); tests/web/public_games_wire.test.js (no `ownName`).
- findings/builder_system_design.md §34; shots `findings/ui_design_shots/kb20_*`.

### What was built, item by item

1. **The account menu.** It is on the body, above any panel. Its place is unchanged: at the rail's foot, clear of the rail, and it moves right when the rail is expanded.
2. **`ownName`: dropped.** Lane A's `map/public_games.ts` now has it optional and unread.
3. **One sector per request.** The rule is judged on the hexes that would be sent (the empty ones, plus the filled ones when they are regenerated too), so a box across a border whose empty hexes are all on one side still goes.
   - A selection in two sectors: Generate is off, and under it: "You can generate in one sector at a time. Select hexes inside one sector, and then select Generate."
   - Two empty slots: "Create 2 sectors and generate…" is off, no names are asked for, and under it: "You can create one sector at a time. Select hexes inside one empty sector slot, and then generate. Repeat for each slot."
   - The right-click menu: "Generate…" and "Generate with…" are off, and the Generate line carries the same sentence.
   - "Regenerate the systems…" still opens the full sheet (it has other uses); its Generate sends nothing for two sectors and the pane says the sentence once.
   - A sector or a subsector opened by its address is unchanged.
4. **A failed job's sentence.** When a job's progress carries `error` and no failed hex, the toast is that sentence, the running line is that sentence, and it stays beside Generate (`build.error`) after the toast has gone. Failed hexes are counted as before.
5. **The label.** "Full system, from the star outward"; the line under Generate reads "Mongoose 2nd Ed (MgT2E) · full system, from the star outward". The small "top down" beside the engine's name in the Generate sheet is unchanged (the prompt named the label only).
6. **The no-place line.** Under the switch's sentence, in the attention colour, while the switch is on and the party has no hex the server would publish (no ship, a ship that is nowhere, or a hex in a sector of the referee's own): "Your party isn't on the chart yet. Choose the ship and set where it is."

## Gates
npm test:      1 fail, not in my files (1648 tests, 1620 pass, 27 skipped).
- ✖ `tests/golden/esm.test.js`: "esm profile_regina matches legacy fixture" (Lane C's held fixture, on the board).
npm run check: pass ("manifesto: clean")
typecheck:     pass (`tsc --noEmit -p apps/api`; the web's `vue-tsc -b` passes inside the build)
npm run build: pass. `index-DhYJ9-Zi.js` 176.30 kB, gzip 59.22 kB (179.75 kB at my last report; Lane A's feed change accounts for most of the drop).
fourth gate:   pass. Headless Edge, my own API on 8794 with a private state, Vite on 5194 with its own cache, DevTools on 9394. All stopped after; the ports are free.

Seen in the browser:
- **Item 1.** Over the Campaign panel, the dossier and Build, each at column, half and full (1600 × 1000) and at 520 × 900: the menu is the top element at five points across it, inside the window, and focus is inside it. Opened by pointer and by Enter on the rail's button; the arrow keys walk it; Esc closes it and focus is on the rail's button each time. A click outside closes it. With the rail expanded the menu starts 10 px right of the rail (206 against 196). Typing "sgb" in the Rename field goes into the field and reaches no map key. Signed out, the sign-in card shows over the dossier the same way.
- **Item 3.** A Shift+drag across the Spinward Marches and Deneb border (22 hexes, 18 empty): the pane and the menu as above; a click on the button, G and Shift+G do nothing; the full sheet's Generate is refused in place. A box on one side: Generate is on. Subsector D by its address: Generate is on. Two empty slots (30,30 and 31,30): as above, and Enter in a name box did nothing before I removed the boxes. One slot: "Create the sector and generate…" is on with one name box. At 520 px the sentence fits with no sideways scroll. Every `POST …/generate` the page made was counted for the whole run: none.
- **Item 6.** The account with a ship at Regina, switch on: no line. The account with no ship, switch on: the line; switch off: gone.
- No console error or exception in any run.

Not exercised in the browser: **item 4.** The server gives no way to fail a job by hand with a sentence (the route refuses two sectors before a job exists), and Lane A's store does not hand the sentence on yet. Unit tests cover the toast, the line, and the grow act's finish with a stub store.

## Contract published
none

## Needs from others
- Lane A, `apps/web/src/builder/` (item 4 reaches the screen only with this): in `types.ts`, add `error?: string;` to `JobProgress`; in `store.ts` `progressOf`, add `...(job.error ? { error: job.error } : {})` to the returned object. My screens already read it.
- Lane C: the red `profile_regina` test.
- Lane E: nothing new. The `signInFrom` line in `shell/Rail.vue` is theirs this turn; I did not check it.

## Questions for Johnny
1. When hexes in two sectors are selected, Build now says "You can generate in one sector at a time. Select hexes inside one sector, and then select Generate." and, for two empty slots, "You can create one sector at a time. Select hexes inside one empty sector slot, and then generate. Repeat for each slot." Recommended answer: keep both as written. The other choice is the server's own sentence, "The limit is one sector per request.", which does not say what to do. Are these the words you want?
2. In the Generate sheet, the small note beside the Mongoose engine still reads "top down", while the method's label now reads "Full system, from the star outward". Recommended answer: change the small note to "from the star outward" too, so the sheet says it one way. The other choice is to leave it. Do you want it changed?
