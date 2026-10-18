# Report: z_parked_truth_build

**Verdict: split.** Finish four small parts. Shelve the reconcile hardening, the release seal as written, and the preview screen.

## Prompt

`directives/prompts/z_parked_truth_build.md` (issued 2026-10-17). Base commit `d6658f5` (1.2.6). No product file was changed.

## Status

Done.

## 1. What the ten are

- **`jobs/inputs.ts`** (+22/-1), truth inputs: `resolveCatalogue` treats `inputs/<v>/` holding only `sectors.json` as no catalogue and walks on to the source version. This covers a leftover file from an aborted upload.
- **`jobs/reconcile_transform.ts`** (+123), the reconcile step of a derived build:
  - a parallel slice (`RECONCILE_PARALLEL` 6, `mapInOrder`, `reconcileSliceOrdered`);
  - a counts-only total report (`TOTAL_SCHEMA_VERSION` 2);
  - `commitTotal`, which writes the total only when every sector is done and listed.
- **`jobs/truth_build.ts`** (+89/-56), reconcile step and release seal:
  - Uses the above.
  - R2 `head` replaces `get` for existence checks.
  - The total report is written by `writeTotalIfComplete`, which closes a race where a finisher could overwrite a full total with a short one.
  - Sector indexes and reports are written with `max-age=60` until release.
- **`jobs/release_seal.ts`** (new), release seal: `sealPublicObject` re-puts the same bytes with `immutable`.
- **`routes/admin.ts`** (+201/-5), three features:
  - `POST /api/admin/truth/builds/:version/remove`, for a building or failed version, with a `truth.remove` audit row;
  - the release seals indexes and reports before it writes the manifest;
  - `GET /api/admin/truth/preview`, one hex of a build beside the newest release.
  - The cap hunks are not in this diff: HEAD `admin.ts:1`, `:74` and `:214` already carry `ONE_SECTOR_LIMIT`.
- **`scripts/dev_make_admin.js`** (+4/-1), test infrastructure: passes `--persist-to $VOYAGE_PERSIST_TO`.
- **`tests/api/truth_build.test.js`** (+127/-14): worker tests for remove, preview, seal and totals.
- **`tests/generation/reconcile_derived.test.js`** (+101): parallel equals serial, two finishers, leftover catalogue.
- **`tests/generation/release_seal.test.js`** (new): seal bytes and header, reads in flight, unreleased index at 60 s.
- **`views/TruthPreview.vue`** (new): the admin preview screen. No router entry imports it.

## 2. Against today

- **Do they still apply?** Every changed file was last committed on 2026-10-06 (`6fc2d60`) or earlier, except `routes/admin.ts`, committed in `8b111fc` (1.1.12). The working-tree diffs are against HEAD and apply as they stand. Typecheck and `npm test` are clean in the copy.
- **Conflict: the one-sector cap.** The cap (1.1.12) refuses any build or retry of more than one sector (HEAD `admin.ts:74`, `:214`). The derived build that the reconcile hardening speeds up is a multi-sector job, so it can't be started on the server today.
  - With `sectors_total` 1, the total-report race can't happen.
  - The parked test's `sectors: 'all'` builds fail against the cap. So does HEAD's own test at `truth_build.test.js:1516`.
- **Already done another way.** v10 was built locally (`tools/truth/build.js`), uploaded with `tools/truth/upload_truth.js` and released. Lane B proved that path without the ten (`reports/done/b_release_path.md`: "the ten stay out").
- **Half shipped: the seal.**
  - `upload_truth.js:25` says "truth/<v>/sectors/<slug>/index.json (max-age=60; sealed by release)", and `:167` uploads with `SHORT`.
  - HEAD's release doesn't seal (no seal in HEAD `admin.ts`). So v10's 512 sector indexes stay at `max-age=60`. That's slower caching, not wrong data.
- **The parked seal at v10 size.** It runs in the release request: a get and a put per index, and per report when the version is reconciled. That's about 1,000 to 2,000 extra R2 calls.
  - Cloudflare's limits (developers.cloudflare.com/workers/platform/limits): Workers Paid allows 10,000 subrequests per invocation, and Workers Free allows 1,000 to Cloudflare services.
  - On Free, a v10-sized release would fail. On Paid it fits, but it does all that work in one request.
- **`dev_make_admin.js` is still needed.** HEAD `tests/api/session.js:17` adds `--persist-to` for its own wrangler calls, but `adminCookie` runs `dev_make_admin.js`, which ignores it. The admin then lands in the default state, not the test's. `campaign.test.js:533` and `parity.test.js:76` call `adminCookie`.
- **The rest:**
  - `inputs.ts`: still valid and small.
  - The remove route: still useful for clearing a failed local or server build.
  - The preview: no screen is wired to it.

## 3. Runs in a scratch copy

- **Copy:** `%TEMP%\z_parked_tb`, made from `git archive HEAD` plus the ten.
  - Its own `node_modules\@voyage\*` junctions point into the copy. Third-party modules are junctioned to the repo.
  - I ran `rules:gen` and `names:gen`, because `packages/engines/src/generated/` is gitignored.
- **`npm test`:** 1849 tests, 1805 pass, 0 fail, 44 skipped.
- **`npm run typecheck`:** clean.
- **`npm run check`:** clean.
- **`RUN_API_TESTS=1 node --test tests/api/truth_build.test.js`:** 10 of 11 pass.
  - The run used port 18895, inspector 19895, and its own state `%TEMP%\z_parked_state` with migrations 0001–0020 applied.
  - The failure is "truth build" at line 1523: 400 "The limit is one sector per request." where the test expects 202. This is the test against the shipped cap, not a fault in the parked code.
  - The copy got an empty `apps/web/dist`, which wrangler's assets setting needs.
  - The copy also got a scratch `apps/api/.dev.vars` holding only a freshly generated, throwaway `BETTER_AUTH_SECRET`, which the admin cookie needs. I didn't read, copy or print the real file.
- **Cleanup:** the copy and the state were deleted. See Gates.

## 4. Recommendation: split

**Finish.** Owner: Lane B, which owns `apps/api`. `routes/admin.ts` is "nobody (parked hunks)" (board line 46), so the orchestrator assigns it.

1. `scripts/dev_make_admin.js`: as parked, 4 lines.
2. `jobs/inputs.ts`: as parked, with its `reconcile_derived.test.js` case ("resolveCatalogue skips a catalogue that has no sector files").
3. `routes/admin.ts`: the remove route only, rebuilt from HEAD plus that hunk, as `findings/push/admin_cap_only.patch` was. Include the remove block of `truth_build.test.js`.
4. `tests/api/truth_build.test.js`: change the `sectors: 'all'` builds to one sector, or to a loop of one-sector requests, so the file is green under the cap.

- **Gates:** `npm test`, typecheck, check, and `RUN_API_TESTS=1` truth_build, campaign and parity on their own ports.
- **Migration:** none.
- **Johnny runs:** nothing. No release step changes.

**Shelve** to `findings/parked/truth_build_2026-10-07/` (README written):

- the reconcile hardening: `reconcile_transform.ts` additions, the `truth_build.ts` changes, the parallel and two-finisher tests;
- the release seal: `release_seal.ts`, the seal hunk of `admin.ts`, `release_seal.test.js`;
- the preview: the preview hunk of `admin.ts` and `TruthPreview.vue`.

The reconcile code is unreachable while the cap stands. The seal costs too many R2 calls in one request. The preview needs a router entry and a screen nobody has asked for.

**Mechanics:**
- `admin.ts`, `truth_build.ts` and `truth_build.test.js` are partly finished and partly shelved. The shelf keeps the whole parked file, and the finish rebuilds from HEAD with only the named hunks.
- After that the working tree holds none of the ten as uncommitted, and the push filter can go.

**The seal, if wanted later:** do it in the local tool, not the release request. For example, an `upload_truth.js --seal <v>` that re-puts each index with `immutable` after release, through the S3 API it already uses. The alternative is to drop "sealed by release" from `upload_truth.js:25` and accept 60 s.

## Changed files

- `findings/parked/truth_build_2026-10-07/README.md` (new): what the ten were, the base, the copy's results, how to bring them back, and the seal note.
- `directives/prompts/z_parked_truth_build.md`: Progress lines.
- `directives/reports/z_parked_truth_build.md`: this report.
- No product file was changed, and the ten were not moved.

## Gates

- On the real tree, unchanged: `npm test` 1898 tests, 1859 pass, 1 fail, 38 skipped. The failure is `tests/web/journal_mention.test.js:41`, which passes alone (3 of 3). It's another lane's web work in flight (`apps/web/src/workspace/journal/` is modified in the tree), and I didn't change it.
- `npm run check`: manifesto clean.
- Servers: `truth_build` started and stopped its own wrangler dev on 18895/19895. Nothing listens there now, and no process names the copy, so I have no PIDs left to report.
- Cleanup: the copy's 131 junctions were removed with `rmdir` first, then the copy and its state were deleted. The repo's `node_modules` is intact (125 entries before and after).
- Nothing ran against production.

## Contract published

None.

## Needs from others

- **Orchestrator:** assign the finish to Lane B. Johnny or the orchestrator moves the shelved files.
- **`tools/truth`** is "nobody (Z has finished)" (board line 42): a seal step there needs an owner.

## Questions for Johnny

1. Split as above: finish dev_make_admin, inputs, the remove route and the cap-safe test, and shelve the rest? Recommended: yes. The other options are to shelve all ten (the remove route and the test fix are lost for now) or to finish all ten (that needs a new screen and the seal cost).
2. The release seal: drop "sealed by release" and keep v10's indexes at `max-age=60`, or add a seal step to `upload_truth.js`? Recommended: a seal step in `upload_truth.js` that you run after a release. It's cheap, local and off the Worker. The other answer is to drop the claim and accept 60 s.
3. Is the Worker on Workers Paid? Recommended answer: tell us, and we'll assume Free until then. On Free, the parked seal would fail a v10-sized release (1,000 calls to Cloudflare services per invocation). It decides whether a Worker-side seal could ever come back.
4. The admin truth preview screen (`TruthPreview.vue` and `GET /api/admin/truth/preview`): shelve it, or wire it into the admin pages? Recommended: shelve. Local builds are checked with the local tools before upload.
