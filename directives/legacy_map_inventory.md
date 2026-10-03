# Legacy map inventory — what `js/renderer.js` draws, rule by rule

**Status:** REFERENCE, written 2026-10-03 for slice 1 part B. A read-only review agent read
`js/renderer.js` in full plus the helpers it calls (`constants.js`, `core.js`,
`filter_engine.js`, `io_manager.js`, `otu_metadata_parser.js`, `routes.js`, `borders.js`).
The orchestrator checked these against the files and they match: the hex-number line
(`renderer.js:1450`), the starport rule (1455-1459), the two default filter rules
(`filter_engine.js:44-62`), the gas giant and base constants (`constants.js:229-247`).
Everything else is as reported; **re-read the cited lines before a part B step depends on
one.** What was concluded from this is in `slice_1_viewer.md` §B. This file is the evidence.

Line numbers are `js/renderer.js` unless a file is named. Legacy geometry: `baseHexSize = 50`
world units, so one parsec (one column step) is 75 units. To convert a legacy world-unit
number to parsecs, divide by 75. `x / zoom` means a constant screen size of `x` pixels.

## Five things that would surprise a spec writer

1. The "hex number" the legacy map prints is the whole legacy id (`37-C-0101`), not the
   four-digit code (1450). The new map prints the four digits.
2. Gas giant, scout triangle, base-code text and naval star sit inside the
   `if (data.name ...)` block that closes at 1833: a world with an empty name gets none of
   them. That is an accident of nesting, not a rule. Do not reproduce it.
3. The water / asteroid / plain disc distinction is **not in the renderer**. It comes from
   two default filter rules that write `state.custom_ui` (`filter_engine.js:44-62`).
4. The "simple dot" branch at 1472 is unreachable (the loop only runs when text is on).
5. Allegiance text per hex, star symbols, capital or population name styling, and
   importance-driven styling **do not exist** in the legacy map.

## Paint order

background (871) → macro starfield (983) → hex fills and grid, or macro polity fills
(1029-1062) → routes (1070-1257) → border outlines (1292) → system dots (1355) → per-hex
worlds (1356-1943) → subsector and sector lines, sector names (1947-2010) → subsector title
pills (2012) → selection and inspect outlines (2019-2035) → border names, region names
(2044-2047).

## Zoom levels (166-171; legacy zoom × 75 = pixels per parsec)

| Legacy zoom | px per parsec | Worlds | Grid | Fills | Routes |
|---|---|---|---|---|---|
| ≥ 0.85 | ≥ 63.75 | full glyphs | hex outlines | per hex | per segment, side-by-side offset |
| 0.3 - 0.85 | 22.5 - 63.75 | one dot per system | hex outlines | per hex | per segment, offset |
| 0.10 - 0.3 | 7.5 - 22.5 | dot per system if ≤ 12,000 cells visible | none | polity loops | cached path per colour |
| 0.07 - 0.10 | 5.25 - 7.5 | dot per system if ≤ 12,000 cells | none | polity loops | none |
| < 0.07 | < 5.25 | procedural starfield only | none | polity loops | none |

Dots and grid fade over 500 ms; text snaps on and off (a text fade would repaint the pan
bitmap every frame).

## 1. A world at full detail (zoom ≥ 0.85)

Layout, hex centre at (0, 0), y down, in legacy world units (hex size 50):

| Element | Position | Size | Rule and source |
|---|---|---|---|
| Hex number | (0, -37.5), centre / top | 10 px Inter | every present system (1450) |
| Starport letter | (0, -12), centre / bottom | bold 18 px Inter | `uwp[0]` as written (1455-1459; `io_manager.js:2027`) |
| Travel-zone halo | circle at (0, 0) | radius 15, stroke `2.5 / zoom`, fill at 20% | zone Red `#FF0000`, any other non-green value `#FFBF00` (1414-1431) |
| World disc | circle at (0, 0) | radius 10 | see below |
| UWP string | (0, +13), centre / top | 10 px Inter | `uwp` as written (1700-1707) |
| Name | (0, +37.5), centre / bottom | 12 px Inter, never bold | `name` as written (1713-1731) |
| Gas giant | (+26, -9) | filled circle radius 3.5 | `pbg[2] > 0` (1755; `io_manager.js:2041`). Ringed (ellipse scale 1.26 × 0.385 on radius 5.5, stroke `2.5 / zoom`) when trade codes include `Sa` (1764-1766) |
| Naval base | (-22, -9.9) | filled 6-point star, outer 4.9, inner 2.205 | `bases` includes `N` (1815) |
| Scout base | (-22, +6.3) | filled triangle, apex up, radius 4.9 | `bases` includes `S` (1788) |
| Other base codes | (-20, 0), right / middle | 10 px text | the **whole** `bases` string, when it has any letter other than N or S (1804) |

Text and symbols are white (`#ffffff`), `#ffb399` when selected.

**World disc** (1465-1677). With only the two default rules:
- **Water present** (atmosphere `2`-`9`, `D` or `E`, and hydrographics above 0): solid disc `#46b4e8`.
- **Asteroid belt** (size digit 0): five circles of radius 2.5 at (-8,-2) (0,-5) (8,-2) (-5,5) (5,4), default colour.
- **Anything else**: solid disc in the default colour, `#ffffff`.
There is no separate "no water" or "vacuum" symbol. The legacy decoder turns a character it
does not recognise into 0, so an unknown size digit (`?`) would probably draw as an asteroid
belt in the legacy app; that is not verified and must not be copied.

**Not drawn per world by the legacy map:** allegiance, stars, anything from importance or
population, any symbol for an unknown or partial row.

## 2. Below full detail

One filled circle per system (1308-1352): radius 10 world units down to zoom 0.15, then a
constant 1.5 screen pixels; colour is the disc colour (so the water blue survives, the
asteroid shape does not). Nothing else per hex: no numbers, halos, letters or names.

## 3. Grid, sector and subsector lines, names

- **Background** `#0b0c10` (871). **Hex grid** `#1f2833`, `1 / zoom` (1046-1049), shown from
  zoom 0.3; fades out below, only while ≤ 8,000 cells are visible.
- **Subsector lines** every 8 columns and 10 rows, straight, `rgba(255,255,255,0.15)`,
  `1 / zoom`. **Sector lines** `rgba(255,255,255,0.4)`, `3 / zoom`, drawn over them
  (1947-1978). No zoom condition.
- **Sector names** (1985-2003): only **below** zoom 0.85. Centred in the sector, rotated
  -30°, `bold italic` Courier New at 312 world units (13% of the sector width, so it scales
  with zoom), `rgba(255,255,255,0.60)`.
- **Subsector titles** (2080-2289): only from zoom 0.85. A screen-space pill reading
  `Sector - Subsector`, `600 13px Inter` shrunk to fit and dropped below 9 px; text
  `#66fcf1` on black at 55%. Placed along the inside edge of the visible part of the
  subsector at the spot that covers the fewest systems; omitted if every spot collides.
  Subsector letter = `A` + row × 4 + column; name from the metadata, else `Subsector X`.

## 4. Routes

- Shown from zoom 0.10. Width `2 / zoom` for every route (1074). The XML `Type` attribute is
  never read.
- Dash from `Style`: `dashed` → `[8, 5]`, `dotted` → `[1.5, 3]` (world units), else solid
  (745-750).
- Colour (`otu_metadata_parser.js:146-245`): a route with no `Allegiance` is an X-boat
  route, `#016a01`. Otherwise: the route's own `Color`, else the sector **stylesheet**
  rule `route.CODE { color }`, else a built-in table by allegiance code (33-56), else the
  next unused palette colour.
- Geometry: straight line between hex centres, shortened by 20 world units at each end;
  segments shorter than 40 are skipped (1143, 1168). From zoom 0.3, routes sharing both
  ends, or one end and one of 12 direction buckets, are spread sideways by 5 world units
  each (1106-1163).
- Endpoints in another sector: `StartOffsetX/Y` and `EndOffsetX/Y` are sector offsets
  added to the owning sector's coordinates.

## 5. Borders and polity fills

- The renderer never sees the XML path. At import (`borders.js:580-1154`) each border
  becomes a **set of hexes**: the path's waypoints are joined with straight hex lines, then
  a flood fill runs from `LabelPosition`, a sector corner or a centroid probe; a fill that
  leaks to the bounding box is thrown away and only the boundary hexes are kept. Borders
  with `ShowLabel="false"` are processed first ("weak"), and hexes owned by a strong border
  act as walls. One hex belongs to at most one border.
- Grouping is hard-coded: allegiance codes starting `Kk` → "Two Thousand Worlds", `V` →
  "Vargr Extents", `Zh` → "Zhodani Consulate"; otherwise the `Label`, else the code
  (`borders.js:601-604`).
- Colour: the border's `Color`, else the stylesheet rule `border.CODE { color }`, else a
  default cycle. Named colours are remapped through a table (`borders.js:21-35`).
- **Outline** (2297-2452): every hex side whose neighbour is outside the set, chained into
  loops, each vertex moved inward by 10% of the hex size; stroke in the border colour,
  `2.5 / zoom`, solid. Shown from zoom 0.3. The XML `Style` is not used.
- **Fill**: at grid zoom each hex of the set is filled in the border colour at 20% (992-998).
  Below zoom 0.3 the same loops are filled at 22% and stroked, with vertices thinned
  (486-517).
- **Labels** (2466-2582): off by default. Text is the name in capitals, bold Courier New,
  10-22 px by territory size, in the border colour on a black pill, placed at the centroid
  of the member hexes clamped into view. `LabelPosition` is not used for placement.

## 6. Regions

`<Regions><Region Label Color LabelPosition>` in the same XML are imported like borders into
hex sets and drawn as a 30% fill with no outline (1007-1013; `borders.js:1171-1513`). Names
are off by default. Regions are also a user-editing feature.

## 7. Zoomed-out layers

- **Starfield** (442-484): procedural, not real systems. Not carried over; the new overview
  file shows the real ones.
- **Polity fills**: section 5.

## 8. Hooks that are not world data (listed so nobody mistakes them for chart rules)

Player fog (`_mapShow`), filter-engine colour, shape, ring, name case and background,
painted hex colours, print mode, dev view, hide-no-planet systems, RTT industry digit,
per-layer visibility toggles, selection and focus dimming, route shortfall ring, route
preview, perf overlay. These belong to the builder and campaign slices.

## 9. Performance techniques in the legacy map

Pan bitmap larger than the window, blitted while dragging and rebuilt when the margin runs
out (173-440); one `requestAnimationFrame` per burst of changes (207-214); a flat index of
present systems so the dot pass skips empty hexes (610-622); dirty flags on the hex and
border maps (116-161); cached fill maps and border loops (624-743, 2297-2414); one cached
path per route colour below zoom 0.3 (745-828); dots grouped by colour into one path
(1335-1349); loops only over the visible cell range; the caps of 12,000 and 8,000 visible
cells. Not batched in legacy: the hex grid (a path per hex) and the per-world text.

## 10. What truth v2 does not carry (checked against the v2 index on the CDN)

| Missing | Needed for | Where it is |
|---|---|---|
| The sector `<Stylesheet>` (in 62 of 512 XML files) | route and border colours that have no `Color` attribute | metadata XML; the parser drops it |
| The `<Allegiance Code>` name table | a border's name when it has no `Label` | the parser reads it; `assembleSectorIndex` drops it |
| `<Region>` elements (206 in all) | region fills and names | metadata XML; not parsed |
| Border hex sets or outline loops | outlines, fills, label positions | must be computed from the path by the flood fill in `borders.js:755-1132` |

Present in v2 and enough for every per-world symbol: `name`, `uwp`, `zone`, `bases`,
`tradeCodes`, `pbg`; and for routes and borders: every XML attribute as written (`Start`,
`End`, offsets, `Allegiance`, `Color`, `Style`, `Label`, `LabelPosition`, `ShowLabel`,
`WrapLabel`) and the border `path`.

## Not determined

How the legacy filter matcher treats a `?` digit; whether `borders.js` reads `Style`
anywhere outside the lines read; the details of region import past line 1270; the second,
manual XML route import in `io_manager.js:2311+`.
