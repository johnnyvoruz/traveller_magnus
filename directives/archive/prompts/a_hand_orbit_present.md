# Lane A — hand-made systems in the orbit view read their orbit data; Restore after a grow Undo

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/A.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your marketplace client report is accepted.

## Goal

Two small things other lanes are waiting on.

### 1. `presentHand` reads the orbit fields Lane B now stores

A hand-made star or body used to store only its parent and an integer order, so the
orbit view placed it by index. Lane B added optional orbit fields
(`directives/contracts/b_builder.md`, section **"Hand: orbit data"**; read it, and
`directives/reports/done/b_hand_orbit_roll.md`, "Needs from others", which is written
to you). In `apps/web/src/orbit/hand_present.ts`, copy the stored numbers the way the
server's `handWalk` does:

- Star row: `orbitId`, `orbitAU`, `eccentricity`, `periodYears`.
- World, gas giant and belt row: `orbitId`, `au`, `eccentricity`; `periodYears` for a
  world or a gas giant, **never for a belt** (Johnny, 2026-10-11: a belt has no year
  data).
- When `au` or `orbitId` is set and `alsoParentId` is absent, also set `orbitType`
  `S-Type` and `parentStarIdx`.
- Moon row: `pd`, `eccentricity`.
- Leave `separation` as the word `Companion`. Do not read `periodDays`, `periodHours`,
  `siderealHours` or `solarDayHours` off a hand belt.
- A body with none of the new fields is placed exactly as today (every stored system
  must look the same after this change).
- Known gap, do not fill it: a hand moon has no parent diameter, so its drawn ring
  stays the index ring. Say so in the report.

Also: wherever the orbit view's card or the dossier model (`dossier/model.ts`, yours)
shows a year or orbital period for a body of kind belt, hand-made or generated, show
nothing for that row. List each place you changed. If a place is in a shared file or
another lane's, name the line and leave it.

### 2. One line in `builder/screen.ts`

`asBuildStore.undo` is `async (token) => { await builder.undo(token); }`, which drops
the Restore token. Lane D's seam now accepts `Promise<UndoToken | null | void>`. Change
it to `undo: (token) => builder.undo(token)` so Restore shows after a grow Undo.

## Owned files (this pass)

- `apps/web/src/orbit/hand_present.ts`, other files in `orbit/` only where a belt's
  year is shown, `apps/web/src/dossier/model.ts`, `apps/web/src/builder/screen.ts`
- `tests/web/orbit_hand.test.js`, `tests/web/dossier_model.test.js`,
  `tests/web/builder_store.test.js`
- `directives/reports/a_hand_orbit_present.md`

Not yours: `workspace/`, `packages/`, `apps/api`, `views/OrbitView.vue`,
`dossier/DossierPanel.vue`, `dossier/DossierBody.vue`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
tests for each bullet of part 1 (with the fields, without them, a belt), and one for
part 2 (the wrapper returns the token). One shot of a hand-made system in the orbit
view with two worlds at set orbits, on your own ports, both servers stopped after:
`findings/ui_design_shots/kb_hand_orbit_placed.png`.

## Stop rule

Stop when both parts are tested and the report is written. Stop early with a blocked
report if the contract's field names differ from the list above: quote both.

Write `directives/reports/a_hand_orbit_present.md` from
`directives/reports/_TEMPLATE.md`. Questions for Johnny written out in full,
recommended answer first. After each meaningful step append one line under Progress:
"done: X. next: Y."

## Progress
done: presentHand copies the stored orbit fields, a belt shows no year, and the wrapper returns Restore. next: tests and the orbit shot.
done: the report is written. next: none. The web build is red on Lane D's OrbitPicker.vue, which this prompt does not own.
