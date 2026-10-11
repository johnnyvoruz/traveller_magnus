# Lane A belt around a world report
Prompt: prompts/a_belt_around_world.md
Status: done

## Changed files
- apps/web/src/orbit/hand_present.ts: a belt whose parent is a world or a gas giant is nested in that body's moons, the same way handWalk does. The nested row is type Planetoid Belt, with pd and eccentricity when stored, and no isMoon and no periodYears.
- apps/web/src/orbit/layout.ts: that nested belt is hostedBelts on the world, not a moon and not a star belt. Its ring uses moonOrbitRadius. A system with no such belt keeps the same moon indexes.
- apps/web/src/orbit/picture.ts: hostedBeltPaths draws that ring with the existing belt path (style belt, width 5, the same phase). It is centered on the parent.
- apps/web/src/orbit/lineup.ts: the line-up uses the same paths, and counts the belt in the reach, not as a moon disc.
- apps/web/src/orbit/card.ts: the belt card is Distance in PD, eccentricity, and sub Planetoid Belt. No year, period, or day. The world's Moons count skips it.
- apps/web/src/orbit/BodyChips.vue: the belt stays in the group's moons so the existing step keys still reach it. The moon-count button skips it. The belt chip reads ", belt".
- apps/web/src/dossier/model.ts: the place is "belt of" the parent. Distance (PD) is shown. Satellite orbit, year, and orbital period are blank. The Moons fact and the moon links skip it.
- tests/web/orbit_hand.test.js: presentHand deep-equals handWalk for a world, its moon, and its belt. The picture path is style belt, centered on the world, at moonOrbitRadius, inside the world's own orbit. The card has no year.
- tests/web/dossier_model.test.js: the belt is under the world, with Distance (PD), and the parent counts one moon.
- Disc drawing in OrbitRenderer.ts and disc_batch.ts was not edited.

## Gates
npm test:      fail, one assertion outside this prompt. 1379 tests, 1363 pass, 1 fail, 15 skipped. The belt tests pass. The failure is tests/web/build_hand.test.js:220: actual star rows include s1.classText, expected rows do not.
npm run check: pass (manifesto: clean)
typecheck:     pass (tsc --noEmit -p apps/api)
npm run build: pass (vue-tsc, then vite built)
fourth gate:   pass. Shot findings/ui_design_shots/kb_belt_around_world.png. Regina (Spinward Marches 1910) orbit view, chart object replaced with a hand system: star Hand, world Rock at 1.2 AU, moon Lune, belt Dust at 25 PD around Rock. The dossier reads Planetoid Belt, belt of Rock, Distance (PD) 25, eccentricity 0.1, and no year. The world card counts 1 moon. The picture shows a dashed belt ring around Rock, and Lune as a disc inside that ring. Private wrangler 8844 and Vite 5214, both stopped after. Port 5173 was left listening (pid 63556).

## Contract published
none

## Needs from others
- Lane B: packages/generation/src/hand.ts now adds a read-only star field `<id>.classText`. tests/web/build_hand.test.js:220 still expects the star rows without it, so npm test fails. This pass did not edit either file.

## Questions for Johnny
none
