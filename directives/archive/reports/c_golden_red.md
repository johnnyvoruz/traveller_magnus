# C golden red report
Prompt: prompts/c_golden_red.md
Status: done

## Changed files
- findings/golden_red_on_head.md: the note. `findings/` is gitignored.
- directives/prompts/c_golden_red.md: Progress lines. The file was already untracked.
- directives/reports/c_golden_red.md: this report.

No engine, fixture, rule, or test file was edited. Scratch copies were under `C:\Users\johnn\AppData\Local\Temp\voyage-c-*` and are removed after this report.

## Gates
npm test:      not run in the repository. The five cases and the parity test were run on archives. Results are in the note.
npm run check: not run.
typecheck:     not run.
fourth gate:   `git status --porcelain` before and after. The after listing adds this report. Nothing else is new. The note does not appear.

Before:

```
 M apps/api/src/jobs/inputs.ts
 M apps/api/src/jobs/reconcile_transform.ts
 M apps/api/src/jobs/truth_build.ts
 M apps/api/src/routes/admin.ts
 M apps/web/src/router.ts
 M directives/board.md
 M directives/handoff.md
 M directives/orchestrator_state.md
 M directives/prompts/b_marketplace_contract.md
 M directives/prompts/d_grow_one_act.md
 M packages/engines/src/mgt2e_world_engine.js
 M scripts/dev_make_admin.js
 M tests/api/truth_build.test.js
 M tests/generation/reconcile_derived.test.js
 M tests/golden/fixtures/engine_1.1.0/mgt2e_flesh_from_tsv.json
 M tests/golden/fixtures/engine_1.1.0/mgt2e_society_expand.json
 M tests/golden/fixtures/engine_1.1.0/mgt2e_topdown_bare.json
 M tests/golden/fixtures/engine_1.1.0/orbit_normalize_1.json
 M tests/golden/fixtures/engine_1.1.0/orbit_normalize_2.json
?? apps/api/src/jobs/release_seal.ts
?? apps/web/src/views/TruthPreview.vue
?? assets/HybridSurfaceMap_Design.md
?? directives/prompts/a_store_grow.md
?? directives/prompts/c_golden_red.md
?? directives/reports/done/b_marketplace_contract_blocked.md
?? directives/reports/done/d_grow_one_act_blocked.md
?? tests/generation/release_seal.test.js
```

After, pasted as `git status --porcelain` printed it once this report existed. Lines that were not in the before listing are other lanes working in the same tree during this pass (builder files, the checker, marketplace contracts, E's colour report). This pass added `directives/reports/c_golden_red.md` and Progress lines on `directives/prompts/c_golden_red.md`, which was already untracked. The note is ignored.

```
 M apps/api/src/jobs/inputs.ts
 M apps/api/src/jobs/reconcile_transform.ts
 M apps/api/src/jobs/truth_build.ts
 M apps/api/src/routes/admin.ts
 M apps/web/src/builder/index.ts
 M apps/web/src/builder/screen.ts
 M apps/web/src/builder/sectors.ts
 M apps/web/src/builder/store.ts
 M apps/web/src/builder/types.ts
 M apps/web/src/router.ts
 M directives/board.md
 M directives/handoff.md
 M directives/orchestrator_state.md
 M directives/prompts/b_marketplace_contract.md
 M directives/prompts/d_grow_one_act.md
 M directives/prompts/e_checker_colours.md
 M packages/engines/src/mgt2e_world_engine.js
 M scripts/check_allowlist.json
 M scripts/check_manifesto.js
 M scripts/dev_make_admin.js
 M tests/api/truth_build.test.js
 M tests/generation/reconcile_derived.test.js
 M tests/golden/fixtures/engine_1.1.0/mgt2e_flesh_from_tsv.json
 M tests/golden/fixtures/engine_1.1.0/mgt2e_society_expand.json
 M tests/golden/fixtures/engine_1.1.0/mgt2e_topdown_bare.json
 M tests/golden/fixtures/engine_1.1.0/orbit_normalize_1.json
 M tests/golden/fixtures/engine_1.1.0/orbit_normalize_2.json
 M tests/web/builder_store.test.js
?? apps/api/src/jobs/release_seal.ts
?? apps/web/src/views/TruthPreview.vue
?? assets/HybridSurfaceMap_Design.md
?? directives/contracts/b_marketplace.md
?? directives/contracts/b_public_games.md
?? directives/prompts/a_store_grow.md
?? directives/prompts/c_golden_red.md
?? directives/reports/b_marketplace_contract.md
?? directives/reports/c_golden_red.md
?? directives/reports/done/b_marketplace_contract_blocked.md
?? directives/reports/done/d_grow_one_act_blocked.md
?? directives/reports/e_checker_colours.md
?? tests/generation/release_seal.test.js
```

## Contract published
none

## Needs from others
none

## Questions for Johnny
1. The five golden cases pass on a clean `8118f72`. They fail when the uncommitted nine lines in `generateRotationalDynamics` (lines 1790–1797) are loaded against the committed fixtures: eight `liquidType` fields change from `Water` to `Ice`, and nothing else. Do those nine lines ship? This blocks the six held paths in `findings/push/engine_water_ice_files.txt`. The options are in `findings/golden_red_on_head.md` section 5. This pass does not choose one.

First bad commit: none. `aeada0e` passes the five against the legacy fixtures. `3d28e33` and `8118f72` pass them against `engine_1.1.0`, and those blobs are the same commit to commit.

Field paths, committed fixture then the nine-line engine: `mgt2e_topdown_bare` `worlds.9.liquidType` Water/Ice; `mgt2e_flesh_from_tsv` `mgtSystem.worlds.6.liquidType` Water/Ice; `mgt2e_society_expand` `mainworld.liquidType`, `worlds.16.liquidType`, `worlds.6.liquidType`, `worlds.9.liquidType` Water/Ice; `orbit_normalize_1` `worlds.6.liquidType` Water/Ice; `orbit_normalize_2` `worlds.6.moons.0.liquidType` Water/Ice.

Options, one line each: leave the commit and do not commit the six paths; commit the nine lines with the five fixtures; regenerate the five from the committed engine, which changes nothing; there is no committed change to revert.
