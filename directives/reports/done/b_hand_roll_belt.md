# B hand roll belt report
Prompt: prompts/b_hand_roll_belt.md
Status: partial

## Changed files
- packages/engines/src/mgt2e_roll_body.js: `rollBodyProfile` calls the existing MgT2E steps on one body.
- packages/engines/src/mgt2e_stellar_engine.js: `orbitNumberToAu` is the interpolation `allocateOrbits` already used. Both call sites use it.
- packages/engines/src/core/rng.js: `isolateRng` reseeds for one call and restores the generator.
- packages/engines/src/index.js: exports `rollBodyProfile` and `orbitNumberToAu`.
- packages/generation/src/hand.ts: `<id>.profile.roll`, a belt may orbit a world or a gas giant, and `handWalk` nests that belt.
- packages/shared/src/schemas/hand.ts: a belt's parent may be a world or a gas giant. `profileRoll` counts rolls.
- packages/shared/src/schemas/form.ts: the hand-form comment says a profile roll runs one body.
- tests/generation/roll_body.test.js: the same seed three times, the next roll, the draft, a belt, the rulings.
- tests/generation/hand.test.js: a belt around a world, and the roll message when the star has no type.
- directives/contracts/b_builder.md: "Hand: roll a profile" and "What may orbit what" are on disk, unpushed.
- findings/engine_roll_body.md: what moved, line by line.
- The held nine lines in `mgt2e_world_engine.js` and the five golden fixtures were not edited. Engines stay 1.1.0.

## Gates
npm test:      pass (1345 pass, 0 fail, 15 skipped). Golden and parity are in that run.
npm run check: pass
typecheck:     pass
fourth gate:   `git diff --stat` for `tests/golden/fixtures` is the five held files only (two lines each). `mgt2e_world_engine.js` is the held nine lines. This pass did not edit either. A second copy with its own `npm ci` was not run. In this tree `@voyage/engines` already points at these files, and the suite passed on them.
build:         fail in Lane E's files, which this pass did not edit. `apps/web/src/workspace/RecordGallery.vue` unused `EditableText`. `apps/web/src/workspace/RecordPage.vue` `"hero"` is not `"strip" | "avatar"`. `rules:gen` and `names:gen` finished. `vue-tsc` reported no error in the hand or engine files.

## Contract published
contracts/b_builder.md

## Needs from others
- Lane D: the Roll profile button sends `{ id: '<bodyId>.profile.roll' }` in `roll`. It is not a form row. A belt given to a world or a gas giant stays kind `belt`. The parent list still rewrites that to a moon. The belt's orbit fields are then `<id>.orbit.pd` and `<id>.orbit.eccentricity`.
- Lane A: a belt around a world or a gas giant is nested in that body's `moons` with `type` `Planetoid Belt`, `pd` and `eccentricity` when stored, no `isMoon`, and no `periodYears`. No generator writes one.

## Questions for Johnny
1. A gas giant's engine profile is `uwpGG` (size `GG` plus that string). It does not fit the eight profile cells, so the roll writes nothing. Recommended: leave those cells for the referee to type. Do not invent a mapping.
2. The body that is the mainworld gets size, atmosphere, and hydrographics. Population, government, law, starport, and tech level stay as they are. `generateMainworldUWP` rolls a mainworld from the hex and does not read this body's orbit, so it is not called. Recommended: leave it that way.
3. A typed white dwarf uses `generateStarObject`, whose `D` branch reads the brown-dwarf table. `applyWhiteDwarfPhysics` rolls mass and age, so it is not called. Recommended: leave the lookup as it is until a hand star stores luminosity.
4. Engines stay 1.1.0. Recommended: do not bump for an added export that does not change fixture output.
