# B hand orbit roll report
Prompt: prompts/b_hand_orbit_roll.md
Status: partial

## Changed files
- directives/contracts/b_builder.md: sections "Hand: orbit data" (on disk, unpushed), "Hand: roll a profile" (proposed, not built), "What may orbit what" (proposed, answer only)
- packages/shared/src/orbit_au.ts: MgT2E table and the two conversions, copied from the cited engine lines
- packages/shared/src/schemas/hand.ts: optional orbitId, orbitAU, au, eccentricity, pd, periodYears
- packages/shared/src/index.ts: exports the helper
- packages/generation/src/hand.ts: form fields, apply, handWalk copy; a belt drops year changes
- tests/generation/hand.test.js: orbit fields, belt year drop, helper matches the engine table
- tests/web/build_hand.test.js: the body pane's expected field ids now include the orbit fields the form returns

## Gates
npm test:      pass (1332 pass, 0 fail, 15 skipped)
npm run check: pass
typecheck:     pass
npm run build: pass (493 modules; vue-tsc in that build passed)
fourth gate:   not run. No builder route or tests/api file changed. The draft already goes through applyHand.

## Contract published
contracts/b_builder.md

## Needs from others
- Lane D: form field ids. Star, world, and gas giant: `<id>.orbit.id`, `<id>.orbit.au`, `<id>.orbit.eccentricity`, `<id>.orbit.years`. Belt: the first three only. Moon: `<id>.orbit.pd`, `<id>.orbit.eccentricity`. `''` or `null` clears. Do not show `<beltId>.orbit.years`, `<beltId>.orbit.days`, or `<beltId>.orbit.hours`. The picker calls `mgt2eOrbitToAu` and `mgt2eAuToOrbit` from `@voyage/shared` for an MgT2E system only, then writes the number as a normal draft change. Do not call them for AoW. There is no `<id>.profile.roll`. `nodeFields` in apps/web/src/workspace/build/hand.ts already shows these ids because they are not in its hidden list.
- Lane A: in `presentHand`, copy the stored numbers the way `handWalk` does. Star row: `orbitId`, `orbitAU`, `eccentricity`, `periodYears`. World, gas giant, and belt row: `orbitId`, `au`, `eccentricity`. Copy `periodYears` for a world or gas giant, never for a belt. When `au` or `orbitId` is set and `alsoParentId` is absent, also set `orbitType` `S-Type` and `parentStarIdx`. Moon row: `pd`, `eccentricity`. Leave `separation` as the word `Companion`. Do not read `periodDays`, `periodHours`, `siderealHours`, or `solarDayHours` off a hand belt. Rings and `diamKm` are still absent, so a moon's measured place (`pd` times parent `diamKm`) still has no parent diameter. The drawn moon ring stays the index ring.

## Questions for Johnny
1. An AoW hand system has no orbit table in `rules/aow_data.js`. `rules/` also has `rules/ct_data.js` lines 3 to 5 and `rules/t5_data.js` line 37, which differ from the MgT2E table. Suggested answer: the AoW picker types AU only, and does not use the MgT2E helper, until an AoW table is in `rules/`.
2. A moon's period is two live formulas: `periodHrs` at `packages/engines/src/mgt2e_world_engine.js` lines 680 to 682, and `moonPeriodYears` at `apps/web/src/orbit/maths.ts` lines 139 to 151. Suggested answer: leave the moon period off the form. Distance stays `pd` in planetary diameters.
3. May a belt orbit a world? `rules/` is silent. Guideline 4.2 and guideline 1.4 place belts in stellar slots. The refusal `A world orbits a star.` is unchanged. Suggested answer: keep that refusal until a rule says otherwise.
4. Which UWP digits of a hand belt are fixed? `rules/` is silent for MgT2E. Traveller 5's `St000PGL-T` (`rules/guideline_4_2_gas_giants_and_belts.md` lines 25 to 26) is not a hand edition. AoW's auditor requires size 0 and the AoW world step skips belts. The MgT2E engine forces size 0, then rolls the other digits. Suggested answer: do not lock any profile cell, and do not copy the T5 string.
5. Eccentricity has dice modifiers in `rules/mgt2e_data.js` lines 533 to 538 and no numeric maximum. The server accepts any finite number. Suggested answer: keep it that way.
6. The engine auditor refuses a world inside the star's destroying inner limit (`packages/engines/src/mgt2e_uwp_auditor.js` lines 169 to 171). The hand path does not run it, and two bodies may share an orbit number. Suggested answer: do not add those refusals on a hand document.
