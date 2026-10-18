# C hybrid colours report
Prompt: prompts/c_hybrid_colours.md
Status: done

## Changed files
- apps/web/src/design/tokens.css: new token lines only, after `--icon-farm-line`. Listed below. Outside the lane folders; this prompt allows them.
- apps/web/src/dossier/SurfaceStage.vue: blank-net fill and stroke read `--surface-net-fill` and `--surface-net-stroke` through `iconPaint`, once per blank body.
- apps/web/src/surface/hybrid/daynight_layer.ts: sun sprite and terminator stops read once in `sunPaint()` when the layer is built. `drawReticle` uses those strings.
- apps/web/src/surface/hybrid/symbols.ts: symbol ink cached on first use; outlines, graticule, twilight ring, and scale chip read their tokens when that layer is drawn, not per pixel.
- findings/push/hybrid_surface_notes.md: the new `--surface-*` names, and which ones reuse `--attention`, `--signal`, and `--icon-port`.
- findings/push/hybrid_surface_files.txt: `apps/web/src/design/tokens.css` was already on the list. No new path.
- findings/push/hybrid_colour_daynight.png: after shot, day/night on, Regina satellite (`/s/Spinward_Marches/1910/b/w4m1`).
- findings/push/hybrid_colour_symbols.png: same body after Symbols is pressed.

`map_palette.ts` was not edited. Vanilla `map_grid.ts` still builds `rgba()` from palette channels. That line is not in the 19. `enhanced/map.ts` `rgb` stays, as the audit left it out.

No before shot. The literals were already tokens when the shots were taken. Each token is the old channel triple. Playwright's page bitmap dropped the canvas (sheet pixel at 400,200 was `[206,190,160,255]`, opacity 1, and the stage clip was a flat field). The two files are composites of the sheet, shadow, glow, and marks canvases. The day/night shot shows the terrain, the cyan terminator, the amber twilight, and the sun reticle. The Symbols shot adds the hex net, glyphs, and graticule.

Token lines added:

```css
  /* Hybrid surface map. Canvas reads these once per layer, the way icons read --icon-*. */
  --surface-net: #788296;
  --surface-net-fill: color-mix(in srgb, var(--surface-net) 18%, transparent);
  --surface-net-line: #a0aabe;
  --surface-net-stroke: color-mix(in srgb, var(--surface-net-line) 45%, transparent);
  --surface-sun-core: #fff4d6;
  --surface-sun-inner: color-mix(in srgb, #ffd68c 85%, transparent);
  --surface-sun-mid: color-mix(in srgb, #ffaa50 28%, transparent);
  --surface-sun-edge: color-mix(in srgb, #ff963c 0%, transparent);
  --surface-twilight-core: color-mix(in srgb, #ffe28c 90%, transparent);
  --surface-twilight-mid: color-mix(in srgb, #ffbe5a 45%, transparent);
  --surface-twilight-edge: color-mix(in srgb, var(--attention) 0%, transparent);
  --surface-terminator-lit: color-mix(in srgb, var(--attention) 85%, transparent);
  --surface-terminator-signal: color-mix(in srgb, var(--signal) 80%, transparent);
  --surface-ink-on-light: color-mix(in srgb, #19191e 85%, transparent);
  --surface-ink-on-dark: color-mix(in srgb, #fafaf5 90%, transparent);
  --surface-outline-dark: color-mix(in srgb, #000000 30%, transparent);
  --surface-outline-light: color-mix(in srgb, var(--icon-port) 30%, transparent);
  --surface-graticule: color-mix(in srgb, var(--icon-port) 35%, transparent);
  --surface-twilight-ring: color-mix(in srgb, #ffbe3c 90%, transparent);
  --surface-twilight-midline: color-mix(in srgb, var(--icon-port) 90%, transparent);
  --surface-scale-chip: color-mix(in srgb, #10141c 75%, transparent);
```

`--attention` is `#ffce73` (the old `255,206,115`). `--signal` is `#66fcf1` (the old `102,252,241`). `--icon-port` is `#ffffff`.

Terminator frame: `node .tmp/hy_frame.mjs` median 0.423 ms, first 0.264 ms, last 27.572 ms. The last sample is the cold half-field, built once. `tests/web/surface_hybrid.test.js` still requires a median day/night frame under 4 ms, and that test passed inside `npm test`. There is no paired before number from this script.

## Gates
npm test:      pass. 1310 tests, 1296 pass, 0 fail, 14 skipped, 26625 ms. The skipped suites ask for `RUN_API_TESTS=1`.
npm run check: pass. manifesto clean, exit 0.
typecheck:     pass. `tsc --noEmit -p apps/api`, exit 0, no output.
fourth gate:   pass. `npm run build`, 488 modules, built in 834 ms, exit 0.
`node scripts/surface_parity.js`: exit 0. Flat-map worlds mismatches 0. Negative control "Regina negative" mismatches 616030. GL "Ocean radius 1100" mismatches 0, maxChannelError 0, allowedDrift false. The script was not patched. An earlier run of the same script, before this colour edit, exited 1 on that row with one pixel and allowedDrift true.

## Contract published
none

## Needs from others
none

## Questions for Johnny
none
