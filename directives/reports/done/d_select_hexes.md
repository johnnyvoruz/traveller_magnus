# D select_hexes report
Prompt: prompts/d_select_hexes.md
Status: done (one server need open: B's one-act "make a sector and generate")

Full write-up: `findings/builder_system_design.md` §18. Mockups `kb4_*`, built shots `kb4_built_*` in `findings/ui_design_shots/`.

## What was built
- A plain drag always moves the map. Shift+drag boxes hexes in, Alt+Shift+drag takes them out. With the Select hexes tool (`S`) a plain drag is the box. Space held, the middle button and two fingers still move the map. Escape turns the tool off before it clears the selection.
- Click selects one hex; Shift+click adds or takes one away.
- Hover outline: dashed for an empty hex, solid for a filled one, with a label (number and name) above the hex. Nothing on touch.
- Cursors: grabbing, add (+), take away (−), box, box take-away. The outline and label take the same tone (teal adds, red takes away).
- While a box is dragged, what it would add or take away is washed in, with a count beside the pointer.
- When the pane opens or widens, the map glides once, just far enough to clear the selection. Addresses are centred in the chart the pane leaves.
- Hexes in an empty slot can be picked like any others. The pane names the new sector and its subsector; "Make the sector and generate" is one act with one Undo (two calls behind it).
- The strip shows "N hexes · M empty" and Clear, and says when the 1,280 cap is hit.

## Changed files
- apps/web/src/workspace/build/pointer.ts: NEW. The pointer rules: gesture, click intent, cursor, hover tone, box result, visible area, glide, chip place.
- apps/web/src/workspace/build/grow_acts.ts: NEW. Make the sector(s), then generate; one Undo (generation undo, then sector delete).
- apps/web/src/workspace/build/marks.ts: hex and selection boxes, one-path drawing, the slot's ghost grid.
- apps/web/src/workspace/build/BuildMarks.vue: hover, ghost grid, box and preview set straight on their elements; chips; selection drawn as one path.
- apps/web/src/workspace/build/sectors.ts: slotGroups, slotKeysToSectors, subsectorWords.
- apps/web/src/workspace/build/acts.ts: BuildMap.select and selectOnMap; generateMany takes `grown` (toast names the new sectors; one Undo for both).
- apps/web/src/workspace/build/commands.ts: G on empty-slot hexes asks for the sector's name; no Blank system there.
- apps/web/src/workspace/build/BuildPane.vue: the empty-slot block (lead, name box per slot, subsector words); the act's label wraps at column width.
- apps/web/src/workspace/build/BuildStrip.vue: the tool said in words; tally, Clear, cap.
- apps/web/src/views/MapView.vue (D's Build wiring):
  - the box, hover and cursor handlers replace the old capture handlers; the click handler is its own function (`chartClick`);
  - sectorAt, sectorOf and names know empty slots; a hex in an empty slot loads with no index;
  - the visible area (`area`, `aim`, `clearPane`) is used by route aims, locate and setWidth;
  - Escape order (tool before selection); keyboard steps kept clear of the pane.
- apps/web/src/map/input.ts (map/, named in the prompt): optional `box` and `panning` hooks only. A's second-press code is unchanged.
- apps/web/src/design/tokens.css: four cursor tokens (`--cursor-add`, `--cursor-take`, `--cursor-box`, `--cursor-box-take`), inline SVG. No colour token.
- apps/web/src/dossier/DossierPanel.vue (SHARED, not named in this prompt; flagged on the board): line 136, `if (slot.value) return build.selection.length > 1 ? 'many' : 'slot';`, so hexes picked in an empty slot show as many hexes. This is the 19:08 change.
- apps/web/src/dossier/DossierPanel.vue lines 23 and 523: from the step 3 close before it (`isHandHex` import; the "Keeping it replaces the system you designed by hand" line in the preview note). Already reported in chat for that step; listed here so the board has them.
- tests/web/build_pointer.test.js: NEW, 12 tests (gestures, click intent, cursors, chip words, box, visible area, glide, chip place, marks, slot grouping).
- findings/ (git-ignored): §18 notes, build4.mjs and index4.html mockups, kb4_* shots, pass scripts in findings/builder_pass_src/.

## Gates
npm test:      pass (tests 1310, pass 1296, fail 0, skipped 14)
npm run check: pass (manifesto: clean)
typecheck:     pass
npm run build: pass (index chunk 319.56 kB, was 305.91 kB; pin 450 kB)

## Browser pass (own API 8797, Vite 5197, headless Edge, real pointer paths with modifiers)
All in §18's table. Main figures:
- Frames: hovering across a whole sector, worst 8.5 ms. Dragging a 409-hex box, worst 25 ms.
- Letting go of that box: worst 175 ms. A plain drag of the chart, which this pass did not change, measured the same in headless software rendering (worst 167 ms). Not measured on a real GPU.
- Glide: a far-left hex under the pane (x 114, pane edge 598) ended at x 663, once. Reduced motion stepped instead of gliding.
- Empty slot: "Test Reach" was made and 24 systems generated; one Undo removed both.
- Not exercised: signed out; a real GPU. Cursors can't be seen in headless shots, so they were read from `data-cursor`.

## Contract published
none

## Needs from others
- Lane B: a generate call that also makes the sectors (`makeSectors: [{ slot, name }]`), one job, one undo token for both. Today it is two calls, and the Undo is two calls (undo the generation, then delete the sector). If the second fails the screen says "Undo stopped part way".

## Questions for Johnny
1. Should the keyboard keep `U I O / N M ,` for the six neighbouring hexes, or move to the arrow keys? Suggested: keep them. Six directions don't fit four arrows, and the arrows move the map everywhere else.
2. In an empty slot, should Generate keep the systems straight away (as built), or make the sector first and then show the usual preview? Suggested: as built. A preview rolled before the sector exists would not be the system kept, and the alternative leaves an empty sector if the preview is discarded.
3. When the pane is widened to Half or Full, should the map glide again to keep the selection in view? Suggested: yes (as built), since widening is the referee's own act.
