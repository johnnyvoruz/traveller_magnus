# Lane B — make a generate job faster: fewer round trips per hex, then the queue settings

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/B.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Do `prompts/b_generate_density.md` and `prompts/b_generate_cap.md` first if
they have no report yet: the cap is the cost guard and goes before speed. This prompt
replaces part 3 ("report only") of the cap prompt; if you already wrote that report,
use its numbers as the "before".

## Why

Johnny, 2026-10-11: "what's the plan to juice up the worker to crunch system
generation a little faster".

## What the orchestrator read in `apps/api/src/jobs/generate_queue.ts`

A job of N hexes becomes N/4 queue messages (`GENERATE_SLICE = 4`), all sent at once.
Each message (`runBatch`) does, for its four hexes:

- one `/jobs/:id/spec` call that returns the **whole** job (every hex key and every
  captured rev, for up to 1,280 hexes), one `/pin` call;
- per hex: one `/jobs/:id` call to see whether the job was stopped, one row read, the
  generation itself in the Worker, one `storeTree` (an object write), in sequence;
- a chart index fetched into a map that lives only for that message;
- one `/jobs/:id/batch` POST, a D1 update of `object_bytes`, a `/hexes/count` call and
  a second D1 update.

So four hexes cost about eighteen awaited round trips, most of them to the one
universe object, which answers one at a time. The generation itself is probably the
small part. Confirm or correct this by measurement before changing anything.

Config today (`apps/api/wrangler.toml`): `voyage-generate` has `max_batch_size = 1`,
no `max_concurrency`, `max_retries = 3`, no `retry_delay`; `[limits] cpu_ms = 60000`.

## Do, in this order

1. **Measure first.** For an 80-hex and a 640-hex job on a local server: wall time,
   hexes per second, and per message the time in each step above (spec, pin, stop
   check, row read, generate, store, batch, counts). Paste the table. Every later step
   is judged against it.
2. **Cut the round trips** (code, the safe part):
   - the spec call returns only the slice it is asked for (keys and captured revs for
     `offset..offset+n`) and the job's fixed fields; the pin rides on the same answer;
   - one call reads the slice's rows; the stop check is once per slice, and again
     before the batch is posted (a stopped job must still write nothing more than the
     slice in hand: say what Stop now guarantees);
   - the slice's trees are stored together, not one after another;
   - `object_bytes`, `hex_override_count` and the count call happen once when the job
     finishes, not once per message, if nothing reads them mid-job (say what does).
3. **Then the slice size.** With the overhead gone, measure 4, 16, 32 and 64 hexes per
   message. Choose the size by throughput and by what one failed or retried message
   costs (a retry repeats the whole slice: it must be safe to repeat, show the test).
   Stay far inside the CPU limit; say the CPU time of the largest slice.
4. **Out-of-order and concurrent messages.** `finished` is set by whichever message
   holds the last offset. If consumers run in parallel, that message can land before
   earlier ones. Show, with a test that delivers the slices out of order and two at
   once, that the job ends only when every slice has reported, that progress never
   goes backwards, and that Undo covers every hex. Your density run had a job stop at
   68 of 80: say whether this is why, and fix what is wrong either way.
5. **The queue settings: recommend, do not edit.** `wrangler.toml` goes out with
   Johnny's deploy, and the right numbers depend on Cloudflare's current limits, which
   you must read from their documentation, not from memory (cite the page and the date
   you read it): what concurrency a consumer gets when `max_concurrency` is unset,
   whether a larger `max_batch_size` with a short `max_batch_timeout` helps here or
   only adds waiting, and what a universe object's one-at-a-time rule does to several
   consumers writing the same universe. Give the exact lines you would change, the
   expected gain from your measurements, and the cost side: one person's job should
   not be able to take every consumer. If a cap on concurrency per universe is wanted,
   say where it would live.
6. **Do not change** what a job produces (same systems for the same seed, hex and
   settings: a test that compares a job's output before and after, byte for byte), the
   contract's answers, the daily cap's counting, or any engine file.

## Owned files (this pass)

`apps/api/` (not `wrangler.toml`), `packages/shared/` and `packages/generation/` if a
shape moves, `tests/api/`, the contract if a route's answer changes (it should not),
`directives/reports/b_generate_speed.md`. Not yours: `apps/web`, the engines.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
`RUN_API_TESTS=1` Builder suites on your own ports, server stopped; the before and
after table; the byte-for-byte test; the out-of-order test; Stop mid-job; Undo after.

## Stop rule

Stop when steps 1 to 4 pass and step 5 is written. Put the before and after hexes per
second and the recommended `wrangler.toml` lines at the top of the report.

Write `directives/reports/b_generate_speed.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress
