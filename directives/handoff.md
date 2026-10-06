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
