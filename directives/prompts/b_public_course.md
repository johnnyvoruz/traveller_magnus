# Lane B — a public ship's course ahead, with a referee's switch

Issued 2026-10-15 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/B.md`,
`directives/contracts/b_public_games.md`, then this file. No git but read-only, no deploy, no
`rules/`.

## Johnny's words (2026-10-15)

"Make course public, and then give it a checkbox I guess for refs to turn off the course if they
don't want it published."

## Today

`PublicShipCard.legs` carries the finished legs only (`publicFinishedLegs` in
`universe/public_mark.ts`, stored in `public_cards.legs`). Every leg still ahead of the campaign
date stays private.

## Decided (orchestrator; build it)

1. **`PublicShipCard.course`:** the legs of the ship's track that are not finished at the
   campaign date. That means the leg under way, then the planned legs, in order.
   - Each leg has the same shape as `PublicFinishedLeg` and adds only what the map needs to
     draw it: its end hex and, where the track has them, its dates.
   - Put the shape in `packages/shared/src/schemas/public_games.ts`. If the existing finished
     shape cannot describe a leg under way, add the smallest new type and say why in the
     contract.
   - The list is empty when nothing is planned. The browser reads server answers leniently,
     so an open 1.2.2 tab drops the new key.
2. **The size budget:** the course shares the card's byte budget. Over it, keep the course and
   drop the oldest finished legs first, as today, then the oldest notes.
3. **The switch is per game:** `universes.show_course`, defaulting to 1 (on).
   - It sits beside `show_referee` and is set the same way, on the same route.
   - When it is 0, `course` is `[]` on every one of that game's cards.
   - Changing the switch rewrites that game's cards at once, the way `show_referee` does.
4. **Migration 0020,** safe in either order. Before 0020 is applied, the Worker answers
   `course: []` and treats the switch as on but unsaved.
   - Probe for the column the way `coversReady` probes for `cover_hash`.
   - A setting write before 0020 answers with one plain sentence.
   - Don't use a Drizzle whole-row read or insert of `universes` or `public_cards`: the new
     column would break it before 0020 is applied.
5. **The contract:** update `contracts/b_public_games.md` with the field, the switch, the
   budget rule and every sentence, written for Lane D. D draws the course and adds the
   checkbox after your report.

## Gates

- `npm test` and `npm run check`.
- The worker suites, run against your own `wrangler dev` on your own port and state, with and
  without 0020: `public_games`, `party_ships`, `public_card`, and a new course suite:
  - a planned route appears in `course`;
  - a leg under way is in `course`, not `legs`;
  - the switch off empties `course` at once;
  - the budget keeps the course.

## Report

Write `directives/reports/b_public_course.md` from the template.

**Owned:**
- `apps/api/src/universe/public_mark.ts`, `routes/public_ships.ts`;
- the route that sets `show_referee`;
- `apps/api/src/db/schema.ts` (your lines) and migration `0020_*`;
- `packages/shared/src/schemas/public_games.ts`;
- `contracts/b_public_games.md`;
- tests under `tests/api/` and `tests/shared/`;
- your report.

After each meaningful step, append one line under Progress: "done: X. next: Y."

## Progress
done: no half-finished course edits in the owned files. next: the shared course shape and the byte budget.
done: course on the card, show_course, migration 0020, and the contract section. next: shared tests, then the worker suites.
done: shared tests, typecheck, check, and the worker suites (course, public_games, party_ships, public_card). next: the report.
