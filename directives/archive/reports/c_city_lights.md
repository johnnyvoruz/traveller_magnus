# Lane C city lights

Prompt: prompts/c_city_lights.md
Status: done

## What was wrong

On the live page (version 1.1.8) Regina, Spinward Marches 1910, body `w4m1`, is UWP A788899-C with tilt 0.4°. The orbit disc is the enhanced draw. Night city light was added after the cloud mix, so the lights sat on the cloud deck. Shots: `findings/ui_design_shots/kc_lights_before_orbit_fit.png`, `kc_lights_before_orbit_mid.png` (zoom 29.9), `kc_lights_before_orbit_close.png` (zoom 69.2).

The bake is not the fault. `BAKE_FRAG` in `apps/web/src/surface/vanilla/gl_shaders.ts` writes the city channel at line 302 (`float city`). `BAKE_FRAG` is unchanged.

`DRAW_FRAG` in `apps/web/src/surface/vanilla/gl_shade.ts` is the vanilla program and stays byte-identical to `js/planet_gl.js`. Its order in `shadePlanet` is:

- Ground albedo and day urban, then the cloud mix at line 304: `color = mix(color, uCloudColor * cloudLight * uSun, cloud * 0.92)`.
- Night city added after that mix, lines 306–325, with only `1.0 - cloud * 0.6` and a glow term that increases with cloud.
- Limb atmosphere added after the lights, lines 327–332: `color += tint * uSun * uAirStrength * 0.075 * ...`.
- The halo, lines 158–174, can add city colour outside the disc. `main` composites that halo under the disc, so the glow past the edge is the air halo.

The live page uses the enhanced program. That program already replaced the halo's city colour with nothing. The limb tint still ran after the lights, which is the order you want. The lights themselves were still the block that runs after the cloud mix.

## The rule in the enhanced program

`apps/web/src/surface/enhanced/draw.ts` replaces that city block with `GATED_CITY` (lines 34–46, substituted at line 278). The add is:

`color += city * (1.0 - clamp(cloud, 0.0, 1.0) * 0.92)`

and only when `uGas < 0.5`. It runs after the cloud mix and before the limb tint. Clear sky (`cloud` 0) is the same add as before. Full cloud leaves the same 8% opening the day-side terrain already has. The per-sample cloud attenuation on the city sampler is gone (`SAMPLE_C`, lines 164–168), so the lights are not dimmed twice. The day-side night term stays 0, so day pixels do not move. The downport uses the same ground fraction (`GATED_PORT`, line 80).

`ENHANCED_CITY_VERSION` is `enhanced-cities-4c` (`apps/web/src/surface/enhanced/bake.ts` line 9). Stored shades keyed by the old `enhanced-cities-4b` are not reused. `VANILLA_DISC_VERSION` stays `vanilla`, so vanilla mode still draws the legacy composite. Tests that import the constant expect `enhanced-cities-4c`. `tests/web/orbit_disc_texture.test.js` keeps the old literal as sample envelope data.

## Which surfaces draw lights

The orbit disc draws them, enhanced path only. The dossier has no GL disc. `SurfaceStage.vue` is the hex sheet. Settlement lights are `cityLights()` in `apps/web/src/surface/hybrid/symbols.ts`, drawn in `apps/web/src/surface/hybrid/daynight_layer.ts` lines 185–194 onto the glow canvas after the night shadow. That sheet has no cloud layer and no limb, so there was nothing to put the lights under. This pass does not change the map, the 379 px column, or the caption.

Shots from the local build at `http://127.0.0.1:5243`, headless Chrome with WebGL:

- `kc_lights_after_orbit_fit.png`, `kc_lights_after_orbit_mid.png` (zoom 26.0), `kc_lights_after_orbit_close.png` (zoom 91.5). Same body as the before shots. Night lights sit in the gaps of the cloud deck. The limb tint is the bright rim.
- `kc_lights_after_nocloud.png`. Rhylanor, night, cloud forced to 0. Lights on the ground.
- `kc_lights_after_fullcloud.png`. Same world, night, cloud forced to 1. The lights are down to that 8% opening.
- `kc_lights_after_day.png`. Same world, day, cloud 0. No city lights.
- `kc_lights_after_vacuum.png`. Regina A-VIII-c (`w9m2`), UWP YS00269-C, atmosphere code 0, population 2, not tidally locked. The card is that body. The disc in the frame is the rock, with no limb ring. The wheel zoomed the cursor, so the disc stays small in the system.
- `kc_lights_dossier_column.png` and `kc_lights_dossier_large.png`. Regina `w4m1`. The night side of the hex sheet carries the settlement dots. The caption line is unchanged.

## The late high-tilt disc

The 1,632.8 ms was one face of `BAKE_FRAG_TILT` on the disc worker (`apps/web/src/surface/vanilla/gl.worker.ts`), the first draw of that program in the context. The page thread does not run that draw. A person sees a late disc. A long-task observer on the orbit page during this pass recorded none.

`createDiscBaker` begins the tilt program when the context has `KHR_parallel_shader_compile` (`gl.ts`, `startCompile`). `ready()` waits for the three core programs only, so a world at a folded tilt of 45° or less does not wait for the tilt link. The worker enqueues one idle job (`gl.worker.ts` lines 45–54) that calls `warmTilt` after the first watch: one 1×1 face at tilt 60, polled on `COMPLETION_STATUS_KHR` so the link does not block. `warmup` skips a profile that needs the tilt program until that program is linked. The first watch used to throw `tilt program is not linked` and the worker then stayed failed.

The dev harness `apps/web/src/dev/city-lights/CityLights.vue` bakes on the page thread, which has no worker kick. Its `draw()` calls `warmTilt` between two `renderBatch` calls so a high-tilt harness disc still paints.

Times, fresh context, `KHR_parallel_shader_compile` present, Rhylanor profile with `locked` false:

| Case | Time |
| --- | --- |
| Before, first `BAKE_FRAG_TILT` face (prior report) | 1,632.8 ms inside a 1,641.3 ms batch |
| Before, warmed four-disc batches | 9.2 ms, then 8.9 ms (prior warmed run 8.5 ms) |
| After, core programs ready | 10 ms |
| After, first picture at 23° | 12 ms, and `tiltIsWarm` was false |
| After, `warmTilt` immediately following that picture | 2.1 ms |
| After, first picture at 60° once that warm returned | 7.8 ms |
| After, idle `warmTilt` on a second context | 1.3 ms, then the 60° picture in 6.2 ms |
| After, synced cube 128 at 23°, three calls | 6.8 ms (max face 2.4), 4.2 ms (max face 1.3), 3.3 ms (max face 0.6) |

The orbit system reached `ready:17` in 2.3 s from navigation, with the worker reporting `failed: false`. No face in this pass is in the 1,632 ms class.

## Changed files

- `apps/web/src/surface/enhanced/draw.ts`: city light uses the uncovered ground fraction, after the cloud mix and before the limb tint.
- `apps/web/src/surface/enhanced/bake.ts`: `ENHANCED_CITY_VERSION` is `enhanced-cities-4c`.
- `apps/web/src/surface/vanilla/gl.ts`: the tilt program starts with the baker; `warmTilt` draws one high-tilt face without blocking; a tilt profile is not warmed before that program is linked.
- `apps/web/src/surface/vanilla/gl_bake.ts`: the tilt program is installed beside the original bake program.
- `apps/web/src/surface/vanilla/gl.worker.ts`: one idle job warms the tilt program after the baker is created.
- `apps/web/src/dev/city-lights/CityLights.vue`: the harness calls `warmTilt` so a page-thread bake still paints.
- `tests/web/surface_city_gates.test.js`: the city add is after the cloud mix and before the limb tint.
- `tests/web/surface_city_cube.test.js` and `tests/web/surface_disc_delivery.test.js`: the version string is `enhanced-cities-4c`.

No engine file. `packages/engines/src/mgt2e_world_engine.js` still has an uncommitted addition this pass did not write. `DRAW_FRAG`, `BAKE_FRAG`, `scripts/surface_parity.js`, and `rules/` are unchanged.

## Gates

npm test:      pass (1524 tests, 1503 pass, 0 fail, 21 skipped)
npm run check: pass
typecheck:     pass (`tsc --noEmit -p apps/api`, and `vue-tsc -b` for `apps/web`)
fourth gate:   pass

`node scripts/surface_parity.js` exits 0. The page JSON has `"ok": false` with the pinned sheet counts: Regina 42012, Jewell 41720, Efate 43526, Dry 57155, Ice 0, Molten 0. Ocean cube32 is 40 and cube128 is 706. Ocean tilt 0 is 417. No pin moved. `npm run build` passes.

## Contract published

none

## Needs from others

none

## Questions for Johnny

none
