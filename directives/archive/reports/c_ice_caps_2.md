# Lane C ice caps, second look
Prompt: prompts/c_ice_caps_2.md
Status: done

## What the live caps still were

Looked at on https://traveller.voyage before any edit, sector Spinward Marches. The orbit camera has no pole control (`apps/web/src/orbit/camera.ts`), so there is no pole-on disc. The orbit shots are the usual three-quarter view. The circle reads on the dossier map.

The first pass (`directives/reports/done/c_ice_caps.md`) already moves the edge. `capShiftRad` (`apps/web/src/surface/ice_edge.ts`) adds `noise * 11°`, retreats 8° over open sea, and reaches `8° * elevation` over land. `edgeTemp` applies that as kelvin (`EDGE_K` 12, `SEA_K` 10, `LAND_K` 10) and fades it out across 24 K, so a frozen, molten, or scorched layout is unchanged. Before this pass that noise was one value-noise scale, 2.4.

On the six dossier maps that one scale was still the whole edge:

- Rangent 1411 w8, water. Both caps were one scallop, a hard white-to-blue step, no loose ice, and the poles were twins. No land, so the edge cannot follow a coast.
- 769-422 0240 w3, warm. Tiny caps, the same one scallop and a hard cutoff.
- Rech 2112 w8, continents. A latitude band. Land under the cap was solid white. The sea cut a little.
- Bicornn 2331 w2, small seas. A fairly even latitude line and one hard step.
- Beater 1424 w5, cold. About 90 percent ice and one equatorial sea boundary, hard white against blue, no floes.
- Heya 2402 w7, tilt 30°. The north followed the continent somewhat. The south was a smoother latitude line. One dominant scallop, no loose ice.

Nadrin 3123 w10 had no cap. Yres 1802 w8 was a whole ice sheet. Garda-Vilis 1118 w0 is the locked world (Regina 1910 w4m1 is a moon, and the hybrid sheet forces locked off for a moon). Roget 0427 w1 is the high-tilt belt, folded tilt 90°, so the disc uses `BAKE_FRAG_TILT`.

## What changed

Hex ice is still `edgeTemp` of the original `iceNoise`. That is what keeps the area. Putting `capNoise` into the classification, or blending it in, moved the warm world's 9 ice hexes by more than 2 percent relative, and at a stronger blend it moved Garda-Vilis and Roget as well. Those trials were dropped.

The sheet's paint, near the melting line only, uses a new `capDetail`: the 2.4 lobe plus scales 1.1, 6.4, and 13, and a different seed on the south pole (`ice_edge.ts`). A pixel within 18 K of the line is recoloured from that shift (12 K times the broad sample, 7 K times a finer sample on the fringe). Old ice stays bright, thin ice is grey, and open water or rock shows through where the sample is negative. Frozen, molten, and scorched layouts skip it. `capNoise` itself is the first pass's single scale again, so the vanilla map's equator probes stay put.

The disc bake (`gl_shaders.ts`) moves the edge with four simplex scales (weights 0.34, 0.28, 0.22, 0.16), the same sea retreat and land reach, a south-pole offset, a soft age mix, and floes and leads inside the melt window. `BAKE_FRAG_TILT` is still that source with the latitude term multiplied by `uLatK`. `DRAW_FRAG` is untouched. A high-tilt body in a batch now calls `warmTilt` (`gl.ts`) if the tilt program is not warm yet, so a slow link does not leave the disc blank after the startup kick stops.

The sheet and the disc share the melting line and the sea and land bias. They do not share noise samples, and their height fields differ, so a bay on one is not the same bay on the other. The sheet's classified hexes are still the first-pass scallop. The new raggedness on the sheet is colour.

## Ice area

Hybrid hex area, before and after. The after column matches because classification did not change.

| World | Role | Ice before | Ice after |
|---|---|---|---|
| Rangent 1411 w8 | water | 16.49% | 16.49% |
| Rech 2112 w8 | continents | 30.64% | 30.64% |
| Bicornn 2331 w2 | dry, small seas | 26.07% | 26.07% |
| Beater 1424 w5 | cold | 91.72% | 91.72% |
| 769-422 0240 w3 | warm | 1.84% | 1.84% |
| Heya 2402 w7 | tilt 30° | 42.32% | 42.32% |
| Nadrin 3123 w10 | no cap | 0.00% | 0.00% |
| Yres 1802 w8 | frozen | 100% | 100% |
| Garda-Vilis 1118 w0 | locked | 22.84% | 22.84% |
| Roget 0427 w1 | tilt 90° belt | 59.50% | 59.50% |

## Cost

Sheet paint, Rech 2112 w8, 800×400, quiet `process.hrtime`. With the margin gated to the melt line: cold 248 ms, then 181.5 ms and 178.4 ms. A run with the margin noise forced off warmed at 183.2 ms and 177.6 ms. Calling the noise on every pixel was about 206 ms and was not kept.

Vanilla Regina map, quiet, three runs: 148.5 ms, 143.7 ms, 134.3 ms. The first pass's quiet after was 153.3 ms and 183.9 ms, against 266.9 ms before that pass. The parity script's Regina figure in this run was 248.6 ms while the test suite was also running.

Disc bake, warmed, from the parity cold-size table: cube 128 is 3.2 ms, longest face 1.6 ms. The other sizes are 2.2 ms to 3.3 ms. `compileMs` is 0. `progressiveFirstStepMs` is 5.8. One slice in that run was 2294 ms. That is the one-time driver wait, the same class as the 1632.8 ms first tilt face from the city-lights pass, and it is not counted against the 10 percent line. The Regina shade batch inside parity was 2003 ms wall for the same reason.

The first Roget orbit on the local page stayed `ready:0` and drew a flat disc. The tilt program had not linked before the startup kick stopped, and nothing asked again. After `renderBatch` polls `warmTilt` for a high-tilt body, the reshoot is `ready:1` and the disc is textured.

## Pins

`node scripts/surface_parity.js` exited 0. The page JSON still has `"ok": false` because the cap pixels are not the legacy picture. That is the accepted shape of this script.

Vanilla map pins did not move. `capNoise` is the first-pass function again. Regina 42012, Jewell 41720, Efate 43526, Dry 57155, Hydro A 40934, Exotic A 42448, Regina print 42012, sliders 0.2/0.9 at 41515, sliders 0.85/0.15 at 41893. Ice, Molten, and Hydro 0 stay 0. The negative control stays 637249. `MAP_ALGORITHM` stays `vanilla-diamond-1`.

Disc pins that hold ice, before to after. Ice and Gas stay 0.

- Ocean cube32 40 to 184, cube128 706 to 2543, mip1 249 to 932, cube512 11311 to 40686, tile 518 to 821
- Dry cube32 968 to 1559, cube128 15110 to 25127, mip1 4181 to 7831, tile 7984 to 11925
- Ringed cube32 307 to 691, cube128 4680 to 10658, mip1 1374 to 3556, tile 2367 to 4401
- Ocean tilt 0: 417 to 525. Tilt 90: 62 to 144. Tilt 120: 70 to 103
- Ocean sweep 0: 518 to 821. Sweep 0.5: 1123 to 1456. Eclipse: 411 to 286. Light: 641 to 1320
- Ocean radius 2.5: 0 to 1 (one pixel, channel error 1, on the 8 px sprite). Ocean radius 1100: 90793 to 123370
- Ringed phase 0.75 and phase 0: 2367 to 4401
- Negative control cube32 39 to 149, cube128 534 to 2389, mip1 160 to 806

Cache: `HYBRID_SURFACE_VERSION` is `hybrid-surface-3`. The enhanced disc version already ends in `ice2`. `VANILLA_DISC_VERSION` is still `vanilla`.

GPU: ANGLE, AMD Radeon RX 7900 XTX, Direct3D11.

## Shots

`findings/ui_design_shots/kc_ice2_before_*` and `kc_ice2_after_*`, orbit and dossier, for water, continents, dry, cold, warm, tilt, none, frozen, locked, and belt. The contact sheet is `kc_ice2_sheet.png` (dossier pairs). `kc_ice2_after_water_clear.png` is Rangent with Day/Night off, so the margin is not under cloud. With Day/Night off, Rangent's edge is a soft grey shelf, broken at more than one scale, with scraps of ice past the solid line, and the two poles are not the same drawing. Nadrin gained no ice. Yres stayed a full sheet.

## Changed files

- `apps/web/src/surface/ice_edge.ts`: `capNoise` restored to one scale. `capDetail` is the sheet's multi-scale margin.
- `apps/web/src/surface/hybrid/paint.ts`: soft age and a gated floe and lead from `capDetail`. Hex class stays on `iceNoise`.
- `apps/web/src/surface/vanilla/gl_shaders.ts`: four-scale disc edge, south offset, soft ice, fringe.
- `apps/web/src/surface/vanilla/gl.ts`: a high-tilt batch polls `warmTilt` until the tilt program is warm.
- `apps/web/src/surface/hybrid/inputs.ts`: `hybrid-surface-3`.
- `scripts/surface_parity.js`: disc ice pins re-pinned, as listed above.
- `tests/web/surface_gl.test.js`, `tests/web/surface_ice_edge.test.js`: shader block and the pole check.
- Shots `kc_ice2_*`.

## Gates

npm test: pass. 1554 tests, 1531 pass, 0 fail, 23 skipped.
npm run check: pass. manifesto: clean.
typecheck: pass. `tsc --noEmit -p apps/api`.
npm run build: pass. `vue-tsc -b` and vite build.
fourth gate: pass. Parity exited 0. Area table above. Timings above. Shots above.

## Contract published

none

## Needs from others

none

## Questions for Johnny

1. The sheet's hex ice is still the first-pass line, and the new raggedness there is paint. The disc moves the baked edge with its own simplex noise. I would leave that. One shared noise, when I tried it, moved the warm world's ice by more than 2 percent relative. Do you want a later pass to force one noise for both pictures?
