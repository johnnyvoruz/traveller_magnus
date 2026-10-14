# Lane Z liquid_minimal report
Prompt: prompts/c_liquid_minimal_review.md (landing of findings/liquid_temperature_minimal.patch)
Status: partial (applied to the working tree and verified; the four gates have NOT been run in the repo)
To: orchestrator

## Orchestrator checklist
1. Run the four gates in the repo now that it is quiet: npm test, npm run check, npm run typecheck, npm run build. Expected from the copy: 1595 tests, 1569 pass, 0 fail, 26 skipped; check, typecheck and build all pass.
2. The engine_1.1.0 fixtures are already back to the last commit (no diff). Nothing to do unless the gates show otherwise.
3. Tell every lane the engine is now 1.2.0. The parity ledger is tests/generation/parity_deviations_1.2.0.json and the fixtures are tests/golden/fixtures/engine_1.2.0/.
4. Send the browser follow-ups (below) to a web lane.
5. Assign directives/prompts/z_sheets_static.md to a web lane.
6. Leave the v10 upload and release to Johnny (admin step, below). Do not run them from a lane.
7. Commit, push and deploy the Worker as usual after the gates pass. The Worker now allows only one sector per request.

## Changed files (Lane Z patch, 31 files, applied 2026-10-13 20:11 CT)
- packages/engines/src/surface_liquid.js (new): decideSurfaceLiquid decides water or ice once per body. It replaces the nine held lines.
- packages/engines/src/mgt2e_world_engine.js, mgt2e_topdown_generator.js, reconcile_environment.js: call it. The reconciler takes its answer and does not decide again.
- packages/engines/package.json: "version": "1.2.0"
- apps/api/src/jobs/one_sector.ts (new), generate_queue.ts, routes/admin.ts, routes/builder.ts: one sector per request
- tools/truth/upload_truth.js, tools/truth/r2_s3.js: bulk R2 uploader with a resume ledger
- tests: parity.test.js, parity_deviations_1.2.0.json, golden/esm.test.js, golden/fixtures/engine_1.2.0/* (11 files), generation/liquid_temperature_census(.test).js, api/one_sector.test.js, tools/r2_s3.test.js, web/orbit_disc_batch.test.js, web/orbit_today_temp.test.js

## Verification (read-only, 2026-10-13 20:14-20:40 CT)
1. All 31 patch files are byte-identical (SHA-256) between the repo and D:\webstorm\lane_z_minimal, checked at 20:14 and again at 20:40. None differ, so the apply finished and no other lane has edited these files since.
2. engine_1.1.0 fixtures: git diff --stat shows no change. They were put back to the last commit at 20:10:58. The nine held lines are gone from mgt2e_world_engine.js because the file matches the copy, where the patch removes them. Its diff against HEAD is now +13/-24.
3. Nothing outside the patch was written at apply time except the five engine_1.1.0 restores. Later writes were not Lane Z source edits: generated rules (packages/engines/src/generated/*, 20:11:26), an apps/web/dist build (20:11:33 and 20:23), apps/web/src/dossier/code_words.ts (20:19, another lane), and truth-local/.
4. A v10 truth build (node tools/truth/build.js v10) DID run in the repo from about 20:11 to 20:16 CT, started by another process with its output going to D:\webstorm\repo_build_v10.json. Result: 512 sectors, 180,312 systems, 156,222 built, 24,090 partial, 0 failed, 7.77 GB, 307 s. That matches the copy's measurement. Nothing was uploaded or released.
5. Gates in the copy were not re-run (optional; skipped once all agents were stopped). The gates have not been run in the repo.

## Gates
npm test:      not run in the repo (copy: pass, 1569/1595, 26 skipped)
npm run check: not run in the repo (copy: clean)
typecheck:     not run in the repo (copy: pass)
fourth gate:   npm run build, not run by this lane (copy: pass; something else rebuilt apps/web/dist at 20:11 and 20:23)

## Contract published
none

## Needs from others
- Browser lanes: draw no sea when liquidType is null or liquidStatus is none or unresolved. Add a boiling test to seaIce. Have the dossier read the liquid status. Use 273 K (= 0 C) for phase.
- All lanes: engine 1.2.0, ledger parity_deviations_1.2.0.json, fixtures engine_1.2.0.
- Workers/API: truth build, retry and builder generation are capped at one sector per request ("The limit is one sector per request.").
- Web lane: directives/prompts/z_sheets_static.md (see below).

## Second Lane Z prompt: static character sheets
directives/prompts/z_sheets_static.md is ready. It covers static character sheets served at /sheets, with sources in findings/sheets_source/. Assign it to a web lane.

## Admin step (Johnny only, run locally on Lazarus)
1. node tools/truth/build.js v10 (already run once at 20:11-20:16; re-run it after the gates pass if the engine changes)
2. node --env-file=.env tools/truth/upload_truth.js v10 (dry run; writes truth-local/v10/d1/)
3. node --env-file=.env tools/truth/upload_truth.js v10 --remote --yes
4. POST /api/admin/truth/release/v10 as an admin

## Questions for Johnny
1. Book temperature roll for mainworlds? Suggested: decide it separately, not in this patch.
2. Should atmosphere 1 be treated as vacuum? Suggested: no, keep it as it is now (not vacuum).
