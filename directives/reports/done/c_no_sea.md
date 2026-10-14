# Lane C no-sea report

Found the prompt with an empty Progress list and the five no-sea edits already written in this session, with the climate, sea, and hybrid tests passing. Finished the outcome captions, the sea-ice boiling check, the shots, and the gates this lane owns. Backed out the temporary preview route, the preview page, and the generated case file. Nothing else was reverted.

Prompt: prompts/c_no_sea.md
Status: partial

The suite is red in one engine golden file. That failure belongs to Lane Z. This lane's surface tests pass.

## Changed files

- apps/web/src/surface/enhanced/climate.ts: liquidLook returns none when liquidType is null or the status is none, unresolved, or unknown.
- apps/web/src/surface/profile.ts: those bodies get water fraction 0. An absent liquidType still infers Ice or Water from the stored kelvin and the hydro digit.
- apps/web/src/surface/hybrid/inputs.ts: seaLiquid returns no liquid for the same dry signal. Version string is hybrid-surface-4.
- apps/web/src/surface/caption.ts: one sentence per stored outcome, on the enhanced caption.
- apps/web/src/surface/identity.ts: worldMapData attaches liquidType and liquidStatus only for the dry signal, so the legacy compare can strip them.
- apps/web/src/surface/vanilla/map_palette.ts: the dry signal paints with hydrographics 0.
- apps/web/src/surface/enhanced/seas.ts: sea ice reads the stored liquid's melting and boiling points. Ice uses Water's row.
- apps/web/src/surface/enhanced/map.ts: a fully boiling sea is not drawn. Rows equatorward of the boiling latitude use the dry land palette.
- apps/web/src/surface/contracts.ts: EnhancedSea may carry boilFromLatDeg.
- apps/web/src/surface/hybrid/model.ts: seasonal sea ice above melting is drawn only when the liquid was assumed.
- tests/web/surface_climate.test.js, surface_seas.test.js, surface_hybrid.test.js, surface_identity.test.js, surface_enhanced_map.test.js: the new contract.
- findings/ui_design_shots/kc12_*.png: map, disc, and caption for each body, vanilla and enhanced.

SurfaceStage.vue already uses hybridCaption in enhanced mode and sheetCaption otherwise. Both carry the sentences, so that file was left as it was. units.ts was left as it was. The preview page and the /dev/kc12 route were removed after the shots.

## What the sea reads

Before this pass, seaIce read meltingK from the browser copy of the liquids table and did not read a boiling point. A world whose coldest point was above melting was open water, including a world entirely above boiling. liquidType Ice returned all-ice immediately, including when the equator was at or above melting. The hybrid classifier drew seasonal sea ice in a band above melting for every named liquid.

Now substance() returns boilingK from phaseOf, the same table row as meltingK. Ice uses Water. seaIce returns kind vapor when the coldest point is at or above boiling, and seaPlan then sets coverage 0, liquid null, and drawn false. When only the equator is at or above boiling, vaporEquatorDeg supplies boilFromLatDeg and those rows are land. A body whose warmest point is below melting is still all ice, including Ice. The hybrid seasonal band above melting runs only when liquidAssumed is true, so a 1.1.0 body with no liquidType keeps today's seasonal pixels.

model.ts still fills a missing phase with 273 and 373 (model.ts lines 256–257). Those defaults apply only when meltK or boilK is null. They are the land thresholds for an unknown phase. Moving them would move 1.1.0-shaped pixels, so they stayed.

## Captions

The enhanced line is "Enhanced · " plus one of these sentences. A locked world may add " · locked, night side centred".

- vacuum-above-melt: No sea. There is no air, and the surface is above melting.
- above-boiling: No sea. The surface is above boiling.
- unknown-exotic: No sea. No listed liquid fits this temperature.
- temperature-missing: No sea. The temperature is missing.

Vanilla stays "Vanilla".

## Shots

Engine 1.2.0, truth seed and settings, Spinward Marches. Hydrographics digit above 0, so the old painter would have drawn a sea.

- Regina, 1910. liquidType Ice, hydrographics 8, mean 204.4 K, high 218.7 K. Caption "Enhanced · Ice". The large map is an ice sea. findings/ui_design_shots/kc12_regina-enhanced_map.png and kc12_regina-vanilla_map.png, plus the disc and caption files.
- Rangent XIII-a, 1411. vacuum-above-melt, hydrographics 1, atmosphere 0, mean 327.8 K. Dry cratered map and a dry disc. kc12_vacuum-above-melt-*.
- Uniqua, 0129. above-boiling, hydrographics 5, atmosphere 2, mean 384.0 K, tidally locked. The vanilla map is tan land with no blue sea. The enhanced map is hot day-side land and a pale night side, with no blue sea. kc12_above-boiling-*.
- Regina A-IX, 1910. unknown-exotic, hydrographics 6, atmosphere 10, mean 48.1 K. Dry rust map. kc12_unknown-exotic-*.
- Errere, 0103, with liquidType and liquidStatus removed. Hydrographics 3, mean 302.6 K. Caption "Enhanced · Water (assumed) · locked, night side centred". Both maps still show blue water. kc12_shape11-*.

There is no second checkout of the 1.1.0 pixels. Git writes are out of this lane. The absent-liquidType path does not take the dry branch, and the climate test pins buildPalette for a body that has no liquid fields. The Errere shots are that shape after this pass.

temperature-missing did not appear in the first 400 systems. The sentence is covered by tests/web/surface_climate.test.js. No body was invented for it.

## Gates

npm test: fail. 1639 tests, 1611 pass, 27 skipped, 1 fail: tests/golden/esm.test.js "esm profile_regina matches legacy fixture". That file compares engine output. This lane did not edit packages/engines.
npm run check: pass (manifesto: clean).
typecheck: pass (tsc --noEmit -p apps/api).
npm run build: pass. Surface chunks: surface.worker-7fp51Sx5.js 39.18 kB, gl.worker-fAYHVYW7.js 87.52 kB. DossierPanel-Ce3NSfV8.js 152.06 kB includes the stage.
fourth gate: pass. scripts/surface_parity.js printed no pin failures. The map page's own ok flag is false because the pinned worlds keep their existing mismatch caps (Regina 42012, Jewell 41720, Efate 43526, and the other capped rows). Ice, Molten, and Hydro 0 stayed at 0. The script was not edited and still uses port 5199. The shot server used port 5212 and cache .tmp/kc12-vite, and both were stopped.

## Contract published

none

## Needs from others

- Lane Z: tests/golden/esm.test.js profile_regina does not match the legacy fixture on this working tree. The engine is 1.2.0 and uncommitted. This lane did not edit it.
- Lane Z: the five review items in directives/reports/c_liquid_minimal_review.md, items 1–3 (late exotic die, upload_truth version guard, stale comments).
- Lane B: review items 4 and 5 (builder_sector_generate expects 202 where the cap returns 400, and generate_queue fail omits hexKey).

## Questions for Johnny

1. A mean of 272.8 K is Ice, because the engine's ice line is Water.mp, 273, in rules/mgt2e_data.js line 767, and meanTempC is meanTempK minus 273 in packages/engines/src/mgt2e_world_engine.js line 2361. The screen subtracts 273.15 in apps/web/src/design/units.ts (KELVIN_AT_ZERO_C) and then rounds. 273 K displays as 0°C. So does every Ice mean from 272.65 K up to 273 K.

   Recommended: leave both numbers. units.ts stays on 273.15. The engine stays on 273. A stored Ice mean of 272.8 K keeps reading 0°C. No other temperature on screen moves.

   The other choice: set the display offset to 273, the same subtraction the engine uses. Every Celsius and Fahrenheit figure can change by one degree where the extra 0.15 crosses a rounding boundary. The engine ice line stays at 273. 273 K still reads 0°C.

   Neither choice is implemented.
