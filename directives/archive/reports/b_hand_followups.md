# B hand follow-ups report
Prompt: prompts/b_hand_followups.md
Status: partial

## Changed files
- packages/generation/src/form.ts: design-by-hand copies finite orbit numbers off the generated rows. A belt does not receive `periodYears`. A missing number stays missing. AU is not computed from an orbit number.
- apps/api/src/routes/builder.ts: the design route passes the loaded tree into that copy. Restore still stores the previous tree's `baseHash`.
- packages/generation/src/hand.ts: each star has a read-only Spectral class field. On MgT2E, Type, Subtype, and Class are choice fields. Parent is a choice of the ids already in the system. A new MgT2E value outside the list is refused by the field's label. A stored value outside the list still parses. A profile roll whose star has no type, subtype, or class says `Set Type, Subtype, and Class.` The cells written do not change.
- tests/generation/hand.test.js: orbit copy on spin/1911, the class label, a stored `Q` kept until changed, and a white-dwarf type forcing class `D` and subtype `0`.
- directives/contracts/b_builder.md: design-by-hand orbits, the class field, and "Hand: select fields".
- findings/builder_messages.md: proposed message wording. No sentence in the server was changed.

## Gates
npm test: fail. 1379 tests, 1363 pass, 1 fail, 15 skipped. The failure is not an old sentence. `tests/web/build_hand.test.js` line 220 expects the star row ids without `s1.classText`. Actual ids insert `s1.classText` after `s1.name`. That file is Lane D's.
npm run check: pass (manifesto: clean)
typecheck: pass
npm run build: pass
fourth gate: pass. `RUN_API_TESTS=1` on `tests/api/builder.test.js`, `builder_form.test.js`, `builder_close.test.js`, `builder_sector.test.js`, `builder_sector_generate.test.js`, and `builder_sector_logic.test.js`. 12 pass. Ports 18831/19831, 18832/19832, 18833/19833, 18834/19834, and 18836/19836, each with its own temp persist directory. Those listeners were gone after the run.

## Contract published
directives/contracts/b_builder.md

## Needs from others
- Lane D: show `<starId>.classText` (label Spectral class, permission read). On an MgT2E hand system, Type, Subtype, and Class arrive as `choice` with the options in "Hand: select fields". Parent arrives as `choice`. Update `tests/web/build_hand.test.js` line 220 to include `s1.classText`. A belt given to a world or a gas giant stays kind belt. The screen still turns a non-moon into a moon.
- Lane A and Lane D: no server sentence changed, so no test has to move for wording. If the proposed wording in `findings/builder_messages.md` is adopted, these lines quote today's sentences: `apps/web/src/builder/draft.ts` lines 131 to 137; `tests/web/builder_draft.test.js` lines 353, 413, 461, 526, 542, 556, 561, 741; `tests/web/builder_store.test.js` lines 435, 967, 973, 974, 986; `tests/web/build_grow.test.js` lines 169, 173, 190, 193; `tests/web/build_hand.test.js` line 194.
- Lane A: `presentHand` still does not copy `orbitAU`, `au`, `pd`, or `eccentricity`. A generated system designed by hand now stores those numbers, and `handWalk` returns them.

## Questions for Johnny
1. The 16:45 note says luminosity, and every other number the roll reads off the star, is a field, as a dropdown where `rules/` has a closed list. `generateStarObject` interpolates mass, diameter, and temperature from `rules/mgt2e_data.js` `starStats_*`, then luminosity is `calculateStellarLuminosity(diam, temp)`. There is no list of those four numbers to put in a dropdown, so no control was added and the roll still uses the lookup. A star missing Type, Subtype, or Class now gets `Set Type, Subtype, and Class.` Suggested answer: add four number fields, show the lookup until you type, store a number only when you type one, and have the roll read the stored number. Do not build a dropdown of invented steps. The gas-giant profile stays empty, and a mainworld roll still writes only size, atmosphere, and hydrographics. The engine version stays 1.1.0.
2. The message rewrites are written in `findings/builder_messages.md` and not applied. The web tests and `draft.ts` match the current sentences. Suggested answer: apply that table in one pass that also updates `apps/web/src/builder/draft.ts` and the web tests listed above.
3. Architect of Worlds spectral types in `rules/aow_data.js` `spectralTypeTable` are one combined string, not type, subtype, and class. Those three fields stay text on AoW and on a hand system with no edition. Suggested answer: leave them as text.
