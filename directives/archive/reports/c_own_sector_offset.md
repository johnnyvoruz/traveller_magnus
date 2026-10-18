# Lane C c_own_sector_offset report
Prompt: prompts/c_own_sector_offset.md
Status: done

Found no half-done edit for this question.
Finished the trace. The 15 hexes are the gap from the six systems to the middle of their sector.
Backed nothing out. No product file was changed.

## Where a slot becomes a chart position

One formula is used everywhere the chart is drawn. Column and row are 1-based. `ROW_STEP` is √3 / 1.5.

`q = slot.x * 32 + col - 1`
`r = slot.y * 40 + row - 1`
`x = q`
`y = ROW_STEP * (r + (q odd ? 0.5 : 0))`

| Path | File and line | What it does |
|---|---|---|
| Chart geometry | `apps/web/src/map/geometry.ts` 20–21, 49–50, 69–75 | `toGlobal`, `hexCentre`, `sectorRect`. The rectangle is `x` from `sx*32` to `(sx+1)*32`, `y` from `sy*40*ROW_STEP` to `(sy+1)*40*ROW_STEP`. |
| Map draw | `apps/web/src/map/MapRenderer.ts` 313–319, 882, 1585–1591 | A sector is drawn at its `x`,`y`. Dots use `toGlobal`. The name is the centre of `sectorRect`. |
| Map navigation | `apps/web/src/views/MapView.vue` 2378; `apps/web/src/map/routes.ts` 129; `apps/web/src/map/campaign_layer.ts` 254 | Same `toGlobal`. |
| Build pane | `apps/web/src/workspace/build/sectors.ts` 54–58 | An own sector is laid into the manifest at `slot.x`, `slot.y`. |
| Build marks | `apps/web/src/workspace/build/marks.ts` 19, 29 | Hex outlines and the slot box use `toGlobal` and `sectorRect`. |
| Package placement | `packages/shared/src/package_place.ts` 66–69 | `q = slot.x * 32 + col - 1`, `r = slot.y * 40 + row - 1`. |
| Generation copy | `packages/generation/src/geometry.ts` 9–10 | The same `toGlobal`. |
| Dot index | `apps/web/src/builder/dots.ts` 16 | Not a world position. Cell `(col-1)*40 + (row-1)`, which is what the map reads. |
| Example restore | `tools/examples/build_local.mjs` 148–150 | Places the recorded `ownSectors` slot. No pixel math. |
| Cover shots | `findings/examples/shot_cover.mjs` 4 and `shot_cover2.mjs` 9 | The same `q`, `r`, and `hexCentre` as the map. The camera is the mean of the hexes. |

`apps/web/src/workspace/market/place.ts` 171–173 is the other formula. The package thumbnail does `col = slot.x * 32 + hexColumn` and `row = slot.y * 40 + hexRow` with no `-1`, then `x = col * 1.5` and `y = (row + (col even ? 0.5 : 0)) * √3`. In chart parsecs that is one column right and one row down of the map. The six hexes keep their shape. It is not a 15-hex shift. That file is the store, not this lane.

The legacy renderer (`js/core.js` 371–381, `js/renderer.js` 1999) places sectors by a positive sector number on its own grid. It does not read a `~` id or a slot `{x,y}`.

## Hollow Verge

Slot `(-8, -5)` in `tools/examples/packs_z/hollow-verge/pack.json`, in the recorded manifest `ownSectors` for `~01M4YA2WYWQ0R1ZMADZTBGT421`, and in the local cover universe (`findings/examples/local_covers`, sector `~ER40DFKRS7YZ09421J1WHRH3SX`). The rehearsal script `findings/examples/rehearse.mjs` places a different copy at `(-12, -3)` on purpose.

World position from the shared formula. `y` is parsecs.

| Hex | q | r | x | y |
|---|---:|---:|---:|---:|
| 0101 | -256 | -200 | -256 | -230.940 |
| 0102 | -256 | -199 | -256 | -229.785 |
| 0103 | -256 | -198 | -256 | -228.631 |
| 0201 | -255 | -200 | -255 | -230.363 |
| 0202 | -255 | -199 | -255 | -229.208 |
| 0302 | -254 | -199 | -254 | -229.785 |
| Mean of the six | -255.333 | | -255.333 | -229.785 |
| Sector rectangle centre (the name) | | | -240 | -207.846 |

The map, the Build marks, `package_place`, the generation copy, and both cover scripts give the hex rows. The sector name is the rectangle centre.

The mean of the six is **15.33 columns left** of the sector centre, and 19.00 rows above it. The systems are columns 1–3 and rows 1–3 of a 32 by 40 sector. Half a sector is 16 columns and 20 rows. Z's "about 15 hexes" is that gap. The map is not drawing the hexes somewhere else.

The thumbnail, scaled back to parsecs, sits one column and one row off each of those hexes. Same for every path that uses it. It does not move the cover.

## What was placed

The cover universe's sector is at `(-8, -5)`, the recorded slot. The published cover was framed on the systems by eye after the first shot missed. Nothing in production was stored with a second arithmetic. No file this lane owns is wrong, and `tools/examples/` does not compute a pixel position.

## Changed files
- none

## Gates
npm test:      not re-run. No product file changed.
npm run check: not re-run. No product file changed.
typecheck:     not asked
fourth gate:   not asked

## Contract published
none

## Needs from others
none

## Questions for Johnny
none
