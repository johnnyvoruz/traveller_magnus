# C regina temperature report
Prompt: prompts/c_regina_temperature.md
Status: done

## Changed files
- `findings/regina_temperature.md`: the trace, the classification, the Spinward Marches count, and the options.
- `findings/ui_design_shots/kc_regina_body.png`, `kc_regina_profile.png`, `kc_regina_map.png`, `kc_regina_orbit.png`, `kc_regina_disc.png`: live v5 shots of the mainworld and the orbit.
- This report.

No product code. The held nine lines in `packages/engines/src/mgt2e_world_engine.js` were not edited.

## Gates
npm test:      not run (no product code)
npm run check: not run
typecheck:     not run
fourth gate:   headless generation of Spinward_Marches/1910 on engine 1.1.0 with seed `TravellerMagnus` and `tools/truth/settings.js`. It reproduced the released mainworld: `atm` 8, `atmCode` 10, `liquidType` Ethane, `meanTempK` 189.60630776703493, orbit 5.2108 AU 3.30592. Census: truth v5 index plus all 246 pooled trees. To repeat the generation, call `generateHex` for `Spinward_Marches/1910` in mode `flesh` with `parseT5Tab` of `universe/raw/Spinward_Marches.tsv` and the pinned seed and settings. Shots: headless Chrome, own user-data-dir `kc-regina-chrome`, ports 9347–9349, no `--disable-gpu`. That Chrome was killed afterward.

## Contract published
none

## Needs from others
- Lane B, when a truth rebuild is ordered: v5 was built with no reconciliation policy (`tools/truth/build.js`). The live page changes only when a new truth is released.
- Dossier owns the Mean temp. card and the world profile (`apps/web/src/dossier/model.ts`, `apps/web/src/design/units.ts`). Orbit owns the north and south estimates (`apps/web/src/orbit/card.ts`). This pass did not change them. They print the stored fields.

## Questions for Johnny
1. Should the next engine pass both keep a charted mainworld's atmosphere and hydro (the lock in `mgt2e_world_engine.js` already written for a lunar mainworld, which does not run because `generateAtmospherics` drops a chart profile whose `type` is not `Mainworld`) and stop defaulting a missing temperature band to Temperate when it places the baseline (`assets/2eWorldGeneration_EngineSpec.md` section 6.2 row 5; the book roll is `assets/2eWorldCreation.txt` lines 399–418)? Suggested answer: yes. Do both in one pass, then a truth rebuild, with a deviation entry, an engines version bump, and new fixtures. The blackbody formula in `mgt2e_math.js` is not in `rules/` or `assets/`, so this pass should not replace that formula. Detail is in `findings/regina_temperature.md`.
2. If you want a smaller first change, is locking the chart atmosphere and hydro enough on its own? Suggested answer: no. Ethane and Fl would drop, and with the held Water/Ice lines the liquid would become Ice, while the mean would stay about −84 °C because the gas giant would stay at orbit 5.21.
3. Should the caption and the profile be changed so a chart atmosphere of 4–9 is not drawn as an exotic sea, with no engine change? Suggested answer: no. The screen is already printing the stored fields. The stored object would still hold atmosphere digit 8 beside atmosphere code 10.
