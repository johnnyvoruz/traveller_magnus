# D hand_designer_2 report
Prompt: prompts/d_hand_designer_2.md
Status: done (parts 1, 3 and 4 built; part 2 design only, as the 15:40 addition says)

Design note: findings/builder_system_design.md.
- §19 and §20 were already taken, so the copy table is **§21** and the picker is **§22**.

Shots, in findings/ui_design_shots/:
- `kb6_*` are the mockups;
- `kb6_built_*` are from the browser pass.

Scripts:
- findings/builder_mockup_src/build6.mjs (the mockups);
- findings/builder_pass_src/o1.mjs and o2.mjs (the browser pass).

## Part 1: copy
- 118 strings across 19 files in `workspace/build/` are rewritten to the Google style guide. §21 has every string, before and after, in a table.
- A helper agent did the rewrite under my brief: strings and tests only, no logic.
- Choices to check, all in §21:
  - "Make" is now "Create", and "slot" is now "sector slot".
  - "my map" is now "your map".
  - "Given to X" is now "Now orbits X".
  - The generate settings labels are now in sentence case, for example "Starport max" and "TL mod".
- One control still has different labels on different screens. These were left as they were:
  - "Remove" on the bar, "Remove from your map" in the palette;
  - "Keep" on the bar, "Keep the draft" in the palette;
  - the add buttons say "Star", the palette says "Add a star".
- Server messages that break the style rules are listed under Needs. They are not reworded.

## Part 2: roll button (design only)
- Mockup `kb6_roll`: an icon button at the right of the Profile heading, named "Roll profile".
- Three states are drawn: at rest, busy, and rolled (the filled cells marked, counted as 1 change).
- Nothing is wired and no button ships.

## Part 3: orbit picker
- New files:
  - `orbit_pick.ts`: the units, the scale, the rings and Place; pure.
  - `OrbitPicker.vue`: the modal.
  - Wiring in `HandDesigner.vue`: "Pick orbit" under the orbit box, which stays typeable.
  - Palette command `build-body-orbit`, "Pick the orbit of the selected body".
- Units, as the contract says:
  - MgT2E: the orbit number. Place writes `.orbit.id` and its AU (`mgt2eOrbitToAu`) together.
  - Any other edition: `.orbit.au` only, with no orbit number shown.
  - A moon: `.orbit.pd`, in planetary diameters.
- Browser pass on an MgT2E system switched to hand (1214, Okyrhoe):
  - **A world, by pointer:** a press at a point pinned "Orbit 2.7 · 0.91 AU". Place added 2 changes to the draft.
  - **A moon, by keyboard:** four arrow presses and a Shift+arrow gave 47.9 planetary diameters. Enter placed it.
  - **The companion star, by pointer:** Orbit 1.6 · 0.58 AU. The world placed a moment earlier was drawn as a named ring.
  - **Escape** on a second opening: the picker closed and the draft was unchanged.
  - **Keep, then the stored form:** `star.1.orbit.id=1.6 star.1.orbit.au=0.58 body.0.orbit.id=2.7 body.0.orbit.au=0.91 body.1.moon.0.orbit.pd=47.9`.
  - **Orbit view:** the companion is drawn at its new orbit. The system list reads "World · Orbit 2.7 · 0.91 AU" and "Satellite · 47.9 PD" (`kb6_built_orbit_view.png`).
  - **Frames:** a 60-step pointer sweep over the picture gave 227 frames, the worst 8.4 ms, none at or over 50 ms.
  - **Spans:** shots at column, half, full and 520 px. At 520 px the parents wrap above the picture, and the read-out sits above Cancel and Place.
  - Console: no error.
- Not done in the browser: Tab through the parent choices was not driven. It is plain buttons in the tab order, then the picture.

## Part 4: belts
- The server's belt form has no year field. In the browser, a belt added in the draft listed "Orbit, Pick orbit, AU, Eccentricity" and no period.
- Build had no line of its own about a belt's year, so there was nothing to remove.
- No profile cell is locked; the contract fixes none.

## Changed files (mine)
- apps/web/src/workspace/build/orbit_pick.ts (new): modes, scale, rings, `placeOrbit`, `canPickSelected`.
- apps/web/src/workspace/build/OrbitPicker.vue (new): the modal and the SVG picture.
- apps/web/src/workspace/build/HandDesigner.vue: the "Pick orbit" row, and the picker mounted.
- apps/web/src/workspace/build/commands.ts: the `build-body-orbit` command.
- tests/web/build_orbit_picker.test.js (new, 6 tests): units, stored values, what Place writes, the scale, parents and rings, and Place on the server's own form code.
- findings/builder_mockup_src/build6.mjs, index6.html; findings/builder_system_design.md §21 (the helper's table) and §22.
- The helper's copy edits are listed in §21, with the tests it updated to the new strings: build_editor, build_grow, build_hand, build_pointer, build_screens, build_sectors, and a label in contrast.test.js.

## Gates
npm test:      pass (tests 1355, pass 1340, fail 0, skipped 15)
npm run check: pass (manifesto: clean)
typecheck:     pass
npm run build: pass. The index chunk is 262.25 kB against a 450 kB pin. It was 324.69 kB at my last report; the drop comes from outside these files.
fourth gate:   pass. Own API (8797), Vite (5197) and Edge (9397), all stopped after; ports free.

## Contract published
none

## Needs from others
- **Lane B: "Design by hand" drops every orbit.** A generated MgT2E system switched to hand had no `orbitId`, `au` or `pd` on any body. The picker listed all 5 worlds as "no orbit yet", although the generated tree has them. The switch should copy `orbitId`, `au`, `eccentricity` and `pd` (and a companion's `orbitId`) into the hand document.
- **Lane B: server messages that break the style rules.** The helper's full list, with lines, is below. In short:
  - raw ids in `<id> cannot hold that.` and `Unknown field <id>.`;
  - narration in "4 bodies go with this star.";
  - no next step in "That slot is in use." and "The hex changed.";
  - legacy controls named in the AoW and Hill Sphere messages (`packages/generation/src/form.ts` :646, :655, :698);
  - raw JSON at form.ts :1242.

  The full list:
  - packages/generation/src/hand.ts:
    - 274 (bodies go with this star);
    - 136, 141, 157, 169, 181, 285, 329, 339 (cannot hold that);
    - 232, 243 (add cannot hold that);
    - 159 (already in this system);
    - 242 ("A world needs a star.");
    - 268, 292, 296, 298, 306, 315, 318, 325 (Unknown field);
    - 417, 420, 423, 424, 427, 430, 435, 439, 447, 452.
  - packages/generation/src/form.ts: 227, 388, 393, 398, 646, 655, 698, 815, 974, 1207, 1208, 1242.
  - apps/api/src/universe/sectors.ts: 95, 108, 110, 327, 338, 341, 346, 377, 379, 392, 444.
  - apps/api/src/universe/hexes.ts: 185, 329, 331.
- **Orchestrator: the lightbox's frame styles.** They live in `workspace/Lightbox.vue` and load only with the Campaign panel. The picker carries its own copy, under the same pattern. Moving them to `design/base.css` would let every modal share one frame.

## Questions for Johnny
1. On a system by hand with no edition (a blank), should the picker work in AU? Suggested: yes, as built. The contract applies the MgT2E orbit table only to an MgT2E system, and a blank names none. Otherwise a new blank would need to name its edition.
2. On MgT2E, Place writes both the orbit number and its AU, so the two never disagree. Typing into one box by hand does not update the other. Should the orbit number box fill AU as you type? Suggested: yes, in a later pass, with the same conversion the picker uses.
3. Stars from a generated system have no name, so the picker reads "around No name". Should an unnamed star show its spectral class (for example "K1 V") in the picker and the "Orbits" lists? Suggested: yes, if the form gives the class. It needs Lane B to put it on the form.
