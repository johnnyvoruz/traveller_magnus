# Tidal locking: W1 (Lane C, in 1.2.7) and E1 (Lane Z, held)

Issued 2026-10-18 12:58 by the orchestrator. Johnny pasted the brief below at 12:58 as an "additional fix for this rev". It is
**unchanged** and is the contract.

## Orchestrator's notes
- **W1 is in 1.2.7** (C, CW3, after CC4, before the freeze line). `tests/golden/fixtures/engine_1.2.0/profile_regina.json`
  is the **ESM** fixture of the web's `surface/profile.ts` (`tests/golden/cases_esm.js:156`), not engine output; the
  brief expects it to change and Johnny's paste is his word. Regenerate that one file only (an `UPDATE_GOLDEN=1` run of
  `tests/golden/esm.test.js` limited to `profile_regina`, or by hand), show the diff in the entry (expected: the one
  `locked` value), and leave the legacy fixture `tests/golden/fixtures/profile_regina.json` alone (the legacy app is
  frozen; its own test keeps passing). If any other fixture changes, stop and say so.
- **E1 is held** (Z, ZE1): it bumps the engine, which the Worker uses for every generation, so it cannot sit in the tree
  while truth v10 is live without a rebuild; the brief itself says to bundle it. Questions 117 to 119 to Johnny first.

---

Brief: tidal locking fixes (two items)

Background. tidallyLocked on a body means locked to the body it orbits (decision A1, 2026-10-03, directives/decisions.md). A locked planet keeps one face to its star and has no solar day. A locked moon keeps one face to its planet, and the star still rises and sets on it once per orbit. The engine logic is correct. Two places lose this distinction, and both show on Regina, the Spinward Marches capital, which is a moon of the gas giant Regina A-IV.

Item W1: the surface baker paints a locked moon as star-locked (web only, do first)

Problem. apps/web/src/surface/profile.ts:231 sets locked from tidallyLocked || isTwilightZone with no moon test. That value becomes climate.locked and rotation.locked in the profile, and gl_bake.ts:237 passes it to the shader as uLocked. The shader (gl_shaders.ts:247) then paints a hot hemisphere and a cold hemisphere instead of latitude bands. Regina's globe is baked this way.

Fix. Copy the moon test already used at apps/web/src/surface/hybrid/inputs.ts:131:

const moon = body.isMoon === true || body.isSatellite === true || body.type === 'Satellite';
const locked = !moon && (body.tidallyLocked === true || body.isTwilightZone === true);

The orbit model (orbit/daynight.ts:40), the hybrid sheet, surface/enhanced/seas.ts:52 and the season lines already apply this rule. Nothing else in profile.ts changes.

Check. Add a test in tests/web/ that calls surfaceProfile on a body with isMoon: true, tidallyLocked: true and asserts climate.locked === false, and on the same body without isMoon asserts true. The golden tests/golden/fixtures/engine_1.2.0/profile_regina.json contains the locked flag once and will change. The lane reports the new value; it is expected, since Regina is a moon. Then npm test, npm run check, npm run typecheck, npm run build.

Owner. Lane C (surface/).

Item E1: lunar mainworlds get a false 24-hour lock (engine, planned deviation)

Problem. When the Mongoose 2e stellar engine demotes a mainworld to a moon, it builds the object at packages/engines/src/mgt2e_stellar_engine.js:1613 to 1629 and again at 1746 to 1770. Both set the orbital distance pd but neither sets periodHrs, the moon's orbital period in hours. Ordinary moons get periodHrs at mgt2e_world_engine.js:683 and 700. The rotation step at mgt2e_world_engine.js:1647 reads w.periodHrs || 24, so a lunar mainworld is treated as orbiting its planet every 24 hours. When the lock roll succeeds, executeTidalLockRoll sets the sidereal day to that period. Regina's fixture shows the result: locked, sidereal day exactly 24, solar day 24.01. Its real period from the engine's own formula, using Regina A-IV's mass and diameter at 10.66 planetary diameters, is about 135 hours. The dossier says "Tidally locked" next to a 24-hour day. Every lunar mainworld in every system has this.

Fix. In generateRotationalDynamics, before line 1647, when isMoon and w.periodHrs is not a finite positive number and parent has mass and diamKm, compute it the way line 683 does:

w.periodHrs = Math.sqrt(Math.pow((w.pd || 10) * parent.diamKm, 3) / parent.mass) / 361730;

Leave the || 24 fallback in place after it for bodies with no usable parent. Do not touch the lock roll itself; the die stream does not move, so differences are confined to the lunar mainworld's rotation fields (periodHrs, siderealHours, solarDayHours, solarDaysInYear) and the values that read them.

This is a planned deviation under rule 4. Johnny gave his word for it on 2026-10-18 in chat. The lane must:

1. Bump packages/engines/package.json to the next version (Johnny names it; e1.3 means 1.3.0 in code and paths).
2. Create tests/golden/fixtures/engine_<new>/ by regenerating every case the ESM golden test runs (tests/golden/esm.test.js reads fixtures/engine_<version>/<case>.json and compares stable(actual); add the same UPDATE_GOLDEN=1 write branch that tests/golden/legacy.test.js:25 has, run it once, remove nothing else).
3. Create tests/generation/parity_deviations_<new>.json. tests/generation/parity.test.js:114 requires the ledger to equal the full diff list, so dump diffs from the test for hex Spinward_Marches/1910 into the new file, set engineVersion, and write a note that cites this brief and findings/ write-up. The lane reports how many rows changed against the 1.2.0 ledger (expected: only Regina's rotation rows and their dependents).
4. Write findings/lunar_mainworld_period.md: the problem, the fix, the before and after numbers for Regina, the list of changed ledger rows.
5. Never edit js/, rules/, or tests/golden/fixtures/engine_1.2.0/.

Release note for Johnny. A new engine version needs a truth rebuild (npm run truth:build pins engineVersion from package.json, tools/truth/build.js:16) and upload before the chart shows the new numbers. Bundle E1 with the next engine change rather than bumping for it alone. One decision when it ships: Regina's day becomes about 135 hours. If Johnny prefers the familiar 24-hour Regina for play, pin it through the engine corrections mechanism (tests/golden/fixtures/engine_corrections/); the fix still repairs every other lunar mainworld.

Do not do

- Do not change the tidal lock table, the lock-break check, the thermal rotation factor or the tilt and star-mass modifiers. Johnny has ruled that legacy behaviour stands on all of them.
- Do not touch the T5, RTT or Classic Traveller rotation code. Those editions are not in the hosted generator. Add one line to the backlog file: "T5/RTT write isTidallyLocked, the web reads tidallyLocked; CT rolls a rotation the rules forbid; revisit if an edition ships."
- Do not clear isTwilightZone on locked gas giants.
