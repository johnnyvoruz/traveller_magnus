# Handoff — orchestrator notes, 2026-10-03

> **New orchestrator session: read `orchestrator_start_here.md` first.** It is the state on
> one page (2026-10-05). This file is the full log; sections 1 to 64 are history, and the
> current leg starts at §65.

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

## 31. Three fresh implementers; B3a and the derived build specified (2026-10-03, about 20:45Z)

- **Pushed and live:** `8880ef2` ("b2") deployed 20:27Z; migration `0005` applied in
  production; the GitHub test workflow passed. The tree was clean after it.
- **Johnny is clearing the implementers' contexts and adding a third (Agent C).** A fresh
  session knows nothing, so `directives/implementer_brief.md` now exists: rules, commands,
  what is already built, how to report. Every prompt starts by sending the agent there.
- **Assignments (no two share a folder):**
  - **Agent A:** B3a, the panel and dossier (`apps/web`, `tests/web`). Recipe
    `slice_1_viewer.md` §B3, written from `findings/legacy_inspector_inventory.md`.
  - **Agent B:** B2d.1, the regions port (`packages/`, `tests/golden`, `tests/oracle`,
    `tests/generation`, `.gitignore`).
  - **Agent C:** B2d.4, the derived build (`apps/api`, `tests/api`, plus the one file
    `packages/shared/src/schemas/generate.ts`). It includes migration `0006`. Only C may run
    `npm install`, and should not need to.
- **B3a decisions made by the orchestrator:** the panel's column width is the legacy 520 px,
  not the design reference's 320 px (Johnny: keep everything); display name tables are copied
  into `apps/web/src/dossier/labels.ts` and held to the engines by a test, because the viewer
  may not import the engines; the surface-map lead, the scanner and the orbit buttons wait
  for part C with a slot left; referee notes, the campaign block and the edit controls wait
  for the slices where that data exists; body deep links use new keys (`s0`, `w3`, `w3m1`).
- **Still to write:** B2d.2 (route colours) and B2d.3 (polities in the overview), then v3 is
  derived from v2 and B2c draws borders.

## 32. Regions and the derived build are in and verified (2026-10-03, about 21:15Z)

- **B2d.1 regions (Agent B):** `packages/generation/src/regions.ts`, six golden cases over
  Riftspan Reaches, Kalash and Afawahisa, exact parity. `SectorIndex` now requires `regions`.
  Open nit: the oracle does not load `js/regions.js`, so the legacy default region slots are
  not in play; names, colours and hexes come from the XML either way. B is asked to load it
  and confirm the fixtures do not change.
- **B2d.4 derived build (Agent C):** `from` on the build request, migration
  `0006_truth_versions_derived_from.sql`, `deriveSector` sharing `publishSector` with
  finalize; six or seven binding calls a sector. **Not applied to production yet.**
- **Verified together by the orchestrator:** `npm test` 129/124/5, check clean, and the gated
  Worker suite 9 of 9 with B's and C's changes in the same tree.
- **Legacy behaviour made visible by the regions port, carried as it is:** region colours
  `SeaGreen` and `Plum` are not in the legacy colour table and come out grey; the region gap
  seal uses a different (cruder) hex-line routine than the border one.
- **Written now:** B2d.2 (route colours at build time) and B2d.3 (polities in the overview)
  for Agent B in one prompt; B2c.1 (outline geometry, new files only) for Agent C. Agent A is
  mid-B3a in `apps/web`.
- **Push:** B's and C's work can go by path (everything outside `apps/web` and `tests/web`),
  or wait for A. It carries migration `0006`.
- **Then:** when B2d.2 and B2d.3 are in and pushed, Johnny derives v3 from v2 with
  `{ version: 'v3', from: 'v2', ...same pinned values, sectors: 'all' }` and releases it.

**B3a is in (Agent A, 2026-10-03), read and checked:** the one panel, the dossier overview
and body profile, tree fetching, display labels held to the engines by a test, body deep
links. `npm test` 130/125/5 and check clean here; no new allowlist file, no global, literal
colour or engine import in `apps/web/src`. A's three questions are answered by the
orchestrator and recorded in `slice_1_viewer.md` B3a.6a (all accepted). **Unseen in a
browser:** everything in B3a.7. The dev server on port 5173 is still running against
production. Do not push `apps/web` before Johnny has looked.

## 33. The dossier's look was rejected; a design agent is being added (2026-10-03, about 21:40Z)

- **Johnny saw B3a in the browser:** the data is right, the look is not. "This is not cohesive
  at all ... I feel like we lost all the work we did before." Visible in his screenshot: plain
  rows with no hierarchy, an empty boxed map slot, the omnibox colliding with the panel
  header, loud subsector title pills, the status line overlapping the map edge, nothing that
  reads as the legacy sci-fi inspector.
- **Cause, the orchestrator's:** the B3a recipe specified structure and data and told the
  implementer to restyle with tokens and copy no CSS rule. Nobody was asked to reproduce the
  legacy look, and nobody with a browser judged it. Nothing is lost: the legacy app is
  intact, and the data path, model and behaviour are done; the presentation layer needs a
  design pass.
- **Agent D (high effort, UI design)** gets the presentation layer of `apps/web`: the shell
  (panel, omnibox, status line, title styling), the dossier components' templates and styles,
  `tokens.css`, and the design-system page. It does not change models, map logic or tests'
  meaning. **While D works, no other agent edits existing files in `apps/web`** (Agent C's
  two new outline files are fine).
- **Rule from now on:** a UI part that rebuilds a legacy feature has the legacy look in its
  spec and a visual acceptance step against the legacy app; tests alone do not make it ready.
- B3a's `apps/web` work is unpushed and stays unpushed until D's pass is accepted.

**B stopped correctly on the regions loose end (2026-10-03).** With `js/regions.js` loaded
(as the real legacy app has it), the region definitions start from default slots and are
sorted and trimmed afterwards (`js/regions.js:50-76`): the named regions' colours and hexes
are unchanged, but their order becomes alphabetical and one empty default slot is appended.
**Decision (orchestrator):** the oracle loads `js/regions.js`, because parity is with the real
app; the golden case returns only regions that own at least one hex, in the legacy order; the
three fixtures are rewritten once from that oracle, with a check that every named region's
colour and hexes equal the old fixture's; the port orders its output the same way. Then B
continues with B2d.2 and B2d.3.

**B2c.1 is in (Agent C, 2026-10-03), checked:** `apps/web/src/map/outline.ts` and its test;
`npm test` green with it. C kept the legacy vertex rounding at the legacy pixel scale (in
parsecs the same rounding would merge a hex's own corners) and noted that the legacy mitre
moves a corner by `inset * 2 / sqrt(3)`, not by the inset; both ported as they are.
**B2c.2 written** (territories and regions at hex tier, one filled and stroked path per
polity joined across sectors) and handed to Agent C. It edits `MapRenderer.ts`, which Agent D
(presentation only) does not touch; it cannot be seen in a browser until truth v3 exists.

## 34. All truth changes for v3 are in and verified (2026-10-03, about 22:00Z)

- **Agent B finished B2d.1 (corrected), B2d.2 and B2d.3:** regions with the real legacy
  ordering (only order changed in the rewritten fixtures; colours and hexes identical),
  route colours resolved at build time (`resolvedColor` on each route; parity on Spinward
  Marches, Gvurrdon and Tuglikki), polities in the overview (`polities`, `owners`).
- **Verified by the orchestrator with everything in one tree:** `npm test` 148/143/5, check
  clean, typecheck clean, gated Worker suite 9 of 9.
- **v3 is ready to derive.** Steps: push everything **except `apps/web` and `tests/web`**
  (Agents C and D are mid-work there, and A's dossier awaits D's design pass); the push
  carries migration `0006`. Confirm the deploy. Johnny runs the build command with
  `version: 'v3', from: 'v2'` and the same pinned values. Twelve sectors in flight, a few
  minutes in all, no tree written. Then `POST /api/admin/truth/release/v3`.
- After release the live viewer (B1) reads v3 by itself; nothing changes on screen until
  B2c.2 (borders) is pushed.

## 35. Agent D's design pass is in (2026-10-03, about 22:30Z)

- **Result:** the panel, dossier, omnibox and status line now follow the legacy look
  (`findings/ui_design_audit.md`; before, after and legacy screenshots in
  `findings/ui_design_shots/`). Compared by the orchestrator: `after_column.png` against
  `legacy_column.png` is very close: floating card, title with hex chip, width control, UWP
  ribbon cells, two-line stat rows with the code tile, the surface stage as a framed
  placeholder. `/design` renders the primitives. `npm test` 150/145/5, check clean, build
  succeeds. D also added a favicon (a far-trader wedge with a red V; the red is D's guess).
- **Defect D found, fixed by the orchestrator:** `MapView.vue` read
  `index.metadata.allegiances` unguarded; truth v2 indexes have no such table, so the
  computed threw and clicking a body left the panel on the overview. Now defaults to an
  empty table.
- **`design_reference.md` amended (new §0):** where it disagreed with the legacy app, the
  legacy look is now the rule (shadows on floating chrome, 2 px amber focus ring, Inter in the
  panel, 520 px column, the omnibox as an always-visible top-left field).
- **D's open requests** (audit §3): glyph data in the dossier model (R1), body position
  "14 / 30" (R2), subsector pill theme fields in the renderer (R3), Inter 500 and 600 font
  files (R4), the icon set (R5), a prop rename (R6), the rail (R7). R1, R2, R6 go to Agent A
  now; R3 to Agent C after B2c.2; R4 and R5 need Johnny; R7 is B3c.
- **Still unpushed:** all of `apps/web` (A's dossier, D's restyle, C's outline and
  territory work in progress). Johnny looks first.

**Johnny's feedback on D's pass (2026-10-03):** (1) the system tree needs dividers between
parent planets, like every other panel section; (2) text contrast must meet accessibility
requirements, and some of the small text does not look like it does; (3) not all of Font
Awesome is needed, but the icon sidebar (rail) used it and the rail does not exist yet.
Sequence: Agent A's model changes first (they touch `Panel.vue`, `DossierPanel.vue`,
`glyph.ts`), then Agent D's second pass, so the two do not edit the same files at once.

**Agent A's model changes for the design are in (2026-10-03), checked:** glyph kind and star
letter on tree rows, body links and body models; `index` and `total` on the body model;
`Panel`'s `chip` prop. `npm test` 150/145/5, check clean, build succeeds; `glyph.ts` no longer
matches on label text. A also updated the design page's sample data so it still matches the
components. Legacy puts the position counter after Next; the prompt asked for between, and
that is what was built. **Agent D's second pass (dividers, contrast, rail, icons) can start.**

**B2c.2 is in (Agent C, 2026-10-03), checked:** `territory_layer.ts`, the renderer passes and
tests; territories and regions join across sector edges, fills under the grid, outlines after
the routes; shapes rebuilt only when the set of loaded indexes changes. Suite 150/145/5.
Unseen until truth v3 exists. **B2c.3 written** (polities at the zoomed-out tiers from the
overview's `polities` and `owners`, outlines built one polity per frame, cached paths) and
handed to Agent C. The subsector pill theme fields (D's R3) wait until D's second pass is
done, since both touch the map theme.

**`findings/` is now git-ignored (Johnny's request, 2026-10-03).** Four files that were already
committed (`README.md`, `agent_m_features.md`, `agent_m_technical.md`,
`legacy_inspector_inventory.md`) were removed from git's index with `git rm --cached` and stay
on disk; that removal is staged and goes out with the next commit. The folder is working
papers: reviews, the inspector inventory, the design audit and screenshots. The recipes still
cite `findings/legacy_inspector_inventory.md` and `findings/ui_design_audit.md`; they exist on
this machine only, so a fresh clone will not have them.

## 36. Truth v3 derived from v2 in under three minutes (2026-10-03, 22:38-22:41Z)

- Pushed as one clean commit `469f212` (non-web only; an earlier local commit that had picked
  up half of `apps/web` was undone with `git reset origin/campaign` before pushing). GitHub
  tests passed; deployed 22:16Z; migration `0006` applied.
- Johnny ran the build with `version: 'v3', from: 'v2'` at 22:38:55Z. Twelve sectors in
  flight, about 1.2 s each, every `truth-derive` invocation `ok`. **All 512 `done` by
  22:41:37Z**, none failed: 180,312 systems, 156,222 built, 24,090 partial, 180,312
  `truth_systems` rows, exactly v2's numbers. No tree was written.
- Verified on the CDN: the v3 Spinward Marches index is 131,999 bytes (the local build's
  size), `truthVersion` `v3`, four territories (36, 60, 739, 52 hexes), an allegiance table,
  36 of 127 routes with a resolved colour, and Regina's tree hash unchanged from v2.
- **Next:** Johnny releases v3 (`POST /api/admin/truth/release/v3`, up to a minute). The live
  viewer and the local dev server then read v3 by themselves; borders appear locally as soon
  as it is released, because Agent C's drawing is already in the working tree.

**B2c.3 is in (Agent C, 2026-10-03), checked from the report:** `polity_layer.ts`, zoomed-out
polities built one per drawn frame into cached `Path2D`s. Three loose ends:
1. **Not wired to the frame loop.** `MapView.vue` clears its dirty flag after one draw, so a
   map that sits still builds only the largest polity; the rest wait for the next drag or
   zoom. The renderer must report unfinished work (`draw` returns `pending`) and `MapView`
   must stay dirty while it does. `MapView.vue` is Agent D's file until D's second pass
   reports; then this is a small step for Agent C.
2. **Timing:** one synthetic 30,000-hex polity took 51.7 ms inside the full suite and 21.6 ms
   alone. Borderline against the 50 ms rule; accepted until the browser check on real v3 data
   says whether a frame hitches. If it does, the remedy is building in a Web Worker.
3. `tests/web/contrast.test.js` currently fails four pairs: that is Agent D's second pass in
   progress (the test exists, the tokens are not all fixed yet), not C's.
**v3 is derived but not yet released** (health still reports v2; no `truth/v3/overview.json`).

## 37. Agent D's second pass is in; the web tree is whole again (2026-10-03, about 23:00Z)

- **Done by D:** dividers in the system tree; contrast held to WCAG 2.1 AA with
  `tests/web/contrast.test.js` (61 pairs; small text held to 7:1 by D's choice); the rail
  (`shell/Rail.vue`, 68 px, 196 px expanded, and at Johnny's request to D the expanded rail
  pushes the panel, omnibox and chart aside instead of covering them); 34 icons extracted
  from the legacy kit into `design/icons.ts`, no webfont shipped.
- **Checked here:** `npm test` 214/209/5, check clean, typecheck clean, build succeeds; no
  global outside the browser adapter.
- **Open, from D:** (R8) the registry has no command that opens the system panel, so the
  rail's System item can only close it; (R3) subsector pill theme fields in the renderer;
  two route colours under 3:1 on the map (X-boat green 2.85, core-route purple 2.08), left
  for Johnny to decide.
- **Licence flag for Johnny (not legal advice):** the legacy kit in `assets/fontawesome` is
  Font Awesome **Pro** 7.3.1, 67 tracked files, and the GitHub repository is **public**. Four
  of the new icons are Pro-only (planet-ringed, book-sparkles, calendar-star, solar-system).
  Whether a Pro kit and Pro icon outlines may sit in a public repository is his to check
  against his Font Awesome licence; the safe options are swapping the four for Free icons,
  or making the repository private.
- **Next for Agent C (MapView is free again):** the renderer reports unfinished polity
  outlines and the frame loop keeps drawing; a registry command that opens the system panel
  for the current selection; the subsector pill theme fields.
- **v3 is still unreleased**; nothing of the border work can be seen until it is.
- **All of `apps/web` and `tests/web` is unpushed** and, with C's next step, ready for one
  push once Johnny has seen borders locally.

**Note recorded for later (Johnny, 2026-10-03):** the date and time readout shows days of the
week: Wonday, Tuday, Thirday, Forday, Fiday, Sixday, Senday, starting after day 001 and
running to day 365. Written into `campaign_manager_plan.md` §7.9 with the delighters. The
orchestrator's reading (day 001 has no weekday; day 002 is Wonday; day 365 is Senday) needs
his confirmation before it is built. Not started.

**Weekday note corrected:** day 001 is called "Holiday" (Johnny), outside the week; day 002 is
Wonday. `campaign_manager_plan.md` §7.9.

**Agent C's wiring is in (2026-10-03), checked:** `draw` returns `pending` and the frame loop
keeps going until every polity outline is built; the `system-panel` registry command opens
or closes the dossier and the rail's System item uses it; subsector titles read
`--chart-title-text` and `--chart-title-pill`, with the pair in the contrast test.
`npm test` 217/212/5, check clean, build succeeds. **The web tree (37 changed or new files
under `apps/web` and `tests/web`) is complete and unpushed:** A's dossier, D's two design
passes and rail, C's borders, polities and wiring. **v3 is still unreleased** (health reports
v2), so borders have not been seen by anyone yet.

## 38. Truth v3 released and the web work is live (2026-10-03, about 23:00Z)

- **Pushed:** `45421b0` "dossier, design pass, rail, borders and polities" (all of `apps/web`
  and `tests/web`). GitHub tests passed; deployed 22:58Z; `/`, the Regina deep link,
  `/account`, `/design` and `/favicon.svg` answer.
- **v3 released by Johnny** (manifest hash `25e71e51...2afe`); `/api/health` reports
  `truthVersion: v3`. Verified by the orchestrator: manifest and overview pass the strict
  schemas, 512 sectors, 180,312 systems, the overview hash matches the manifest, and the
  overview carries polities and owners.
- **Font Awesome:** Johnny holds a Pro licence and says the icons are fine as they are.
- **Live now, not yet seen by anyone in a browser on production:** borders and polity fills,
  the rail, the restyled dossier. Johnny looks next.
- **Slice 1 still to do:** jump times and Trade Match in the dossier (B3b); legend, help,
  view settings, toast (B3c); regions' and territories' names with the view settings; the
  orbit view and planet imagery (part C). Open with Johnny: the two low-contrast route
  colours; whether small text stays at 7:1; the favicon's red.

## 39. Borders work and are too heavy on first paint (2026-10-03, about 23:10Z)

- **Johnny saw borders locally on v3:** they draw, and they cost: "BIG COMPUTE and slowdown
  on initial paint". He expected the Worker to matter; it does not, the cost is in the
  browser and production behaves the same.
- **Measured:** 447 distinct polities, 116,705 owned hexes, Third Imperium 21,813, Aslan
  Hierate 17,723, Zhodani Consulate 13,468. Causes: one outline per frame on the main thread
  when zoomed out, and a full rebuild of every loaded territory whenever one more index
  arrives when zoomed in.
- **Fix written, `slice_1_viewer.md` B2c.4, for Agent C:** one polity layer from the overview
  for every tier, built once in a Web Worker and cached as paths; the index-based territory
  rebuild is removed; regions are computed once per index. A possible later step (ship
  prebuilt outlines in the overview) is noted, not started.
- **Seen while verifying v3:** `/api/truth/search` without a `version` now returns rows from
  both released versions (v2 and v3). The omnibox always passes the version, so the app is
  unaffected; the API should default to the newest released version. Small item for the
  next Worker prompt.
- The overview is 1.4 MB raw with polities (it was 715 KB); it compresses well, but measure
  the transfer size in the next browser check.

## 40. Border performance: the plan changed from a browser worker to a file (2026-10-03, about 23:25Z)

- **Johnny's second look:** once loaded the map is "buttery smooth"; a cold visit (private
  window) has "a heavy load". The cost is the browser recomputing 447 outlines on every cold
  visit.
- **Decision (orchestrator):** B2c.4 (a Web Worker) is superseded before being built. B2c.5:
  the outlines are computed once at release and shipped as `truth/<v>/polities.json`; region
  loops go into the index; the viewer only draws. This removes all outline code from the
  browser and makes a cold visit one more small download.
- **Assignments:** Agent B, B2c.5a (packages, tools, release route). Agent C, B2c.5b (the
  viewer reads and draws the file; the compute modules are deleted). They can run at the same
  time: B copies `outline.ts` into the package and does not touch `apps/web`; C works from the
  documented file shape with a hand-written fixture.
- **Then:** push, derive v4 from v3, release v4.

## 41. Bug: search lands on a blank hex for worlds in sectors the map does not draw (2026-10-03)

- **Johnny's report:** searching "Rigel" and opening the first result goes to
  `/s/Rigel/3103`, an empty hex far from everything.
- **Cause:** `Rigel` is a non-canonical sector (tags `Apocryphal`, `Faraway`, at 69, 60). The
  search API returns worlds from all 512 sectors; the map draws only the 399 canonical ones,
  so the camera flies to a place where nothing is drawn. For `q=Rigel`, 47 of the first 50
  results are worlds in non-canonical sectors (the sector's name matches the query).
- **Fix now (Agent A, viewer):** the omnibox shows only systems whose sector is on the drawn
  layer, and a route to a sector that is not on the layer falls back to the home view with a
  message instead of a blank chart.
- **Fix later (Worker, with the next API prompt):** the search takes the layer so its 50
  results are all usable; that needs the canonical flag in D1 (a column on
  `truth_build_sectors`, filled when a sector is published). Bundle with: search without
  `version` should default to the newest released version (it returns v2 and v3 rows today).
- The alternate-sector layer chooser (part B3c) is what will make those worlds reachable.

**Display bug found by Agent D (2026-10-03): subsector titles jitter while panning.** The
placement is recomputed every frame against the visible part of the subsector, as the legacy
code does. Decision: D's recommended approach, written as `slice_1_viewer.md` B1.12a (anchor
in map space, cached per zoom step, sticky clamp at the edges, fade instead of dodging). The
title colours D asked for (R3) are already done by Agent C. **Who:** Agent D, with its
boundary lifted for `map/titles.ts`, the title pass in `MapRenderer.ts` and
`tests/web/titles.test.js`, because D has a browser and this is judged by eye. **When:** after
Agent C reports on B2c.5b, since C is editing `MapRenderer.ts` now.

**Search bug fixed in the viewer (Agent A, 2026-10-03), checked:** on the canonical layer the
omnibox drops systems whose sector is not canonical or not in the manifest; a route to a
non-canonical sector goes to the home view with "<name> is not on the canonical chart."
`npm test` green with it. Note from A: `targetFor` does not take the layer, so when the map
can draw the `all` layer it must be told. Unpushed; goes out with Agent C's border work, which
is in flight in the same folder.

**B2c.5b is in (Agent C, 2026-10-03), checked:** the viewer fetches `truth/<v>/polities.json`
(a 404 means no borders, no error), builds one `Path2D` per polity (447 paths in under a
millisecond in the test), draws them at every tier with bounding-box culling, and fills
regions from each index's `loops`. `outline.ts`, `territory_layer.ts`, `polity_layer.ts`,
the per-frame build and `pending` are gone: the viewer computes no outlines. `npm test`
221/216/5, check clean. **Until v4 exists the viewer draws no borders at all** (v3 has no
`polities.json`), which is also what the live site will show if this is pushed before v4 is
released. Agent B's build side (B2c.5a) appears to be in the tree (`packages/generation`
has `outline.ts`, `geometry.ts`, `polities.ts`; the release route and `tools/truth/build.js`
mention polities); its report has not been pasted yet. Agent D can start B1.12a now that
`MapRenderer.ts` is free.

## 42. Borders as a file: both halves in and verified (2026-10-03, about 23:55Z)

- **B2c.5a (Agent B):** `packages/generation/src/geometry.ts`, `outline.ts`, `polities.ts`;
  `TruthPolities` and `politiesHash`; region `loops` in the index; the release route writes
  `truth/<version>/polities.json`; `truth:local` builds `v4`. Measured on the local
  catalogue: 345 canonical polities, 45,902 loop points, 752,455 bytes, **104 ms** to build.
- **Verified by the orchestrator on the combined tree:** `npm test` 221/216/5, check clean,
  typecheck clean, build succeeds, gated Worker suite 9 of 9.
- **Ready to push in one commit** (`git add -A`; no agent is mid-task: Agent D has not yet
  started B1.12a). It also carries Agent A's search fix.
- **v4 inputs** are being uploaded by the orchestrator (`upload_inputs.js v4`, about 20
  minutes): the derived build reads the metadata XML from `inputs/<version>/`. Improvement to
  make later: a derived build should read its inputs from the source version, so nothing has
  to be uploaded again.
- **Then:** push → confirm deploy → Johnny derives `v4` from `v3` → release `v4` → borders
  come back on the live site, drawn from the file.

## 43. Truth v4 released: borders are a file (2026-10-03, 23:39-23:45Z)

- Pushed `62d34c5`; deployed 23:30Z. v4 inputs uploaded (1,025 files). Johnny's first
  derive attempt ran before the upload finished and was refused cleanly ("Sector catalogue is
  missing"); the second ran 23:39:20-23:41:58Z, all 512 `done`, none failed, totals
  unchanged. **v4 released**, manifest hash `837ac280...85a7` (matches the CDN file).
- **Verified:** manifest, overview and `polities.json` pass the strict schemas; both hashes in
  the manifest match; `polities.json` is 752,455 bytes raw, **187 KB over the wire**, served
  from the CDN cache; 345 entries, 45,902 loop points; `/api/health` reports v4. Region loops
  are in the indexes.
- **Defect found in the data, not in the code path:** polity colours. 287 names in 345
  entries; 22 names are split across colours (Third Imperium across seven) and the five
  largest polities are the same red. The legacy code assigns default colours per import slot
  and the port runs per sector. Fix written as `slice_1_viewer.md` B2c.6: join by name, one
  colour per polity from a hand-kept table (`universe/polity_colours.json`, empty to start)
  or a stable hash into the legacy cycle. Needs a **v5** (derived).
- **Also written, B2d.5:** derived builds read inputs from the source version (no re-upload),
  search defaults to the newest released version, search takes the layer (migration `0007`).
- **Assignments:** Agent B → B2c.6. Agent C → B2d.5. Agent D → B1.12a (title jitter). Then
  push, derive v5 from v4 with no upload, release v5.

## 44. Cold load is fast; the reasons are now a rule for the builder slices (2026-10-03, late)

- **Johnny, private window on the live site with v4:** "Cold load is insanely fast at like
  130 ms." He asked that the optimisations be written down so that builders' own universes
  get them too. Recorded as `architecture.md` §10.1: the viewer downloads and draws and never
  derives; one small file per zoom level; immutable versioned files; derived data rebuilt
  without regenerating; batched cached paths; measure cold. Slice 2's recipe starts from it.
- **Next big piece: the orbit view (slice 1 part C).** It also fills the dossier's surface-map
  slot. The legacy sources are `js/system_viewer.js` (5,420 lines), `planet_profile.js` (312),
  `planet_gl.js` (1,213), `planet_renderer.js` (1,388). First step: a read-only inventory by
  Agent A into `findings/legacy_orbit_inventory.md`, then the recipe in parts (the orrery
  model as a parity port; the shell and 2D renderer; the 2.5D WebGL renderer; planet imagery),
  with Agent D on the look from the start.
- In flight: Agent B (polity colours, B2c.6), Agent C (derive without upload, search, B2d.5),
  Agent D (title jitter, B1.12a). Then v5.

**B1.12a is in (Agent D, 2026-10-03), checked:** titles are anchored in map space and cached
per zoom step; in D's browser drags no pill moved further than the pan step or changed size.
`npm test` green. Two follow-ups written as `slice_1_viewer.md` B1.12b and handed back to D:
titles stick only to the top edge (a side-clamped pill can cover a world's labels) and fade
at the other edges; `draw` returns `animating` and `MapView`'s loop drives the fade instead
of the renderer scheduling its own frame. Agents B (B2c.6) and C (B2d.5) had not started;
their prompts were given to Johnny again.

**B2c.6 is in (Agent B, 2026-10-03), checked:** polities join by name; colour comes from
`universe/polity_colours.json` (empty) or `BORDER_COLOR_CYCLE[hashString(name) % 20]`; 287
polities, 20 colours on the local catalogue; `truth:local` builds `v5`. `npm test` 232/227/5,
check clean; B reports the gated suite 9 of 9. With the table empty the defaults are, for
example: Third Imperium `#ffffff`, Zhodani Consulate `#fb8500`, Aslan Hierate `#9d4edd`,
Solomani Confederation and Hive Federation both `#c77dff`, Vargr Extents and Two Thousand
Worlds both `#b5e48c`. Johnny may want to set the major polities by hand before v5. Agents C
(B2d.5) and D (B1.12b) are mid-work in the tree; push after both report, then derive v5 from
v4 with no upload.

**B1.12b is in (Agent D, 2026-10-03), checked:** titles stick only at the top and fade at the
other edges; `draw` returns `animating` and the view's loop drives it; the top inset is 68 px
(the legacy value; 56 tucked the title under the omnibox). `npm test` green, build succeeds.
**Consequence D flagged:** fewer titles. A subsector whose anchor is off to the left or under
the panel has no title even when it fills the view (at ppp 128 with the panel open, the
Regina subsector is unlabelled). Orchestrator's suggestion, for Johnny to judge in the
browser: keep the pills as they are and add a constant "Sector · Subsector" readout for the
centre of the view in the status line, so the location is never lost.

## 45. Direction from Johnny on truth and builders' maps; part C started (2026-10-03, late)

- **Johnny:** border colours should be set through the UI, per map; the legacy app had CRUD
  for borders and routes and the new one has neither yet; only admin accounts edit the truth;
  hold the truth steady, and support each account's own version either as differences
  overlaid on the truth or as a blank universe. Recorded in `plan.md` (before slice 2). This
  matches the existing model (overlay document v3; `truth_version` pinned or null). The
  polity colour file stays as the truth's default until the admin UI exists; **v5 goes ahead**
  because it fixes the split polities, and after it the truth is left alone.
- **Agent A's orbit inventory is in** (`findings/legacy_orbit_inventory.md`, 771 lines). The
  legacy orbit view is a 2D canvas. Part C is planned as: C1 model (parity port, MgT2E
  branch only, since the truth is Mongoose-generated), C2 the 2D view matching legacy with
  Agent D on the look, C3 line-up, C4 planet imagery, C5 the 2.5D WebGL view decided again
  once C2 is on screen. **C1 is written** and goes to Agent A.
- **B3b.1 written** (100D jump times from the tree's `journeyTimes`; no rules maths in the
  viewer) for Agent B.
- **Agent D** gets a read-only look audit of the legacy orbit view (shell, chips, time
  controls, tooltips) so C2's recipe has the look in it from the start.
- Still in flight: Agent C on B2d.5. Then push and v5.

**Johnny (2026-10-03): Agent D is authorised to implement the orbit view** and to lean into
the design delighters (`campaign_manager_plan.md` §6, §7.4-§7.8). Recorded in
`slice_1_viewer.md` part C. Split: Agent A ports the model (C1, parity); Agent D writes
`findings/orbit_view_design.md` and builds C2 onward (shell, time controls, the view, the
delighters), reporting at milestones; the orchestrator reviews the plan and each milestone.
Agent B takes B3b.1 (jump times).

**Agent D wrote `findings/orbit_view_design.md` and stopped** (the pasted brief reached it
garbled, so it did not start the shell). Orchestrator's answers, sent back with the go-ahead:
body keys are the dossier's (`s<i>`, `w<i>`, `w<i>m<j>`); D ports the layout helpers itself
with tests in `apps/web/src/orbit/layout.ts`; the hex key comes from the route, not the
model; D may edit `map/input.ts` and `MapView.vue` for the double-click entry; the dossier's
base-path option waits until Agent B has finished jump times in that folder. Seven questions
are Johnny's: seasons on a moon, the season convention, the "today's temperature" formula,
the starting date, whether to keep body chips, the temperature scale default, and whether the
highport art in `assets/starports/` may ship.

## 46. B2d.5 in and verified; v5 is ready to derive (2026-10-04, early)

- **Agent C:** a derived build reads `sectors.json` and each `<slug>.xml` from
  `inputs/<from>/` when the new version has none (no TSV needed for a derive); search with no
  `version` uses the newest released version; `layer=canonical` (default) or `all`, through a
  new `truth_build_sectors.canonical` column (migration `0007`, written by `publishSector`).
  A version whose `canonical` is all NULL is searched as `all`, so v2 to v4 behave as before.
- **Verified by the orchestrator:** `npm test` 232/227/5, check and typecheck clean, gated
  Worker suite 12 of 12, with B's colour change in the same tree.
- **Push by path** (Agents A, B and D are mid-work in `apps/web`, and A in `tests/golden` and
  `tests/oracle`): `apps/api packages tests/api tests/generation tools universe package.json
  directives`. Carries migration `0007`.
- **Then:** derive `v5` from `v4` (no upload this time), release `v5`. Polities become one
  shape and one colour each (287, from the hash rule; `universe/polity_colours.json` is
  empty). After v5 the truth is held steady (Johnny's direction, `plan.md`).
- **Unpushed web work, complete but mixed with work in flight:** Agent D's title follow-up
  (B1.12b). It goes out with the next web push.

**B3b.1 is in (Agent B, 2026-10-04), checked:** the dossier overview and each world's body
profile show the six stored 100D jump times (`journeyTimes` from the tree, no maths in the
viewer); `JourneyTimes.vue` uses the existing primitives, no new token. Suite green. Unseen
in a browser. The dossier folder is free again, so Agent D may add the base-path option it
asked for.

## 47. v5 derived; release refused once, cause found (2026-10-04, 00:30Z)

- Pushed `39f45b9`; GitHub tests passed; deployed 00:28Z; migration `0007` applied. Johnny
  derived v5 from v4 with no upload: 512 `done` in about 2.5 minutes, totals unchanged,
  `canonical` filled (399 of 512).
- **Release of v5 answered 409 "No catalogue entry for Calidan."** Cause: B2d.5 taught the
  build route and `publishSector` to read inputs from the source version, but the **release**
  route (`admin.ts`, about line 238) still reads `inputs/<version>/sectors.json` only, and a
  derived version has no inputs of its own. Nothing was written; the refusal was clean.
- **Done by the orchestrator to unblock:** uploaded the one file `inputs/v5/sectors.json`
  (the same catalogue as v4's, verified identical to `universe/raw/sectors.json`). Johnny
  reruns the release.
- **Proper fix, for Agent C:** release reads the catalogue from `inputs/<version>/`, else from
  `inputs/<derived_from>/`, following the chain of `derived_from` until one exists; gated
  test: releasing a derived version that has no inputs of its own succeeds.

**C1 is in (Agent A, 2026-10-04), checked:** `apps/web/src/orbit/system.ts`, `maths.ts`,
`orbit_au.ts`; `js/system_viewer.js` loads in the oracle unstubbed; four golden orbit cases
(Regina 1910 and Zeycude 0101) with exact parity; the AU table held to the generated rules by
a test. Suite green, check clean. Ported as written and worth knowing for the view:
`hashEpoch` can return a negative angle (range `[-π, π)`, not `[0, 2π)`; the recipe's range
was wrong and the test follows the code); `surfaceKind` is null until `planet_profile.js` is
ported (C4). Data facts for Agent D from Regina's generated tree: `hzAU` is computed from
`hzco`; stars have no `orbitAU` or `periodYears`; moons have no `periodYears`; the mainworld
moon lacks `periodHrs`, `orbitType`, `parentStarIdx` and `eccentricity`; `worldType` is
absent; `travelZone` is absent on worlds and "Green" on the mainworld.

**Orbit view shell is in (Agent D, 2026-10-04), checked:** route `/s/:sector/:hex/orbit`
(lazy chunk), header, body chips, time controls over a pure tested `clock.ts`, the dossier
beside the stage through a base-path option, entry from the dossier's Explore orbits and from
a map double-click, Escape back. Suite 279/274/5, check clean, build succeeds. D measured
8.3 ms median and 12.6 ms worst frame while shuttling at 365 days a second. D also fixed a
type error left by B's jump-times change in `design/samples.ts`, and added 17 more icons
(two Pro, not on screen yet). Next for D: the orbits picture on Agent A's model, which landed
after D's report was written. Johnny's seven answers are still pending; D built with the
interim choices.

## 48. Truth v5 released; open questions gathered in one file (2026-10-04)

- **v5 released** (manifest hash `8fab03d2...a10b`, matches the CDN). Verified: the manifest
  and border file pass the strict schemas, the border file's hash is in the manifest,
  **287 polities, 287 distinct names, 20 colours**, 613 KB raw; `/api/health` reports v5;
  `/api/truth/search?q=Rigel` with no parameters now returns one result, from v5, on the
  canonical layer (it was 50 mixed results). The truth is now held steady (Johnny's
  direction).
- **`directives/questions_for_johnny.md`** lists every open decision with an Answer line:
  Agent D's seven orbit-view questions, five map questions, three app questions and four on
  direction. When Johnny says the answers are in, read the file, record each decision in the
  directive it belongs to, and remove it from the file.

**Highport art (Johnny, 2026-10-04): the images are his and ship.** The orchestrator copied
`assets/starports/highport-a.png`, `-b`, `-c`, `-e` (427 KB in all) to
`apps/web/public/starports/`. The legacy use is `js/system_viewer.js:4340-4380`
(`_HIGHPORT_ART`: file, crop, pivot, nav and strobe points per starport class; class D reuses
E's art; sprites are downscaled once per on-screen size and cached). They are drawn in the
orbit view, so Agent D picks them up when the picture reaches the mainworld's highport; the
drawing rule also needs `starportProfile`, which the generated tree carries on few bodies
(see C1's data notes). The other legacy images are `assets/splash_bg.png`,
`splash_bg_v2.png` and `tim_photo.jpg`; none is used by the new app yet.

**Release fix is in (Agent C, 2026-10-04), verified:** `apps/api/src/jobs/inputs.ts`
(`resolveCatalogue`) is the one rule for "the inputs of this version or its source": it
follows `derived_from` up to ten versions; the build route, `publishSector` and release all
use it. Gated test derives from a derived version and releases it. Checked by the
orchestrator on the current tree, including the gated Worker suite. Unpushed; push by path
(`apps/api tests/api directives`) while Agent D is mid-work in `apps/web`.

## 49. The orbits picture works (Agent D, 2026-10-04)

- **Pushed:** `125348d` (release reads inputs from the source version; directives).
- **Agent D, C2a:** the system draws from Agent A's model and the clock in the legacy paint
  order, with hit testing, a docked body card, wheel zoom, drag, click-to-follow,
  double-click to frame, Fit, the edition badge, temperatures in both scales, season lines,
  and the highport painting with nav lights. Checked here: `npm test` 342/337/5, check clean,
  build succeeds (the orbit view is its own 70 kB chunk). D's frame measurements in headless
  Chrome: paint cost under 1 ms a frame for Regina (41 bodies) and for the largest system in
  the sector (63 bodies) at every zoom; not yet measured on a real display.
- **Johnny answered some of D's questions to D directly;** D wrote them into
  `campaign_manager_plan.md` §7.4 with his name: spring equinox at orbit angle 0; a moon
  locked to its planet has seasons set by the parent's year and the moon's own tilt. The
  questions file still shows them as open; ask Johnny which of A1-A6 he has answered so they
  can be closed there.
- **Stopped by D, correctly:** "today's" temperature. The tree's high and low come from an
  engine step that mixes day and night swing, geography, pressure and eccentricity with
  tilt, so a seasonal figure cannot be derived from them without new maths. Card shows mean,
  high and low.
- **For Johnny:** seasons hidden under 3° of tilt for every world (the plan said 5° for
  planets); stars show °C and °F with kelvin in the tooltip; the dossier's own temperature
  rows still show K and °C only (model code, not D's).
- **All of `apps/web` since the borders push is unpushed:** D's title follow-up, A's model,
  B's jump times, D's shell and picture. No agent is mid-task right now.

**Johnny wants "today's" temperature if it can be calculated (2026-10-04).** The orchestrator
read the engine step (`packages/engines/src/mgt2e_world_engine.js:1754-1788`, "Temp
Diurnals"): high and low are `calculateMeanTemperature` at a luminosity raised or lowered by
`lumMod = clamp(tfactor + rfactor + gfactor) / (1 + pressureBar)`, where `tfactor =
|sin(tilt)|` (halved for a year under 36.5 days, times 1.5 for a year over two standard
years), and temperature goes as luminosity to the 0.25. **Proposal put to Johnny
(`questions_for_johnny.md` A3):** today's hemisphere mean = `meanTempK * (1 + tfactor *
sin(orbit angle) / (1 + pressureBar)) ^ 0.25`, southern with the sign flipped; rotation,
geography and eccentricity left out; labelled an estimate. It is a new derived figure built
from the engine's own terms and needs his yes before Agent D builds it. **Agent B** gets the
dossier temperatures: the existing formatter in `apps/web/src/design/units.ts` applied to
the dossier model's mean, high and low rows.

**Dossier temperatures are in (Agent B, 2026-10-04), checked:** `formatTempFull` in
`design/units.ts` (`15 °C · 59 °F · 288 K`), used by the dossier's mean tile, high and low
rows and the star temperature tile; the model's own Celsius helper is gone. Suite green.
Not built from §7.5: the delta style and the one-decimal rounding near thresholds. Unseen in
a browser; unpushed with Agent D's Row and Column work in flight.

## 50. Agent F joins; the planet surfaces recipe is issued (2026-10-04)

- **Agent F** is a higher-effort agent (OpenAI Codex) with a limited token budget. Johnny:
  use it wisely, for complicated or highly specialised tasks. Give F inventories and plans to
  read rather than raw legacy code, and the steps where a wrong design is expensive.
- **`directives/recipe_planet_surfaces.md`** (slice 1 part C4) was written by Agent D at
  Johnny's request: one deterministic surface per body, shown as the dossier's hex map and as
  the lit disc in orbit, closing the legacy gap where the two came from different generators.
- **F reviewed it; all four findings were right and are applied:** the parity check now
  compares the real shader's output in a browser with the CPU reference (a TypeScript
  transcription of the GLSL proves nothing), with one shared sea level; no main-thread task
  over 50 ms, terrain sampled in a worker (a scan animation does not excuse blocking);
  seasonal ice has one contract for both views, settled in P1; the harness is
  `tests/oracle/legacy.js` (`CLAUDE.md` still names the wrong path, which is where the error
  came from); P3 is gated on Q2.
- **Also added by the orchestrator:** why surfaces are computed in the browser despite
  `architecture.md` §10.1 (six million bodies cannot be files), and the conditions of that
  exception.
- **Step owners (§2a of the recipe):** P0 inventory, Agent A; P2 profile parity port, Agent B;
  P1 plan, P3 terrain, P5 disc, Agent F; P4 hex map and P6 overlay, Agent C to F's plan;
  wiring, look and delighters, Agent D. P0 and P2 start now.
- **Blocking questions for Johnny** (`questions_for_johnny.md` section E): E1, is hex terrain
  a picture or data; E2, the terrain classes.

**Johnny on surfaces (2026-10-04):** copy the old app's handling of hex terrain; enhance where
there is room, but so that the enhancements can be disabled and the app returns to vanilla.
Recorded as `recipe_planet_surfaces.md` §0: vanilla is a parity port of the legacy surface map
(`renderFlatMap`) and disc (`PlanetGL`), presentation made in the browser; the unified
terrain, hex classes, archetypes and delighters are the enhanced mode, behind one per-device
switch, never changing what vanilla draws. New steps V1 and V2 (the vanilla map and disc)
come before P3. Questions E1 and E2 are closed.

## 51. Surfaces P0 and P2 are in (2026-10-04)

- **P0 (Agent A):** `findings/legacy_surface_inventory.md`. The legacy app has **three**
  painters, not two: `planet_gl.js` (orbit cube maps), `planet_renderer.js` (the dossier sheet
  and hemispheres) and a canvas fallback disc in `system_viewer.js` (`_paintWorldSteps`,
  3670-3986). They use different seeds (GL: FNV-1a of `_surfaceId`, no `masterSeed`; map:
  `hashString(masterSeed-imageSeed-ph|cn|oc)`), different noise, different sea-level clamps and
  different inputs (the map palette reads four fields; the GL palette about a dozen more).
  `PlanetProfile` feeds only the GL disc. The dossier projection is the diamond, N = 5, with a
  screen-overlay hex grid that does not class terrain. So "vanilla" is two separate parity
  ports (V1 map, V2 disc) that will not agree with each other, exactly as in the legacy app;
  making them agree is the enhanced mode. Unknown in the code: where the 1600 and 1005 in the
  hex column count come from.
- **P2 (Agent B):** `apps/web/src/surface/profile.ts` ports `PlanetProfile.kind`, `.of` and
  `.halo`; fixtures `profile_regina`, `profile_zeycude`, `profile_extra`; `surfaceKind` in
  `orbit/system.ts` now returns the kind. 376 pass, build green.
- **One parity gap found in review, sent back to B:** `planet_profile.js:59` falls back to
  `PlanetRenderer.tempBandFromKelvin(kelvin)` when a body has no `tempBand`. In the legacy
  browser that global always exists; the oracle did not load `planet_renderer.js`, so the
  fixtures and the port have that branch closed. A cold body with `meanTempK` and no `tempBand`
  would get a different kind from the legacy app. Fix: load `planet_renderer.js` in the oracle
  (V1 needs it anyway), port `tempBandFromKelvin`, add fixture bodies for the branch.
- **`npm run check` fails** on `apps/web/src/orbit/alignment.ts`: the checker matches the
  word "window." at the end of a comment (line 119). Agent D's file; D rewords the comment.
- **Gap closed (Agent B, same day):** `planet_renderer.js` loads in the oracle with no stub;
  `tempBandFromKelvin` (1045-1052) is ported and used in `kind()`; seven fixture bodies with
  `meanTempK` and no `tempBand` added to `profile_extra`. The band only changes the outcome
  for Frozen (the 229 K, atmosphere 1 body is `ice`, and would have been `desert` before).
  Regina, Zeycude and the orbit text fixtures are byte-identical. P2 is done.
- **Next:** Agent F writes P1 (the plan) from the inventory, covering V1, V2, the switch and
  the enhanced design.

## 52. Orbit C2b, first delighters and C3 (line-up search) are in; ready to push (2026-10-04)

- **Agent D:** C2b (Row and Column views, layer chips), the first C2c delighters and **C3,
  the line-up search**, are built. The search is a parity port (the test runs the functions
  from `js/system_viewer.js` beside the port and pins the answers in
  `tests/web/fixtures/orbit_alignment.json`), runs in a web worker started through
  `platform/browser.ts`, and can be cancelled. Also: a close button on the pinned body card,
  temperatures one value per line, jump times restyled, and a new "Day and night" block on
  the orbit card (solar day, hours of light at the equator and at 45 degrees, polar day and
  night latitude). That block is plain geometry, not a rules figure; its tooltip says so.
- **Orchestrator re-ran everything after D's last edits:** check clean, 376 pass, build green.
- **Not exercised in a browser:** cancel mid-search, a search that hits the visit budget, the
  no-worker fallback (all covered by tests), and a sector-wide timing run.
- **Open with Johnny** (`questions_for_johnny.md` A5, A8 to A10): body chips; the tilt below
  which a world has no seasons line (3 or 5 degrees); star temperatures in C and F; whether
  45 degrees is the latitude to quote for daylight.
- **Everything local is pushable:** B's dossier temperatures and profile port, D's orbit work.
- **Next for D:** wiring the surface renderers when V1 and V2 land; until then C2c delighters
  that need no surfaces. C5 (2.5D) is decided again after C4.

## 53. The surfaces plan (P1) is accepted with amendments; vanilla build starts (2026-10-04)

- **Agent F wrote `directives/plan_planet_surfaces.md`** (F is at about half its budget).
  Accepted; the orchestrator's amendments are its §0 and win over the text below them:
  the legacy no-WebGL canvas disc is **not** ported now (steps 6 and 7 deferred; question E8);
  the vanilla disc bakes on the main thread first, as legacy does, and moves to a GL worker
  only if cold measurements show a 50 ms task; owners are set in §0.
- **Recorded deviation, awaiting Johnny (E7):** vanilla continents will not match what an old
  device showed for the same world. The legacy map seed is `masterSeed-hexId-name`, where
  `masterSeed` and `hexId` were per-device values; the new app uses `TravellerMagnus` and the
  full hex key. The renderer is proven identical for identical inputs.
- **In flight:** step 1 (identity, requests, preference, service skeleton), Agent A; step 2a
  (Node map oracle and fixtures), Agent B; step 2b (dev browser parity harness), Agent C.
  Then steps 3 and 4 (the vanilla map port), Agent C.
- **The enhanced class table** (plan §7) goes to Johnny at step 12, when vanilla is on screen.
- **Step 2b in (Agent C):** dev-only page `/dev/surface-parity` (legacy source served from disk
  by `apps/web/surface-parity-dev.ts`, never in the build), headless driver
  `node scripts/surface_parity.js` (Chrome; Edge not found at the standard paths). Legacy
  against legacy: zero mismatches for Regina, Jewell, Efate. **Review gap:** zero mismatches
  between two copies proves nothing if both canvases are blank or the compare is broken; C's
  next step adds a not-blank assertion and a negative control (a different seed must
  mismatch). C goes on to step 3 (the vanilla map pixels) without waiting; the Node fixture
  test is added when B's oracle lands.
- **Step 1 in (Agent A):** `surface/contracts.ts`, `identity.ts`, `preferences.ts`,
  `service.ts`; identity tests equal the legacy functions in the oracle; the `surfaces`
  command toggles and persists (seen in a browser). **For step 5 / 11 (Agent D):** the command
  is already visible in the omnibox while enhanced draws nothing. Before vanilla surfaces
  ship, the command is hidden (or dev-only) until an enhanced mode exists; a visitor must
  never be able to switch to a mode that blanks the planets.
- **Step 2a in (Agent B):** `tests/oracle/surface_map.js` runs the real `renderFlatMap` in a vm
  with a recording canvas stand-in and five guarded in-memory insertions (renderer sha256 in
  `tests/web/fixtures/surface/manifest.json`); 65 cases (41 maps, 24 exclusions). Accepted for
  coverage. **Sent back for cost:** the fixtures are 8.35 MB and `npm test` went from 4.7 s to
  28 s. B reduces traces and CDFs to digests plus short samples and runs the determinism
  double-render on three cases only. Target: fixtures under 1 MB, the suite under about 15 s.
- Findings worth keeping: the legacy flat map never reads the atmosphere limb colour; hydro 10
  and 11 give the same sheet; print mode's white fill is overwritten by `putImageData`; a size 0
  render draws separators and no hex grid.
- **Steps 3 and 4 in (Agent C): the vanilla surface map is byte-identical to the legacy
  renderer** in a real browser for 12 cases (Regina, Jewell, Efate, dry, ice, molten, hydro 0,
  hydro A, exotic A, print, two slider settings), and against all 41 of B's Node fixtures. The
  harness now asserts not-blank and has a negative control (a different seed gives 616,030
  mismatched bytes). Files: `surface/vanilla/map_fields.ts`, `map_palette.ts`,
  `map_projection.ts`, `map_grid.ts`, `map.ts`. `renderFlatMapPixels` takes **147 ms** for
  Regina on the main thread, so it must run in the worker before it is wired to the dossier.
- **Next:** Agent C, the surface worker, cache and `service.requestMap` for vanilla; then
  Agent D wires the dossier (step 5). Agent A starts the GL parity harness (step 8a,
  legacy against legacy) so the disc port has its proof waiting.
- **Step 2a cost fix in (Agent B):** fixtures 686 KB (was 8.35 MB), full suite 15.9 s (was
  28 s; 4.7 s before surfaces). One vm renders all 65 cases; a second checks three. Traces and
  CDFs are digests plus samples; `diagnoseSurfaceCase` returns the full ones on demand.
  The fixtures are now fit to commit. If the suite time becomes a nuisance, the next lever is
  splitting the oracle test across files so `node --test` runs them in parallel.
- **Johnny approved the "today's temperature" formula as written** (`questions_for_johnny.md`
  A3): `mean x (1 + tiltPart x sin(orbit angle) / (1 + pressure)) ^ 0.25`, southern hemisphere
  with the sign flipped, tilt part as the engine computes it
  (`packages/engines/src/mgt2e_world_engine.js:1754-1788`). A derived presentation figure,
  labelled an estimate. Agent D builds it on the orbit card.
- **Map worker, cache and service in (Agent C):** `surface.worker.ts`, `cache.ts` (24 MiB, 16
  sheets), `map_chunks.ts` (no-worker path, yields between tasks), `service.requestMap` with
  generation tokens; enhanced falls back to vanilla. Regina cold in headless Chrome: worker
  start 53 ms, sheet at 331 ms, no main-thread long task, overlay 3 ms. Worker output has the
  same SHA-256 as the main-thread render for three fixtures. Dev page `dev/surface-sheet`.
- **Next: step 5, Agent D wires the map into the dossier** (after the today's-temperature
  task), and hides the `surfaces` command until an enhanced mode exists.
- **Step 8a in (Agent A): the GL parity harness.** `/dev/surface-parity/gl` (dev only): two
  realms run the unmodified `planet_gl.js` (three guarded in-memory anchors: statistics
  readback, frozen `uTime`, a capture export; source sha256 recorded). Legacy against legacy is
  byte-identical on Edge 154 / ANGLE D3D11 / Radeon RX 7900 XTX for statistics, both cubes at
  32 and 128 (level 0), and the shaded tile, for ocean, dry, ice, gas and ringed worlds; the
  negative control differs. Only `uTime` had to be frozen. Not read: other mip levels, cube
  sizes 512/1024, sweep, casters, light mode.
- **Next: Agent B ports the vanilla disc** (step 8: shaders, statistics, bake; then step 9:
  shade, rings, casters) with that harness as the proof; Agent F reviews once after step 9.

## 54. Overnight stop (2026-10-04, late): where to pick up

- **Tree state at the stop (orchestrator ran them):** check clean, 401 pass / 0 fail / 5
  skipped, build green, `dist` free of the parity harness and legacy source.
- **Push point offered to Johnny:** everything except Agent D's in-flight files
  (`orbit/card.ts`, `orbit/daynight.ts`, `orbit/today_temp.ts`, `dossier/DayNight.vue`,
  `dossier/DossierBody.vue`, `DossierPanel.vue`, `FactTiles.vue`, `tests/web/orbit_lineup.test.js`,
  `tests/web/orbit_today_temp.test.js`), which are unreviewed and unseen. Nothing visible
  changes in production from this push except a "Surfaces: Vanilla" command in the omnibox
  that does nothing harmful (enhanced falls back to vanilla; no surface is wired yet).
- **In flight:** Agent D, today's temperature (approved formula), then step 5 (the vanilla map
  in the dossier; prompt issued). Agent B, step 8 (vanilla disc: shaders, statistics, bake;
  prompt issued, may not be started).
- **Waiting:** B's step 9 (shade, rings, casters), then one Agent F review; step 10 (Agent C:
  scheduling, caps, context loss); step 11 (Agent D: orbit wiring). Then step 12: Johnny sees
  vanilla and decides on the enhanced class table (plan §7).
- **Open with Johnny:** `questions_for_johnny.md` A1, A2, A4 to A6, A8 to A10, E3 to E8, B, C, D.
- **Johnny, looking at the vanilla map:** ice caps on a world over 100 C, and hydrographics
  ignored. Confirmed as legacy behaviour, ported as written (`js/planet_renderer.js:288-301`):
  the polar overlay depends only on the temperature band (Hot: cap centre 88 degrees, fading
  in from 80), is skipped only for molten, airless-dry rock and frozen-solid worlds, and never
  reads hydrographics. Not a port bug. Recorded as the first enhancement candidate (question
  E9): caps only where the low temperature is below the liquid's freezing point, sized by
  hydrographics, none at hydro 0. Vanilla stays as is.
- **Johnny approved E9** (enhanced ice caps: only where the low temperature is below the
  liquid's freezing point, sized by hydrographics, none at hydro 0). Enhanced mode only.
- **Step 8 in (Agent B): the vanilla disc bake is byte-identical to legacy** (statistics,
  thresholds, both cubes at 32 and 128, mip 1, cube 512) for ocean, dry, ice, gas and ringed
  worlds on Edge / ANGLE D3D11 / RX 7900 XTX. Files: `surface/vanilla/gl_shaders.ts`,
  `gl_stats.ts`, `gl_bake.ts`, `gl.ts`; fixture `tests/web/fixtures/surface_gl.json`.
- **The 50 ms line is crossed, as §0 amendment 2 said to watch for:** the first bake on a cold
  context blocks for **1,848 ms**; with shaders already compiled the same work is about 15 ms
  (compile 11 ms, statistics 2 ms, six faces 2 to 3 ms at any size). So the cost is the
  first shader compile, not the bake. **Decision:** compile without blocking
  (`KHR_parallel_shader_compile`, polling for completion, started when the orbit view opens,
  flat discs shown meanwhile), not an OffscreenCanvas worker. That is step 10 (Agent C),
  measured cold; a worker is the fallback only if a task of 50 ms or more remains. The 428 ms
  and 277 ms tasks in the parity pass are to be identified in the same step.
- Ported as written, noted for the enhanced mode: the locked-world hot side uses the cube's
  +X axis, not the star direction; eight reversed-edge `smoothstep` calls.

## 55. Agent F's review of seas and ice on the map (2026-10-04, afternoon)

- Johnny asked F for a deep dive after spotting ice caps on a world over 100 C. F's findings,
  all in the legacy code as ported (`surface/vanilla/map_palette.ts`, `identity.ts`): caps come
  from the temperature **label** (a label the code does not know, such as one outside its six
  words, falls through to the temperate cap, the largest after cold and cool); `liquidType` is
  ignored (seas are blue unless the atmosphere is exotic); `hydroPercent` is ignored when a
  Hydro digit exists; a 5% minimum sea level. None of this is a port bug.
- **Proposal recorded as question E10** (supersedes E9): coverage from `hydroPercent` then the
  digit; substance from `liquidType`; freezing by that substance's melting point from
  `rules/mgt2e_data.js:740`, with a latitude approximation bounded by the world's own high and
  low; unknown liquid or missing temperatures draw no ice; locked worlds separately; no land
  snow yet. Enhanced mode only.
- F caught a wording error: the questions file said the E9 rule was "built". It is not;
  `service.ts` still routes enhanced to vanilla. Corrected.
- **Orchestrator's plan if Johnny approves E10:** build the rules as a pure tested module
  (`surface/enhanced/seas.ts`: coverage, substance, frozen fraction and ice latitude; no
  drawing) now, by a free agent; apply it first to the map over the vanilla continents as the
  first visible enhancement; it carries over unchanged to the shared terrain later.
- **Johnny approved E10** (seas and ice in the enhanced mode, with the latitude formula).
  Agent A builds `apps/web/src/surface/enhanced/seas.ts` (pure rules, no drawing); melting
  points are copied from `MgT2EData...exoticLiquids` (`rules/mgt2e_data.js:740`) with a test
  that the copy equals the generated rules. Applying it to the map follows.

## 56. Step 9 in: the vanilla disc shade matches legacy (2026-10-04)

- **Agent B:** `surface/vanilla/gl_shade.ts`, `gl_plan.ts`, `gl.ts` (`renderBatch`, `tile`,
  `axisBasis`; every program created in `linkDiscProgram`). Shaded tiles byte-identical to
  legacy for 16 cases (five world kinds; tilt 0, 90, 120; sweep with 16 samples; an eclipse;
  light mode; radius 2.5 and 1100; two ring phases) on Edge / ANGLE D3D11 / RX 7900 XTX.
- **Open, for step 10 (Agent C):**
  1. **An intermittent 1-level difference:** an earlier run of the same sources had one green
     sample off by 1 on the ringed tile at (117, 83); not reproduced. Must be characterised by
     repeated runs, port against legacy and legacy against legacy, before anyone calls the
     shade proven or adds a tolerance.
  2. **Cold start:** first step 2,196 ms, of which linking three programs is 1,219 ms (stats
     319, bake 658, draw 242) and about 975 ms is unattributed. Fix: non-blocking compile.
  3. **Warm first batch:** Regina's 20 bodies in one `renderBatch`, 56 ms, over the line;
     spread across frames. Steady per-frame cost not yet measured.
  4. An unidentified 324 ms task in the shade window.
- **Agent F's review after step 9 is dropped** to save its budget: the proof is byte equality,
  which a review cannot improve. F is kept for the enhanced shared terrain.

## 57. Seas rules module in; it exposes odd generated data (2026-10-04)

- **Agent A:** `surface/enhanced/liquids.ts` (the fifteen `exoticLiquids` rows, name and melting
  point, tested equal to the generated rules) and `surface/enhanced/seas.ts` (`coverage`,
  `substance`, `latitudeTempK`, `seaIce`), pure, no drawing, vanilla untouched. 422 pass.
- **What the table over Regina and Zeycude shows, for Johnny (reported, nothing "fixed"):**
  - **Regina's mainworld in truth v5 is an Ethane world with a low of 147 K** (about -126 C);
    Zeycude's mainworld likewise (Ethane, low 122 K). The legacy painter hid this because it
    ignores `liquidType` and paints blue seas.
  - `liquidType` can contradict the temperatures: Regina A-X-c has Oxygen with a low of 541 K
    (oxygen boils at 90 K in the same rules table); Regina A-I has Carbonic Acid at 398 K.
  - Many bodies carry `liquidType: Ice` with hydrographics 0.
  - One `Unknown Exotic Liquid` (no row in the table; drawn with no ice, as E10 says).
  Agent B investigates read-only: where the engines set a mainworld's temperature and
  `liquidType`, and whether the legacy app produces the same for Regina. Engine parity rule
  applies: differences and oddities are reported to Johnny, never fixed.
- **The dossier map (step 5) appears wired** (`dossier/SurfaceStage.vue` exists; tree green:
  check clean, 422 pass, build good) but **the orchestrator has not seen Agent D's report** for
  it or for today's temperature. Last push: `05b1297` (the subset).
- **Next for Agent D:** the first visible enhancement: the enhanced map (vanilla continents,
  seas and ice by `seas.ts`), which makes the `surfaces` switch do something.

## 58. Agent B's investigation: the engines store physical data that contradicts the chart (2026-10-04)

`findings/regina_liquid_temperature.md` (git-ignored, local). Nothing was changed. The ESM
engines and the legacy app agree on all of it (parity holds), so these are **legacy engine
behaviours carried over faithfully**, and they are in the released truth (the system trees
of v5 are the v2 trees; v3 to v5 were derived builds that did not regenerate systems).

- **The published UWP is not honoured on the mainworld's physical body.** Flesh passes
  `t5Data`, which has no `type`, so the atmosphere and hydrographics locks in
  `generateAtmospherics` (`mgt2e_world_engine.js:748-752, 790, 893-895, 1418-1420`) never run;
  `Object.assign(mainworld, base)` then restores the chart `uwp`, `atm`, `hydro` but leaves the
  rolled `atmCode`, `hydroCode`, `liquidType`. Regina: chart atmosphere 8, hydro 8; physical
  atmCode 10, hydroCode 6, Ethane. Zeycude: chart atmosphere 3, atmCode 10, Ethane.
- **Placement:** a chart with no `tempBand` counts as roll 7; Regina's baseline orbit lands in
  a forbidden zone and is stored as 5; the `Sa` remark makes it a moon of a gas giant at
  3.31 AU of an F7 V. Stored mean 189.6 K, band Frozen.
- **Liquid is chosen once, from a preliminary mean** (albedo 0.3, greenhouse 0.1), before the
  two later temperature writes, and never revisited (A-X-c: Oxygen chosen at 58.6 K, stored
  541 K). The `Ice` rule reads `highTempK` before it exists and ignores `hydroPercent`.
- **The three temperature passes disagree** on which star (`parentStarIdx` against `stars[0]`),
  which AU (a moon built by the intercept has no `au`), the day-factor cap, and the 150 cap
  on component C against an uncapped `seismicStress`.
- **Scale, Spinward Marches, 439 mainworlds:** Water 266, Ice 64, Ethane 34, Carbonic Acid 23,
  other exotics about 41, none 11; 41 with a mean below 200 K, 21 above 400 K; 30 with `Ice`
  and hydrographics 0.
- **Johnny's steer:** not partial to any one answer; wants it unified, standardised and
  sensible (a Hydro 0 world at 500 degrees has no ice). **Orchestrator's proposal, awaiting
  his yes** (`questions_for_johnny.md` section F): one engine correction pass, designed by
  Agent F from B's findings and the `rules/` files, each change classed as a self-contradiction
  in the code or a rules choice for Johnny, new golden fixtures with the legacy differences
  recorded as deviations, then **one** truth rebuild (v6). Until then the enhanced map draws
  what the data says and vanilla is unaffected.

## 59. Dossier map, enhanced map, today's temperature and disc scheduling are in (2026-10-04)

Orchestrator re-ran after both reports: check clean, 436 pass / 0 fail, build green, `dist`
free of harness. Nothing is in flight; **everything is pushable.**

- **Agent D, step 5:** `dossier/SurfaceStage.vue` shows the vanilla sheet (blank diamond, scan,
  sheet, overlay; cache on return; cancel on body change). Cold: Regina 225 ms, no long task.
  On screen the scaled sheet differs from legacy by at most 10 pixels on hex-line edges
  (canvas antialiasing); terrain identical.
- **Agent D, enhanced map:** `surface/enhanced/map.ts` (vanilla continents; sea level by
  equal-area coverage, no 5% floor; sea colour by substance from `profile.ts`; ice on the sea
  only, by `seas.ts`), dispatched by `service.requestMap`; the `surfaces` command is visible
  again; caption names the mode and substance. Vanilla bytes unchanged across mode switches.
  Open: E11 (three liquids with no colour source: seas not drawn), E12 (ice colour for a
  frozen non-water sea), E13 (Unknown Exotic Liquid not drawn).
- **Agent D, today's temperature:** on the orbit card. Orchestrator's rulings on D's three
  stops: (1) the parity test may lift the engine's tilt lines (`mgt2e_world_engine.js:1757-1759`)
  from the file, as the line-up test does; (2) a planet locked to its star gets no line (its
  tilt term is about zero); (3) when the bracket under the root is not positive, no line. Also
  approved: the dossier "Day" tile is relabelled "Rotation" (it is the sidereal spin, and
  contradicted the sunrise-to-sunrise figure beside it).
- **Agent C, step 10:** the one-level differences are the driver: legacy against legacy shows
  the same pixels at the same rate over 30 runs (shade tiles only; cubes, mips and statistics
  never differ). **Ruling:** the GL parity pass accepts, on shaded tiles only, a channel error
  of at most 1 on at most 8 pixels; cubes, mips and statistics stay exact. Non-blocking compile
  works; bakes are spread (8 ms a frame); the 320 MiB ledger and context loss/restore work.
  **One stall remains: `gl.checkFramebufferStatus` on the first cube face of a fresh context,
  about 900 ms** (Regina: first lit disc 1.9 s, steady frame 0.2 ms; a second system 11 ms).
- **Next:** Agent C, step 10b: confirm what that call is waiting on, then move the vanilla
  GL pipeline into an OffscreenCanvas worker returning tiles (the plan's fallback, now
  earned). Agent D, step 11: discs in the orbit view through `prepareDiscs` / `drawDisc`,
  which the worker move must not change.
- **Still with Johnny:** F1 (engine correction pass and one truth rebuild), E11 to E13.

## 60. An outside reviewer's suggestion on labels and liquids; the correction pass gets two tiers (2026-10-04)

A one-off agent Johnny consulted (given `findings/tempband_trace.md`) proposes, and the
orchestrator agrees with the shape of it:
- `tempBand` means two things. Keep the early value as **`orbitalTempBand`** (it legitimately
  feeds the hydrographics DMs) and add **`surfaceTempBand`**, derived from the final
  `meanTempK` after the last temperature write. The UI shows the surface one as "Climate" and
  the orbital one as "Orbital zone".
- A final **reconciliation** step validates `liquidType` against the final temperatures and
  `hydroPercent`, **without any new random draw**: keep the original choice when it is still
  valid, replace it only when it is not.
- Do **not** re-roll hydrographics: it is part of the UWP and feeds everything downstream.
Not accepted as given: its kelvin breakpoints for the surface band (invented, as it says) and
how a replacement liquid is picked. Both are ASK items for Johnny from the `rules/` files.

**Consequence for the plan (still awaiting Johnny's yes on F1):**
- **Tier 1, reconciliation:** a pure function of the stored tree (labels and liquid). No RNG,
  so it can ship as a **derived** truth build like v3 to v5, not a regeneration, and as an
  engine step for future generation. Fixes "Frozen at 120 C", "Oxygen at 541 K", "Ice with
  hydrographics 0".
- **Tier 2, generation fixes:** the chart atmosphere and hydrographics locked onto the
  mainworld's physical body, placement, and one temperature calculation. Changes rolled
  values, so it needs a full regeneration. Fixes Regina being a frozen ethane moon.

## 61. Step 11 halted correctly: the disc calls were a skeleton (2026-10-04)

Orchestrator's error: the step 11 prompt told Agent D to call `prepareDiscs` / `drawDisc` as
if they carried a full request and painted; `DiscRequest` had only identity fields and
`drawDisc` always returned false. D stopped and asked. **Ruling, the disc envelope:**
- `DiscRequest` (plain, cloneable, in `surface/contracts.ts`): `key` (unique in the batch),
  `hexKey`, `dossierKey`, `body` (the service derives `legacyDiscId` and the profile; the
  caller never builds either), `radiusPx` (device pixels), `spin`, `cloudSpin`, `sweep`,
  `samples`, `tiltDeg`, `light [x, y]`, `sun [r, g, b]`, `ring` (inner, outer, fill, phase,
  detail) or null, `casters`, `lightMode`, optional `near`.
- `DiscBatchRequest`: `mode`, `timeSeconds` (explicit animation time), `discs`.
- `prepareDiscs(batch)`: submits this frame's batch, never blocks, returns
  unavailable / pending / ready. With the worker, tiles arrive a frame or more later.
- `drawDisc(ctx, key, cx, cy, radiusPx)`: draws the newest tile held for `key`, centred, scaled
  if it was rendered for a different radius; false when there is none.
- **Agent C owns both calls and the types** and writes them first, before the rest of the
  worker move. **Agent D** builds the request side (`orbit/` batch builder, pure, tested) to
  this envelope and wires `drawDisc` when C's contract is in `contracts.ts`.
Also from D: rulings applied (tilt parity test, locked planets, non-positive bracket, "Day"
tile is now "Rotation"); swatches for E11/E12 in `findings/ui_design_shots/` and written into
the questions file. Pastes to and from agents are losing the middles of long lines: keep
prompt lines under 80 characters.
- **Disc contract final (Agent C):** `DiscRequest` / `DiscBatchRequest` as §61, no changes;
  `prepareDiscs` returns `{ status, mode, requestId }` (`ready` means the frame was submitted,
  not that every tile exists); `drawDisc(ctx, key, cx, cy, radiusPx)` paints the newest tile,
  scaled, false when none; works on the main-thread baker today; a held tile still draws
  after a context loss. `tests/web/surface_disc_contract.test.js`. C did not run the full
  suite or the build at this stop. C continues with step 10b (the worker) behind the same
  calls; D wires step 11.

## 62. The engine correction plan is accepted (2026-10-04)

`directives/plan_engine_corrections.md` (Agent F): 21 rows, 11 BUG, 4 RULE, 6 ASK. Accepted;
the orchestrator's §0 sets versions (tier 1 derived = v6, tier 2 full regeneration = v7),
owners, and that unresolved bodies are counted for Johnny rather than blocking silently.
Johnny approved the direction by commissioning the design. The six ASK questions are
`questions_for_johnny.md` F2 to F7. The rules files hold no table from kelvin to the five
band names (they are orbit-deviation bands, `rules/mgt2e_data.js:24-29`), so F2 needs Johnny.
F's estimate: tier 2 changes 80 to 100% of the 156,222 generated trees; RNG order cannot be
preserved globally. **Started:** T1.1, Agent A (fixtures, ledger, Marches diagnostic) and
Agent B (wider read-only scan of released trees).

## 63. Step 11 in: shaded discs in the orbit view (2026-10-04)

- **Agent D:** `orbit/disc_batch.ts` (pure batch builder), `OrbitRenderer` sends one batch a
  frame and draws a tile per body, flat disc where there is none; discs only with the
  Day / night layer on, as legacy. Regina 20 discs, Zeycude 11; steady frame about 1.4 ms;
  no long task on scrub, zoom, Row or Column. The known first-context stall (about 1 s, once
  per browser process) was seen once; Agent C's worker move is to remove it.
- **Differences from the legacy request, recorded:** a moon locked to its planet turns once
  per its own sidereal day and keeps its tilt (legacy pinned its face to the star). Noted by
  D: Regina's sidereal day and its drawn orbit period round A-IV do not match, so its face
  does not stay toward its planet; that is data, and belongs with the engine corrections.
- **Not done:** a same-date, zoomed, pixel comparison with the legacy viewer in the app
  (the renderer itself is proven on the parity page); no-WebGL2 device; fast shuttle speeds.
- Orchestrator re-ran: check clean, 457 pass / 0 fail, build green, `dist` clean.
  **Last push is still `05b1297`; 54 paths uncommitted.**

## 64. Pushed `b1ae85a`; CI was red for a line-ending reason, fixed locally (2026-10-04)

- Johnny pushed `b1ae85a` (dossier map, enhanced seas, orbit discs, today's temperature, the
  engine correction plan). Workers Builds deploys regardless of the test workflow.
- **The GitHub test run failed on `05b1297` and on `b1ae85a`:** `surface oracle ... matches
  fixtures`, manifest digest. Cause: the checkout is CRLF on Windows and LF on CI
  (`.gitattributes` `eol=lf`, `core.autocrlf true`), and the oracle hashed the legacy source
  bytes as found. **Fix (orchestrator):** `tests/oracle/surface_map.js` `readText` normalises
  CRLF to LF and the renderer digest is taken over that text; `manifest.json` refreshed (the
  digest now equals `git show HEAD:js/planet_renderer.js | sha256sum`). No pixel, grid or
  trace digest changed. Rule for agents: **a stored digest of a source file is taken over LF
  text**, never raw bytes. Not yet pushed.

## 65. Johnny closes this leg; next is the campaign layer (2026-10-04)

**Direction (Johnny):** wrap up; rough in campaign features next, with optional login. First
pass: everyone has their own campaign layer over the base truth map; their own maps later.
Recorded in `plan.md` before Slice 2 and as the answer to question D1. He also answered
**yes to F3 to F7**. F2 (kelvin table for the five climate words) is still open.

**Engine corrections: measured, then parked.**
- Agent A, T1.1: `tests/generation/environment_audit.js`, fixtures for Regina and Zeycude
  under `tests/golden/fixtures/engine_corrections/`. Spinward Marches: 387 of 439 mainworlds
  have chart digits that differ from the physical codes (B01/B03); 52 have a liquid name with
  hydrographics 0; 915 bodies have a liquid outside its window at every temperature; 13
  mainworlds sit on a forbidden-zone edge.
- Agent B, eight sectors of released v5 (`tools/truth/scan_environment.js`,
  `findings/environment_scan_v5.json`): **2,975 of 3,198 mainworlds (93%) carry at least one
  contradiction**; 2,607 atmosphere mismatches, 2,517 hydrographics mismatches. So tier 2 is in
  effect a rebuild of everything, as the plan estimated.
- **Parked, not abandoned.** The plan, the audit and the scan stay. It must be done **before
  the Builder**, because builders generate with these engines. A campaign is pinned to a
  truth version, so a later v7 does not break campaigns made on v5; they migrate when offered
  (`plan.md` slice 5). Nothing in tier 1 or tier 2 is in flight.

**Surfaces: one item in flight, the rest parked.** Agent C's worker move (step 10b) finishes
the leg. Parked: the enhanced shared terrain and enhanced disc (plan steps 12 to 18), the
no-WebGL painter, P7 delighters, the 2.5D view, swatches E11/E12, and slice 1's B3b Trade
Match and B3c (legend, help, settings).

**Next leg, what exists already:** X sign-in through better-auth (Discord and Google when
their secrets are set), `profile` table, `views/Account.vue`, a 14-line `UniverseDO.ts` with a
drafted schema (`apps/api/src/universe/schema.ts`). The campaign design is
`campaign_manager_plan.md` (1,652 lines, written for the legacy app's storage). The recipe
`slice_2_campaign.md` is the orchestrator's next job; two read-only inventories feed it
(Agent A: campaign plan and legacy campaign code mapped to the new stack; Agent B: what the
API and Durable Object have against `data_model.md` and `api.md`).

## 66. The campaign recipe is written; K1 and K2 are issued (2026-10-04)

- **`directives/slice_2_campaign.md`** (orchestrator), from Agent A's inventory
  (`findings/campaign_inventory.md`) and Agent B's gap report
  (`findings/campaign_api_gaps.md`). Johnny: X sign-in only is fine.
- Shape: signed out is the viewer unchanged; signed in gets one private universe pinned to
  the released truth, campaign rows only. Records (nine types), anchors on the new hex key
  and dossier body key, links from the plan's vocabulary, the party as a settings document.
  The browser holds the campaign in memory and sends batched changes with per-row `rev`;
  a per-universe `seq` gives "everything after N". Server FTS, images, journal, clock and
  timeline are later steps (K6 to K8 outlined).
- **Body anchors are stable only within one truth version**; recorded in the recipe §0.4 with
  how a migration re-resolves them. This is why the parked engine rebuild stays safe.
- **Owners:** K1 shared schemas, Agent A. K2 universes in D1 and the owner-checked forward,
  then K3 the campaign in the Durable Object, Agent B. K4 the browser's session and campaign
  store, Agent A after K1. K5 the screens, Agent D to its own design. Agent C joins after
  the disc worker move.
- **Johnny's part:** migration `0008_universes.sql` reaches production through `deploy:ci`
  if Workers Builds runs it; to be confirmed when K2 reports.

## 67. Step 10b in: the disc pipeline runs in a worker; the surfaces leg is closed (2026-10-04)

- **Agent C:** the stall was the driver's first `readPixels` on a fresh context (about 850 ms
  whichever call asks first). The whole vanilla GL pipeline now runs in an OffscreenCanvas
  worker (`gl.worker`), with a 1x1 warm-up that takes that cost off the page; `prepareDiscs`
  and `drawDisc` are unchanged; tiles come back as per-tile bitmaps (cheaper than an atlas:
  p95 0.1 ms against 0.4 ms). Cold, Edge / ANGLE D3D11 / RX 7900 XTX: Regina first lit disc
  49 ms, all 20 at full detail 202 ms; Zeycude 41 ms and 117 ms; **no main-thread task of
  50 ms or more**; steady receive-and-draw p95 0.1 ms. Parity from the worker exact (no tile
  needed the §59 allowance). Ledger about 6 MB of the 320 MiB cap. Context loss and restore
  work from the worker.
- **Surfaces as shipped:** vanilla map (dossier), enhanced map (seas and ice), vanilla discs
  (orbit, worker), the `surfaces` switch. Parked: plan steps 12 to 18, the no-WebGL painter,
  delighters, 2.5D, swatches E11/E12.

## 68. Pushed; deck plans from Geomorph Shipyard are planned for the ship sheet (2026-10-04)

- Johnny pushed the worker move, the LF digest fix and the campaign recipe.
- **`assets/geomorphs/` is Johnny's** (3,028 files, 87 MB, untracked): deck-plan tiles and
  `REBUILD.md`, which specifies rebuilding a ship from the JSON the Geomorph Shipyard exports.
  He wants it on the campaign's ship sheet. Recorded as **K9** in `slice_2_campaign.md` with
  three things to settle first: tiles served from the CDN, not bundled; the images are
  CC BY-NC 4.0 (credit shown, non-commercial only); the shipyard's code is GPL-3.0, so the
  placement code is written from REBUILD.md, not copied from its source.

## 69. Agent D's campaign design is accepted; Johnny wants many campaigns and a library (2026-10-04)

- **`findings/campaign_workspace_design.md`** (20 mockups in `findings/ui_design_shots/campaign_*`).
  All sixteen recommended choices adopted (X sign-in only); the orchestrator's rulings on D's
  five points are in `slice_2_campaign.md` after K5.
- **Johnny:** more than one campaign per account, and assets that move between them as easily
  as possible, through a campaign asset manager: **instanced** (a snapshot copied in) or
  **shared** (one character, and what happens in one game crosses to the other).
  Recorded as K5f (several campaigns: create, switch, delete; cap raised to ten), K10 (copy
  between campaigns, with provenance) and K11 (shared records held in an account library,
  referenced by campaigns; needs its own design). **Asked of A and B now:** a nullable
  `provenance` field on records and links, so K10 needs no migration.
- D ran a read-only `git status`; noted, nothing changed.
- **Orchestrator slip, same day:** a shell command with backticks inside double quotes ran
  parts of its own text as commands. Checked: no file outside `directives/slice_2_campaign.md`
  changed and nothing stray was created; the six mangled phrases in the recipe were repaired
  by hand. Scripts with backticks go through the Write tool and `node`, as the summary says.

## 70. K2 in: universes in the catalogue (2026-10-04)

- **Agent B:** migration `0008_universes.sql` (hand-written), the Drizzle table,
  `routes/universes.ts` (list, create, read, rename, soft delete), `universe/forward.ts`
  (`ownedUniverse`: 404 for missing, deleted or not yours; Origin on mutations; forwards to the
  Durable Object with `x-voyage-user-id` and `x-voyage-universe-id`). `api.md` marked.
  `RUN_API_TESTS=1 node --test tests/api/universes.test.js` ran and passed; the rest of the
  black-box suite was not run. 464 pass, check clean, build green.
- **To change in K3's session:** the cap is ten universes, not three (K5f); `provenance` on
  records and links. `catalogue_schemas.ts` holds a local zod fallback until Agent A's K1
  exports are used; the fallback is removed once they are.
- **Migration 0008 and production.** Workers Builds applies migrations only if its deploy
  command is `npm run deploy:ci`; that dashboard field was never verified (handoff §4).
  **Johnny applies 0008 by hand before the push that ships these routes**
  (`npm --workspace apps/api run db:migrate`); applying twice is harmless.
- **Migration 0008 applied to production D1 by Johnny** (2026-10-04, `db:migrate`, 3 commands).
  The `universes` table exists; B's routes may ship.

## 71. K1 and K4 in: shared campaign schemas and the browser's store (2026-10-04)

- **Agent A, K1:** `packages/shared/src/schemas/campaign.ts`: `CAMPAIGN_LIMITS` (universes 10),
  nine record types, twelve link kinds with labels and allowed pairs, `CampaignProvenance`
  (required key, may be null), anchors on `<slug>/<hhhh>` with `s0` / `w3` / `w3m1` body keys,
  `CampaignRecord`, `CampaignLink`, `CampaignSettings` (with its own `rev`), `Universe*`,
  `CampaignChanges` / `CampaignPage` / `CampaignChangesResult`, `locate`, `linkAllowed`.
- **Agent A, K4:** `account/session.ts` (the map calls `loadSession()` after first paint and
  never waits), `campaign/store.ts` keyed by universe id (`openCampaign`, `switchCampaign`
  which flushes first, list / create / rename / delete; remembered per device under
  `voyage.campaign.universeId`), `campaign/index.ts`, `campaign/commit.ts`; new
  `platform/http.ts` (`apiFetch`) and `shell/toast.ts`. 480 pass, check clean, build green.
  Tested with an injected fetch only; not clicked in a browser.
- **Still for Agent B (K3):** the route's cap is still 3; drop the fallback in
  `catalogue_schemas.ts`.
- **Next:** Agent C, the map's campaign layer (party marker, locator). Agent D, K5a and K5b.

## 72. K3 in: the campaign in the Durable Object (2026-10-04)

- **Agent B:** schema version 2 (`campaign_records`, `campaign_links`; version 1 upgrades in
  place), `universe/campaign.ts` pure over an `exec(sql, ...params)` interface, `GET
  /campaign?after=&limit=` and `PATCH /campaign/changes` through `ownedUniverse`, the 120 a
  minute budget, settings (the party) as list kind `campaignSettings` with its own `rev`,
  provenance, tombstones kept and restorable, the ancestor cycle refused, caps enforced, the
  universe cap now ten, the schema fallback removed. `data_model.md` §3 and `api.md` corrected.
  `tests/api/campaign_logic.test.js` under `node:sqlite`; 495 pass.
- **Not yet proven:** the campaign routes through the real Worker and Durable Object. Only
  `universes.test.js` ran black-box. Agent A writes `tests/api/campaign.test.js` (black-box,
  `RUN_API_TESTS=1`) and runs the whole black-box suite once.
- **Push is held** until Agent D reports K5a, so a half-wired sign-in entry does not ship.

## 73. K5a in: sign-in and the campaign entry (2026-10-04)

- **Agent D:** the Rail's foot button (Sign in / initials) with its pop-up and account menu;
  the Campaign entry on the Rail and its own route `/campaign`; the signed-out panel (one
  sentence and the X button); signed in, the panel opens the campaign the first time it is
  shown, never before (loading rows, "No records yet", an error strip with Try again). The
  old `/account` page is no longer linked. 11 contrast pairs added. Differences from the
  drawing: no rename or party items in the menu yet (K5f, K5e); the first-run card moves to
  K5b; the pop-up is opaque (the dossier showed through glass).
- **Not exercised by anyone yet: a real sign-in with X, end to end.** D used supplied session
  replies. Johnny is the one who can do it, in production, after the push.
- Orchestrator re-ran: check clean, 495 pass / 0 fail, build green. Agents A and C have no
  in-flight files on disk yet. **Pushable now.**

## 74. Pushed `123114b`; two more CI-only test failures fixed locally (2026-10-04)

- Johnny pushed `123114b` (sign-in entry, universes, campaign storage, browser store).
- The GitHub test run for `8d80bff` still failed, for two reasons that only show off this
  machine, both fixed by the orchestrator and not yet pushed:
  1. `tests/web/fixtures/surface/manifest.json` stored the exact Node version (v24.19.0 here,
     v24.21.0 on CI). The oracle now stores the major version only; manifest refreshed. The
     pixel digests already matched on CI.
  2. `tests/generation/environment_audit.test.js` read `truth-local/v2`, which is a local
     build and not in git. That one test now skips when the folder is absent.
- **Rule for agents:** a test may not depend on a git-ignored folder, the machine's exact
  runtime version, or line endings. Agents see only local green; **the orchestrator checks
  the GitHub run after every push.**
- **GitHub test run green on `5ea96d5`** (first green since `0a83fab`).
- **Johnny signed in with X in production and the campaign panel opened "Your campaign"**: the
  first real sign-in end to end, and the first universe created through the real Worker and
  Durable Object. K2, K3, K4 and K5a work together in production.

## 75. The map's campaign layer is in (2026-10-04)

- **Agent C:** `map/campaign_layer.ts`, wired by `MapRenderer.setCampaign(snapshot)` and
  `partyAt(sx, sy)`; `MapView.vue` feeds it from the real store. The party marker (teal ringed
  chevron and name tag) at each tier, the hex outline, the locator line and pulse; the chart
  dims only while a locate is active (checked in code). No record pins or count marks: the
  design has none in this pass. A system glyph always wins the click; the ring and tag open
  `/campaign`. Panning with a 2,000-record stand-in costs nothing measurable (p95 1.8 ms
  against 2.1 ms without). The stand-in (`?campaignStandIn=`) is development-only (checked).
  501 pass, check clean, build green.
- Still owed: Agent A's end-to-end server proof (the report pasted was the earlier K1/K4 one);
  Agent D's K5b (D has reported K5a three times and appears not to have the K5b prompt).
- **Next while D builds screens:** Agent C, the deck plan renderer (K9, from
  `assets/geomorphs/REBUILD.md`, pure placement plus a dev page). Agent B, the copy-between-
  campaigns logic (K10, pure, in `packages/shared`).

## 76. K10 logic in; K6 (the clock) written in full (2026-10-04)

- **Agent B, K10 logic:** `packages/shared/src/campaign_copy.ts`, `copyRecords(...)` returns
  batched `CampaignChanges` for the target campaign: new ids, `provenance` of mode `copy` on
  records and links, links copied only when both ends are, anchors on uncopied records fall
  back to the resolved system (listed), tombstones skipped. 506 pass. No route, no screen.
- **K6 is written in full** in `slice_2_campaign.md`: the campaign date is the orbit clock's
  `days` number; scrubbing never changes it ("looking is not advancing"); it changes only by
  "Set as campaign date" or an edit in the panel. K6a shared and API, Agent B; K6b store,
  Agent A after the end-to-end proof; K6c screens, Agent D after K5.

## 77. K9 first part in: the deck plan renderer (2026-10-04)

- **Agent C:** `packages/shared/src/schemas/deck_plan.ts` (`DeckPlan`, the shipyard's own
  rejection rule, 2,000 parts), `apps/web/src/deckplan/place.ts` (pure `placeShip`: draw list
  in array order, overlays after their base, missing codes skipped and reported, bounds) and
  `draw.ts` (three-corner mapping, Y flipped, fitted, tiles cached); dev-only page
  `/dev/deck-plan` reading tiles from `assets/geomorphs` by middleware; the credit line shown.
  Written from `REBUILD.md`, not from the shipyard's source. 519 pass; `dist` has no tile.
  The orchestrator looked at the screenshot: a four-part hand-built ship draws correctly
  joined, with rotation, a mirrored tile and an overlay.
- **Not proven:** agreement with the Geomorph Shipyard itself. That needs a real exported
  JSON and the shipyard's picture of the same ship, from Johnny.
- **Next (Agent C):** a plan stored on a vessel record and a view component for the record
  page; a script that uploads the tiles to the public bucket, for Johnny to run.

## 78. The end-to-end proof found a real fault: campaign writes fail in the Durable Object (2026-10-04)

- **Agent A** wrote `tests/api/campaign.test.js` (black-box) and ran the whole suite with
  `RUN_API_TESTS=1`. **`PATCH /api/universes/:id/campaign/changes` returns 500 on the real
  Worker.** The Durable Object refuses SQL `BEGIN` ("use state.storage.transaction() or
  transactionSync()"); `applyCampaignChanges` runs `sql.exec('BEGIN')`
  (`apps/api/src/universe/campaign.ts:308`). It passed under `node:sqlite`, which allows it.
  Reads work, which is why Johnny's production sign-in showed an empty campaign correctly.
  **In production today every campaign write would fail;** no screen writes yet, so no user
  has met it. A's store kept the row locally and reported offline, as designed.
- **Lesson, now a rule:** logic proven on a stand-in is not proven. Every API step ends with
  its black-box test run against `wrangler dev`.
- **Fix (Agent B):** the SQL interface gains `transaction(fn)`; the Durable Object's adapter
  uses `ctx.storage.transactionSync`, the Node test adapter uses BEGIN / COMMIT / ROLLBACK.
  Then A's black-box file must pass in full.
- **Also seen:** `tests/api/truth_build.test.js` has one timing-dependent assertion (expects 2
  sectors still queued straight after the 202; the windowed feeder had moved on). A test
  fault, not a product fault; B loosens it in the same session.
- **Push of any screen that writes (K5b onward) is held until the fix is in and proven.**
- **Johnny, 2026-10-04:** add an **"Advance 1 week"** button to the orbit view's time controls
  (a week is the typical time for a jump), and demote the line-up search to an overflow menu.
  Recorded in `slice_2_campaign.md` K6. The button itself needs no campaign, so Agent D builds
  it with the next orbit touch; its tie to the campaign date comes with K6c.
- **K6a (Agent B) reported before the transaction fix:** the clock as list kind `campaignTime`
  with `rev`, conflicts and a `list_history` row (hash only, so the date cannot yet be walked
  back from history). Accepted provisionally; proven only on the stand-in. Agent A adds the
  clock cases to the black-box file once the fix lands.

## 79. The transaction fault is fixed and proven on the real Worker (2026-10-04)

- **Agent B:** the SQL interface has `transaction(fn)`; the Durable Object adapter calls
  `ctx.storage.transactionSync`, also on `migrate()`; no BEGIN / COMMIT / ROLLBACK text is sent.
  `tests/api/campaign.test.js` passes against `wrangler dev` in full: write, stale `baseRev`,
  delete with the link tombstoned, restore, settings, the second account's 404, a foreign
  Origin, paging, rows surviving a restart. The whole black-box suite passed serially (20).
  The racy truth-build assertion now states what is always true. 545 pass.
- **Open, not product faults as far as known:** (1) two earlier serial runs saw `POST
  /api/admin/truth/build` or its retry answer 500 once, no stack captured, not reproduced;
  (2) `campaign.test.js` kills whatever listens on port 8799, so the suite cannot run in
  parallel. Agent A fixes (2), adds the clock cases, and tries to catch (1) with the log.

## 80. K5b (records) and the deck plan on a vessel are in; pushable (2026-10-04)

- **Agent D, K5b:** the record list (search, split Add, type chips with counts, first-run card,
  empty states), the record page (edit in place, Enter saves, Esc reverts, Saving / Saved / Not
  saved), delete with undo by toast and "Recently deleted", the panel opening once on a first
  sign-in, keyboard throughout. **Exercised against the real local API** with a real session:
  15 `PATCH` calls, each read back from the server (edit, four creates, delete as a tombstone,
  restore, a conflict from a second request, reload). New `shell/ToastStrip.vue`; 14 contrast
  pairs. Not exercised: a session expiring mid-edit, a screen reader, touch, other browsers.
- **Agent C, K9 second part:** `deckplan/attach.ts` (`importDeckPlan`, `removeDeckPlan`, vessels
  only, refusals with messages, the 1 MB limit checked before commit), `DeckPlanView.vue` (pan,
  zoom, fit, skipped tiles listed, credit always visible), `tileUrl` (dev middleware, else
  `<cdn>/geomorphs/`), `tools/geomorphs/upload.js` (dry run: 3,026 keys, 83 MB; a real run
  lists the bucket through the Cloudflare API and skips what is there; **not run**). The
  shared schema's `sheet` is `unknown`, so nothing was loosened. Agent D places the view.
- **Orchestrator:** the dev proxy now sends the API's own Origin (`apps/web/vite.config.ts`),
  because a local save through `npm run dev:web` was refused 403 by the origin check (D's
  note). Re-ran: check clean, 545 pass / 0 fail, build green, `dist` has no tile or dev page.
- **Open with D:** the toast sits over "All records" on a record page for several seconds;
  D moves it clear in the next step.
- **Deck plan tiles and git (Johnny asked, 2026-10-04):** the PNGs are now git-ignored
  (`assets/geomorphs/**/*.png`); `manifest.json`, `REBUILD.md` and `ATTRIBUTION.txt` stay
  tracked. They go to the public bucket under `geomorphs/` with
  `node tools/geomorphs/upload.js` (Johnny runs it; resumable; dry run first).
- **Deck plan tiles are on the CDN** (Johnny ran `tools/geomorphs/upload.js`, 2026-10-04): 3,026
  objects, 82,954,362 bytes, no failures. Checked by the orchestrator:
  `https://cdn.traveller.voyage/geomorphs/manifest.json` and the first and last tile answer 200
  with the right content types.
- **Pushed `dfd00f4`** (campaign records, the transaction fix, clock storage, the deck plan
  viewer). Production answers the campaign routes. The GitHub test run result is noted below.
- **GitHub run on `dfd00f4` failed (2 files), a commit-timing fault, not a code fault:** the
  commit caught Agent A's test files after A had updated them but before A's matching source
  edits (`apps/web/src/campaign/store.ts`, `tests/api/server.js`) were on disk. The working
  tree with those two files is green (549 pass). Fix: commit those two files.
  **Rule:** push only at a moment when no agent is mid-step, or add by path for finished work.
- **Correction: `dfd00f4` did not deploy.** The same missing file (`campaign/store.ts`, which
  `commit.ts` now reads `campaign.clock` from) fails `vue-tsc` in Workers Builds, so production
  is still on the previous build: sign-in and the empty campaign panel, no records screens.
  The orchestrator had said production was unaffected and deployed; it had only checked a
  route that already existed. **After a push, check the Workers Build, not just a route.**
- **Pushed `5e78744`; deployed and green.** The orchestrator confirmed the live bundle on
  traveller.voyage contains the records screens, and the GitHub test run passed. Records
  (K5b), the transaction fix and clock storage are in production. Awaiting Johnny's first real
  save in production.

## 81. First real save in production; the black-box suite shares one Worker; K6b in (2026-10-05)

- **Johnny saved a record in production.** Sign-in, universe, Durable Object write, and the
  browser store work end to end on traveller.voyage.
- **Agent A:** `tests/api/server.js` starts one `wrangler dev` for every black-box file (port
  8799); the restart-survival case uses its own Worker (18799, private state). Clock cases
  pass on the Worker. **K6b:** `campaign.clock` and `setCampaignDate(days)` through `commit`;
  a conflict takes the server's value and raises one toast; read back from a second process.
  `truth_build.test.js` three times in a row with logs: no 500. 549 pass.
- **One 500 in the parallel run:** `POST /api/universes` inserted the row, then its read-back
  `select` failed inside the local D1 emulator ("internal error", miniflare). Most likely the
  emulator under parallel load, but it exposes a real weakness: a create that succeeded can
  answer 500, and a retry would make a second universe. **Agent B:** create returns the row
  it built (no read-back), and a failed create must leave no row behind.

## 82. K5c (places), "1 week" and the toast are in; accepted (2026-10-05)

- **New orchestrator session** from `orchestrator_start_here.md`. Handover push `8e9ceb6`
  (directives only) is green on GitHub; the live bundle is unchanged (records in, "1 week" not).
- **Agent D, step 1:** the toast sits beside the panel above the status line (in the search row
  at full width); **"1 week"** sits with the transport buttons, same time of day, view only
  (`orbit/clock.ts` gains `WEEK_DAYS`, `skipWeeks`, nothing else changes); the line-up search
  moved into a "More tools" kebab (`orbit/MoreMenu.vue`); a keyboard fault fixed on the way
  (buttons disabled mid-search dropped focus, so Esc did nothing).
- **Agent D, K5c:** the Where block on the record page (place in words, Locate, Show in orbit
  for a body, change, clear); the system picked by map click, omnibox or "Use <selected>";
  the body list from the system tree (arrow keys, "Nowhere in particular", Esc); Locate flies
  the map and drives Agent C's layer through `MapRenderer.setCampaign` only; the dossier shows
  "Your records here" / "on this world" with counts and "Add here"; the system tree counts
  bodies with records; signed out, none of it appears. Saved and read back from the real local
  API. New `workspace/{AddButton,RecordsHere,WhereBlock}.vue`, `locate.ts`, `opening.ts`,
  `pick.ts`, `place_source.ts`, `places.ts`; `tests/web/workspace_places.test.js`; 10 contrast
  pairs.
- **D's calls, accepted:** (1) `workspace/opening.ts`: signed in, the campaign opens once the
  map has painted and knows its truth version, so the dossier need not wait for the panel;
  never signed out, never before first paint. (2) A whole-system anchor reads "Regina system".
  (3) The design's free-text place label is dropped: `locationLabel` holds the body's name.
  (4) Locate steps the full-width panel down to a column without saving that as the width.
- **Orchestrator re-ran:** 568 pass / 0 fail / 7 skipped, check clean, typecheck clean, build
  green. `campaign/` and `surface/` untouched (git status agrees).
- **K5c leftovers, not built from the design:** no locator line or card in the orbit view (it
  selects the body and its lock marks it); no Locate on dossier rows; no "At Regina" chip or
  sort control on the list. Pick up with K5e (the party), when "Where are we" needs them.
- **Not exercised:** a long flight at far zoom, a system with no generated bodies, the dossier
  section's offline and load-error states, a screen reader, touch, browsers other than
  headless Chrome. The unmatched-world message was forced by writing a bad body key.
- **Agent B** has nothing on disk for the universe-creation hardening (§81); the prompt was
  re-issued through Johnny. **Pushable now:** D is between steps, A and C free.
- **Next:** D, step 3 of its brief (the deck plan viewer on a vessel's record page), then K5d
  links. A wires B's client id into `campaign/store.ts` when B reports.

## 83. Pushed `f43c3d5`; D's nine open questions answered on Johnny's instruction (2026-10-05)

- **Pushed `f43c3d5`** (places, "1 week", toast). GitHub run green; the live bundle
  `index-CXZpiMS6.js` is the same hash as the local build, holds "Your records here", and the
  orbit chunk holds "1 week". K5c and "1 week" are in production.
- **Johnny:** "answer the questions for D to the best of your ability; we're making a D&D
  Beyond campaign manager but for Traveller, Mongoose 2e." None of the nine is a Traveller
  rule (`rules/` says nothing about the calendar day or sea colours), so the orchestrator
  answered them in `questions_for_johnny.md`, each marked as its own: A5 keep the chips;
  A8 45°; A9 3° everywhere (the plan's 5° note is superseded); A10 stars in kelvin (Johnny's
  own line); A15 keep "standard days (24 h)"; A16 and E3 the prime meridian is the starport's
  longitude by definition, a referee pin overrides it later; E11 the three proposed colours;
  E12 option B (each liquid's own colour, paled; water keeps its ice); E13 drawn in the old
  profile's purple, never frozen, captioned "freezing point unknown".
- **Prompt for Agent C** (free; owns `surface/`): build A10, E11, E12, E13, check A9 and the
  A16 wording. D's screens are not touched beyond the star temperature's unit.

## 84. Universe creation hardened (Agent B); the store sends the id next (2026-10-05)

- **Agent B:** `POST /api/universes` returns the row it built, no `SELECT` after the insert;
  `UniverseCreate.id` optional (1 to 64 of `A-Za-z0-9_-`), else a ULID; the same id posted
  again by its owner answers 200 with the stored row (looked up before the truth-version and
  cap checks, so a retry at the cap still succeeds); another account gets 404; a lost
  primary-key race reads the winner; an unreleased version or an eleventh universe returns
  before the insert; a Durable Object touch that throws deletes the row and rethrows.
  `tests/api/universes.test.js` and `tests/shared/campaign.test.js` extended; `api.md`
  updated. **Orchestrator re-ran the black-box file against `wrangler dev`: pass.** Diff read:
  as reported.
- **Noted, not blocking:** a client id of the owner's soft-deleted universe answers 200 with
  the deleted row; the store mints a fresh id per create attempt, so it cannot happen by use.
- **Pushable by path** (`apps/api`, `packages/shared`, `tests/api`, `tests/shared`,
  `directives`); C and D are on other paths.
- **Next, Agent A:** `campaign/store.ts` mints `uni_` + UUID before the create and resends
  the same id on a retry; 200 is "already created".

## 85. Pushed `6bf409a`; C's colours and D's deck plan on a vessel are in (2026-10-05)

- **Pushed `6bf409a`** (universe create hardening). GitHub run green; the live bundle hash
  changed (`index-B4WVsPTM.js`), so the Workers Build deployed. The route itself needs a
  session to exercise; not re-proven in production.
- **Agent C (A9, A10, A16, E11 to E13):** the three liquids' colours in `surface/profile.ts`
  and `colourlessLiquids()` now empty; `paledSeaColours` for a frozen non-water sea (oxygen
  205,220,239 / 128,153,194; chlorine 217,226,200 / 136,153,130; water keeps its ice; caps
  blend to the same); "Unknown Exotic Liquid" drawn in the profile's purple, never frozen,
  captioned "exotic liquid; freezing point unknown", no melting point invented; stars on the
  orbit card in kelvin through `formatKelvin` (`design/units.ts`); `seasons.ts` already used
  3°; `orbit/daynight.ts` and `campaign_manager_plan.md` §7.10 say the starport stands on
  the prime meridian. No surface fixture digest changed. 569 pass.
  **Left undone because the prompt forbade `dossier/`:** the dossier's star Temperature tile
  (`dossier/model.ts` about line 855) still uses `formatTempFull`. C does it next.
- **Agent D, K9 part 3:** `workspace/VesselPlan.vue` after Tags, vessels only, over C's
  `deckplan/attach.ts` and `DeckPlanView.vue` unedited: import from the file chooser, a
  refused file says why and keeps the old plan, viewer in a panel-width box, replace, remove
  with undo by toast, both shut offline. Read back from the real local API with CDN tiles
  (import, reload, bad replace kept, remove, undo, type change hides and keeps the sheet).
  Six `k9_` screenshots. **Accepted.** Not proven: agreement with a real shipyard export (a
  file and its picture are still needed from Johnny); a 2,000-part plan.
  D's notes: the canvas is tainted by CDN tiles without `crossOrigin` (nothing needs pixels
  yet); the skipped list shows bare codes with no sentence (C's viewer; small wording).
- **D offered E11 to E13; told no: C has done them.**
- **Orchestrator on the combined tree:** 570 pass / 0 fail, check clean, build green, `dist`
  has only the CDN tile path.
- **Next:** D on K5d (links). C: the dossier star tile and the skipped-codes sentence. Push
  everything when A reports the client id.

## 86. The store sends the client id (Agent A); accepted (2026-10-05)

- **Agent A:** `campaign/store.ts` mints `uni_` + UUID (`newId` in `platform/browser.ts`)
  before the create and keeps it as `pendingUniverseId` until the server answers 201 or 200;
  a thrown request leaves the store in `error` and the next create posts the same id; 201
  and 200 both clear the pending id and open that universe. Store test: the first POST
  dropped, the retry answered 200, one id in both bodies, one universe open. 570 pass.
  Diff read; as reported. Small smell, not worth a round trip: `newId('uni' as 'cr')` casts
  past the id helper's prefix type; widen the type when `platform/browser.ts` is next touched.
- With B's §84 this closes the "create answered 500, retry made a second universe" weakness.
- **C's follow-up (§85) is on disk, unreported:** `dossier/model.ts`, `DeckPlanView.vue`,
  `tests/web/dossier_model.test.js`. D has not begun K5d edits (`RecordPage.vue` unchanged
  since step 3). Combined tree: 570 pass / 0 fail, check clean.
- **Push after C reports**, everything at once.

## 87. C's follow-ups in; the official ship sheet PDFs arrive (2026-10-05)

- **Agent C:** the dossier star Temperature tile uses `formatKelvin` ("5,800 K"); the deck
  plan viewer's skipped list leads with "Not in the tile catalogue:". Checked in the code.
  **Accepted.** Tree: 586 pass / 0 fail (D's K5d tests are already in it), check clean.
- **Johnny staged three PDFs under `assets/`:** `Ship Sheet 2026_fillable.pdf` (2 pages, 312
  named form fields, read with pypdf), and print A4 / Letter versions. Character sheets are
  announced, not yet on disk. Recorded as **K13** in `slice_2_campaign.md`: B inventories
  the fields (read-only, to `findings/`), Johnny turns the list into `rules/`, D renders the
  sheet after K5f. The plan's §5.3b transcription from an image is superseded by the PDF's
  own field names.
- **Push state:** D is mid-step in `workspace/` (`RecordPage.vue` already imports
  `LinksBlock`), so `workspace/` cannot go yet; VesselPlan rides with K5d. C's and A's
  finished work can go by path now.

## 88. Pushed `ae35414` and `fba890f`; K5d (links) in and accepted (2026-10-05)

- **Two pushes by Johnny.** `ae35414` used the earlier by-path command (which still included
  `workspace/`) and so took D's `links.ts` and `RecordPage.vue` mid-step; by luck
  `RecordPage.vue` did not yet import `LinksBlock`, so nothing referenced a missing file.
  `fba890f` took the rest. Both GitHub runs green; live bundle `index-C8bCOGa-.js` holds the
  three liquids, "Import a shipyard file", "Not in the tile catalogue" and the create body
  with `id`. **The ship sheet PDFs went into git** with `ae35414` (Johnny had staged them).
  Lesson for the orchestrator: when a by-path command is superseded, say so in one line;
  Johnny may run the older one.
- **Agent D, K5d:** Connections after Tags on every record page, grouped under the label
  from this side (`CAMPAIGN_LINK_KINDS`); add by picking a record then a kind from what the
  vocabulary allows between the two types, optional role, repeats refused; chip opens the
  other record, role edited in place, remove with undo; "aboard" in the Where block picks a
  vessel and saves `{kind:'record', id}`, the Where line leads with the vessel; deleting a
  record names its connections in the toast and undo restores them on the server's revisions.
  A Vue trap fixed on the way (a ref wraps its object, so identity comparison of the chosen
  kind never matched; found in the browser, not by the unit tests). Read back from the real
  local API end to end. New `workspace/links.ts`, `LinksBlock.vue`, `RecordPicker.vue`,
  `tests/web/workspace_links.test.js`; 8 contrast pairs; seven `k5d_` screenshots.
  **Orchestrator:** 585 pass / 0 fail, check clean, build green; `campaign/`, `surface/`,
  `dossier/` untouched; `links.ts` reads the shared vocabulary. **Accepted.**
- **Not built from the drawing:** "Also at Regina" at full width; since / until / notes /
  visibility on links have no UI (as the slice says). Not exercised: a vessel aboard another
  record (not offered), screen reader, touch, other browsers.
- **Pushable now** (D between steps; B's inventory is read-only to `findings/`).
- **Next, D:** K5e the party. The store already carries `settings` (party document) through
  `commit.ts`, `locate` resolves anchor chains, and `MapRenderer.setCampaign` takes the
  party: no A step is needed first.

## 89. K13 part 1 in: the ship sheet's 312 fields inventoried (2026-10-05)

- **The "campaign links" push did not happen:** HEAD is still `fba890f` and D's K5d files
  are uncommitted on disk. Johnny said "pushed"; the command is repeated.
- **Agent B, K13 part 1 (read-only):** `findings/ship_sheet_fields.json` (312 entries: name,
  page, type, box in PDF user space with a lower-left origin, section) and
  `findings/ship_sheet_fields.md`. 246 text widgets, 66 checkboxes (the critical-hit pips,
  six each for eleven systems). Sections from the BebasNeue headings and the rotated tabs;
  pages 792 by 612. Oddities kept verbatim: title "Ship SHeet", "Passenger Capactiy". Against
  the plan's §5.3b image transcription only five names match (Class, Hull Points, Armour,
  Bandwidth, Crew); the PDF has 307 names §5.3b lacks and §5.3b 34 the PDF lacks: §5.3b's
  list is superseded by the PDF's. Checked: file parses, 312 entries, shape as reported.
  **Accepted.**
- **Part 2 is Johnny's.** Recommended: copy the JSON into `rules/` as
  `mgt2e_ship_sheet_fields.json` (his folder; one command) so the app can consume it through
  the generated wrapper; nothing in it is a rule, only labels and positions.

## 90. Pushed `dfce0e8` (links); the sheet fields are in `rules/` (2026-10-05)

- GitHub run green; live bundle `index-B7V9Fo0q.js` holds "Connections", "Aboard",
  "Commanded by". K5d is in production.
- **Johnny copied the inventory to `rules/mgt2e_ship_sheet_fields.json`** (untracked until
  the next push). `scripts/gen_rules_esm.js` wraps only `.js` files, so before K13 part 3
  Agent A extends it to emit a module per `.json` as well (`export default` the parsed
  object), regenerates, and adds a test that the wrapper exports 312 fields. Not urgent.

## 91. The rules wrapper takes `.json`; the ship sheet fields are importable (2026-10-05)

- **Agent A:** `scripts/gen_rules_esm.js` (+12 lines) emits a module per `.json` in `rules/`
  with the parsed object as default export; `mgt2e_ship_sheet_fields.js` generated; the five
  existing wrappers byte-identical (SHA-256 listed in A's report);
  `tests/generation/ship_sheet_fields.test.js` asserts 312 entries with the five keys.
  Checked: import gives 312; 586 pass. The generated folder is git-ignored and CI runs
  `rules:gen` before the tests, so nothing else is needed. **Accepted.**
- D has begun K5e (`workspace/party.ts` on disk): push A's work by path only.

## 92. Pushed `69db0a4`; K5e (the party) accepted; images and the light deck plan asked for (2026-10-05)

- **Pushed `69db0a4`** (rules wrapper, ship sheet fields). GitHub run green. Nothing in the
  bundle changes until a screen reads the fields.
- **Agent D, K5e:** the Party tab (`/campaign/party`): the ship from the vessels, members
  from a picker, "Not aboard" with "Put aboard"; "Where are we" in large type with Locate,
  Show in orbit and "Move the party" (moves the ship's anchor, or the party's own); Agent C's
  marker shows the ship's name and opens the Party tab; the omnibox's "Your campaign" group
  from the word index (five, then "All N matches") and "Person here" / "Place here" on chart
  rows; the "At Regina 1910" chip and an order control on the list; Locate on dossier rows.
  `WhereBlock` now edits any anchor. Every edit is one settings change through `commit`.
  Read back from the real local API. A focus fault fixed (focus now follows the route change).
  New `workspace/party.ts`, `PartyPanel.vue`, `omni_campaign.ts`, `list_state.ts`,
  `tests/web/workspace_party.test.js`; also `router.ts`, `search/omni.ts`, `OmniBox.vue`,
  `MapView.vue`; 7 contrast pairs; ten `k5e_` screenshots.
  **Orchestrator:** 598 pass / 0 fail, check clean, build green; `campaign/`, `surface/`,
  `map/` untouched. **Accepted.** Not built, by the schema: the ship's state and the dated
  position log (K6d). Not exercised: "All N matches" in a browser, hover names at the
  subsector tier, screen reader.
- **Johnny, two asks:** (1) the deck plan tiles are meant for a light background, not black;
  (2) every record gets a primary image and further images. Written as **K14** (images; the
  specs already held the object routes and the `images` column; decisions: first entry is
  primary, 12 per record, browser encodes WebP and thumbnails and hashes, Worker verifies and
  keeps `objectBytes`, quota 250 MB per universe as the orchestrator's number) and a light
  "paper" token for the deck plan viewer (Agent C), both in `slice_2_campaign.md`.
- **Issued:** C the light backdrop; B the object routes; A the schema and `campaign/images.ts`;
  D K5f (several campaigns), then the image screens.
- **Pushable now** (D between steps; A, B, C have nothing on disk yet).

## 93. Direction: the Builder after the campaign MVP; the date beside the search bar (2026-10-05)

- **Johnny:** after the campaign, universe customisation: "make my own universe clone and
  start generating systems and sectors", with sector, subsector and system names and the
  system rollups from the old app, and both Mongoose 2e and T5 for full generation.
  Recorded in `plan.md` before the Builder slice with what already exists: the overlay mode
  is the clone; `core/names.js` has the pools; `packages/generation` runs all five editions
  (T5 included: `t5_*` are in `packages/engines`). The engine corrections stay the gate
  before the Builder generates for users (F2 open).
- **Johnny, two UI asks:** remove the magnifying glass from the Rail; a clear `DDD-YYYY`
  date beside the search bar, designed by D. Folded into K6c in `slice_2_campaign.md` with a
  ruling (campaign date signed in, the orbit view's date signed out; D may propose better).
- **D's order from here:** K5f, then K6c (with the date and the Rail change), then the K14
  image screens, then K13 part 3 (the ship sheet). A, B, C as issued in §92.

## 94. The "campaign party" push did not land; the deck plan paper is in; the grid is next (2026-10-05)

- **HEAD is still `69db0a4`.** Johnny said "pushed" twice for K5e; the commit never happened
  (`git status` shows K5e and all four agents' files uncommitted). Now every agent is
  mid-step (A `campaign/images.ts`, B `routes/objects.ts`, C the viewer, D K5f in
  `workspace/`), and D's K5f touches `CampaignPanel.vue`, which K5e also changed, so K5e
  cannot be split out by path. **No push until D reports K5f;** then D's whole lot goes.
- **Agent C, paper backdrop:** `--paper: #f4efe4` in `tokens.css` (deck plan only, no dark
  override), `DeckPlanView.vue` uses it; `deck_plan_paper.png` shows the ship on warm paper
  with the bar, credit and skipped list in the dark look. **Accepted.**
- **C's finding (`findings/deck_plan_grid.md`):** the shipyard draws its ship over a repeating
  `Square Base (10x10).png` (600 px, ten 5-unit squares, so 50 map units a copy), which the
  manifest already holds as the map tile, not a part. Our viewer stamps parts on bare paper.
  Fix: repeat that tile under the parts on 50-unit corners with the ship's pan and zoom; if
  the tile is missing, draw nothing in its place; two draw tests that count part images
  change. C has the prompt.

## 95. K5f (several campaigns) in and accepted; the campaign screens of slice 2 are complete (2026-10-05)

- **Agent D, K5f:** the account menu lists "Your campaigns" with the open one marked, "New
  campaign…" (name offered, disabled at ten), "Rename", "Delete" (our own dialog, one red
  button, no native dialog, no undo, "Its 7 records go with it"), "Go to the party", Sign
  out; keyboard throughout; after a switch, create or delete the old campaign's session
  state is let go and the last one used opens on the next visit. Through the store's list /
  create / rename / switchCampaign / deleteCampaign. Read back from the real local API.
  New `workspace/campaigns.ts`, `tests/web/workspace_campaigns.test.js`; `AccountMenu.vue`
  changed; seven `k5f_` screenshots. **Orchestrator:** 614 pass / 0 fail, check clean, build
  green on the combined tree; `campaign/`, `surface/`, `map/`, `deckplan/` untouched by D.
  **Accepted. K5a to K5f are all built.**
- **D's findings:** (1) a setup function named `open` beside the `open` prop kept the pop-up
  from closing; fixed. (2) **For Agent A, after K14:** a failed list / create / rename /
  delete makes the store mark the whole open campaign `error`, so the panel said the
  campaign could not be loaded over a campaign that was fine; the menu works around it,
  but the store should not change `status` for a list call. (3) Local only: a create fails
  when the chart's truth is production's and the local API knows only `vtest`.
- D's local test campaign "The Spinward Run" was soft-deleted by an early driver run (local
  wrangler state only).
- **Push by path now:** D's files (`workspace/`, `components/`, `router.ts`, `search/`,
  `views/`, its three tests, `directives`); A, B, C stay out.
- **Next, D:** K6c in full (the clock screens, "1 week" writing the campaign date when the
  view sits on it, the `DDD-YYYY` date beside the search bar, the magnifying glass off the
  Rail).

## 96. Pushed `428a8ac` (party, several campaigns); deployed (2026-10-05)

- GitHub run green; live bundle `index-CaS_NCqW.js` holds "Where are we", "Your campaigns",
  "New campaign", "Person here". **K5a to K5f are in production.** D has begun K6c
  (`workspace/ClockLine.vue`, `StardateChip.vue`, `stardate.ts` on disk).

## 97. K14 browser side in (Agent A); accepted (2026-10-05)

- **Agent A:** `CampaignImage` (`hash`, `thumbHash` 64 lowercase hex, `width`, `height`,
  `bytes`, `caption` 200), `CampaignRecord.images` typed, at most 12, first is primary;
  `campaign/images.ts`: `prepareImage` (WebP, longest side 2048, quality 0.85, a 320 px
  thumbnail, SHA-256 via `crypto.subtle`, a message when WebP cannot be encoded),
  `uploadImage` (two PUTs, 200 and 201 succeed, `too_large` surfaces the server's message),
  `addImage` commits only after both PUTs, `removeImage` / `makePrimary` / `setCaption`
  through `commit`; the last removal sets `null`. Tests with an injected fetch and a stub
  encoder. Diff read: as reported. 614 pass. **Accepted.** Pushable by path
  (`packages/shared`, `apps/web/src/campaign`, its two tests) before A's next step touches
  `store.ts`.
- **Next, A:** D's finding (§95): a failed list / create / rename / delete must not set the
  open campaign's `status` to `error`.

## 98. Pushed `2e5bcf5` (image schema and browser upload); deployed (2026-10-05)

- GitHub run green; live bundle `index-BYf9i_vS.js` holds the typed schema; `campaign/images.ts`
  is tree-shaken out until a screen imports it (expected).

## 99. K14 object routes in (Agent B); accepted; a black-box hazard found (2026-10-05)

- **Agent B:** `routes/objects.ts` mounted from `routes/universes.ts`: `PUT /:id/objects/:hash`
  (64 lowercase hex, SHA-256 of the body, `RIFF....WEBP`, 8 MB by header and by body,
  Origin, `head` first: 200 without writing; else quota 250 MB on `object_bytes`, `put` with
  `image/webp`, the counter updated, the object deleted if the update fails, 201) and
  `GET` (owner streams with stored type and `Cache-Control: private, immutable`; 404 for
  others and for a missing hash). `tests/api/objects.test.js` passed on B's `wrangler dev`;
  `api.md` rows marked built; `PRIVATE_BUCKET` was already bound. Route read in full by the
  orchestrator. **Accepted.**
- **Hazard:** the orchestrator's two re-runs of that file timed out (180 s). The shared
  `wrangler dev` log shows "Reloading local server" three times during the run and then
  `read ECONNRESET`: wrangler rebuilds when files it bundles change (`apps/api`,
  `packages/*`), and other agents were editing at the time. **Rule:** run the black-box
  suite on a quiet tree (no agent mid-step in `apps/api` or `packages/`), or accept the
  agent's own run plus a full read of the route, as here.
- **Pushable by path:** `apps/api`, `tests/api`, `directives`.

## 100. Pushed `5af0607` (object routes); deployed (2026-10-05)

- GitHub run green; the live Worker answers 401 on a signed-out `PUT .../objects/<hash>`
  (the old build had no route there). Bundle unchanged. K14 is live but for the screens.

## 101. K6c in and accepted: the clock has screens; the date sits beside the search bar (2026-10-05)

- **Agent D, K6c:** the campaign date under the panel's tabs ("120-1105 Senday", the plan's
  §7.9 weekdays, day 001 "Holiday"), edited in place with a refusal message; the orbit view
  opens on the campaign date when a campaign is open and the link carries none, marks the
  time row, offers "Set as campaign date" off the day; "1 week" advances the campaign date
  with the view when the view sits on it, undo by toast restores both; **the date chip
  beside the search bar** (signed in: the campaign date with weekday, opens the panel's
  editor; signed out: the orbit view's date, quieter; weekday dropped under 860 px, hidden
  under 680 px); **the Search item is gone from the Rail**, `/` and Ctrl+K still focus the
  field. A temporal-dead-zone fault fixed. Read back from the real local API (clock revs 1
  to 5). New `workspace/stardate.ts`, `ClockLine.vue`, `StardateChip.vue`,
  `tests/web/workspace_stardate.test.js`; 7 contrast pairs; eleven `k6c_` screenshots.
  **Orchestrator:** 626 pass / 0 fail, check clean, build green; the weekday names match
  the plan; D's files only where it said; looked at the half-width panel and the orbit row:
  the chip and mark fit the look. **Accepted.** Noted by D, not changed: under 1,060 px the
  orbit time row wraps and the speed control takes a second line.
- **Johnny:** "the day / night tick marker feature isn't implemented; done, bug, or what?"
  Neither: the local-time tick on the Day and night strip (plan §7.10) was waiting on A16
  (where a starport stands), answered today: the prime meridian. It is now a small step for
  Agent C after the grid (`orbit/daynight.ts` already carries the ruling; `dossier/DayNight.vue`
  draws the strip).
- **Next, D:** the K14 image screens (`slice_2_campaign.md` K14.5): the primary image at the
  head of the record page and as thumbnails on rows and results, the gallery strip, add by
  chooser / drop / paste, remove with undo, "Make primary", captions, a lightbox, progress
  and failure in the saving mark's language. Then K13 part 3, the ship sheet.

## 102. Pushed `0e0d00d` (clock screens); the orbit view showpiece pass is asked for (2026-10-05)

- GitHub run green; live bundle `index-Di-t_pJu.js` holds the weekdays and the chip; the orbit
  chunk holds "Set as campaign date". K6c is in production.
- **Johnny:** make the orbit view a clean showpiece: drop the ±1 h controls (scrubbing covers
  them), consider the layer toggles as a key at the bottom, the view choice (Orbits / Row /
  Column) as a corner control like Google Maps or inside View; it must sing with
  `manifesto.md`, because the starship plotting tools (K12) will live on this map. Written
  as **K15** in `slice_2_campaign.md`: D designs first (with the K12 space reserved), Johnny
  rules, then D builds. **Order for D:** finish the K14 image screens (in flight), then K15
  part 1, then K13 part 3.

## 103. The store no longer marks the open campaign failed on a catalogue error (Agent A) (2026-10-05)

- **Agent A:** `listCampaigns` / `createCampaign` return null on failure, `renameCampaign` /
  `deleteCampaign` throw with a message; `status` becomes `error` only while the open is
  still `loading`; 401 still signs out. Tests: a failed create and a failed list leave
  status `ready` and the rows intact. Diff read: as reported; 637 pass on the tree.
  **Accepted.** D's K5f workaround in `AccountMenu` already shows the thrown message.
- Pushable by path (`apps/web/src/campaign`, `tests/web/campaign_store.test.js`). A is free.

## 104. Pushed `3f1b07f` (store fix); campaign export in (Agent B); accepted (2026-10-05)

- GitHub run green; live bundle `index-irmFZBnU.js` (the Workers Build took about three
  minutes this time; the orchestrator polled instead of declaring a failed deploy).
- **Agent B:** `GET /api/universes/:id/campaign/export` (`routes/campaign_export.ts`): walks
  `readCampaign` pages (after / 1000) until `done`, 500 if a page does not advance, keeps rows
  with `deleted !== true`, current `settings` and `clock`, `{ universe { id, name,
  truthVersion }, exportedAt, records, links, settings, clock }`, `Content-Disposition:
  attachment; filename="<name>-<DDD-YYYY>.json"` (UTC day of year; control characters,
  quotes and slashes stripped from the name). Images stay as hashes on the rows. Black-box
  test on `wrangler dev`: three writes, the export holds the live place with its image hash
  and neither the deleted place nor its tombstoned link; other account 404. `api.md` marked.
  **Accepted** (route read in full). Note for later: a non-Latin campaign name needs RFC
  5987 encoding in that header.
- B saw `tests/web/surface_service.test.js` fail once under load (`longestChunkMs < 50`) and
  pass alone and on rerun: a timing assertion, not this change. Watch it.
- **Next, A:** the import counterpart in the browser (`campaign/import.ts`): parse and
  validate the export document, restore into a new empty campaign (or the open one when it
  is empty) through `commit` in batches that respect the PATCH limits (200 rows, 1 MB),
  keeping ids; images by hash are kept on the rows (the objects, if any, are still in the
  bucket for the same account). D wires Export and Import into the account menu with K15.

## 105. Pushed `2f861ab` (export); the grid is in; the orbit showpiece design is ready for Johnny (2026-10-05)

- GitHub run green; signed-out `GET …/campaign/export` answers 401 on production.
- **Agent C, the grid:** `drawSquareBase` fills one repeat pattern of `Square Base (10x10).png`
  (600 px = 50 map units, so a line on every multiple of 5 including 0) under the parts with
  the ship's pan and zoom; a missing tile draws nothing and stays off the skipped list; no
  new colour. `deck_plan_grid.png` shows the squares lining up with the hull. 641 pass on
  the tree. **Accepted.** Pushable by path (`deckplan/`, `design/tokens.css`,
  `tests/web/deck_plan.test.js`).
- **Agent D, K15 part 1:** `findings/orbit_showpiece_design.md`, ten mockups. 21 controls
  inventoried; the picture starts under one time row (play, 1 week, scrub ±30 d with the
  campaign date marked, speed, one date readout pressed to type, the mark, Set as campaign
  date); the key at the foot is the toggle, off entries dimmed; the layout choice upper
  left; More tools to the header; the K12 strip upper right with Jump at its end, flight
  line, target and range ring in amber (`--attention`, no new token); 1/2/3 the layout, 4 to
  0 the layers; every control a `registerCommand` entry first. Twelve decisions D1 to D12
  in §8, each with a recommendation. The "100D" mark is the view's existing jump-limit
  circle (legacy `system_viewer.js:2916-2950`), not a rule from memory. **Orchestrator:
  recommends yes to all twelve as recommended.** Part 2 waits on Johnny.
- **Missing:** D's K14 image screens report. The files and eleven `k14_` screenshots are on
  disk; Johnny asked to paste it.
- **Next, C:** the local-time tick on the Day and night strip (plan §7.10; A16: the prime
  meridian).

## 106. Pushed `2984e9f` (paper and grid); campaign import in (Agent A); accepted (2026-10-05)

- GitHub run green; live bundle `index-Cxg2CW6s.js` holds the "Square Base" tile code. The
  deck plan draws on paper with the shipyard grid in production.
- **Agent A, import:** `campaign/import.ts`: `parseExport` (shared schemas, one message for
  the first fault, "The file is not JSON."), `importCampaign` into the open campaign only
  when it has no records and no links ("That campaign is not open." / "… not empty."), ids
  and image hashes kept, `baseRev` 0 for rows, the open campaign's revision for settings and
  clock; records, links, settings, clock in that order, each batch within 200 rows and 1 MB
  and flushed before the next; the first failed batch stops it and reports the rows landed.
  Tests: 250 records and 200 links in three PATCHes in order, a bad document, a non-empty
  target, a failed second batch. 641 pass. **Accepted.** No screen: Export and Import go
  into the account menu with K15 part 2 (D).
- Pushable by path (`apps/web/src/campaign`, `tests/web/campaign_import.test.js`). A free.

## 107. Pushed `e5bb73d` (import); Johnny rules yes to D1 to D12; ship tracks and traffic (2026-10-05)

- GitHub run green. The import module has no screen yet, so the bundle shows nothing new.
- **Johnny: yes to all twelve** of D's orbit showpiece decisions. K15 part 2 is go.
- **Johnny on K12:** the orbit view will handle **many ship plots at once**; ship navigation
  is a **data feed per ship** (a GPS / black-box record) so a route can be re-created,
  re-used or re-traced; the engine will make many of these, so **ship traffic** (patrols
  and the like) can be mocked up across a sector. Recorded under K12 in
  `slice_2_campaign.md`: a vessel's **track** (dated legs on `status`, the plan's position
  log widened) is the record; the orbit view draws any number of ships and the K15 strip
  takes the *selected* ship from a ship list; generated traffic is **K16**, a derived file
  per universe from the engines, after the G1 rules.
- **D's part 2 prompt carries two amendments:** the K12 reservation assumes several ships
  (a ship list, one strip for the selected one); Export and Import go into the account menu
  (B's route, A's module).

## 108. The starport tick is on the Day and night strip (Agent C); accepted (2026-10-05)

- **Agent C:** `starportTick` in `orbit/daynight.ts`: local time at longitude 0 (A16) for the
  view's date; a one-pixel mark with "Starport" and the local time on both strips of
  `dossier/DayNight.vue`; hidden for a world locked to its star; no slide under reduced
  motion; the dossier takes the date from the link, then the campaign clock, then day
  002-1105. Test at noon (a quarter across, since the strip runs sunrise to sunrise) and at
  18:00 (the light/dark edge), and the locked case, in `tests/web/orbit_lineup.test.js`.
  Screenshot checked: the mark and label sit above the strip. 642 pass. **Accepted.**
  Noted by C: a running orbit clock moves the tick only when the view writes the link
  (pause, skip, scrub end); that is the dossier's existing behaviour.
- Pushable by path: `apps/web/src/dossier`, `apps/web/src/orbit/daynight.ts`,
  `apps/web/src/views/DesignView.vue`, `tests/web/orbit_lineup.test.js`. D is mid-step in
  the rest of `orbit/` and `views/OrbitView.vue` (K15 part 2 has begun).

## 109. Pushed `8dbcc36` (starport tick); K14 image screens accepted from D's notes (2026-10-05)

- Johnny's last D report was the K15 design again; no separate K14 screens report exists.
  **Accepted from the evidence:** `findings/campaign_workspace_design.md` §9i (D's build
  notes), eleven `k14_` screenshots, `tests/web/workspace_images.test.js` passing, the
  record page shot showing the primary image at its head with the caption in place.
  Built: `workspace/images.ts`, `gallery_state.ts`, `RecordGallery.vue` (hero and strip),
  `Lightbox.vue`; thumbnails on list, dossier and omnibox rows; add by chooser, drop,
  paste; remove with undo; "Make primary"; captions; the saving mark's words through
  "Reading", "Uploading", "Saving", "Saved"; refusals before reading (not an image, over
  8 MB, stricter than the server's cap by D's own note); the WebP refusal shown as given.
  Seen against the real local API with a 3,000 px PNG and a 2,000 × 3,000 JPEG.
  Not done: a progress bar, reordering beyond "Make primary", alt text apart from the
  caption. **K14 is complete.**
- Pushable by path (`workspace/`, `components/OmniBox.vue`, `search/omni.ts`, the two
  tests); `design/icons.ts`, `platform/browser.ts` (`saveBlob`), `orbit/`, `OrbitView.vue`
  are D's K15 part 2 in flight and stay out.
- **The GitHub run on `8dbcc36` failed (build):** the orchestrator's by-path command named
  `views/DesignView.vue`, which D had already edited for K15 (imports of the uncommitted
  `LayerKey.vue` and `LayoutCorner.vue`). `vue-tsc` fails on CI; the Workers Build does not
  deploy; production stays on the previous build. **Fix issued:** `git restore --staged
  --source=8dbcc36~1` on that file (index only, the working copy untouched) in the same
  commit as the K14 screens. **Rule for by-path pushes:** before naming a file another
  agent shares, `git diff` it for that agent's imports.

## 110. K15 part 2 in and accepted: the orbit view is the showpiece (2026-10-05)

- **Agent D:** `TimeControls.vue` rewritten (play, 1 week, scrub with shuttle at the ends and
  the campaign date as an amber tick, real time + speed, one date readout pressed or T to
  edit, the campaign mark, Set as campaign date; the ±1 h, the Scrub popover, the shuttle
  slider, the View popover and the chip row gone); `LayoutCorner.vue` and `LayerKey.vue` on
  the picture through a new overlay slot in `OrbitCanvas.vue` (the key is the toggle, off
  entries dimmed and dashed; `LayerChips.vue` and `OrbitLegend.vue` deleted); More tools in
  the header; `orbit/commands.ts` registers every control first and the Keys table is
  generated from it, with a test that every command has a control and no key does two
  things; the K12 strip's place reserved with `--flight-strip-height` (0 now), the ship
  list to go beneath; **Export and Import in the account menu** (`saveBlob` in
  `platform/browser.ts`; Import disabled when the campaign is not empty). Twelve
  `orbit_showpiece_built_*` screenshots; exercised at column, half, full, 1,100 and 480 px,
  signed out, reduced motion, every key. `DesignView.vue` updated for the deleted chips.
  **Orchestrator:** 656 pass / 0 fail, check clean, build green on the combined tree; the
  built view matches the ruled design. **Accepted.** The whole tree is pushable with
  `git add -A`, which also cures the `8dbcc36` build failure (the imports now exist).
- **Found:** the dossier's "100D jump travel times" come from `calculateBaseJourneyTimes`
  in `packages/engines` (legacy `universal_math.js`, parity-tested): G1 (1) and (2) already
  exist in copied code; Johnny confirms them rather than supplies them. Noted on G1.
- **Next:** D, K13 part 3 (the ship sheet from `rules/mgt2e_ship_sheet_fields.json`); A,
  the vessel track schema and store helpers (K6d data, K12 "Many ships" point 1) so D can
  draw the ship list and the Jump button after the sheet.

## 111. Pushed `7bcbd00` (orbit showpiece, images, export/import); deployed; CI green again (2026-10-05)

- GitHub run green (the `8dbcc36` failure is cured). Live bundle `index-CB1tmyM0.js` holds
  "Make primary", "Export", "Import", "Starport"; the orbit chunk `OrbitView-BHqaXmRn.js`
  holds the new row and the key. **In production:** the orbit showpiece, record images, the
  starport tick, Export and Import in the account menu. The tree is clean but for
  `directives/`.

## 112. Johnny's feedback on the live deck plan and orbit view (2026-10-05)

- Three asks, recorded under "Deck plan and orbit follow-ups" in `slice_2_campaign.md`:
  a full-screen deck plan behind an expand icon (D, after the sheet); tiles fuzzy when
  zoomed out (C, now: the canvas uses default low smoothing when it draws 600 px tiles
  small; `imageSmoothingQuality = 'high'` plus pre-halved tile copies under half scale);
  Orbits / Row / Column as a split button whose face shows the selected view (D, after the
  sheet).

## 113. The vessel track (A) and the ship sheet (D) are in and accepted; K17 shared ship feeds recorded (2026-10-05)

- **Agent A:** `TrackLeg` / `Track` in `packages/shared` (modes docked / orbit / flight /
  jump, `accelG` 1 to 6, note 200, 500 legs, time order enforced; `status.track` optional,
  other status keys untouched); `campaign/track.ts`: `positionAt` (anchor, or `{ leg,
  fraction }` mid-flight or mid-jump, null before the first departure), `appendLeg` /
  `removeLastLeg` through commit with "Legs must stay in time order.", `whereAreWe` reading
  the track when present. Tests on four dates and the refusals. **Accepted.**
- **Agent D, K13 part 3:** `workspace/ship_sheet.ts`, `ShipSheet.vue` (own chunk): the 312
  fields through the generated wrapper, the PDF's 16 sections in page order, numbered
  series as tables, boxes 30 pt or taller as textareas, the PDF's spellings kept; chamfered
  panels, cyan tabs, rust value tags, orange frame (three new tokens); edited in place and
  stored as `sheet.fields { [name]: value }` with `sheet.schema`, beside `sheet.deckPlan`;
  "5 of 312" counts filled fields; nothing computed. Read back from the real local API.
  Seven `k13_` shots and the PDF's two pages rendered beside them. **Accepted.** The half
  shot matches the plan's §5.3b look.
- **Orchestrator:** 671 pass / 0 fail, check clean, build green on the combined tree.
  C is mid-step in `deckplan/draw.ts`; push by path leaves `deckplan/` out.
- **Johnny:** shared ship feeds, follow an account, faction pseudo-accounts with NPC
  movements. Written as **K17** in `slice_2_campaign.md` with the mechanism: publish per
  vessel (opt-in), a feed file per account in the public bucket (readers never touch a
  Durable Object), follows as rows, faction accounts flagged and admin-owned, caps as the
  anti-spam. After K6d and K16.
- **Next, D:** the full-screen deck plan and the layout split button (§112), then K6d
  screens (the ship list, the track on the vessel page, the Jump button on
  `settings.jumpHours`, "Where are we" from the track).

## 114. Pushed `c4d7e8b` (track, sheet); a batch of Johnny's feedback on the live app (2026-10-05)

- Johnny's feedback after using production, recorded as follow-ups 4 to 9 and K13 part 4
  in `slice_2_campaign.md`: the stardate chip's text alignment; a scrub glitch across the
  campaign tick; controls into the orbit header as animated drawers (D designs first); the
  day/night tick as a large play marker moving in real time with the clock, no label (C);
  the ship sheet as a panel default (no counter, file name, frame or page numbers;
  collapsible sections; frozen key columns on sideways scroll); passengers and crew as
  people with a + picker, pills and a modal card; a character sheet for people when its
  PDF arrives (none in `assets/` yet).
- **Split into steps:** D step 1 (small fixes and the sheet chrome: items 1, 3, 4, 5, 8 and
  the split button), D step 2 (item 9, then item 6's design), C next (item 7). K6d screens
  after those.

## 115. Crisp deck tiles at small scales (Agent C); accepted (2026-10-05)

- **Agent C:** `drawDeck` sets `imageSmoothingEnabled` and `imageSmoothingQuality = 'high'`;
  every tile and the grid keep a three-level pyramid (original, half, quarter, halved once
  with the same quality); `mipLevel` picks by frame scale (under ½ → 1, under ¼ → 2); the
  pattern matrix and the three-corner transform divide by the copy's size so the geometry
  is unchanged; scale 1 uses the original and no fixture digest changed. Test for the three
  levels. 673 pass. **Accepted.** The before/after shots are at scale 0.21 (a thumbnail of
  a ship); Johnny judges the real effect in the viewer at a modest zoom-out.
- Pushable by path: `apps/web/src/deckplan/draw.ts`, `tests/web/deck_plan.test.js`. D is
  mid-step (`PlanModal.vue`, `time_row.ts`, `ShipSheet.vue`, `StardateChip.vue`, …).
- **Next, C:** the real-time day/night play marker (§114 item 7).

## 116. Passkeys recorded at the back of the line (2026-10-05)

- Johnny: a suggestion from online, passkeys for people who do not want OAuth; sign-in
  stays X (Discord and Google when configured). Recorded in `plan.md` "After 5": the
  better-auth `passkey` plugin (architecture.md already names it), its migration, "Add a
  passkey" in the account menu, "Sign in with a passkey" on the card; the recovery story
  for a passkey-only account to be decided with Johnny first.

## 117. Pushed `94e69a5` (crisp tiles); the real-time marker (C) and follow-ups step 1 (D) accepted (2026-10-05)

- GitHub run on `94e69a5` noted below.
- **Agent C, item 7:** the Day and night tick is a 9 px rounded play marker in `--daylight`
  with a `--night-sky` edge, 4 px past the 22 px strip top and bottom, on both strips; no
  label; `orbit/running.ts` publishes the clock from `OrbitCanvas.paint` each frame (three
  lines) and the dossier subscribes while on the orbit view (the map dossier keeps link,
  then campaign clock, then 002-1105); `markerAt` = `starportTick`'s share, wrapping at the
  next sunrise; reduced motion steps once a world-minute. Test at two clock values and the
  locked case. Four shots and a GIF from the design page (the local truth has no orbit
  system). **Accepted.** The shot shows the marker reading as a heavy rounded bar.
- **Agent D, follow-ups step 1:** `PlanModal.vue` (the deck plan full-screen in the lightbox
  pattern, DeckPlanView wrapped unchanged, Esc and scrim, focus returns); the layout split
  button (face = current view, arrow opens a radio menu, keys 1/2/3 kept); the stardate chip
  centred; **the scrub glitch found and fixed:** two reflows of the time row under the
  pointer (the Set-as-campaign-date button appearing and the readout widening with the
  weekday's name) changed the slider's width mid-drag, so the pointer read another value;
  now the button holds its space and the readout is fixed at its longest, with a test that
  reproduced it first (`orbit/time_row.ts`, `tests/web/orbit_time_row.test.js`); the sheet
  as a panel default (count, file name, frame, page numbers gone; every section a folding
  tab with the filled count when folded, kept for the session; sticky key columns; custom
  scroll kept); **extra defect fixed:** the panel's transform made it the containing block
  of `position: fixed`, so the K14 lightbox opened inside the column; both modals now
  `<Teleport to="body">`. 6 contrast pairs; eleven `fu_` shots. **Accepted**; the half-width
  sheet shot reads as part of the panel.
- **Orchestrator:** 680 pass / 0 fail, check clean, build green on the combined tree.
  Everything finished; **push with `git add -A`.**
- **Next:** D step 2 (item 9 passengers and crew as people; then item 6's drawer design).
  C free.

## 118. Pushed `6a705b4`; deployed; four more notes from the live app (2026-10-05)

- GitHub run green; live bundle `index-CVdBAwdC.js` holds the plan modal. Johnny: the deck
  plan is "nice and crisp now"; the thermometer "looking great".
- **New follow-ups 10 to 13** in `slice_2_campaign.md`: the credit line smaller on one line
  (C); the play marker in a teal that contrasts with day and night (C); stray few-pixel
  x-scrolls in the sheet at column width (D); folded tabs' background to full width and a
  graceful open/close motion instead of a snap (D). C has 10 and 11 now; D gets 12 and 13
  as step 3 after the pills.

## 119. Two more orbit notes from Johnny; waiting on C and D (2026-10-05)

- **Follow-ups 14 and 15** in `slice_2_campaign.md`: the layer toggles get a micro-animation
  (rings grow from their star and shrink back; a teal wireframe sphere fading as the
  transition for moons and day/night; tokens' motion; instant under reduced motion; the
  steady frame unchanged); and D decides, from the manifesto, what happens when the docked
  body card and the dossier panel for the same body are both open, then builds it and
  Johnny reviews. Both go to D after steps 2 and 3.

## 120. C's credit and marker, D's step 2 accepted; the drawers design awaits Johnny; ship plotting notes (2026-10-05)

- **Agent C:** the credit line at 10 px (the tag size, the smallest shared text; one line in
  the column viewer and in the modal, down to a 360 px box); the marker in `--signal` teal
  with two edge rings (`--text-0` on the night 11.9:1, `--bg-0` on the day 13:1), both pairs
  and the 10 px pair in the contrast test. 696 pass. **Accepted.**
- **Agent D, step 2, item 9:** `PersonField.vue` (the quiet + on each of the 16 Passenger
  Name cells: Existing person through the K5d picker, or New person from the typed text),
  pills, `PersonCard.vue` (the one modal on the body: image or mark, name, where, summary,
  Open record, Esc), `passenger` added to the shared vocabulary ("Passenger on" /
  "Passengers", person to vessel) with its test; stored as `"Passenger Name 3"` plus
  `"Passenger Name 3 record"` in `sheet.fields`; taking a pill out keeps the typed name and
  removes the link. Crew, whose PDF section is one box, got a People row of crew pills above
  it with nothing stored in the sheet (the links are the record). Read back after a full
  reload. 8 contrast pairs. **Accepted.**
- **D confessed a `git stash` / `git stash pop`** to measure the main chunk; it round-tripped.
  Rule stands (`CLAUDE.md` 6): no git; measure by building twice or ask the orchestrator.
- **Main chunk 503.9 kB, 3.9 kB over the Vite warning.** Orchestrator's decision: not the
  limit; Agent A lazy-loads the campaign workspace and the dossier into their own chunks
  (the map is what loads first; both are reached by route or by click).
- **Item 6, the drawers design** (`findings/orbit_drawers_design.md`, six mockups): the
  header holds Play, the date readout, the campaign mark and three tabs (Time T / View Y /
  Layers L); the time row, split button and key chips leave the picture; drawers open over
  the picture with a clip-path reveal, a signal hairline and groups fading 40 ms apart;
  none under reduced motion; Esc closes the drawer first. Seven choices D1 to D7.
  **Orchestrator recommends yes to all seven**, with D3 (the key chips leave the picture
  entirely) the one for Johnny to weigh: he liked the key; D's alternative keeps a small
  read-only swatch legend bottom-left while a layer is on.
- **Johnny on the ship MVP:** sensor designators as vector wireframes (triangle, circle,
  square, rectangle, Homeworld-style) and a plotting toggle with pointer-tracking hairlines
  and coordinates, 2D; fuel and time after. Recorded as K12 point 2b.
- **Follow-up 16 (Johnny, screenshot):** the passenger + wraps under its field in a narrow
  cell and its menu opens in the flow, shifting the rows. Added to D's step 3.
- **Also (Johnny, screenshot):** the Crew People row's + menu is clipped by the section's
  overflow, only a sliver shows. Same fix: the menu floats above and is never clipped.

## 121. Pushed `e53097a`; Johnny rules yes to D1 to D7 and ship MVP first; prompts re-issued (2026-10-05)

- GitHub run green; live bundle `index-CiVJbv_3.js`. Passengers and crew as people, the
  teal marker and the credit line are in production.
- **Johnny:** yes to all seven drawer choices; the ship MVP before the toggle motion and
  the docked card. Orchestrator's order: D step 3 → the drawers build (approved; it sets
  the header where the ship list and strip will live) → the ship MVP (K6d screens, K12
  designators and plotting) → follow-ups 14, 15.
- A and D had nothing on disk: the chunk-split and step 3 prompts were never handed out;
  re-issued in full. **C** starts the ship MVP's renderer half now (`orbit/ships.ts`,
  the designators layer, the plotting overlay, stand-in ships), so D wires it after the
  drawers.

## 122. Step 3 (D) and the chunk split (A) accepted (2026-10-05)

- **Agent D, step 3:** the few-pixel x-scroll was `margin: 0 -4px` on tables that filled the
  wrap (every table 450/454); now `width: 100%` with cell gutters, and only Ammunition
  scrolls at column (450/519, six columns); folded tabs span the full width (the bar is the
  switch, the filled count at the right), the body in a grid row `0fr → 1fr` with opacity
  over `--t-base --ease-out`, inert when folded, none under reduced motion; the + sits
  inside the field's box at its right edge, and the menu, picker and new-name form are one
  fixed box on the body placed by pure `workspace/pop_place.ts` (closes on scroll, resize,
  outside press, Esc); row heights identical with it open (browser-measured; the Node test
  pins the placement rule). 3 contrast pairs; seven shots. **Accepted.** No git this time.
- **Agent A, chunk split:** main entry 503,911 → 152,971 bytes; `CampaignPanel`,
  `DossierPanel`, `BodyRow`, `BodyGlyph`, `layout` and `Icon` are chunks; the campaign and
  dossier panels load through `defineAsyncComponent` on first open and stay mounted;
  `router.ts` `beforeEnter` starts the campaign import; `OrbitView.vue` imports the dossier
  dynamically too (a static import would have put it in the orbit chunk); `vite.config.ts`
  untouched; `tests/web/bundle_size.test.js` pins the entry under 450,000 bytes. Cold load
  is entry + the preloaded Icon chunk = 345 kB. **Accepted.**
- **Orchestrator:** 707 pass / 0 fail, check clean, build green on the combined tree (an
  earlier run saw 2 failures from C's files mid-edit). C is mid-step in `orbit/`
  (`ships.ts`, `OrbitRenderer.ts`, `OrbitCanvas.vue`): push D's and A's by path.
- **Next, D:** the drawers build (D1 to D7 ruled yes).

## 123. The run on `d6c0d7a` failed (size test needs dist); fixed; C's ship layer accepted (2026-10-05)

- **Failure:** `tests/web/bundle_size.test.js` reads `apps/web/dist/index.html`; CI runs
  `npm test` before `npm run build`, so ENOENT. The orchestrator made it skip when `dist` is
  absent (§74 rule), proven with a copy pointed at an empty folder. Production unaffected.
- **Agent C, the ship picture (K12 points 1, 2, 2b):** `orbit/ships.ts` (`placeShips` over
  `positionAt`: none before the first departure, on the body while docked or after arrival,
  the straight line by fraction mid-leg with a heading; off-picture bodies skipped); the
  painter draws the marks after the bodies as one-pixel wireframes of fixed screen size
  (triangle, circle, square, rectangle; party `--signal`, vessels `--text-1`, traffic
  `--text-muted`; name to the right; no sprite); the plotting overlay draws hairlines and a
  coordinate and distance readout only for a frame given a pointer; `?campaignStandIn=`
  shows four stand-in ships in a dev build only; steady frame matches the parity shots.
  708 pass. **Accepted.** D passes real marks through OrbitCanvas's `ships` and `plot`
  props in the ship MVP step.
- D is mid-step on the drawers (`Drawer.vue`, `DrawerTabs.vue`, `HeaderClock.vue`,
  `drawers.ts`, …). Push C's files and the test fix by path.
- **Follow-up 17 (Johnny):** Campaign pressed in the orbit view routes to the map; panes
  must swap over the current view instead. The panel becomes view-independent; D and A
  settle the address shape. After the drawers and the ship MVP, or with the ship MVP if the
  orbit view needs the campaign pane for the ship list.

## 124. Pushed `3b7bcd2` (ship layer); the drawers are in and accepted (2026-10-05)

- GitHub run green on `3b7bcd2`; CI clean again.
- **Agent D, follow-up 6:** the header at rest is Play · the readout · the campaign mark ·
  Time (T) / View (Y) / Layers (L) · Keys; `Drawer.vue` (clip-path reveal over `--t-base`,
  the signal hairline, groups fading 40 ms apart by a new `--t-stagger` token; closing at
  `--t-fast`; `visibility: hidden` + inert when closed; none under reduced motion),
  `DrawerTabs.vue`, `HeaderClock.vue`, pure `orbit/drawers.ts` with tests; Time holds
  1 week, Line up, scrub, speed, the date fields and Set as campaign date; View the layout
  radios, Fit, Linear scale, Ring strength; Layers the seven chips; Esc closes drawer, then
  popover, then body, then back to the map; compact under 1,180 px, narrow under 620; a
  toast sits under an open drawer. `LayoutCorner.vue` and `MoreMenu.vue` deleted; every
  control still a command with the test; 11 contrast pairs. C's three files untouched.
  **Orchestrator:** 718 pass / 0 fail, check clean, build green, no chunk warning.
  **Accepted.** Pushable with `git add -A` (everyone between steps).
- **Next, D: the ship MVP, part 1** (the ship list and real marks through C's props, the
  status strip for the selected ship, the plotting toggle, the leg preview and write, the
  Jump button on `settings.jumpHours`); part 2 (the track on the vessel page, the jump
  bubble with C); part 3 with A (follow-up 17, panes swap over either view).

## 125. Pushed `57510d2` (drawers); deployed (2026-10-05)

- GitHub run green; live entry `index-DxgObqNt.js` is 152,971 bytes (A's split is live), the
  campaign panel is its own chunk, the orbit chunk `OrbitView-CtFISkJy.js` holds the
  drawers. **In production:** the drawers, the ship layer (no real ships until D's part 1),
  the sheet fixes, the floating menus, the lazy chunks.
- **Johnny:** "I don't see the micro animations I wanted." Follow-up 14 (the layer toggles)
  was queued behind the ship MVP; it is renderer work and D's part 1 does not touch
  `OrbitRenderer.ts`, so it goes to **Agent C now**, in parallel.
- **Follow-up 18 (Johnny):** the locked-world Day and night card ("No day and night · one
  face always points at the star" over an empty Day side / Night side strip) becomes a
  short sci-fi terminal readout "from the Scouts" and the strip is hidden. D designs with
  the existing terminal look; no new facts, only the dossier's own values.

## 126. Session close (2026-10-06, early): state at handover and the two prompts in flight

- Johnny stepped away to sleep; this session ends and a new orchestrator starts from
  `orchestrator_start_here.md` (rewritten in full). Production is on `57510d2`, green and
  deployed. Nothing finished is local except `directives/`; the handover edits go out with
  the next push.
- **In flight:** D on the ship MVP part 1; C on follow-up 14. Both prompts, verbatim, so the
  next orchestrator can check reports against them and repeat them if they were never
  handed out (`git status` tells: D's work appears under `orbit/*.vue`, `views/OrbitView.vue`,
  `workspace/`; C's under `orbit/OrbitRenderer.ts`, `tests/web/orbit_renderer.test.js`).

Agent D, ship MVP part 1:

```
Agent D. The drawers are accepted. Next: the
ship MVP, part 1, slice_2_campaign.md K6d and
K12 points 1, 2, 2b. Agent C's layer is in:
OrbitCanvas takes ships (ShipMark[] from
orbit/ships.ts placeShips over campaign/
track.ts positionAt) and plot (a pointer, or
null). Build, campaign open:
1. Ship list: the campaign's vessels whose
   track or anchor puts them in this system,
   under the strip's reserved place; the
   party's ship first; pressing one selects it
   (--signal designator); empty: "No ships
   here".
2. Real marks: feed placeShips with the
   vessels' tracks at the view's date; the
   stand-in stays dev-only.
3. The status strip for the selected ship:
   Docked at X / In orbit / In flight X -> Y,
   arrives DDD-YYYY / In jump, arrives ...,
   from positionAt; Jump at its end.
4. Plotting mode: a command and key (P), a
   toggle in the View drawer; while on, pass
   the pointer to plot; a click on a body sets
   the destination, shows a leg preview (from,
   to, departs = the view's date, arrives =
   departs + a typed duration in hours, mode
   flight, accelG from a 1-6 chooser) and
   "Add leg" writes it through appendLeg.
   Durations are typed in this step; no rule.
5. Jump: enabled when the selected ship's
   position lies outside every 100D circle
   (orbit/layout.ts has them) and a destination
   system is marked (pick it as the anchor
   editor does: map, omnibox, or "Use <last
   opened>"); writes a jump leg arriving
   settings.jumpHours later. Add jumpHours
   (default 168, the number Johnny gave) to
   CampaignSettings in packages/shared with a
   test. Signed out: none of this appears.
Exercise against the real local API with a
vessel at Regina: select, plot a flight to
Regina A-IV, see the mark move with the
scrub, jump to another system. Column, half,
full; keyboard; reduced motion; contrast
pairs; screenshots.
Do not touch OrbitRenderer.ts, orbit/ships.ts,
campaign/track.ts (ask if a helper is missing),
surface/, deckplan/. Stop and report.
```

Agent C, follow-up 14:

```
Agent C. Johnny's follow-up 14 (slice_2_
campaign.md): the layer toggles snap. Give
each a micro-animation in OrbitRenderer.ts,
"smooth, elegant, sci-fi":
- Habitable band and the 100D jump rings: grow
  out from their star when turned on, shrink
  back into it when off.
- Orbits: the same, from their primary.
- Moons and Day/night: a thin teal wireframe
  sphere (--signal, one stroke) drawn over
  each body, fading in as the layer appears
  and out as it goes.
- Scan, Paths, Mainworld: a fade.
Durations and easing from the tokens' motion
only (--t-base, --ease-out); the renderer
reads them from the computed style, no
literal ms. Reduced motion: instant. The
steady frame once the motion ends is
byte-identical to today (the parity shots
still match); the motion runs only on a
toggle, never on load. A test that a toggle
schedules a transition and that the final
frame equals the untransitioned one.
Three frames of one toggle to
findings/ui_design_shots/.
Do not touch OrbitCanvas.vue's props, views/,
TimeControls, the drawers, orbit/ships.ts.
Stop and report.
```

- **After those reports:** D part 2 (the track on the vessel page: the legs listed, remove
  the last, "Where are we" from the track; the jump bubble appearing and fading, with C if
  the renderer is needed), then part 3 with A (follow-up 17), then 15 and 18. C: free after
  14 unless part 2 needs the bubble in the renderer.

## 127. New orchestrator session; the day's plan (2026-10-06, morning)

- **New session** from `orchestrator_start_here.md`. HEAD `57510d2` equals `origin/campaign`;
  only `directives/` is modified. At 09:20 local neither D nor C had a file on disk (the §126
  prompts had not been handed out); repeated in full; **Johnny handed both out about 09:30.**
- **Plan for the day, in order:** (1) C's follow-up 14 reports first (smaller): review, push
  by path with `directives/`, Johnny sees the toggle motion live. (2) D's ship MVP part 1:
  review, the shared test for `jumpHours`, push; real ships on the orbit view. (3) D part 2
  (the track on the vessel page, the jump bubble, with C if the renderer is needed).
  (4) D part 3 with A (follow-up 17). Follow-ups 15 and 18 after.
- **Agent A, issued now (read-only):** `findings/panes_swap_design.md`, the address shape for
  follow-up 17 (today `/campaign`, `/campaign/r/:record`, `/campaign/party` render `MapView`
  in `router.ts`), the Panel host's move to the shell, back button and cold load, chunks,
  files by owner and the order of steps; so part 3 starts from a ruled shape. No edits in
  `apps/` or `packages/` while D is mid-step. The prompt, verbatim:

```
Agent A. Read-only design, no code. Johnny's
follow-up 17 (slice_2_campaign.md): pressing
Campaign in the orbit view routes to the map.
It must not: the campaign and dossier panes
swap in the one panel, over whichever view
the address names. Today router.ts gives
/campaign, /campaign/r/:record and
/campaign/party to MapView. You own the
router and the chunks; propose the address
shape. Write findings/panes_swap_design.md:
1. Two or three address shapes (a query on
   the view's route, nested routes, other),
   one recommended, with every address of
   today mapped to its new form.
2. Where the Panel host moves (the shell),
   and what MapView and OrbitView give up.
3. Back button, cold load of every address,
   old links (redirects), focus on a swap.
4. Chunks: the entry stays under 450 kB;
   which chunk each pane loads, from which
   view.
5. Files touched, by owner (yours, D's), and
   the order of steps so the tree is green
   after each.
6. What the tests pin.
Agent D is mid-step in orbit/ and views/:
edit nothing in apps/ or packages/. Stop and
report.
```

- **Agent B: held.** Nothing B-shaped is unblocked that a screen would use this week; the
  engine corrections (tier v6) start the hour F2 is answered. F2 is a confirmation: the
  table already quoted in `questions_for_johnny.md` (Frozen to -51 °C, Cold to 0 °C,
  Temperate to 30 °C, Hot to 80 °C, Boiling above), or Johnny's own.

## 128. Johnny answers F2 and G1; the engine corrections restart; the jump rules are real (2026-10-06)

- **Standing rule from Johnny:** every question for him is spelled out in full in the chat
  (start-here §2). Five were; he answered all five the same hour.
- **F2 answered:** "make it an easy array we can edit later, let's just go with these for
  now": Frozen to -51 °C, Cold to 0 °C, Temperate to 30 °C, Hot to 80 °C, Boiling above.
  Provisional, in `rules/mgt2e_climate_bands.json`. **The engine corrections are no longer
  parked.** T1.1 was done on 2026-10-04 (§65); **Agent B takes T1.2** (the plan names A; A is
  on the router): `packages/engines/src/reconcile_environment.js`, the surface classifier
  from the rules array, the orbital band reconstructed, provenance, idempotence. T1.3
  (liquids; F3 to F7 were answered yes) follows. A v6 build still needs Johnny's word.
- **G1 answered** with the book's text (fuel, jump travel, travel times, the Transit Times
  table): 100 diameters yes; Time = 2 × √(Distance ÷ Acceleration), which is what
  `calculateBaseJourneyTimes` already computes; a jump is 148 + 6D hours (the fixed 168 is
  superseded); reach is the jump number in parsecs; fuel is 10% of hull per parsec. The
  numbers are `rules/mgt2e_space_travel.json`. Checked by the orchestrator: the pasted table
  against the formula differs by more than rounding in 11 of 90 cells (at most one unit);
  the book calls the table a summary of the formulae, so the app computes.
- **Both rules files are drafts in `findings/rules_drafts/`** (git-ignored), typed from
  Johnny's words; he copies them into `rules/` and runs `npm run rules:gen`. Nothing reads
  them until he has.
- **Orchestrator's rulings on the jump rules** (`slice_2_campaign.md` K12, "Rules
  supplied"): one module computes (`campaign/travel.ts`, Agent A); the app rolls 148 + 6D
  and shows the dice, the referee may type over it; **`settings.jumpHours` is withdrawn**
  (D had added it on disk, optional with a default of 168; never pushed); the app shows
  and warns and never refuses a jump; flight durations filled from the formula and the
  arrival on the 100-diameter circle come with part 2.
- **New question G2:** which sheet fields hold hull tonnage, jump number and thrust
  (`Size`, `Jump Drive Output`, `Manoeuvre Drive Output`?). Until answered the preview
  shows parsecs and fuel as a share of the hull, with no warning.
- **Agent A's panes design is in** (`findings/panes_swap_design.md`, 377 lines): **accepted,
  shape A.** The path names the view; a `panel` query (`campaign`, `party`, `closed`; absent
  means the dossier on a hex or orbit path) and `record` name the pane; the three
  `/campaign` paths become redirects onto `/`; one `shell/PanelHost.vue` in `App.vue` is
  the only mount of the two panes, fed by a frame each view publishes; closing writes
  `panel=closed` and keeps the place; pane changes push, pans and the clock replace
  through one helper (`shell/pane.ts`). Four steps (A, D, A, A), each green; step 1 is
  pure and can start when A is free; step 2 waits for D to leave `views/`. This is ship
  MVP part 3.
- **On disk at this point:** C in `orbit/OrbitRenderer.ts`, `theme.ts` and its test; D in
  `orbit/` (`ShipStrip.vue`, `ship_list.ts`, `ship_marks.ts`, `jump_state.ts`,
  `commands.ts`), `views/OrbitView.vue`, `packages/shared` and their tests. No push yet.

Agent D, amendment to part 1, step 5:

```
Agent D, amendment to step 5 of the ship MVP
part 1. Johnny gave the rule: a jump lasts
148 + 6D hours, not a fixed 168. So:
- Take jumpHours, DEFAULT_JUMP_HOURS and
  jumpHoursOf back out of packages/shared
  and its test. Nothing about the jump
  time is stored in settings.
- The Jump preview has an hours field.
  Fill it from rollJumpHours() in
  campaign/travel.ts (Agent A is writing
  it now; it returns { hours, dice }),
  show the roll beside it ("148 + 23"),
  give a "Roll again" button, and let the
  referee type over it. The leg arrives
  that many hours after it departs.
- If travel.ts is not on disk when you
  get there, leave the field empty and
  required, and say so in the report.
  Write no 148, 168 or dice in your code.
Steps 1 to 4 as issued. Carry on, then
stop and report.
```

Agent A, the travel module:

```
Agent A. The panes design is accepted:
shape A, the panel query. Its steps start
when Agent D is out of views/. Next, a
small one, now. Johnny supplied the space
travel rules: rules/mgt2e_space_travel.json.
Run npm run rules:gen, then write
apps/web/src/campaign/travel.ts: pure, every
number read from the generated module, none
written in code.
- transitSeconds(distanceKm, accelG): the
  file's formula, 2 x sqrt(metres / (G x
  metresPerSecond2PerG)). A distance or G
  that is not finite and positive throws.
- jumpParsecsCounted(parsecs): never under
  jump.minimumParsecsCounted.
- jumpFuelFraction(parsecs) and
  jumpFuelTons(hullTons, parsecs), from
  jump.fuelHullFractionPerParsec.
- jumpWithinReach(jumpNumber, parsecs),
  from jump.parsecsPerJumpNumber.
- rollJumpHours(random) -> { hours, dice }:
  jump.durationHours.base plus that many
  six-sided dice (the book's D is roll1D
  in core/rng.js); dice is the array of
  faces. refuelHours(random) the same way.
  random is a function returning [0, 1);
  its default is a new randomUnit() in
  platform/browser.ts, not the engines'
  seeded rng.
tests/web/campaign_travel.test.js: each
function; both rolls with a fixed source;
and every cell of transitTimes against
transitSeconds, to the precision printed.
Eleven cells are known to differ by more
than rounding (for example 100,000 km at
6G: table 42 minutes, formula 43.03). List
them in the test as data, with both
values, and assert the list is exactly
those; do not bend the formula or the
table.
Do not touch track.ts, orbit/, workspace/,
views/ (Agent D is mid-step) or packages/.
Stop and report.
```

Agent B, engine corrections T1.2:

```
Agent B. The engine corrections restart:
Johnny answered F2. Read
plan_engine_corrections.md sections 0, 1,
3.1, 3.2, 3.4 and 7.1, and handoff section
65 (T1.1 is done: tests/generation/
environment_audit.js and the fixtures in
tests/golden/fixtures/engine_corrections/).
You take T1.2 (the plan names A; A is on
the router). The climate table is
rules/mgt2e_climate_bands.json; run
npm run rules:gen. Five bands in Celsius,
each up to and including its maxC, the
last open. Build:
1. packages/engines/src/
   reconcile_environment.js: a pure
   reconcileTree(tree, policy) returning
   { tree, changes, diagnostics }. No RNG,
   no clock, the input never mutated. A
   new file; no copied engine is edited.
2. The policy: a frozen object made from
   the generated rules module (the limits
   in kelvin, C + 273.15) with a version
   string. No band number written in code.
3. surfaceTempBand from a valid final
   meanTempK only. Missing or non-finite
   is an explicit unknown status. No
   default temperature.
4. orbitalTempBand reconstructed as 3.2
   says, provenance "reconstructed";
   unknown with a diagnostic when the
   inputs are missing. tempBand stays as
   the legacy alias.
5. The original values kept once in
   provenance; a second run changes no
   bytes. Only the 3.1 allowlist is
   written. Liquids are T1.3, not now.
Tests: just below, at and just above each
limit; idempotence; the input unchanged;
the Regina and Zeycude fixtures; every
field off the allowlist byte-identical.
npm test and npm run check green; the
golden parity tests untouched.
If the plan and the code disagree, or a
rule is missing, stop and ask; do not
improvise. Do not touch rules/, js/,
apps/ or any copied engine. Stop and
report.
```

## 129. Follow-up 14 (C) accepted and pushable by a rehearsed command; the MVP measures (2026-10-06)

- **Nothing from §128's list was on disk when the next reports came:** the two rules files
  were not yet in `rules/`, no `travel.ts`, no `reconcile_environment.js`, `jumpHours` still
  in `packages/shared`. The list was re-issued whole, with A's prompt changed (below).
- **Agent A's panes report:** as the file read in §128. Accepted, shape A.
- **Agent C, follow-up 14:** `OrbitRenderer.ts` (+362), `theme.ts` (`tBase`, `easeOut`,
  `cssBezier`, `easeOutAt`), one line in `OrbitCanvas.vue` (`layersBusy` keeps the canvas
  painting), one test. Habitable bands and 100D rings scale out of their star and back;
  orbit paths the same from their primary, fading; line-up panels from their own centre;
  Scan, Paths, Mainworld fade; Moons and Day/night flash one `--signal` ring over each
  world and moon while the discs themselves switch at once. Length `--t-base` (300 ms),
  curve `--ease-out`, both from the computed style; no literal; reduced motion and the
  first paint snap; a finished run is dropped before its frame is drawn, so the settled
  frame is the ordinary path. Diff read in full; C's test file 19 pass; check clean; the mid
  frame shows the band part-way out at Regina. **Accepted.**
  Two things for Johnny's eye once live, not defects: 300 ms may read as quick
  (`--t-slow` 450 and `--t-long` 800 exist); the "wireframe sphere" is one circle, not a
  sphere with meridians. One small thing for C's next visit: `keepHeld` copies every band,
  ring and path object on every frame; hold the references instead.
- **The push, by path, with a shared file.** `OrbitCanvas.vue` also carries D's in-flight
  part 1 (imports of the untracked `ship_marks.ts`), so it cannot be named (§109's trap).
  The orchestrator wrote `findings/push/fu14_canvas.patch`, the one `layersBusy` line against
  the committed file, to be staged with `git apply --cached` (index only; D's working copy
  untouched). `git apply --cached --check` passes. **Rehearsed in a scratch copy:** `git
  archive HEAD` plus C's three files plus that line: `vue-tsc` exit 0, `vite build` green
  (entry 152.97 kB), the renderer test 19 pass. The two draft rules files were run through
  `gen_rules_esm.js` there too: both wrap and import. `rules` is named in the push so the
  new files ride along once copied.
- **Johnny answers G2: the MVP measures and lets anything go.** Estimates of distance, time
  and fuel while plotting; the hull taken as 100 tons "just for MVP" and labelled; nothing
  deducted, no ship field read, no warning or refusal; vNext ties the ship's fields to
  plotting warnings and refuelling, fields to be chosen by him. `slice_2_campaign.md` K12
  "Rules supplied" point 3 rewritten; `travel.ts` loses `jumpWithinReach`, `refuelHours`,
  `jumpFuelFraction` and gains `ASSUMED_HULL_TONS`. The estimates are **ship MVP part 2**.
- **New question G3:** does a flight inside a system use fuel? The text prices jumps only.
- **Prompts:** D's amendment as in §128, unchanged. B's as in §128 with one line added
  ("If rules/mgt2e_climate_bands.json is absent, stop and say so."). A's replaced:

```
Agent A. This replaces any earlier travel
prompt. The panes design is accepted: shape
A, the panel query; its steps start when
Agent D is out of views/. Now, a small one.
Johnny supplied the space travel rules:
rules/mgt2e_space_travel.json. If it is
absent, stop and say so. Run
npm run rules:gen, then write
apps/web/src/campaign/travel.ts: pure, every
rule number read from the generated module.
- transitSeconds(distanceKm, accelG): the
  file's formula, 2 x sqrt(metres / (G x
  metresPerSecond2PerG)). A distance or G
  that is not finite and positive throws.
- jumpParsecsCounted(parsecs): never under
  jump.minimumParsecsCounted.
- jumpFuelTons(hullTons, parsecs): from
  jump.fuelHullFractionPerParsec and the
  counted parsecs.
- ASSUMED_HULL_TONS = 100, exported, with
  the comment: Johnny, 2026-10-06, a
  stand-in for the MVP until a ship's own
  fields are read. The one number in the
  file that is not from rules/.
- rollJumpHours(random) -> { hours, dice }:
  jump.durationHours.base plus that many
  six-sided dice (the book's D is roll1D
  in core/rng.js); dice is the array of
  faces. random is a function returning
  [0, 1); its default is a new
  randomUnit() in platform/browser.ts,
  not the engines' seeded rng.
tests/web/campaign_travel.test.js: each
function; the roll with a fixed source;
and every cell of transitTimes against
transitSeconds, to the precision printed.
Eleven cells are known to differ by more
than rounding (for example 100,000 km at
6G: table 42 minutes, formula 43.03). List
them in the test as data, with both
values, and assert the list is exactly
those; do not bend the formula or the
table.
Do not touch track.ts, orbit/, workspace/,
views/ (Agent D is mid-step) or packages/.
Stop and report.
```

## 130. Pushed `61d73b6` (toggle motion); ship MVP part 1 (D) accepted; D reset with a standing brief; prompts become files (2026-10-06)

- **`61d73b6` verified:** GitHub run green; the commit holds C's three files and the one
  `layersBusy` line of `OrbitCanvas.vue` (the patch staged as rehearsed); live entry
  `index-DeDBifJL.js`, orbit chunk `OrbitView-CCfO2AGS.js` holds `layersBusy`. **The toggle
  motion is in production.** The two rules files were **not** in that push: the copy
  command had not been run; `rules/` still lacks them.
- **Agent D, ship MVP part 1 (report pasted after the fact; notes in
  `findings/orbit_view_design.md` §8q):** `orbit/ship_list.ts` and `ship_marks.ts` (pure,
  8 tests), `ShipStrip.vue` (the ship list, the status strip, the destination row, the plot
  card), `jump_state.ts`, the wiring in `views/OrbitView.vue`; `OrbitCanvas.vue` gained
  `tracks`, `plotting` / `plotFrom`, a `plot` emit and `shipStatus()`; commands `orbit-plot`
  (P), add leg, jump; 8 contrast pairs. Exercised end to end against the real local API
  (list, select, plot a flight, the mark moves with the scrub, destination picked on the
  map, Jump lit outside the 100D rings, in jump). **Orchestrator on the tree:** 735 pass /
  0 fail / 9 skipped, check clean, typecheck clean, build green. **Accepted.**
  Built before the rules arrived: durations typed, the jump a fixed `jumpHours` (optional in
  `CampaignSettings`, default 168, stored by no screen). Part 2 takes it out again.
- **D's flag, accepted as interim:** a leg ends on a body, so a ship is outside every 100D
  ring only while under way; Jump from mid-flight cuts the flight ("Cut short to jump.") and
  the jump departs from the flight's destination anchor, so the mark steps to that body.
  **Ruling:** a leg end must be able to be a place in open space (the ship's true position,
  or a body's 100-diameter limit as a destination), so the jump leaves from where the ship
  is and arrives on the target's limit. A (the anchor in `packages/shared`, `track.ts`) and
  C (`placeShips`, the bubble) change the model after the measuring pass; D wires it. This
  is ship MVP part 2b.
- **Johnny resets Agent D** and asks for a prompt that gives it identity, scope and the
  manifesto. Written: **`directives/agent_d_brief.md`**, the standing brief (who D is, the
  ownership table, the manifesto as a nine-line checklist for every piece of UI, the
  reading list with D's own notes, the working method, the traps this role has hit, the
  report format). Every fresh D session reads it after `CLAUDE.md` and the manifesto.
- **Prompts are now files in `directives/prompts/`,** and Johnny pastes three lines that
  name one. It ends the lost-middle problem of long pastes and the repeating of prompts in
  chat. Issued: `d_ship_mvp_2.md` (the measuring pass: the rolled jump time and `jumpHours`
  out; the jump estimate in parsecs and fuel for an assumed 100-ton hull; the flight
  estimate of distance and time that fills the hours field; the track on the vessel page;
  commands first; nothing warns or refuses), `a_travel.md` (as §129), `b_engine_t1_2.md`
  (as §128 with the absent-file stop), `c_distance.md` (new: `orbit/distance.ts`
  `realDistanceKm` from the plan's real orbit data, null where the plan holds none; and
  `keepHeld` without per-frame copies).
- **Push called for:** the whole tree (`git add -A`) with the rules copy in front; every
  agent is between steps.

## 131. Pushed `c6b6841` (ship MVP part 1, the two rules files, the brief and prompts); deployed (2026-10-06)

- GitHub run green; live entry `index-BK15Vpn0.js` (the same hash as the local build), orbit
  chunk `OrbitView-8S6JQn58.js` holds "No ships here". **Real ships, the status strip,
  plotting and Jump are in production** (Jump a fixed 168 h until part 2).
  `rules/mgt2e_climate_bands.json` and `rules/mgt2e_space_travel.json` are committed and
  their wrappers generated locally.
- **A and B each reported a stop, "the rules file is absent":** both were handed the earlier
  prompt before the copy had run, and both stopped as told, with nothing written. Old
  reports now; the files are in place. Each needs only its paste for
  `prompts/a_travel.md` and `prompts/b_engine_t1_2.md`.
- **The fresh Agent D has started** part 2 on the step that needs nobody else:
  `workspace/TrackBlock.vue`, `track_actions.ts`, `track_rows.ts`, `RecordPage.vue`.
  It will stop at the previews if `campaign/travel.ts` (A) and `orbit/distance.ts` (C) are
  not on disk by then: A and C go out now.

## 132. A's travel module, B's T1.2 and C's distance accepted; Johnny on the toggle motion and in-system fuel (2026-10-06)

- **Agent A, `campaign/travel.ts`:** as `prompts/a_travel.md`; every rule number from the
  generated wrapper; `ASSUMED_HULL_TONS = 100`; `rollJumpHours` with an injected source,
  default `randomUnit()` in `platform/browser.ts`; the Transit Times test lists exactly the
  eleven cells the orchestrator had found (79 of 90 match). File read in full. **Accepted.**
- **Agent B, T1.2, `packages/engines/src/reconcile_environment.js`:** `environmentPolicyFrom`
  freezes the climate bands (maxC + 273.15; the last open; must rise) and the orbit table,
  and the version string is their JSON, so an edit to the rules file changes it;
  `surfaceTempBand` from a finite `meanTempK`, limits inclusive; `orbitalTempBand` from
  `orbitId` and the effective HZCO with the engine's own classifier (checked line by line
  against `getTempBand` and `toScale`, `mgt2e_world_engine.js:217-245`: identical),
  provenance "reconstructed", unknown with the missing inputs named; the original `tempBand`
  kept once; only three fields written; unchanged objects reused. File read in full.
  **Accepted.** Not yet called from generation (T1.4).
- **Agent C, `orbit/distance.ts`:** `realDistanceKm` and `realPositionAu` from the plan's
  `au` and the layout's `bodyAngle`, never the picture; null for a moon, a belt, a companion
  with no orbit of its own, a world with no numeric `au`, and pairs in different frames;
  `keepHeld` keeps references (each picture builds new objects). File read in full.
  **Accepted.** **The moon gap matters:** the mainworld is often a moon (Regina). The engines
  already compute a moon's orbit as `pd * parent.diamKm` (`mgt2e_world_engine.js:698, 2258,
  2269`), so C adds it next from that, with null where either number is absent.
- **Orchestrator on the combined tree (D mid-step):** 758 pass / 0 fail / 9 skipped, check
  clean, typecheck clean, build green.
- **Johnny on the live toggles:** the path reveal is right but a little fast; **hiding
  vanishes at once** and must be the reveal reversed; the moon ring is "super lame and
  stuttery": he wants **a wave of teal wireframe sweeping over the planet** (triangles or
  quads; two reference pictures saved as `findings/ui_design_shots/ref_fu14_wireframe_a.png`
  and `_b.png`); Day/night can be **a solid teal micro-animation**. Cause of the vanish,
  found by reading: a hide runs the shrink through `--ease-out`, so the ring is a quarter of
  its size and alpha within the first fifth of 300 ms. Recorded as follow-up 14b in
  `slice_2_campaign.md` with the rulings; `prompts/c_toggle_motion_2.md` (moon distance
  first, then the motion). D was not put in the loop: Johnny's direction was specific.
- **Johnny on in-system fuel (G3 answered):** manoeuvre drives need none; reaction drives
  need 2.5% of tonnage per Thrust per hour. New question G4: show a reaction-drive line in
  the flight estimate, and is the sum 2.5% × hull × G × hours? Until answered, a flight
  shows no fuel line; nothing is added to `rules/` or `travel.ts`.
- **Issued:** `prompts/c_toggle_motion_2.md`, `prompts/a_pane_step1.md` (A's design step 1,
  pure, touches nothing of D's), `prompts/b_engine_t1_3.md` (liquids, on Johnny's yes to F3
  and F4, with the Marches counts before and after).
- **No push called for:** nothing here shows on screen until D's part 2 uses it; the next
  push is by path when C's motion lands, or the whole tree when D reports.

## 133. D's part 2: the Track section accepted, steps 1 to 3 resumed; G4 yes; the local chart problem (2026-10-06)

- **Agent D (the fresh session) stopped correctly:** `travel.ts` and `distance.ts` were not
  yet on disk when it looked, so it built what needed neither. **Step 4, accepted:**
  `workspace/TrackBlock.vue`, `track_rows.ts`, `track_actions.ts`, one line in
  `RecordPage.vue`, five contrast pairs, `tests/web/workspace_track.test.js`: a "Track"
  section on a vessel's page between Connections and the sheet, a leg as two lines (number,
  mode in the strip's colour, from → to, G; the two dates in mono), a fold past eight legs,
  "Remove last leg" with Undo by toast, an empty state that opens the orbit view; two
  commands registered first. The column screenshot reads as part of the panel. Its report
  followed the brief's format, manifesto checklist included: the brief works.
- **D's two findings, ruled** (`prompts/d_ship_mvp_2_resume.md`): (1) the Party tab's "Where
  are we" and the party's marker read the vessel's anchor, never the track (`whereAreWe` in
  `track.ts` was called from nowhere): they now answer from the track at the campaign date,
  in the strip's own words on a flight or a jump; the marker in a jump is D's design call;
  "Move the party" on a ship with a track writes one docked leg at the campaign date and
  says why when refused. (2) An emptied track is `[]` and `whereAreWe` answered null: **an
  empty track is no track** (Agent A, `prompts/a_travel_2.md`).
- **Still anchor-only, known:** the campaign index ("records here", people aboard a ship)
  resolves anchors and ignores tracks. It joins the open-space leg end as part 2b: one step
  on "where a ship is" (A), then C's drawing and D's wiring.
- **Johnny: yes to G4.** The flight estimate shows "Manoeuvre drive: no fuel" and "Reaction
  drive: about N tons", N = 2.5% × hull × G × hours. The numbers are added to the draft
  `findings/rules_drafts/mgt2e_space_travel.json` (a `manoeuvre` block) for Johnny to copy
  over `rules/`; A adds `reactionFuelTons`; D shows the lines when it exists.
- **Why a fresh agent cannot see a system locally:** the local API's newest released truth
  is `vtest` (probed: `localhost:8787/api/truth/versions`), and the web asks the public CDN
  for its manifest, a 404. The Vite on 5173 proxies to an API that answers with
  production's versions, so it shows the chart but not a local session. The earlier D left
  no note of how it got both. **Now:** D's driver answers `GET /api/truth/versions` with
  production's; **next:** A adds a dev-only proxy rule (`VOYAGE_TRUTH_API`) in
  `vite.config.ts`, and the command goes into the agents' briefs.
- **Issued:** `prompts/d_ship_mvp_2_resume.md`, `prompts/a_travel_2.md` (reaction fuel, the
  empty track, the truth proxy; after `a_pane_step1.md`).

## 134. A's pane helper, B's T1.3 and C's motion pass accepted; a whole-tree push called for (2026-10-06)

- **State when the reports came:** the `manoeuvre` copy had not been run, D's resume and
  A's `a_travel_2.md` had not been handed out, and the D report pasted was the earlier one
  again (§133). So every agent was between steps: the tree was quiet. **Orchestrator on it:**
  779 tests, 770 pass / 0 fail / 9 skipped; check clean; typecheck clean; build green.
- **Agent A, panes step 1:** `shell/pane.ts` (`paneOf`, `withQuery`, `campaignRedirect`,
  `focusTarget`), pure, called by nothing yet; `tests/web/pane.test.js` pins the design's
  section 6. **Accepted.**
- **Agent C, moon distance and follow-up 14b:** a moon is placed at `pd * parent.diamKm`
  (null without either number); a hide is the reveal at `1 - u`, tested, with the stash
  keeping geometry for the shrink; bands, rings and paths over `--t-slow`; Moons a
  latitude-longitude wireframe in `--signal` under a wavefront crossing each disc over
  `--t-long`, the moons arriving as it passes (a solid band under 20 px across, nothing under
  8); Day/night a solid `--signal` sweep from the lit limb, covering the exchange of flat and
  shaded discs; frame gaps at Regina 10.7 ms (Moons) and 39.7 ms once (Day/night), none over
  50. The mid frames show the wireframe wave on the gas giant and the teal band on the
  disc. **Accepted**; whether it sings is Johnny's eye on the live site.
- **Agent B, T1.3:** liquids reconciled by the Q2 and Q3 picks from the generated
  `exoticLiquids` table; Marches, 9,340 bodies: 3,714 labels changed (2,555 of them
  zero-coverage bodies losing a label), B04 915 → 422, B06 → 0, **1,795 unresolved** (859 Ice
  that thaws with no eligible liquid, 593 known liquids outside their window with no
  replacement, 343 unknown exotics cleared). **Accepted with one correction, found by the
  orchestrator's own run:** of the 1,276 `hydro-invalid` blocking bodies, 701 are gas giants,
  444 belts and 118 empty orbits with no percentage and no label (nothing to validate), 11
  are mainworlds with no percentage, code 0 and no label, and 2 are gas giants with a label
  and a NaN percentage. `prompts/b_engine_t1_3a.md`: a body needs its liquid validated only
  when it has a label, a percentage (valid or not) or a code above 0; the rest get no liquid
  write. B's "1 fail" was C's renderer test in mid-edit.
- **Push called for, whole tree, with the `manoeuvre` rules copy in front**, before any
  paste is handed out. It carries C's motion, D's Track section, A's travel and pane
  modules, C's distance, B's reconciliation (called by nothing yet).
- **Issued for after the push:** `d_ship_mvp_2_resume.md` and `a_travel_2.md` (as §133),
  `b_engine_t1_3a.md`, `c_jump_bubble.md` (new: `placeShips` reports a ship entering jump
  and arriving, and the renderer draws the bubble out and in, amber, tokens' motion, the
  toggles' rules; the stand-in shows both).
- **Next for the orchestrator:** the recipe for part 2b ("where a ship is": a leg end in
  open space and on a 100-diameter circle, the index reading tracks) for A; T1.4 and T1.6
  for B from plan sections 7 and 8.

## 135. Pushed `af1ff99`; Johnny on the second motion pass, the header, the strip, the city lights (2026-10-06)

- **`af1ff99` verified:** GitHub run green; `campaign` equals `origin/campaign`; the
  `manoeuvre` block is in `rules/mgt2e_space_travel.json`; Johnny has seen the new toggles
  live. **In production:** the second motion pass, the Track section on a vessel's page,
  `travel.ts`, `distance.ts` (moons included), `shell/pane.ts`, the reconciliation module
  (called by nothing).
- **On disk, in flight:** D on part 2 (`orbit/estimates.ts`, `ShipStrip.vue`, `ship_list.ts`,
  `OrbitView.vue`, `MapView.vue`, `workspace/party_where.ts`, `PartyPanel.vue`,
  `WhereBlock.vue`, `design/units.ts`, `packages/shared` with `jumpHours` coming out); A on
  `a_travel_2.md` (`campaign/track.ts`, `travel.ts`, `vite.config.ts`). Nothing yet from B
  (T1.3a) or C (the bubble).
- **Johnny, after the push:** the toggles are "okay". Moons and Day/night should **radiate
  from the star**; the teal **pops on** and needs transparency fades; ringed planets'
  textures pop in and out and should fade; the date readout needs more right padding; "No
  ships here" wraps; a calendar-star icon "does nothing? let's remove"; and the city texture
  sits on the atmosphere layer, not the planet. Recorded as follow-ups 14c, 19 and 20 in
  `slice_2_campaign.md`.
- **The icon:** `calendar-star` at 12 px is used twice in `orbit/HeaderClock.vue`: inside the
  date readout (which opens the Time drawer) and as the **campaign mark button**
  (`orbit-go-campaign`), which does nothing while the view is on the campaign date and is a
  bare icon in the narrow form. Read as the second. Ruling: the button leaves the header;
  the command and key C stay; the way back is in the Time drawer when the view is off the
  date. Said to Johnny in one line so he can correct the reading.
- **The city lights** are in the vanilla GL path (`surface/vanilla/gl_shaders.ts`: a city
  colour in the surface shade and a `uCityHaze` term in the air; `profile.ts` `cityLight`).
  Vanilla is the legacy look by rule, so C diagnoses first: a port difference is fixed to
  match the legacy; legacy behaviour comes back to Johnny as a choice.
- **Issued:** `prompts/c_toggle_motion_3.md` (the radiating front, the alpha fades with a
  test, the ring and late-tile cross-fades, the city-light diagnosis; after the bubble if C
  has begun it, before it if not), `prompts/d_orbit_small_fixes.md` (after D reports part 2).

## 136. A's three small things accepted; the index is to follow the track (2026-10-06)

- **Agent A, `a_travel_2.md`:** `reactionFuelTons(hullTons, thrust, hours)` and
  `MANOEUVRE_DRIVE_USES_FUEL` in `campaign/travel.ts`, read from the `manoeuvre` block, the
  book's own example in the test; `trackOf` answers null for an empty list, so `whereAreWe`
  falls back to the anchor, the stored `[]` left alone; `apps/web/vite.config.ts` proxies
  `/api/truth` to `VOYAGE_TRUTH_API` when it is set, ahead of `/api`, dev server only,
  proven byte for byte both ways. Diffs read. **Accepted.** The command is in
  `agent_d_brief.md` §4: `VOYAGE_TRUTH_API=https://traveller.voyage npm run dev:web`
  (PowerShell: `$env:VOYAGE_TRUTH_API='https://traveller.voyage'; npm run dev:web`). Any
  agent that needs a local browser on the real chart uses it.
- **Issued, `prompts/a_index_tracks.md`:** one pure answer to "where is this record at this
  date" (the `locate` walk, with a vessel's track consulted at the campaign date: anchor,
  in the system mid-flight, at no hex mid-jump, the anchor before the first departure and
  with no campaign date); `whereAreWe` agrees; `rebuildCampaignIndex` takes the date. It is
  the index half of part 2b. A reads D's `workspace/party_where.ts` and reports any
  disagreement without editing it.
- **Part 2b's other half, not yet written:** a leg that ends at a body's 100-diameter limit
  (a named place on the body's ring, drawn in picture space on the ring the layout already
  makes) rather than a free point in space. A free heliocentric point was weighed and set
  aside: marks are placed in the picture's compressed space and moons are drawn at
  exaggerated orbits, so a real-space point would not land where the mark was drawn. To be
  written as a recipe for A (the anchor), C (placement and distance) and D (the destination
  choice in the plot card) once part 2 and the bubble are in.

## 137. B stops T1.3a on a real split: `hydro` is the chart's digit, `hydroCode` the generated one (2026-10-06)

- **Agent B stopped as told** ("if two fields disagree about the code, stop"): on 337
  Spinward Marches mainworlds `hydro` equals the hydro digit of `uwp` (the chart) and
  `hydroCode` equals that of `uwpSecondary` (the generated physical world), for example
  Esalin 1004: `hydro` 5, `hydroCode` 10, UWP C565673-8, secondary C5AA673-8. No other body
  type splits. This is the plan's B01 / B03 in two stored fields, Tier 2's to repair.
- **Ruling (an implementation detail, not a Traveller rule):** for "does this body have a
  liquid to validate", either code above 0 counts, beside a label or a stored percentage.
  Tier 1 picks no winner and changes neither field. It alters no Marches answer (every
  split has a percentage and a label). `prompts/b_engine_t1_3a_resume.md`.
- **For Johnny's eye, no decision needed:** the eleven mainworlds with no percentage, both
  codes 0 and no label are Bowman 1132, Caliburn 1430, Zaibon 1825, Glisten 2036, Shionthy
  2306, Rhise 2317, Gandr 2425, Macene 2612, Robin 2637, Gitosy 2918, Patinir 3207 (UWP
  size, atmosphere and hydrographics all 0, but for Rhise's size 1): nothing to validate.
  Two bodies typed Gas Giant carry the label "Water" and a percentage stored as
  `{"$num":"NaN"}`: Condaria A-II-b (0528) and Dawnworld A-VI-a (1531); they keep a blocking
  diagnostic and go on Tier 2's list as a generation defect.

## 138. The jump bubble (C) accepted (2026-10-06)

- **Agent C, `c_jump_bubble.md`:** `placeShips` no longer draws a jump as a line to a body
  that is not on the picture. While a jump is in progress the system it leaves gets a mark
  with `jump: 'out'` at the point it left, and the system it reaches gets `jump: 'in'` at
  `to` until arrival; every other mark omits the field, so `ShipMark[]` and D's callers
  compile unchanged. The renderer runs two thin `--attention` rings over `--t-long` out and
  `--t-slow` in, on the frame the clock or a scrub crosses the moment, reversed on a scrub
  back, never on first paint, snapping under reduced motion; `OrbitCanvas.vue` untouched.
  The dev stand-in gains Outbound and Inbound on a 16-second loop. The `ships.ts` diff read;
  `orbit_ships` and `orbit_renderer` tests 24 pass; the mid frames show the amber rings with
  the designator fading inside. **Accepted.**
- **One thing for D, added to `prompts/d_orbit_small_fixes.md` as item 4:** a mark with
  `jump` set is the bubble's, not a ship on the picture; `shipStatus`, `ship_marks.ts` and
  the plotting "from" must pass over it.
- **No push:** the bubble rides with D's part 2 (D is mid-step in files that import
  `ships.ts`). **Next, C:** `prompts/c_toggle_motion_3.md` (Johnny's notes on the second
  motion pass, and the city-light diagnosis).

## 139. D's part 2 accepted but for one line; no push until A and B report; D on paper meanwhile (2026-10-06)

- **Agent D, part 2 (resumed):** step 1, the jump time rolled (`jumpHours` and its helpers out
  of `packages/shared`; the preview's Hours field from `rollJumpHours`, the roll shown,
  Roll again, typed over stays); step 3, the flight estimate (`orbit/estimates.ts`: distance
  from `realDistanceKm`, time from `transitSeconds`, the hours field following the G chooser
  and the destination until typed over, a control back to the estimate, "Manoeuvre drive:
  no fuel" and "Reaction drive: about N tons · 100-ton hull assumed"); the Party tab from
  the track (`workspace/party_where.ts`: the place, or the strip's words mid-flight and
  mid-jump; the marker in the leg's system on a flight and, D's call, held at the system the
  ship left with an "in jump" tag; "Move the party" writing a docked leg with Undo, refused
  in plain words under way or with a later leg). Exercised on the real chart through a
  driver that answered `/api/truth/versions` with production's. **Orchestrator:** D's five
  test files 28 pass, check clean, build green; `k12b_plot_estimate.png` shows the card with
  the estimate, the G chooser and both fuel lines, in the view's look. **Accepted.**
  D's one failing test was C's renderer file in mid-edit.
- **Stopped, correctly: step 2** (the jump's parsecs and fuel). The browser has no hex
  distance: `apps/web` may not import the engines (the checker), and `map/geometry.ts` has
  `toGlobal` but nothing that measures. `prompts/a_hex_distance.md`: `hexDistance` ported
  with a parity test against the engines' `getHexDistance`, and `parsecsBetween` over two
  hex keys and the overview's sector positions. One hex is one parsec, from Johnny's text.
- **D's questions:** (1) the hex distance, above. (2) **For Johnny, G5:** the reaction-drive
  line reads "about 1,424 tons" for a 100-ton hull on a 35 AU flight at 2 G, because the sum
  charges thrust for every hour. (3) Before a track's first departure: the anchor, already
  in A's index step. (4) "Move the party" does not write the anchor when there is a track;
  A's index step makes "Records here" follow the track.
- **Why no push now:** A's index step is in flight and has already edited
  `packages/shared` (a `LocateAt` hook on `locate`), the same two files D's `jumpHours`
  removal changed; B is in `reconcile_environment.js`; C is in the renderer. D's part 2
  cannot be split out by path. **Plan:** D gets a paper-only step now
  (`prompts/d_design_15_18.md`: the decision on the docked body card, and the Scouts
  terminal readout for a locked world, to `findings/` only), so the tree holds still; when A
  and B have reported and are accepted, **push by path everything except C's five files**
  (`orbit/OrbitRenderer.ts`, `orbit/ships.ts`, `orbit/theme.ts`,
  `tests/web/orbit_renderer.test.js`, `tests/web/orbit_ships.test.js`), rehearsed first.
  Then D gets `prompts/d_orbit_small_fixes.md`, which has grown to seven items (the readout
  padding, "No ships here", the campaign mark out, jump marks passed over, the plot card's
  title wrapping inside a name, the vessel's Where block from the track, the parsecs line).
- D confessed one read-only `git status`; told again, no git.

## 140. Johnny: drive tables, "keep it easy", and holographic outlines of where the bodies will be (2026-10-06)

- **Asked how the reaction-drive line should read when it passes the hull (G5), Johnny
  pasted the book's drive text instead:** the Thrust Potential tables (reaction drive
  ratings 0 to 16 at 1% to 32% of hull, TL 7 to 12; manoeuvre drive ratings 0 to 11 at 0.5%
  to 11%, TL 9 to 17; jump ratings 1 to 9 at 2.5% to 22.5% of hull plus 5 tons, TL 9 to 18),
  MCr2 and MCr0.2 per ton, thrust adding together, reaction thrust uncompensated. None of it
  is a fuel rule and none is used by the MVP. Kept, so it is not lost, in
  `findings/rules_notes/mgt2e_drives.json` (**not** in `rules/`, read by nothing; out of
  `rules_drafts/` so a wildcard copy cannot carry it in). He added: a supplement he does not
  have yet ("Cluster Truck") has more rules, "so let's just keep it easy for now, knowing we
  might change some stuff up".
- **G5, taken as the recommended option** since he did not pick: over the assumed hull, the
  line reads "Reaction drive: more than the ship's tonnage". Item 8 of
  `prompts/d_orbit_small_fixes.md`. Told to Johnny as the orchestrator's pick.
- **New, follow-up 21:** "when plotting courses, we're going to want to know where the
  planets will be at that time … holographic outlines of the celestial bodies of where they
  would be at that time so the user can plot their location correctly." What follows from
  it, kept easy: ghosts at the previewed arrival; the preview's flight line to the
  destination's ghost; the estimate measured to where the destination will be (a few rounds
  of the same sum); a ship under way drawn on the straight line from where it left to where
  the destination will be. **D designs it first**, as section 3 of the paper step
  (`prompts/d_design_15_18.md`, not yet handed out when this was added): the look, what C
  must draw and be given, what D wires. C builds after its third motion pass.
- Johnny asked, before sending prompts, whether any needed updating: those two were.

## 141. A's index and hex distance accepted; a rehearsed by-path push; Agent E joins for the dossier pages (2026-10-06)

- **Agent A, the index follows the track** (report not pasted; read from disk):
  `campaign/place.ts` `placeAt(id, records, days)` walks through `locate` with a new
  `LocateAt` hook in `packages/shared` (callers that pass none keep the old walk): a vessel
  with a track is placed by `positionAt` at the date; a flight is in the departure system at
  no body; a jump is in no hex and says its two ends and its arrival; before the first
  departure, and with no date, the anchor. `rebuildCampaignIndex` takes the campaign date at
  its three call sites. `whereAreWe` answers the anchor before the first departure.
  **Agent A, hex distance:** `hexDistance` (the engines' arithmetic, copied as `hexAt` was;
  3,485 pairs equal to `getHexDistance`) and `parsecsBetween(hexKeyA, hexKeyB, sectorAt)` in
  `map/geometry.ts`; Regina 1910 to Feri 2005 is 5. A sector's grid position is `x`, `y` on
  `SectorOverview`. Code read. **Both accepted.**
- **The push, by path, rehearsed.** 32 files listed in `findings/push/part2_files.txt`: D's
  part 2, A's `a_travel_2`, index and hex-distance work. Left out: C's in-flight
  `orbit/OrbitRenderer.ts`, `ships.ts`, `theme.ts`, `tests/web/orbit_renderer.test.js`,
  `orbit_ships.test.js`, `orbit_fixture.js`; B's in-flight `reconcile_environment.js` and
  its test. **Rehearsal in a scratch copy** (`git archive HEAD` plus exactly those 32 files):
  `vue-tsc` exit 0, `vite build` green, the whole suite 802 tests, 791 pass, 0 fail, 11
  skipped. `git add --dry-run --pathspec-from-file` lists the 32. Command given to Johnny:
  `git add --pathspec-from-file=findings/push/part2_files.txt; git add directives; commit;
  push`. Safe while A is idle and D is on paper; E's files are not in the list.
- **Agent E (medium effort), offered by Johnny** for an analysis he approved of the two
  sidebars (kept verbatim in `findings/dossier_identities_analysis.md`): follow-up 22.
  `prompts/e_dossier_identities.md` is self-contained: who E is, what to read (the manifesto
  checklist, traps and report format of `agent_d_brief.md` §3, §5, §6), **a closed file list**
  (`dossier/` but for C's `DayNight.vue`; `orbit/card.ts`; `orbit/BodyCard.vue`;
  `tests/web/dossier_model.test.js` and new tests), everything else forbidden by name, no
  git, and the build: the system page ("Regina system", the ribbon as a link, a mainworld
  callout in place of the lead map, the chart rows without the ten decoded ones, the
  socioeconomics headline, a pointer to the jump times), the world page (the only decoder;
  the same fallbacks for trade codes and zone; the mainworld's gains the socioeconomics
  profile; a "nothing lost" test), the card split into "now" and "survey" behind an optional
  `surveyElsewhere` prop that E does not wire. Partial hexes and a mainworld that cannot be
  opened keep today's rows.
- **No collisions by construction:** D's paper step lost its item on follow-up 15 (settled
  by the analysis) and D's queued fixes gained item 9 (pass `surveyElsewhere`); C's
  `DayNight.vue` and D's `contrast.test.js` are closed to E, which reports any pair or prop
  it needs. A's later panes step 3 touches where the panes are mounted, after E.
- **A is free.** The part 2b recipe (a body's 100-diameter limit as a place) is still owed.

## 142. Pushed `556b380` (part 2); B's T1.3a and C's third motion pass accepted; the city lights are the legacy's (2026-10-06)

- **`556b380` verified:** GitHub run green; `campaign` equals `origin/campaign`. **In
  production:** the flight estimate with both fuel lines, the rolled jump time, the Party tab
  and marker from the track, the index following the track, `parsecsBetween`, the truth
  proxy for local dev.
- **Agent B, T1.3a (a new report, not an old one):** `needsLiquidValidation` is a label, a
  stored percentage (number or not), or either code above 0; the rest get no liquid write.
  Marches: 8,066 validated, 1,274 left alone, 2 blocking; unresolved 1,795 as before; 337
  mainworlds with `hydro` and `hydroCode` different, beside the audit's B01 and B03 at 387.
  Its test file 7 pass. **Accepted.**
- **Agent C, follow-up 14c:** one front leaves each star over `--t-long` and each body's
  sweep starts as it arrives, over `--t-slow`, entering at the limb facing its star; a hide
  is the same line backwards; Moons and Day/night run linearly across the two tokens
  (`--ease-out` crushed the inner sweep); teal alpha is a sine, zero at both ends, with a
  tested step limit (`TEAL_STEP`, one 60 fps frame of a `--t-slow` sweep); a faint
  `--signal` ring marks the front; flat and shaded rings trade over the body's sweep; a late
  tile fades over `--t-base`; 8.5 ms frames at Regina. The mid frame shows the wireframes on
  the gas giants. **Accepted;** Johnny judges it live.
- **Agent C, the city lights (follow-up 20), diagnosed, nothing changed:** the legacy GL disc
  does the same. `surface/vanilla/gl_shade.ts` paints the city colour into the surface by
  day, the night lights under the clouds at `1 - cloud * 0.6`, a limb term, and the air halo
  adds `uCityHaze` on the night-facing shell; `tests/web/surface_gl.test.js` requires the
  shader source to equal `js/planet_gl.js`. A fix is a deliberate difference from the
  legacy: **question G6 for Johnny.**
- **Orchestrator on the tree** (only B's and C's eight files modified, so the tree is the
  commit): 806 tests, 797 pass / 0 fail / 9 skipped; check clean; typecheck clean; build
  green. **Push by path** from `findings/push/motion3_files.txt`, with `directives`.
- **Issued:** `prompts/b_engine_t1_4.md` (the reconciliation as `generateHex`'s last step
  behind an option that is absent by default, so no existing output or test changes; equality
  with the standalone transform; schema support), `prompts/a_panes_steps_2_4.md` (A builds
  the rest of its own panes design, step 2 included, while D is on paper; `dossier/` and the
  card closed to it because E is in them), `prompts/c_plot_readout.md` (the plotting
  readout in AU from the primary and real distance from the selected ship, through an
  inverse of the picture's compression in `distance.ts`).
- **D's order after its paper step:** A must have reported the panes steps first, because
  D's queued fixes touch `OrbitView.vue` and `WhereBlock.vue`.

## 143. Pushed `729e74b`; Johnny rules the city lights are to differ, and to be spectacular (2026-10-06)

- **`729e74b`** (motion pass 3, the jump bubble, the liquids correction): `campaign` equals
  `origin/campaign`; the GitHub run was in progress when checked. A, B and C have their
  next pastes (`a_panes_steps_2_4.md`, `b_engine_t1_4.md`, `c_plot_readout.md`); D and E are
  in flight.
- **G6 answered: differ from the old app,** "but it needs to look sci-fi and incredible,
  beautiful, glowy, spectacular, it really needs to inspire awe and wonder and capture
  sci-fi city feel from space, like 'oh, I want to visit there or go there'".
- **Ruling on how:** vanilla stays the legacy shader exactly (`surface_gl.test.js`
  untouched); the new lights are the first piece of the **enhanced disc** (today the orbit
  painter draws the vanilla GL disc in both modes; `surface/preferences.ts` defaults to
  vanilla). Lights on the surface only, under the cloud, no city colour on the air shell or
  the limb; driven by what drives them today (`cityLight` by tech level, the urban mask by
  population); no new Traveller fact. **Design first, on paper:**
  `prompts/city_lights_design.md` (the look in words and frames, the passes, the
  parameters, C's steps, three choices at most).
- **Two questions for Johnny (G7):** un-park Agent F for the design (recommended; it is the
  hard visual design F is kept for; C builds); and make Enhanced the default look
  (recommended; otherwise he will not see it without a command).

## 144. D's two designs accepted: the Scout Survey readout and the ghosts (2026-10-06)

- **Agent D, on paper** (`findings/` only; mockups drawn over the running screens):
  - **Follow-up 18, `findings/daynight_locked_design.md`:** for a locked world the strip is
    replaced by a "SCOUT SURVEY" readout in a `--bg-2` well with `--signal` mono values
    (ROTATION: LOCKED, DAYSIDE: PERMANENT, NIGHTSIDE: PERMANENT, SOLAR DAY: NONE, TWILIGHT
    ZONE: YES when the dossier has that row, YEAR), each line naming the field it reads;
    types on once in about 440 ms, never under reduced motion, no blinking cursor. Two
    alternatives (with a half-lit disc; one line). `fu18_column.png` looked at: it sits in
    the panel as if it had always been there.
  - **Follow-up 21, `findings/plot_ghosts_design.md`:** a ghost is a thin dashed outline of
    a body at the previewed arrival with a dotted arc of its orbit leading to it; the
    destination's is amber with a tag ("A-II · 148-1105 05:15"); the flight line runs from
    the ship to the destination's ghost; the estimate settles to the ghost in about three
    rounds (`settleFlight`, "roughly" if eight do not agree); a ship under way runs the
    straight line from where it left to where the destination will be; one new canvas prop,
    `preview: { toKey, departs, arrives }`; no new command, token or stored field; a
    five-step order (C, D, C, C, D). **Both accepted as written.**
  - D had begun follow-up 15 before the prompt changed; its `fu15_*` shots are superseded
    by the approved analysis (Agent E).
- **Four choices D raised for Johnny, each standing at D's recommendation until he answers:**
  the readout alone; no High or Low temperature beside DAYSIDE and NIGHTSIDE (the dossier
  does not say which side each belongs to, so placing them would be a rule); ghosts for the
  destination and any world that will visibly move; amber for the destination's ghost with
  the selection lock at half strength while a preview is open.
- **Issued:** `prompts/d_fixes_now.md` (items 1, 2, 3, 4, 5 and 8 of the queued fixes, none
  in A's or E's files, and `settleFlight` pure and unwired; items 6, 7 and 9 and the wiring
  wait for A's panes report), `prompts/c_ghosts.md` (after the readout: the two-date
  distance, the ghosts and flight line from a `preview` prop that is C's only edit to
  `OrbitCanvas.vue`, `placeShips` on the straight line, and the locked-world card in
  `DayNight.vue`).

## 145. T1.4 (B) accepted; T1.6 issued (2026-10-06)

- **Agent B, T1.4:** `generateHex` takes an optional `policy`; absent, it returns what it
  did; present, it returns `reconcileTree(envelope, policy).tree` after every other write,
  with `changes` and `diagnostics` as non-enumerable properties so the canonical bytes are
  the tree's alone; `buildSector` and `buildSectorSlice` pass it through, off by default; no
  caller switched on. `tests/generation/generate_hex_reconcile.test.js` covers the Regina
  flesh, top-down bare and society-expand inputs and a bottom-up-mode call, with the input
  deep-frozen and `Math.random` and `Date.now` throwing. No schema changed: `TreeEnvelope`
  (`packages/shared/src/schemas/hex.ts`) types `body` as an open record and no truth or API
  schema describes world bodies. Diff read; the generation tests 56 pass. **Accepted.**
  Noted by B: MgT2E `generateHex` goes through `buildOne` and never calls
  `generateMgT2ESystemBottomUp`.
- **Issued, `prompts/b_engine_t1_6.md`:** the derived build (`apps/api/src/jobs/
  truth_build.ts` `deriveSector`) gains a named transform, `reconcile-environment`: each
  source tree through `reconcileTree`, a new object only when bytes change, provenance
  recorded beside the source's (source version, transform, policy digest, rules digest), the
  matching-provenance safeguard extended by name and not relaxed, a report beside the truth
  files, resume and a no-op second run, the result staged and never released by the job.
  Proven on the local Worker with the black-box suite; **no production command**; B writes
  out, without running, what a v6 shadow build would need.
- The D report pasted with this one was the paper-designs report again (§144).

## 146. Agent E's dossier split accepted; a rehearsed by-path push of E's and B's work (2026-10-06)

- **Agent E, follow-up 22:** the system page is "Regina system" (a nameless hex keeps its
  hex): the UWP ribbon as the page's only UWP and a link to the mainworld, a one-line
  callout with the old map-badge words and the Mainworld button in place of the lead map,
  the chart rows without the ten decoded ones, "100D jump times are on the mainworld page.",
  the socioeconomics headline as a card, the stellar lines and the tree. The world page
  alone decodes the UWP and shows the map; the mainworld's place line is "Mainworld of the
  Regina system · 1910" and it gains the socioeconomics rows; the same trade-code and
  travel-zone fallbacks; a test over every Spinward Marches system whose mainworld opens
  that each of the ten rows is on the mainworld's page with the same text. A partial hex
  and a mainworld that cannot be opened keep today's rows. `cardFor` returns `now` and
  `survey` beside the unchanged `lines`; `BodyCard.vue` takes an optional `surveyElsewhere`
  that nothing passes yet. Only its eight files changed. The report followed the brief's
  format with the checklist. `fu22_system_column.png` looked at: a system page that reads as
  a system. **Accepted.** E's two notes go to D: the design page's samples (item 10 of the
  queued fixes) and the prop (item 9).
- **The push, by path, rehearsed:** `findings/push/dossier_files.txt` (E's eight files and
  B's T1.4: `packages/engines/src/index.js`, `packages/generation/src/index.ts`,
  `tests/generation/generate_hex_reconcile.test.js`). Left out, in flight: A's panes
  (`shell/pane.ts`, `views/MapView.vue`, `tests/web/pane.test.js`, more to come) and C's
  readout (`OrbitRenderer.ts`, `ships.ts`, `distance.ts`, three tests). Scratch copy of
  `HEAD` plus those eleven files: `vue-tsc` exit 0, build green, the whole suite 807 tests,
  796 pass, 0 fail, 11 skipped.
- **Issued, `prompts/e_climate_fields.md` (T1.5, the plan gave it to D; E has the files):**
  the world page and the orbit card show "Climate" from `surfaceTempBand` and "Orbital
  zone" from `orbitalTempBand` when a body carries them, say "not classified" when the
  status is unknown and never fall back to the old `tempBand` then, show a body without
  the new fields exactly as today, and treat liquid statuses honestly; one pure function
  used by both; no Kelvin table in the web app; tests run `reconcileTree` over the dossier's
  fixtures.

## 147. Johnny: F designs the city lights; Enhanced is the default look; the dossier push has not run (2026-10-06)

- **G7 answered:** Agent F has `prompts/city_lights_design.md` (paper only;
  `findings/city_lights_design.md` was already on disk when checked); **Enhanced becomes
  the default look**, a stored choice of Vanilla still honoured. The flip is Part 0 of
  `prompts/c_ghosts.md` (`surface/preferences.ts` is C's), with a test for each case.
- **The push called for in §146 had not run:** HEAD was still `729e74b`. The eleven files of
  `findings/push/dossier_files.txt` were compared with the rehearsed copy: identical, so
  the same command is still the rehearsed commit. E's next step (T1.5) edits the same
  dossier files, so **the push must run before E starts**, or be rehearsed again.
- **On disk, in flight:** A's panes (`views/`, `components/OmniBox.vue`, eight `workspace/`
  files, `shell/pane.ts`), C's readout. D's fixes not begun.

## 148. F's city-lights design accepted; C's readout accepted; the work re-dealt so C can build the lights (2026-10-06)

- **Agent F, `findings/city_lights_design.md`** (paper only; two SVG concept boards and
  their generator): the look is core → district → connecting thread → darkness: warm-white
  cores with restrained neon at high tech (Rhylanor), amber clusters at low tech (Pavabid),
  a few points in the dark where few live (Cantrel); soft local glow through thin cloud and
  none through thick; lights rising smoothly across the twilight band; the day side's built
  ground matching the night's lights. The approach: a **separately linked enhanced program**
  under `surface/enhanced/` (vanilla byte-identical, its test untouched); an enhanced-only
  cube C baked in the worker from the existing urban mask (RGB city emission, A core
  strength), box-averaged mips; per-frame terms that sample the ground at ground spin and
  cloud at cloud spin, with cloud transmission, a night ramp and a limb gate; glow from two
  broader mip levels of C, clipped to the disc; `uCityHaze` and the halo's city colour gone;
  the downport under the same gates; static light in the first version; a parameter ledger
  that keeps every `cityLight` value; a cost ledger with byte counts and the 50 ms line;
  **five build steps, each ending in named frames of the same three worlds** at 002-1105.
  No choices for Johnny. **Accepted as written.** GPU cost is unmeasured, as F says.
- **Agent C, the plotting readout:** an inverse of the picture's compression in
  `orbit/distance.ts`; the hairline reads AU from the primary and, with a ship, real
  distance from it; blank inside the star's hole, in line-up layouts and past the scale; a
  pointer within 14 px of a body reads that body's own place. Rehearsed green (below).
  **Accepted.** Noted by C: a ship mid-flight is measured from the inverse of its picture
  point; true AU would need its real place passed in (it comes with the ghosts' straight
  line).
- **The work re-dealt,** since the lights are a five-step job in C's own code:
  **C** takes Enhanced-as-default and the city lights (`prompts/c_city_lights_1.md`: Part 0
  and step 1 only); **A**, after its panes report, draws the ghosts in the renderer
  (`prompts/a_ghosts.md`, from D's note); **E**, after T1.5, builds the locked world's card
  (`prompts/e_daynight_locked.md`; `DayNight.vue` and `daynight.ts` pass to E for that
  step). `prompts/c_ghosts.md` is overwritten with a "superseded" note that points each
  agent to its own file.
- **The push, widened and rehearsed again:** `findings/push/dossier_readout_files.txt`, 17
  files: E's eight, B's three (T1.4), C's six (the readout). The earlier eleven-file push
  had still not run (HEAD `729e74b`). Scratch copy of `HEAD` plus the 17: `vue-tsc` exit 0,
  build green, 809 tests, 798 pass, 0 fail, 11 skipped. A's panes (in flight in `App.vue`,
  `router.ts`, `shell/`, `views/`, `components/`, `workspace/`) are not in it.

## 149. Pushed `4c450c1`; A's panes swap accepted, with the signed-in pass still owed (2026-10-06)

- **`4c450c1`** (the dossier split, the readout in real units, the generation hook): GitHub
  run green; `campaign` equals `origin/campaign`. C and E have their next pastes.
- **Agent A, panes steps 2 to 4 (follow-up 17):** `shell/pane.ts` gains `addressPane` (a set
  `panel` wins over a legacy path), `atPane`, `escapePane`; `shell/frame.ts` and
  `shell/PanelHost.vue` (the only importer of the two panes, both kept mounted after first
  open, focus by `focusTarget`, Esc by `escapePane`); `App.vue` is the full-viewport `.app`
  round the router and the host; the views publish a frame and mount no pane; `router.ts`
  loses the three campaign routes and `preloadCampaign`, gains the redirects and a
  `beforeEach` preload; every address push in `workspace/` and `OmniBox.vue` goes through
  the helpers. Entry 129,372 → 160,164 bytes (the host is in it; the panes stay chunks).
  A's browser pass, signed out: every cold load of the address tables, the redirects with
  Back not stopping on `/campaign`, **Campaign in orbit stays in orbit**, Back and Forward,
  a pan and a scrub keep the pane, the dossier and Rail focus cases.
  **Orchestrator:** the tree held only A's 18 files: 812 tests, 803 pass, 0 fail; check
  clean; build green. `PanelHost.vue` and the helpers read. **Accepted.**
- **Not seen by anyone: the signed-in screens.** A's `dev_make_admin.js` token answered 401,
  so the campaign list, a record, the Party tab and their focus cases were never on screen.
  The host passes `CampaignPanel` the same `record-id` and `tab` as before, from the
  address; the risk is judged small. **Pushed on that basis**, with Johnny asked for a
  one-minute signed-in look on the live site, and the full signed-in pass issued to D
  (`prompts/d_after_panes.md`, with items 6, 7, 9 and 10 of the queued fixes).
- **A's finding in E's file:** `dossier/DossierPanel.vue` pushes the orbit path with no
  query (about line 222), dropping the clock and the pane. Added to
  `prompts/e_daynight_locked.md`.
- **The push:** by path from `findings/push/panes_files.txt` (A's 18), with `directives`.
- **Next, A:** `prompts/a_ghosts.md`.

## 150. Pushed `1168503` (the panes swap) (2026-10-06)

- `campaign` equals `origin/campaign` at `1168503`. On disk since: only E's T1.5
  (`dossier/DossierOverview.vue`, `dossier/model.ts`, `orbit/card.ts`). Nothing yet from A
  (ghosts), B (T1.6), C (city lights step 1) or D (the six fixes).
- The B report pasted at this point was T1.4 again (accepted §145, pushed in `4c450c1`).
  B's next is still `prompts/b_engine_t1_6.md`.
- Johnny was asked for a one-minute signed-in look at the live panes; no word yet.

## 151. D was handed the second prompt without the first; one combined step, the signed-in pass first (2026-10-06)

- D received `d_after_panes.md` but never `d_fixes_now.md`, read the tree, saw none of the
  first prompt's work, and stopped with a question of order. Correct.
- **Ruling (orchestrator; Johnny may overrule):** both in one session with one report,
  `prompts/d_combined.md`: (1) the signed-in pass over the live panes, stopping at once on
  anything badly wrong; (2) the six fixes and `settleFlight`; (3) items 6, 7, 9, 10. The
  first prompt's restriction on A's files is lifted (the panes are pushed). `OrbitCanvas.vue`
  is touched by A (the `preview` prop) and by D (fix 4) at once: D re-reads before each edit
  and lists its lines.

## 152. Johnny: the live panes are fine signed in; D's visible fixes go first (2026-10-06)

- **Johnny on the live site, signed in: "all fine"** for the campaign list and a record,
  the Party tab, and Campaign pressed in the orbit view staying in orbit. The signed-in gap
  of §149 is closed for the screens; the focus cases and the signed-in cold loads are still
  unseen and stay in D's queue, last.
- He sent a screenshot of the orbit header and strip as they are live (the readout's text
  against its right edge, the calendar-star button, "No ships here" on two lines): not yet
  built, because D never had that prompt. Asked, he said to flip the order.
- **`prompts/d_visible_first.md` replaces the order of `d_combined.md`:** Part 1 is items
  1, 2, 3, 5 and 8 of the queued fixes (everything he can see), then **stop and report so
  it can be pushed**; Part 2, on a second paste, is item 4, `settleFlight`, items 6, 7, 9,
  10 and what is left of the signed-in pass.

## 153. T1.5 (E) accepted (2026-10-06)

- **Agent E, `e_climate_fields.md`:** `climateDisplay(body)` in `dossier/model.ts`, used by
  the world page's Physical section and by `orbit/card.ts`: with either new field present
  the page shows "Climate" and "Orbital zone" (the body's own words, or "not classified")
  and drops "Temperature band"; without them the page and the card are byte for byte what
  they were. The dossier files show no liquid at all today, so nothing was added for
  `liquidStatus`. A source scan in the test rejects a Kelvin threshold, the climate-band
  module or an engines import in the dossier and the card. Its test file 3 groups pass;
  the function read. **Accepted.** Not seen on a screen (no reconciled world is released,
  and a fixture screen needs a file that is not E's).
- **E's question, recorded for C:** `surface/profile.ts` has `tempBandFromKelvin`, and
  `surface/identity.ts` falls back to it; the plan says no renderer threshold stands in for
  the classifier. The surfaces must read `surfaceTempBand` when a body has it. To be issued
  to C before a v6 is built, after the city lights' first steps.
- **On disk, in flight:** D has begun the signed-in pass (it was handed `d_combined.md`
  before the flip) and is fixing the panes: `shell/PanelHost.vue` (a key pressed inside a
  pane now goes to the view, as before the move; focus asked again while a pane is still
  arriving), `shell/frame.ts`, one line each in the views. `dossier/DossierOverview.vue`
  carries an indentation-only change nobody reported; E is asked about it in its next
  prompt.
- **Next, E:** `prompts/e_daynight_locked.md` (the Scout Survey card, the orbit push that
  drops the query, the stray indentation).

## 154. Johnny's own edit: Explore orbits beside the Mainworld button (2026-10-06)

- The "stray indentation" in `dossier/DossierOverview.vue` (§153) was **Johnny's own edit**:
  he had moved the Explore orbits block into the mainworld callout. He then asked the
  orchestrator directly to put the button to the right of the Mainworld button. Done by the
  orchestrator, on his instruction, in that one file: the two buttons are a pair in
  `.doss-callout-actions` (Mainworld, then Explore orbits; they wrap together, tokens
  only), and the button keeps its old row at the top when there is no callout
  (`!model.holdLead`: a partial hex, or a mainworld that cannot be opened), so no system
  loses it. Check clean, `vue-tsc` exit 0, the dossier test passes. Not looked at in a
  browser.
- `prompts/e_daynight_locked.md` now tells E to leave that file's template alone (it had
  been told to "put the block back").

## 155. D's Part 1 accepted with two panes fixes; a patch-snapshot push, rehearsed (2026-10-06)

- **Agent D, Part 1 of `d_visible_first.md`:** the readout's right gap 2.4 px → 9.4 px
  (narrow) and 13.4 → 14.4 (wide), the fixed-width rule kept; "No ships here" on one line
  at every width, right-aligned like the column it hangs in; the campaign mark button out
  of the header, the readout's calendar icon teal on the campaign date and amber off it,
  "Go to DDD-YYYY" in the Time drawer beside "Set as campaign date" only when off the date,
  key C kept, the held scrub still moving nothing; the plot card's title on one line with
  the dates beneath, the card one width for every destination; "Reaction drive: more than
  the ship's tonnage" above the assumed hull, tested either side. Three contrast pairs;
  17 `fu19_*` shots. **Two panes fixes found signed in:** keys pressed inside a pane did
  nothing (the panes are no longer inside the view's element, so the keydown never reached
  it; the frame now carries a key handler), and the list search was not focused when the
  campaign first opened (the host gave up after two frames; it now asks until the element
  holds focus). **The first was live.** `fu19_header_off_date.png` and
  `fu19_no_ships_column.png` looked at. **Accepted.**
- D's `npm test` had three failures, all in A's `orbit_distance` and `orbit_ships` tests
  (A mid-ghosts); D's own 279 pass.
- **The push is a snapshot.** A, B and E are all mid-step, E in the same folder, so the
  sixteen finished files were captured as `findings/push/visible_fixes.patch` (`git diff
  HEAD`): D's twelve, E's T1.5 three (`dossier/model.ts`, `orbit/card.ts`, its test), and
  `dossier/DossierOverview.vue` (Johnny's and the orchestrator's). Staged with `git apply
  --cached`, it is immune to edits made after it was taken. `--check` passes. **Rehearsed:**
  `git archive HEAD` plus the patch: `vue-tsc` exit 0, build green, 818 tests, 807 pass,
  0 fail, 11 skipped.
- **D's question for Johnny:** amber for the readout's calendar icon off the campaign date
  (as built; it matches the amber campaign tick), or muted off the date and teal only on it.
- **Issued, `prompts/d_part2_go.md`:** Part 2 as written, plus the strip's status being cut
  ("Docked at Regi…") with room to spare.

## 156. Pushed `a000ed8`; Johnny wants the way back to the campaign date as a reset button before Play (2026-10-06)

- **`a000ed8`** (the header and strip fixes, the panes key and focus fixes, the Climate
  rows, Explore orbits beside the Mainworld button): `campaign` equals `origin/campaign`.
- **Johnny, on where Part 1 put "go to the campaign date" (the Time drawer):** "let's move
  it to before the play button and have it be like a reset button and it will bring view
  back to campaign date." This also answers the amber-or-quiet question about the readout's
  icon by replacing it: the button is the signal.
- **Added to `prompts/d_part2_go.md`, first** (D had not been handed it): one reset button
  immediately before Play, `orbit-go-campaign` and key C; disabled and quiet on the date,
  live off it, holding its place in both states and under a held scrub, absent with no
  campaign; the Time drawer's "Go to" control removed (one control per command); D decides
  whether the readout's icon keeps its amber and says why. This supersedes item 3's
  placement from §155.

## 157. Johnny: a "back 1 week" button; the Line up control hidden for now (2026-10-06)

- "We should also have back one 1 week button and then we can hide the line up button for
  now." Added to `prompts/d_part2_go.md` (D had still not been handed it): "Back 1 week" as
  the mirror of "1 week" in the Time drawer, its own command and key, disabled before day
  zero; **orchestrator's ruling:** on the campaign date it moves the campaign date back
  too, with the same undo toast, so back undoes forward; the Line up control leaves the
  drawer, its code and tests staying, the registry kept honest.
- **On disk, all in flight:** A (ghosts: `OrbitRenderer.ts`, `ships.ts`, `distance.ts`,
  `OrbitCanvas.vue`), B (T1.6: `apps/api/src/jobs/`, `reconcile_transform.ts`,
  `tests/generation/reconcile_derived.test.js`), C (Enhanced default and city lights step
  1: `surface/preferences.ts`, `service.ts`, `disc_hold.ts`, `disc_link.ts`,
  `surface/vanilla/gl*.ts`, `surface/enhanced/{bake,delivery,draw,session}.ts`), E (the
  Scout Survey card: `dossier/DayNight.vue`, `orbit/daynight.ts`, `DossierPanel.vue`,
  `dossier/orbit_open.ts`). D not yet started.

## 158. Johnny: yes to back-one-week rewinding; ships need places that are not planets (2026-10-06)

- **Yes:** "Back 1 week" moves the campaign date back too when the view is on it (already
  in `prompts/d_part2_go.md`).
- **"Right now we can only attach a ship to a planet, I want to see it on the map and I
  want to plot points in-system and watch it fly around."** This is the leg end in open
  space that §136 set aside in favour of a body's jump limit; Johnny has now asked for it
  outright, and the objection then (no way from a picture point to a real place) is gone:
  C's readout gave `orbit/distance.ts` the inverse of the picture's compression.
  **Ruling:** a system anchor may carry `point: { x, y }` in AU from the primary; it is a
  place like any other (a record's anchor, a leg's end); a ship there is drawn there; a
  flight to it runs the straight line; a jump can leave from it, which ends the "cut the
  flight" interim of §130 once D wires it. Also: a docked ship is drawn beside its body,
  not on its disc, so it can be seen.
- **`prompts/a_points.md`** (after the ghosts): the anchor in `packages/shared`, the place
  and index checks, places as body-or-point in `distance.ts` with the forward mapping and a
  round-trip test, `placeShips` and the renderer, docked ships beside the body, a stand-in
  ship that flies body → point → body. D's half (the click on empty space in plotting
  mode, the card and strip words, the 100D test for a ship at a point, Jump from a point)
  is to be written when A reports.
- **Asked of Johnny:** whether "see it on the map" also means every vessel marked on the
  sector map (today only the party's marker is there).

## 159. Johnny on the third motion pass, live: Moons off, Day/night, lost shadows (2026-10-06)

- "When I click moons, the moon animate on is incredible, but when I click moons off, the
  texture vanishes immediately and it doesn't have the same effect, also the animation is
  so good, we should use it again for the day/night, also the moons is incorrectly removing
  the shadow / shadow casting effects from the planets, we want to keep those."
- **Read of the cause, from the code:** `settleDiscs` gives the batch `moonsShown:
  state.layers.moons`, so the moons leave the batch on the first frame of a hide and their
  shaded tiles go with them, while the wave runs back over held outlines; and the same flag
  reaches the planets' shading. C to confirm and say exactly what is dropped.
- **`prompts/c_toggle_motion_4.md`** (after city lights step 1, before step 2): the moons
  stay in the batch, tiles held, for the whole of a hide; Day/night uses the Moons
  wireframe wave in place of the solid teal band (this reverses his earlier "a solid teal
  micro-animation": the wave is better); a planet is lit and shadowed identically with
  Moons on and off, with a test. C and A are both in `OrbitRenderer.ts`: C edits the
  toggle code and the disc calls only, re-reading before each edit.
- Recorded as follow-up 14d.

## 160. Johnny: a click on the picture must not close the open drawer (2026-10-06)

- "When I click on the map, it's hiding whatever the active drawer was, I don't want that."
  `views/OrbitView.vue` `onStagePress` closes the drawer on a press on the picture
  (`pressCloses`, `orbit/drawers.ts`; D's own drawers design). Reversed: a drawer closes by
  its tab, by Esc, and when another opens. Added to `prompts/d_part2_go.md`; D had still
  not started (no D file modified), so the one paste carries it. Follow-up 24 widened.

## 161. Johnny: the orbit view's info card sits under the open drawer (2026-10-06)

- "Have the info card in the orbit view stick to whatever the shortest values is to the
  drawer, if there's no drawer it should fill the space, and if the drawer is larger, it
  should push the card down." The pinned body card is `position: absolute; top: 18px` in
  `orbit/BodyCard.vue`; the view already publishes `--drawer-height` on `.orbit-stage`
  (the toasts use it). **`prompts/e_card_under_drawer.md`** (E owns `BodyCard.vue`; after
  the Scout Survey card): the card's top follows the drawer's bottom edge, its height
  shrinks to match, it moves with the drawer's own tokens, nothing jumps on open, close or
  swap. Follow-up 25.

## 162. Johnny: the open sidebar must survive going back to the map (2026-10-06)

- "Whatever sidebar is active, keep that active when I transition back from the orbit view
  to the universe view, if I have campaign open it closes when it shouldn't." Cause found:
  `backToMap` in `views/OrbitView.vue` pushes with `withQuery(route.query, { panel: null,
  record: null })`, discarding the pane by design (A's panes step). Map to orbit already
  keeps the query. Added to `prompts/d_part2_go.md` (D had still not started): the pane is
  kept across the two views in both directions, every way across checked.
- `d_part2_go.md` now opens with five things from Johnny today: the reset button before
  Play, "Back 1 week", Line up hidden, the drawer staying open on a press on the picture,
  the pane kept across views; then Part 2 of `d_visible_first.md`.

## 163. Johnny: a "Locate" button on the system page (2026-10-06)

- "On the system right pane, I can easily move the map and lose the system, add a button
  next to explore orbits that will do our badass tracking effect and recenter the view to
  the active system. 'Locate' button."
- The effect is the locator (`workspace/locate.ts`, `map/campaign_layer.ts`, the flight in
  `MapView.vue`), today for a campaign record only: `snapshotFromStore()` hands the layer
  nothing unless a campaign is open, so signed out there is no locator.
- **Split by owner, one contract** (`startLocate('hex:' + hexKey, hexKey, from)`):
  **D** (`prompts/d_part2_go.md`): a subject that is not a record, the line and flight
  with no campaign and signed out, a command; **E** (`prompts/e_card_under_drawer.md`,
  second item): the button beside Explore orbits in `DossierOverview.vue`, importing
  `startLocate`, reading "Locating" while it runs. Follow-up 26.
- `d_part2_go.md` now opens with six things from Johnny today. D had still not started.

## 164. Johnny: every vessel on the sector map; D has its prompt (2026-10-06)

- D was handed `prompts/d_part2_go.md` (six things from Johnny, then Part 2).
- **Yes:** every vessel is to be marked on the sector hex map at its hex, not only the
  party's ship. Follow-up 27, a small follow-on after the open-space work: the place comes
  from `placeAt` at the campaign date (a ship in jump is at no hex: D's "in jump" tag at
  the system it left is the precedent); the party's mark stays distinguished; the marks are
  the campaign layer's (`map/campaign_layer.ts`), fed by `MapView.vue`. Prompt not written;
  to be issued when A reports `a_points.md` (A or D, whoever is free in those files).

## 165. A's ghosts and B's T1.6 accepted; a snapshot push, rehearsed with the Worker typecheck (2026-10-06)

- **Agent A, the ghosts:** `realDistanceKmBetween(plan, fromKey, fromDays, toKey, toDays)`
  (`realDistanceKm` is it with one date twice); the renderer draws D's option 1 from a
  `preview` (`{ toKey, departs, arrives, tag? }`): a destination ghost in `--orbit-lock`
  with its tag, ghosts for worlds that will visibly move, dotted arcs, the dashed flight
  line to the ghost that was drawn, the selection lock at half strength, fades over
  `--t-base` and slides over `--t-fast`, nothing on first paint; `placeShips` runs a flight
  as `lerp(place(from, departs), place(to, arrives), fraction)`. `OrbitCanvas.vue`: the
  `preview` prop, its hand-off and a dev stand-in, lines listed. 1.5 ms frames at Regina.
  `k21_ghosts_days.png` looked at. **Accepted.**
  **A's finding for D:** `bodiesAtOf` (`orbit/ship_marks.ts`, D's) ignores its date, so a
  real track still samples the frame's picture; the straight line is true only in the
  stand-in until D makes it answer for a date. In `prompts/d_ghost_wiring.md`.
- **Agent B, T1.6:** the derived build takes `transform: "reconcile-environment"` (schema in
  `packages/shared/src/schemas/generate.ts`; any other name, or a transform without `from`,
  refused): each source tree read, `reconcileTree` with `environmentPolicy`, a new
  `objects/<hash>` only when the canonical bytes change; provenance beside the generation
  row in `truth/<version>/reconciliation.json` (source, transform, policy digest, a digest
  of the tables bundled in the policy, the carried engine version); per-sector and total
  reports under `truth/<version>/reconciliation/`; resume keyed by source version, source
  index hash and policy digest; the version left building, never released by the job; with
  no transform the derive is what it was. **B's black-box run on its own `wrangler dev`:**
  `tests/api/truth_build.test.js` 11 pass in about 191 s. New
  `apps/api/src/jobs/reconcile_transform.ts`, `tests/generation/reconcile_derived.test.js`.
  **Accepted** on that run and the structure read; the orchestrator did not re-run the
  black-box file (the tree is not quiet).
  B's notes: the job writes no manifest (release does); the rules digest is of the bundled
  tables, the Worker having no `rules/`; no new D1 column; `TruthManifest` left strict, so
  the record is a sidecar. **A v6 shadow build is only valid once this Worker is live**;
  B wrote the admin commands out without running them; its estimate for 512 sectors is 15
  to 30 minutes, "plan on under an hour".
- B's one failing test (`surface_identity.test.js`, an unrecognised stored value now reads
  as enhanced) is C's Enhanced-default step in mid-edit.
- **The push, a snapshot:** `findings/push/ghosts_t16.patch` (13 tracked files: A's seven,
  B's six) by `git apply --cached`, plus B's two new files by path. **Rehearsed:** `git
  archive HEAD` plus the patch and the two files: web `vue-tsc` exit 0, build green, the
  Worker's `tsc -p apps/api` exit 0, 823 tests, 812 pass, 0 fail, 11 skipped. (A first
  attempt failed in the orchestrator's own linking of the scratch copy, not in the code.)
- **Asked of Johnny:** whether to run the v6 shadow build (staged, not released) once this
  Worker is deployed.
- **Next:** A, `prompts/a_points.md`. D after Part 2, `prompts/d_ghost_wiring.md`.

## 166. Pushed `6fc2d60`; deployed; Johnny says go to the v6 shadow build (2026-10-06)

- **`6fc2d60`** (the ghosts in the renderer; the derived build with the reconcile
  transform): `campaign` equals `origin/campaign`; **the live entry is `index-BF4-gY3d.js`,
  the same file the orchestrator's rehearsal built from this commit**, so the new site and
  Worker are deployed (the GitHub test run was still in progress when checked). A has
  `prompts/a_points.md`.
- **Johnny: "go"** to the v6 shadow build (staged, not released).
- **Why the deploy check mattered:** the previous `TruthBuild` schema was not strict, so the
  old Worker would have ignored `transform` and made a plain copy named v6, and there is no
  admin route to delete a version.
- **The command given to Johnny** (browser console on traveller.voyage, signed in as
  admin): it reads v5's own row from `/api/truth/versions` (milieu M1105, seed
  TravellerMagnus, engine 1.0.0, the twelve settings, checked against production) and posts
  `/api/admin/truth/build` with `version: 'v6'`, `sectors: 'all'`, `from: 'v5'`,
  `transform: 'reconcile-environment'`; expected answer `{ version: 'v6', enqueued: 512 }`.
  Progress: `GET /api/admin/truth/builds/v6` (state, sectorsDone of 512, failed, queued);
  retry: `POST .../builds/v6/retry`. **No release.** The orchestrator confirms the
  transform took by fetching `https://cdn.traveller.voyage/truth/v6/reconciliation.json`.
- **`prompts/b_engine_t1_7.md`** (to hand out when the build has finished): read-only
  evidence from the CDN: the provenance and the 512 reports summed; the section 7.3
  invariants over every Spinward Marches tree beside v5's, and over the eight sectors of
  B's earlier scan; v5 untouched; `findings/v6_shadow_evidence.md` for Johnny in plain
  words, with the unresolved worlds by kind and twenty named examples.
- **Before any release of v6:** the surfaces must read `surfaceTempBand`
  (`surface/profile.ts` `tempBandFromKelvin`, C's); Johnny rules on the unresolved counts.

## 167. The v6 build request was refused cleanly: a leftover catalogue file in `inputs/v5/` (2026-10-06)

- Johnny ran the v6 command: **404 "Sector inputs are missing." `{ slug: "Calidan" }`.**
  Calidan is the first sector in v5's list, so every sector's XML was "missing". The check
  runs before the insert: **no v6 row, nothing queued, nothing written** (the CDN still
  answers 404 for `truth/v6/reconciliation.json`).
- **Cause:** `resolveCatalogue` takes the first version in the chain whose
  `inputs/<version>/sectors.json` exists. On 2026-10-04 (§47) the orchestrator of the day
  uploaded exactly that one file to `inputs/v5/` to unblock v5's release, before the
  release route learned to walk the chain (§48). v5 has no other inputs (the upload ledgers
  in `universe/raw/` stop at v4). So the chain now stops at v5, and the route lists
  `inputs/v5/`, finds only the catalogue, and refuses. v5's own derive from v4 passed
  because the file was not there yet.
- **Fix given to Johnny (his command, production):** delete the leftover,
  `wrangler r2 object delete voyage-private/inputs/v5/sectors.json --remote`, so the chain
  runs v6 → v5 → v4, whose inputs are complete; then the same console command. The file is
  a byte copy of `universe/raw/sectors.json`, so the undo is one `put`. Nothing a visitor
  uses reads it: only the admin build, derive and release paths do.
- **Hardening owed (B, small, not blocking):** `resolveCatalogue` should pass over a
  directory that holds a catalogue but none of the sector files it lists; and there is no
  admin route to remove a version stuck in `building`.

## 168. A's places, C's step 1, D's Part 2 and E's two steps accepted; whole-tree push; v6 is building (2026-10-06)

- **Every agent was between steps** (B waiting on v6), 60 files on disk. **Orchestrator on
  the whole tree:** 840 tests, 831 pass, 0 fail, 9 skipped; check clean; typecheck clean;
  build green. **Push: `git add -A`**, before any new paste is handed out.
- **Agent A, places in open space:** a system anchor's `point: { x, y }` (finite,
  `POINT_AU_LIMIT` 1,000,000 AU, never with a `bodyKey`); `placeAt`, `whereAreWe` and the
  index needed no change; either end of the distance functions is a body key or a point;
  `pictureOfAu` round-trips with the readout's inverse; `pointWords(plan, point, days)`;
  a ship at a point drawn there, a flight to it on the straight line, a jump bubble at it;
  a docked or orbiting ship drawn down and to the right of its body, clear of the disc and
  name, further ships stepping 20 px along that diagonal in id order; a stand-in Surveyor
  flying body → point → jump. The Worker validates with the shared schema and reads no
  campaign `bodyKey`. **Accepted.** For D: `bodiesAtOf` still ignores the date, and a
  system anchor with no `bodyKey` becomes the mainworld there.
- **Agent C, Enhanced as default and city lights step 1:** a visitor with nothing stored
  gets `enhanced`; stored `vanilla` honoured; five cases tested. The enhanced draw program
  is separately linked from the vanilla `DRAW_FRAG` string in `surface/enhanced/`; mode,
  version (`enhanced-cities-1`) and a generation epoch travel on the worker request and
  result; stale results close their bitmaps; a mode change drops the other mode's tiles;
  `tests/web/surface_gl.test.js` untouched; first and last vanilla buffers at Regina match
  byte for byte; 8.5 ms through a switch. The three review worlds pinned in
  `findings/city_design_s1_manifest.json`. **Accepted.** Noted: `scripts/surface_parity.js`
  exited 1 twice on one shade tile off by one channel on one pixel, a different case each
  run; whether that predates the step is not known.
- **Agent D, Part 2, every item:** the reset button before Play (amber and live off the
  campaign date, disabled and quiet on it, absent with no campaign; nothing in the header
  moves); "Back 1 week" (Shift+W) writing the campaign date as "1 week" does; Line up
  parked with one named exception in the commands test; a press on the picture leaves the
  drawer open; the pane survives every way between the map and the orbit view; "Locate
  this system" (L on the map) for anyone, signed out included; the strip's status no
  longer cut; a ship in jump not measured or plotted from; `settleFlight` built, unwired;
  the vessel's Where block from the track; "Estimate: 5 parsecs · about 50 tons · 100-ton
  hull assumed" for Regina to Feri; `surveyElsewhere` passed; the design page's samples;
  the rest of the signed-in pass, nothing further broken. `fu19b_header_off_date.png`
  looked at. **Accepted.** D's two questions, ruled by the orchestrator: the system title
  giving way in the 520 px header ("Regi…") is acceptable; L stays map-only, since it opens
  Layers in the orbit view.
- **Agent E, the locked world's card** (report not pasted; read from disk,
  `fu18_built_column.png`): the SCOUT SURVEY readout as designed. **Accepted.**
  **Agent E, the card under the drawer, and Locate:** the Locate button beside Explore
  orbits, calling `startLocate('hex:' + hexKey, ...)`: accepted. The card follows
  `--drawer-height` with the drawer's tokens: accepted in mechanism, **wrong in distance**:
  it keeps 74 px (18 plus a 56 px shift `views/OrbitView.vue` puts on every card, left over
  from a control the drawers removed), so there is a band of empty picture above it, closed
  and open. `prompts/e_card_gap.md`: 18 px in both cases; E may edit that one CSS rule.
- **v6 is building.** Johnny deleted the leftover catalogue and ran the command again:
  `truth/v6/reconciliation.json` is on the CDN with `transform: "reconcile-environment"`,
  policy digest `41839266…7efc6`; the running total listed two sectors (Abyss, Alnitak, 46
  bodies) when read. Note for T1.7: the reports are rewritten under one key; read them
  past the CDN's cache.
- **Issued:** `prompts/a_vessels_on_map.md` (follow-up 27), `prompts/e_card_gap.md`,
  `prompts/d_ghost_wiring.md` widened (the ghosts wired, `bodiesAtOf` for a date and a
  point, the plotting click on empty space, the words, Jump from a point replacing the cut
  flight), and for C the waiting `prompts/c_toggle_motion_4.md`.

## 169. Pushed `703041d`; Johnny on course plotting: waypoints, the docked tag, slingshots to the backlog (2026-10-06)

- **`703041d`** (places in open space, Enhanced as default, the header and time controls,
  Locate, the Scout Survey card): GitHub run green; `campaign` equals `origin/campaign`;
  the tree clean but for `directives/`. **None of §168's four pastes had been handed out:**
  Johnny held them and asked to be told when to redistribute.
- **His direction:** in-system **waypoints**; "think Homeworld RTS": control units, set
  waypoints, press Play, speed time up or down, watch the ship's signal fly; **a sci-fi tag
  that pops out of a planet when a ship is docked there, pressable to select the ship**;
  and a **backlog** item after the full MVP: how slingshotting round planets would work.
- **Filed:** follow-up 28 in `slice_2_campaign.md`; a "ship navigation backlog" in
  `plan.md` under "After 5" (slingshots, needing a rule from Johnny; the ship's own numbers
  with warnings and refuelling; the supplement's rules; astrogation and unrefined fuel).
- **Ruling:** each leg of a course is flown from rest to rest, because the travel rule
  supplied assumes it; a waypoint is therefore a stop, and a fly-by is the slingshot
  backlog. The card says so once.
- **The stack, by agent, in order:**
  - **A:** `a_course_preview.md` (the renderer's preview takes a list of legs; waypoints
    numbered, each body's ghost at its own arrival; a hit test for ship marks and the
    docked place as pure functions; a flag so the renderer does not draw a ship D's tag
    stands for), **moved ahead of** `a_vessels_on_map.md` because D waits on it.
  - **D:** `d_ghost_wiring.md` (the ghosts wired; `bodiesAtOf` for a date and a point; the
    plotting click on empty space; Jump from a point), then **`d_waypoints.md`** (select on
    the picture, the docked tag, the course of waypoints, Play and the speed steps; a short
    design note in the same step).
  - **C:** `c_toggle_motion_4.md`, then city lights steps 2 to 5 (step 2's prompt not
    written), then the surfaces reading `surfaceTempBand` before any v6 release.
  - **E:** `e_card_gap.md`. Nothing queued behind it.
  - **B:** `b_engine_t1_7.md` when v6 has finished; then the small inputs hardening (§167).
- **v6 progress, read from the CDN's running report past its cache:** 18 sectors, 88,157
  bodies seen, 17,140 unresolved, 32 blocking, about twenty-five minutes in. B's "under an
  hour" looks optimistic; Johnny's progress command gives the true count.

## 170. D's ghost wiring and open-space plotting accepted; a snapshot push with E's card fix (2026-10-06)

- The four pastes of §169 went out (A course preview, C motion 4, D ghost wiring, E card
  gap).
- **Agent D, `d_ghost_wiring.md`, all nine items:** `settleFlight` wired, so the plot
  card measures to where the destination will be (Regina A-X to A-II: 31.4 AU, about 11 d
  5 h at 2 G; "roughly" when the sum does not settle); the `preview` fed for a body (key,
  dates, tag) and for a point; `bodiesAtOf` answers a body at a date and a point's place,
  with one layout cached per date until the view or the system changes; a bare system
  anchor kept as the mainworld; **a press on empty picture sets a point**, estimated and
  written as a leg with its words; "Holding at 26.9 AU" on the strip, the Party tab, the
  Where block and the Track section; **Jump offered only at rest at a point outside every
  100D ring, the jump leg starting at the point; the "cut the flight" interim removed**
  (a track that already holds a cut flight is left as it is); worst frame 2.2 ms with a
  preview open. `k21_wired_point.png` looked at. **Accepted.**
- **D's three questions, ruled by the orchestrator** (in `prompts/d_waypoints.md` and
  `prompts/a_vessels_on_map.md`): a press within the snap distance of a body is that body,
  not a point at its present place; the leg's arrival is the settled figure unless the
  hours were typed; `pointWords` names the nearest body always (A). Also seen: the
  hairline readout drawn through a ship's name (A).
- **Agent E, `e_card_gap.md`** (no report yet; read from disk): the 56 px rule gone from
  `views/OrbitView.vue`, `BodyCard.vue`'s bottom back to 18 px. Complete and coherent, so
  it rides in this push.
- **The push, a snapshot:** `findings/push/plot_points.patch`, 14 files (D's eleven with
  its lines of `OrbitCanvas.vue`, which A had not yet touched; `BodyCard.vue`; `OrbitView.vue`
  carrying both D's work and E's rule). C's in-flight `OrbitRenderer.ts`, `disc_batch.ts`
  and their tests are left out. **Rehearsed:** `git archive HEAD` plus the patch: `vue-tsc`
  exit 0, build green, 843 tests, 832 pass, 0 fail, 11 skipped.
- **Next, D:** `prompts/d_waypoints.md` (A's hit test and course preview may not be there
  yet; the prompt says what to do then).

## 171. Pushed `5c2e016`; A's course drawing, C's fourth motion pass and E's card gap accepted (2026-10-06)

- **`5c2e016`** (the ghosts wired into plotting, plotting to a point, Jump from a point, the
  card gap): GitHub run green. The first attempt at it failed harmlessly because Johnny's
  shell was still in `apps/api`; rerun from the root. D has `prompts/d_waypoints.md`.
- **Agent A, `a_course_preview.md`:** `preview` is a leg or a list of legs (two or more is
  a course; one keeps the old drawing); the line runs from the ship through each waypoint;
  a body is ghosted at its own leg's arrival, a point is a target; earlier waypoints are
  numbered in the tag's style and the last carries the arrival tag; adds fade in, removals
  leave. `shipAt(marks, point)` and `dockedBeside(body, radius, index)` are pure in
  `orbit/ships.ts` (the renderer uses the latter, so a tag placed from it matches the
  picture); `dockTag` on the draw state stops the renderer drawing a docked ship's
  designator. Worst frame 5.3 ms with four legs. `k28_course_three_legs.png` looked at.
  **Accepted.**
- **Agent C, `c_toggle_motion_4.md`:** what `moonsShown` was dropping, found and fixed:
  with Moons off the batch lost the planet's ring uniforms (ring particles and ring shadow)
  and its moon casters (the eclipse terms), and `moonFactor` faded a ring's fill; the batch
  now always builds the ring and the casters, hidden moons are placed as casters only, and
  the moons' positions and tiles are kept for the whole hide. Day/night uses the Moons
  wireframe wave. 8.5 ms frames each way. `fu14d_daynight_on_mid.png` looked at.
  **Accepted.**
- **Agent E, `e_card_gap.md`:** the gap is 18 px closed and under each drawer at every
  width measured. **Accepted** (it went out in `5c2e016`). E notes a full-width toast could
  cover the card's corner at half and at 520 px.
- C's and E's build failures were each in another agent's file mid-edit (A's
  `livePreview`, then D's `OrbitCanvas.vue`).
- **The push, a snapshot without the shared canvas file:** `findings/push/
  course_motion4.patch`, six files (`OrbitRenderer.ts`, `ships.ts`, `disc_batch.ts` and
  their three tests). `OrbitCanvas.vue` holds A's finished lines and D's in-flight ones and
  is left for D's report; the committed canvas passes one leg, which the new renderer still
  draws. **Rehearsed:** `vue-tsc` exit 0, build green, 849 tests, 838 pass, 0 fail.
- **v6:** 71 of 512 sectors in the running report (398,038 bodies; 77,336 unresolved, 19%;
  149 blocking) after about an hour and a quarter: roughly a sector a minute, so several
  hours more, not the hour B expected.
- **Issued:** `prompts/c_city_lights_2.md` (Part 0: the enhanced look takes its band from
  `surfaceTempBand` and its seas from the corrected liquid, vanilla untouched; then the
  design's step 2, the lights under the weather), `prompts/e_liquid_row.md` (a surface
  liquid row on the world page when a body carries `liquidStatus`; the ribbon at half
  width). A's next is `prompts/a_vessels_on_map.md`.

## 172. Pushed `c7d4772`; Johnny's two animation notes arrived before it was live (2026-10-06)

- **`c7d4772`** (Moons off reversed, the Day/night wave, shadows kept; the course drawing):
  GitHub run green; the live entry became `index-bBQhfttU.js` and the orbit chunk
  `OrbitView-GbU36niV.js`, the files the rehearsal built, about two minutes after the
  commit. A has `prompts/a_vessels_on_map.md`.
- **Johnny, in the same minute as the push:** "Moons on, click to remove, the textures
  still vanish immediately. When we toggle Day / Night back on, the rings on a planet pop
  in, they should fade in." When he wrote it the live site was still the build before
  (`index-7ommFa7T.js`), so both are most likely the old behaviour the fourth pass
  replaces. He was asked to look again after a hard refresh.
- **In case either survives:** `prompts/c_city_lights_2.md` (not yet handed out) now opens
  with a check of exactly those two things on the deployed site, and the fix if they show.

## 173. Johnny: the plot card as a ship's nav console; select starts plotting; the plotter is live (2026-10-06)

- With a screenshot of the live plot card (saved as
  `findings/ui_design_shots/ref_plot_card_today.png`): "Let's really take this modal /
  popup and make it look like a sci-fi ship UI. Also when I select the ship it should
  automatically go into plotting mode, and then when in plotting mode, it should have me
  select the velocity so that when I move the plotter around, we see the planet ghosts
  move."
- **`prompts/d_nav_console.md`** (after `d_waypoints.md`, which D is in the middle of):
  selecting a ship starts plotting for it, with one obvious way out; thrust chosen first
  (the last used for that ship, none assumed the first time); the preview follows the
  pointer, so the ghosts move as it sweeps, one settle per frame; the card redesigned as
  an instrument from the view's own language (the amber tag, the Scout Survey readout, the
  ship sheet's chamfered panels), with a short design note and mockups in the same step.
  Follow-up 29.

## 174. Johnny, after a hard refresh: Moons off is fixed; the rings still pop on Day/night (2026-10-06)

- "You're right about the moons animation is fixed now, the rings still pop in the
  day/night toggle." Follow-up 14d's first and third parts are confirmed on the live site;
  the rings popping in when Day/night is switched is a live defect of the fourth pass.
- `prompts/c_city_lights_2.md` already opened with a check of both on the deployed build;
  it now says the rings are confirmed and come first.

## 175. Johnny: a ship's tag is to look like the planet's selection tag (2026-10-06)

- With a screenshot (`findings/ui_design_shots/ref_ship_tag_like_planet_tag.png`: a
  planet's amber tag beside a ship drawn as a small grey circle and "New vessel" in small
  grey type): "I want the ship tag to look like the planet select tag like we have here;
  it's nearly impossible to see right now."
- **Ruling:** one tag for every ship on the picture (docked, in orbit, holding at a point,
  under way), built exactly as the planet's selection tag (`--orbit-tag` box, the same
  type and leader), two lines (name; the strip's short state), a pressable control that
  selects the ship; the designator stays as the mark. The selected ship's is the amber one.
- **`prompts/d_ship_tag_look.md`:** an addition to `d_waypoints.md`, handed to D in
  mid-step because it changes the tag D is building now (`orbit/ShipTags.vue` is already on
  disk). **`prompts/a_vessels_on_map.md`** gains a bullet: a switch so the renderer draws
  no ship names when D's tags are on, and keeps every designator.

## 176. A's vessels on the map, D's waypoints and ship tags, E's liquid row and ribbon accepted; a hunk-level snapshot push (2026-10-06)

- **Agent A, `a_vessels_on_map.md`:** `map/vessel_marks.ts` `vesselsOnMap` (pure, tested);
  `map/campaign_layer.ts` draws the other vessels quieter than the party, stacked to the
  left of the hex, three shown and "+n" beyond, names only at the names tier, a dot at the
  point tier; a press opens the vessel's record through `shell/pane.ts`
  (`MapRenderer.ts` keeps the hits); `pointWords` names the nearest body always; the
  hairline readout placed clear of ships' names (`readoutPlace`); **`DrawState.shipTags`**:
  no ship name drawn, every designator kept. 2.9 ms while panning. **Accepted.**
  `fu27_map_vessels_system.png`: the liner's mark and name sit hard against Regina's own
  glyphs and are hard to read; left for Johnny's eye.
  **A's finding:** `placeAt` (the index) puts a flight in the system it left and gives a
  jump no hex; D's `vesselWhere` (the party marker) puts a flight in the system being
  crossed and holds a jump at the system it left with "in jump". The map's vessel marks
  follow `vesselWhere`, so marks and the party marker agree; the index does not list a
  ship in jump anywhere. Left as it is: a record aboard a ship in jump is not "here".
- **Agent D, `d_waypoints.md` with `d_ship_tag_look.md`** (the first report was not pasted;
  read from `findings/orbit_view_design.md` §8w): `orbit/course.ts` (pure, tested);
  plotting builds a course, each press a waypoint (a body, or a point; a press beside a
  body is the body); the card lists the legs and totals ("Course, 3 legs: 50.0 AU · about
  23 d 9 h at 2 G · arrives 160-1105 08:55"), one G for the course, a leg's hours typeable;
  "Add course" writes the legs end to end with one Undo, puts the clock on the departure
  and focus on Play; `[` and `]` step the speed, N steps through the ships; the strip counts
  down to the next waypoint. **`orbit/ShipTags.vue`: every ship has the planet's own tag**
  (plate, edge, bar, 11 px mono capitals, a second line with the strip's short state, the
  same leader), amber when selected, teal for the party's ship, white for others, each a
  button in the Tab order; tags hang down and right of their mark, a planet's goes up and
  right; several at one body stack. `fu28_tag_planet_selected.png` looked at: a ship now
  reads as clearly as a selected planet. **Accepted.** D's questions, ruled: tags of ships
  passing each other may overlap for the moment they pass; the 220 px cap on the second
  line stands; the speed toast that replaces itself stands; a tag over a neighbour's label
  at 520 px is accepted.
- **Agent E, `e_liquid_row.md`:** `liquidDisplay` gives the world page one "Surface liquid"
  row only when a body carries `liquidStatus` (None; Not classified; "Unresolved. No listed
  liquid fits this world's temperature."; the substance with its phase note); the UWP
  ribbon's captions stay inside their cells (tracking 0, gap 2 px, a cell no narrower than
  its caption, the row wrapping when eight do not fit). **Accepted.**
- **The push.** C is mid-step in `surface/` and in the ring code of `OrbitRenderer.ts`,
  the file that also holds A's `shipTags` lines. **A hunk-level snapshot:**
  `findings/push/rts_main.patch` (20 tracked files), `findings/push/rts_renderer_a_only.patch`
  (7 of the renderer's 11 pending hunks: the import, `DrawState.shipTags`, the ships and
  readout code; C's four ring hunks left out), and five new files by path. **Rehearsed:**
  `git archive HEAD` plus both patches and the files: `vue-tsc` exit 0, build green, 867
  tests, 856 pass, 0 fail, 11 skipped.
- **Next:** D, `prompts/d_nav_console.md`. E and A have nothing queued; the journal (K7) is
  the next campaign piece and its recipe is not written.

## 177. Pushed `d4bb7e8`; Johnny on the live waypoints: selection broken, drag waypoints, see and edit a ship's route, the right-hand stack (2026-10-06)

- **`d4bb7e8`** (waypoints and the course, ship tags like the planet's, vessels on the
  sector map, the ribbon, the liquid row): GitHub run green; the live entry is
  `index-uJYVuah5.js`, the file the rehearsal built. Johnny was told what to look for.
- **His notes on it** (screenshot `findings/ui_design_shots/ref_right_stack_misaligned.png`):
  "Ship not being selected on click, and then I want to be able to click and drag to move
  waypoints that have been placed. Course cards still don't look amazing. Also line up
  these alerts and buttons or whatever so they're all right aligned? All these
  notifications / controls / alerts need to move down like the card in the left. Also when
  I click on the vessel to select it, I want to see its pathing and be able to edit it.
  Think basic RTS controls."
- **Read of the selection defect:** in `OrbitCanvas.vue` `onUp`, a press while plotting
  goes straight to laying a body or point waypoint and never asks `shipAt`; D to reproduce
  on the live site and find anything else.
- **Split:** **A, `prompts/a_route_edit.md`:** `replaceLegsFrom(recordId, index, legs,
  notBefore)` in `campaign/track.ts` (legs already departed are history); a `route` on the
  draw state, the selected ship's stored legs drawn as the committed course beside the
  dashed preview; `waypointAt` as a pure hit test; a stand-in route. **D,
  `prompts/d_nav_console.md`, which D had not begun, gains a section 0:** the selection
  defect first; the right-hand stack (strip, ship list, destination row, card, toasts) on
  one right edge and riding 18 px under the drawer as E's card does; a selected ship's
  route shown and editable (drag a waypoint in a new course or a stored one, remove one,
  one Undo, history not editable); then the flow, the live plotter and the instrument look
  already in that prompt. Follow-up 30.
- A and E were free; A takes the route work. E still has nothing queued.

## 178. A's route editing accepted, held for D's push; the journal (K7) begins: A on the schema, E on a paper design (2026-10-06)

**A's report on `prompts/a_route_edit.md`, checked against the tree.** `replaceLegsFrom`
(`campaign/track.ts`) read line by line: index past the end, a departed leg, a bad leg,
the 500 limit and time order are each refused, one write. `waypointAt` and `DrawnWaypoint`
(`orbit/ships.ts`), `paintRoute` / `partIndex` / `waypoints()` (`OrbitRenderer.ts`), the
`route` prop and `waypoints()` on `OrbitCanvas.vue`. Run here: `campaign_track` and
`orbit_ships` 16 of 16, `orbit_renderer` 31 of 31, `npm run check` clean. Frames
`k30_route_{selected,with_preview,under_way}.png` looked at. **Accepted.**

**Not pushed, on purpose.** Nothing in it shows until D passes `route` (`d_nav_console.md`
0c): only the stand-in draws it. `OrbitCanvas.vue` and `OrbitView.vue` hold D's work in
flight and `surface/` holds C's. It rides with D's nav console push.

**One defect of look, back to A** (first item of `prompts/a_journal_1.md`): where a
preview parts from the stored route, both draw an arrival tag for the same waypoint, one on
the other (`k30_route_with_preview.png`). From the parting waypoint the route is to be
"what was": dimmer, no tag, no number.

**A known limit, put to Johnny:** a leg already under way is history and cannot be
re-aimed; the ship finishes it and the edited route begins there. Re-aiming in mid-flight
needs a rule (the travel formula is rest to rest), so it is his to ask for.

**D's prompt** gained a note that A's pieces are on disk, with their exact names.

**The journal begins (K7), as the slice orders it.** Johnny has not answered "what should
A and E do next"; the recommendation (the journal) is the slice's own next step, so the
prompts are written and he decides by pasting them or not.
- **K7a, Agent A, `prompts/a_journal_1.md`:** `CampaignEntry` in the shared schemas
  (`cj_` ids; `session | note | handout | rumor`; `when` as the file's `Day`; `realDate`;
  `sequence` on sessions only; `author`; `visibility`; `anchor`; `mentions`), `mentionsOf`
  for the `[[…]]` tokens, `EntryChange`, `CampaignChanges.journal`, an **optional**
  `CampaignPage.journal`, the result table widened. Additive, so it can be pushed before
  the server stores anything. Orchestrator's calls, to be seen by Johnny in A's report:
  limits (20,000 entries, title 200, body 100,000, 200 mentions); a title may be empty; a
  handout is not forced player-visible by the schema.
- **K7b, Agent B, not written:** `campaign_journal` in the Durable Object (schema version
  3), applied in the same changes call, paged with the rest. Write it when K7a is on disk.
  B is otherwise idle until v6 finishes.
- **K7c, Agent A, not written:** the store (`campaign/`): entries by id, commit and
  conflicts as records, the next session number, the index by hex and by mention.
- **Screens, Agent E, `prompts/e_journal_design.md`:** design only, to
  `findings/journal_design.md` with mockups `kj_*`, in the workspace's existing language.
  E builds after K7b and K7c.

## 179. v6 measured from the CDN: 170 of 512 after 2 h 28 min, healthy, about five hours left; why it is slow; a stale total report at the edge (2026-10-07, 02:00 UTC)

Johnny asked for v6's status and why it is taking so long. The admin route needs his
session, so it was measured read-only from the public CDN: one request per sector for
`truth/v6/reconciliation/sectors/<slug>.json` (written once, when a sector is published),
and each one's `Last-Modified`.

- **170 of 512 sectors published.** First at 23:32:00 UTC on 2026-10-06, the latest at
  01:59:29 UTC. Average 52 s a sector; by 25s: 50, 47, 50, 58, 46, 57, 60 s. Longest gap
  between two sectors 3.5 min, none over 10 min: **no stall**, and the two pushes made in
  that window did not disturb it (the queue carries on across a deploy). At this pace the
  rest is about five hours: **done near 07:00 UTC (about 02:00 Central), 7.5 hours in all.**
- **So far (total report, fetched past the cache):** 1,070,606 bodies seen; 206,817
  unresolved (19.3%); 381 blocking. The share is the same as at 71 sectors. The report is
  already 8 MB because it lists every unresolved body.
- **Why it is slow (read in `jobs/truth_build.ts`, `routes/admin.ts`, `wrangler.toml`):**
  1. It rewrites every system rather than regenerating: each hex's tree object is fetched
     from R2, reconciled, hashed and written back, **one after another** (`await` in a
     loop, no batching).
  2. A sector is a chain of queue messages of 25 hexes (`RECONCILE_SLICE`); each message
     sends the next, so a sector is strictly serial with a queue hop between slices.
  3. Only six messages run at once (`max_concurrency = 6`; twelve sectors are fed).
  4. Finishing a sector fetches every one of its objects again, one by one, to prove they
     exist (`get`, not `head`), and then **rebuilds the whole-build report by re-reading
     every finished sector's report**. That grows with each sector (170 reads and an 8 MB
     write now, 512 and about 24 MB at the end): quadratic, and the reason the pace is
     drifting from 50 s to 60 s.
  A full generation of the same 512 sectors took 13 minutes (v5). This job was written to
  be safe and resumable, not fast; it has been both.
- **Do not restart it and do not touch it.** Nothing is wrong, and the parts are cached.
- **A real trap:** `reconciliation/report.json` is rewritten after every sector but is
  stored `immutable` for a year, so the CDN edge serves the first copy (two sectors, 46
  bodies) at the plain address. A query string gets the truth. Also up to six finishers
  rewrite it at once from a listing, so the final copy may miss a late neighbour.
  `prompts/b_engine_t1_7.md` now says to fetch past the cache and to trust the sum of the
  per-sector reports.
- **Owed to B after T1.7 (the inputs hardening step, now five items):** `resolveCatalogue`
  skipping a directory with a catalogue and no sector files; an admin route to delete a
  `building` version; the derived build made fast (hexes of a slice in parallel, `head`
  for the existence check, the total report written once at the end, more lanes); no
  `immutable` on a rewritten key; the unresolved list out of the total report (counts
  there, the list per sector).
- **Before any release, unchanged:** the surfaces read `surfaceTempBand` (C, in flight)
  and Johnny rules on the unresolved share and the blocking bodies, from B's evidence.
- **B has a prompt for the idle hours: `prompts/b_build_hardening.md`** (the eight items
  above written out: a slice in parallel with the same bytes, `head` for the existence
  check, the total written once, lists out of the total, cache headers, `resolveCatalogue`,
  an admin route to remove an unreleased version). **Its files stay out of every push
  until v6 has finished**; T1.7 interrupts it the moment v6 is done.

## 180. Johnny: the journal is next; a leg under way stays history for the MVP; prompts out to A, E and B (2026-10-06, late)

- **Answers.** G8: yes, the journal, with the limits in A's prompt. G9: re-aiming a ship
  in the middle of a leg is not for the MVP (`plan.md` "Ship navigation backlog", item 5;
  it needs a rule from him before any design). Both recorded in `questions_for_johnny.md`.
  Nothing is open with Johnny.
- **Handed out:** A `prompts/a_journal_1.md`; E `prompts/e_journal_design.md`; B
  `prompts/b_build_hardening.md` (its files stay out of every push until v6 is done); D
  was told A's route pieces are on disk. C is still on `prompts/c_city_lights_2.md`.
- **Written ahead:** `prompts/a_journal_2.md` (K7c, the store), to hand to A when K7a is
  accepted. It tells A to stop if turning the clock's day count into `{ year, day }` would
  mean choosing a calendar rule. **Still owed:** K7b for B, when K7a is on disk.
- **v6 at 02:09 UTC:** 181 of 512.
- **The next push** is D's nav console with A's route editing, by hunks
  (`OrbitRenderer.ts`: A and C; `OrbitCanvas.vue`: A and D), rehearsed. A's K7a can ride
  with it or go alone by path (`packages/shared`, its tests), since it is additive.

## 181. C's ring cross-fade, corrected climate and city lights step 2 accepted; a C-only push rehearsed; a flight log for every vessel (2026-10-06, late)

**C's report on `prompts/c_city_lights_2.md`, checked.**
- **Rings.** C reproduced the pop on the live site and explained it: the live worker
  starts cold, so `dayHold` kept the flat ring at full strength for the whole gesture and
  then blitted the tile at once; and the shaded tile is clipped to the disc, so the ring
  outside the planet stayed invisible until the sweep ended. Now `ringShown` follows the
  body's sweep, a late tile fades over `--t-base`, `shadeRings` draws the tile outside the
  disc at that amount, and the ring's fill is no longer scaled per frame (no rebake).
  Read in the diff; the new test is in `orbit_renderer.test.js`.
- **Part 0.** `discShadeRequest(time, disc, mode = 'vanilla')` and `enhancedWorldData`:
  only the enhanced mode reads the classifier's word; the vanilla path is as it was.
  On v5 (no reconciled fields) nothing changes, e.g. Rhylanor still "Water, frozen" at
  328 K until v6 is released.
- **Step 2.** City haze and halo gone, city light and the downport under cloud
  transmission, the night ramp and the limb. Step 1 and step 2 near sheets compared by
  eye at Rhylanor: the look holds. **Not delivered, and said so by C:** the cloud crops
  and city on/off sheets (the orbit page cannot force them) and a run of
  `scripts/surface_parity.js`. Both are first in `prompts/c_city_lights_3.md`.
- Whole tree here: 908 tests, 899 pass, 0 fail (A's journal tests already among them).

**A C-only push, rehearsed.** A is back in `OrbitRenderer.ts` and D is mid-step, so C's
work was cut out: `findings/push/c_rings_renderer.patch` (the four renderer hunks between
old lines 846 and 1525, and C's one test, by `filter_range.mjs` in the scratchpad),
`findings/push/c_surface.patch` (six `surface/` files and `surface_disc_delivery.test.js`,
whole), and four new files by path. Scratch copy of `d4bb7e8` with exactly that applied:
`vue-tsc` exit 0, `vite build` done (entry `index-DXPwg3e-.js`, orbit chunk
`OrbitView-TAAF7GZ1.js`), `tsc -p apps/api` exit 0, 874 tests, 863 pass, 0 fail, 11
skipped (two more than in the tree, files the archive does not carry), check clean.
Junctions removed; the real `node_modules` checked.

**Johnny: a flight log for every vessel, "an efficient archive".** Follow-up 31 in
`slice_2_campaign.md`. The history is already kept (legs stay on the track) but inside
the record, capped at 500 legs and rewritten whole on every change. Plan: arrived legs
move to an append-only log in the Durable Object, read by page and by date; a paper
design by B after K7b. One question put to Johnny: may a referee strike or correct a
logged leg.

**C's next:** `prompts/c_city_lights_3.md` (a dev harness for the enhanced program and the
step 2 crops it owes, the parity script, then step 3: the cube C, static filtering, the
day material).

## 182. Pushed `9a95a0c` (C's rings, corrected climate, city lights step 2), live; a flaw in the rehearsal method; the flight log ruling (2026-10-06, 21:30 Central)

- **Pushed and live.** `9a95a0c`, the `test` run green in 1 min 36 s. The live orbit chunk
  holds C's `ringShown`, and none of the unpushed work (no nav console, no "already
  departed", no journal schema). The live entry and orbit chunk are the same size to the
  byte as the rehearsal's (166,104 and 179,420).
- **But the live names are not the rehearsal's** (`index-D1Xa8SwN.js` and
  `OrbitView-DVFoAteQ.js` live; `index-DXPwg3e-.js` and `OrbitView-TAAF7GZ1.js`
  rehearsed). Cause, found by comparing the shared chunk: the scratch copy's
  `node_modules` is a junction to the real one, and `node_modules/@voyage/shared` there
  links to the **real** `packages/shared`, which now holds Agent A's unpushed journal
  schema. So the rehearsal bundled, and typechecked against, A's working copy of
  `packages/shared` (about 1 KB more in the shared chunk, which renames every chunk that
  imports it). The same holds for `@voyage/engines`, `generation` and `api`.
  - It did no harm here: A's change is additive, CI tested the commit itself, and
    Cloudflare built it. It was invisible before because nobody had uncommitted work in
    `packages/`.
  - **For the next rehearsal:** give the scratch copy a real `node_modules` whose
    entries are junctions to each of the real one's, except `@voyage`, which points at
    the scratch copy's own `packages/` and `apps/api`. Until that is done, a rehearsal
    with uncommitted work in `packages/` is a check of the web tree only, and a deploy is
    checked by content, not by the entry's name.
- **Johnny, G10:** a referee may strike a logged leg (with Undo) and edit its note; a
  logged leg is never re-timed or re-aimed. In follow-up 31.
- **C** has `prompts/c_city_lights_3.md`. **v6:** 207 of 512 at 02:31 UTC.
- **On disk and unpushed:** A's route editing and journal schema (in flight), D's nav
  console (in flight), B's build hardening (held until v6 is done: `apps/api/src/jobs/`,
  `routes/admin.ts`, two test files).

## 183. A's old-tail fix and the journal schema (K7a) accepted; K7b written for B; A goes on to the store (2026-10-06, late)

**A's report on `prompts/a_journal_1.md`, checked.**
- **The old tail.** `k31_route_parting.png` looked at: one arrival tag (the preview's),
  the stored route dim from the parting waypoint (line alpha 0.28 against 0.72, rings
  0.22 against 0.55, no number, no tag). `orbit_renderer` tests pass.
- **K7a.** The diff of `packages/shared/src/schemas/campaign.ts` read whole: the limits,
  `JOURNAL_ID`, `CAMPAIGN_ENTRY_KINDS`, `CampaignEntry` (strict; a session has a
  sequence, no other kind does), `mentionsOf` (record ids and `hex:` keys, distinct, first
  seen, capped), `EntryChange`, `CampaignChanges.journal` counted in the row limit, an
  optional `CampaignPage.journal`, `'journal'` in `applied` and `conflicts`.
  `tests/shared/campaign.test.js` 8 of 8 here. **Accepted.** A handout with
  `visibility: 'referee'` parses, by the orchestrator's call; Johnny was told (G8).
- **Two things in A's report that are not defects.** (1) `npm run build` failed in
  `views/OrbitView.vue`: that is Agent D in mid-edit (a second `const route`, a
  `CourseRow.to`), not A; the tree does not build until D reaches a green point, so
  **nothing is rehearsed from the whole tree before D reports**. (2) "`rules:gen`
  reported 0 entries" for the climate and travel files: the generator's log line counts
  only arrays; both generated files are whole (558 and 3,400 bytes).
- **Not pushed.** K7a is additive and invisible; it rides with the next push. (Once it is
  committed, the rehearsal trap of §182 is closed for `packages/shared`.)

**Next.** A: `prompts/a_journal_2.md` (K7c, the store), written in §180 and still right
against the schema as shipped. B: `prompts/b_journal_k7b.md` (the table, paging, apply
with conflicts, `mentions` recomputed by the server, the limit, every place that walks
the campaign's tables), after the hardening step; T1.7 ahead of it if v6 finishes.
**Known until K7b ships:** the server parses a change carrying `journal` and drops it.
Nothing sends one.

## 184. v6 has finished (512 of 512, nine hours, unreleased); C's city lights step 3 accepted as built and held for step 4 (2026-10-07, evening)

**v6, measured read-only from the CDN on 2026-10-08 at 02:44 UTC.**
- All 512 per-sector reports are there. First 23:32:00 UTC on 10-06, last 08:32:07 UTC
  on 10-07: **nine hours**. Not released: `/api/truth/versions` lists v2 to v5, and
  `truth/v6/manifest.json` is 404.
- **The total report (fetched past the cache, last written 08:33:34 UTC), 512 sectors:**
  3,580,267 bodies seen and changed. Changed by field: `surfaceTempBand`,
  `orbitalTempBand` and `reconciliation` on every body; `liquidStatus` 2,986,933;
  `liquidType` 1,370,089. Diagnostics: `liquid-unresolved` 694,946 (19.4%);
  `surface-unknown` 43,376; `hydro-invalid` 1,247 (the blocking list); none
  `orbital-unknown` or `temperature-inverted`. Liquid outcomes: `ice-zero` 946,748;
  `ice-frozen` 600,311; `known-outside` 444,310; `known-valid` 432,431; `ice-thaw`
  364,059; `unknown-exotic` 139,570; `zero` 58,230; `hydro-invalid` 1,247; `missing` 27.
- **B: `prompts/b_engine_t1_7.md` now**, ahead of the hardening step and of K7b. The
  hardening files are no longer held by v6; they are pushed when B reports that step.
- **Before any release, unchanged:** B's evidence, then Johnny on the 19.4% unresolved,
  the 1,247 blocking and the 43,376 with no surface word.

**C's report on `prompts/c_city_lights_3.md`, checked.**
- Whole tree: 922 tests, 913 pass, 0 fail. The harness is `/dev/city-lights`, added in
  `router.ts` only under `import.meta.env.DEV`. The step 2 crops C owed are on disk.
- Frames looked at: Rhylanor near (step 3 against step 2), Rhylanor day against the night
  cube (the network sits on the grey built ground), Pavabid near.
- **Accepted as built, not pushed.** Two reasons. (1) **The look dips at this step**: the
  filled glow of step 2 (which is live) is gone and step 4's glow is not there yet, so
  Rhylanor's night side is a thin network on darker ground, with the night cloud reading
  as grey patches lighter than the ground. Johnny's bar for this work is spectacle. (2)
  **Parity is stale**: step 3 edited `surface/vanilla/gl.ts`, `gl_bake.ts` and
  `gl_shade.ts`, and the report reads as parity run before those edits.
- **`prompts/c_city_lights_4.md`:** parity first on the tree as it stands; the two
  questions about the look (what lights night cloud; the Pavabid crop's two discs); then
  the glow taps and the soft shoulder, with a step 2 | step 3 | step 4 comparison strip
  per world for Johnny to judge by. Steps 3 and 4 are pushed together.
- Put to Johnny: hold step 3 for step 4 (recommended), or push it now.

**Also on disk:** A is in K7c (`campaign/journal.ts`, the store, the commit path). D is
still in `views/OrbitView.vue`; C's build passed, so the tree built at that moment.

## 185. Johnny: hold city lights step 3 for step 4. D's nav console accepted; the push with A's route work and K7a rehearsed (2026-10-07, evening)

- **Johnny, city lights:** hold step 3; steps 3 and 4 go live together.
- **D's report on `prompts/d_nav_console.md`** (pasted partly garbled; read against the
  tree). Built: 0a `pressMeans` in `ship_marks.ts` (a ship under a press is always that
  ship; read), 0b the right-hand stack on one edge, 18 px in, riding under the drawer
  (`fu29_stack_under_drawer.png` looked at), 0c the stored route shown and editable
  through A's pieces (`storedRoute`, `routeFixed`, `routePreview` in `course.ts`), the
  flow, the live plotter, the console's look (`fu29_route_then_course.png`: the NAV tab,
  the six-notch throttle with the rust tag, mono figures, Route and Then rows, one filled
  control). **Accepted.** D could not sign in on production, so 0a was reproduced and
  fixed locally only.
- **Not re-run by D after 0c went in:** widths, the Tab walk, reduced motion with route
  rows; also a touch pointer, a locked route in the browser, an edit while the clock
  runs. All in `prompts/d_nav_console_2.md`.
- **D's seven questions, as taken.** (1) the last thrust offered and the plotter live at
  once: stands, put to Johnny. (2) Esc closes a drawer before releasing the ship: stands.
  (3) **a leg departing exactly at the view's date is locked**, so the first waypoint of
  a course just added cannot be dragged: **ruled by the orchestrator, under way only
  after the departure instant** (`<`, not `<=`, in `storedRoute` and `replaceLegsFrom`);
  D's next step, with leave for the one comparison in `campaign/track.ts`. (4) typed
  hours are lost when a stored route is re-timed: **ruled, the leg records it**; an
  optional field from A after K7c. (5) a route that ends in a jump is locked: put to
  Johnny (recommended: edit allowed, the jump and what follows keep their durations and
  move in time). (6) no compact console at 520 px: stands, put to Johnny. (7) the four
  older design choices keep their defaults.
- **The push, rehearsed.** By path, `findings/push/nav_console_files.txt` (18 files: D's
  eight, A's route work in `track.ts`, `ships.ts`, `OrbitRenderer.ts`, `OrbitCanvas.vue`
  and their tests, and K7a in `packages/shared` with its test). Left out, in flight: A's
  K7c (`campaign/store.ts`, `commit.ts`, `journal.ts`), C's steps 3 and 4 (`surface/`,
  `dev/city-lights/`, `router.ts`), B's work in `apps/api` (the hardening and, already
  begun, K7b). Scratch copy of `9a95a0c` with exactly those files: `vue-tsc` exit 0,
  `vite build` done (`index-BUu0j880.js`, `OrbitView-dhTSl5k_.js`), `tsc -p apps/api`
  exit 0, 908 tests, 897 pass, 0 fail, 11 skipped, check clean. The scratch copy's
  `@voyage/shared` is the real one (§182), which here equals what is pushed.
  After the push, check by content: the live orbit chunk holds "already departed".
- **Known on the live build after this push, until D's second pass:** right after "Add
  course" the first waypoint cannot be dragged (the others can).

## 186. A's journal store (K7c), B's v6 evidence (T1.7) and E's journal design accepted; the §185 push not yet run and re-rehearsed with K7c (2026-10-07, late)

**The §185 push has not been run** (`git log -1` is still `9a95a0c`; the live orbit chunk
has no "already departed"). It was re-rehearsed with K7c added: 23 files in
`findings/push/nav_console_files.txt`; scratch copy of `9a95a0c` with exactly those:
`vue-tsc` exit 0, `vite build` done (`index-rN_8cT47.js`, `OrbitView--WjtoNWk.js`),
`tsc -p apps/api` exit 0, 915 tests, 904 pass, 0 fail, 11 skipped, check clean.

**A, K7c (`prompts/a_journal_2.md`): accepted.** `campaign.journal`, the commit path,
`campaign/journal.ts`; `campaign_journal` and `campaign_store` tests 21 of 21 here.
`when` comes from `splitDays` on the clock (the tree's own conversion; no calendar rule
chosen). The check and build failures in A's report are C's `dev/city-lights` harness in
mid-edit. **Two things change to match E's design** (`prompts/a_journal_3.md`): the
list's order (newest by `updatedAt`; today's order kept as `entriesByDate` for K8) and
session numbers never reused, deleted ones included. The same prompt adds
`hoursTyped` on a leg (D's question 4, §185).

**E, the journal design (`findings/journal_design.md`, mockups `kj_*`): accepted.**
`kj_pane_full.png` and `kj_list_column.png` looked at: a third tab, the list with a kind
filter and search, the session open with its dates, place, Referee/Players and the
Mentioned rail. E's two questions go to Johnny at their recommended answers (an untitled
row shows the body's first line; session numbers are never reused).
`prompts/e_journal_build.md`: new files under `workspace/journal/`, the least lines in
`workspace/CampaignPanel.vue` and `shell/pane.ts`, built against A's store and B's
on-disk table through the local API.

**B, T1.7 (`findings/v6_shadow_evidence.md`): accepted.** The per-sector sum equals the
total. Nine sectors, 3,198 trees, 75,422 bodies: outside the five reconciled fields
every tree matches v5; no resolved liquid outside its window; no label on zero
coverage; the climate word matches the classifier. v5 untouched. Left open by the
evidence: 694,946 unresolved liquids, 1,247 blocking, 43,376 unclassified; the Tier 2
defect unchanged (mainworld `atmCode` / `hydroCode` against the chart digit: 2,873 of
3,198 mainworlds in those sectors, e.g. Esalin 1004); the vanilla renderer still on its
own Kelvin rule; no v6 manifest, overview or polities file. **Not released.**
- **B's reports on the hardening step and on K7b have not reached the orchestrator**,
  though both are on disk (`apps/api/src/jobs/`, `routes/admin.ts`; `universe/campaign.ts`,
  `schema.ts`, `routes/campaign_export.ts`, three `tests/api` files). Neither is pushed
  unread. `prompts/b_v6_questions.md` asks for both first, then
  `findings/v6_open_cases.md`: the unresolved sorted into cases with counts and the
  question each puts to Johnny (no recommendation from Traveller knowledge), the same for
  the unclassified and the blocking, how Johnny can look at v6 unreleased, and what a
  release still needs.

**Still open with Johnny from §185:** the last thrust live at once; a route that ends in
a jump; a compact console at 520 px. New: E's two (untitled rows; session numbers).

## 187. Johnny: the push skipped; all five recommendations taken; "next step of work should get us to character sheets" (2026-10-07, late)

- **The §185/§186 push was not run** ("I skipped push"). `9a95a0c` is still the last
  commit. The 23-file list stays right only until an agent edits one of its files; A, D
  and E are about to. **The next push is cut afresh at the next quiet point** (expect
  hunks again), carrying the nav console, the route editing, K7a, K7c and whatever is
  accepted by then.
- **Answers (G11 to G15 in `questions_for_johnny.md`):** the last thrust is offered and
  the plotter is live at once; a route that ends in a jump is editable, the jump and
  what follows keeping their durations and moving in time (now section 4 of
  `prompts/d_nav_console_2.md`); no compact console at 520 px; an untitled journal row
  shows the body's first line; a session number is never reused.
- **Character sheets are next (K13 part 4).** They were waiting on a fillable PDF that
  is still not in `assets/`. They need not: the official sheet, front and back, was
  supplied on 2026-10-02 and is transcribed in `campaign_manager_plan.md` §5.2a.
  - **A, `prompts/a_character_fields.md`** (after `a_journal_3.md`): the transcription
    as `findings/rules_drafts/mgt2e_character_sheet.json`, a readable table, a shape
    test; nothing from memory. Johnny then copies it into `rules/` and runs
    `npm run rules:gen`.
  - **D, `prompts/d_character_sheet.md`** (after `d_nav_console_2.md`): the design
    (`findings/character_sheet_design.md`, `kc_*`) and the build on the person's page:
    the sheet as the panel's default, collapsible sections, frozen keys, pills; every
    box stores what is typed, nothing computed. D stops after the design if the rules
    file is not in `rules/` yet.
  - **Still Johnny's to supply, and not needed for the first sheet** (plan §10 Q1): how a
    characteristic's value gives its DM, each skill's specialities, what Rads, Wounds
    and Recovery Period mean. Until then the DM is typed and a speciality is free text.
  - Asked of Johnny: whether a fillable character sheet PDF exists; if so it goes in
    `assets/` and B inventories it against A's draft.
- **The timeline (K8) and the flight log (follow-up 31) move behind the character
  sheet.** The journal's screens (E) and the journal's server step (B, on disk, report
  owed) carry on.

## 188. The character sheet PDFs are in `assets/`; the PDF becomes the source (2026-10-07, late)

- Johnny: "prompts sent, character sheets in /assets". `assets/Character Sheet
  2026_fillable.pdf`, `..._printletter.pdf`, `..._printta4.pdf` (his file names), already
  staged by him. G16 answered: the PDF exists.
- **So K13 part 4 takes the ship sheet's road exactly (§89):** a read-only inventory of
  the fillable PDF's widgets, copied by Johnny into `rules/`, then D's sheet.
  `prompts/a_character_fields.md` was **rewritten**: `findings/character_sheet_fields.json`
  in the ship file's shape, `character_sheet_fields.md` with the diff against §5.2a both
  ways, `character_sheet_groups.md` (which widgets make each section, table, value-and-DM
  pair and the skills block: names and positions only), a shape test. A after
  `a_journal_3.md`; the inventory was B's job for the ship, and B is loaded.
- `prompts/d_character_sheet.md` was edited to match: the rules file is
  `rules/mgt2e_character_sheet_fields.json`, the PDF wins over §5.2a, the layout is D's
  and is tested against the file. D reads it after `d_nav_console_2.md`, so nothing is
  re-sent.
- **Johnny's two lines, when A reports and the inventory is checked:**
  `cp findings/character_sheet_fields.json rules/mgt2e_character_sheet_fields.json` and
  `npm run rules:gen`.
- Handed out by Johnny: D (`d_nav_console_2.md`, then `d_character_sheet.md`), and A, B,
  E as in §186. No push since `9a95a0c`.

## 189. A did the first version of the character prompt (the §5.2a transcription); kept, and the PDF inventory is still owed (2026-10-07, 22:30)

- A's report is on `prompts/a_character_fields.md` as first written, read before the
  rewrite of §188: `findings/rules_drafts/mgt2e_character_sheet.json` (20 sections, 46
  fields, 23 table columns, 39 skill names, `notSupplied` listed) and a readable table.
  Looked at: it parses, sections front then back. **Accepted as the transcription. It
  does not go into `rules/`.** The prompt now opens by telling A to move both files to
  `findings/character_sheet_transcription.{json,md}` and then do the PDF inventory.
- A's two questions (the type of the six profile entries; the types of the table
  columns) are answered by the PDF's widgets, not by Johnny.
- **`a_journal_3.md` is on disk** (`entriesByDate` in `campaign/journal.ts`, `hoursTyped`
  in the shared schema) **and its report has not been pasted.** Whole tree per A: 959
  tests, 950 pass, 0 fail. Read at the next push.

## 190. Johnny: live character sheets owned by a player and co-edited with the referee; characters copied between universes through the marketplace (2026-10-07, late)

- **His words are in `slice_2_campaign.md`** under K10 and K11, which already held both
  ideas in outline (K10 "instanced" copies; K11 shared records in an account library;
  `CampaignProvenance.mode` is already `'copy' | 'shared'`). What is new: **the live
  character is owned by the player's account, and the referee co-edits it**; and a copy
  can travel through the free marketplace.
- **What it needs that does not exist:** any link between two accounts (no account sees
  into another's universe today), the account library, and a way for a change by one
  editor to reach the other's open page (the store commits and takes conflicts; nothing
  is pushed).
- **What changes now:** one paragraph in `prompts/d_character_sheet.md`: the sheet
  component takes a sheet document and emits changes, and never reads the record, the
  store or the universe, so the values can move from the record to a live sheet later
  without touching the screen.
- **Next, on paper:** `prompts/a_live_sheet_design.md` (A, after the PDF inventory), to
  `findings/live_sheet_design.md`: the model, who may do what and the smallest thing
  that connects two accounts, what "live" honestly means with the sync there is and what
  a pushed update costs, the edges, the copy and the marketplace against the git model,
  the steps and their lanes, the questions.
- **Put to Johnny (G17 to G20):** what stays the referee's own about a player's
  character; whether the referee may edit the whole sheet; whether a game keeps a frozen
  copy when a live character leaves it; how live "live" is for the first version.
- **Roadmap as it now stands:** the character sheet (in flight) → live sheets and the
  first player-to-referee sharing (design, then build) → characters in the marketplace
  with systems (Slice 4). The journal's screens and server step carry on beside it. The
  timeline (K8) and the flight log wait behind.

## 191. Johnny: "live" means two people in Google Sheets; A's PDF inventory of the character sheet accepted (2026-10-07, late)

- **G20 answered:** "Think of it like two people working in Google Sheets at the same
  time." So: a box changed by one appears for the other at once with no reload;
  presence (who is on the sheet and which box they are in); a box lands when it is
  committed and the later commit stands; typing inside one box is not merged letter by
  letter. That is a pushed channel (the live character's Durable Object holding the open
  pages' WebSockets), which `plan.md` had deferred to after Slice 5 and which is now
  pulled forward for sheets. **G18 is taken as yes** from the same answer (both edit
  anything). G17 and G19 are still open; the design assumes their recommended answers.
  - `prompts/a_live_sheet_design.md` section 3 rewritten to that bar, with his answers at
    its foot.
  - `prompts/d_character_sheet.md` gained three rules that make it possible later: a
    change is one box (never the whole sheet); values may change under the reader while
    the box being typed in keeps its text, caret and focus; presence has a place (an
    optional map of box to person, and enter/leave events), designed now and empty in
    this step.
- **A's inventory (`prompts/a_character_fields.md`, the rewritten one): accepted.**
  Checked here: `findings/character_sheet_fields.json` has the ship file's exact shape
  (`source`, `pageSize`, `box`, `fields` of `name`, `page`, `type`, `box`, `section`),
  420 widgets, 420 unique names, 410 text and 10 checkboxes, 317 on page 1 and 103 on
  page 2, no field without a box or a section; the shape test passes. Sections: Personal
  Data File 25, Skills 149, Augments 15, Armour 40, Weapons 56, Equipment 32, Finances 8,
  Wounds 16, Careers 30, History & Background 1, Allies, Contacts, Rivals, Enemies 12
  each. Read with pypdf 6.19.0. The transcription was moved to
  `findings/character_sheet_transcription.{json,md}`; only 15 of its names match the 2026
  PDF, so the PDF wins everywhere.
  - A's two questions answered by the orchestrator, in D's prompt: the two uncaptioned
    "Other" characteristic hexes and the eleven blank `Skill/Ability` rows are slots the
    referee names; free text, a typed value and DM; keys keep the PDF's spelling.
  - **Johnny's two lines:** `cp findings/character_sheet_fields.json
    rules/mgt2e_character_sheet_fields.json` and `npm run rules:gen`.
- D has begun the character sheet's design (`findings/character_sheet_design.md` and a
  mockup page are on disk). A goes on to `a_live_sheet_design.md`.

## 192. The character sheet's fields are in `rules/`; G17 and G19 answered yes (2026-10-07, late)

- **Johnny copied the inventory:** `rules/mgt2e_character_sheet_fields.json` equals
  `findings/character_sheet_fields.json` byte for byte, and `npm run rules:gen` wrote
  `packages/engines/src/generated/rules/mgt2e_character_sheet_fields.js` (420 entries).
  D's build of the character sheet is unblocked.
- **G17, yes:** the sheet, the name, the portrait and the summary are live and shared;
  each game keeps its own layer (where the character is, links, the referee's notes),
  unseen by the player unless the referee shares it. **G19, yes:** a game keeps a frozen
  copy, marked as no longer live, when a live character leaves it. Both are now at the
  foot of `prompts/a_live_sheet_design.md` as rulings, not assumptions. All four of
  G17 to G20 are closed.
- Handed out: A `a_live_sheet_design.md`. Nothing is open with Johnny. No push since
  `9a95a0c`.

## 193. C's city lights step 4 accepted as engineering and held: the worlds are too dark; D's character sheet design accepted as the look, to be re-based on the PDF (2026-10-07, late)

**C, `prompts/c_city_lights_4.md`.**
- Checked here: `surface_city_cube`, `surface_city_gates`, `surface_gl` 11 of 11;
  `city_design_s4_rhylanor_compare.png` and `..._pavabid_compare.png` looked at.
- C's findings, accepted: the grey night cloud of step 3 was a spill of blurred
  population from cube B (the same patch 28.9 → 68.5 in luminance), outside the design
  and now dropped; the Pavabid crop's second disc is Pavabid A-X, 3 px away at the pin;
  glow weights raised to 1.15 tight and 0.55 broad; worst frame 33.2 ms; glow adds no
  cube bytes. Parity: the run before the glow exited 1 on one shade row (Ocean radius
  1100, 2 pixels, 1 channel step, marked `allowedDrift`, which the driver does not read);
  the run at the end exited 0. **A defect in the driver to list, not patched.**
- **Held, on the orchestrator's reading of the strips:** step 4 is the more correct
  picture and the less impressive one. Rhylanor (population 9, TL15) goes from a night
  side alive from limb to terminator (step 2, live) to a few glowing knots on black, and
  is nearly a dark disc at far 60; Pavabid (population 8) shows almost nothing. Johnny's
  bar is spectacle, and most worlds are seen at 20 to 60 px.
- **`prompts/c_city_lights_4b.md`:** three variants for Johnny to choose from, by the
  ledger's own parameters: A (step 4), B (fuller network and far-size glow for high
  population), C (B plus a low urban sheet on built ground for the highest population
  and tech). One strip per world (step 2 | A | B | C, near 320 and far 60/40/20), an
  orbit view for B and C, the numbers, the acceptance list and budget re-checked.
  **Steps 3, 4 and 4b go live together**, after Johnny picks.

**D, "Report 2" on `prompts/d_character_sheet.md` (the design; report 1, the nav
console's second pass, has not been pasted).**
- D stopped after the design, as told, because the rules file was not yet in `rules/`
  when it looked. It is now (§192). The design (`findings/character_sheet_design.md`, 36
  `kc_*`) is **accepted as the look**, but it stands on the 2026-10-02 transcription, and
  it was made before the "move house" and "Google Sheets" rules were added to the prompt.
- **`prompts/d_character_sheet_2.md`:** re-read the prompt; re-base on the PDF's fourteen
  sections and 420 widgets; then build. D's six questions are answered there from the
  PDF: one Personal Data File section; the profile strip is display only, values as
  typed (the 2026 PDF has no profile widgets); no Total Mass box on the PDF, so no total;
  no extra skill lines (the eleven blank rows are the room); Allies, Contacts, Rivals
  and Enemies have six name-and-notes rows each on the PDF, with linked records as pills
  above; the DM is typed.
- **The local API.** D could not do its browser pass: port 8787 is held by a process
  (pid 69888 at the time) that does not answer, and another listens on 8788. Agents are
  sharing and colliding on local servers. D's prompt now says: your own API on a free
  port with its own state directory, your own Vite pointed at it, stopped when done.
  The same line is owed to E and B in their next prompts. Johnny was told about the hung
  process.
- **Owed from D's unpasted report 1:** whatever the readout-against-tag fix needs from
  Agent A (the tag boxes handed to the renderer).

## 194. E's journal screens accepted and held for K7b; a push of the ship controls, A's journal data and the character sheet's rules file rehearsed (2026-10-07, late)

**E, `prompts/e_journal_build.md`: accepted.** `journal_screen` and `pane` tests 15 of 15
here; `kj_built_pane_full.png` looked at beside the mockup. New: `workspace/journal/`
(seven files). E's lines in shared files, as listed in its report: `CampaignPanel.vue`,
`shell/pane.ts`, `shell/PanelHost.vue`, `views/MapView.vue`, `router.ts`, `pane.test.js`,
a block in `contrast.test.js`. E ran its own API on port 8797 from a copy of the local
state, because 8787 was locked.
- **Held from the push:** with the tab live and no table on the server, every entry
  would be queued for ever. The screens go live with B's K7b.
- **Second pass, `prompts/e_journal_build_2.md`:** a list row shows raw token text
  (`[[cr_…`); the entry sits about 95 px below the list's top; the orbit view's Campaign
  control treats an open journal as closed (E gets the least lines in
  `views/OrbitView.vue`); the Players switch, the handout and rumour menu, Locate, Show
  in orbit and 1,100 px were not exercised; search at 2,000 entries is to be measured.

**Johnny pasted D's "Report 2" a second time**; it is the one answered in §193
(`prompts/d_character_sheet_2.md`). D's report 1 (the nav console's second pass) is still
unseen.

**A push, rehearsed: `findings/push/ships_and_schema_files.txt`, 26 files, by path.** The
nav console and its second pass as they stand on disk (D's `orbit/` files,
`views/OrbitView.vue`), A's route editing, K7a, K7c and the three small changes
(`campaign/`, `packages/shared`), `rules/mgt2e_character_sheet_fields.json` and its two
shape tests, with the tests of each. **Left out:** E's journal screens and its lines in
the five shared files (held for K7b), C's `surface/`, `dev/city-lights/`, `router.ts`
and `platform/browser.ts` (held for Johnny's pick of 4b), B's `apps/api` (reports
owed). Scratch copy of `9a95a0c` with exactly those 26: `vue-tsc` exit 0, `vite build`
done (`index-Cymliaqk.js`, `OrbitView-pwNwR-5S.js`), `tsc -p apps/api` exit 0, 943
tests, 931 pass, 0 fail, 12 skipped, check clean.
- **Unread in this set:** D's second pass on the nav console (the first leg editable at
  its departure instant; a route with a jump after it) is covered by its own tests,
  which pass, but D's report on it has not been seen and its browser pass was blocked by
  the stuck local API. Said plainly to Johnny.
- After the push, check by content: the live orbit chunk holds "already departed".

## 195. D's report 1 (the nav console's second pass) read: accepted on its tests, browser pass owed (2026-10-07, late)

- **Built, tests only:** `storedRoute` reads `departs < days` and `replaceLegsFrom`
  refuses only `departs < notBefore` (line 172 of `campaign/track.ts`, D's one permitted
  line), tested at the instant and a second either side; a stored waypoint in hand is
  held by its leg's place on the track and goes back, with the store's words, if its leg
  departs under it; a route with a jump after it is editable (`after` replaces `locked`
  in `course.ts`; `onwardLegs`, `appendedTail`, `editedTail`), the jump and what follows
  shifting with their durations kept (171 h to the hour in the tests), one write, one
  Undo. **Accepted on its tests.**
- **D's question, ruled by the orchestrator (a detail of G12):** new legs laid before a
  jump that no in-system leg precedes: the jump waits if they end before its departure,
  and moves later by the overrun if not. Yes, as built.
- **Not done:** nothing in that step was seen in a browser (the local API on 8787 accepts
  and never answers; D rightly did not restart what it did not start). All of it is now
  first in `prompts/d_character_sheet_2.md`, on D's own API port. **Section 3** (the
  readout against a tag) needs `avoid` boxes on `PlotReadout`:
  `prompts/a_readout_avoid.md`, for A, to start only after the push is made or skipped
  (it edits two files of the by-path push).
- **The §194 push stands as rehearsed.** What it carries unverified in a browser: the
  nav console's second pass only. The first pass was seen in a browser by D.

## 196. Pushed `1f5eccc` (nav console, route editing, journal data, character sheet fields), live; Johnny on dragging waypoints (2026-10-07, 23:05 Central)

- **Pushed and live:** `1f5eccc`, the `test` run green. The live entry and orbit chunk
  are `index-Cymliaqk.js` and `OrbitView-pwNwR-5S.js`, **the rehearsal's names exactly**
  (the shared package is committed now, so the §182 trap is closed for it), and the live
  orbit chunk holds "already departed".
- **Johnny on the live build:** "the new nav modal is badass… Man that nav panel looks
  AMAZING!!!" And four things, recorded as follow-up 32 in `slice_2_campaign.md`:
  1. **"The one key key key thing": while a waypoint is dragged, the celestial bodies
     must move along their orbits**, so he can see where the waypoint will be at that
     time.
  2. **Right-click stops plotting points.**
  3. **Moving a middle waypoint makes the one after it vanish**; every other point must
     stay visible during a move.
  4. **The cursor must change over an existing waypoint**, so it reads as editable and
     not as "another point will drop here".
- **`prompts/a_nav_drag.md`, Agent A, now, ahead of the live sheet design.** A holds the
  picture; D is on the character sheet. A is given D's orbit files for this step
  (`OrbitCanvas.vue`, `course.ts`, `ship_marks.ts`, `commands.ts`, `NavConsole.vue`,
  `views/OrbitView.vue`) and D is told to stay out of them and to skip the browser items
  it owed, which move to A (item 6). The readout `avoid` boxes are folded in (item 5;
  `a_readout_avoid.md` superseded). **It must be seen in a browser, signed in, on A's own
  API port**: A stops before building if it cannot sign in locally (it could not, earlier
  in the slice; the harness is in `agent_d_brief.md`).
- **Right-click, as built unless Johnny says otherwise:** it ends the laying of points;
  what is laid stays in the console, uncommitted; the ship stays in hand. Asked of
  Johnny: should it add the course instead.
- **Still local after this push:** E's journal screens (held for K7b), C's city lights
  steps 3 and 4 (held for his pick of 4b), B's `apps/api` work.
- **Johnny, minutes later, narrowing note 1:** "only one world is moving and the effect
  is so subtle that it's difficult to see. I don't think it's showing where the moons
  will be. I realized I'm in a bad system where some of these planets take a hundred
  years to complete an orbit." So the outlines exist but only for the body aimed at, too
  faint, and not for moons; and slow outer worlds rightly barely move. Added to item 1 of
  `prompts/a_nav_drag.md`: every planet and every moon at the held point's arrival; the
  effect strengthened while a point is in hand; a deliberate "holds its place" mark for a
  body whose "then" is within its own disc; checked at Regina and in one slow system.
- **Johnny, a third note, on the look of "then":** "the planet outline could stay, but we
  need like a ghost planet in the center, so it's like a holographic teal version of the
  planet, or we can re-use those wireframe spheres we use in the moons reveal animation."
  In `prompts/a_nav_drag.md` item 1: the outline with a ghost planet inside, built from
  the Moons reveal's wireframe sphere (C's code in `OrbitRenderer.ts`, called, not
  copied) with a low teal fill, for planets and moons, a filled dot below the size where
  a sphere is noise; plus one comparison frame of the tinted-disc option with each one's
  cost, so he can choose. The tree is left on the wireframe.
- **Johnny, a fourth note:** "after we click on a planet to dock at, that should sorta
  switch the plotter tool to just a regular arrow and now the user can make course
  edits." In `prompts/a_nav_drag.md` item 4: two states with a ship in hand, laying (the
  plotter's cursor, open-space presses keep laying) and editing (the regular arrow,
  waypoints picked up and moved); laying ends on a press on a body (that body is the
  arrival) or on a right-click; the console's control and P start it again; the course
  is uncommitted in both until "Add course". This agrees with the default taken for
  right-click (the course stays in the console), which is still to be confirmed.

## 197. B's three reports read: K7b accepted and its push rehearsed; the hardening accepted with one fix first; the v6 open cases put to Johnny (2026-10-07, late)

- **K7b (`prompts/b_journal_k7b.md`): accepted.** `campaign_journal` in the Durable
  Object (schema version '3' on the meta row), merged into the page by `seq`, applied in
  the same transaction with `baseRev` conflicts, tombstones restorable, `mentions`
  recomputed by the server, the 20,000 limit, the export. Item 6: deleting a record
  leaves a record-anchored entry live and unchanged, as it leaves a record-anchored
  record. Item 7: the page, the apply, the limit and the export include the journal;
  `copyRecords` does not (K10's business); snapshots are still a stub and nothing writes
  `journalHash`. B ran two `tests/api` files with `RUN_API_TESTS=1`, not the whole suite.
  - **Push rehearsed, by path, `findings/push/k7b_files.txt` (6 files):**
    `universe/campaign.ts`, `universe/schema.ts`, `routes/campaign_export.ts`, three
    `tests/api` files. None holds a line of the hardening. Scratch copy of `1f5eccc`
    with those: `tsc -p apps/api` exit 0, `vue-tsc` exit 0, 949 tests, 936 pass, 0 fail,
    13 skipped, check clean. The server then stores entries; nothing sends one until E's
    screens are pushed (E is in its second pass).
- **The hardening (`prompts/b_build_hardening.md`): all eight items on disk, accepted,
  not pushed.** Six hexes of a slice at a time with the same bytes; `head` for the
  existence check; the total written once, when no sector is open and every report is
  listed (schema version 2, counts only); cache headers; `resolveCatalogue` skipping an
  empty catalogue; `POST /api/admin/truth/builds/:version/remove` for a version that
  never released. Measured with a simulated 20 ms R2: one 25-hex slice 2,481 ms serial,
  616 ms parallel; not pinned by a test. B would raise `max_concurrency` to 12 after
  deploy (Johnny's file).
  - **One fix first (`prompts/b_hardening_2.md`):** the sector index went from
    `immutable` to `max-age=60`. Right during a build, wrong for a released version:
    every visitor's map would re-fetch or re-validate it every minute
    (`architecture.md` §10.1). Release is to make a version's files immutable again.
    Existing versions keep their stored headers, so nothing live is affected.
  - The same prompt asks for the smallest safe preview of an unreleased version (an
    admin page or route: one hex of v6 through the dossier), the whole `tests/api` suite
    on B's own port, and a test pinning the parallel slice.
- **`findings/v6_open_cases.md`: accepted.** Fourteen liquid cases (694,946), two climate
  cases (43,376: 43,333 are empty orbits with no mean temperature, 43 a mean stored as
  NaN), two blocking (1,247). Four families hold 96% of the unresolved: Ice on
  atmosphere 0 with a warm high (324,812, cases 1 to 3); Water on atmospheres 2 to 9 and
  13 to 15 outside 273 to 373 K (171,965, cases 6 to 9); an unnamed exotic liquid on
  atmospheres 10 to 12 with no listed liquid in range (112,091, case 13); a named exotic
  liquid outside its own range (57,623, cases 10 and 11). Put to Johnny as three
  questions, each with the options the rules files can express and no recommendation
  from Traveller knowledge. **A ruling needs another derived build**; release does not
  rerun the checker. There is no way to open the site on v6 today.
- Johnny asked again for C's and D's pastes: `c_city_lights_4b.md`,
  `d_character_sheet_2.md`.

## 198. Johnny: "do your best" on v6's liquids; characters are first-class, owned by either side, with pregens; Roll20 later (2026-10-07, late)

- **v6's three liquid questions, delegated:** "I want to move on from ice and stuff for
  now, so just do your best with 1 - 3." Taken as the rules authority delegating these
  three, not as leave to bring rules in from memory. The orchestrator's choices use only
  the liquid windows and the vacuum list already in `rules/`, and only labels and
  statuses the data already has, and are **provisional**, marked so in the policy:
  Ice or Water whose mean is below Water's melting point is **Ice**; Ice on a vacuum
  whose mean is at or above it, and Water or Ice above the boiling point, is **no free
  liquid** (the coverage figure untouched); on atmospheres 10 to 12 with no listed liquid
  in range, **Unknown Exotic Liquid** (kept, or replacing a named liquid outside its own
  window). The 27 with no finite mean stay unresolved. `prompts/b_liquid_policy_2.md`
  (after `b_hardening_2.md`): the rows as data in `liquidPolicy`, tests, the whole-chart
  effect counted, the data defects looked at (`findings/v6_data_defects.md`), empty
  orbits taken out of the "no climate word" count. **No build in that step**; v7 is one
  console command for Johnny later, then the preview, then his decision. Recorded as G21.
- **Where the character sheet is on the live server: nowhere yet.** Only its field list
  is live (`rules/`). D is building it; it will be on a person record's page, as the
  panel's default, with "Start a character sheet".
- **Characters, in his words:** "should we create a new campaign element called
  characters? Characters are so important though that they maybe are 'Player Characters'
  or something, so either the person can have their own account and build it on their
  account, or the ref can build it on their account and then give someone else access on
  their account. Let's build for both ways. So like for a virtual con, there can be
  pregens, and then we could figure out Roll20 API stuff later."
  - Taken into `prompts/a_live_sheet_design.md` as a new section: a **Character** is its
    own shared object owned by an account, appearing in a game as a person record that
    points at it; **either side may own it** and share with the other; **pregens** handed
    out by a link claimed on sign-in; a home for "my characters" outside any campaign;
    one clean place left for outside games (Roll20), with its API as open research and
    nothing designed on it from memory.
  - D's build is unchanged: the sheet on the person's page, behind the boundary that
    lets its values move.
  - `plan.md` "After 5" gains the Roll20 link as backlog.
- **Asked of Johnny:** D2 again (switch on Discord and Google sign-in before players are
  invited: the code already has both, the secrets are his); and whether a claimed pregen
  is shared or given.

## 199. Johnny parks v6 and the climate work, puts the character MVP first, and the swarm is restarted (2026-10-07 to 10-08)

- **Parked by Johnny:** any definitive liquid ruling and every derived build ("it's so
  damn slow and we're not being smart about it at all… I want to essentially rebuild
  that whole planetary generator anyway… build it right from the start with a
  foundational way that I understand vs. inherit from the old fork"). v6 stays staged,
  unreleased. `b_liquid_policy_2.md` and `b_hardening_2.md` are parked; the hardening and
  the start of its second step stay on disk, unpushed. A generator rebuild is a future
  direction, not yet written into `plan.md`.
- **Character MVP first, "in the fewest amount of turns".** No paper round:
  `directives/character_mvp.md` is the contract (a Character owned by an account; access
  by grant; sharing by a claimed link; one Durable Object per character as the live
  room; every box a flat field; pregens as duplicates). Prompts: `b_characters.md`,
  `a_characters_client.md`, `e_characters_screens.md`; D continues
  `d_character_sheet_2.md`, then "D, Part 2" in the spec. `a_live_sheet_design.md` is
  withdrawn. A's `a_nav_drag.md` and E's `e_journal_build_2.md` wait behind.
- **Pushed since §196:** `3b32761`, the journal's server step (K7b).
- **Most agent sessions were lost.** `directives/swarm_restart.md` restarts each as a
  fresh session: the common rules, an audit of the lane to green first, what the
  predecessor left on disk, the task. On disk at the restart: A's partial nav drag
  (`orbit/`), B's parked hardening and partial second step, C's steps 3, 4 and partial
  4b, D's partial character sheet build (`workspace/`), E's journal screens. No
  character server or client exists yet.

## 200. C's step 4b on disk and accepted: three looks, the tree on C (2026-10-08)

- The restarted C found 4b complete from its predecessor: `CITY_LOOK_A` (step 4), `B`
  (brighter network), `C` (B plus the urban sheet on the highest-population, highest-tech
  worlds) in `surface/enhanced/city_look.ts`; the tree is on C; Johnny's pick is one line.
  `city_design_s4b_rhylanor_variants.png` looked at: B and C both restore a lit
  hemisphere at near and far sizes with black gaps kept; C is the fuller of the two.
  Rhylanor night mean at far 60: step 2 67.3, A 24.0, B 53.3, C 59.1. Pavabid and Cantrel
  barely differ between A, B and C. Worst frame 33.5 ms (B), 24.9 ms (C).
- **Recommended to Johnny: C.** Steps 3, 4 and his pick push together, by path and
  rehearsed, once he picks. `router.ts` now holds C's, E's and B's lines: hunks.
- Two things not C's: the build fails in `orbit/OrbitRenderer.ts` (A's half-done nav drag:
  an unused `HOLO_DOT_PX`, `GhostSpec` missing `disc`), which A's restart audit must
  clear; and `scripts/surface_parity.js` exits 1 on a shade row marked `allowedDrift`
  (a driver defect, listed, unpatched).

## 201. D: the character sheet is built, and Part 2 is built against a stand-in store (2026-10-08)

- The restarted D found the sheet build complete and green and finished
  `d_character_sheet_2.md` (homeworld pill, linked items, free-form sheets kept, the ship
  sheet intact after the shared refactor: 17 sections, 312 boxes; a mount test of all 420
  boxes with no store). **"D, Part 2" is built** against a small interface in
  `workspace/person_character.ts`: start a plain sheet, make this a Character, attach
  one of mine, live values under the reader, presence (name and dashed ring, a bar of
  who is here), detach with Undo, "shared with you", access removed. Not connected: A's
  store and B's schema are not on disk yet. Hooking up is one file. 1,014 tests, 0 fail.
  Not reviewed in the code by the orchestrator yet; accepted on the report for now.
- **Rulings on D's questions:** detaching a Character one can no longer reach keeps the
  **last boxes seen** as the frozen copy (G19), not an empty sheet: D to change. Two
  people in one box, both names shown: yes. The eight presence colours from existing
  tokens: yes. No `kind: 'pc'` on the record: fine for the MVP.
- **Open: D's "lost-save problem"** on the person's page (the ship sheet saves the same
  way), from a report the orchestrator never saw; its description arrived garbled.
  **Nothing with the sheet is pushed until it is described**; if it is in `campaign/`'s
  save path it is A's.
- The build still fails in `orbit/OrbitRenderer.ts` (five type errors, A's half-done nav
  drag); `vite build` alone passes.

## 202. Johnny picks look C for the city lights; the push rehearsed (2026-10-08)

- **Pick: C** (the tree is already on `CITY_LOOK_C`). G-pick recorded here.
- **Push by path, `findings/push/city_lights_files.txt`, 13 files:** C's `surface/`
  files (steps 3, 4, 4b), the one guard line in `platform/browser.ts`, two tests. **Left
  out:** `router.ts` (it also holds E's and B's lines) and with it the dev harness
  `dev/city-lights/`, which stays local. Scratch copy of `3b32761` with exactly those:
  `vue-tsc` exit 0, `vite build` done, `tsc -p apps/api` exit 0, 953 tests, 941 pass, 0
  fail, 12 skipped, check clean. The surface parity script was last run by C (map
  mismatches 0; exit 1 only on the `allowedDrift` shade row, the driver's defect).
- After the push: check the live surface chunk for `enhanced-cities-4`.

## 203. A live defect found by D: changes made while a save is in flight are lost (2026-10-08)

- **What:** commit a change, then two more while the first save travels: the later ones
  revert and never reach the server, with the conflict toast. Every record edit, link,
  journal entry, settings and clock change rides the same queue, so the live ship sheet
  has it today. D lost 7 of 110 boxes at 120 ms a box against a 20 ms local server.
  Repro: `findings/lost_save_repro.mjs.txt`.
- **Where, as D read it (`apps/web/src/campaign/commit.ts`, A's):** no flush is scheduled
  after a send finishes, and a change queued during a send keeps a stale `baseRev`, so
  the server calls it a conflict and the client takes the server's copy.
- **`prompts/a_lost_save.md`:** A fixes it at its next green point, ahead of the rest of
  the character client, and reports it alone so it can be pushed alone. **No sheet goes
  live before this fix.**
- **D's detach ruling is in** (the last boxes seen are the frozen copy). D's hookup of
  Part 2 to A's store waits for B's schema file to load: the tree is red while A and B
  are mid-step (`packages/shared/src/schemas/character.ts:224` throws on import;
  `characters/store.ts` has an unused import). Expected mid-flight; nothing is rehearsed
  from the whole tree until both report.

## 204. Backlog, from Johnny: the ice caps on the surface map look wrong (2026-10-08)

"Make a note there's some visual bugs with the surface map that we will have to come back
to, but I don't want to deal with it now so put it in the backlog; it's these stupid
icecaps, maybe our new generator will fix them later." His screenshot: a dossier's
surface map, Enhanced, captioned "Water, ice from 50°": the ice is drawn as hard
horizontal bands across the top and bottom rows of the unfolded map, cutting straight
through land and sea with a ruler edge, and patchy white blotches sit mid-latitude.
Recorded in `plan.md` "After 5". Not to be worked now. Agent C's lane when it is; it may
be overtaken by the generator rebuild. Also confirmed: the city lights push is
`f4ddd4c`.

## 205. Backlog corrected by Johnny: no Roll20 API; a 3D physics dice roller of our own (2026-10-08)

"There is no API to Roll20, so the backlog item there is to have a 3D physics dice roller
implementation that copies Roll20; there's a 3D dice roller library we can use for that.
Not priority, way backlog." `plan.md` "After 5" rewritten to that; the two mentions of
Roll20 in `character_mvp.md` and `prompts/b_characters.md` reworded. Nothing in the app
mentions Roll20.

## 206. The character MVP's first turn: every part on disk; the lost-save fix rehearsed for a push of its own (2026-10-08)

- **A, the lost-save fix: accepted.** `adoptRev` moves a still-queued change onto the
  applied rev, and the flush is rescheduled when a send ends with rows waiting (diff
  read). `tests/web/campaign_inflight.test.js`. **Push by path,
  `findings/push/lost_save_files.txt` (2 files)**; scratch copy of `f4ddd4c`: `vue-tsc`
  exit 0, `vite build` done, the campaign tests 59 of 59.
- **A, the character client: accepted on the report** (`apps/web/src/characters/`: list,
  handle, live with replay and fallback, sharing, `bindSheet`; 13 tests). A backed its
  half-built hologram out of `OrbitRenderer.ts`; the nav drag has the readout `avoid`
  boxes and `holdAt` only.
- **B, the character server: complete on disk, accepted on the report.**
  `packages/shared/src/schemas/character.ts`, D1 migration `0009_characters.sql`,
  `CharacterRoom`, the routes, a `CHARACTER` binding and migration tag `v2` in
  `wrangler.toml`; one live round trip with two cookies passed on B's own port.
  Departures in `findings/characters_contract_ready.md` (a role in `hello.you`; 404 for
  no access, 403 for an editor on an owner route). **Johnny applies the D1 migration:
  `npm --workspace apps/api run db:migrate`.**
- **E, the screens: accepted.** The Characters pane, new, duplicate, pregens, share by
  link, claim, with D's sheet fed by A's `bindSheet`; a set, its ack and the other side's
  update were seen with two sessions. E fixed the dev proxy for the socket
  (`vite.config.ts`: `ws` and the Origin rewrite) and made sign-in return to the claim
  path. Not clicked: duplicate, pregens, revoke, hand over ownership, a keyboard pass.
  **E's question, a defect for B:** the invite URL is written `http://traveller.voyage/…`.
- **Red build:** one unused `@ts-expect-error` in D's `workspace/character_sheet.ts`.
- **`prompts/character_mvp_close.md`** has each agent's last piece: D the hookup and the
  build; B the link's address and the server's push list (kept apart from the parked
  truth-build files); E the unclicked controls, then the journal's second pass; A back to
  `a_nav_drag.md`. Then two pushes: the server (with the migration), then the browser.
