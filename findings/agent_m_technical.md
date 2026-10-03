# Technical findings — Agent M, 2026-10-03

Scope: `apps/`, `packages/`, `tests/`, `tools/`, `scripts/`, the current directives, and the
production deployment at `traveller.voyage` / `cdn.traveller.voyage`. The legacy tree was not
reviewed (Agent X has it).

Baseline, run here today: `npm test` 45 tests, 41 pass, 4 skipped, 0 fail. `npm run check`
clean. `tsc --noEmit` in `apps/api` fails (T9).

Severity: **A** blocks the next slice or loses data · **B** will bite within a slice ·
**C** worth fixing when the file is next open.

---

## A. Blocks slice 1 or the truth release

### T1 — The CDN sends no CORS header (A, confirmed)

```
curl -I -H "origin: https://traveller.voyage" https://cdn.traveller.voyage/objects/<hash>
→ 200, Content-Encoding: br, Cache-Control: public, max-age=31536000, immutable
→ no Access-Control-Allow-Origin
```

The SPA is served from `traveller.voyage`; truth files are on `cdn.traveller.voyage`. That is
a cross-origin `fetch`, and the browser will refuse the response. `architecture.md` §1 says
"one domain, no CORS"; that is true for `/api`, not for the CDN.

**Fix:** a CORS policy on the `voyage-public` bucket: `GET`, `HEAD` from
`https://traveller.voyage`, `https://preview.traveller.voyage` and the local dev origin.
Truth is public, so `*` is also defensible. Record it in `architecture.md` §6, because a
bucket setting that lives only in the dashboard will be forgotten.

### T2 — The CDN is not caching anything (A, confirmed)

The same response carries `cf-cache-status: DYNAMIC`. Cloudflare caches by file extension by
default; `objects/<hash>` has none and `.json` is not on the default list. So the
`immutable` header reaches browsers, but the edge passes every request to R2. `architecture.md`
§3 ("CDN-cached, immutable") and the one-second cold-load budget both assume an edge hit.

**Fix:** one Cache Rule on host `cdn.traveller.voyage`: eligible for cache, respect origin
TTL. Check with two requests; the second must say `HIT`.

### T3 — The dead-letter consumer overwrites the real error (A, confirmed)

`apps/api/src/jobs/dead_letter.ts:12-18` upserts `error = 'dead-lettered…'` for any sector
that is not `done`. A message that throws four times is first marked `failed` with its real
error by `truth_build.ts:21`, then goes to `voyage-dlq`, where this consumer replaces the
text.

Confirmed in production: the handoff (§11) records `Veg_Fergakh` and `Far_Frontiers` failing
with `put: We encountered an internal error (10001)`. Both rows now read `dead-lettered: the
invocation died without throwing`, updated 15:16Z today. The one piece of evidence that
separated "R2 write pressure" from "killed invocation" is gone.

**Fix:** update only `WHERE state = 'building'`. A row already `failed` keeps its error.

Second defect in the same file: it treats any message with a `version` and a `slug` as a
truth-build message. `voyage-generate` and `voyage-publish` share the same dead-letter queue
(`wrangler.toml:54-63`). Put a `kind` on every queue message now, before slice 2 adds the
other two consumers.

### T4 — Truth v1 is not built, and the cause is still a guess (A, confirmed state)

State read from D1 at about 15:20Z:

| State | Sectors | Note |
|---|---|---|
| `done` | 298 | 75,513 systems; last finished 08:01Z |
| `failed` | 204 | all `dead-lettered`, written 15:16Z when the new consumer drained the queue |
| `building` | 10 | `updated_at` 07:40Z, never touched; no dead-letter message arrived for them |

`manifest.json` is 404; `/api/health` reports `truthVersion: null`. The retry has not been
run. One correction to the handoff: Spinward Marches is `done` (439 systems), not stuck.

The handoff says of its own diagnosis "likely, not proven", and asks for a Workers Logs
screenshot. That has not happened. The fix that was deployed (25-row slices, concurrency 6)
is reasonable whatever the cause, but if it is wrong the retry will stall the same way and
cost another half day.

**Do, in order:**
1. Before the retry, open Workers Logs for 07:40-08:05Z and read the outcome of the failed
   queue invocations. `exceededMemory`, `exceededCpu` and `canceled` each point somewhere
   different.
2. Run the retry (expect `enqueued: 214`) and watch the first five minutes. If any sector
   dead-letters again, stop.
3. If it stalls again, take Johnny's offer and build locally (`npm run truth:local`, upload
   over the S3 interface). A truth build is a rare, admin-only batch job of 180,000 systems.
   Node and workerd are both V8, and `tests/api/parity.test.js` already proves the Worker and
   Node produce the same hash. Running it through Queues is the hard way to do it, and it is
   not the product. I would not spend a third day on it. (Inferred; decision D2.)

Other things in the generation path that could matter and were not considered:

- `auditBacklog` (`packages/engines/src/core/audit.js`) is a module-level array that the
  auditors push to and the generation path never clears. It grows for the life of an
  isolate. Small (four entries for Spinward Marches), but it is a leak by construction.
- Eleven engine files call `console.*` directly. Under a bulk build that is log volume in
  Workers Logs, already noted in the handoff.
- `buildSlice` reads and parses the whole TSV for every 25 rows
  (`truth_build.ts:30-38`). A 1,029-row sector parses it 42 times. Cheap, but it is the same
  shape of waste that caused the first failure.

### T5 — Search: no prefix match, and it serves the unreleased build (A, confirmed)

```
GET /api/truth/search?q=Regi    → { items: [] }
GET /api/truth/search?q=Regina  → one row, version "v1"   (v1 is not released)
```

`apps/api/src/routes/truth.ts:45-53`:

- The query is wrapped as an FTS5 phrase, `"Regi"`, which matches whole tokens only. The
  viewer's search box is type-ahead (plan slice 1: "search Regina, fly there"). It needs
  `"regi"*`, and the FTS table should declare `prefix='2 3'`.
- With no `version` parameter the query runs over every version, released or not. After v2
  exists every hit is returned twice. Default to the latest released version; refuse a
  version that is not released.
- No `ORDER BY rank`, so the 50 rows returned for a common token are arbitrary.

### T6 — The sector index is about to be frozen with two defects (A, read + confirmed locally)

`packages/generation/src/index.ts:121,128` builds each entry as
`{ tree, ...projection, summary: projection }`. The local Spinward Marches index shows it:

```json
"1910": { "name": "Regina", "uwp": "A788899-C", …, "summary": { "name": "Regina", "uwp": "A788899-C", … } }
```

1. **Every field is stored twice.** 187 KB of the 327 KB file is hexes; half of that is the
   copy.
2. **`summary` is not what the spec says it is.** `data_model.md` §3 and §5 define it as the
   remaining sector-scale fields (stellar data, counts, extensions). None of that is in the
   index. The map cannot draw a star type, and the dossier cannot show a line about the
   system, without fetching the 89 KB tree.

Index files are served `immutable` for a year, and 298 of them are already written under
`truth/v1/`. The viewer does not exist yet and v1 is not released, so today is the cheapest
day this will ever be to fix. Tree objects are content-addressed and shared between
versions, so a v2 build writes new indexes and no new trees.

**Recommendation (decision D1):** fix the entry shape, add the sector-scale fields the map
renderer and dossier header need (the slice 1 recipe should list them from `renderer.js`),
build as `v2`, and never release `v1`.

Also not in the index: the wiki data (`feature_inventory.md` E4, "folded into truth sector
files at build"). The schema has an optional `wiki` key; the job never writes it. Put it in
a separate `truth/<v>/sectors/<slug>/wiki.json` so the index stays small.

### T7 — There is no far-zoom tier for the map (A for slice 1, inferred)

The viewer story opens on the whole chart. The only map data is one index per sector:
about 745 bytes per system uncompressed, 180,312 systems, so roughly 130 MB for the full
chart (399 canonical sectors). The budget is cold load to interactive in under one second.

The manifest (512 small entries) is enough to draw sector outlines and names. Between that
and the full index there is nothing.

**Fix, in the slice 1 recipe:** state three zoom tiers and what each one fetches. A
per-version overview file (per system: sector, hex, and one byte for zone or importance) is
about 1 MB for the whole chart and lets the far view show real density. Indexes load only
for sectors on screen below a zoom threshold.

### T8 — The viewer has no way to learn the current version (B, read)

Truth files are immutable and versioned by path. `architecture.md` §3 says viewers never
touch the Worker. Then nothing tells a cold browser whether to read `v1` or `v2`.

**Fix:** either `truth/current.json` on the CDN with a short `max-age` (the one mutable file),
or accept one API call (`/api/truth/versions`) and correct the sentence in §3. Search is
already an API call, so the second is honest and simpler.

---

## B. Process and safety

### T9 — Production deploys on every push, with no gate (B, read)

- There is no `.github/` directory. The test workflow in `slice_0_foundation.md` §13.2 was
  never written (the handoff lists it as open).
- Workers Builds runs `npm ci && npm run build`, then migrations and deploy. It does not run
  `npm test` or `npm run check`.
- The branch everyone works on, `campaign`, is the production branch. `architecture.md` §12
  says production deploys from tags and previews from pull requests. That is not how it is.
- `tsc --noEmit` in `apps/api` fails: type errors in `src/index.ts` and the auth files (the
  handoff counts 7), 13 `TS5097` from `packages/shared`, and `TS7016` because
  `@voyage/engines` has no type declarations. Wrangler
  does not type-check, so a type error reaches production.
- Remote D1 migrations run automatically on that same push.

With one developer and a holding page this has been survivable. The day a universe holds
somebody's campaign it is not.

**Fix:** (1) add `npm test && npm run check` to the build command today, one line;
(2) `typecheck` script plus the fixes, already planned for Agent B; (3) decide D3: production
from `main`, `campaign` as a preview environment (`[env.preview]` already exists in
`wrangler.toml:93`).

### T10 — Auth helpers that will not survive slice 2 (B, read)

`apps/api/src/auth/session.ts`:

- `requireRole` (line 47) is an exact string match. An `admin` fails a `reviewer` check.
  Slice 5 needs an ordering (`user < reviewer < admin`).
- `originAllowed` (line 25) returns `true` when there is no `Origin` header. Fine with
  `SameSite=Lax` today; write the reasoning down next to it.
- `routes/generate.ts:9-23`: the rate limiter is a `Map` in module memory. Each isolate has
  its own, so the limit is not a limit, and the map never drops a user. `architecture.md` §7
  specifies a token bucket in the Durable Object; this is a placeholder that looks finished.
- `routes/auth.ts:25-38`: the handle is derived from the X display name on first `/api/me`
  with a check-then-insert loop. Two tabs race into the unique constraint and get a 500.
  More important: the handle becomes the permanent namespace for sector slugs
  (`johnny~Sandbox_Alpha`, `data_model.md` §5). It needs a claim step, a reserved list, and a
  rule for renames, before the first builder creates a sector.

### T11 — `/api/health` cannot prove a deploy and wakes a Durable Object (C, read)

`routes/health.ts:13-17` fetches a Durable Object named `schema` on every call and reports
the engines package version as the app version. The handoff lists "health does not change
with a deploy" as a trap. Add the Worker version metadata binding and return the version id
and timestamp; then a deploy is provable with one `curl`. Drop the Durable Object call, or
an uptime monitor will keep that object alive forever.

### T12 — "Engines are pure" is true only by discipline (B, read)

Manifesto §2.3 says engines take input and return output with no globals. In
`packages/engines/src/core/` the settings, the RNG, `usedNames`, the trace buffer, `genState`
and `auditBacklog` are all module-level singletons. `generateHex`
(`packages/generation/src/index.ts:39-41`) sets them and then runs.

This is correct today for one reason: `generateHex` is synchronous, so no other request can
run between `configure` and the return. Nothing states or tests that. The first `await`
inside a generation path, or enabling the trace per request (`trace.lines` is never cleared),
breaks determinism silently and only under load.

**Fix:** write the invariant into `architecture.md` §5, and add a test that `generateHex` is
not an async function and that two interleaved calls with different settings give the same
hashes as two sequential ones. Reset `auditBacklog` and the trace at the top of `generateHex`.

### T13 — The zod schemas do not describe what the job writes (B, read)

- `TruthManifest` (`packages/shared/src/schemas/truth.ts:38`) has no `tags`, `canonical`,
  `built`, `partial`; the release route writes all four (`routes/admin.ts:213-224`) and can
  write `x: null` where the schema says number.
- `SectorIndex` has no `systems`, `built`, `partial`, `tags`, `canonical`.
- `buildSector` still hard-codes `truthVersion: 'v1'` (`generation/src/index.ts:78,188`).
- Nothing parses a produced index or manifest with its schema. `architecture.md` §7 says
  unknown keys are rejected; the schemas are not strict.

The viewer will be written against these schemas. **Fix:** make them match, make them
strict, and add one test that validates the locally built index and manifest.

### T14 — Durable Object schema has no migration path (B, read)

`apps/api/src/universe/schema.ts` defines every table twice (drizzle objects and raw SQL)
and migrates with `CREATE TABLE IF NOT EXISTS`. `schemaVersion` is written as `'1'` and never
read. Every column except keys is nullable. `drizzle(storage, …)` on line 186 builds a client
and throws it away.

Slices 2 and 3 add columns and the campaign tables. `IF NOT EXISTS` cannot alter a table, and
each universe is its own database, so a missed migration is per customer. Build the version
ladder (read `schemaVersion`, apply numbered steps in one transaction) before the first real
universe is created. The D1 side has the matching problem already recorded: drizzle's
journal knows three of five migrations.

### T15 — Players' views on a public bucket cannot be revoked (B, read)

`api.md` slice 4: a players' publish writes static files to
`players/<universeId>/<publishId>/` in the public bucket; `DELETE` revokes. Access control is
an unguessable URL. If those files get the same one-year `immutable` header as everything
else in that bucket, revoking deletes the origin copy and every browser and edge that has it
keeps it. See Features §2 for why this should not be static at all once players have accounts.

---

## C. Smaller, or documentation

### T16 — Documents disagree with measurements

| Document says | Measured |
|---|---|
| `architecture.md` §10: one object about 50 KB | 89 KB as stored (pretty-printed); 53 KB compact; 9 KB brotli on the wire |
| `architecture.md` §11: about 8 GB per version | about 13 GB (handoff) |
| `architecture.md` §4: about 56,000 systems | 180,312 rows |
| `architecture.md` §10: full build under 30 minutes | not yet achieved once |
| `CLAUDE.md`: `npm run truth:build` | script is `truth:local` |
| `handoff.md` §11: Spinward Marches stuck | `done` |

### T17 — Pretty-printed objects cost 40% more storage (C, confirmed locally)

`stable()` indents with two spaces (`packages/shared/src/stable.ts:9`). One tree: 89,108
bytes as written, 53,011 compact. Brotli hides it on the wire. R2 storage is cheap, so this
is not urgent, but the hash is taken over these bytes, so it can only change at a version
boundary. If D1 goes to v2 anyway, decide it then.

Same sample: `body.mgt2eData` and `body.mgtSocio` are byte-identical (2,807 bytes each).
That is legacy engine output and parity forbids touching it; it is reported here, not fixed.

### T18 — Manifesto checks that do not exist yet

The manifesto promises checks; `scripts/check_manifesto.js` implements the grep ones. Missing:
a cold-load test per route, the Lighthouse layout-shift run, the one-second progress check.
They belong in the slice 1 recipe. Gaps in the checker itself:

- only the first `<style>` block of a `.vue` file is scanned (line 26);
- only static `from '…'` imports are checked; `import('…')` and bare `import '…'` pass;
- colours and durations in template `style=` attributes or TS strings pass;
- bracket access (`window['x']`) passes, as the handoff already found.

### T19 — Slice 0 is not closed, and its list is unticked

All twelve boxes in `slice_0_foundation.md` (lines 945-956) are empty. Several are true
today. Tick them honestly when v1 or v2 is released, or slice 1 starts on a foundation nobody
has signed off.

### T20 — Nothing limits what one account can cost

`universes.object_bytes` and `hex_override_count` exist as counters. No directive states a
quota: universes per user, bytes per universe, generations per day, image bytes. Generation
is CPU on your bill. Write the numbers into `architecture.md` §7 before sign-in is opened to
anyone but Johnny.

---

## What is in good shape

Said plainly, because it should not be re-litigated:

- **Engine parity.** Ten golden cases byte-equal between legacy and ESM, with a Node-versus-Worker
  parity test. This is the asset; it is protected properly.
- **The storage model.** Content-addressed objects, pointer rows and manifests is the right
  shape for versions, packages and migration, and the slice design makes duplicates harmless.
- **Partial UWPs.** Refusing to invent digits for 24,090 survey rows is exactly the
  Zero-Assumption Policy applied to data.
- **The boundaries.** `shared` imports only zod, the web app cannot import engines, and the
  checker enforces both.
- **The handoff discipline.** The traps table saved me an hour. Keep it.
