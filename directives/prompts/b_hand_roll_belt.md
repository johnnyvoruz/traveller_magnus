# Lane B — a one-body profile roll in the engines, and a belt that may orbit a world

Issued 2026-10-11 by the orchestrator. **Go now** (board, 2026-10-11 16:20): your
marketplace server pass is blocked on two answers from Johnny, so this comes first. You may be a fresh session with no memory.
Read `CLAUDE.md` (rules 1 to 4 are the subject), `directives/manifesto.md`,
`directives/board.md`, `directives/lanes/B.md`, then this file, then your own
`directives/reports/done/b_hand_orbit_roll.md` and the sections "Hand: roll a profile"
and "What may orbit what" in `directives/contracts/b_builder.md`. No git but read-only,
no deploy. `rules/` is read-only. No Traveller rule from memory.

## Johnny's rulings (2026-10-11)

1. **The profile roll: yes, add the engine function.** His word for the engine change
   that CLAUDE.md rule 4 requires.
2. Hand systems that are not MgT2E: the orbit picker works in AU only.
3. A moon's period stays off the form.
4. **A belt may be placed around a world by hand.** "I think it can be manually
   placed, but not automatically yet; there's rules for moons in another book that
   I'll get in the future, so we will just let the manual user place it for now."
   Nothing generates such a belt; the generators are untouched.
5. No cell of a belt's profile is locked.
6. Eccentricity accepts any finite number.
7. A hand system is **not** refused for a world inside the star's inner limit or for
   two bodies on one orbit, and the screen does not call it out.

## Part 1. `rollBodyProfile` in the engines

Your contract found that the engines export no function that takes one body in an
existing system and returns its profile. Add one, for MgT2E first:

- A new exported function in `packages/engines/src/` that, for one world, gas giant or
  belt of a given system (the star data, the body's orbit and parent), fills that
  body's profile cells by calling the **existing** per-step code (the same functions
  and the same `rules/` tables `generatePhysicals`, `generateAtmospherics`,
  `generateBiospherics`, `generateSubordinateSocial` and the rest already use).
  Refactor the smallest amount needed to reach one body: extract, do not rewrite. No
  table is retyped, no number is invented, no step is reordered.
- Seeded: the hex id, the body id and a roll number give the same result every time
  (`reseedForHex` and the trace sink, as generation does).
- **Engine output stays byte-identical.** `tests/golden/` and
  `tests/generation/parity.test.js` pass with every fixture untouched. Run them on a
  scratch copy with its own `npm ci` too, since `node_modules/@voyage/*` links back to
  the working tree. If an extraction would move even one byte of existing output, stop
  and report the exact step: do not regenerate a fixture, do not add a deviation.
- The uncommitted nine lines in `mgt2e_world_engine.js` (`generateRotationalDynamics`,
  water against ice) and the five modified fixtures are Johnny's held change: **leave
  them exactly as they are on disk**, build around them, and say in the report how
  your change sits beside them so the two can be committed separately.
- Where a step needs something a hand system does not have (a mainworld baseline for a
  subordinate body's social digits, a star's luminosity that was typed, not rolled),
  list each missing input and what the existing code does when it is absent. If the
  rules give no answer, stop on that step and ask; roll what can be rolled honestly.
- Version: adding an export without changing output. Say whether
  `packages/engines/package.json` must bump under the repository's own versioning
  notes; if in doubt, ask, do not bump.
- Architect of Worlds: say whether the same can be done and what it would take; build
  it only if it is the same small extraction.

Then wire it: the draft change `<id>.profile.roll` in `packages/generation/src/hand.ts`
as your proposed contract section describes (a draft until Keep, Discard drops it,
rolling again gives the next roll), and move that section to **on disk, unpushed** with
the final field id and answer.

## Part 2. A belt around a world

In `packages/generation/src/hand.ts` (about line 374) a body that is not a moon must
orbit a star. Allow a body of kind `belt` to have a world or a gas giant as its parent;
everything else about the refusal stays. Its orbit fields are the moon's (`pd`,
`eccentricity`), no year. Removing the world asks about the belt the way it asks about
moons (the cascade and the count). Say in the contract what `handWalk` emits for it so
Lane A can draw it, and that no generator produces one. Update "What may orbit what".

## Part 3. Confirm, no code unless missing

Rulings 2, 3, 5, 6 and 7 match what you built or left alone: confirm each in the
contract in one line, with the test that shows it.

## Owned files (this pass)

- `packages/engines/src/` for part 1 only, the smallest diff; `packages/generation/src/hand.ts`,
  `form.ts`; `packages/shared/src/schemas/hand.ts`, `form.ts`
- `tests/generation/hand.test.js`, a new `tests/generation/roll_body.test.js`
- `directives/contracts/b_builder.md`, `findings/engine_roll_body.md` (what was
  extracted, line by line, for Johnny's review before it is pushed)
- `directives/reports/b_hand_roll_belt.md`

Not yours: `apps/web`, `rules/`, the golden fixtures, the parked truth-build files.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
the golden and parity results on a true clean copy; `git diff --stat` for
`tests/golden/fixtures` showing only the five held files, unchanged by you; the roll
repeated three times with one seed giving one result.

## Stop rule

Stop when parts 1 to 3 are done and reported, or at the first step that would change
existing engine output or needs a rule that is not in `rules/`.

Write `directives/reports/b_hand_roll_belt.md` from `directives/reports/_TEMPLATE.md`;
give Lane D the field id for the roll and Lane A what a belt around a world looks like
in the rows. Questions for Johnny written out in full, recommended answer first. After
each meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: rollBodyProfile calls the existing MgT2E steps on one body, and a belt may orbit a world or a gas giant. next: report.
