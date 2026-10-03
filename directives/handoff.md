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
| Truth v1 | **Build started 2026-10-03T07:40Z and stalled at 298 of 512 sectors.** 212 stuck in `building`, 2 `failed`. Not released. Read §11 first. |

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

**Superseded in part by §11**, which holds the live state of the v1 build and the next prompt.
The steps below still describe how to deploy, watch, retry and release.

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

## 11. Live state of the v1 build (written 2026-10-03, about 08:15Z) and what to do next

**What happened.** Johnny pushed B's work (`2f5ffea`, `3665b0f`), the deploy went out at
07:40Z with migration `0004`, and he started the build (`enqueued: 512`). The queue scaled up
by itself. By 08:01Z 298 sectors were `done` (75,513 systems: 51,451 trees and 24,062 partial
rows), and then nothing more happened: no queue invocation in a 40-second live tail at 08:12Z
(the tail was proven to work with a health request).

| State | Sectors | Notes |
|---|---|---|
| `done` | 298 | every sector of 150 rows or fewer, plus many larger ones up to Yejiariebr (1,029) |
| `building` | 212 | 151 to 921 rows each, 103,988 rows in all; `updated_at` never moved; some have no part file at all (Abresh, Aed), some have all of them (Spinward Marches: 0, 200, 400) |
| `failed` | 2 | `Veg_Fergakh`, `Far_Frontiers`: `put: We encountered an internal error. Please try again. (10001)` from R2 on all four deliveries |

**Diagnosis (likely, not proven).** The stuck sectors' messages died without throwing, so
`markFailed` never ran and they went to `voyage-dlq`, which nothing reads. Measured in Node:
one 200-row slice holds 15-19 MB of tree JSON and peaks 50-80 MB of heap; nothing leaks from
slice to slice. Concurrent invocations sharing one 128 MB isolate would exceed it. The two R2
errors point at write pressure from the same uncapped concurrency. **The proof is in Workers
Logs:** Workers & Pages → `voyage` → Logs, filter 07:40-08:05Z for outcomes other than `ok`;
`exceededMemory` confirms it. Ask Johnny for a screenshot before trusting this paragraph. The
Chrome extension was not connected, so the orchestrator could not look.

**Decision, recorded in `architecture.md` §5 and §6, `api.md` and `slice_0_foundation.md`
§10.5:** slices of 25 rows; `max_concurrency = 6` and `retry_delay = 30` on the truth-build
consumer; every slice touches the sector's `updated_at`; the Worker consumes `voyage-dlq` and
marks dead-lettered sectors `failed`; the retry route with no body also picks up `building`
sectors not updated for 10 minutes. This holds whichever limit killed the invocations.

**Nothing needs cleaning up.** The 298 finished sectors are correct and stay. A retried sector
restarts at offset 0 and overwrites every old part (25 divides 200). `v1` is not released, so
no manifest exists; the finished sector indexes are immutable and right.

**Next, in order:**
1. Done: B reported green on the prompt below and the code was read (25-row slices,
   `max_concurrency = 6`, `retry_delay = 30`, `src/jobs/dead_letter.ts`, per-slice
   `updated_at`, stalled sectors in the default retry). `npm test` 45/41/4 and `npm run check`
   clean here; B reports the gated suite 5 of 5. A non-final slice is 29 binding calls.
   Uncommitted: `apps/api/wrangler.toml`, `src/index.ts`, `src/jobs/truth_build.ts`,
   `src/jobs/dead_letter.ts`, `src/routes/admin.ts`, `tests/api/truth_build.test.js`, and the
   four directive files.
2. Commit and push (Johnny, or the orchestrator on his word); confirm with
   `wrangler deployments list`. On deploy the new dead-letter consumer drains `voyage-dlq`
   and the stuck sectors turn `failed` with `dead-lettered`.
3. Johnny runs the retry in the browser console on `https://traveller.voyage/`:
   `await (await fetch('/api/admin/truth/builds/v1/retry', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()`.
   Expected: `enqueued: 214` (212 stalled or dead-lettered plus 2 failed).
4. Watch with the D1 query in §3 step 4. About 4,200 slices at 6 at a time: roughly half an
   hour. Run the retry again for anything that fails.
5. All 512 `done` → release (§3 step 7). Expect 180,312 `truth_systems` rows.

**Prompt for Agent B:**

```
The first production build stalled: 298 of 512 sectors done, 212 stuck in 'building' with no error, 2 failed on R2 internal errors. Most likely the 200-row slices exceeded the isolate's memory when several ran at once, so the invocations died without throwing and their messages went to voyage-dlq, which nothing reads. Re-read architecture.md §5 (the "Memory is shared" and "Failure and retry" bullets), §6 (the two queue consumer blocks) and slice_0_foundation.md §10.5.

Do this, in order:

1. apps/api/wrangler.toml: on the voyage-truth-build consumer add max_concurrency = 6 and retry_delay = 30. Add a consumer for voyage-dlq with max_batch_size = 10 and max_retries = 3 (no dead_letter_queue). Copy architecture.md §6.

2. src/jobs/truth_build.ts: SLICE = 25. After the part file is written and before the next message is sent or finalize runs, run one D1 statement that sets updated_at to now for (version, slug) where state is not 'done'.

3. New file src/jobs/dead_letter.ts: export deadLetterConsumer(batch, env). For each message whose body has string version and slug: upsert truth_build_sectors to 'failed' with error 'dead-lettered: the invocation died without throwing; see Workers Logs' and a new updated_at, but leave a row that is 'done' untouched; console.log one JSON line { job: 'dead-letter', version, slug, offset }. Ack every message, including ones with any other body.

4. src/index.ts: route batch.queue === 'voyage-dlq' to deadLetterConsumer.

5. src/routes/admin.ts, retry: with no body.sectors, the targets are every 'failed' row plus every 'building' row whose updated_at is more than 10 minutes old. Named slugs behave as before.

6. Tests (gated): the 450-row case now chains eighteen slices of 25 (eighteen part files; everything else as before). Add: a 'building' row with updated_at 11 minutes old is picked up by a retry with an empty body and one with a fresh updated_at is not; a dead-letter message for a 'building' sector turns it 'failed', and for a 'done' sector changes nothing. Update the binding-call counter test for 25 and report the counts.

Run npm run check, npm test, and RUN_API_TESTS=1 node --test "tests/api/**/*.test.js"; paste the output.

If the installed wrangler rejects max_concurrency, retry_delay or the second consumer block, stop and report the exact error.
Stop and report. Unchanged rules: no edits under rules/, js/, hex_map.html or style.css; no git; only you run npm install; never adjust a fixture or an engine toward each other; do not change packages/generation; no new migration.
```

## 12. Truth-build improvements for the next version (noted during the v1 run, not started)

The v1 run works but is slow and opaque. Before any `v2` build, in one recipe for Agent B:

1. **Feed sectors a few at a time.** Today every sector's first slice is enqueued at once and
   each slice re-enqueues at the back, so all sectors advance round-robin and none finishes
   for the first 45 minutes. Enqueue a window of sectors (about 12) and start the next sector
   when one finalizes. Same total time; steady visible progress; a bad sector shows early.
2. **Write a slice's trees in parallel.** A 25-row slice used 195 ms of CPU and 12 s of wall
   time: the trees are `put` one after another at roughly half a second each. Putting them
   five at a time cuts the wall time several-fold without using more memory. This is the real
   speed lever; concurrency across invocations is not.
3. **Log what each slice did.** One JSON line per slice `{ job, version, slug, offset, rows,
   ms }`. Workers Logs currently shows only that a queue invocation ran.
4. **Silence the auditor in the Worker.** The Mongoose auditor prints violations to the
   console during generation; route them through the trace sink like every other line.

Also still open from §3: the `apps/api` type errors and a `typecheck` script.

## 13. Agent M's review (2026-10-03), checked by the orchestrator

A separate review agent wrote `findings/` at the repo root (`agent_m_technical.md`, 20
findings; `agent_m_features.md`). Its truth-build status is a snapshot from between the
deploy and the retry and is out of date (§11 is current). Confirmed against production by the
orchestrator:

| Finding | Confirmed | What to do |
|---|---|---|
| T1 `cdn.traveller.voyage` sends no `Access-Control-Allow-Origin` | yes | **Blocks slice 1.** CORS policy on `voyage-public` allowing `https://traveller.voyage` (and the preview host), `GET`/`HEAD`. A bucket setting: Johnny's go. |
| T2 CDN returns `cf-cache-status: DYNAMIC` | yes | One Cache Rule on the zone for `cdn.traveller.voyage` (cache everything, respect origin headers). Johnny, dashboard. Until then "immutable" binds browsers only. |
| T3 dead-letter consumer overwrites an existing error | yes (code) | Recipe for B: only set `error` when the row is not already `failed`. |
| T5 search has no prefix match and returns unreleased versions | yes (`q=Regi` empty; `q=Regina` returns a `v1` row) | Recipe for B: join `truth_versions` on `state = 'released'`; prefix match on the last token. |
| T6 every index entry stores its fields twice (`...projection, summary: projection`) and carries nothing from the generated tree | yes (Calidan index) | Index shape is decided in the slice 1 recipe, from what the viewer draws. See below. |
| T9 no test gate before a production deploy | yes (already §7) | CI workflow; consider production from `main` with `campaign` as preview. Johnny's call. |

**Recommendation recorded here, Johnny decides:** let the v1 build finish (it proves the
pipeline end to end) but **do not release it**. Fix the index shape while writing the slice 1
recipe, apply §12, and build and release that as `v2`. Trees are content-addressed, so `v2`
points at the same objects; only indexes and search rows are new. Nothing reads an unreleased
version once T5 is fixed.

Not yet read in full by the orchestrator: T7, T8, T10-T20 and the feature gap file.

## 14. Agent X's review (2026-10-03) and the v2 format question

A second review agent (read-only, no file written) agrees with Agent M and §13: let v1 finish
as proof, release a fixed format as `v2`. Spot-checked by the orchestrator: `requireRole` is
an exact match, so an admin fails a `reviewer` check (`apps/api/src/auth/session.ts`);
`packages/generation/src/index.ts` hardcodes `TRUTH_VERSION = 'v1'` for `buildSector`;
`feature_inventory.md` A1 says to wrap `renderer.js`.

**Correction to §13:** if trees are stored compact instead of pretty-printed (X measured 85 KB
against 50 KB per tree), every tree hash changes, so `v2` rewrites all ~156,000 objects and
the v1 objects become garbage for the weekly sweep. Only an index-only change would reuse the
v1 objects.

**What v2 should settle in one rebuild (to be specified before slice 1's recipe, Johnny
decides the starred ones):**
1. Compact stable JSON for trees and indexes. `data_model.md` §1 says "two-space indent"; the
   golden fixtures are stored in that form, so the fixtures are re-serialised from the legacy
   oracle, never edited. ★ Needs Johnny's explicit yes because of CLAUDE.md rule 4.
2. Index entries without the duplicated `summary`; add from the tree only what the map draws.
3. A galaxy-level overview file built by the truth job, if slice 1 shows all 512 sectors. ★
4. Zod schemas in `packages/shared` brought in line with what the build writes (`tags`,
   `canonical`, `built`, `partial`); one index shape for the local and the Worker build.
5. The §12 build improvements.

X's other open questions for Johnny: map scope for slice 1; renderer wrap versus rebuild
(X argues rebuild: the legacy renderer has 144 references to `window` or `hexStates`, which
the no-globals rule and the M2 deletion both forbid); phones and tablets; whether the
FontAwesome Pro kit stays; and X's own lane. Cleanup must not touch `js/`, `rules/`,
`hex_map.html`, `style.css`, `tests/oracle` or `tests/golden/fixtures` before M2.

## 15. Prompt for Agent B: Worker fixes from the reviews (written 2026-10-03, not yet sent)

Touches only `apps/api`, `tests/api` and the root `package.json` scripts, so Agent A can work
in `packages/` at the same time. **Do not push the result until the v1 build has finished**
(a push redeploys the Worker mid-run). Windowed sector feeding (§12 item 1) needs a new sector
state and a migration, so it waits for the v2 recipe; the auditor's console lines (§12 item 4)
are engine code and belong to Agent A.

```
Two reviews of the Worker found defects I confirmed in production. None changes the truth-build design. Re-read api.md slice 0 (the /api/truth rows) and architecture.md §5 "Failure and retry".

Do this, in order:

1. src/routes/truth.ts, GET /search: (a) return rows only from versions whose truth_versions.state is 'released' (join truth_versions); the version query parameter still narrows within those. (b) Type-ahead: split q on whitespace, drop empty tokens and any double quotes, quote each token for FTS5, and append * to the last one, so q=Regi matches Regina and q=Spin Mar matches a row containing both. (c) ORDER BY rank before LIMIT 50. An empty q still returns no items.

2. src/jobs/dead_letter.ts: the upsert must not replace an error that is already recorded. Change the conflict clause so it updates only a row whose state is 'building'. A 'failed' row keeps its error; a 'done' row stays done.

3. src/auth/session.ts, requireRole: roles are ordered user < reviewer < admin, and a user passes when their role is at or above the one required. Today an admin fails a reviewer check.

4. src/jobs/truth_build.ts: put the slice's trees in groups of 5 with Promise.all instead of one at a time; the part file is still written only after every tree put has resolved. After the slice finishes, console.log one JSON line { job: 'truth-build', version, slug, offset, rows, objects, ms }.

5. Typecheck: add "typecheck": "tsc --noEmit -p apps/api" to the root package.json scripts and make it pass. Today it reports errors in src/index.ts (the app is typed { Bindings: Env } instead of AppEnv), src/auth/session.ts (role is not on the session user type), src/auth/auth.cli.ts (process without Node types) and TS5097 for the .ts import extensions in packages/shared (fix that in apps/api/tsconfig.json, not by editing packages/shared). Fix types only: if making an error go away would change what the code does at run time, stop and report that error instead.

6. Tests (gated): search finds a released row by prefix and by two tokens, and does not return a row from a version that is still 'building'; a dead-letter message leaves a 'failed' row's error unchanged; an admin passes a reviewer check and a user fails it (unit-level if the route does not exist yet). Update the binding-call counter test if the grouping changes its counts, and report them.

Run npm run check, npm test, npm run typecheck, and RUN_API_TESTS=1 node --test "tests/api/**/*.test.js"; paste the output.

Stop and report. Unchanged rules: no edits under rules/, js/, hex_map.html or style.css; no git; only you run npm install; do not change anything under packages/; no new migration, and if you think one is needed, stop and report.
```

## 16. Decisions of 2026-10-03 (afternoon) and the prompt for Agent A

**Johnny decided, in chat:**
- **Content is wide open.** Mongoose has given permission to build whatever we want; they will
  review and say what to cut later. Treat licensing as a blank cheque, not a blocker. This
  does **not** change the Johnny Protocol: `rules/` stays read-only and rules are never filled
  in from memory; it means features may carry Mongoose content once Johnny supplies it.
- **Unblock Agent A on the v2 format.** He asked for A's prompt after the orchestrator
  recommended compact JSON and a galaxy-level map of all 512 sectors; taken as yes to both.
  The overview file for the zoomed-out map is derived from the sector indexes at release, so
  it is specified with the slice 1 recipe and does not hold A up.

- **The map renderer is rebuilt, not wrapped** (confirmed later the same day).
  `feature_inventory.md` A1 and `plan.md` slice 1 say so. The slice 1 recipe is written around
  a new TypeScript `MapRenderer` with a galaxy tier; `js/renderer.js` is read for look and
  behaviour only.

**Orchestrator recommendations he has seen but not confirmed** (record as decisions when he
does): phones and tablets in scope; drop the
FontAwesome Pro kit; production from `main` with `campaign` as preview and a test gate;
Discord and Google sign-in before inviting anyone; a thin players-and-campaign slice ahead of
the Builder; a campaign as its own entity.

**v2 format, recorded in `data_model.md` §1 and §5:** compact stable JSON; index entries are
the chart row once (no `summary` copy) plus `stars`; the index and manifest carry `tags`,
`canonical`, `systems`, `built`, `partial`; one `assembleSectorIndex` for local and Worker.

**After A reports:** a short prompt for B switches the Worker's finalize and release to
`assembleSectorIndex` and the shared schemas (B's §15 work lands first). Then deploy, build
`v2` (inputs go up with `node tools/truth/upload_inputs.js v2`), release `v2`. `v1` stays
unreleased.

**Prompt for Agent A:**

```
New work for Track A: the truth format changes before anyone pins a version. Read data_model.md §1 (the stable serialisation paragraph) and §5 (manifest.json, sectors/<slug>/index.json and the paragraph that starts "An index entry is the chart row"). Agent B is working in apps/api and tests/api at the same time: do not edit there, and if a failure you see comes from those folders, report it and leave it.

Do this, in order:

1. Fixtures first, as a proof. Copy tests/golden/fixtures to tests/golden/fixtures_before (a temporary folder). Then in packages/shared/src/stable.ts remove the indent argument so stable() writes no whitespace; change nothing else in that function. Run UPDATE_GOLDEN=1 npm test once to rewrite the fixtures from the legacy oracle. Then prove nothing but whitespace changed: for every file, JSON.parse of the old file must deep-equal JSON.parse of the new file (a throwaway node -e is fine; paste its output). Delete tests/golden/fixtures_before. This is the only permitted way a fixture changes: re-serialised from the oracle, never edited. If any file differs in content, restore the folder from fixtures_before, put the indent back, stop and report the file and the first differing path.

2. packages/generation/src/index.ts:
   a. Remove the constant TRUTH_VERSION. buildSector takes a required version: string and an optional catalogue: { name: string; x: number; y: number; tags: string[]; canonical: boolean }.
   b. An index entry is { tree, type, name, uwp, allegiance, zone, bases, tradeCodes, pbg, ix, stars, partial }. Remove the summary copy. stars is the chart's Stars column exactly as the parser already keeps it (row.t5Data.homestar), omitted when the parser has none. Nothing else is added.
   c. Export assembleSectorIndex({ slug, version, metadataXml, catalogue, hexes }) returning the data_model.md §5 index: slug, name, x, y (from the catalogue when given, else from the XML; missing coordinates still throw), tags and canonical (from the catalogue; [] and false without one), truthVersion, systems, built, partial (counted from hexes), hexes, metadata. buildSector builds its index with it and keeps returning { index, objects, counts }.
   Do not touch generateHex or anything under packages/engines.

3. packages/shared/src/schemas/truth.ts: make SectorHex, SectorIndex and TruthManifest describe exactly what step 2 and data_model.md §5 write: SectorHex without summary and with optional stars; SectorIndex with tags, canonical, systems, built, partial; each TruthManifest sector with tags, canonical, built, partial. Use .strict() on the three so an extra or missing field fails.

4. tools/truth/build.js: take the version as the first argument (required, v<N>); read universe/raw/sectors.json and pass each sector's catalogue entry to buildSector; write objects without the .json extension (the bucket key is objects/<hash>); write the manifest with the fields from step 3 and no releasedAt. Update the "truth:local" script in the root package.json to "node tools/truth/build.js v2". tools/truth/hash.js needs no change unless it assumed .json names; say which.

5. Tests: tests/generation: parity and slice tests updated for the version argument; a new test that SectorIndex.parse accepts buildSector's index for Spinward Marches with the real catalogue entry, and that no entry has a summary key. tests/shared: stable() output contains no newline and no two consecutive spaces outside strings for a nested sample, and still sorts keys and writes { "$num": "Infinity" }.

6. Report these numbers, v1 form against v2 form, for Spinward Marches: index bytes, average and largest tree bytes, and wall time of buildSector.

Run npm run check and npm test; paste the output. Then run TRUTH_SLUGS=Spinward_Marches,Calidan npm run truth:local twice and node tools/truth/hash.js after each; the two hashes must match.

If any golden or parity test fails after step 1 for a reason other than whitespace, stop and report: do not adjust a fixture, an engine or the oracle.
Stop and report. Unchanged rules: no edits under rules/, js/, hex_map.html or style.css; no git; no npm install (only Agent B installs); never adjust a fixture or an engine toward each other.
```

**B reported green on §15 (2026-10-03) and the code was read.** All six items are in; here
`npm run typecheck` exits 0, `npm test` is 46/41/5, `npm run check` is clean; B reports the
gated suite 6 of 6. Two things B did to get the typecheck clean that its report did not
mention, both accepted for now and both worth replacing later: `apps/api/src/engines.d.ts`
declares `@voyage/engines` as an untyped module (everything imported from the engines is
`any`), and `src/auth/auth.cli.ts` declares `process` locally instead of using Node types.
Uncommitted and **not to be pushed until the v1 build finishes**: `apps/api/src/auth/auth.cli.ts`,
`auth/roles.ts`, `auth/session.ts`, `engines.d.ts`, `index.ts`, `jobs/dead_letter.ts`,
`jobs/truth_build.ts`, `routes/truth.ts`, `apps/api/tsconfig.json`, root `package.json`,
`tests/api/role.test.js`, `tests/api/truth_build.test.js`.

## 17. Agent A's v2 format work is in (2026-10-03); last prompt for B before the v2 build

**A reported green on §16 and the work was checked.** Independently verified here: every one
of the ten golden fixtures parses to exactly the content of its committed version (compared
against `git show HEAD:`), so the rewrite changed whitespace only; `npm test` 48/43/5,
`npm run check` clean, `npm run typecheck` clean with A's and B's changes together. A's
numbers for Spinward Marches: index 327,282 → 123,907 bytes; average tree 86,433 → 50,893.
All 180,312 chart rows in the 512 sectors carry every field the strict `SectorHex` requires.
**106,146 of them have no `stars`**: the chart's Stars column is empty for most non-Imperial
sectors, so a map that draws star colour must take it from the generated tree for those. That
is a slice 1 design input, not a defect.

Uncommitted from A: `packages/shared/src/stable.ts`, `schemas/truth.ts`,
`packages/generation/src/index.ts`, `tools/truth/build.js`, root `package.json`
(`truth:local`), the ten files in `tests/golden/fixtures`, `tests/generation/slice.test.js`,
`tests/generation/sector_index.test.js`, `tests/shared/partial_uwp.test.js`,
`tests/shared/stable.test.js`.

**Still wrong until B does the prompt below:** the Worker's finalize builds the index by hand
(old shape plus A's new entries, no schema check) and release can write `x: null`.

**Order from here:** B does the prompt below → v1 build finishes → one commit and push of
everything (A, B, directives, `findings/`) → confirm deploy → Johnny's CORS go and Cache Rule
(§13) → `node tools/truth/upload_inputs.js v2` → Johnny runs the §3 build command with
`version: 'v2'` → watch → release `v2`. `v1` is never released.

**Prompt for Agent B:**

```
Accepted: the review fixes are in. Agent A has changed the truth format for v2: stable() is compact, an index entry is the chart row once (no summary), and packages/generation now exports assembleSectorIndex and CatalogueEntry. packages/shared SectorIndex and TruthManifest are strict and describe exactly what is written. Read data_model.md §5 and packages/generation/src/index.ts (assembleSectorIndex) before starting.

Do this, in order:

1. src/jobs/truth_build.ts, finalize: stop building the index by hand. Call assembleSectorIndex({ slug, version, metadataXml: <the XML text>, catalogue: <this sector's sectors.json entry, or undefined>, hexes }) and take systems, built and partial from the returned index. Validate the result with SectorIndex.parse before anything is written; a failure throws like any other error. The completeness check on the parts stays where it is, before this.

2. src/routes/admin.ts, release: a sector with no catalogue entry is a 409 naming the slug, not a manifest row with null coordinates. Validate the manifest with TruthManifest.parse before the put.

3. Delete any helper those two changes leave unused. Do not change packages/.

4. Tests (gated): the 450-row case asserts that its index passes SectorIndex.parse, that no entry has a summary key, and that the released vtest manifest passes TruthManifest.parse. Keep every existing assertion.

Run npm run check, npm test, npm run typecheck, and RUN_API_TESTS=1 node --test "tests/api/**/*.test.js"; paste the output.

If SectorIndex.parse rejects an index built from the fixture, do not loosen the schema or the fixture: stop and report the first issue zod names.
Stop and report. Unchanged rules: no edits under rules/, js/, hex_map.html or style.css; no git; only you run npm install; do not change anything under packages/; no new migration.
```

**B reported green on the §17 prompt (2026-10-03) and the code was read.** Finalize calls
`assembleSectorIndex` and `SectorIndex.parse` before any public write; release refuses a
sector without a catalogue entry and runs `TruthManifest.parse`. Here: `npm test` 48/43/5,
`npm run check` and `npm run typecheck` clean; B reports the gated suite 6 of 6. **All code
for v2 is now in the working tree, uncommitted.**

**Do not deploy this while v1 messages are still in the queue.** v1's part files hold
old-shape entries (with `summary`), which the strict schema rejects, so every v1 sector that
finalizes under the new code would fail. Either wait for v1 to finish, or purge
`voyage-truth-build` first (`wrangler queues purge voyage-truth-build`) and abandon v1 where
it stands. v1 is never released either way. Purging is Johnny's call.

**v2 inputs:** `node tools/truth/upload_inputs.js v2` sends 1,025 files one wrangler call at a
time (the best part of an hour); it writes only under `inputs/v2/` in the private bucket and
can run while v1 is still building.

## 18. The pivot to v2 (2026-10-03, 16:40-17:20Z): live state

- **v1 abandoned at 370 of 512 sectors.** Johnny paused and purged `voyage-truth-build` at
  16:40Z and resumed it after the deploy. `v1` stays `building` in `truth_versions` and is
  never released; its rows, parts and objects are left in place.
- **v2 code deployed** as `70e833c` at 16:41Z (A's format work, B's Worker changes, the
  directive edits, `findings/`). The working tree was clean after that push.
- **v2 inputs uploaded** by the orchestrator: 1,025 files under `inputs/v2/`, none failed.
- **CORS on `voyage-public`** set by Johnny: `AllowedOrigins: ["*"]`, `GET`/`HEAD`,
  `MaxAgeSeconds: 86400`. Verified: `Access-Control-Allow-Origin: *` on reads and preflight.
  `*` because everything in that bucket is public by design and one header value is safe to
  cache. `voyage-private` has no CORS policy and must not get one.
- **Cache Rule** added by Johnny for `cdn.traveller.voyage` (eligible for cache; edge TTL from
  the cache-control header, bypass if absent). Verified: an index and an extensionless object
  go `MISS` then `HIT`; a missing file is `BYPASS`, so a 404 is never cached.
- **v2 build started about 17:05Z** (`enqueued: 512`). Measured from the new per-slice log
  line: 2.6 s a slice (v1: 12 s), every outcome `ok`, about 63 slices a minute, which is two
  to three invocations at a time, not the six allowed. At 17:17Z: 41 done, none failed.
  About 7,500 slices in all, so roughly two hours: expect completion near 19:05Z.
- **When all 512 are `done`:** Johnny runs
  `await (await fetch('/api/admin/truth/release/v2', { method: 'POST' })).json()`, then check
  `https://cdn.traveller.voyage/truth/v2/manifest.json` and
  `https://traveller.voyage/api/truth/search?q=Regi`. That closes slice 0; tick its
  verification list honestly.
- **Open after that:** the galaxy overview file and the slice 1 recipe (rebuilt renderer,
  §16); CI and production from `main`; windowed sector feeding; why the queue does not reach
  six concurrent invocations; replacing B's two typecheck shims (§15).

## 19. Slice 1 recipe written (2026-10-03, while v2 builds)

`directives/slice_1_viewer.md`: part A in full, parts B and C as outlines.
- **A0, the overview file:** `truth/<v>/overview.json`, one 1,280-character string per sector
  (first UWP character per occupied hex), built by `sectorOverview` in `packages/generation`
  (Track A) and written at release (Track B). **v2 is released only after A0 is deployed**, so
  its manifest carries `overviewHash`. The v2 build does not depend on it.
- **A1, the map (Track W, `apps/web`):** geometry in parsecs, a pure camera, three tiers from
  the legacy LOD constants, a truth client with a 32-index cache, the rebuilt `MapRenderer`,
  Pointer Events input, routes with deep links. Today's holding page moves to `/account`
  unchanged so Johnny can still sign in as admin.
- **Measured for the recipe:** the 399 `canonical` sectors include the 167 `ZCR` ones, a single
  column to `sy = -175`. Fitting "canonical" would open on a strip 8,822 parsecs tall, so the
  opening view is the 233 `OTU` sectors (1,056 by 1,709 parsecs).
- **Raised for Johnny in the recipe:** which worlds get a name when zoomed out (not in
  `rules/`); how to show alternate sectors that share coordinates; phone and tablet layouts;
  who takes Track W; the icon set.
- Part B needs the orchestrator to read `js/renderer.js:1032-2060` and list every chart glyph
  rule and the index fields it needs **before** the next truth version, so the index is
  extended once.

**A0.1-A0.4 are in (Agent A, 2026-10-03), read and checked:** `sectorOverview`,
`SectorOverview`/`TruthOverview`, `overviewHash` on `TruthManifest`, the local build writes
`overview.json`; `npm test` 49/44/5, check and typecheck clean. Measured 1,406-1,415 bytes a
sector (about 720 KB for 512). **Until Agent B does A0.5 and it is deployed, the Worker's
release fails safely:** `TruthManifest.parse` now requires `overviewHash`, which release does
not yet supply, so it throws before any write. Do not run the v2 release before then.
Uncommitted: `packages/generation/src/overview.ts`, `src/index.ts`,
`packages/shared/src/index.ts`, `schemas/truth.ts`, `tools/truth/build.js`,
`tests/generation/overview.test.js`, `directives/slice_1_viewer.md`, `README.md`,
`data_model.md`, this file.

**A0.5 is in (Agent B, 2026-10-03), read and checked:** release reads each sector index,
validates it, builds the overview, writes `truth/<version>/overview.json` and then the
manifest with `overviewHash`. `npm test` 49/44/5, check and typecheck clean here; B reports
the gated suite 6 of 6. Release is N + 8 binding calls (520 for 512 sectors) and reads the
indexes one after another, so **the v2 release request will take up to a minute**; that is
expected. Uncommitted with A's files: `apps/api/src/routes/admin.ts`,
`tests/api/truth_build.test.js`. **Safe to push while v2 builds:** it touches only the release
route. Then, when all 512 are `done`, Johnny runs the v2 release.

**2026-10-03 about 18:00Z.** A0 is deployed (`0ce2cfc`, live 17:48Z) and v2 slices kept
finishing `ok` after it. v2 at 17:58Z: 362 of 512 done, none failed; expect completion near
18:55Z. Johnny tried the release early and got "Build is not finished", which is the guard
working. **Agent A now has Track W:** the prompt for `slice_1_viewer.md` part A1 was handed to
Johnny. A has no browser, so the visual and frame-time checks (A1.11, A1.12) are the
orchestrator's or Johnny's after A reports; they need v2 released.

**Johnny decided 2026-10-03 (evening):** phones and tablets are **not** supported for now
("maybe later"); slice 1 designs for desktop and laptop only. World names when zoomed out:
**none, except capitals**. Both are in `slice_1_viewer.md` §0. Open with him: which chart
remark marks a capital (`Cx` 222 worlds, `Cs` 52, `Cp` 1,007; proposal `Cx` and `Cs`). The
labels need the overview file to carry them, so they land with the next truth version, not v2.

**Far-zoom labels are our own file (Johnny, 2026-10-03):** `universe/far_labels.json`, a
hand-kept list of `{ sector, hex, name }` that Johnny owns. Seeded by the orchestrator from
the chart remarks `Cx` and `Cs` as a starting point only; nothing interprets those remarks at
run time. Part B bundles it into the viewer. It is outside the truth, so no new truth version
is needed for it. This supersedes the "next truth version" note above. Uncommitted.

## 20. Truth v2 is released (2026-10-03T18:15:16Z). Slice 0 is closed except three boxes.

**Verified by the orchestrator after Johnny ran the release:**
- Build: all 512 sectors `done` by 18:08Z, about an hour after it started, none failed.
  180,312 systems, 156,222 trees, 24,090 partial rows: exactly the expected numbers, in both
  `truth_build_sectors` and `truth_systems`.
- `truth/v2/manifest.json` (107,767 bytes) and `truth/v2/overview.json` (715,379 bytes) load
  from the CDN with the immutable header, both pass the strict schemas, the manifest's
  `overviewHash` is the overview's sha256, the overview marks 180,312 cells, and D1's
  `manifest_hash` is the manifest's sha256.
- The Spinward Marches index on the CDN is 123,907 bytes, the same as the local build; Regina's
  tree downloads from `objects/<hash>`, hashes to its name and is compact.
- `/api/health` reports `truthVersion: v2`; `/api/truth/versions` lists v2; `q=Regi` returns
  rows and `q=Regina 191` returns Regina. The release request took about a minute, as
  predicted, and returned nothing visible in the tail until it finished.

**Slice 0 verification list** (`slice_0_foundation.md`) is ticked honestly: eight of twelve.
Open: the full 512-sector local build was never run twice; the Durable Object migration log
line is unconfirmed; there is no CI workflow; and whether three commits that include legacy
files were Johnny's own pending work. The twelfth box (the report) has no single owner.

**Small things seen during verification, for part B:** `/api/truth/versions` returns
`settings` and `sectors` as JSON strings, not objects; search ranks "Regis" and "Reginante"
above "Regina" for `q=Regi`.

**Left behind by v1:** its rows in `truth_versions` (`building`), `truth_build_sectors` and
`truth_systems` (about 95,000 rows), its parts under `inputs/v1/_parts/`, its indexes under
`truth/v1/` and roughly 100,000 pretty-printed objects. Nothing reads them. Cleaning them up
is a deliberate deletion in production: Johnny's call, and not urgent.

**In flight:** Agent A on `slice_1_viewer.md` part A1 (the map). Uncommitted:
`directives/handoff.md`, `plan.md`, `slice_0_foundation.md`, `slice_1_viewer.md`,
`universe/far_labels.json`, plus whatever A has written under `apps/web` and `tests/web`.

## 21. Slice 1 part A1 (the map) is written; browser checks are outstanding

**Agent A reported A1.1-A1.10a done (2026-10-03).** Checked here: `npm test` 63/58/5,
`npm run check` clean with exactly one new allowlist file (`platform/browser.ts`), no global
or literal colour anywhere else in `apps/web/src`, the dev server starts, its `/api` proxy
reaches production (`v2`), and the map module compiles. A's three deviations (a `home()`
callback, the far-flight zoom formula, the legacy wheel gain) are accepted and written into
`slice_1_viewer.md` A1.11a.

**Not verified by anyone yet, because neither A nor the orchestrator has a browser** (the
Chrome extension was not connected): that the map actually draws, that drag, wheel and
keyboard move it, that `/s/Spinward_Marches/1910` lands on Regina with its name, the cold-load
time, the two frame-time measurements of A1.11 (so the pan cache is undecided), and that
`/account` still signs in. Run it with `VOYAGE_API=https://traveller.voyage npm run dev:web`
and open `http://localhost:5173/`. **Do not push A1 before someone has looked at it**: a push
replaces the live holding page with the map.

Uncommitted: `apps/web/src/App.vue`, `main.ts`, `router.ts`, `map/`, `platform/`, `views/`,
`apps/web/vite.config.ts`, `scripts/check_allowlist.json`, `tests/web/`,
`universe/far_labels.json`, and the directive edits.

**First browser look found a real bug (Johnny, 2026-10-03):** `Failed to execute 'fetch' on
'Window': Illegal invocation`. `TruthClient` stored the injected `fetch` and called it as
`this.fetch(url)`; a browser's `fetch` refuses any `this` but the global. The Node tests could
not see it because a stub does not care. **Fixed by the orchestrator** in
`apps/web/src/map/truth_client.ts` (the injected function is called bare), with a test in
`tests/web/truth_client.test.js` that fails if `this` is ever the client. This is why A1 is
not pushed before someone looks at it. **Decision recorded (Johnny):** the map is public and
fully usable signed out; sign-in gates the campaign tools and map-altering tools
(`slice_1_viewer.md` §0).

**The map draws (Johnny's screenshot, 2026-10-03):** the home view shows sector outlines, a
point per system and sector names from live v2 data. First defect seen: sector names overlap
their neighbours (fixed 18 px text in 110 px sectors); the rule is now `slice_1_viewer.md`
A1.11b and goes to Agent A. Johnny's reaction: very pleased, and "big UI changes will be
needed, doesn't look like the old app yet", which is part B (chart glyphs, routes, borders,
panels). Still unchecked in a browser: the Regina deep link, input feel, frame times,
`/account` sign-in.

**Second browser look (Johnny, 2026-10-03):** `/s/Spinward_Marches/1910` flies to Regina; hex
numbers and world names draw; "it's so smooth". Checked against his screenshot: positions are
right (Regina's dot is in the hex numbered 1910, Hefry's in 1909), but each name sits just
above the next hex's number and reads as belonging to it. Logged for part B with smoothness
as an explicit acceptance criterion. No pan cache is added (A1.11): smooth by eye on Johnny's
machine, not measured in milliseconds. Still unchecked: `/account` sign-in.

## 22. After the first look at the map (2026-10-03, evening)

- `/account` on the local dev server answers "invalid origin" when signing in. Expected:
  better-auth only trusts the production origin, and the dev server proxies to production.
  **Verify sign-in on `https://traveller.voyage/account` after the push.**
- Johnny is pushing part A1 (the map replaces the holding page at `/`).
- **Agent A:** the A1.11b prompt (sector names fit their sector).
- **Agent B:** a test gate. `.github/workflows/test.yml` per `slice_0_foundation.md` §13.2 plus
  typecheck and build; the handful of chart files the tests read (`universe/raw/` is
  gitignored) are un-ignored by exact name so a clean checkout can run `npm test`;
  `/api/truth/versions` returns `settings` and `sectors` as JSON, not strings.
  Decision by the orchestrator: those few chart files may be tracked. The whole chart is
  already public on the CDN; the reason `universe/raw/` is ignored is its size (1,025 files).
- **Orchestrator:** part B glyph inventory from `js/renderer.js:1032-2060`.

## 23. Part B groundwork done (2026-10-03, late)

`directives/legacy_map_inventory.md` records what `js/renderer.js` draws, rule by rule, from
a read-only review agent's pass over the legacy code, spot-checked by the orchestrator
(hex-number line, starport rule, default filter rules, gas giant and base constants). The
agent's raw output file was empty afterwards, so that directive is the only copy.

Conclusions, written into `slice_1_viewer.md` §B:
- **B1 runs on truth v2:** every per-world symbol, sector and subsector lines, subsector
  titles, far-zoom names, and routes. No new truth version.
- **B2 needs truth v3:** borders, polity fills, regions. The border flood fill
  (`js/borders.js:755-1132`) moves into `packages/` as a pure, oracle-tested function run by
  the truth build; the index also gains stylesheet colours, the allegiance name table and
  regions. Trees are unchanged, so every object is reused.
- The legacy map never drew allegiance per world, star symbols or capital name styling.

Next for the orchestrator: write the B1 recipe (tokens for chart colours first, then the
glyph layer with the label layout fix, then routes, each measured for frame time).

**2026-10-03 about 18:50Z.** Part A1 is live: `34e5373` deployed 18:41Z, `/`,
`/s/Spinward_Marches/1910` and `/account` answer 200 and the bundle carries the map. Sign-in
on production `/account` is still Johnny's to confirm. **Agent B's test gate is in and
reviewed** (uncommitted): `.github/workflows/test.yml`; six chart files un-ignored by exact
name (Spinward_Marches, Caesillian, Just_Empty, `.tsv` and `.xml`); `/api/truth/versions`
returns `settings` and `sectors` parsed. B's gated suite 6 of 6. **`npm test` currently has
one failure**, `a sector name scales to 84% of its rectangle...` in
`tests/web/renderer.test.js`: that is Agent A's A1.11b work in progress, not B's. Do not push
until A reports green; once the workflow is pushed, GitHub will run it on every push.

**A1.11b: the orchestrator's check was wrong, not Agent A's code.** The example in the recipe
(a 20-character name drawn in a 110 px rectangle) contradicted the rule's own 9 px floor; A
implemented the rule, left the test red and stopped, which is exactly right. The recipe's
check now uses an 8-character name for the drawn case and keeps the 20-character and 40 px
cases as not drawn. A gets a one-step prompt to rewrite the test to the corrected check.

## 24. B1 recipe written (2026-10-03, late)

`slice_1_viewer.md` §B1, in full: chart colour tokens, UWP display helpers, the mark layout
table (every number traced to a legacy line), the chart layer painted in batched passes,
routes at hex tier, capital names from `universe/far_labels.json`, selecting a world, the
**omnibox** (Johnny: "very important"; an always-visible field as in the legacy app, with the
legacy matching and ranking), a small command registry, and one Track B step so the API
ranks exact and prefix name matches first. Runs on truth v2. Part B is now three parts: B1
(this), B2 borders and polities (needs truth v3), B3 dossier and shell.
Deliberately left out of B1: subsector title pills, zoomed-out routes, the one-ended route
spread, filters in the omnibox, the panel. Each is named in the recipe with where it goes.

**B1.8 is in (Agent B, 2026-10-03), read and checked:** `/api/truth/search` orders exact name,
then prefix, then the rest, alphabetically within each, with `LIKE` wildcards escaped; the
`MATCH` clause, the released-only join and the limit are unchanged. Check and typecheck clean
here; B reports the gated suite 6 of 6. **Not pushed.** Agent A is mid-B1 in `apps/web`, so a
push of the whole tree now would deploy a half-built chart layer. Either wait for A's report,
or commit only by path: `.github/`, `.gitignore`, the six `universe/raw` files,
`apps/api/src/routes/truth.ts`, `tests/api/truth_build.test.js` and `directives/`.

## 25. B1 is written; browser checks outstanding (2026-10-03, late)

**Agent A reported B1.1-B1.7, B1.9, B1.10 done.** Checked here: `npm test` 72/67/5,
`npm run check` clean with no new allowlist file, no global or literal colour in
`apps/web/src` outside `platform/browser.ts` and `tokens.css`, 24 route colour tokens, the
omnibox calls `fetch` bare (the part A bug cannot recur there). A followed the recipe over
the legacy code in every case it listed, and listed each difference; all are the intended
ones (four-digit hex numbers, marks on nameless worlds, `?` digits match no display rule).
One clean-up A noted: the `home()` callback on the input API is now unused because the Home
key goes through the command registry; remove it in the next web step.

**Not verified (no browser for A or the orchestrator):** every mark's position at Regina,
routes, capital names, selection and URL, the omnibox, and the three frame-time notes. The
dev server (`VOYAGE_API=https://traveller.voyage npm run dev:web`, port 5173) is the way to
look; it proxies search to production, which does not have B1.8's ranking until the next
push. **Do not push `apps/web` before Johnny has looked.**

## 26. B1 is live and CI works (2026-10-03, about 19:30Z)

- Johnny pushed `27383b8` ("bare metal"): the B1 chart layer and omnibox, B's test gate and
  search ranking, the directives. Deployed 19:29Z; the live bundle is the B1 build and
  `/api/truth/search?q=reg` returns prefix names in alphabetical order.
- **The GitHub test workflow ran and passed** on that push (31 s). Note: `gh` in this folder
  resolves to the upstream repository (`bartlebythecoder/traveller_magnus`); Johnny's is a
  fork whose default branch is `campaign`. Always pass `-R johnnyvoruz/traveller_magnus`.
- Johnny has not yet said what he saw in the browser for B1; ask before building on it.
- **Next prompts handed over:** Agent A gets `slice_1_viewer.md` B1.12 (subsector titles,
  and removing the unused `home()` callback). Agent B gets windowed sector feeding for the
  v3 build (`architecture.md` §5 "Sectors are fed a few at a time"; a new `queued` state,
  which needs a hand-written migration `0005` that rebuilds `truth_build_sectors` because
  SQLite cannot alter a CHECK constraint).
- **Orchestrator next:** read `js/borders.js:580-1154` and write the B2 recipe (borders and
  polities as a pure build-time function, truth v3); then the B3 recipe (dossier and shell).

## 27. B1 confirmed by Johnny; B2a recipe written (2026-10-03, late)

- **B1 looks right** (Johnny's screenshot at Regina: starport letters, blue and white discs,
  amber and red zone rings, gas giants, base marks, UWP lines, names inside their own hexes,
  green routes, the teal selection outline, the omnibox, the status line). "Extremely
  performant." B1's browser checks are met by eye; frame times were not measured in
  milliseconds.
- **Johnny wants direction, not only task status** (also saved as a memory): each report says
  where the work sits in the plan, what a user gains, what comes next and the decisions
  approaching.
- **Next step chosen by Johnny: convert the legacy border code.** `slice_1_viewer.md` §B2a is
  the recipe: a DOM stand-in so the oracle can run `importBordersFromXml`, six golden sectors
  (Spinward Marches, Empty Quarter, Solomani Rim, Riftspan Reaches, Verge, Gvurrdon), a
  mechanical port to `packages/generation/src/territories.ts`, and exact parity. Five more
  metadata XML files get un-ignored for the fixtures. B2b (index carries territories, regions,
  truth v3) and B2c (the viewer draws them) are outlines.
- The port goes to whichever implementer is free of `packages/` conflicts: it touches
  `packages/generation`, `packages/shared` (one parser field), `tests/golden`,
  `tests/oracle`, `tests/generation`, `.gitignore`. Agent A is on B1.12 in `apps/web`; Agent
  B is on windowed feeding in `apps/api`. Neither overlaps it.

**B1.12 is in (Agent A, 2026-10-03), read and checked:** `map/titles.ts`, the title pass and
the removal of `home()`; `npm test` 74/69/5 and `npm run check` clean here. A's reported test
failure was Agent B's windowed-feeding work caught mid-edit (an import without `.ts`); it
passes now. A listed six simplifications against the legacy titles (top inset only, plain
subsector rectangle, fewer guarded hexes, vertically centred text); all are what the recipe
asked for. **Unseen in a browser.** Uncommitted alongside B's unfinished work, which includes
migration `0005`: **do not push the whole tree**; A's files are `apps/web/src/map/MapRenderer.ts`,
`input.ts`, `titles.ts`, `views/MapView.vue`, `tests/web/renderer.test.js`,
`tests/web/titles.test.js`. Agent A now takes B2a (the border port).

**Windowed sector feeding is in (Agent B, 2026-10-03), read and checked:** migration
`0005_truth_build_sectors_queued.sql` rebuilds the table with the `queued` state; the build
route starts 12 sectors; `claimNext` (one `UPDATE ... RETURNING`) starts the next one after a
finalize, after `markFailed`, and after a dead-letter that actually changed a row (so a
sector failed by `markFailed` and then dead-lettered does not claim twice). B reports the
gated suite 7 of 7; `npm test` 74/69/5 here. A duplicate final-slice delivery would claim one
extra sector; harmless. Not pushed.

**Assignment swap (Johnny pasted the B2a prompt to Agent B):** fine. **Agent B does B2a (the
border port)** in `packages/`, `tests/golden`, `tests/oracle`, `tests/generation`,
`.gitignore`. **Agent A is free** and gets a read-only inventory of the legacy world
inspector (`js/system_inspector.js`) into `findings/legacy_inspector_inventory.md`, as
groundwork for B3.

**Johnny on the dossier (2026-10-03):** keep **everything** from the legacy inspector, with the
design revamp (`design_reference.md`) applied. Recorded in `slice_1_viewer.md` §B. Read-only
content lands in B3; editing controls wait for the Builder slice. B3's recipe waits on Agent
A's inventory of `js/system_inspector.js`.

## 28. B2a done and verified; B2b written (2026-10-03, late)

- **B2a (Agent B): the legacy border code is ported with exact parity.**
  `packages/generation/src/territories.ts` (488 lines), `tests/oracle/xml_dom.js`, twelve
  golden cases over six sectors, five more metadata XML files tracked. Checked here:
  `npm test` 102/97/5, check clean, the port references no legacy or DOM global. One oracle
  stub changed (`element().querySelector` returns an element instead of null, so the legacy
  `renderBorderWindow` can finish); every earlier golden case still matches its fixture.
- **Legacy behaviour now visible, ported as it is** (decide in B2c, when it is on screen):
  the stylesheet colour `lightblue` is not in the legacy colour table, so the Darrian
  Confederation keeps the default red; any allegiance code starting `V`, `Kk` or `Zh` is
  merged into one polity whatever its label; a group whose borders are all
  `ShowLabel="false"` can end with zero hexes (Julian Protectorate in the Empty Quarter).
- **B2b is written** (`slice_1_viewer.md`): the index gains `territories` and
  `metadata.allegiances`; no Worker code change; truth **v3**. Regions are left for a later
  version. Prompt handed to Johnny for Agent B.
- Agent A wrote `findings/legacy_inspector_inventory.md` (the B3 groundwork); its report has
  not been pasted yet.
- **Unpushed and reviewed:** A's subsector titles, B's windowed feeding with migration `0005`,
  B's border port, the directives. After B2b the whole tree goes out in one push.

## 29. B2b in and verified; everything in the tree is ready to push (2026-10-03, late)

- **B2b (Agent B):** the index carries `territories` (empty ones dropped) and
  `metadata.allegiances`; `truth:local` builds `v3`. Checked here: `npm test` 103/98/5, check
  and typecheck clean, `npm run build` succeeds. B reports the gated suite 7 of 7. Spinward
  Marches index: 123,907 → 131,003 bytes.
- **The whole working tree is reviewed and unpushed:** subsector titles (A), windowed
  feeding with migration `0005` (B), the border port and its fixtures (B), B2b (B), the
  inspector inventory (A, `findings/`), the directives. One push ships it all.
- **v3 inputs:** `node tools/truth/upload_inputs.js v3` started by the orchestrator (1,025
  files under `inputs/v3/`, about 20 minutes; resumable from its ledger).
- **After the push:** confirm the deploy and that migration `0005` applied; when the upload
  is done Johnny runs the build command with `version: 'v3'`; expect 12 sectors `building`
  and 500 `queued` at the start, then steady completions; release `v3`
  (`/api/admin/truth/release/v3`, up to a minute).
- **Note:** `SectorIndex` now requires `territories` and `metadata.allegiances`, so the release
  route can no longer validate a v2 index. v2 is already released, so nothing needs that.

## 30. Re-plan: v3 waits, is batched, and will be derived instead of rebuilt (2026-10-03, late)

- **Johnny does not want to re-run the truth for every change.** Decision
  (`slice_1_viewer.md` §B2d): v3 is not built now. First three more truth changes are made
  (regions; route colours resolved at build; polities in the overview), then a **derived
  build** (B2d.4) makes v3 from v2's indexes without regenerating a tree: minutes instead of
  an hour, allowed only when seed, settings and engine version match the source version.
  From then on only an engine or input change needs a full build.
- **Agent B re-ran its last prompt by accident;** the tree is intact (`npm test` 103/98/5,
  check clean, same 23 changed files).
- **v3 inputs are being uploaded** (457 of 1,025 at this note); harmless and wanted, since the
  derived build reads the metadata XML from `inputs/v3/`.
- **Nothing is pushed since `27383b8`.** The reviewed tree (titles, windowed feeding with
  migration `0005`, the border port, B2b) can be pushed at any time; none of it starts a
  build.
- **Assignments:** Agent B → B2d.1 (regions port). Agent A → waits for the B3 dossier recipe,
  which the orchestrator writes next from `findings/legacy_inspector_inventory.md` (A's
  report received). B2c (drawing borders) moves after v3.
- Johnny said he is losing track of who has what; every reply now ends with a three-line
  board (A, B, Johnny).
