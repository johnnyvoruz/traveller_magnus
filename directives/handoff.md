# Handoff — orchestrator notes, 2026-10-03

Written by the outgoing orchestrator session for the next one; reviewed and corrected later
the same day. Reading order is the one in `CLAUDE.md`: `manifesto.md` → `plan.md` → this file
→ `slice_0_foundation.md`; open `architecture.md`, `data_model.md` and `api.md` at the sections
this file cites. This file is the only one that describes *where we are*; the others describe
*what we are building*. Update or replace it when the state changes.

---

## 1. Your role

You are the **orchestrator**. Johnny (the user) is the referee: he owns product decisions,
rules questions, the Cloudflare account and secrets. Two lower-effort **implementer** sessions
run in the same working tree: **Agent A** (engines, `packages/`, `tests/golden`, `tools/`) and
**Agent B** (the Worker, `apps/api`, `tests/api`). Johnny relays: you write a prompt, he pastes
it to an agent, he pastes the agent's report back to you. **Agent A has nothing in flight**
(Track A closed with the deviations table in `slice_0_foundation.md`); B's current prompt
lets B edit one file in A's scope, `packages/generation/src/index.ts`, so do not hand A work
there until B reports.

What the orchestrator does:
- Reads each report **critically**, verifies claims against the code when cheap, and decides.
- Fixes the **spec first** when a report exposes a spec defect, then writes the agent's prompt.
- Writes prompts that name files, exact changes, the checks to run, and "stop and report".
- Runs deploys, remote checks and one-off scripts from this session when Johnny asks.

How Johnny works, learned the hard way:
- He cannot answer deep technical questions and says so. **Decide and record** the decision in
  the directives; ask him only for things only he can do (dashboard clicks, secrets, taste).
- He wants production-grade, no band-aids. When you catch a workaround in a report ("I
  adapted", "I worked around", "temporary"), stop and look. Past catches: an agent patched a
  file under `node_modules`; an agent used bracket access to dodge the manifesto checker.
- Git: `CLAUDE.md` rule 6 still reads "Do not interact with Git", and `CLAUDE.md` overrides
  this file. Johnny has told orchestrator sessions in chat, twice, that they may use git, and
  commits big milestones himself. Until he changes rule 6 himself (§7), treat that as
  per-session: use git only when he says so in your session. When he does: commit only named
  files by path, never `git add -A` while an agent is mid-task, and say what you committed and
  pushed. Every push to `campaign` triggers a production deploy (§4), so a push is never a
  side effect of something else.
- Keep replies short and lead with the outcome. He reads the last message only.

## 2. Where slice 0 stands

| Area | State |
|---|---|
| Engines as ESM (`packages/engines`) | Done. Ten golden cases byte-equal to the legacy oracle. |
| Parsers, schemas (`packages/shared`) | Done. Parser never rolls dice; `?` digits stay `null`; `partial` flag. |
| Generation (`packages/generation`) | Done: `generateHex`, `buildSector`, `buildSectorSlice` (uncommitted, §3). |
| Worker (`apps/api`) | Deployed and healthy at `https://traveller.voyage`. better-auth with X sign-in works. Johnny is `admin`. |
| D1 `voyage` | Migrated through `0003`. No truth version exists yet. |
| R2 `voyage-private` | `inputs/v1/` holds 512 sector TSV + XML pairs and `sectors.json` (1,025 objects), verified remotely. |
| R2 `voyage-public` on `cdn.traveller.voyage` | Live, empty. |
| Queues | `voyage-generate`, `voyage-publish`, `voyage-truth-build`, `voyage-dlq` exist and are bound. |
| Workers Builds | Connected to `johnnyvoruz/traveller_magnus`, branch `campaign`. See §4 for an unverified setting. |
| Tests | `npm test`: 45 tests, 41 pass, 4 skipped (three need `RUN_API_TESTS=1`, one legacy XML case is permanently skipped). `npm run check`: clean. B reports the gated API suite 4 of 4 green. |
| Truth v1 | **Not built.** First attempt hit Worker limits before starting; nothing to clean up. |

Code on `campaign` is at `7a5f8ee` (name pool in the generation package) plus `a74d35b`
(Workers Logs in config); `c0dc264` after those carries only directive and `CLAUDE.md` edits.
Uncommitted in the working tree:
- Agent B's slice work (§3), reported green 2026-10-03: `apps/api/src/db/schema.ts`,
  `src/db/migrations/0004_truth_build_sectors.sql`, `src/jobs/truth_build.ts`,
  `src/routes/admin.ts`, `src/routes/truth.ts`, `packages/generation/src/index.ts`,
  `tests/api/truth_build.test.js`, `tests/generation/slice.test.js`. Commit these together
  with the §10 follow-up, as one push and one deploy.
- The review's directive corrections: this file, `README.md`, `api.md`, `architecture.md`,
  `slice_0_foundation.md`, and part of `CLAUDE.md` (§7 lists what is still missing there).

## 3. The one thing in flight: truth build must work in slices

**Problem found 2026-10-03.** A Worker invocation gets about 1,000 binding calls (every R2
get/head/put, queue send, D1 call) and 128 MB. The build endpoint read 1,024 files and sent
512 messages one at a time; the consumer did a `head` and a `put` per system for a whole
sector. Trees are ~86 KB; sectors reach 1,029 rows; 167 of 512 exceed 450. The request hung
and no `v1` row was created.

**Decision, recorded in `architecture.md` §5 "Limits, and the shape they force",
`data_model.md` §2 (`truth_build_sectors`), `api.md` slice 0 and `slice_0_foundation.md`
§10.3, §10.5, §11 and §12:**
- Build endpoint: verify inputs with paginated `list({ prefix })`; enqueue with `sendBatch`
  in groups of 100; one message per sector `{ version, slug, offset: 0, pinned }`.
- Consumer: one message = one slice of 200 rows; `put` trees without `head`; write the
  slice's index rows to `inputs/<version>/_parts/<slug>/<offset>.json`; enqueue the next
  offset or finalize (sector index, `truth_systems` rows replaced in one D1 batch,
  `truth_build_sectors` upsert to `done`).
- Progress is `COUNT(*)` over `truth_build_sectors`, never an increment.
- `packages/generation` gains `buildSectorSlice`; a test proves slices of 200 equal
  `buildSector` exactly for Spinward Marches.

**Agent B reported green on the §9 prompt (2026-10-03)** and the orchestrator read the code.
Verified here: `npm test` 45/41/4 and `npm run check` clean; the consumer never `head`s; a
middle slice is 203 binding calls and the largest sector (Yejiariebr, 1,029 rows) is six
slices; the build route lists instead of reading; progress and release read
`truth_build_sectors`. Slices are independent of each other: for Spinward Marches and the
three largest sectors, a chain of 200-row slices, a single pass, and the last slice generated
alone all give identical index entries, and Spinward Marches equals the earlier local build.

Found in that read, and still open (all in the §10 follow-up, which goes to B **before** the
build runs):
- `truth_build.ts` writes `truthVersion: 'v1'` as a literal into every sector index. Right
  for `v1` by coincidence, wrong for the `vtest` fixture and for any later version.
- `tests/generation/slice.test.js` compares `buildSector` with slices, but `buildSector` is
  now built from slices, so the test cannot fail. It must compare against a single pass.
- The failure mark fires on attempt 3 of 4; finalize does not check that the parts are
  complete; there is no retry route; the progress route omits `systems` and `error`.
- Noted, not blocking: the Mongoose auditor prints violations to the console (four in
  Spinward Marches), so the build writes those lines into Workers Logs.

**B reported green on the §10 follow-up too (2026-10-03), and the code was read again.** All
eight items are in: the index uses the message's version; `MAX_DELIVERIES = 4`; parts carry
`total` and finalize checks it before any public write; progress carries `systems` and
`error`; `TruthRetry` and the retry route exist; the slice test compares against a single
pass and a lone last slice. `npm test` 45/41/4 and `npm run check` clean here; B reports the
gated suite 4 of 4. The open list above is closed except the auditor's console lines.
**The work is ready to commit and push; nothing has been pushed.**

Found while checking, not from B's work and not blocking the build: `tsc --noEmit` in
`apps/api` reports 7 type errors in files B did not touch (`src/index.ts` types the app as
`{ Bindings: Env }` instead of `AppEnv`; `src/auth/session.ts` reads `role` that the session
type lacks; `src/auth/auth.cli.ts` uses `process` without Node types) plus 13 `TS5097`
import-extension errors from `packages/shared`. Wrangler's bundler does not type-check, so
deploys pass. No command or check runs `tsc` today; a typecheck script and these fixes are
one small recipe for B after the build (§7).

**Fallback if the Worker build fails in production (Johnny offered this 2026-10-03):** build
on this machine with `npm run truth:local` and upload. Not specified yet; it needs an uploader
over R2's S3 interface, an R2 API token from Johnny, a D1 import file for `truth_systems`, and
the local manifest brought to the released shape (`tags`, `canonical`, `built`, `partial`).
Write that recipe only if step 5 below cannot recover the Worker build.

**Next:**
1. Done: §10 sent, reported, reviewed.
2. B's files are committed by path and pushed (by Johnny, or by you when he says so). The
   automatic deploy applies the migration (§4). `/api/health` does **not** confirm it: it
   returns a static `1.0.0` whether or not the new Worker went out. Confirm from `apps/api`
   with:
   ```
   wrangler deployments list
   wrangler d1 execute voyage --remote --command "SELECT name FROM d1_migrations ORDER BY id"
   ```
   Expect a deployment created after the push and `0004_truth_build_sectors.sql` in the list
   (it ended at `0003_truth_systems_partial.sql` at review time). If either is missing, the
   Workers Build failed: read its log (§4) before doing anything else.
3. Johnny pastes the build command in the browser console on `https://traveller.voyage/`
   while signed in (it needs his admin cookie; you cannot send it):
   ```js
   await (await fetch('/api/admin/truth/build', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: 'v1', milieu: 'M1105', engineVersion: '1.0.0', seed: 'TravellerMagnus', settings: { generationPopMax: 20, generationPopMod: 0, generationTlMax: 20, generationTlMod: 0, generationUseRealisticStellar: false, generationUseTlFloor: false, generationRttSettlement: 2, generationRttTL: 15, generationStarportMax: 'A', generationStarportMod: 0, generationNoTravelZones: false, generationPopCheckFrequency: 100 }, sectors: 'all' }) })).json()
   ```
   Expected: `{ ok: true, data: { version: 'v1', enqueued: 512 } }` within a couple of seconds.
4. Watch progress from here without his cookie:
   ```
   cd apps/api
   wrangler d1 execute voyage --remote --command "SELECT state, COUNT(*) FROM truth_build_sectors WHERE version='v1' GROUP BY state"
   curl -s -o /dev/null -w '%{http_code}\n' https://cdn.traveller.voyage/truth/v1/sectors/Spinward_Marches/index.json
   wrangler tail voyage
   ```
   Expect about 156,000 tree objects (~13 GB) and 180,312 `truth_systems` rows, 24,090 of
   them partial with no tree.
   Do not fetch more index URLs through the CDN than you need: they are cached `immutable`.
5. **If sectors fail**, read the `error` column first
   (`SELECT sector_slug, error FROM truth_build_sectors WHERE version='v1' AND state='failed'`).
   Fix the cause, deploy, then Johnny retries only those sectors:
   `await (await fetch('/api/admin/truth/builds/v1/retry', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()`.
   A sector stuck in `building` with a stale `updated_at` and an empty queue lost a message;
   retry it by name: `body: JSON.stringify({ sectors: ['<slug>'] })`.
6. **If the build itself is wrong** (bad settings, an engine defect found afterwards), do not
   rebuild `v1`. Sector indexes under `truth/v1/` are served `immutable` for a year and may
   already be cached, and the endpoint returns 409 for an existing version. Abandon it and
   build `v2`: upload the inputs under `inputs/v2/` (`node tools/truth/upload_inputs.js v2`)
   and run the step 3 command with `version: 'v2'`. Before starting the new build, wait until
   the `voyage-truth-build` queue is empty (dashboard → Queues), or in-flight `v1` messages
   keep writing. The abandoned `v1` rows, parts and indexes can stay; nothing reads an
   unreleased version. Objects under `objects/` are content-addressed and shared.
   The only case where `v1` may be wiped and reused is a build that failed **before any
   sector index was written** (as the first attempt did): then delete the `v1` rows from
   `truth_versions`, `truth_build_sectors` and `truth_systems` with
   `wrangler d1 execute --remote`, after the queue is empty.
7. When every sector is `done`, Johnny runs
   `await (await fetch('/api/admin/truth/release/v1', { method: 'POST' })).json()`.
   Verify `https://cdn.traveller.voyage/truth/v1/manifest.json` and
   `https://traveller.voyage/api/truth/search?q=Regina`.

That closes slice 0. Then tick the verification list in `slice_0_foundation.md` honestly.

## 4. Deploys

- **Automatic:** a push to `campaign` runs Workers Builds: `npm ci && npm run build`, then the
  deploy command. The deploy command field in the dashboard **must read `npm run deploy:ci`**
  (root script: remote migrations, then `wrangler deploy`, both with
  `--config apps/api/wrangler.toml`). The dashboard wrapped the long form into line breaks and
  broke two builds. **Still unverified:** whether Johnny changed the field. It cannot be
  checked from here: `wrangler deployments list` shows every deployment as
  "Unknown (deployment)" by Johnny, so it does not tell a Workers Build from a manual deploy
  (the latest at review time was 2026-10-03T07:19Z). Only the build log under Workers & Pages
  → `voyage` → Deployments shows the command that ran; if it still shows the wrapped
  `npx wrangler …` command, ask him to set it and the preview command (`npm run preview:ci`).
- **Manual, from this machine:** `npm run build` at the root, then `wrangler deploy` in
  `apps/api`; migrations with `npm --workspace apps/api run db:migrate`. Used several times
  today; fine as a fallback.
- Settings changed in the dashboard are reset by a deploy unless they are in
  `apps/api/wrangler.toml`. Workers Logs is in the config for that reason.

## 5. Traps already hit (do not rediscover them)

| Trap | Rule |
|---|---|
| wrangler 4 `r2 object put/get` defaults to **local** emulation | Always pass `--remote` for real buckets. A full upload once went to `.wrangler/state`. |
| Worker limits | ~1,000 binding calls and 128 MB per invocation. Never loop per item over a sector or catalogue. |
| `/api/health` version | Static `1.0.0`; it does not change with a deploy. Prove a deploy with `wrangler deployments list` and the `d1_migrations` table. |
| Truth indexes are immutable | `truth/<version>/sectors/<slug>/index.json` is served with a one-year `immutable` header. A truth version whose indexes exist is never rebuilt under the same name; the fix is the next version (§3 step 6). |
| Queue attempts | `max_retries = 3` is four deliveries. Mark a sector `failed` on the fourth failed attempt, not the third. |
| Hand-written migrations | `0001_truth_systems_fts`, `0003` and `0004` are SQL files written by hand; drizzle's `meta/_journal.json` knows only `0000`–`0002`. The next `drizzle-kit generate` will try to emit the `0003` and `0004` changes again. Until the journal is reconciled, new migrations are written by hand as the next numbered file and `schema.ts` is kept in step. |
| TOML | Top-level keys (`routes`) must precede the first `[table]`. |
| Cron | Day of week is `SUN`, not `0`. |
| Drizzle is 0.x | A caret moves only the patch digit. Pinned: `drizzle-orm ^0.45.3`, `drizzle-kit ^0.31.11`. `drizzle-kit generate` prompts on a TTY; if an agent hits it, they stop and report. |
| better-auth 1.7.7 | CLI is `npx auth@1.7.7 generate --config apps/api/src/auth/auth.cli.ts`; adapter is `@better-auth/drizzle-adapter`; `@better-auth/cli` and `arctic` are deprecated. X is provider `twitter`. |
| ESM imports are read-only | Engines must not assign to imported bindings (`auditBacklog`); Node tests did not catch it, the bundler did. `npx --no-install esbuild packages/engines/src/index.js --bundle --format=esm --platform=neutral --outfile=NUL` proves the engines bundle. |
| Root is ESM | `utilities/package.json` sets CommonJS so legacy scripts still run. |
| Legacy hex ids | `"<sectorNum>-<subsectorLetter>-<hhhh>"` (e.g. `1-C-1910`). New identity is `"<sector_slug>/<hhhh>"`. |
| Two agents, one tree | Only Agent B runs `npm install`. API tests are gated behind `RUN_API_TESTS=1`. Agents never run git. |
| Legacy tree | `js/`, `hex_map.html`, `style.css`, `rules/` are frozen. Nobody edits them. `rules/` never, ever. |

## 6. Decisions made on Johnny's behalf (all recorded in the directives)

- Product is **Traveller.voyage**; stack is Vue 3 + Vite + TS, one Cloudflare Worker (Hono),
  D1 catalogue, a Durable Object per universe, content-addressed objects in R2, Queues.
- **The platform runs the engines.** No engine code reaches a browser.
- Storage is git-shaped: objects by hash, pointer rows, manifests (`architecture.md` §2).
- Auth is **better-auth**; first provider X; Discord and Google register when their secrets exist.
- Truth v1 is **all 512** M1105 sectors with data; `canonical` flag marks the 399 OTU + ZCR ones.
- Unknown UWP or PBG digits stay unknown; such rows get no tree (`partial`). Completing them
  is an open rules question for Johnny, never done silently.
- Truth generation defaults: `generationNoTravelZones = false`, `generationPopCheckFrequency = 100`.
- Homebrew lives at **y ≥ 100**; own sector slugs are `handle~Name` (`data_model.md` §5).
- Orbit view is **2.5D WebGL** with a constrained camera (`architecture.md` §9).
- Deploys by Workers Builds; GitHub Actions only tests (`slice_0_foundation.md` §13).
- Deviations from legacy behaviour are listed in one table in `slice_0_foundation.md`.

## 7. Open items

For Johnny:
- Confirm the Workers Builds deploy command (§4).
- `CLAUDE.md` needs four edits that only he can make (the session's permission layer blocks
  an agent from changing its own instruction file in these places):
  1. Rule 6 and the Roles list: say whether orchestrator sessions may use git, in his words.
  2. Commands table: `npm run truth:build` does not exist; the script is `npm run truth:local`
     (writes `truth-local/`, gitignored).
  3. Commands table: add `npm run deploy:ci` / `npm run preview:ci` (what Workers Builds runs).
  4. Legacy notes: `tests/harness/legacy.js` is really `tests/oracle/legacy.js`.
- Later, not now: privacy and terms pages (X email scope needs them), Discord and Google apps.

For reference: raw chart TSV/XML are gitignored; `universe/raw/sectors.json` is committed.

- Confirm one reading (said 2026-10-03): "no more than one subsystem at a time" for user mass
  generation is taken to mean one **subsector** (80 hexes) per request, with per-user
  metering. `architecture.md` §5 and `api.md` still say 64 hexes inline and a bulk queue above
  that; they change when he confirms, in the slice 2 recipe at the latest.

For the orchestrator, before the truth build:
- Commit and push B's work with the directive edits (§2 lists the files), then §3 step 2.

For the orchestrator, after the build is running (B is free):
- Recipe for B: add a `typecheck` script (`tsc --noEmit`) for `apps/api`, fix the 7 type
  errors and the `TS5097` setting (§3), and make it part of "done".

For the orchestrator, after truth v1 is released:
- Reconcile drizzle's journal with the hand-written migrations (§5), as its own small recipe.
- `.github/workflows/test.yml` (recipe §13.2) is not written yet.
- `tests/api` does not run in CI.
- Four moderate `npm audit` findings, all transitive through drizzle-kit and wrangler; review once.
- `apps/web` holding page is the only UI. **Slice 1 (Viewer)** is next: write
  `directives/slice_1_viewer.md` just-in-time from `plan.md` §4, `design_reference.md` and
  `feature_inventory.md` sections A, J and L. The viewer reads only
  `cdn.traveller.voyage/truth/v1/...` and `/api/truth/search`; it draws canonical sectors by
  default.
- Legacy cleanup at M2: delete `js/`, `hex_map.html`, `style.css`, `tests/oracle`.

## 8. Prompt skeleton that has worked

```
<one sentence: accepted / what changed in the spec; which sections to re-read>

Do this, in order:
1. <file>: <exact change>
2. ...
N. Run <commands>; paste the output.

If <the risky thing> happens, stop and report <exactly what>.
Stop and report. Unchanged rules: no edits under rules/, js/, hex_map.html or style.css;
no git; <npm install rule for this agent>; never adjust a fixture or an engine toward each other.
```

Track A scope: `packages/`, `tests/golden`, `tests/shared`, `tests/generation`, `tools/`,
`scripts/`. Track B scope: `apps/api`, `tests/api`, `scripts/dev_make_admin.js`, `.dev.vars`,
plus single named files in `packages/` when a prompt says so.

## 9. The prompt Agent B completed (sent 2026-10-03, reported green the same day)

```
The first real build attempt exposed a limits defect in my spec. Re-read architecture.md §5 "Limits, and the shape they force" and data_model.md §2 (truth_build_sectors, truth_systems). Facts: an invocation gets about 1,000 binding calls and 128 MB; a tree is ~86 KB; sectors have up to 1,029 rows and 167 of 512 have over 450; the catalogue is 512 sectors, 1,025 input files.

Change these, nothing else:

1. src/routes/admin.ts, POST /truth/build: replace the per-file get loop with paginated PRIVATE_BUCKET.list({ prefix: `inputs/${version}/`, cursor }) into a Set of keys, and verify each slug's .tsv and .xml are in the set. Enqueue with TRUTH_QUEUE.sendBatch in groups of 100, one message per sector: { version, slug, offset: 0, pinned }. Insert one truth_build_sectors row per slug in state 'building' using D1 batch in groups of 50 statements.

2. packages/generation (you may edit this one file, src/index.ts, for this): add buildSectorSlice({ slug, tsv, pinned, offset, limit }) returning { rows: [{ hex, indexEntry }], objects: Map<hash, json>, total, nextOffset | null }. It parses the TSV once, orders SYSTEM_PRESENT rows by hex, and generates only rows [offset, offset+limit). buildSector stays and is implemented on top of it. Each hex is seeded independently, so a slice must produce the same trees buildSector does: add tests/generation/slice.test.js proving that for Spinward Marches, the union of slices of 200 equals buildSector's index and object set exactly.

3. src/jobs/truth_build.ts: one message = one slice of 200. Put each tree to PUBLIC_BUCKET objects/<hash> without a preceding head. Write the slice's index entries to PRIVATE_BUCKET inputs/<version>/_parts/<slug>/<offset>.json. If nextOffset is not null, send { version, slug, offset: nextOffset, pinned } and return. Otherwise finalize: list and read the parts, write truth/<version>/sectors/<slug>/index.json with the sectors.json catalogue fields and metadata from the XML, then one D1 batch that deletes this sector's truth_systems rows for the version and inserts them again (multi-row inserts respecting D1's bound-parameter limit), and upserts truth_build_sectors to state 'done' with systems, built, partial, index_hash. On a thrown error after the last retry, upsert state 'failed' with the error text.

4. Schema: add truth_build_sectors per data_model.md §2 (new migration, committed SQL; do not patch tooling). sectors_done and sectors_failed in every response are computed by COUNT from that table; stop incrementing the column. Release requires COUNT(done) = sectors_total and writes the manifest from that table's rows.

5. Tests (gated): keep the existing truth-build test green, and add a 450-row fixture sector built by repeating valid rows with distinct hexes so the consumer must chain three slices; assert three part files, one index with 450 entries, 450 truth_systems rows, and one truth_build_sectors row in 'done'. Count binding calls in the handler path with a simple counter in the test double if practical; otherwise state in the report how many R2, queue and D1 calls one slice makes.

Run npm run check, npm test, and RUN_API_TESTS=1 node --test "tests/api/**/*.test.js"; paste the output. Stop and report. No git; no edits under node_modules, rules/, js/.
```

## 10. Follow-up prompt for Agent B (send now; the build waits for its report)

```
Accepted: the sliced build is in and I have read the code. One defect, one test that cannot fail, and four additions from a spec review. Re-read architecture.md §5 ("Limits, and the shape they force", including "Failure and retry"), api.md slice 0 (the four /api/admin/truth rows) and slice_0_foundation.md §10.3 and §10.5.

Do this, in order:

1. src/jobs/truth_build.ts, finalize: the index is written with truthVersion: 'v1' as a literal. Use the message's version. Add an assertion to the 450-row test that the vwide index has truthVersion equal to the version it was built as.

2. tests/generation/slice.test.js: buildSector is now built from buildSectorSlice, so comparing the two proves nothing. Keep the existing assertions and add: (a) one call with limit 1000000 gives the same rows and objects as the chain of 200s; (b) the last slice generated on its own, without generating the earlier ones first, gives entries equal to the same hexes from (a). Do not change packages/generation for this.

3. src/jobs/truth_build.ts: max_retries = 3 is four deliveries. Upsert truth_build_sectors to 'failed' with the error text only when message.attempts >= 4, then rethrow. Name the constant after what it is (deliveries, not retries).

4. src/jobs/truth_build.ts: put total (from buildSectorSlice) in every part file next to offset and rows. In finalize, after reading the parts, throw unless every part reports the same total and the number of distinct hexes across the parts equals it. Nothing is written to the public bucket or D1 before that check passes.

5. src/routes/admin.ts, GET /truth/builds/:version: add systems and error to each sector entry (the route already reads only truth_build_sectors; keep it that way).

6. packages/shared (you may edit the one schemas file that holds TruthBuild, and its export line in src/index.ts): add TruthRetry = { sectors?: string[] }.

7. src/routes/admin.ts: add POST /truth/builds/:version/retry (origin check, admin). 404 if the version is missing, 409 if it is released. Targets: body.sectors if given (any state; 404 naming the slug if one has no truth_build_sectors row), otherwise every row in state 'failed'. Set the targets to 'building' with error NULL and a new updated_at in D1 batches of 50 statements; enqueue { version, slug, offset: 0, pinned } with sendBatch in groups of 100, pinned rebuilt from the truth_versions row (seed, settings, engine_version). Write one audit_log row (action 'truth.retry', details: the slugs). Return 202 { version, enqueued }.

8. Tests (gated): one case that marks the fixture sector 'failed' directly in local D1, calls retry, and asserts it returns to 'done' with the same index_hash as before; one case that retry on a released version returns 409.

Run npm run check, npm test, and RUN_API_TESTS=1 node --test "tests/api/**/*.test.js"; paste the output.

If step 2 (a) or (b) fails, do not touch the engines or the generation package: stop and report the first differing hex and field.
Stop and report. Unchanged rules: no edits under rules/, js/, hex_map.html or style.css; no git; only you run npm install; never adjust a fixture or an engine toward each other; no new migration is needed for this, and if you think one is, stop and report.
```
