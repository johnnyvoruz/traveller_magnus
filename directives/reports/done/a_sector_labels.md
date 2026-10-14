# Lane A sector labels report

Found: Progress was empty. The uncommitted edits in MapRenderer.ts and glyphs.ts are the accepted public-games diamonds. No half-done label work.
Finished: sectorNames refits a name once the display font has loaded, then keeps the cached width.
Backed out: nothing.

Prompt: prompts/a_sector_labels.md
Status: done

## Changed files
- apps/web/src/map/MapRenderer.ts: the label pass (`sectorNames`, with `settleNameFont`). A name wider than the sector less a 16% margin scales down to that width. Below a 9 px floor it is not drawn. The 9 px floor is half the 18 px display size; under that the name is noise. The 16% margin keeps neighbouring names from touching. No ellipsis. Widths are measured once per name. The first frame can run before Orbitron has loaded and would otherwise keep the narrower fallback width, so the next frame clears that cache and measures again. A settled frame does not call measureText.
- tests/web/renderer.test.js: the fallback width is refitted after the display font loads, and a later frame does not measure again.
- findings/ka9_column_z1.png, ka9_column_z2.png, ka9_column_z3.png: the north column at 0.585, 4, and 8 px per parsec.
- findings/ka9_marches_z1.png, ka9_marches_z2.png, ka9_marches_z3.png: the Spinward Marches at the same three zooms.
- glyphs.ts: not edited. Subsector titles do not share this pass (`subsectorTitles` already drops below 9 px, and only from 63.75 px per parsec). The first view's framing was not changed.

## Gates
npm test:      pass (1604 tests, 1577 pass, 0 fail, 27 skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass
build:         pass (index 176.38 kB)
fourth gate:   pass

On a quiet run, empty overview, 1532×1000, truth v5, after the font had loaded. Drawn and skipped are sector names. Frame time is the median of six draws.

| Place | px per parsec | Drawn | Skipped | Frame |
|---|---:|---:|---:|---:|
| North column | 0.585 | 1 | 249 | 0.30 ms |
| North column | 4 | 5 | 0 | 0.00 ms |
| North column | 8 | 3 | 0 | 0.10 ms |
| Spinward Marches | 0.585 | 1 | 242 | 0.20 ms |
| Spinward Marches | 4 | 80 | 0 | 0.60 ms |
| Spinward Marches | 8 | 21 | 0 | 0.30 ms |

Before this change, warm frames on the same canvas were 0.0 to 0.4 ms. At 4 px per parsec, "Tsebntsiatldlants" was 136 px of ink on a 128 px sector (cached fallback 133 px, Orbitron 170 px). After, the ink is 106 px, from x 713 to 818, inside the sector (702 to 830) and inside the 84% box (712 to 820).

## Contract published
none

## Needs from others
none

## Questions for Johnny
none
