# Lane C surface map, second pass

Prompt: prompts/c_surface_map_2.md
Status: done

## Before and after

The before pair is version 1.1.5. The large map sits on the left edge, and the column key is dim and cut off.

- `findings/ui_design_shots/live_map_large_1.1.5.png` / `kc_map2_large_1440.png`
- `findings/ui_design_shots/live_map_key_column_1.1.5.png` / `kc_map2_column.png`

The browser pass used a production build of `apps/web`, a static server on 127.0.0.1:5213 that proxies `/api/` and `/objects/` to https://traveller.voyage, and a separate headless Chrome profile. The WebGL shots omit `--disable-gpu`. The server and Chrome are stopped.

Window sizes, zoom, and the column:

- `kc_map2_large_1440.png`, `kc_map2_large_1920.png`, `kc_map2_large_1024.png`
- `kc_map2_large_narrow.png` (1000×800, legend under the map)
- `kc_map2_zoom_max.png`, `kc_map2_zoom_fit.png`, `kc_map2_pan.png`
- `kc_map2_legend_hover.png`, `kc_map2_hex_name.png`
- `kc_map2_column.png`

Terminator strengths 22%, 40%, and 62%. The page ships 40%.

- `kc_map2_term_22.png`, `kc_map2_term_40.png`, `kc_map2_term_62.png`

Night on a water world and a dry world. The page ships the middle step. The other two steps are the same shadow buffer with the alpha scaled, because the night alpha is linear in the peak.

- `kc_map2_night_water.png`, `kc_map2_night_water_058.png`, `kc_map2_night_water_072.png`, `kc_map2_night_water_086.png`
- `kc_map2_night_dry.png`, `kc_map2_night_dry_058.png`, `kc_map2_night_dry_072.png`, `kc_map2_night_dry_086.png`

Reduced motion, vanilla, and WebGL off:

- `kc_map2_reduced.png`
- `kc_map2_vanilla.png`, `kc_map2_vanilla_column.png`
- `kc_map2_webgl_off.png`

## Changed files

- `apps/web/src/dossier/SurfaceStage.vue`: one centred card for the large map. The legend sits inside it. Zoom, pan, the terminator, the sun mark, and the hex name live here.
- `apps/web/src/dossier/SurfaceKey.vue`: the symbol key. Rows are buttons. Terrain glyphs sit on that terrain's colour. The absent group is collapsed.
- `apps/web/src/surface/hybrid/symbols.ts`: legend headings, ink against a swatch, and a highlight ring for the named code.
- `apps/web/src/surface/hybrid/overlay.ts`: the night peak is the middle step. The 12° twilight band is unchanged.
- `apps/web/src/surface/hybrid/view.ts`: zoom and pan for the large map. New file.
- `apps/web/src/surface/hybrid/chrome.ts`: the terminator stroke and the sun mark. New file.
- `apps/web/src/design/tokens.css`: `--surface-terminus`, `--surface-sun-mark`, `--surface-pick`. Appended after `--surface-hex`.
- `tests/web/surface_hybrid.test.js`: legend headings, the weakest row, the night peak, terminator segments, and the zoom clamp.

## What you see

The large map is one card, centred in the window, with 24px of frame padding (`--sp-6`). The card is as tall as the map and the key, so the top and bottom margins are the space that remains. Nothing in the card draws outside the window at 1024×700 and above. Under 1024px wide the legend moves under the map and the card scrolls.

Measured margins, top, right, bottom, left, in CSS pixels:

| Window | Top | Right | Bottom | Left | Stage |
| --- | --- | --- | --- | --- | --- |
| 1440×900 | 166.8 | 24 | 166.8 | 24 | 857×428.5 |
| 1920×1080 | 136.8 | 24 | 136.8 | 24 | 1337×668.5 |
| 1024×700 | 159.3 | 24 | 159.4 | 24 | 441×220.5 |

The stage stays 2:1, so the sheet is not stretched. At 1000×800 the body stacks, the legend is one column, and the four margins are 24.

The column figure on Vech is 379 CSS px. The hold is 379 while the large view is open, and the figure is 379 after it closes. The earlier pass measured 376. See the question below.

Zoom and pan are on the large map. The wheel step is 1.1 per 100px, the same as the chart. Buttons, `+`, and a double-click zoom by 1.5 about the pointer or the centre. `0` and **Fit** return to 1×. Arrows pan by 15% of the stage when the zoom is above 1×. A drag follows the pointer. A pinch from 1.00 landed on 2.38. The translation stops at the edge: at zoom 2.38 on the 1440×900 stage, x stops at 0 and at −1179.36, and y stops at 0 and at −590.37. The column stays at 1× when you turn the wheel. Reduced motion sets the frame's `animation-name` to `none`. The zoom layer's transition duration is `0s`.

The sheet stays 1600×800. The pixel buffer is 5,120,000 bytes. On Vech the large bake reported `data-sheet-ms` 818.5, and the column bake reported 279.2. Zoom stops when one hex is 48 CSS px (`HEX_READ_PX` in `view.ts`). On the 1440×900 stage that is zoom 2.38, and the sheet is about 0.79 sheet pixels per CSS pixel there. The vanilla sheet stays 800×400 and is scaled in CSS, so it is softer at the same zoom.

The key reads `CODE_TABLE` in `codes.ts`. The kinds in that table are sea, ice, land, accent, and feature. The headings are Sea, Ice, Land, Accents, and Features, in that order, and the codes follow `SURFACE_CODES`. Codes on this world come first. The rest sit under **Not on this world (N)**, collapsed. At a viewport of at least 1024×700 the list is two columns. Names are 14px/20px in `--text-1`. The weakest row is Volcano, contrast ratio 3.58, ink `[25,25,30]` on the volcano swatch `[232,80,28]`. Pointing at a row rings that symbol's hexes. Arrow keys on the focused map name the hex under the scale. On Vech that name was Shallows.

The enhanced column has one control, **Map and key**, title "Open the map large, with the key". The vanilla column says **Open the map large**, because that renderer has no symbol key. There is no `#surf-key`.

The twilight band stays 12°. The terminator is a 1px stroke in `--surface-terminus` (icon port at 40%). The trials are 22%, 40%, and 62% in `TERMINUS_ALPHA_STEPS`. The sun mark is a 6px ring in `--surface-sun-mark`, at the subsolar point, on the column and on the large map.

The night tint RGB stays `[8,12,32]`. The peak alpha with air is `NIGHT_PEAK` 0.72, the middle of `[0.58, 0.72, 0.86]`. A world with no air uses `NIGHT_PEAK_AIRLESS` 0.76, the middle of `[0.62, 0.76, 0.90]`. On Vech A-II the shadow's peak byte was 184 (0.72). On the dry body `/b/w5m0` it was 194 (0.76). Ice and rock stay readable on the night side at the shipped step, and the settlement lights stay on the glow canvas.

`names.js` contains the string I-n-Amenas. The local tree has no body route for Greenwater 0706. The pass uses Vech (`/s/Mavuzog/2922/b/w1`, land and sea), Vech A-II (`/b/w2`, water, frozen, scale "1 hex ≈ 852 km"), and `/b/w5m0` for the dry night. Vech's own scale reads "1 hex ≈ 920 km".

With WebGL off, the enhanced sheet still paints (a centre pixel was `[30,70,102,255]`) and the notice is the existing `SURFACE_WEBGL_NOTICE`. The vanilla large view opens with the zoom controls. `data-mode` is `vanilla`.

## Tune lines

Change one line, then reload:

- `NIGHT_PEAK` in `apps/web/src/surface/hybrid/overlay.ts` (the middle of `NIGHT_PEAK_STEPS`)
- `NIGHT_PEAK_AIRLESS` in the same file (the middle of `NIGHT_PEAK_AIRLESS_STEPS`)
- `--surface-terminus` in `apps/web/src/design/tokens.css` (40%, matching `TERMINUS_ALPHA` in `chrome.ts`)
- `--surface-sun-mark` in `tokens.css`
- `HEX_READ_PX` in `apps/web/src/surface/hybrid/view.ts` (48) for how far the zoom goes

`TWILIGHT_BAND_DEG` stays 12.

## Gates

npm test: pass (1453 pass, 0 fail, 18 skipped)
npm run check: pass (manifesto: clean)
typecheck: pass (`tsc --noEmit -p apps/api`, and `vue-tsc -b` inside the web build)
fourth gate: `node scripts/surface_parity.js` exited 0. The page object prints `"ok": false` for the known sheet differences. The process exit is 0, so the pinned counts still match.

The browser pass is the shot list above.

## Contract published

none

## Needs from others

none

## Questions for Johnny

1. The column figure measures 379 CSS px, and it stays 379 while the large view is open and after it closes. The previous pass measured 376. Leave the figure at 379? Suggested answer: yes. The open and the close match, so the column does not jump.
