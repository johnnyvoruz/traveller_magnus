# Lane B — make the byte charge safe without 0014; two small server follow-ups

Issued 2026-10-13 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/B.md`,
`directives/contracts/b_public_games.md`, then this file. No git but read-only, no
deploy, no `rules/`, no Traveller rule from memory.

Your `b_public_games_0013` report is accepted, with one thing held: push 1.1.12
waits for item 1 below. Nothing of yours is pushed yet.

## Do, in this order

1. **A finished generate job must not fail when migration 0014 is absent.**
   `apps/api/src/jobs/object_charge.ts` `chargeObjectBytes`: today a missing
   `object_byte_charges` table makes the batch throw, `finishCounts`
   (`jobs/generate_queue.ts`) throws, the bytes are never added and the settled mark
   is never written. A push deploys the Worker; the migration is applied by Johnny's
   own command, before or after. The standing rule is that every migration is safe in
   either order. When the table is absent, do what 1.1.11 does: the plain
   `UPDATE universes SET object_bytes = object_bytes + ?`, and nothing else. Detect
   the absence the way `auth/public_schema.ts` detects 0013 (once per isolate, not
   once per job), or from the error text of the failed batch; say which and why. A
   batch that failed for a missing table must not have added the bytes twice.
   Test both states in `tests/api/object_charge.test.js`: table present (your two
   cases stay), table absent (the bytes are added once, no throw).
2. **The feed leaves out the caller's own games** (`routes/public_games.ts`,
   `GET /api/public-games`). Lane A reports that a hex with several games has
   `name: null` and a count that includes the viewer's own universe, which the
   browser cannot remove. The join excludes universes whose `owner_id` is the
   caller. A hex left with no other game is not in the answer. Update the contract
   and `tests/api/public_games.test.js` (owner sees none of their own; a second
   account sees it).
3. **Search order on the server** (`apps/api/src/routes/truth.ts`, Lane E's need).
   Inside one rank the `ORDER BY` is the name only, and the answer is capped at 50
   rows, so a query with more than 50 prefix matches can drop Regina before the
   browser re-ranks. Add the same tie-break the browser uses
   (`apps/web/src/search/omni.ts`): the Spinward Marches first, then the name. Do
   not change the ranks or the row shape. One test in the suite that covers search.

## Not in this pass

- The 250 MB quota race: your reservation design is recorded; not built now.
- `tests/api/truth_build.test.js` and the other parked truth-build files: leave them.

## Owned files (this pass)

`apps/api/src/jobs/object_charge.ts`, `apps/api/src/jobs/generate_queue.ts`,
`apps/api/src/routes/public_games.ts`, `apps/api/src/routes/truth.ts`,
`apps/api/src/auth/public_schema.ts`, the tests for them under `tests/api/`,
`directives/contracts/b_public_games.md`, `directives/contracts/b_builder.md`,
`directives/reports/b_charge_fallback.md`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, pasted. Fourth gate, on your own
ports and state directory, one file at a time, stopped after:
`object_charge.test.js`, `public_games.test.js`, `generate_speed.test.js`,
`builder_sector_generate.test.js` and the search suite, each run **twice**: once with
0013 and 0014 applied and once with neither.

## Stop rule

Stop when the gates pass and the report is written.

Write `directives/reports/b_charge_fallback.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: charge falls back when 0014 is absent, probed once per D1 binding. next: public-games feed excludes the caller.
done: the feed leaves out the caller's own games, and the contract says so. next: search tie-break.
done: search orders the Spinward Marches ahead of the name inside a rank. next: gates.
done: gates. npm test, check, and typecheck passed. The worker files ran with 0013 and 0014, then with both objects dropped. next: report.

