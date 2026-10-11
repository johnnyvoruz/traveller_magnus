# Lane A hand orbit present report
Prompt: prompts/a_hand_orbit_present.md
Status: partial

## Changed files
- apps/web/src/orbit/hand_present.ts: copies a stored orbit the way handWalk does. A belt's periodYears is left out. A body with none of the new fields is unchanged. separation stays Companion.
- apps/web/src/orbit/daynight.ts: a belt (Planetoid Belt, Asteroid Belt, or worldType Belt) gets no year figure, and a locked belt gets no Year line.
- apps/web/src/dossier/model.ts: a belt's Year fact is blank, and its Orbit section omits Orbital period (days).
- apps/web/src/builder/screen.ts: undo passes builder.undo(token) through, so a grow Undo returns the Restore token.
- tests/web/orbit_hand.test.js: stored orbits, a body without them, a belt, and the drawn AU.
- tests/web/dossier_model.test.js: a belt shows no year, and a world still does.
- tests/web/builder_store.test.js: the screen wrapper returns the Restore token.

## Gates
npm test:      pass (1355 tests, 1340 pass, 0 fail, 15 skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass (tsc --noEmit -p apps/api)
npm run build: fail. One error, outside this prompt:
src/workspace/build/OrbitPicker.vue(80,7): error TS6133: 'dialog' is declared but its value is never read.
fourth gate:   pass. tests/web/orbit_hand.test.js "stored orbit numbers are copied, and a body without them is unchanged" covers a fielded system (deepEquals handWalk), a system with none of the new fields, a belt that keeps au and drops periodYears, periodDays, periodHours, siderealHours and solarDayHours, and plan worlds at 0.5 AU and 5.2 AU. tests/web/dossier_model.test.js "a belt shows no year, and a world still does". tests/web/builder_store.test.js "undo of a grow returns a Restore token, and a bad answer returns null" asserts the wrapper returns a token id. Shot: findings/ui_design_shots/kb_hand_orbit_placed.png. Regina (Spinward Marches 1910) orbit view, chart object replaced with a hand system: star Hand, world Inner at 0.5 AU, world Outer at 5.2 AU. The picture draws both rings, and the list reads those distances. Private wrangler 8842 and Vite 5212, both stopped after. Port 5173 was left listening (pid 63556).

## Contract published
none

## Needs from others
- Lane D: workspace/build/OrbitPicker.vue line 80 declares dialog and never reads it, so npm run build fails vue-tsc. This prompt does not own workspace/.
- Lane B: a hand moon still has no parent diameter. orbit/distance.ts lines 89-92 leave its measured place empty without parent diamKm. orbit/layout.ts moonOrbitRadius (line 75) draws the ring from the moon's index. Left as the known gap.

## Year rows
Changed:
- dossier/model.ts: Orbital period (days) is omitted for a belt; the Year fact is blank for a belt.
- orbit/daynight.ts: yearFigure returns null for a belt; a locked belt's yearDays is null, so scoutReadout adds no Year line.

Left in place:
- orbit/card.ts beltCard (line 224) already lists Orbit # and Distance only.
- orbit/card.ts cardFor (line 259) still gives a mainworld belt the world card. That body is type Mainworld.
- orbit/daynight.ts dayNightLines still says how daylight ranges over the year. That is the daylight sentence.
- orbit/layout.ts still uses periodYears for motion.
- dossier/DossierPanel.vue lines 251-263 build the restated Year tile from yearFigure. A belt gets no tile because yearFigure returns null.
- dossier/DossierBody.vue line 18 is a comment. views/OrbitView.vue has no year row.

## Questions for Johnny
none
