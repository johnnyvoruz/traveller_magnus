# Lane C disc tilt and dry-world caption

Prompt: prompts/c_disc_tilt_caption.md
Status: done

## The sheet's latitude rule

The hybrid sheet's unlocked temperature is in `apps/web/src/surface/hybrid/model.ts`. The amplitude `A` is `max(0, min(1.5 * (mean - lowK), 3 * (highK - mean)))` (line 263). The effective amplitude is that value times `latitudeTiltFactor` (lines 264–265). The unlocked temperature is `mean + Aeff * (1/3 - p[1] * p[1])`, then the elevation lapse and the ice noise (lines 275–279). `p[1]` is the latitude sine.

`latitudeTiltFactor` is `apps/web/src/surface/tilt_latitude.ts` lines 9–11. The tilt is folded through 90° (`tilt > 90` becomes `180 - tilt`). The factor is `clamp((54 - tiltE) / 9, -1, 1)`. It is +1 when the folded tilt is 45° or less, 0 at 54°, and −1 when the folded tilt is 63° or more. Above 54° the factor is negative, so the equator is the cold place in that formula. A locked world does not use the factor (`tempAt` takes the substellar branch when `world.locked` is set).

## The disc

Ice and snow in the orbit disc come from `capC`, which is derived from `localC` in `BAKE_FRAG` (`apps/web/src/surface/vanilla/gl_shaders.ts` lines 245–255). The unlocked line is:

`uMeanC + (uSpread / 40.0) * (15.0 - 45.0 * sinLat * sinLat) - e * 28.0`

`sinLat` is `d.z`. That source string is unchanged. `DRAW_FRAG` does not contain `localC`.

When `latitudeTermScales` is false (a locked world, or a folded tilt of 45° or less), the baker links that original program. Otherwise it links `BAKE_FRAG_TILT` (lines 325–328), which is the same program with the unlocked latitude term multiplied by `uLatK`. `uLatK` is `latitudeTiltFactor`. The amplitude stays `(uSpread / 40.0) * (15.0 - 45.0 * sinLat * sinLat)`. `VANILLA_DISC_VERSION` stays `vanilla`. `ENHANCED_CITY_VERSION` stays `enhanced-cities-4b`.

The takeover shot is 54°, where the factor is 0. At 60° the factor is −2/3. At 85° and 90° the factor is −1.

## Shots

Before and after, disc beside the sheet, same synthetic water world. Sampled every 2 px on the 1100×256 row, and a sample counts as changed when the channel sum moves by more than 12.

| Tilt | Samples changed | Max channel sum |
| --- | --- | --- |
| 0°, 23°, 45° | 0 | 0 |
| 54° | 865 | 261 |
| 60° | 1050 | 357 |
| 85° | 1283 | 319 |
| 90° | 1501 | 380 |
| Locked, axial tilt 85° | 0 | 0 |

Files: `findings/ui_design_shots/kc_tilt_before_{t0,t23,t45,t54,t60,t85,t90,locked}.png` and the matching `kc_tilt_after_*` files.

## Bake time

Four discs, tilts 0°, 23°, 45°, and 60°, cube 128, after a warmup. Three runs before the tilt program: 17.1 ms, 11.9 ms, 8.5 ms. Three runs after: 1641.3 ms, 9.2 ms, 8.9 ms. The 1641.3 ms run spent 1632.8 ms on one face, the first use of the new program in that context. The warmed after run is 8.9 ms against the warmed before run of 8.5 ms, about 5 percent. Both captures needed 11 `renderBatch` rounds to fill the four cubes.

## The caption

Vech A-IV-a (`/s/Mavuzog/2922/b/w5m0`) is UWP `Y100000-0`. Stored truth has hydrographics 0, `hydroPercent` 2, and `liquidType` `"Ice"`. `packages/engines/src/mgt2e_world_engine.js` lines 1437–1439 set `hydroPercent` to `max(0, -5 + d10)` when the hydrographics code is 0. Lines 1449–1453 set `liquidType` to `"Water"`, then to `"Ice"` when `highTempK < 273` or the atmosphere code is 0 or 1. The displayed word Water did not come from `liquidType`.

`seaLiquid` in `apps/web/src/surface/hybrid/inputs.ts` lines 93–97 maps the names `Ice` and `Water` to liquid `Water` when `hydroPercent` is above 0. The old caption then appended the layout word `frozen`. This pass leaves `seaLiquid` as it is, so the painted sheet of a hydrographics-0 body can still use that percent.

`hybridCaption` (`apps/web/src/surface/caption.ts` lines 86–127) reads the liquid from the body. A `liquidStatus` of `none`, or a hydrographics digit of 0, names no sea. The digit is `hydroCode`, then `hydro`, then the fourth character of the UWP. With no digit, `hydroPercent` above 0 counts. The caption appends ` · frozen` only when the named liquid is not `Ice`, `phaseOf` has a melt temperature, and `highK` is below that melt temperature. The locked phrase stays when the layout is `locked`.

`SurfaceStage.vue` line 121 passes the body into `hybridCaption`. The dossier prefix is `Surface map · `.

The production build, served on 127.0.0.1:5231 with `/api` and `/objects` proxied to https://traveller.voyage, shows this caption on Vech A-IV-a in a separate headless Chrome profile at 1440×900:

`Surface map · Enhanced · no seas`

Shot: `findings/ui_design_shots/kc_caption_vech_a_iv_a.png`. The column control is still **Map and key**. This pass does not change the 379 px column figure.

Synthetic caption shots, without the dossier prefix:

- `kc_caption_dry.png`: `Enhanced · no seas`
- `kc_caption_water.png`: `Enhanced · Water`
- `kc_caption_frozen.png`: `Enhanced · Water · frozen`
- `kc_caption_exotic.png`: `Enhanced · Carbonic Acid`

`tests/web/surface_tilt_caption.test.js` covers the factor, the tilt program text, pole-versus-equator temperature at 23° and 85°, and those four captions.

## Changed files

- `apps/web/src/surface/tilt_latitude.ts`: the folded-tilt factor, and when the disc scales its latitude term. New file.
- `apps/web/src/surface/hybrid/model.ts`: `Aeff` calls that factor. The numbers 54 and 9 are unchanged.
- `apps/web/src/surface/vanilla/gl_shaders.ts`: `BAKE_FRAG` is unchanged. `BAKE_FRAG_TILT` multiplies the unlocked latitude term by `uLatK`.
- `apps/web/src/surface/vanilla/gl.ts`: links the tilt program beside the original bake program.
- `apps/web/src/surface/vanilla/gl_bake.ts`: chooses the original program unless the latitude term scales, and uploads `uLatK` only for the tilt program.
- `apps/web/src/surface/caption.ts`: the caption names the body's liquid, and a hydrographics digit of 0 names none.
- `apps/web/src/dossier/SurfaceStage.vue`: the hybrid caption receives the body.
- `tests/web/surface_tilt_caption.test.js`: factor, shader text, temperature sign, and the four captions. New file.

No engine file. The working copy of `packages/engines/src/mgt2e_world_engine.js` has an uncommitted nine-line addition after the high and low temperature results, which re-decides `Water` and `Ice` once `highTempK` exists. This pass did not write that addition. The caption does not depend on it. Stored truth for Vech A-IV-a already has `liquidType` `"Ice"`.

## Gates

npm test:      pass (1497 tests, 1478 pass, 0 fail, 19 skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass (`tsc --noEmit -p apps/api`, no diagnostics)
npm run build: pass (`vue-tsc -b` and the Vite build)
fourth gate:   pass. `node scripts/surface_parity.js` exited 0. The page JSON prints `"ok": false` for the pinned sheet differences (Regina 42012, Jewell 41720, Efate 43526, Dry 57155, Ice 0, Molten 0). Ocean cube32 stays at 40 and cube128 stays at 706, the pins in `scripts/surface_parity.js`. The parity script is unchanged. Bake time on the warmed run is within 10 percent. Shots are listed above.

## Contract published

none

## Needs from others

none

## Questions for Johnny

1. A body with hydrographics digit 0 can still store `hydroPercent` from 0 through 5 (`packages/engines/src/mgt2e_world_engine.js` lines 1437–1439). Vech A-IV-a has digit 0, `hydroPercent` 2, and `liquidType` `"Ice"`. The caption now names no sea. The sheet still treats `hydroPercent` above 0 as liquid, and `seaLiquid` (`apps/web/src/surface/hybrid/inputs.ts` lines 93–97) maps the name `Ice` to `Water`, so the map can still paint that percent. Suggested answer: leave the sheet on `hydroPercent`, and keep the caption on the hydrographics digit. The other choice is to treat digit 0 as dry inside `seaLiquid` as well, which changes the painted map.
