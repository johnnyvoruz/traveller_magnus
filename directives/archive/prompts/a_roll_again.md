# Lane A — let a profile roll go twice in one draft

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/A.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your messages report is accepted (every row applied; the one red file was Lane
C's work in flight).

## Goal

In the hand designer, "Roll profile" fills one body's profile. Pressing it again should
roll again. It cannot today: `DraftHandle.rollAgain(id)`
(`apps/web/src/builder/draft.ts`, about line 317) adds an id to `rolls` only if it is
not there, so a second `<bodyId>.profile.roll` is never sent. The server applies each
entry of `rolls` in turn and moves that body's roll number on for each one that writes
(`packages/generation/src/hand.ts`, `rollProfiles`; read it and
`directives/contracts/b_builder.md`, "Hand: roll a profile", to confirm before you
build), so a repeated entry gives new cells. Lane D's button is switched off after one
roll, with a sentence telling the person to Keep first, until this lands.

## What to build

- `rollAgain(id)` appends the id again when it ends in `.profile.roll` and is already
  in `rolls`. Every other id keeps today's behaviour exactly (a generated field's roll
  stays once).
- The draft's change count for that body's roll stays 1 however many times it is
  rolled; Discard drops them all; Keep sends the list in order; "Keep mine" after a
  conflict carries them in order.
- If the contract says a repeated entry does **not** give a new roll, stop and report
  the line: do not work around it in the browser.

## Owned files (this pass)

`apps/web/src/builder/draft.ts` (and `types.ts`, `index.ts` only if a type moves),
`tests/web/builder_draft.test.js`, `findings/builder_roll_again_ready.md` (three lines
for Lane D: what changed, what the count is), `directives/reports/a_roll_again.md`.
Not yours: `workspace/`, `packages/`, `apps/api`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted (Lane C has
texture work in flight: if `tests/web/orbit_disc_texture.test.js`,
`surface_service.test.js` or `orbit_renderer.test.js` are red, name them and go on).
Fourth gate: tests for two rolls of one body in one draft (two entries, one change),
a generated field rolled twice (one entry, as today), Discard, and Keep mine.

## Stop rule

Stop when the tests pass and the report is written.

Write `directives/reports/a_roll_again.md` from `directives/reports/_TEMPLATE.md`. After
each meaningful step append one line under Progress: "done: X. next: Y."

## Progress
done: the contract says a later roll uses the next number, and rollProfiles applies each entry in order. next: append a repeated profile roll and carry it through Keep mine.
done: a profile roll is appended again, Keep mine carries the copies whose body is still on the form, and the draft tests cover two entries, one change, Discard, and Keep mine. next: run the gates.
done: gates passed (1384 tests, checker, typecheck, build). next: the report is written.
