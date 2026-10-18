# Lane Z liquid_land_changes report
Prompt: prompts/z_liquid_land_changes.md
Status: done (two gate failures belong to Lane C's surface edits in progress, see Needs from others)

Built and tested in the copy `D:\webstorm\lane_z_land` (taken from the working tree at 20:49 CT), then applied to the repo in one step: 22 files, all byte-identical to the copy (SHA-256 checked). No git, no truth build, no upload, no deploy. `truth-local/` was not touched.

## Changed files
- `packages/engines/src/mgt2e_world_engine.js`: change 1. `isolateRng` imported. New `liquidDieKey(sys, w, parent)` gives `<hexId>|liquid|<world index>|<moon index>|<orbitId>`. The late die is now `decideSurfaceLiquid(w, () => isolateRng(liquidDieKey(sys, w, parent), () => rng()))`, a side stream seeded from masterSeed plus that key (`core/rng.js` `isolateRng` and `reseedForHex`). The same body gets the same die on every run, and the shared stream is put back after the draw. The chart lock's skipped atmosphere and hydro rolls are unchanged.
- `tests/generation/liquid_late_die.test.js` (new): generates Spinward Marches 0311, which takes a late draw, then runs `generateBiospherics` on two copies, one with the exotic bodies' `liquidRoll` kept and one with it removed. Every non-liquid field and the next five shared dice must match, and the die must be the same on a second run. It passes on the new wiring. With the old `() => rng()` put back, it fails with "the shared stream after biospherics moved".
- `tests/golden/fixtures/engine_1.2.0/`: change 2, regenerated from the engine after change 1. `orbit_normalize_2.json` and `profile_zeycude.json` changed. The other nine are byte-identical. The file set is the same 11.
- `tests/generation/parity_deviations_1.2.0.json`: change 2, regenerated. The `note` (line 4) is rewritten. The rows are the same.
- `tests/generation/parity.test.js` line 18, `tests/golden/esm.test.js` lines 42 to 44, `tests/generation/liquid_temperature_census.test.js` lines 1 to 2, `tests/generation/liquid_temperature_census.js` line 1: change 4. They now cite `findings/liquid_temperature_minimal.md` and describe what the patch does: a charted mainworld keeps its atmosphere and hydrographics, and the liquid is decided once from the final temperatures. No line says a temperature is rolled or held in a book band.
- `tools/truth/upload_truth.js`: change 3. Arguments: `--endpoint` and `--remote` both need `--yes`, and only one of `--local`, `--endpoint` and `--remote` may be given. `--endpoint` needs its own `S3_ENDPOINT_ACCESS_KEY_ID` and `S3_ENDPOINT_SECRET_ACCESS_KEY`. It has no `test`/`test` default and never reads the `R2_*` production keys. On every write path, `truth_versions.state` is read before any R2 put or D1 write: `--remote` reads production D1, and `--local` and `--endpoint` read the local emulation. A version that exists and is not `building` exits 3, and so does a state that cannot be read. The D1 files carry the same guard on every statement: the sector rows are `INSERT … SELECT … WHERE <building>` and the systems are `SELECT * FROM (VALUES …) WHERE <building>`. The script is now `export main(argv, deps)` so it can be tested. It still runs as before from the command line.
- `tools/truth/r2_s3.js`: `bulkPut` throws unless it has an endpoint and both keys.
- `tests/tools/upload_truth.test.js` (new, 20 tests): one test for each refusal. Covered: `--endpoint` without `--yes`; `--endpoint` with no keys, or with only the production keys; `--remote` without `--yes`; `--endpoint` together with `--remote`; released, withdrawn and unreadable state, on local, endpoint and remote. In every refusal there is no put and no wrangler call. Also covered: building and new versions go ahead, `--endpoint` sends only its own keys, and the dry run reads nothing. The D1 SQL runs against `node:sqlite` with every migration applied: a released version keeps its version row, both sector rows and its systems, and a new version is written in full.
- `tests/tools/r2_s3.test.js`: one test added for the `bulkPut` refusal.
- `directives/prompts/z_liquid_land_changes.md`: Progress lines only.
- this report.

## Dice: how many systems changed
Sample: Spinward Marches, Core, Reft and Trojan Reach (every charted, non-partial system), plus Uncharted_Census 0000 to 0299. That is 1,735 systems, each hashed from the full `stable(env.body)`, before and after change 1.
- **220 of 1,735 systems changed (12.7%).** Exactly the 220 that take a late draw, 343 draws in total. A counter showed no changed system without a late draw and no late-draw system unchanged.
- Truth Regina (universe/raw Spinward_Marches 1910) takes a late draw. 399 stored values change. All of them are later social and secondary rolls: factions, law, culture, cities and military, in `mgt2eData`, `mgtSocio` and the system's secondary worlds. Her physical row is unchanged: UWP `A788899-C`, atmosphere/hydrographics 8/8, mean 204.41937560732526 K, Ice, trade `Ht Ri Sa`.
- The golden-fixture Regina (parity hex, `tests/golden/cases.js` TSV) takes no late draw. So **the parity ledger is unchanged: 456 rows before, 456 after, all 456 identical** (path, legacy and got). Sorted the way Lane C sorted them (`findings/liquid_minimal_review.md`): 66 rows exactly as in 1.1.0; 390 new: chart lock 101, follows the new atmosphere 162, dice after skipped rolls 78, biosphere dice 27, liquid once 22. Correction to C's table: the 27 "biosphere dice" rows do not come from the late draw, because they are still there after the side stream. They come from the skipped atmosphere and hydro rolls (`mgt2e_world_engine.js` lines 800 to 803 and 1419 to 1421).

## Census
- `lane_c/census.mjs` (5 sectors + 300 uncharted: 2,135 hexes, 49,739 bodies), before and after change 1: I1, I2, I3, I5 and I6 have 0 failures. I4R counted: 2,641 (exotic, no listed liquid at the mean). Explained none: above boiling 682, vacuum above melting 2,767, gas-giant satellite with null hydroPercent 15. Before and after are identical.
- `liquid_temperature_census.test.js`: 281 hexes, 0 invariant failures, 353 counted. Pass.
- Regina row (same file): pass. `A788899-C`, 8/8, mean 204.41937560732526 K, Ice, no `Fl`, no liquidStatus.

## Gates (in the repo, after applying)
npm test:      fail, 2 of 1639 (1610 pass, 27 skipped), both outside this lane:
  - `tests/golden/esm.test.js:57` `esm profile_regina matches legacy fixture`
  - `tests/web/surface_enhanced_map.test.js:339`
  Both come from Lane C's edits to `apps/web/src/surface/` (profile.ts, enhanced/climate.ts, hybrid/inputs.ts, caption.ts, identity.ts, vanilla/map_palette.ts and others), saved 20:57 to 20:59 CT, after my copy was taken. Proof: in the copy, the esm suite passes (0 fail). With the repo's current `apps/web/src/surface` copied in, `profile_regina` fails. `profile_regina` is built by `surfaceProfile` (`tests/golden/cases_esm.js` line 156). A first repo run at 21:00 also caught four more surface tests in the middle of being edited (pane, surface_climate, surface_hybrid, surface_identity, surface_seas). The second run had only the two above.
  In the copy (engine changes plus the surface as of 20:49): 1627 tests, 1599 pass, 0 fail, 28 skipped.
npm run check: pass (`manifesto: clean`)
typecheck:     pass (`tsc --noEmit -p apps/api`, exit 0)
fourth gate:   pass (`npm run build`, exit 0, `dist/assets/index-ZOUNurMl.js` 179.75 kB, gzip 60.68 kB)

## The local v10 build of 20:11
**It must be thrown away.** Change 1 changes stored values in 12.7% of the sampled systems, Regina included (399 values). Every affected sector index and object hash changes. Not deleted here: Johnny or the landing owner removes `truth-local/v10` and rebuilds once the engine is final.

## Contract published
none

## Needs from others
- Lane C (`prompts/c_no_sea.md`): when the surface edits are done, regenerate `tests/golden/fixtures/engine_1.2.0/profile_regina.json` from the finished `surfaceProfile`, and fix or update `tests/web/surface_enhanced_map.test.js:339`. I did not regenerate `profile_regina` against surface code that was still being edited.
- Owner of `tests/api/builder_sector_generate.test.js` (Lane B): C's item 4, the three-prefix box at line 237 still expects 202. Not in this prompt.
- Owner of `apps/api/src/jobs/generate_queue.ts` (Lane B): C's item 5, the queue backstop fails the job without a hex key, so `markJobFailed` drops the sentence. Not in this prompt (`apps/api/` is excluded).

## Questions for Johnny
1. Accept the side-stream key `<hexId>|liquid|<world index>|<moon index>|<orbitId>` under masterSeed. Recommended: yes. It is deterministic for the same body on every run, independent of the shared stream, and the same pattern `mgt2e_roll_body.js` line 185 already uses. It is not a rules matter: no file in `rules/` or `assets/` says how dice are streamed.
2. Throw away the local v10 build and rebuild it after Lane C's surface pass and the profile_regina fixture. Recommended: yes. Stored values changed, and the surface work does not change truth objects, but the gates should be green before the rebuild.
3. Uploader: `--endpoint` reads the version state from the local emulation's D1 (it writes no D1 itself) and needs `S3_ENDPOINT_*` keys. Recommended: yes. The other option is a separate `--state-from remote` flag, which needs a wrangler login for a test upload.