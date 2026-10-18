# Lane B — the one-sector cap: its test and its lost sentence

Issued 2026-10-13 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/B.md`,
`directives/contracts/b_builder.md`,
`directives/reports/done/c_liquid_minimal_review.md` (changes 4 and 5), then this file.
No git but read-only, no deploy, no `rules/`, no Traveller rule from memory.

Your `b_charge_fallback` report is accepted. **The engine is 1.2.0 on the working
tree** (Lane Z's water and ice patch): the fixtures are
`tests/golden/fixtures/engine_1.2.0/`, the ledger
`tests/generation/parity_deviations_1.2.0.json`. Lane Z is changing engine files
again this turn (`prompts/z_liquid_land_changes.md`): stay out of `packages/engines`
and expect `npm test` to move under you; a failure there goes under "Needs from
others".

The same patch added a cap, on Johnny's word: **one sector per request** for a truth
build, its retry, the Builder's generate routes and the generate job
(`apps/api/src/jobs/one_sector.ts`, `routes/builder.ts` lines 555 and 850,
`routes/admin.ts`, `jobs/generate_queue.ts` lines 119 to 120). It is yours from now.

## Do, in this order

1. **`tests/api/builder_sector_generate.test.js`** (about line 237 to 243) still
   expects 202 for `makeSectors` over two sectors. It is 400 `validation` /
   `one_sector`, "The limit is one sector per request." Make the test state the cap:
   the two-sector box is refused with that sentence and makes no sector, no job and
   no charge against the daily allowance; each of the two sectors on its own request
   is 202. Keep your `VOYAGE_BEFORE_0013` switch.
2. **The job's backstop keeps its sentence.** `generate_queue.ts` lines 119 to 120
   fail the job with the sentence and no hex key; `markJobFailed`
   (`apps/api/src/universe/hexes.ts` lines 840 to 842) stores the reason only when
   both are set, so the sentence is dropped. Store the reason when there is no hex
   key. Say what the Build pane then shows for such a job (read
   `apps/web/src/workspace/build/`, do not edit it) and whether Lane D must change a
   line.
3. **The contract.** `contracts/b_builder.md`: the cap, the sentence, the code, which
   routes refuse, and that a subsector or one sector by address is one prefix and
   proceeds. List for Lane D every Build action that can now send two sectors (a
   drag across a sector border, a right-click on a selection that spans two, "make
   sectors" with two), so the pane can say it before the person sends it.

## Not in this pass

- The parked truth-build files and `tests/api/truth_build.test.js` line 1333.
- `apps/api/src/routes/admin.ts` beyond reading it.

## Owned files (this pass)

`apps/api/src/jobs/generate_queue.ts`, `apps/api/src/jobs/one_sector.ts`,
`apps/api/src/routes/builder.ts`, `apps/api/src/universe/hexes.ts`,
`tests/api/builder_sector_generate.test.js`, `tests/api/one_sector.test.js`,
`directives/contracts/b_builder.md`, `directives/reports/b_one_sector_followups.md`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, pasted. Fourth gate, on your own
ports and state directory, one file at a time, stopped after:
`one_sector.test.js`, `builder_sector_generate.test.js` (with 0013 and 0014, and
with `VOYAGE_BEFORE_0013=1`), `builder_density.test.js`, `builder_allowance.test.js`,
`generate_speed.test.js`.

## Stop rule

Stop when the gates pass and the report is written.

Write `directives/reports/b_one_sector_followups.md` from
`directives/reports/_TEMPLATE.md`. Questions for Johnny written out in full,
recommended answer first. After each meaningful step append one line under Progress:
"done: X. next: Y."

## Progress

done: the two-sector box is refused, and each sector on its own is 202. next: keep the job sentence.
done: a failed job with no hex key stores the sentence on `error`. next: the contract.
done: the contract names the cap, the routes, and the Build actions that can send two sectors. next: gates.
done: gates passed, including the sector-generate file with 0013 and 0014 and with VOYAGE_BEFORE_0013=1. next: report.

