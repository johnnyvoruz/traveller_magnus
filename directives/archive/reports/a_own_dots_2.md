Found: the dots routes are in the builder contract, and the zoomed-out map still drew only the published overview string.
Finished: the store keeps each sector's cells and stamp, paints a written, removed, or undone hex at once, and the renderer draws that string. The live map does not, until Lane D adds the two calls below.
Backed out: nothing. Lane D's `generateMany` density argument stays.

# Lane A own dots 2 report
Prompt: prompts/a_own_dots_2.md
Status: partial

## Changed files
- apps/web/src/builder/dots.ts: cell index `(col - 1) * 40 + (row - 1)`, a one-character patch, the character a row paints, and pages of 32.
- apps/web/src/builder/store.ts: `noteDots` and `dotOverlay` on the builder. A cold screen is fetched in pages of 32, once. A sector is asked again, one at a time with `If-None-Match`, only after a hex of it was written, generated, removed, restored, or undone, or a job named it in `landed`. A 304 leaves the painted string in place. A 200 that started before a later paint updates the stamp and leaves that paint. Signed out, or no universe, `noteDots` asks for nothing.
- apps/web/src/map/MapRenderer.ts: `setDotOverlay`. `overviewPoints` uses that string, otherwise the chart's. A string equal to the chart's is dropped in the setter. `setChart` is unchanged. Null clears the overlay.
- tests/web/builder_dots.test.js: index and pages; a cold 40-sector view is 2 requests (32, then 8) and a second look is none; a generated hex shows at once, a removed chart dot goes, and Undo puts the chart character back.
- tests/web/renderer.test.js: an equal overlay draws the same rectangles as the chart; an own sector adds its dot; forty sectors plus one own stay within a millisecond.
- findings/map_own_dots.md: the route, the cache, and the two `MapView.vue` calls. It no longer says the route is missing.

Lane D's loan on `apps/web/src/builder/screen.ts` `generateMany` is the spread `...(density ? { density } : {})`, and the test "the screen adapter passes density through on many hexes when named, and omits it when not" asserts `posts[0].density === 'sparse'` and that the next call omits the field. That is what this lane would have written. The four density names are all truthy, so a named value is sent and an omitted argument leaves the field off. Both stayed, and that test passed.

`setChart` still fills a sector from the published overview only. An own sector is not in that overview, so its chart cells are null and the overlay is the whole drawing. The same dot as a charted system: `theme.textMuted`, a `fillRect` of `POINT_PARSEC`.

A cold view of 40 sectors is 2 requests, 32 then 8, and no `If-None-Match`. The store test counts response bytes as `JSON.stringify` of the `{ ok, data }` envelope and requires that total to be more than 40 × 1,280. Wire bytes on a private API were not measured.

Draw time, median of 9 draws, 40 charted sectors plus one own sector, viewport 8000×8000, `ppp` 1. During `npm test`: chart 0.427 ms, the same strings 0.400 ms, the own sector added 0.384 ms. A quieter run of the same test: 0.227 ms, 0.180 ms, 0.203 ms. The own-sector draw was under 1 ms slower than the chart draw in both.

## Gates
npm test: pass. 1474 passed, 0 failed, 19 skipped.
npm run check: pass (`manifesto: clean`)
typecheck: pass (`tsc --noEmit -p apps/api`)
npm run build: pass (`vue-tsc -b && vite build`)
fourth gate: not run. `views/MapView.vue` is Lane D's, and the dots are not on the live map until the two calls below are in. No `ka_dots_*` shots. No private API, no browser pass.

## Contract published
none

## Needs from others
- Lane D: two calls in `views/MapView.vue`, and nothing else in that file.

In `frame()`, after the hex-tier block that calls `bound.load` (the `if (drawn.tier === 'hex' && version)` around line 773):

```js
if (drawn.tier !== 'hex') {
    const builder = bound.builder();
    if (builder) {
        const chartDots = new Map();
        if (overview) for (const sector of overview.sectors) chartDots.set(sector.slug, sector.cells);
        void builder.noteDots(drawn.sectorsOnScreen, chartDots);
    }
}
```

In the watch that already follows `store.tick()` (around line 1643, the one that calls `markDirty()` when the universe map changes), before `markDirty()`:

```js
const builder = bound.builder();
if (renderer) renderer.setDotOverlay(builder ? builder.dotOverlay() : null);
```

`noteDots` on every overview frame makes no request for a sector already held and not dirty. `setDotOverlay(null)` is the signed-out drawing: the builder is null, and the chart is all that draws. These lines are also in `findings/map_own_dots.md`.

- Lane B: none. The dots section of `directives/contracts/b_builder.md` is the route this store calls.

## Questions for Johnny
none
