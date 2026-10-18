# Lane Z — the ten parked truth-build files: finish them or shelve them

Issued 2026-10-17 by the orchestrator. You may be a fresh session with no memory. Read `CLAUDE.md`,
`directives/manifesto.md`, `directives/board.md`, `directives/lanes/Z.md`,
`directives/prompts/c_liquid_minimal_review.md` (question 2 names the files), then this file. No git
but read-only (`git diff`, `git log` allowed), no deploy, no `rules/`. **Change no product file in
this pass.**

## The problem
Ten uncommitted files have sat in the tree since 2026-10-07, held out of every push by a filter in
the orchestrator's push script:

- changed: `apps/api/src/jobs/inputs.ts` (+23), `reconcile_transform.ts` (+123),
  `truth_build.ts` (+145/−?), `apps/api/src/routes/admin.ts` (+206; its cap hunks already shipped
  in 1.1.12), `scripts/dev_make_admin.js`, `tests/api/truth_build.test.js`,
  `tests/generation/reconcile_derived.test.js`;
- new: `apps/api/src/jobs/release_seal.ts`, `tests/generation/release_seal.test.js`,
  `apps/web/src/views/TruthPreview.vue`.

Every push list has to leave them out by hand, other lanes can't touch those files safely, and
truth v10 has shipped since without them.

## Do
1. **Say what they are:** for each file, what its change does, in two or three sentences, and which
   feature it belongs to (a truth reconcile step, a release seal, an admin preview of a truth build).
2. **Against today:** with v10 live and engine e1.2 in the tree, is each change still needed,
   already done another way, or in conflict with code that shipped since? Read the shipped versions
   of the same files (`git show HEAD:<path>`) and say where the parked hunks no longer apply.
3. **Run them** in a scratch copy only (`git archive HEAD` plus these ten into a folder under the OS
   temp folder, as the orchestrator's clean copies do): `npm test`, the typecheck, and
   `RUN_API_TESTS=1` for `truth_build` on your own port. Give the results.
4. **Recommend one, with the work it takes:**
   - **finish:** a prompt-sized plan (owner lane, steps, gates, migration if any, what Johnny runs);
   - **shelve:** move them out of the tree to `findings/parked/truth_build_2026-10-07/` with a
     README saying what they were and how to bring them back (Johnny or the orchestrator moves them;
     you write the README and the list);
   - **split:** which parts to finish and which to shelve.
   Name anything that needs Johnny's word (a release step, a new admin screen, rules).

## Gates
`npm test` and `npm run check` on the real tree, unchanged.

## Report
Write `directives/reports/z_parked_truth_build.md` from the template.

**Owned:** read-only on the ten files; your scratch copy; `findings/parked/` (the README only); your
report.

After each meaningful step, append one line under Progress: "done: X. next: Y."

## Progress

done: read the ten files' diffs against HEAD d6658f5 and the three new files; read b_release_path (verdict "the ten stay out", the cap shipped by patch in 1.1.12) and upload_truth.js (index.json max-age=60, "sealed by release", but HEAD's release does not seal). next: scratch copy under %TEMP% and the runs.
done: scratch copy %TEMP%\z_parked_tb (git archive HEAD + the ten, own @voyage junctions, rules:gen and names:gen): npm test 1849/1805 pass 0 fail, typecheck clean; truth_build on port 18895 with own state and a throwaway local auth secret: 10/11, the one failure is the test's 'all' build against the 1.1.12 one-sector cap (line 1523). next: verdict, README, report.
done: verdict split (finish dev_make_admin, inputs, the remove route, a cap-safe truth_build test; shelve the reconcile hardening, the seal as written, the preview); README findings/parked/truth_build_2026-10-07/README.md and report written; real-tree gates: npm test 1898/1859 pass, 1 fail (journal_mention, another lane's, passes alone), check clean; copy and state deleted, junctions unlinked first, no server left. next: Johnny's questions 1 to 4.
