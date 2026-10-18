# Agent A — parsecs between two hexes, for the jump estimate

Issued 2026-10-06 by the orchestrator. Do this after `a_index_tracks.md` is reported.

Agent D's jump preview must say how many parsecs a jump is, and the browser has no way to
ask: the engines' `getHexDistance` (`packages/engines/src/core/hex.js`) may not be imported
by `apps/web` (the checker's rule), and nothing in `apps/web/src/map` measures between hexes.
Johnny's rules text gives the unit: one hex on a sector map is one parsec.

## Build, in `apps/web/src/map/geometry.ts`

1. `hexDistance(a, b)`: the number of hexes between two global hex coordinates (the `{ q, r }`
   that `toGlobal` returns). It must give exactly what the engines' `getHexDistance` gives
   for the same four numbers; port its arithmetic, as `hexAt` was ported from the same file,
   and say so in the comment.
2. `parsecsBetween(hexKeyA, hexKeyB, sectorAt)`: both keys are `<sector_slug>/<hhhh>`;
   `sectorAt(slug)` returns that sector's grid position `{ sx, sy }` or null (the caller
   reads it from the truth overview). The answer is `hexDistance` of the two global
   coordinates, or null when a key does not parse or a sector is unknown. The same hex is 0.
3. Tell Agent D, in your report, exactly where the map gets a sector's `sx` and `sy` today
   (the type and the field in the overview), so D can pass `sectorAt` from the orbit view.

## Tests (`tests/web/`)

- **Parity with the engines:** for a few thousand pairs of global coordinates, including
  negative ones and both column parities, `hexDistance` equals `getHexDistance` (a test may
  import the engines; the app may not).
- Regina (Spinward Marches 1910) to Feri (Spinward Marches 2005), and two hexes either side
  of a sector edge, by hand-counted values you state in the test.
- A bad key and an unknown sector are null; the same hex is 0.

`npm test`, `npm run check`, `npm run build` green, pasted. Do not touch `orbit/`,
`workspace/`, `views/`, the map's renderer, or `packages/`. Stop and report.
