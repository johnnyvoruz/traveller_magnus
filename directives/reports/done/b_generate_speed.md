# B generate speed report
Prompt: prompts/b_generate_speed.md
Status: done

80 hexes: 93.57/s before (855 ms), 115.77/s after at slice 32 (client 691 ms, log wall 605 ms).
640 hexes: 79.05/s before (8096 ms), 93.81/s after at slice 32 (client 6822 ms, log wall 6655 ms).

`apps/api/wrangler.toml` was left as it is. The generate consumer already has `max_batch_size = 1`, `max_retries = 3`, and `dead_letter_queue = "voyage-dlq"`. The one line to add, on Johnny's deploy:

```
[[queues.consumers]]
queue = "voyage-generate"
max_batch_size = 1
max_retries = 3
retry_delay = 10
dead_letter_queue = "voyage-dlq"
```

Leave `max_concurrency` unset. Leave `[limits] cpu_ms` at 60000. Leave `max_batch_size` at 1. Expected gain from those lines for one job: none. The gain is the code below. `retry_delay = 10` only spaces a thrown error. A 429 is already waited inside the consumer, then the job ends with a sentence.

found: one queue message already walks the whole job. The old message still fetched the whole spec, then stopped and read a row per hex, stored trees one after another, and wrote D1 counts after every slice. Store was most of the time.
finished: one slice read (keys, pin, rows), trees stored six at a time, counts once at the end, slice size 32. A job's own batch, fail, and settled posts skip the 120-per-minute budget. A refused job waits twice, then fails with `This universe is busy. Generation stopped. Try again in a minute.`
backed out: the temporary `GENERATE_SLICE` env hook used only to measure 4, 16, 32, and 64. The size is the constant 32.

## Changed files
- `apps/api/src/jobs/generate_queue.ts`: `GENERATE_SLICE = 32`. One message still starts at offset 0 and walks every slice. Slice read replaces the whole-job spec. Rows for the slice come back on that read. Stop is read once per slice, after the trees are stored and before the batch is posted. Trees are headed and put in groups of 6. `object_bytes` and `hex_override_count` update once when the job ends. A retry after the job is already done flushes unsettled bytes once. `GENERATE_PAUSE` sleeps only when that test env var is set. It is absent from `wrangler.toml`.
- `apps/api/src/jobs/generate_pace.ts`: the busy sentence, the two-try wait, and the first missing slice offset.
- `apps/api/src/universe/budget.ts`: GET and HEAD are free. A post with `x-voyage-worker: generate` to `/jobs/:id/batch`, `/fail`, or `/settled` is free. Pin, job create, stop, undo, hex apply, and sector edits still spend the 120.
- `apps/api/src/universe/UniverseDO.ts`: the fetch gate uses that helper. Campaign writes still use their own check.
- `apps/api/src/universe/hexes.ts`: `GET /jobs/:id/slice`, `GET /jobs/:id/state`, `POST /jobs/:id/settled`. The batch accepts `addedBytes` and returns `objectBytes` beside the existing job fields. Fail accepts `{reason, hexKey}` and still accepts an empty body. `objectBytes` and `bytesSettled` live on the job blob. A repeated offset adds nothing. Undo restores written hexes only.
- `apps/api/src/universe/campaign.ts`: two type casts so the journal `images` widen still typechecks. Runtime is unchanged.
- `tests/api/server.js`: `startDev` accepts extra wrangler args. Other callers pass none.
- `tests/api/builder_logic.test.js`: out-of-order slices, a repeated offset, two batches together, undo, and the busy sentence on a failed job.
- `tests/api/generate_speed_logic.test.js`: which posts spend the budget, the wait, and the next slice offset.
- `tests/api/generate_speed.test.js`: byte-for-byte on two hexes, stop mid-job on 640 hexes, undo, then 121 stops until `Too many requests.`

Public `GET` job, stop, and undo answers are unchanged. `BuilderJob` gained no fields. No contract file.

## Before, measured on the old path

Local `wrangler dev`, ports 18845/19845, persist `voyage-speed-jhkMyV`. The server is stopped. User `spd*` with daily limit 10000, density every, top-down, MgT2, `truthVersion` null, seed `TravellerMagnus`. Client wall is the wait on the generate POST.

| Job | Hexes | Wall | Hexes/s | Placed | State | Job id |
|---|---:|---:|---:|---:|---|---|
| Subsector | 80 | 855 ms | 93.57 | 80 | done | `01M4SAAGJFAA7ZT3FPZRY9FXJ6` |
| Wide | 640 | 8096 ms | 79.05 | 640 | done | `01M4SAAHD1HJJYY522DMQKA8DM` |

Universe `01M4SAAGGXFQX629S8DV6HF4E8`. Sums across each 32-hex slice (spec and pin are the one opening call, repeated on the log line): spec about 2 ms, pin 2–3 ms, stop check 7–50 ms, row read 6–24 ms, chart 0–1 ms (no truth), generate 21–76 ms, store 87–336 ms, batch 7–20 ms, counts 3–8 ms (one outlier 48 ms). Store was about 60% of a slice. A local Durable Object round trip was about 1 ms. The cut still matters in production, where that same per-hex stop and row read would pay real object latency.

## After, slice sizes 4, 16, 32, 64

Same method, ports 18847/19847, persist `voyage-speed-after-s9GzBZ`, universe `01M4SB4CT23YXR67KV68Z7WNZZ`. The server is stopped. Client time includes the POST wait. Log wall is the generate-time line. The slice was injected with `wrangler dev --var GENERATE_SLICE:N` and the hook was then removed.

| Hexes | Slice | Client | Hexes/s | Slices | Slice read | Stop | Generate | Store | Batch | Count | Log wall | Job id |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 80 | 4 | 822 ms | 97.32 | 20 | 57 | 14 | 185 | 378 | 101 | 8 | 753 | `01M4SB4ESEQGB7QFK4D7BE977H` |
| 80 | 16 | 1170 ms | 68.38 | 5 | 26 | 11 | 310 | 558 | 89 | 19 | 1030 | `01M4SB4K0G5Q63XQNTAPE0MC4Z` |
| 80 | 32 | 691 ms | 115.77 | 3 | 12 | 3 | 198 | 333 | 40 | 10 | 605 | `01M4SB4RKS3XES469YXZVDVQ0J` |
| 80 | 64 | 902 ms | 88.69 | 2 | 14 | 3 | 236 | 425 | 71 | 30 | 798 | `01M4SB4W50Q6FGN1WM7BV2HRKT` |
| 640 | 32 | 6822 ms | 93.81 | 20 | 227 | 26 | 1769 | 4118 | 477 | 16 | 6655 | `01M4SB4ZRKXGS49NNEM696YQPV` |
| 640 | 64 | 5948 ms | 107.60 | 10 | 117 | 11 | 1673 | 3564 | 369 | 22 | 5780 | `01M4SB596P9X9M5R5W5E8PGEXM` |

The 16-hex 80-hex run is slower than its neighbours. Treat it as a cold start. Generate CPU on the 640-hex job is 1769/20 ≈ 88 ms per 32-hex slice, and 1673/10 ≈ 167 ms per 64-hex slice. Both sit far under `cpu_ms` 60000. Store is still the largest bucket (4118 ms of 6655 ms on the 640-hex slice-32 run).

Shipped size is 32. It is faster than the old path on both sizes (80: 855 ms → 691 ms; 640: 8096 ms → 6822 ms), and a retry repeats 32 hexes. Slice 64 is faster only on the 640-hex job and slightly slower than the old path on an 80-hex subsector (902 ms, 88.69/s, against the old 855 ms and 93.57/s).

An earlier stop-test timestamp, with polling in the same process, finished a 640-hex job in about 4.2 s (`createdAt` 2026-10-13T00:36:29.469Z, `finishedAt` 2026-10-13T00:36:33.633Z). That run is a different setup. The table above is the pair to compare.

## What Stop guarantees

At the start of a slice, a job already `stopped`, `done`, or `failed` generates nothing. The slice in hand is generated, then `GET /jobs/:id/state` runs. The slice is posted either way. If the job is stopped, no later slice starts. Hexes in slices that never started are unwritten. Undo covers written hexes only.

Local wrangler does not interleave the consumer with HTTP polls, so a 640-hex job can finish before a 5 ms poll sees `0 < done < total`. The worker test passes `--var GENERATE_PAUSE:40`, which sleeps after a batch is posted and before the posted state is read. Production leaves the variable unset, and the sleep is 0. Stop during slice N still writes slice N, so `done` jumps by the slice size. A poll has to land between slices.

## What reads the counts mid-job

`GET /api/universes` shows `object_bytes` and `hex_override_count` on the universe card. Both stay at their opening values until the job ends, so the card is stale while a job runs. Job progress is the Durable Object row (`done`, placed), which the screen already polls.

The quota check reads D1 once at the start of the message, then keeps a baseline in memory. The D1 write waits until the job ends. Two jobs on the same universe can race that quota. A per-universe lock belongs in the Durable Object (taken by the slice read), which already runs one request at a time. `hex_override_count` is an absolute set from `GET /hexes/count` and is safe to repeat.

`finishCounts` adds `max(0, floor(accounted) - floor(settled))` to D1, then `POST /jobs/:id/settled` with the accounted total. A retry that finds the job already finished still flushes once, and a second retry adds nothing after the mark. If the process dies after the D1 increment and before the settled mark, a retry adds those bytes again. That window is open. A crash between the last batch and `finishCounts` is covered, because the early terminal path reads `objectBytes` and `bytesSettled` off the slice.

## The stall at 68 of 80, and the stall at 32 of 80

68 of 80 was the product. Each post was one universe mutation, the budget is 120 a minute, and the fifth subsector of 4-hex posts received `Too many requests.` The job stayed `running`. Slice 32 makes that exact run three posts, so it no longer reproduces the stall.

32 of 80 was local only. The density report ran two wrangler processes, and a job's second and third messages never ran, so the job sat at 32 of 80. This pass keeps one queue message per job, so a dropped follow-up cannot leave a hole. Production queues retain a delivered message, retry it (`max_retries = 3`), and the dead-letter queue calls `POST /jobs/:id/fail`. That delivery contract was read from the docs below. It was not demonstrated on the production queue.

The budget protects interactive posts: pin, job create, stop, undo, hex apply, and sector edits. A job's own `POST /jobs/:id/batch`, `/fail`, and `/settled` with header `x-voyage-worker: generate` do not spend it. The public door builds its request with only `content-type`, and those three paths are not on the public routes, so a browser cannot take the exemption. On 429 the consumer waits twice (`Retry-After`, capped at 60 seconds) and then marks the job `failed` with `This universe is busy. Generation stopped. Try again in a minute.` on the next hex. The job does not stay `running`. The worker test posts 121 stops, receives that 429, and shows the next generate is refused too, so the budget still caps interactive work.

Resume uses `nextSliceOffset` (the first missing slice offset). A tail that lands first does not hide a hole. One message per job stays. There is no fan-out.

## Retry of a slice

`applyJobBatch` ignores a repeated offset: `done` and `objectBytes` stay put. The unit test lands offsets 3, 1, 0, 2, repeats offset 3, and `accountedBytes` stays 40. `storeTrees` heads an existing hash and skips the put, so added bytes are 0. `nextSliceOffset([64], 80, 32)` returns 0. Two batches posted together both land, because the object runs one request at a time. The unit test uses `Promise.all` of two synchronous calls, which still serialize. Workers allow 6 simultaneous outgoing connections. Store uses that as the chunk size.

`densityKeeps` treats a hex as alone only when `spec.total === 1` (the whole job). A 1-hex tail of a longer job is a tail. Queued jobs are always more than one hex. A single hex stays inline in the builder route.

The byte-for-byte worker test generates `blank/0101` and `blank/0102`, reads the stored object, and compares it to `stable(generateHex(...))` with the default seed, the default settings, and engines package 1.1.0. `GET` universe then has `objectBytes > 0` and `hexOverrideCount === 2`. Undo of that job restores 2. The 640-hex job is stopped between slices (`GENERATE_PAUSE` 40), `done` is between 0 and `total`, undo restores exactly the placed length, and the first placed hex is 404.

## Queue settings (read 2026-10-12, not applied)

- [Queues limits](https://developers.cloudflare.com/queues/platform/limits/), page last updated 2026-04-21. Maximum batch size 100. Maximum batch wait 60 seconds. Push consumers: 250 concurrent invocations. Consumer wall time 15 minutes. Consumer CPU defaults to 30 seconds and can be raised to 5 minutes.
- [Consumer concurrency](https://developers.cloudflare.com/queues/configuration/consumer-concurrency/), page last updated 2026-04-21. An unset `max_concurrency` scales up to that platform maximum of 250. Cloudflare recommends leaving it unset. Setting a number caps it. A retry is not a failed invocation.
- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/). `max_batch_size` and `max_batch_timeout` are the consumer keys.
- [Queues get started](https://developers.cloudflare.com/queues/get-started/). `max_batch_size` defaults to 10 and `max_batch_timeout` defaults to 5 seconds. A larger batch waits until it is full or the timeout fires. This job sends one message, so a larger `max_batch_size` only adds waiting. `max_batch_size = 1` is the match.
- [Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/), page last updated 2026-06-01. Each object is single-threaded, soft 1,000 requests per second, CPU 30 seconds by default and configurable to 5 minutes, 6 simultaneous outgoing connections. Several consumers writing the same universe queue on that one object. They do not run its SQL in parallel.

One job is one message, so one person takes one consumer. Several people run in parallel, up to the unset scale of 250. Two consumers on the same universe wait on the single-threaded object and do not go faster. A cap per universe would live in `UniverseDO`, as a lock taken by the slice read. `max_concurrency` cannot name a universe.

## Gates
npm test:      pass (1524 tests, 1503 pass, 0 fail, 21 skipped, about 27.4 s). Re-run after the settled-bytes change. The 21 skipped tests are the `RUN_API_TESTS` worker suites.
npm run check: pass (manifesto clean)
typecheck:     pass (`tsc --noEmit -p apps/api`, exit 0, including after the settled route)
fourth gate:   the speed worker test and the density worker test passed together after the settled route (about 13 s and 12 s, ports 18846/19846 for speed). Stop, undo, the byte compare, and the 429 burst are in that speed test. Out-of-order, repeat-offset, and two-at-once are in `tests/api/builder_logic.test.js`, which `npm test` runs. The eight Builder worker suites (builder, allowance, close, density, dots, form, sector, sector generate) passed 8/8 in about 55 s on their own ports before the settled route. Public answers did not change. Those eight were not all re-run after the settled route. Density, which walks the generate path, was.
npm run build: fail in `apps/web/src/surface/vanilla/gl.ts` (Lane C). See Needs from others. This lane did not edit that file.

Servers from these runs are stopped in each test's `finally`.

## Contract published
none

## Needs from others
- Lane D: a failed job stores the sentence on `failures[].reason`. The screen lists the hex key. While the universe is busy, the person sees a failed hex until that lane shows the reason. The sentence is `This universe is busy. Generation stopped. Try again in a minute.`
- Lane C: `npm run build` fails in `apps/web/src/surface/vanilla/gl.ts`. `tiltOpen` and `tiltWarmed` are unused (TS6133 at lines 248 and 249). The object passed as `DiscBaker` is missing `warmTilt` and `tiltIsWarm` (TS2739 at line 847). This lane did not edit `apps/web`.

## Questions for Johnny
1. Keep `GENERATE_SLICE` at 32. An 80-hex subsector is the common job, and 32 is the fastest measured size there (115.77/s, 691 ms) and still faster than the old path on 640 hexes (93.81/s, 6822 ms). A retry repeats 32 hexes. Switch to 64 only if the long job matters more: 640 hexes would move to 107.60/s (5948 ms), and an 80-hex subsector would move to 88.69/s (902 ms), which is slower than the old 93.57/s.
