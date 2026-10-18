# Lane L l_discs_without_webgl report
Prompt: prompts/l_discs_without_webgl.md
Status: done

Found: a fresh prompt (no Progress lines), and no edits in `surface/` or `tests/web/` from an earlier session.
Finished: nothing half-done to finish; all the work below is this session's.
Backed out: nothing.

## What it does
With no WebGL (`webglMissing()`), `prepareDiscs` sends the frame to a new software disc worker instead
of the WebGL disc worker. The worker paints each disc on a 2D buffer and posts it as an ImageBitmap in
the WebGL worker's own `tiles` message. `enhanced/delivery.ts` puts those tiles into `disc_hold`, and the
existing `drawDisc` draws them. The orbit view, the renderer and the WebGL path are not touched.

- **Globe per body:** a latitude/longitude grid made from the sheet the dossier makes for that body in
  that mode.
  - Vanilla: each texel is painted with the same calls `commitDiamond` makes. The globe matches the
    diamond sheet at every sheet pixel; a test checks 8,000+ pixels for exact equality. The polar
    wedges the diamond leaves out come from the same function.
  - Enhanced: the hybrid sheet is painted, then read back through the icosahedral net. For 256 rows
    and up this is the dossier's own 800 × 400 sheet; smaller globes read a smaller sheet (Question 2).
  - Gas giants have no sheet, so they get the WebGL bake's bands in the profile's colours (Question 3).
  - A body with neither gets no tile and stays a flat disc, as before.
- **Disc geometry:** the WebGL disc's. Orthographic view from above, axis from `axisBasis` (tilt and
  the profile's azimuth), spin through `toPlanet`. The map reads the right way round, not mirrored.
  A locked hybrid world turns its sheet's star side (`LOCKED_NIGHT_CENTRED_LON`) toward the star.
- **Light:** the WebGL diffuse term. The same wrap from `air.strength`, ambient 0.03 (0.45 in light
  mode), the limb factor, eclipses by casters, and the ring shadow. Rings use the WebGL density
  profile and are depth-sorted against the planet. A fast spin is blurred along the latitude
  (running sums per globe row), not strobed.
- **What is left out:** clouds, city lights, relief, sun glint and the halo.
- **Off the main thread:** all painting runs in the worker in slices of about 24 ms. Each body gets
  a 64-row globe first, so every disc shows at once. Sharper globes follow (128, 256 or 512 rows,
  by disc size), largest disc first.
- **Caching:** globes are kept up to 96 MB (least recently used goes first). Tile geometry is cached
  per radius, tilt and ring. A disc is painted again only when its picture would change: spin in
  half-pixel steps at the limb, light, size, casters or ring. Tiles are painted at up to 360 px
  radius; `drawDisc` scales bigger discs up.
- **The notice:** it now reads "Planet surfaces are simpler because WebGL is turned off in this
  browser: they have no clouds, city lights, sun glint, or haze. To see them, turn on hardware
  acceleration in your browser's settings, and then reload."

## Changed files
- apps/web/src/surface/soft/globe.ts (new): globe builders (vanilla, hybrid, gas), `netPixel`, `readSheet`, `hybridSheetFor`.
- apps/web/src/surface/soft/disc_paint.ts (new): disc geometry, `paintSoftDisc` (light, casters, rings, spin blur).
- apps/web/src/surface/soft/disc.worker.ts (new): the worker (newest frame only, slices, globe cache, repaint only on change).
- apps/web/src/surface/soft/link.ts (new): page side: which sheet each disc's globe comes from, the per-frame message, delivery through `settleDiscDelivery`.
- apps/web/src/surface/soft/messages.ts (new): message types, `SOFT_DISC_VERSION`, `SOFT_MAX_RADIUS`.
- apps/web/src/surface/soft/start.ts (new): starts the worker.
- apps/web/src/surface/service.ts: the lines that choose the path. Imports at lines 48-49, the branch in `prepareDiscs` at lines 500-504, `disposeSoftDiscs()` in `disposeSurfaces` at line 553.
- apps/web/src/surface/webgl_notice.ts: the new notice and its comment.
- tests/web/surface_soft_disc.test.js (new): 18 tests (sheet match for both modes, net lookup, geometry and orientation, locked star side, light and night side, eclipses, ring depth, spin blur, the worker's tiles, repaint only on change, sharper globe, the page's sheet choice, the notice).
- findings/kl_runtime/ (new): the CDP scripts (drive, shoot, closeup, ab, profile, parity, parity_compare, bench_*), their JSON results, and pick.mjs, which chose the worlds.
- findings/ui_design_shots/kl_discs_*.png (new): 14 shots, listed below.

Not edited: `views/OrbitView.vue`, `orbit/*`, `dossier/*`. The disc path is chosen in `service.ts`.

## Gates
npm test:      pass (1,929 tests, 1,890 pass, 0 fail, 39 skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass (`vue-tsc -b` with 0 errors; `npm run typecheck` for the API clean). One run failed in `workspace/JournalHere.vue` (`MentionRow.why`); that is another lane's file, changed at 14:01 while I ran, and it was clean on the next run.
fourth gate:   pass (`npm run build`; `disc.worker-*.js` is 44.9 kB in `dist/assets`)

**Browser.** Headless Edge 155 on a local build (`vite preview` on 5701, truth from the public CDN).
- WebGL off flags: `--headless=new --disable-gpu --disable-webgl --disable-webgl2 --disable-3d-apis --disable-software-rasterizer`.
- Probe: page `getContext('webgl2')` and `getContext('webgl')` are both null. In a worker, OffscreenCanvas `webgl2` and `webgl` are both null. `createImageBitmap` is present.
- Note: `--disable-gpu --disable-webgl` alone still gives WebGL to OffscreenCanvas in a worker, so `--disable-3d-apis` is needed to match Johnny's Edge.
- WebGL on: SwiftShader.
- Every run had no page errors.

Shots (each WebGL-off shot has a WebGL-on twin with `_on`):
- Whole system: `kl_discs_regina_webgl_off.png`, `kl_discs_ice_derchon_webgl_off.png` (Derchon 2024, C512799-8, Ic), `kl_discs_desert_mjolnir_webgl_off.png` (Mjolnir 1121, B530544-A).
- Close-ups beside the dossier sheet: `kl_discs_regina_close_webgl_off.png`, `kl_discs_ice_derchon_close_webgl_off.png`, `kl_discs_desert_mjolnir_close_webgl_off.png`, `kl_discs_gas_regina_a4_close_webgl_off.png`.
- In every close-up, the software disc shows the sheet's own land, ice and colours: Derchon's orange land, ice and dark seas; Mjolnir's sand equator and grey poles; Regina's pale ice. The terminator sits where the WebGL disc puts it.
- The WebGL discs show a different surface because they paint their own procedural bake, not the sheet. That was already so; this change does not alter it.

**WebGL path untouched.** I ran `/dev/surface-parity` and `/dev/surface-parity/gl` twice each, with WebGL on, against the working tree (dev server on 5702) and against a clean HEAD copy (`git archive`, dev server on 5703). Both pages give identical results in all four runs, once timings, the legacy files' hash (line endings differ in the archive copy) and one case are left out. That case is "Ocean sweep 0.5", the jittered motion-blur case, which differs run to run in both trees (1,557 to 1,567 mismatched bytes). The comparison script is `findings/kl_runtime/parity_compare.mjs`. Both pages report "Mismatch" against legacy at HEAD as well; that is not new. Neither page imports a file this change touches.

**Speed** (headless Edge, WebGL off, 1600 × 1000, the app's default enhanced mode). First paint is from the first frame sent to the worker until every disc has a tile:

| System | Discs | First paint, DPR 2 | First paint, DPR 1 |
|---|---|---|---|
| Regina | 20 | 735 ms (all sharp at 755 ms) | 543 ms |
| Derchon | 3 | 228 ms | 103 ms |
| Mjolnir | 16 | 619 ms | 385 ms |

- Cached, in the browser at DPR 2: after the window height changed, the 8 Regina discs whose size changed had new tiles 73 ms after the resize.
- 12 bodies at Regina's DPR 2 sizes (30, 26, 25, 11, 11, 11, 9, 9, 9, 8, 8, 8 px), worker code in Node (`bench_system.mjs`):
  - Enhanced: 553 ms cold to every disc sharp. Repainting all 12 from cached globes takes 1.1 to 6.6 ms.
  - Vanilla: 217 ms cold; cached 0.8 to 2.4 ms.
  - With one disc at the 360 px cap: enhanced 815 ms cold and about 15 ms cached; vanilla 673 ms cold and 14 to 15 ms cached.
- Main thread: there are no long tasks at DPR 1. At DPR 2 there are 50 to 70 ms tasks, but an A/B in the same WebGL-off browser shows they come from drawing the canvas in software with no GPU, not from the discs (`ab.mjs`). With the software discs: 1 to 7 per load, 50 to 69 ms. With the worker blocked (the old flat discs): 2 to 4 per load, 50 to 90 ms. The renderer's own draw is 0.9 to 1.7 ms per frame on average in both. The main thread only builds and posts one message per frame; how to pick each body's sheet is worked out once per body.
- The first version took 11.4 s for Regina. Two fixes: smaller first globes with the hybrid sheet sized to the globe, and running the hybrid build's page-sized steps until the slice is spent.

## Contract published
none

## Needs from others
- Owner of `apps/web/src/dossier/SurfaceStage.vue`: the dossier map loses nothing without WebGL, so it should show no notice. Change line 114 to `const webglNotice = '';`, or drop the notice and its `.doss-webgl` style. Until then the dossier shows the orbit view's new sentence, which says planet surfaces are simpler. That is wrong for the dossier, though harmless.
- Owner of `apps/web/src/orbit/OrbitRenderer.ts`: two comments are now out of date. One at lines 482-483 ("The discs stay the flat day-and-night fallback"), one at line 10 ("Worlds are flat discs ... until planet imagery lands"). No code change is needed.

## Questions for Johnny
1. **The dossier notice.** Should the dossier stop showing the WebGL notice now that nothing is missing there? My suggestion: yes, the one-line change above, done by the dossier's owner. I did not edit the dossier, because my prompt does not name it.
2. **Small enhanced globes read a smaller sheet.** For discs up to 64 px radius, the globe reads a 400 × 200 or 200 × 100 sheet from the same hybrid painter on the same net, not the dossier's 800 × 400 sheet. From 256 rows (discs over 64 px) it is the dossier's sheet itself. This made cold first paint about 4 times faster (200 ms against 50 ms per body), and the difference cannot be seen on a disc that small. My suggestion: keep it.
3. **Gas giants.** They have no sheet, so they are painted with the WebGL bake's bands in the profile's own colours, without its noise and storm. The rings keep the WebGL density profile. The alternative is a flat disc with flat rings, as before. My suggestion: keep the bands. See `kl_discs_gas_regina_a4_close_webgl_off.png`.
4. **Tilt above 54 degrees on vanilla worlds.** The WebGL bake moves the cold to the equator past a folded tilt of 54 degrees (`tilt_latitude.ts`). The vanilla diamond sheet does not, and the software disc follows the sheet: ice stays at the poles, as in the dossier. Enhanced worlds already carry the factor in the hybrid sheet. My suggestion: keep following the sheet, as the prompt asks the disc to match it.
