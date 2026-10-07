# Agent B — the derived build made fast and safe to rerun

Issued 2026-10-07 by the orchestrator. You may start this now, while v6 builds.
**Nothing here is deployed or pushed until v6 has finished**: the orchestrator holds your
files out of every push until then. No production call of any kind, no deploy, no git.
`b_engine_t1_7.md` (the v6 evidence) still comes first the moment v6 finishes: if you are
told it has, stop here at a green point, do T1.7, then return.

## Why

v6 is healthy but slow. Measured from the CDN on 2026-10-07 at 02:00 UTC (handoff §179):
170 of 512 sectors in 2 h 28 min, about 52 s a sector, drifting from 50 s to 60 s, so
about 7.5 hours in all. A full generation of the same sectors took 13 minutes. If the
evidence leads Johnny to change the policy, the next derived build must not cost a night.

Read in `apps/api/src/jobs/truth_build.ts`, `jobs/reconcile_transform.ts`,
`routes/admin.ts` and `wrangler.toml`:
1. a slice reconciles its 25 hexes one after another (an `await` in a loop: an R2 read,
   the transform, a hash and an R2 write for each);
2. `finishReconcile` then fetches every object of the sector again, one by one, with
   `get`, only to prove it exists;
3. `writeTotalReport` runs after **every** sector and re-reads **every** finished sector's
   report: 170 reads and an 8 MB write at sector 170, 512 and about 24 MB at the end;
4. up to six finishers rewrite that total at once from a listing, so the last writer can
   miss a neighbour;
5. the total is stored `immutable` for a year although it is rewritten, so the CDN's edge
   serves the first copy for ever at the plain address (it showed two sectors at 170).

## Build

1. **A slice in parallel, bytes unchanged.** The hexes of a slice are reconciled
   concurrently, in bounded groups (say the bound and why, against the platform's limits).
   The part written must be **byte-identical** to the serial one: hexes and report merged
   in the slice's key order after the awaits, never in completion order. A test builds one
   slice both ways and compares the bytes.
2. **The existence check:** `head`, in the same bounded groups. Same refusals, same words.
3. **The total report, once.** Written when the last sector of the version is done (none
   queued or building), not after each sector, and safe to write again. Two finishers at
   once must not lose a sector: say how you guarantee it, and test the case.
4. **What the total holds.** Counts and the by-kind tables; the lists of unresolved and
   blocking bodies stay in the per-sector reports, which already hold them. If anything
   reads the lists from the total, say what, and bump the report's `schemaVersion` rather
   than changing its meaning silently.
5. **Cache headers.** No `immutable` on any key that is ever rewritten (the total; check
   each sector's `index.json`, the provenance file and anything else the job writes more
   than once). Content-addressed `objects/` keep it. List every key and its header in the
   report.
6. **Lanes.** Leave `wrangler.toml` and `FEED` as they are; say what you would set with
   the slice now faster, and what it would need (Johnny owns that file's deploy).
7. **`resolveCatalogue`** skips a version directory that has a catalogue and no sector
   files, which is what stopped v6's first start (§167: a leftover
   `inputs/v5/sectors.json`). A test of exactly that case.
8. **An admin route to remove a version that never released** (`building` or `failed`,
   never `released`): its D1 rows and what lies under `truth/<version>/`, and nothing
   under `objects/`. It takes the version's name twice (path and body) and refuses when
   they differ or when the version is released. Tests for each refusal and for a clean
   removal. It is written and tested here; only Johnny ever calls it.

## Check

Parity first: for the fixture sectors, the published index, every per-sector report and
every object hash are the same bytes as before your change (a test pins them). Then the
time: one fixture sector before and after, locally, with the numbers. `npm test`,
`npm run check`, `npx tsc --noEmit -p apps/api`, pasted; the `tests/api` suite with
`RUN_API_TESTS=1` if your changes touch a route it covers. Nothing under `apps/web`,
`packages/shared` (Agent A is adding the journal's schema there) or `packages/engines`.
Stop and report: what changed, the measured gain, each key and its cache header, and
anything you would not do.
