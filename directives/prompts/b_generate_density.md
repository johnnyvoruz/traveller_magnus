# Lane B — generating many hexes fills only some of them (density)

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/B.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your star-numbers report is accepted (golden and parity green on a clean copy with the
committed fixtures). Lanes A and D are waiting on this one.

## Why

Johnny, 2026-10-11, after generating a subsector on the live site: "it's generating
something in EVERY SINGLE HEX where we wouldn't really want that to be the case, not
every hex will be populated." The design note asked for this
(`findings/builder_system_design.md` §2: "Every one", or the legacy densities "Sparse
(2 in 6)", "Standard (3 in 6)", "Dense (4 in 6)") and it was never built: the generate
route fills every empty hex it is given.

## The behaviour to copy

The legacy app, `js/macro_orchestrator.js` lines 526 to 554, `autoPopulate(chanceOutOfSix)`:
for each hex, `reseedForHex(hexId)`, one `roll1D()`, and the hex holds a system when
the roll is at or under the chance. Read it, and read how the truth build decides which
hexes hold a system if `packages/generation` already has that step (`buildSector`,
`buildSectorSlice`): if it has, use that one code path and say so; do not write a
second. State nothing about densities that is not in those lines or in `rules/`; cite
the line for each of the three chances.

## What to build

Contract first (`directives/contracts/b_builder.md`, in both generate sections), then code:

1. `BuilderGenerate` and `SectorGenerate` take an optional `density`: `'every'`, or the
   chance out of six as the legacy names it (choose the wire spelling; D shows the
   labels "Every hex", "Sparse (2 in 6)", "Standard (3 in 6)", "Dense (4 in 6)").
   **Absent means `'every'`**, so today's callers and tests are unchanged until the
   browser sends it.
2. More than one hex: each empty hex is rolled as the legacy does, seeded by the
   universe's seed and the hex, so the same universe, hex and density always give the
   same answer. A hex that rolls no system is not written and is counted: the job's
   counts and the inline answer gain a number for "left empty" beside done, skipped
   and failed (name it in the contract; `skipped` keeps meaning "already held a
   system").
3. **One hex in the whole request always generates**, whatever `density` says: a
   person who selects one hex and chooses Generate wants a system there.
4. `filledToo: true` regenerates held hexes as today; density applies to empty hexes
   only. Say so in the contract.
5. Undo is unchanged: it takes back what the act wrote. A hex left empty was not
   written, so there is nothing to take back.
6. With `makeSectors`: the same, in new slots. A new sector in which every hex rolled
   empty is still made (it was named and asked for); say so.

If the legacy roll and the generation package's seed do not line up in a way you can
state in one sentence, stop and report: do not invent a seed scheme.

## Also, if the job can say it cheaply

Lane D marks each hex on the map as its system lands, today by watching revisions.
If the job row can carry the hex keys written since a given count without a new table
(say how big that answer can get for 1,280 hexes), add it to `GET .../jobs/:jobId` and
the contract; if not, say why in one line and leave it.

## Owned files (this pass)

`packages/generation/`, `packages/shared/`, `apps/api/`, `tests/api/`, `tests/generation/`,
`tests/shared/`, the contract, `directives/reports/b_generate_density.md`. No engine
file. Not yours: `apps/web`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
`RUN_API_TESTS=1` Builder suites on your own ports, server stopped: a subsector at each
density (the count written is the same on a second run of the same universe, and is
under 80 for the three chances); one hex always written; absent `density` writes all;
the left-empty count is right; Undo restores the before state. Golden and parity green,
no fixture touched.

## Stop rule

Stop when it passes and the report is written.

Write `directives/reports/b_generate_density.md` from `directives/reports/_TEMPLATE.md`.
Under "Needs from others" give Lanes A and D the field, its values and the new count's
name in three lines. Questions for Johnny written out in full, recommended answer
first. After each meaningful step append one line under Progress: "done: X. next: Y."

## Added 2026-10-11 20:15 by the orchestrator (read before you go further)

Your Progress says the local queue stalls near the hundredth message and that you are
moving to "one message walks the job". Before that becomes the design:

- **Say whether the stall is the local queue or the product.** If it only happens
  under `wrangler dev`, name the limit (the version, what stalls, a minimal repro) and
  do not reshape the production job around it: test at a size the local queue carries
  and say so.
- **One message for a whole job has its own ceiling.** A 1,280-hex job in one
  invocation must fit the consumer's wall-clock limit and `cpu_ms = 60000`, a retry
  repeats everything not yet posted, and nothing can ever run side by side. Johnny has
  approved `prompts/b_generate_speed.md` (fewer round trips per hex, larger slices,
  out-of-order safety, then queue settings); a single walking message closes that door.
- If the walking message is still what you judge right, keep it **resumable** (it
  re-enqueues itself with its offset well inside the limits, and a retry starts from
  the last posted offset), write the reason and the measured numbers in the report,
  and put the question to Johnny there. Do not leave the job in a shape where Stop,
  Undo or the counts behave differently from the contract.

## Progress
done: contract names density, leftEmpty, and placed. next: wire the roll through generate and the job.
done: the roll, the job counts, and placed are wired. next: run the unit tests, then the gates.
done: an 80-hex job stayed queued while the worker held 64 hexes before posting. next: post four hexes at a time and rerun the worker test.
done: four-hex slices finish a subsector, then the local queue stalls when the consumer sends the next slice. next: enqueue every slice up front and rerun.
done: pre-enqueued slices still stop near the hundredth message. next: one message walks the job, posting every four hexes.
done: the universe allows 120 mutations a minute and a four-hex post hit that on the fifth subsector. next: post thirty-two hexes at a time and rerun.
