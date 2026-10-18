# Lane C — a second read of Lane Z's water and ice patch before it lands

Issued 2026-10-13 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/C.md`,
then `findings/liquid_temperature_minimal.md`,
`findings/liquid_temperature_minimal_landing.md`, your own
`findings/regina_temperature.md`, and this file. No git but read-only, no deploy, no
`rules/`, no Traveller rule from memory: quote `rules/` or `assets/` with file and line.

Lane Z (another model, working outside this project) wrote
`findings/liquid_temperature_minimal.patch`: 29 files, engine 1.2.0. It supersedes
Z's first, larger patch (`liquid_temperature_once.patch`), which is not to be landed.
The orchestrator has checked only that the patch applies to the working tree
(`git apply --check` passes). **You change no file in the repo.** This is a review
with a verdict; then one small design note for your own surfaces.

## Where to work

A fresh copy outside the repo, for example `D:\webstorm\lane_c_review`: the working
tree as it is now (not `HEAD`: the patch is cut against the tree with the held engine
lines and the parked truth-build files in place), with its own
`node_modules/@voyage/{engines,generation,shared,api}` links pointing into the copy.
The repo's links point back at the repo and will make the copy test the wrong
engines. Apply the patch there. Delete the copy when you finish.

## Check, and answer each in the report

1. **The four gates in the copy** (`npm test`, `npm run check`, `npm run typecheck`,
   `npm run build`). Z reports 1591 tests, 1564 pass, 0 fail, 27 skipped.
2. **What the patch needs from files that are always held out of pushes.** These
   sixteen are uncommitted and parked: `packages/engines/src/mgt2e_world_engine.js`
   and five `engine_1.1.0` fixtures; `apps/api/src/jobs/inputs.ts`,
   `reconcile_transform.ts`, `truth_build.ts`, `release_seal.ts`,
   `apps/api/src/routes/admin.ts`, `scripts/dev_make_admin.js`,
   `tests/api/truth_build.test.js`, `tests/generation/reconcile_derived.test.js`,
   `tests/generation/release_seal.test.js`, `apps/web/src/views/TruthPreview.vue`.
   For each: must it be pushed with the patch, or can it stay out? The landing
   recipe says to put the five edited 1.1.0 fixtures back to the last commit: confirm
   the 1.1.0 fixtures then pass or are no longer run, and say which.
3. **Rule 4 of `CLAUDE.md`.** `tests/generation/parity_deviations_1.2.0.json` goes
   from 70 known differences to 456. Sort the new entries by cause. For each cause:
   the rules text it rests on (file and line), or "no text: a gap". Read twenty
   entries in full, across the causes, against the engine output.
4. **Engine version 1.2.0 and what is already stored.** A universe row carries
   `engine_version`. After the patch, what does the Worker do for a universe made on
   1.1.0 when its owner generates again, previews, or rolls again: 1.1.0 output,
   1.2.0 output, or a refusal? Name the code. Is anything stored re-read under the
   new rules?
5. **The one-sector cap** (`apps/api/src/jobs/one_sector.ts`, `routes/builder.ts`,
   `routes/admin.ts`, `jobs/generate_queue.ts`). Which requests that work on 1.1.11
   are refused after it: a selection across a sector border, `makeSectors` with more
   than one sector, a subsector or sector opened by address, the truth build and its
   retry? What does the person see in the Build pane for each? Run
   `tests/api/one_sector.test.js`, `builder_sector_generate.test.js`,
   `builder_density.test.js` and `builder_allowance.test.js` against the patched
   copy, one file at a time, on your own ports and state directory.
6. **The liquid decision itself** (`packages/engines/src/surface_liquid.js`). Read
   it against `rules/mgt2e_data.js` (the liquid table, about lines 756 to 771) and
   `rules/guideline_2_3`. List every number in the function that is not in `rules/`
   (273, 373 and any other) with where it comes from.
7. **The dice.** Z says the liquid die is drawn where 1.1.0 drew it, and a late die
   is drawn only for an exotic body that had none stored (411 draws in 270 of 2135
   systems). Confirm that a late draw cannot move any later roll in the same system.
8. **`tools/truth/upload_truth.js`.** Read it for anything that writes to production
   without `--remote --yes`, and for what it does to a version that is already
   released.

## Then, your own surfaces (a note, not an edit)

After the patch a body can carry `liquidType: null` and
`liquidStatus: { status: 'none' | 'unresolved', ... }`. List every place in
`apps/web/src/surface/`, `dossier/SurfaceStage.vue`, the disc baker and the
captions that reads `liquidType`, `hydroPercent` or a temperature to decide sea, ice
or colour, and what each draws today for those bodies. Write the exact edits (file,
function, lines) so no sea is drawn where there is no free liquid, and say which of
them are safe to make before the patch lands. Note the 273 against 273.15 offset in
`units.ts` and what it does to a world at exactly 273 K.

## Report

`directives/reports/c_liquid_minimal_review.md` from
`directives/reports/_TEMPLATE.md`, with a first line that is one of: **land as
written**, **land with these changes** (numbered), **do not land** (why). Notes and
tables in `findings/liquid_minimal_review.md`. Questions for Johnny written out in
full, recommended answer first. After each meaningful step append one line under
Progress: "done: X. next: Y."

## Progress
done: found the patch already applied on the working tree (uncommitted); no half-done review files. Copied the tree to D:\webstorm\lane_c_review and pointed its @voyage links at the copy. next: four gates in the copy.
done: the copy was taken before the patch was on disk; git apply --check passed and the patch is applied there. The unpatched copy's npm test was 1586 tests, 1562 pass, 0 fail, 24 skipped. next: four gates on the patched copy.
done: four gates on the patched copy. npm test 1595 tests, 1571 pass, 0 fail, 24 skipped. check clean. typecheck clean. build clean (index-Bod7iiCw.js). next: the four API files, one at a time.
done: one_sector 3 pass. builder_sector_generate fails at the three-sector box (400, the one-sector sentence, expected 202). density pass. allowance pass. next: write the report. Engine files left untouched.
done: report directives/reports/c_liquid_minimal_review.md and findings/liquid_minimal_review.md. Verdict: land with these changes. Book temperature roll left parked. next: delete the review copy.
done: deleted D:\webstorm\lane_c_review and the temp probe scripts. next: stop.

