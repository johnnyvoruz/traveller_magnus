# Architecture — Traveller.voyage on Cloudflare

**Status:** ADOPTED 2026-10-02 (third revision the same day: the platform owns compute).
Companion to `plan.md`. Changes here are decisions, not drift: propose them to Johnny, then edit.

---

## 1. Stack

| Layer | Choice | Why this and not something else |
|---|---|---|
| UI | **Vue 3 + Vite + TypeScript**, Pinia, vue-router | Johnny's daily stack. Vue owns panels, routing and state; the map, orrery and planet renderers are plain TS classes outside reactivity |
| Edge + API | **One Cloudflare Worker** with Static Assets (the SPA) and **Hono** for `/api/*` | One deployable, one domain, no CORS |
| Compute | **The same Worker runs the engines.** Interactive generation answers inline; bulk generation and truth builds run as **Queue** consumers | One runtime (V8) builds every system, so output is deterministic for everyone; the browser never ships engine code |
| Catalogue database | **D1** via **Drizzle ORM**; FTS5 for search | Users, sessions, universe list, packages, proposals, truth search index: global and relational |
| Per-universe database | **One Durable Object per universe** with SQLite storage, Drizzle `durable-sqlite` | Each universe is its own database: isolated, serialized writes, point-in-time recovery, no shared ceiling, deleted by dropping one object; the home for live co-editing later |
| Object store | **R2**, content-addressed (`sha256`), immutable | Trees, images, snapshot bodies, package contents stored once and pointed at many times |
| Static delivery | **R2 public bucket** on `cdn.traveller.voyage` | Truth indexes and objects, package manifests, players' views: CDN-cached, immutable |
| Auth | **better-auth** with its Drizzle adapter on D1, social providers X (`twitter` in better-auth) first, Discord and Google when their secrets are added, `admin` plugin for roles; it owns `/api/auth/*` and the identity tables | Maintained and Workers-native; every later auth feature (organisations for shared universes, passkeys, two-factor, magic links, sign-in rate limiting) is a plugin, not custom security code. Decided 2026-10-02 after Arctic proved deprecated; a hand-rolled flow was built the same day and replaced |
| Validation | **zod** in `packages/shared` | One definition of every wire shape |
| Engines | `packages/engines` pure ESM with its generated rules and the name pool, bundled into the Worker | Same package runs in Node for tests; `engineVersion` is recorded on every tree it produces |
| Orbit view | **WebGL via Three.js**, lazily loaded, constrained 2.5D camera | Depth and real spheres from the cube-map bakes without free-flight 3D (§9) |
| Jobs | **Cloudflare Queues** (`generate`, `publish`, `truth-build`) with dead-letter queues; **Cron Triggers** for snapshots and GC | Retries, batching and backpressure without a server to run |
| Observability | Structured JSON logs with request ids; **Workers Logs** retained; **Analytics Engine** counters for generation, API latency and errors; uptime check on `/api/health` | Production needs numbers, not console output |
| CI/CD | **Workers Builds** connected to the git repository deploys on push (migrations, then `wrangler deploy`), with preview deployments per branch; GitHub Actions runs only `npm test` and `npm run check` | Nothing is deployed by hand after slice 0, and no Cloudflare token lives outside Cloudflare |
| Tests | `node:test` (engines, shared, API handlers), Playwright (viewer and builder flows) from slice 1 | |

Not chosen: client-side generation (two runtimes means two truths; see §5), Pages (superseded
by Workers Static Assets), Nuxt (SSR buys nothing for a canvas app), Prisma (no D1 story), KV
(CDN and SQLite cover every read), a single shared D1 for universe rows (a 10 GB ceiling), free
3D (legibility and the rules do not generate the data).

## 2. The git model, stated once

Everything heavy is an **object**: an immutable blob named by the sha256 of its stable bytes.
Everything light is a **pointer** plus a few indexed columns. Versions, snapshots, packages and
proposals are **manifests**: maps from hex key to object hash.

| git | Traveller.voyage |
|---|---|
| blob | a system tree, an image, a snapshot body (`objects/<sha256>`) |
| tree / commit | a truth version's sector index; a universe snapshot; a package manifest |
| working tree | a universe's rows in its Durable Object |
| upstream | the canonical truth at a version |
| branch | a universe pinned to a truth version with override rows |
| patch | a package: hexes with `baseHash` and `treeHash` |
| merge | install: fast-forward if the target still equals `baseHash`, else per-field resolution |
| pull request | a proposal reviewed against the current truth |
| tag | a truth version |
| gc | weekly mark-and-sweep of unreferenced objects |

Nothing is rebuilt or copied. Truth v2 that changes 300 systems stores 300 new objects and
new sector indexes. A builder pinned to v1 holds only override rows. Installing a package
copies pointers. Migrating a universe from v1 to v2 is a hash comparison per override row.
Snapshots are a few hundred kilobytes.

## 3. Topology

```
 browser ── https://traveller.voyage ───────────────▶ Worker "voyage"
   │           /            → SPA (static assets)
   │           /api/*       → Hono ──▶ D1 catalogue (users, sessions, universes, packages, proposals, truth search)
   │                                └▶ Durable Object "Universe:<id>" (SQLite: hexes, lists, campaign, history)
   │                                └▶ R2 private  u/<universeId>/objects/<sha256>
   │                                └▶ Queues: generate · publish · truth-build  → consumers in the same Worker
   │                                └▶ R2 public   (truth, packages, players' views; written by jobs only)
   └─────────── https://cdn.traveller.voyage ───────▶ R2 public, CDN-cached, immutable
                   truth/v<N>/manifest.json, truth/v<N>/sectors/<slug>/index.json
                   objects/<sha256>              truth and package objects
                   packages/<id>/<v>/manifest.json
                   players/<universeId>/<publishId>/...
```

- **Viewers never touch the Worker** after loading the SPA shell. Sector indexes and system
  objects come from the CDN with `Cache-Control: public, max-age=31536000, immutable`.
- **No engine code reaches any browser.** The SPA has no generation path; it asks the API.
- **Builders' private objects** are read through the API with the owner check and written by
  the platform (generation) or by import, never by hand-built client payloads except images.

## 4. Where data lives

| Data | Store | Why |
|---|---|---|
| users (with role), oauth accounts, sessions | D1 | global, relational, tiny |
| universe catalogue (id, owner, name, truth version, engine version, counters) | D1 | "my universes", admin views |
| truth search index (`truth_systems`, FTS5) per version | D1 | universal search over ~56,000 systems without a 30 MB client download |
| a universe's hexes, lists, sectors layout, campaign, hex history, job records | that universe's Durable Object SQLite | isolated, serialized, co-located; FTS5 for the universe's own search |
| system trees, images, snapshot bodies | R2 private, content-addressed under the universe prefix | immutable, deduplicated within the universe, deleted with it |
| canonical truth, packages, players' views | R2 public | immutable, CDN |
| packages catalogue, versions, installs, reports, proposals, truth versions | D1 | global queries |

Deleting a universe: mark the catalogue row; a job drops the Durable Object storage and the R2
prefix after the 30-day grace period. Nothing else references it.

## 5. Generation: the platform builds every system

**One runtime.** Every system tree that exists was produced by the Worker (interactive route or
Queue consumer) or by the Node test runner, both V8, from the same `packages/engines` build.
Every tree carries `engineVersion` and the `derivation` that produced it (edition, mode, seed,
settings, inputs). Regenerating is an explicit action that produces a new tree with the current
engine; nothing drifts.

**Interactive.** `POST /api/universes/:id/generate` with up to 64 hex keys and a mode runs
inline inside the request (one Mongoose system is ~5-20 ms), writes objects and pointer rows
through the universe's Durable Object in one transaction, and returns the new rows. The System
Editor's preview uses `POST /api/generate/preview` (stateless: inputs in, tree out, nothing
stored).

**Bulk.** More than 64 hexes, or any action that touches a whole sector, enqueues a `generate`
job: one message per batch of 64, consumed by the same Worker, each batch one transaction.
The Durable Object records the job (`jobs` table: id, kind, total, done, failed, state) and the
client polls `GET /api/universes/:id/jobs/:jobId` or subscribes to the universe's progress
stream (Server-Sent Events from the Durable Object). Failed batches retry three times, then go
to the dead-letter queue and the job reports them by hex key.

**Truth builds.** `POST /api/admin/truth/build` (admin) inserts the `truth_versions` row and
one `truth_build_sectors` row per sector, then enqueues one `truth-build` message per sector.
The consumer runs the engines over that sector's inputs at the pinned seed and settings in
slices (below), hashes every tree, writes the objects to the public bucket, and on the last
slice writes the sector index, the sector's `truth_systems` search rows and its
`truth_build_sectors` row. When every sector is `done`, release writes the manifest and marks
the version `released`. A truth version is never rewritten; a change is a new version. That
includes a build that went wrong after any of its sector indexes was written: indexes are
served `immutable` for a year from `truth/<version>/`, so the fix is the next version name,
not a rebuild under the same one.

**Limits, and the shape they force (learned 2026-10-03).** One Worker invocation gets a
bounded number of binding calls (about 1,000 subrequests: every R2 `get`/`head`/`put`, queue
`send` and D1 call counts) and 128 MB of memory. A system tree is ~86 KB, sectors run to
1,029 rows, and 167 of 512 have over 450. So no invocation ever does per-item work across a
whole sector or a whole catalogue:

- **The build endpoint** verifies inputs with paginated `list({ prefix })` (two calls for
  1,025 keys), never per-file reads, and enqueues with `sendBatch` in groups of 100.
- **Memory is shared, so slices are small and concurrency is capped (learned 2026-10-03, first
  production build).** One 200-row slice needs 50-80 MB while it runs (about 15-19 MB of tree
  JSON plus engine garbage, measured in Node), and concurrent queue invocations can share one
  128 MB isolate. With 200-row slices and default concurrency the build stalled at 298 of 512
  sectors: the small sectors finished, 212 larger ones died without throwing (so nothing
  marked them failed) and two failed on R2 internal errors under write pressure. The slice is
  therefore **25 rows**, the consumer has `max_concurrency = 6` and `retry_delay = 30`, and
  two things make a silent death visible: every slice touches the sector's `updated_at`, and
  a consumer on `voyage-dlq` marks a dead-lettered sector `failed`.
- **The truth-build consumer works in slices of 25 rows.** A message is
  `{ version, slug, offset, pinned }`, where `pinned` is `{ seed, settings, engineVersion }`
  copied from the build request so a slice needs no D1 read to start. The consumer generates
  only rows `[offset, offset + 25)` (every hex is seeded independently, so a slice is
  deterministic on its own), `put`s each tree without a preceding `head` (content-addressed
  writes are idempotent), writes the slice's index rows to
  `inputs/<version>/_parts/<slug>/<offset>.json` in the private bucket, sets the sector's
  `updated_at`, then enqueues the next
  offset or, on the last slice, finalizes: reads the parts, checks that their entries add up
  to the sector's row count (a mismatch throws; nothing is written), writes the sector index,
  replaces the sector's `truth_systems` rows in one D1 batch, and upserts the sector's row in
  `truth_build_sectors`. Queues deliver at least once; every write here is a replace keyed by
  content or by `(version, slug[, offset])`, so a duplicate message repeats work and changes
  nothing.
- **Sectors are fed a few at a time (from truth v3).** The build endpoint inserts every
  sector as `queued` and starts only the first 12 (state `building`, one message each).
  Whenever a sector ends (`done`, or `failed` by either path) the consumer claims the next
  `queued` sector in one statement (`UPDATE ... WHERE sector_slug = (SELECT ... state =
  'queued' ORDER BY sector_slug LIMIT 1) RETURNING sector_slug`) and enqueues it at offset
  0, so about 12 sectors are in flight at any time and they finish in order. Same total
  time as starting all 512 at once; progress is steady and a bad sector shows early. A
  `queued` sector is never "stalled". If every sector in flight is lost, the retry route
  restarts the stalled ones and the chain resumes.
- **Progress is counted, never incremented.** `sectors_done` is `COUNT(*)` of
  `truth_build_sectors` rows in state `done` for the version, so a retried message cannot
  double count. The progress route and release read that table; neither reads one R2 object
  per sector.
- **Failure and retry.** `max_retries = 3` means a message is delivered up to four times. On
  the fourth failed attempt the consumer upserts the sector to `failed` with the error text,
  and the message goes to `voyage-dlq`. An invocation that is killed (memory, CPU) never
  reaches that code, so the Worker also consumes `voyage-dlq`: a dead truth-build message
  upserts its sector to `failed` with "dead-lettered" unless the sector is already `done`.
  `POST /api/admin/truth/builds/:version/retry` (admin) sets sectors back to `building` and
  enqueues `{ version, slug, offset: 0, pinned }` for them, with `pinned` rebuilt from the
  `truth_versions` row: by default every `failed` sector plus every `building` sector whose
  `updated_at` is more than 10 minutes old (stalled), or the slugs named in the body in any
  state. It refuses a released version. Restarting a sector at offset 0 is safe
  for the same reason a duplicate is.
- **Bulk generation in slice 2 follows the same rule:** batches of 64, one transaction each.

Worker CPU limit is raised in `wrangler.toml` (`[limits] cpu_ms`); a 25-row slice uses a
fraction of it. Changing the slice size mid-build is safe when the new size divides the old
one: a restarted sector overwrites every old part key.

## 6. Worker configuration (`apps/api/wrangler.toml`)

```toml
name = "voyage"
main = "src/index.ts"
compatibility_date = "2026-09-01"
compatibility_flags = ["nodejs_compat"]
# Top-level keys must come before the first table header; a bare `routes` after [assets] would attach to assets.
routes = [{ pattern = "traveller.voyage", custom_domain = true }]

[limits]
cpu_ms = 60000

[assets]
directory = "../web/dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = ["/api/*"]

[[d1_databases]]
binding = "DB"
database_name = "voyage"
database_id = "<from wrangler d1 create voyage>"
migrations_dir = "src/db/migrations"

[[durable_objects.bindings]]
name = "UNIVERSE"
class_name = "UniverseDO"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["UniverseDO"]

[[r2_buckets]]
binding = "PRIVATE_BUCKET"
bucket_name = "voyage-private"

[[r2_buckets]]
binding = "PUBLIC_BUCKET"
bucket_name = "voyage-public"

[[queues.producers]]
binding = "GENERATE_QUEUE"
queue = "voyage-generate"

[[queues.producers]]
binding = "PUBLISH_QUEUE"
queue = "voyage-publish"

[[queues.producers]]
binding = "TRUTH_QUEUE"
queue = "voyage-truth-build"

[[queues.consumers]]
queue = "voyage-generate"
max_batch_size = 1
max_retries = 3
dead_letter_queue = "voyage-dlq"

[[queues.consumers]]
queue = "voyage-publish"
max_batch_size = 1
max_retries = 3
dead_letter_queue = "voyage-dlq"

[[queues.consumers]]
queue = "voyage-truth-build"
max_batch_size = 1
max_concurrency = 6
max_retries = 3
retry_delay = 30
dead_letter_queue = "voyage-dlq"

[[queues.consumers]]
queue = "voyage-dlq"
max_batch_size = 10
max_retries = 3

[[analytics_engine_datasets]]
binding = "METRICS"

[observability.logs]
enabled = true
invocation_logs = true
persist = true

[triggers]
crons = ["0 4 * * *", "0 5 * * SUN"]   # daily universe snapshots; weekly object GC and universe purge

[vars]
APP_ENV = "production"
PUBLIC_CDN_BASE = "https://cdn.traveller.voyage"
BETTER_AUTH_URL = "https://traveller.voyage"

# secrets (wrangler secret put): BETTER_AUTH_SECRET, TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET (X, first provider),
#   DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (optional; a provider is registered only when both of its values exist)

[env.preview]
routes = [{ pattern = "preview.traveller.voyage", custom_domain = true }]
```

If a key does not match the installed wrangler, the implementer stops and reports the exact
error; nobody guesses config. Local development: `wrangler dev` emulates D1, R2, Durable
Objects and Queues; `vite dev` proxies `/api` to it.

## 7. Request handling

- **Envelope.** `{ ok: true, data }` or `{ ok: false, error: { code, message, details? } }`.
  Statuses: 200, 201, 202 (job accepted), 400, 401, 403, 404, 409, 413, 429, 500.
- **Validation.** zod from `packages/shared` on every body and query; unknown keys rejected.
- **Auth.** better-auth session (`auth.api.getSession({ headers })`) → user with role. Routes
  declare `public`, `user`, `owner(universeId)`, `author(packageId)`, `reviewer`, `admin`.
- **CSRF.** better-auth's cookie settings (`HttpOnly; Secure; SameSite=Lax`) plus our `Origin`
  check on mutating routes outside `/api/auth/*`.
- **Universe routing.** `/api/universes/:id/*` checks ownership in D1, then forwards to
  `env.UNIVERSE.idFromName(id)`; the Durable Object owns every read and write of its rows.
- **Objects.** Written by the platform. The only client-supplied objects are images
  (`PUT /api/universes/:id/objects/:hash`, `image/webp`, hash verified, 8 MB cap) and import
  files, whose trees are hashed server-side.
- **Rate limits.** Per-user token bucket in the Durable Object for mutating routes; per-IP on
  auth routes; Cloudflare WAF in front.
- **Logging.** Every request logs one JSON line: request id, route, user id, universe id,
  status, duration. Errors include the stack. `details.requestId` is returned to the client.

## 8. Sync model (slice 2)

- The client holds the open universe in memory: truth sector indexes from the CDN plus the
  universe's override rows from its Durable Object, merged at load, one sector at a time.
- Every edit goes through the one change signal (`markChanged`), which appends to an outbound
  queue keyed by row. A 1 s debounce flushes one `PATCH /api/universes/:id/changes` with
  pointer rows carrying `rev`. Edits that change a tree send the edited tree inline; the server
  hashes it, stores the object and sets the pointer.
- The Durable Object applies a batch in one SQLite transaction. A row whose `rev` is not
  `stored + 1` is returned as a conflict with the current row; the client rebases and retries.
- **History.** Every applied row change inserts a `hex_history` row. Retention: the last 50
  revisions per hex and everything in the last 90 days; older rows are compacted by the weekly
  cron. Snapshots cover the long tail.
- **Snapshots.** Before every bulk action (the client calls it, the server enforces it for
  jobs) and daily by cron for universes changed since the last one: a manifest object plus a
  row. Restore snapshots first, then replaces pointers in one transaction.
- **Connectivity.** The outbound queue retries with exponential backoff, the UI shows a
  persistent "unsaved changes" state while the queue is non-empty, and `beforeunload` warns
  when it is. There is no offline mode; this is a connected product.

## 9. The orbit view: 2.5D, not 3D

The orrery is rendered in WebGL with a **constrained camera**: top-down by default, tilt from
0° to 60°, rotate around the primary, zoom. Orbits stay on the ecliptic plane (the rules
generate `orbitId`, `au`, `eccentricity` and `axialTilt` for every body, and inclination only in
one edition's tables, so free 3D would mean inventing data). Planets are real spheres textured
from the existing colour and height cube-map bakes; terminator, rings and belts are drawn
in-scene; labels and chips are HTML projected from 3D so they stay crisp, clickable and
screen-readable. Three.js is loaded only by the orbit route.

The orrery **model** (positions over time, Kepler periods, alignment search, companion
geometry) is a pure TS module with no renderer dependency, copied from `system_viewer.js`
math and golden-tested. A 2D canvas renderer over the same model is the fallback for
devices without WebGL2.

## 10. Performance budgets

| Thing | Budget |
|---|---|
| Viewer cold load to interactive map | under 1 s on broadband, under 3 s on 3G |
| Map frame at 10,000 visible hexes | 16 ms |
| Orbit view frame with 200 bodies at 60° tilt | 16 ms on integrated graphics |
| Sector index file | under 1 MB |
| One system object | about 50 KB (CDN compresses to about 10 KB) |
| Interactive generate of 64 systems, p95 | under 2 s end to end |
| Bulk generate of one sector (~440 systems) | under 60 s wall clock |
| Full truth build (156,222 systems across 512 sector jobs) | under 30 minutes wall clock across consumers |
| Changes PATCH of 50 rows, p95 | under 300 ms |
| Main thread blocked by any task | under 50 ms |

### 10.1 Why the map is fast, and the rule for everything built after it (2026-10-03)

Measured on the released truth: a cold visit paints the chart in about 130 ms (Johnny, private
window). It got there by moving work out of the browser, one step at a time, and each step
is now a rule. **A builder's own universe gets the same treatment as the truth**; none of this
is special to the charted universe.

1. **The viewer downloads and draws. It does not derive.** Anything that can be computed
   from stored data is computed when that data is written or published, and stored as a
   file or a row. The first border layer computed 447 polity outlines in the browser on
   every cold visit and took seconds; the same outlines built once at release take 104 ms
   and ship as a 187 KB file.
2. **One small file per zoom level, not many big ones.** The galaxy and sector views read
   the overview (one character per hex) and the border file; a sector's full index is
   fetched only when the view is zoomed into it. Never make the far view depend on per-item
   fetches.
3. **Immutable files, named by version or hash, cached for a year.** A second visit costs
   nothing. Anything a builder publishes follows the same naming.
4. **Derived data is rebuilt without regenerating its source.** A derived build makes a new
   version's indexes, overview and border file from the previous version's hexes in under
   three minutes; the hour-long generation runs only when engines or inputs change. For a
   universe: an edit to one hex or one border recomputes the derived pieces of the sectors
   it touches (overview cells, polity and region outlines), not the universe.
5. **Draw in batches from cached paths.** One path per colour or per polity per frame, built
   when the data arrives and reused; nothing is recomputed while panning; anything off screen
   is skipped by its bounding box.
6. **Measure in a private window before calling a layer done.** Warm reloads hide the cost.

For slice 2 this means: when a builder generates systems, draws a route or assigns a border,
the platform updates that universe's overview, outlines and search rows as part of the same
write (in the universe's Durable Object or a queued job), and the map of that universe reads
them exactly as the viewer reads the truth's. The slice 2 recipe starts from this section.

## 11. Capacity

| Quantity | Estimate |
|---|---|
| Systems in the truth | 180,312 rows across 512 sectors (156,222 with trees; 24,090 partial surveys without); objects shared across versions |
| Truth objects per full version | ~8 GB uncompressed at ~50 KB each; incremental versions add only changed objects |
| Rows per universe | thousands typical; hundreds of thousands for a builder who imports the whole chart as their own; SQLite handles millions |
| Durable Object storage per universe | tens of MB typical; 10 GB limit |
| D1 catalogue | ~180,000 search rows per truth version plus thousands of catalogue rows |
| R2 at 1,000 builders | tens of GB |

Nothing in this table requires sharding, and nothing is rebuilt.

## 12. Operations

- **Environments.** `preview` (every PR) and `production` (tags). Secrets per environment.
- **Backups.** D1 Time Travel and Durable Object point-in-time recovery cover 30 days; R2
  objects are immutable; snapshot manifests give per-universe restore beyond that.
- **Monitoring.** Analytics Engine counters: generations per minute, job failures, API p95 by
  route, 5xx count, queue depth. External uptime check on `/api/health`. Alert on 5xx rate,
  dead-letter queue depth, and health failures.
- **Admin.** `users.role = 'admin'` unlocks `/api/admin/*`: truth builds and releases, package
  takedown, user lookup, job inspection. No shell access is part of normal operations.
- **Fair use.** Mirrors TravellerMap; truth manifests carry the attribution text.
