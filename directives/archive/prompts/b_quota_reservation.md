# Lane B — close the 250 MB quota race with a reservation

Issued 2026-10-17 by the orchestrator. You may be a fresh session with no memory. Read `CLAUDE.md`,
`directives/manifesto.md`, `directives/board.md`, `directives/lanes/B.md`,
`directives/contracts/b_builder.md` (the byte charge and "the open quota race"), your report
`directives/reports/done/b_public_games_0013.md` (paragraph "The 250 MB race is not closed"), then
this file. No git but read-only, no deploy, no `rules/`.

## The fault (yours, 2026-10-13)
Two generate jobs on one universe each read `object_bytes` once, then keep a private baseline while
they write objects. Together they can pass the 250 MB quota.

## Decided (orchestrator; build your own design)
1. **The universe's Durable Object holds a reserved total** (it already runs one request at a time):
   - Before a slice's object puts, the job asks the DO to reserve the slice's new bytes.
   - The DO refuses when `object_bytes + reserved + request` passes 250 MB, with the same error and
     sentence a full universe answers today.
   - A failed put releases its bytes; `finishCounts` adding the bytes to D1 releases them too.
2. **No stalls:** the second job is never made to wait for the first; it reserves or is refused.
3. **No leaks:** each reservation is stored with its job id and an expiry (say 15 minutes; say what
   you chose and why). An expired reservation no longer counts. A dead job can't hold the quota.
4. **No migration** if the DO's storage can hold it. If you need one, it is `0021_*`, safe in either
   order, and you say why.
5. Imports (an install counts against the quota, Johnny 2026-10-14) and image uploads go through
   the same reservation if they write objects; list every writer of `object_bytes` you found.
6. Contract: replace "the open quota race" in `contracts/b_builder.md` with the rule as built.

## Gates
- `npm test`, `npm run check`, the typecheck.
- The worker suites on your own `wrangler dev`, port and state: `objects`, `universes`, the generate
  job suites, `install`, and a new suite:
  - two jobs racing toward the cap: the sum never passes 250 MB, and one is refused with the sentence;
  - a failed put releases its reservation;
  - an expired reservation stops counting;
  - one job alone behaves exactly as before.

## Report
Write `directives/reports/b_quota_reservation.md` from the template.

**Owned:** `apps/api/src/universe/` (the DO and the job's write path), `apps/api/src/jobs/` (the
generate job's write path only; not the ten parked truth-build files: `inputs.ts`,
`reconcile_transform.ts`, `truth_build.ts`, `release_seal.ts` stay as they are), `contracts/b_builder.md`,
tests under `tests/api/`, your report. `routes/packages.ts` and `installs.ts` are Lane Z's: if the
install path needs a change there, name it and stop on that part.

After each meaningful step, append one line under Progress: "done: X. next: Y."

## Progress
done: found no reservation work and left the parked truth-build diffs alone. next: DO reservation table and reserve/release.
done: DO reserves and releases, and the generate, image, and inline hex writers use it. next: tests and gates.
done: gates run. The reservation suite passed. next: the report.
