# Lane B — what the push needs from the parked truth-build files

Issued 2026-10-13 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md` (the "Engine 1.2.0"
notice too), `directives/lanes/B.md`,
`directives/reports/done/z_liquid_minimal.md` ("Admin step"),
`findings/liquid_temperature_minimal_landing.md`, `findings/liquid_minimal_review.md`
(check 2), then this file. No git but read-only, no deploy, **no production command**,
no `rules/`, no Traveller rule from memory.

Your `b_one_sector_followups` report is accepted. This pass decides one line of push
1.1.12 and makes the release that follows it safe. You change **no file in the repo**
except the one test named in item 3.

## The question

After the push Johnny builds truth v10 on his own machine, uploads it with
`tools/truth/upload_truth.js` and releases it with
`POST /api/admin/truth/release/v10`. Lane Z proved that path end to end only in a
copy of the **working tree**, which holds ten uncommitted, parked truth-build files:
`apps/api/src/jobs/inputs.ts`, `reconcile_transform.ts`, `truth_build.ts`,
`release_seal.ts`, `apps/api/src/routes/admin.ts`, `scripts/dev_make_admin.js`,
`tests/api/truth_build.test.js`, `tests/generation/reconcile_derived.test.js`,
`tests/generation/release_seal.test.js`, `apps/web/src/views/TruthPreview.vue`.
They have been held out of every push. `routes/admin.ts` also carries the
one-sector cap (an import of `jobs/one_sector.ts` and two refusals), which must be
pushed.

## Do, in this order, in a copy outside the repo

1. **Make the pushed shape.** A copy of the last commit (`git archive HEAD`) plus
   every uncommitted file of the working tree **except** those ten, plus
   `routes/admin.ts` as the last commit's file with only the cap added (the import
   and the two `ONE_SECTOR_LIMIT` refusals). Its own
   `node_modules/@voyage/{engines,generation,shared,api}` links must point into the
   copy. Write that cap-only change as `findings/push/admin_cap_only.patch` (a diff
   against the last commit's `admin.ts`). `npm run typecheck` in the copy.
2. **Run the release path on that shape**, on your own ports and state directory,
   local emulation only: build one sector (`node tools/truth/build.js v9` limited to
   the Spinward Marches, as Z's recipe does), `upload_truth.js v9 --local`, release
   as a local admin, then `/api/health` and the released manifest. Does it release?
   Does the map's overview and one sector index read back with the local build's
   hashes? If it fails, name the parked file and the lines it needs.
3. **The parked test.** `tests/api/truth_build.test.js` line 1333 expects one
   `truth.remove` audit row on `vreconcile` and gets two (your own run, twice). Find
   which is wrong, the test or the route. If it is the test, fix that one assertion
   in the repo; if it is the route, write the fault and do not fix it.
4. **Verdict, first line of the report**, one of: **the ten stay out** (the release
   works without them; push `admin.ts` by the cap-only patch); **these go in**
   (name them, and say what each then needs: a migration, a gate, a test that must
   be green); **the release cannot be done on either shape** (why).

## Owned files (this pass)

`findings/push/admin_cap_only.patch`, `findings/release_path.md`,
`tests/api/truth_build.test.js` (item 3, one assertion at most),
`directives/reports/b_release_path.md`. Delete the copy when you finish.

## Gates

In the copy: `npm test`, `npm run check`, `npm run typecheck`, pasted. A red surface
test from Lane C's work in flight is not yours: say so. Worker files, one at a time:
`one_sector.test.js`, `health.test.js`, and `truth_build.test.js` on the working
tree's shape (not the copy's).

## Stop rule

Stop when the verdict is written.

Write `directives/reports/b_release_path.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: pushed shape outside the repo (HEAD plus the working tree except the ten; admin.ts is HEAD plus the cap). Cap-only patch written. Typecheck in the copy passed. next: local v9 Spinward Marches build, upload, and release.
done: local v9 Spinward Marches built, uploaded, and released. Overview hash and sector index hash match the local build. Health reports truthVersion v9. next: the audit assertion, then the gates.
done: audit count scoped to this call. Gates recorded. Verdict: the ten stay out. next: write the report and delete the copy.
done: report written and the copy deleted. next: stop.

