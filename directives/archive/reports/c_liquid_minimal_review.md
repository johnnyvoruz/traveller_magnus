land with these changes

Found: the prompt's Progress was empty, and no report existed. During the session the working tree gained Lane Z's patch, uncommitted, as engine 1.2.0. This session did not apply it to the repo.

Finished: the review on a copy outside the repo. Four gates, the four API files, the dice probe, this report, and `findings/liquid_minimal_review.md`.

Backed out: nothing. The engine files named in the stop order were not edited. The book temperature roll was not added.

# Lane C liquid minimal review
Prompt: prompts/c_liquid_minimal_review.md
Status: done

## Changed files
- `directives/prompts/c_liquid_minimal_review.md`: Progress lines only.
- `directives/reports/c_liquid_minimal_review.md`: this report.
- `findings/liquid_minimal_review.md`: the tables, the twenty parity rows, the held-file list, and the surface edits as a note.

No engine file, fixture, or parity ledger was edited. `mgt2e_world_engine.js`, `mgt2e_topdown_generator.js` and `reconcile_environment.js` were not edited.

## Changes to make before landing

1. Draw the late exotic liquid die on a side stream (`isolateRng` in `packages/engines/src/core/rng.js` line 38, or the same idea). `decideSurfaceLiquid(w, () => rng())` at `mgt2e_world_engine.js` line 2387 calls the shared generator when an exotic body has candidates and no stored `liquidRoll` (`surface_liquid.js` line 65). That call is before the belt, tectonic, biomass and biocomplexity rolls (lines 2412, 2439, 2455, 2519). On the 281-hex census sample: 38 systems, 52 late draws, and all 38 had later `rng()` calls. Z's "cannot move any later roll" does not hold for this code. After the side stream, regenerate `tests/generation/parity_deviations_1.2.0.json` and `tests/golden/fixtures/engine_1.2.0/`. The chart lock stays: it is a separate stream shift, from the skipped atmosphere roll and hydro roll (`mgt2e_world_engine.js` lines 800–803 and 1419–1421).
2. `tools/truth/upload_truth.js` must refuse a version whose `truth_versions.state` is not `building` before any R2 put. Today `--remote` without `--yes` exits 2 (lines 40–42). `--endpoint <url>` writes that URL with no `--yes`, and missing keys fall back to `test` / `test` (line 169). For a released version the version-row update and the systems delete are guarded (lines 97–101), and the sector-row upsert (lines 104–106) and the R2 puts (lines 171–181) are not.
3. Replace the comments that cite `findings/liquid_temperature_once.md` and say a mainworld temperature was rolled or held in a book band. The files are `parity_deviations_1.2.0.json` line 4, `tests/generation/parity.test.js` line 18, `tests/golden/esm.test.js` lines 42–44, and the census test and helper headers. The book roll stays parked. There is no `bandHoldK` and no temperature-band roll under `packages/engines/src`.
4. `tests/api/builder_sector_generate.test.js` line 237 still expects HTTP 202 for hex keys in three sector prefixes. The cap returns 400 with `The limit is one sector per request.` Update that test to the cap. `npm test` stays green because API tests run only with `RUN_API_TESTS=1`.
5. `apps/api/src/jobs/generate_queue.ts` lines 119–120 fail the job with the sentence and no hex key. `markJobFailed` (`apps/api/src/universe/hexes.ts` lines 840–842) stores the reason only when both are set, so the backstop drops the sentence. The Build pane already shows it for a normal request, because `builder.ts` lines 555 and 850 refuse first.

## Gates
npm test:      pass on the patched copy. 1595 tests, 1571 pass, 0 fail, 24 skipped. Z's landing note said 1569 pass and 26 skipped. Same total, zero failures. Two formerly skipped tests passed here.
npm run check: pass (`manifesto: clean`)
typecheck:     pass (`tsc --noEmit -p apps/api`, no diagnostics)
fourth gate:   pass (`npm run build`, `index-Bod7iiCw.js` 175.34 kB)

API, own ports 8816 and 8817, own state directories: `one_sector.test.js` 3 pass; `builder_sector_generate.test.js` fail at the three-sector box (400, the one-sector sentence, expected 202); `builder_density.test.js` pass; `builder_allowance.test.js` pass.

## Contract published
none

## Needs from others
- The landing owner: changes 1, 3 and 5 touch the frozen engine and the parity files. This review did not edit them.
- The owner of `tests/api/builder_sector_generate.test.js`: change 4. Lane C does not own that test.
- The owner of the parked truth-build files: `tests/api/truth_build.test.js` line 1333 still expects one `truth.remove` audit row. The board records two. Those files can stay out of this push. `npm test` does not run them.

## Answers

The eight checks are written out in `findings/liquid_minimal_review.md`. Short form:

1. Gates: green on the copy, counts above.
2. The five `engine_1.1.0` fixtures are already the last commit and are not run at version 1.2.0. They stay out. The engine sources, `surface_liquid.js`, package version 1.2.0, the new fixtures and the new ledger go with the patch. `admin.ts` contributes only the one-sector checks. The other held files stay out.
3. 70 rows became 456. 66 old rows match exactly. 390 are new. Causes, rules citations, and twenty rows are in the findings note. The parity test passed, so those rows match the golden-fixture engine output.
4. A universe created on 1.1.0 generates, previews and rolls again as 1.2.0. The universe row keeps 1.1.0. Stored objects are not rewritten on read. Packages copy the creation stamp.
5. A selection or a `makeSectors` request whose hex keys span two prefixes is refused. The Build pane shows `The limit is one sector per request.` A subsector or one sector by address is one prefix and proceeds. Truth build and retry refuse more than one slug or target on the admin routes. The queue backstop drops the sentence (change 5).
6. The only literals in `decideSurfaceLiquid` are 10, 12 and the atmosphere comparison with 0. 273 and 373 are Water's `mp` and `bp` at `rules/mgt2e_data.js` line 767.
7. A late draw moves later rolls. Confirmed on all 38 late-draw systems in the 281-hex sample. Z's 411 / 270 / 2135 figure was not re-run.
8. `--remote` without `--yes` does not write. `--endpoint` can write production with no `--yes`. A released version's indexes, inputs and sector rows can be overwritten. See the findings note.

`findings/liquid_temperature_minimal_before_after.md`: 29 of 29 named worlds right after, 2 of 29 before. Regina after is atmosphere/hydro 8/8, −68.6 C, Ice, trade `Ht Ri Sa`. Breathable-range Spinward Marches (246): exotic liquids go to 0, Ice 18 to 71, Water 163 to 169, none-above-boiling 0 to 6. The cold formula mean is the parked roll.

Surfaces: `liquidType === null` with status `unresolved` still draws assumed water on the hybrid path, and the vanilla palette still paints ocean from the hydro digit. The exact edits are in the findings note. The form that keys off `null` and the new statuses, and leaves an absent `liquidType` alone, is safe before the patch. 273 K displays as 0°C because `units.ts` uses 273.15. The engine Ice line is mean below 273 K, so 273 K exactly is Water and displays 0°C. Ice from 272.65 K up to 273 K also displays 0°C.

## Questions for Johnny

1. Keep the book temperature roll parked. Recommended: yes. `findings/liquid_temperature_minimal_before_after.md` line 60 leaves it outside the minimal fix, and this review was told the roll is parked on purpose. Regina stays Ice at 204.41937560732526 K, which that note prints as −68.6 C using the engine offset of 273 K. A later decision can add the roll. This landing should not.
2. Atmosphere 1 stays off the vacuum branch. Recommended: yes. `rules/guideline_2_3_hydrographic_distribution.md` line 9 names Atmosphere 0 for ice-caps and no free-standing liquid. Line 16 gives Atmosphere 0, 1, or ≥ A the hydrographics DM −4. The before/after note marks Gesentown (atmosphere 1, hydrographics 1, Ice) and 899-076 (atmosphere 0, hydrographics 1, Ice) right. The patch's vacuum test is `atmCode === 0` (`surface_liquid.js` line 71).
3. On atmosphere 0 at or above Water's melting point, keep "no free-liquid name" (status `none`, outcome `vacuum-above-melt`) and keep the hydro digit. Recommended: yes. Line 9 says Hydro > 0 on Atmosphere 0 is ice-caps only, with no free-standing liquid. Line 21 says permanently ice-covered water counts toward hydro. The patch stores Ice only when the mean is below Water's melting point (273 K, `rules/mgt2e_data.js` line 767). If the reading of line 9 is "always the Ice label whenever Hydro > 0", the vacuum branch should set Ice instead. That reading is the other answer.
4. Accept the chart lock for every charted mainworld, not only moons, and record the rules gap. Recommended: yes, as part of landing this patch. `directives/board.md` lines 315–318 say yes to keeping atmosphere and hydrographics when the mainworld is a moon, and no to the lock alone. The patch passes `{ mainworldBase }` (`mgt2e_topdown_generator.js` lines 120–122), so a chart profile with no `type: 'Mainworld'` still locks. That is the change that makes Regina's stored atmosphere and hydrographics 8/8. No sentence in `rules/` or `assets/` was found that says a charted UWP is not rerolled. The 456-row ledger should be regenerated after change 1, then accepted. The rows that come from the skipped atmosphere roll and hydro roll are the lock. The rows that come from the late `rng()` are the ones change 1 removes.
5. Keep atmospheres 10–12 as the exotic-liquid range and record the gap. Recommended: yes. `isExoticAtmosphere` is `atmCode >= 10 && atmCode <= 12` (`surface_liquid.js` line 37). `rules/mgt2e_data.js` line 49 is the extreme hydrographics DM, and it includes 0, 1 and 13–15 as well. Line 571 labels `Atm 10-12/15` on a different table. Guideline line 22 says non-temperate worlds take exotic liquids, and it does not name 10–12. `assets/2eWorldGeneration_EngineSpec.md` line 299 is an amber-zone sentence. Widening the range is a separate rules decision.
