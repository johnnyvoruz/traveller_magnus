# D hand_designer_3 report
Prompt: prompts/d_hand_designer_3.md
Status: done. One part depends on Lane A: a second roll in the same draft (see Needs).

The design note and the new strings are in findings/builder_system_design.md §23, which adds the strings to §21's table. Shots `kb7_*`; pass scripts findings/builder_pass_src/h3.mjs, h3b.mjs and h3c.mjs.

## First: the red test
`tests/web/build_hand.test.js:220` now expects `s1.classText` after the name. Done before anything else.

## What was built
1. **Roll profile** (palette command `build-body-roll`, and the icon button at the right of the Profile heading).
   - It sends `<bodyId>.profile.roll` through the handle's `rollAgain`, into the draft's roll list. It is busy until the answer arrives, the filled cells carry the engine mark, and it counts as 1 change. Keep stores it and Discard drops it.
   - One sentence beside the button says what the roll won't fill, and the server's own message stands under the heading:
     - On a gas giant: "A roll doesn’t fill a gas giant’s profile." The server's GS6 sentence appears too.
     - On the mainworld: "On the mainworld, a roll fills only size, atmosphere, and hydrographics."
     - On a moon, or a system that isn't MgT2E, the button is off, with the sentence saying why.
     - A star with no type gives the server's "Set Type, Subtype, and Class."
   - **Rolling again:** within one draft the handle sends a roll id only once, so a second press would give the same cells. The button is off after one roll, with "To roll different values, select Keep, and then roll again." See Needs.
2. **Dropdowns.**
   - On MgT2E, Type, Subtype and Class come as choices and use EditField's select, the app's one select. Keyboard type-to-find and arrows work.
   - A stored value outside the list stays, marked "(not in the list)". An empty value reads "Not set".
   - AoW and blank systems keep text, as the form sends.
   - No field that looked set came as text, so there is nothing for Lane B.
3. **The class as a name.** A star with no name reads "K1 V" in the rows, the "Orbits" lists and the picker. "No name" shows only with no class.
4. **A belt around a world or a gas giant.**
   - The parent list offers worlds and gas giants and keeps the belt a belt. Belts don't go around belts.
   - Its fields are then planetary diameters and eccentricity, with no year. The picker works in diameters and keeps to worlds.
   - Removing its world asks first, with the count from the server.
5. **Orbit number and AU** fill each other as you type, on MgT2E only. Each is its own change, and clearing one clears the other.
6. **One name per control.**
   - **Keep** is one palette command. It keeps the preview or the draft, whichever is open, with K or Ctrl+Enter. See Questions.
   - **Remove** is the same on the bar, the menus and the palette. Its second line keeps the chart detail.
   - The **add buttons** and the palette both say "Add star", "Add world", "Add gas giant", "Add belt" and "Add moon" ("Add moon to {world}" on the button).
- Also: the roll's message is not repeated at the top of the editor. The designer's fine print now reads "Nothing is rolled unless you select Roll profile".

## Changed files
- apps/web/src/workspace/build/hand.ts: `cls` on a star node; `nodeTitle` falls back to it; belt parent options; remove words; `handChangeCount` counts profile rolls; `handUi.rolling`.
- apps/web/src/workspace/build/hand_acts.ts: `profileRollId`, `rollNote`, `canRollProfile`, `rollProfile`.
- apps/web/src/workspace/build/HandDesigner.vue: the roll button, its sentence and the server's message; Add labels; orbit and AU follow each other; fine print.
- apps/web/src/workspace/build/orbit_pick.ts: `modeFor` by parent (a belt around a world is in diameters); `pickParents` keeps a belt's unit; `orbitPartner`.
- apps/web/src/workspace/build/OrbitPicker.vue: the new `modeFor`.
- apps/web/src/workspace/build/EditField.vue: "(not in the list)" and "Not set".
- apps/web/src/workspace/build/commands.ts: `build-body-roll`; one Keep (`build-draft-keep` leaves the palette, and its id still drives the bar); Remove; Add names.
- apps/web/src/workspace/build/BuildBar.vue: the change count includes rolls; Remove label.
- apps/web/src/workspace/build/SystemEditor.vue: roll messages are not repeated at the top.
- tests/web/build_hand.test.js:
  - the classText fix;
  - the quoted server sentence on a star remove, now "Removing this star also removes 6 bodies." (Lane A reworded it on disk);
  - 3 new tests.
- tests/web/build_orbit_picker.test.js: the new `modeFor`; 2 new tests.
- tests/web/build_editor.test.js: one Keep.
- findings/builder_system_design.md §23.

## Gates
npm test:      FAIL, 2 files, neither mine. Everything I own passes: 1366 pass, 15 skipped.
- `tests/web/surface_service.test.js` ("surface service") and `tests/web/orbit_renderer.test.js` ("the page path paints when workers are unavailable") fail against Lane C's files in progress (`apps/web/src/surface/service.ts`, `surface/vanilla/gl.worker.ts`, `orbit/disc_batch.ts`, modified).
- `tests/web/orbit_disc_texture.test.js` is Lane C's new, unfinished file.
npm run check: pass (manifesto: clean)
typecheck:     pass
npm run build: pass (index chunk 288.54 kB; pin 450 kB)
fourth gate:   pass. Own API (8797), Vite (5197) and Edge (9397), all stopped after; ports free.

## Browser pass (Okyrhoe 1214, MgT2E by hand; every draft discarded after)
- **Rows:** star.0 "K1 V", star.1 "K5 V".
- **Roll a world:** 8 cells filled (H B 8 7 0 0 0 0), all marked; "1 change"; the server's "Rolled this profile." under the heading only.
- **Roll the mainworld:** only size, atmosphere and hydrographics changed (A 6 3 3 → A 6 A 4); the server's sentence names the rest.
- **Roll a gas giant:** nothing written; our sentence and the server's GS6 sentence.
- **Roll a belt:** H 0 0 0 1 6 5 8. Two adds and two rolls counted as 4 changes.
- **Belt around a world:**
  - Its Orbits list offered the stars, the pair, the worlds and the new gas giant, and not the other belt.
  - Given to Okyrhoe A-I it stayed a belt, with "Orbit (planetary diameters)".
  - Its picker showed worlds only and a pd scale. Two arrow presses, then Enter, gave 34.7.
- **Removing Okyrhoe A-I:** "This also removes the 1 body that orbits this world." Then Cancel.
- **Orbit and AU:** typing 4.5 into Orbit filled AU 2.2; AU 10 filled orbit 7; clearing AU cleared both.
- **Star dropdowns:**
  - Type has 9 options with their labels. Pressing "g" on the focused select chose "G — Yellow", and the class label read "G5 V". ArrowDown on Class chose VI, and the row read "G5 VI". A pointer choice of Subtype 7 gave "G7 VI".
  - A stored "K1" (set in the page's form, as an old document would hold it) showed "K1 (not in the list)" first in the list.
- **Palette:** "Keep" (one), "Remove", "Add star", "Roll profile".
- **Spans:** column, half, full and 520 px (`kb7_span_*`, `kb7_520`).
- Console: no error.

## Contract published
none

## Needs from others
- **Lane A:** let a profile roll go twice in one draft.
  - Today `DraftHandle.rollAgain(id)` (builder/draft.ts:317) adds an id to `rolls` only if it is not there.
  - The server applies each entry in turn, and each one that writes moves the body's roll number on (packages/generation/src/hand.ts `rollProfiles`), so a repeated `<id>.profile.roll` would give new cells.
  - The ask: `rollAgain(id)` appends `<id>.profile.roll` again when it is already in `rolls` (generated-field ids can keep today's behaviour), and the change count stays 1.
  - When that lands, I drop the "select Keep first" sentence and keep the button on.
- **Lane C:** the three red test files above.

## Questions for Johnny
1. Keep is now one command: K or Ctrl+Enter keeps whichever is open, the preview or the draft. That means K, pressed while focus is on a button in the designer, keeps the whole draft (Undo brings it back). Should K keep a draft? Suggested: yes, as built. It is one key for one act, and Undo is in the toast. The alternative is two palette entries both named "Keep".
2. In the More menu, Remove is just "Remove", with "Empties the hex on your map. The chart doesn’t change" on its second line when a chart system is under it. Is that clear enough without "from your map" in the label? Suggested: yes.
