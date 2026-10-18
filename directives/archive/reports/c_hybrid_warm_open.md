# C hybrid warm open report
Prompt: prompts/c_hybrid_warm_open.md
Status: partial

The worker paints the sheet. `data-longest-chunk-ms` is `0.0` on every open below, so the stepped page painter did not run. The long frames are the route that opens the dossier. On the tree path the hybrid overlay is 19–38 ms. The click itself is under 2 ms.

The budget (no presented frame at or over 50 ms) is not met inside this lane. A one-bitmap-per-frame stagger in `SurfaceStage.vue` still presented 50, then 58.4, then 66.7 ms on Regina's mainworld from the tree. Setting a canvas width cost 0.0–0.1 ms. Holding all five bitmaps at 1×1 and skipping the model still presented 66.8 ms (gaps 41.9, 66.8), with no canvas resize and no animation callback of 6 ms or more. That stagger was backed out. `SurfaceStage.vue` matches the tree this prompt started from.

That 66.8 ms belongs to the dossier route: `DossierPanel.vue`, `DossierBody.vue`, the router, and `MapView` laying out when the pane opens. This prompt forbids editing them.

The close's 58.4 ms Rangent II tree (gaps 41.7, 58.4, 58.4, 25) is the same class of frame. Today's cold Rangent II tree was heavier.

In-page `requestAnimationFrame`, headless Chrome, restored tree. Worst gap, then every gap at or over 50 ms:

- Rangent II tree `/s/Spinward_Marches/1411/b/w1`, DPR 1: worst 175. Gaps 133.3, 175. Sheet 581.8, worker 121.4, chunk 0.0, overlay 37.90.
- Rangent II tree, DPR 2: worst 75. Gaps 75, 50.1, 50, 50. Sheet 336.2, worker 79.0, chunk 0.0, overlay 21.50.
- Rangent II chip `/orbit/b/w1`, DPR 1: worst 833.6. Gaps 58.3, 108.3, 166.7, 833.6. Repeated across quiet runs as 808–883. Click 0.7 ms. Overlay 0.70. The only animation callback at or over 8 ms was `frame` at 20.5 ms.
- Rangent II chip, DPR 2: worst 58.4. Sheet 307.4, worker 69.0, chunk 0.0, overlay 0.70.
- Regina mainworld tree `/s/Spinward_Marches/1910/b/w4m1`, DPR 1: worst 75. Sheet 289.7, worker 78.0, chunk 0.0, overlay 24.40.
- Regina chip `/orbit/b/w4m1`, DPR 1: worst 58.5. Sheet 272.4, worker 58.5, chunk 0.0, overlay 0.70.
- Regina mainworld tree, DPR 2: worst 66.6. Sheet 301.1, worker 100.4, chunk 0.0, overlay 22.20.
- Regina chip, DPR 2: worst 58.3. Sheet 261.8, worker 53.6, chunk 0.0, overlay 0.40.
- Offenburg I (generated Spinward Marches 1911, first body `w0`, not the mainworld) tree, DPR 1: worst 66.5. Sheet 300.0, worker 64.7, chunk 0.0, overlay 22.30.
- Offenburg I chip, DPR 1: worst 66.6. Sheet 301.4, worker 70.2, chunk 0.0, overlay 0.60.
- Offenburg I tree, DPR 2: worst 66.6. Sheet 292.0, worker 64.1, chunk 0.0, overlay 21.90.
- Offenburg I chip, DPR 2: worst 75.1. Sheet 318.8, worker 86.0, chunk 0.0, overlay 0.60.

The one-pixel Ocean radius 1100 drift (channel error 1, `allowedDrift` true) is the handoff §59 ruling from 2026-10-04, recorded again as a driver defect in §§200–202 on 2026-10-08, before the hybrid map. This work does not edit the Vanilla GL path and does not patch `scripts/surface_parity.js`.

Line ranges re-read at the end of the pass and written into `findings/push/hybrid_surface_notes.md`. `DossierPanel.vue`: import 39, `sunOnSurface` 214–232, `nowDays` 234–238, `bodySurface` 265–271, the `DossierBody` bindings 506. `DossierBody.vue`: 6, 30–35, 48. `OrbitView.vue`: import 59, the watch 409, `registerClockDriver` 1548–1555. `browser.ts` 237–251. The notes now say the engine change does not ship. The nine engine lines and five fixtures were left as they are.

## Changed files
- findings/push/hybrid_surface_notes.md: line ranges re-checked against the tree; the Okina sentence now says Johnny holds the engine change and it does not ship.

No product code kept. `apps/web/src/dossier/SurfaceStage.vue` was edited during the probe and restored.

## Gates
npm test:      pass (1294 tests, 1280 pass, 0 fail, 14 skipped, 20816 ms)
npm run check: pass (manifesto: clean)
typecheck:     pass (tsc --noEmit -p apps/api, no output)
fourth gate:   pass (npm run build, 486 modules, built in 662 ms)
scripts/surface_parity.js: exit 1. Ocean radius 1100, mismatches 1, maxChannelError 1, allowedDrift true. Not patched.

## Contract published
none

## Needs from others
- Whoever next owns the dossier route (`DossierPanel.vue`, `DossierBody.vue`, the router, and `MapView` layout): the presented frame that stays at or over 50 ms on a warm open is theirs. Measured 66.8 ms with the surface bitmaps held at 1×1 and the hybrid model skipped. This lane cannot move it.

## Questions for Johnny
none
