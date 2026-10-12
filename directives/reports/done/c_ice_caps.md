# Lane C ice caps report
Prompt: prompts/c_ice_caps.md
Status: done

Found an empty Progress and an unedited renderer, then fixture files rewritten to port pixels.
Finished the timing clock and the edge, and restored the legacy fixtures.
Backed the fixture rewrite out.

## Before and after

Vanilla maps are the legacy renderer against the port. Pole is the top third of the sheet. Equator is the middle band. The frozen vanilla pair is byte-identical: an Ice-class world sets `polarAngle` to π, so the nudge does not move it.

- `kc_caps_sea_vanilla_before_pole.png` / `kc_caps_sea_vanilla_after_pole.png`
- `kc_caps_sea_vanilla_before_equator.png` / `kc_caps_sea_vanilla_after_equator.png`
- `kc_caps_land_vanilla_before_pole.png` / `kc_caps_land_vanilla_after_pole.png`
- `kc_caps_land_vanilla_before_equator.png` / `kc_caps_land_vanilla_after_equator.png`
- `kc_caps_islands_vanilla_before_pole.png` / `kc_caps_islands_vanilla_after_pole.png`
- `kc_caps_islands_vanilla_before_equator.png` / `kc_caps_islands_vanilla_after_equator.png`
- `kc_caps_frozen_vanilla_before_pole.png` / `kc_caps_frozen_vanilla_after_pole.png`
- `kc_caps_frozen_vanilla_before_equator.png` / `kc_caps_frozen_vanilla_after_equator.png`

Hybrid sheets have no before. The nudge is part of the model, and there is no flag that turns it off. Sea, land, and islands show lobes. Locked ice stays on the night side and the boundary is ragged. Tilt keeps an ice belt on the equator. Frozen is a full ice sheet (362 of 362 hexes), with no new open bay.

- `kc_caps_sea_hybrid_after_sheet.png`, `kc_caps_sea_hybrid_after_pole.png`, `kc_caps_sea_hybrid_after_equator.png`
- `kc_caps_land_hybrid_after_sheet.png`, `kc_caps_land_hybrid_after_pole.png`, `kc_caps_land_hybrid_after_equator.png`
- `kc_caps_islands_hybrid_after_sheet.png`, `kc_caps_islands_hybrid_after_pole.png`, `kc_caps_islands_hybrid_after_equator.png`
- `kc_caps_locked_hybrid_after_sheet.png`, `kc_caps_locked_hybrid_after_pole.png`, `kc_caps_locked_hybrid_after_equator.png`
- `kc_caps_tilt_hybrid_after_sheet.png`, `kc_caps_tilt_hybrid_after_pole.png`, `kc_caps_tilt_hybrid_after_equator.png`
- `kc_caps_frozen_hybrid_after_sheet.png`, `kc_caps_frozen_hybrid_after_pole.png`, `kc_caps_frozen_hybrid_after_equator.png`

Discs: `texture` is cube face +Z (the pole at the centre of the face). `pole` is the shaded tile with tilt 0. `equator` is tilt 90. The frozen disc triple is SHA-256-identical before and after. The tilt oblique pair keeps the cap near the limb. The shader still uses `sinLat²`, so a large axial tilt does not move the disc cap to the equator.

- `kc_caps_sea_disc_before_texture.png` / `kc_caps_sea_disc_after_texture.png` (and `_pole`, `_equator`)
- `kc_caps_land_disc_before_texture.png` / `kc_caps_land_disc_after_texture.png` (and `_pole`, `_equator`)
- `kc_caps_islands_disc_before_texture.png` / `kc_caps_islands_disc_after_texture.png` (and `_pole`, `_equator`)
- `kc_caps_locked_disc_before_texture.png` / `kc_caps_locked_disc_after_texture.png` (and `_pole`, `_equator`)
- `kc_caps_tilt_disc_before_texture.png` / `kc_caps_tilt_disc_after_texture.png` (and `_pole`, `_equator`, `_oblique`)
- `kc_caps_frozen_disc_before_texture.png` / `kc_caps_frozen_disc_after_texture.png` (and `_pole`, `_equator`)

Worlds: sea is Hydro A (hydro 10) on the map and Ocean (hydro 9) on the disc. Land is Dry (hydro 0). Islands is Regina on the map and hydro 5 on the disc. Locked is tidally locked. Tilt is 85°. Frozen is Ice / a frozen layout.

## Changed files

- `apps/web/src/surface/ice_edge.ts`: shared nudge. Lobes from seeded noise, sea retreat, land reach. The climate line stays where it is.
- `apps/web/src/surface/vanilla/map_projection.ts`, `map_palette.ts`, `map.ts`, `map_chunks.ts`: vanilla maps subtract the nudge from `polarAngle` inside the fade. Seed 0 skips it, so the latitude probe and the seas sheet keep the climate line.
- `apps/web/src/surface/hybrid/model.ts`, `paint.ts`, `index.ts`: the sheet classifies ice from nudged temperature. The page builds that model in slices of 32 hexes.
- `apps/web/src/surface/vanilla/gl_shaders.ts`: disc ice uses `capC` beside the melting line. `localC` is unchanged.
- `apps/web/src/surface/service.ts`: the page path passes this thread's clock through, and builds a cold hybrid model in slices.
- `scripts/surface_parity.js`: capped worlds pin their measured mismatch counts. Ice, Molten, Hydro 0, Gas, and a zero pin still have to be 0.
- `tests/web/surface_service.test.js`, `surface_map.test.js`, `surface_gl.test.js`, `surface_ice_edge.test.js`: the chunk clock, polar-triangle allowance on port sheets, the named shader block, and the nudge.
- `findings/ui_design_shots/kc_caps_*.png`: the pairs above.

Legacy fixtures under `tests/web/fixtures/surface/` are the golden files again. The oracle test compares them strictly.

## Gates

npm test: pass (1409 pass, 0 fail, 17 skipped with `RUN_API_TESTS` unset)
npm run check: pass (manifesto: clean)
typecheck: pass (`tsc --noEmit -p apps/api`)
fourth gate: `node scripts/surface_parity.js` exited 0 before the model was sliced. Slicing does not change a pixel. `npm run build` passed after the slice (vue-tsc and vite).

## Where the extent comes from

Unchanged.

- Vanilla: `apps/web/src/surface/vanilla/map_palette.ts` line 85 `seaLevel`, lines 101–108 `polarAngle` (π for molten, rock, or ice; else 40° frozen, 55° cold, 68° cool, 82° warm, 88° hot, 75° temperate). `polarFade` line 110 is 8°.
- Enhanced seas sheet: `apps/web/src/surface/enhanced/seas.ts` lines 140–151 `fromLatDeg`. That sheet still forces `polarAngle` to π, and its `capSeed` stays 0, so the nudge is a no-op there. The live enhanced dossier map is the hybrid sheet.
- Hybrid: `model.ts` line 264 `Aeff`, lines 274–278 `tempAt`, lines 281–284 layout (`frozen` when liquid and `highK < meltK`). `classify` line 417 takes `iceT` and uses it only on the ice branches (lines 424–430). Melt thresholds and `Aeff` are the same formulas.
- Discs: `gl_shaders.ts` lines 247–249 `localC`. Ocean ice `smoothstep(-6, -14)` and land snow `smoothstep(-8, -16)` now read `capC`. Those threshold numbers are unchanged. `uFrozen` still comes from `profile.liquid.frozen`. A fully frozen layout, and an ocean with `uFrozen >= 0.5`, has no edge: `capNear` is 0 when the whole world sits far below the window.

## The edge

Same world, same cap. Vanilla noise is `hashString(masterSeed + '-' + imageSeed + '-cap')`. Hybrid noise is the `'ic'` grid. The disc noise is `snoise(d * 2.6 + uOffset)`. No `Math.random`.

Sea retreat uses the renderer's own sea mask, and only when the world has a coast (`sea` share or sea level in (0.02, 0.98)). A water world with no land gets its ragged edge from the noise alone. The nudge fades out away from the line (24 K on the sheet, the `capNear` window on the disc), so the reach of the cap does not change.

Seed 0 on the vanilla map skips the nudge. A world whose hash is 0 would also skip it. Live maps pass a real hash.

## Timing

The page-path checks still require `fromCache` false, `chunkTasks > 1`, pixels that match, and `longestChunkMs < 50`. The clock is `process.threadCpuUsage` (user + system, microseconds / 1000). It counts this thread's CPU time. A stall while the thread is preempted does not add, and CPU time on other threads in the same `node --test` process does not add. `process.cpuUsage` did: under the full suite the enhanced sheet reported 62 while the same test, alone, was already under 50 after the slice.

The hybrid model used to run as one step (`buildHybridModel` plus the field allocation), and that step was 62 ms of CPU on class-wet. The page now runs `startHybridBuild` one slice per turn: setup, 32 hexes of sampling, 32 hydro flips, hops, 32 hexes of climate, accents, people, then the field allocation. `YIELD_AT_MS` stays 16 on the hybrid paint and 32 on the vanilla map. The 50 ms assertion is unchanged. A warm cache still returns the memoised model in one cheap step.

## Bake times

Map, Regina, quiet before: 266.9 ms. After, quiet: 153.3 ms and 183.9 ms. After, while `npm test` was also running: 250.5 ms. The 10% line on 266.9 ms is 293.6 ms. All three after samples are under it.

Disc, Regina batch of 20, before: 12.1 ms. After: 12.0 ms quiet, 14.6 ms while the map-shot script overlapped the first 5 s (14.6 / 12.1 is 21%, 2.5 ms over the 10% line), 13.3 ms while `npm test` overlapped (13.3 / 12.1 is 9.9%). The comparable quiet pair is 12.1 before and 12.0 after. Cold stats on the passing parity run: `progressiveFirstStepMs` 5.3, `compileMs` 0, `statsMs` 0.

## Parity pins

Before the edge, every capped world below was 0. The page still sets `summary.ok` false. The script no longer requires `summary.ok`. It fails a capped world that returns to 0, an uncapped world with any mismatch, a bad profile, a bad time, or a missing world.

Map pins are exact. `MAP_STILL_ZERO` is Ice, Molten, Hydro 0.

| World | After |
|---|---|
| Regina | 42012 |
| Jewell | 41720 |
| Efate | 43526 |
| Dry | 57155 |
| Hydro A | 40934 |
| Exotic A | 42448 |
| Regina print | 42012 |
| Regina sliders 0.2/0.9 | 41515 |
| Regina sliders 0.85/0.15 | 41893 |
| Regina negative | 637249 |

GL pins are the measured count. Slack is the larger of 8 pixels or 8% (`nearCap`). Ocean radius 1100 measured 90792 against pin 90793 and passed inside that slack. Ocean radius 2.5 stays exact 0. Ice and Gas stay exact 0.

| World | cube32 | cube128 | mip1 | cube512 | tile |
|---|---|---|---|---|---|
| Ocean | 40 | 706 | 249 | 11311 | 518 |
| Dry | 968 | 15110 | 4181 |  | 7984 |
| Ringed | 307 | 4680 | 1374 |  | 2367 |

Shades: Ocean tilt 0 = 417, tilt 90 = 62, tilt 120 = 70, sweep 0 = 518, sweep 0.5 = 1123, eclipse = 411, light = 641, radius 2.5 = 0, radius 1100 = 90793, Ringed phase 0.75 = 2367, Ringed phase 0 = 2367. A shade pin above 0 may report the field name `tile` only.

Negative Ocean: cube32 39, cube128 534, mip1 160, stats 0, profile equal, time 12.5. `againstOceanCube32Mismatches` 26873. The old check that cube32 mismatches must be 0 was removed, because the negative world now has a cap.

GPU for those reads: ANGLE AMD Radeon RX 7900 XTX, D3D11.

## The three special cases

Tidally locked. The sheet uses the existing night-side temperature and `LOCKED_EDGE_WOBBLE_DEG` (7). The nudge rags that night-side boundary. The day side stays open. The disc already uses `d.x` for a locked world, and the same edge term rags that boundary.

Large axial tilt (85°). The sheet keeps the equatorial ice belt from `Aeff` (the belt is the cold place). The disc cap stays on the geographic pole, because `localC` still uses `sinLat²` and this pass does not invert it for tilt. The oblique shot shows the cap near the limb.

Fully frozen. Vanilla Ice keeps `polarAngle` at π, so before and after match. The hybrid layout is `frozen` and every hex is ice. The disc has no `capNear` when the whole world is far below the ice window, and `uFrozen` oceans do not take the ocean-ice mix. The three frozen disc pairs match byte for byte.

## Contract published

none

## Needs from others

none

## Questions for Johnny

none
