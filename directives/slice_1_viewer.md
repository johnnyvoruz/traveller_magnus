# Slice 1 — Viewer (recipe)

**Status:** Part A WRITTEN 2026-10-03 (orchestrator). Parts B and C are outlines; each is
written in full when the part before it reports, from what that part actually built.
**Governed by:** `manifesto.md` → `plan.md` §4 slice 1 → `architecture.md` §9, §10 →
`data_model.md` §5 → `design_reference.md` → `feature_inventory.md` sections A, J, L.
**Ships (whole slice):** the charted universe, read-only, for anyone: a map of all 512 sectors
that zooms from the galaxy to one hex, search, a dossier for any world, the orbit view, deep
links for everything.
**Touches no legacy file.** `js/renderer.js`, `js/canvas_input.js`, `js/core.js` and
`style.css` are read for look and behaviour only. No UI code is copied. Hex geometry is
copied from `packages/engines/src/core/hex.js` (it is already ESM and golden-tested).

| Part | What a visitor can do when it lands | Recipe |
|---|---|---|
| **A. Data path and map** | Open traveller.voyage, see the whole chart, drag and zoom smoothly down to one hex, see where every system is and what it is called, share the URL | below, in full |
| **B1. Chart symbols and the omnibox** | Read a hex like a chart (starport, world, bases, zones, gas giants), see routes and capital names, select a world, search from the omnibox | in full, §B1 |
| **B2. Borders and polities** | See who owns what: borders, polity colours, regions (needs truth v3) | outline, §B |
| **B3. The dossier and the shell** | Read a world's dossier in the one panel; rail, toasts, help, legend, design-system page | outline, §B |
| **C. Orbit view** | Enter a system, see it in 2.5D, scrub time, line-up, planet imagery | outline, §C |

---

## 0. Decisions this recipe rests on

| Decision | Source |
|---|---|
| The map renderer is **rebuilt** as a TypeScript class; the legacy renderer is not wrapped | Johnny 2026-10-03; `feature_inventory.md` A1 |
| The map shows **all 512 sectors**, galaxy level down to one hex | Johnny 2026-10-03 |
| Truth is read from `v2` or later: compact JSON, index entries are the chart row once | `data_model.md` §1, §5 |
| The viewer makes **two API calls**, no more: `GET /api/truth/versions` (which version to read) and `GET /api/truth/search`. Everything else is the CDN. `plan.md` said "no API calls"; that sentence was wrong, since nothing else can tell a cold browser which version is current | `findings/agent_m_technical.md` T8 |
| The **canonical layer** (399 sectors flagged `canonical`) is drawn by default. The other 113 sectors share coordinates with canonical ones or sit far away; choosing an alternate layer is part B | `data_model.md` §5 |
| **Phones and tablets are not supported in slice 1** ("maybe later"). Layouts are designed for desktop and laptop widths only. Input is still **Pointer Events** (mouse, touch, pen, pinch): it costs nothing and a touch-screen laptop works | Johnny 2026-10-03 |
| **Anyone can see and use the map without signing in.** Signing in unlocks the campaign tools and anything that alters a map; nothing in the viewer is hidden behind an account. Part B's rail carries the way in to `/account` | Johnny 2026-10-03 |
| World **names when zoomed out: none, except capitals** ("super critical worlds like capital or other empire capital worlds"). Part A draws none. The names come from our own hand-kept list, `universe/far_labels.json`, bundled into the viewer in part B; nothing is derived from chart remarks at run time | Johnny 2026-10-03 |

## 1. Map model (everything the map code agrees on)

**Coordinates.** A sector has integer chart coordinates `(sx, sy)` from `sectors.json`: Core is
`(0, 0)`, Spinward Marches `(-4, -1)`, Trojan Reach `(-4, 0)`, Solomani Rim `(0, 3)`. `sx`
grows to trailing (screen right), `sy` grows to rimward (screen down). A hex is `hhhh` =
column `01`-`32`, row `01`-`40`. The global hex grid is

```
q = sx * 32 + (col - 1)        r = sy * 40 + (row - 1)
```

and both may be negative. World space is in **parsecs**: one column step is 1 unit.

```
worldX(q)    = q
worldY(q, r) = (r + ((q & 1) ? 0.5 : 0)) * (SQRT3 / 1.5)
```

This is `getHexPixel` from `packages/engines/src/core/hex.js` with `baseHexSize = 1 / 1.5`
(so the column step `1.5 * size` is 1). `q & 1` is correct for negative `q` in JavaScript
(`-3 & 1 === 1`). The inverse is `pixelToHex` from the same file with the same size. Flat-top
hexes; odd `q` (even column number) sits half a hex lower.

**Camera.** `{ x, y, ppp }`: the world point at the centre of the canvas and **pixels per
parsec**. `ppp` is clamped to `[0.05, 160]`. At 160 one hex fills a phone; at 0.05 the
whole catalogue (14,336 by 15,057 parsecs) fits a laptop screen.

**The opening view** is the bounding box of the 233 sectors tagged `OTU` (1,056 by 1,709
parsecs, `sx` -21 to 11, `sy` -21 to 15), about `ppp = 0.5` on a laptop. The canonical flag
also covers the 167 sectors tagged `ZCR`, a single column at `sx = -7` running to
`sy = -175`; fitting those would open on a strip 8,822 parsecs tall with the Imperium a
speck at the bottom. They are drawn and reachable by panning, just not fitted. This box is
called the **home view** below.

**Tiers.** One function decides what is drawn. The thresholds are the legacy LOD constants
(`js/renderer.js:163-171`, "about 75 px per parsec at zoom 1") converted to pixels per parsec:

| Tier | `ppp` | Drawn | Data |
|---|---|---|---|
| `galaxy` | below 5.25 | sector rectangles, sector names, one point per system | manifest + overview |
| `sector` | 5.25 to under 22.5 | sector and subsector lines, sector names, one dot per system | manifest + overview |
| `hex` | 22.5 and up | hex grid, a dot per system, hex number; world **name** from 63.75 up | sector indexes of the sectors on screen |

Part B replaces the dot with the chart glyphs and adds routes and borders. Part A proves the
data path and the feel.

**Data per tier, and what is fetched when.**

| File | When | Size (v2, measured or estimated) |
|---|---|---|
| `GET /api/truth/versions` | once at start | under 1 KB |
| `truth/<v>/manifest.json` | once at start | about 100 KB |
| `truth/<v>/overview.json` | once at start | about 750 KB raw; reported by step A0.6 |
| `truth/<v>/sectors/<slug>/index.json` | only at tier `hex`, only for sectors intersecting the view | about 124 KB each (Spinward Marches) |

Indexes are immutable, so the HTTP cache makes a revisit free (manifesto, Graceful). In
memory: at most 32 parsed indexes (least recently drawn is dropped), at most 4 index fetches
in flight.

## 2. Part A0 — the overview file (Track A: `packages/`, `tools/`, `tests/`; then Track B: `apps/api`)

The galaxy and sector tiers need to know where every system is without 512 index fetches.

### A0.1 `packages/shared/src/schemas/truth.ts` (Track A)

Add, strict like the others:

```ts
/** data_model.md §5 overview.json: one entry per sector, one character per hex. */
export const SectorOverview = z.object({
    slug: z.string(), name: z.string(), x: z.number(), y: z.number(),
    tags: z.array(z.string()), canonical: z.boolean(), systems: z.number(),
    cells: z.string().length(1280),
}).strict();
export const TruthOverview = z.object({
    truthVersion: z.string(),
    sectors: z.array(SectorOverview),
}).strict();
```

and add `overviewHash: z.string()` to `TruthManifest`. Export all three from `src/index.ts`.

### A0.2 `packages/generation/src/overview.ts` (Track A, new file)

```ts
export function sectorOverview(index: SectorIndex): SectorOverview
```

`cells` is 1,280 characters, one per hex, position `(col - 1) * 40 + (row - 1)`. A hex with no
entry in `index.hexes` is `.`. A hex with an entry is the **first character of its `uwp`
string as written** (`A`-`E`, `X`, `?` and whatever else the chart holds); a `.` in that
position is written as `?` so it cannot read as empty. The function does not interpret the
character. Re-export from `packages/generation/src/index.ts`.

**Check:** for Spinward Marches, `cells` has exactly 439 characters that are not `.`;
position `(19 - 1) * 40 + (10 - 1) = 729` is `A` (hex 1910, `A788899-C`).

### A0.3 `tools/truth/build.js` (Track A)

After the sectors are built, write `truth-local/<version>/overview.json` =
`stable({ truthVersion, sectors: [...] })` with the sectors in the manifest's order, and put
its hash in the manifest as `overviewHash`.

### A0.4 Tests (Track A)

`tests/generation/overview.test.js`: the two checks in A0.2; `TruthOverview.parse` accepts the
document; a sector with a `?`-prefixed UWP keeps `?`; two runs give the same bytes.
Report: bytes of `overview.json` for the sectors built locally and the bytes per sector.

### A0.5 `apps/api/src/routes/admin.ts`, release (Track B, after A0.1-A0.4)

Before writing the manifest: for each sector in catalogue order, `get`
`truth/<version>/sectors/<slug>/index.json` from `PUBLIC_BUCKET`, `sectorOverview` it, and let
the text go before reading the next (one index in memory at a time). Put
`truth/<version>/overview.json` with the immutable headers, then the manifest with
`overviewHash`. That is 512 `get`s and two `put`s in one invocation, inside the limit of
about 1,000 binding calls (`architecture.md` §5). A missing index is a 409 naming the slug.
Gated test: the released `vtest` overview parses, has one sector, and its `cells` marks the
fixture's hexes.

### A0.6 `data_model.md` §5

Add `truth/v<N>/overview.json` to the key list and the manifest example (the orchestrator
does this when A0 reports, with the measured size).

**Order matters for v2:** v2 is released only after A0.5 is deployed, so its manifest carries
`overviewHash` from the start. The build itself does not depend on any of this.

## 3. Part A1 — the map (Track W: `apps/web` and `tests/web`; Agent A from 2026-10-03)

The implementer has no browser. Everything checkable by `npm test`, `npm run check` and
`npm run build` is theirs; the browser checks in A1.11 and A1.12 are run by the orchestrator
or Johnny after the report, and the implementer lists them as not run.

Rules for every file in this part:

- TypeScript that Node can run by stripping types: no `enum`, no parameter properties, no
  namespaces. The tests import the `.ts` files directly, as `tests/golden` already does.
- No `window.`, no `document.getElementById`, no hex colour, no `ms` literal. `npm run check`
  enforces it. Browser globals are reached through **one** file, A1.1.
- Nothing in `apps/web/src/map/` imports Vue. The map is plain classes; Vue mounts it.
- `import type` only from `@voyage/shared`. No zod and no engine code in the viewer bundle.

### A1.1 `apps/web/src/platform/browser.ts`

The only file allowed to touch browser globals. Exports `devicePixelRatio(): number`,
`onDevicePixelRatioChange(fn)`, `prefersReducedMotion(): boolean`, `nextFrame(fn): number`,
`cancelFrame(id)`, `now(): number`. Add its entries to `scripts/check_allowlist.json` with the
reason "single browser-globals adapter (slice 1 A1.1)". No other file is added to the
allowlist; if another file seems to need a global, stop and report.

### A1.2 `apps/web/src/map/geometry.ts`

Constants `SECTOR_COLS = 32`, `SECTOR_ROWS = 40`, `SQRT3`, `ROW_STEP = SQRT3 / 1.5`,
`HEX_SIZE = 1 / 1.5`. Pure functions:

```ts
export function parseHex(hhhh: string): { col: number; row: number } | null
export function formatHex(col: number, row: number): string
export function toGlobal(sx: number, sy: number, col: number, row: number): { q: number; r: number }
export function fromGlobal(q: number, r: number): { sx: number; sy: number; col: number; row: number }
export function hexCentre(q: number, r: number): { x: number; y: number }
export function hexAt(x: number, y: number): { q: number; r: number }
export function sectorRect(sx: number, sy: number): { x0: number; y0: number; x1: number; y1: number }
export function hexCorners(x: number, y: number): number[]   // 12 numbers, flat-top
```

`fromGlobal` uses floor division so negative `q` and `r` land in the right sector
(`sx = Math.floor(q / 32)`, `col = q - sx * 32 + 1`). `hexAt` is `pixelToHex` from
`packages/engines/src/core/hex.js` with `size = HEX_SIZE`, copied, not imported.

**Check (`tests/web/geometry.test.js`):** `hexAt(hexCentre(q, r))` returns `(q, r)` for every
hex of sectors `(-4, -1)`, `(0, 0)` and `(-200, 77)`; `fromGlobal(toGlobal(...))` round-trips
for the four corners of those sectors; Regina (`Spinward_Marches/1910`) is at
`q = -110, r = -31`.

### A1.3 `apps/web/src/map/tiers.ts`

```ts
export const PPP_MIN = 0.05, PPP_MAX = 160;
export const PPP_DOTS = 5.25, PPP_GRID = 22.5, PPP_NAMES = 63.75;   // js/renderer.js:163-171 times 75
export type Tier = 'galaxy' | 'sector' | 'hex';
export function tierFor(ppp: number): Tier
```

These five numbers are the tuning knobs of the slice. Nothing else compares against `ppp`.

### A1.4 `apps/web/src/map/camera.ts`

```ts
export type Camera = { x: number; y: number; ppp: number };
export type Viewport = { width: number; height: number };            // CSS pixels
export function toScreen(cam: Camera, vp: Viewport, x: number, y: number): { sx: number; sy: number }
export function toWorld(cam: Camera, vp: Viewport, sx: number, sy: number): { x: number; y: number }
export function visibleRect(cam: Camera, vp: Viewport): { x0: number; y0: number; x1: number; y1: number }
export function zoomAt(cam: Camera, vp: Viewport, sx: number, sy: number, factor: number): Camera
export function panBy(cam: Camera, dxPx: number, dyPx: number): Camera
export function fit(rect: { x0: number; y0: number; x1: number; y1: number }, vp: Viewport, marginPx: number): Camera
export function flight(from: Camera, to: Camera, t: number): Camera   // t in [0, 1]
```

All pure; every result clamps `ppp`. `zoomAt` keeps the world point under `(sx, sy)` fixed.
`flight` follows `design_reference.md` §4: when the two centres are within 12 parsecs it eases
position and `ppp` together; otherwise it zooms out to the `ppp` that shows both points, pans,
and zooms in. Durations come from the tokens (`--t-slow`, `--t-long`) and are read by the
caller, not hard-coded here.

**Check (`tests/web/camera.test.js`):** `toWorld(toScreen(p)) = p`; after `zoomAt` the world
point under the cursor is unchanged to 1e-9; `ppp` never leaves `[PPP_MIN, PPP_MAX]`;
`flight(a, b, 0) = a` and `flight(a, b, 1) = b`.

### A1.5 `apps/web/src/map/truth_client.ts`

```ts
export class TruthClient {
    constructor(opts: { cdnBase: string; apiBase: string; fetch: typeof fetch; maxIndexes?: number; maxInFlight?: number })
    currentVersion(): Promise<string>                         // GET {apiBase}/api/truth/versions, newest released
    manifest(version: string): Promise<TruthManifest>
    overview(version: string): Promise<TruthOverview>
    index(version: string, slug: string): SectorIndex | null   // synchronous: the parsed index or null
    want(version: string, slugs: string[]): void                // start fetching what is missing, most central first
    onArrive(fn: (slug: string) => void): () => void            // called when an index lands; returns unsubscribe
}
```

`fetch` is injected so the tests can stub it. One fetch per URL however many callers ask.
Defaults: 32 parsed indexes, 4 in flight. A failed fetch is retried on the next `want`, never
in a loop. `cdnBase` comes from `import.meta.env.VITE_CDN_BASE`, default
`https://cdn.traveller.voyage`; `apiBase` is the page origin.

**Check (`tests/web/truth_client.test.js`):** with a stub, two concurrent `manifest` calls
make one request; `want` with 10 slugs never has more than 4 in flight; loading a 33rd index
drops the least recently read one; a 404 does not poison later calls.

### A1.6 `apps/web/src/map/theme.ts`

`readTheme(el: HTMLElement): MapTheme` reads the tokens once with `getComputedStyle(el)` and
returns the colours and fonts the canvas needs (`--bg-0`, `--line-1`, `--line-2`,
`--signal`, `--signal-dim`, `--text-1`, `--text-muted`, `--font-display`, `--font-data`,
`--font-text`). The renderer takes a `MapTheme`; no colour is written in a `.ts` file.

### A1.7 `apps/web/src/map/MapRenderer.ts`

```ts
export class MapRenderer {
    constructor(canvas: HTMLCanvasElement, theme: MapTheme)
    setChart(manifest: TruthManifest, overview: TruthOverview, layer: 'canonical' | 'all'): void
    setIndexSource(get: (slug: string) => SectorIndex | null): void
    resize(width: number, height: number, dpr: number): void
    draw(cam: Camera): { tier: Tier; sectorsOnScreen: string[]; ms: number }
}
```

`draw` paints back to front, each layer one batched path per style:

1. Backdrop: `--bg-0`.
2. Sector rectangles for sectors intersecting the view: outline `--line-1`.
3. Systems. Tiers `galaxy` and `sector`: one square point per non-`.` cell of every sector
   on screen, from `overview.cells`, all in one `fillRect` batch in `--text-muted`; point
   size `max(1, ppp * 0.35)` device pixels. Tier `hex`: for sectors whose index has arrived,
   a filled circle of radius `0.18` parsec at each hex centre in `--text-1`; for sectors
   still loading, the overview points, so nothing blinks out.
4. Tier `sector` and up: subsector lines (every 8 columns and 10 rows) in `--line-1`,
   sector outline in `--line-2`.
5. Tier `hex`: hex outlines for visible hexes in `--line-1`, one path. Skip when more than
   12,000 hexes are visible (the legacy cap, `js/renderer.js:912`).
6. Tier `hex`: hex number in `--font-data`, top of the hex, `--text-muted`. From `PPP_NAMES`
   up: the world `name` under the dot in `--font-text`, `--text-1`, exactly as the index
   holds it.
7. Sector names: `--font-display`, centred in the rectangle, `--text-muted`; hidden when the
   rectangle is under 60 px wide or over 2,400 px wide. (At the home view sectors are about
   16 px wide, so no names show until the visitor zooms in; a galaxy-level label layer is
   Halt & Challenge item 1.)

It returns what it drew so the view can ask the client for the indexes of
`sectorsOnScreen` when the tier is `hex`. It holds no camera and starts no timers.

Read `js/renderer.js:216-440` (pan cache) and `683-830` (path batching) for the two ideas
that make the legacy map fast, then write them fresh. The pan cache is **step A1.11**, after
the plain version is measured.

**Check:** `tests/web/renderer.test.js` drives `draw` with a recording stub context (an
object whose methods append to an array) and asserts: tier `galaxy` issues no `arc` and no
`fillText` for hex numbers; tier `hex` with one loaded index issues exactly `systems` circles
for that sector; a sector off screen contributes no call.

### A1.8 `apps/web/src/map/input.ts`

```ts
export function attachInput(el: HTMLElement, api: {
    getCamera(): Camera; getViewport(): Viewport;
    setCamera(cam: Camera, why: 'drag' | 'wheel' | 'pinch' | 'key' | 'inertia'): void;
    click(sx: number, sy: number): void;
}): () => void     // returns detach
```

Pointer Events with `setPointerCapture`. One pointer drags; two pinch (zoom about the
midpoint and pan with it). Wheel zooms about the cursor and handles `deltaMode` 0, 1 and 2;
`ctrlKey` wheel (trackpad pinch) zooms too. Releasing a drag with speed gives inertia that
decays over `--t-long`; any new input cancels it. Keyboard when the map has focus: arrows
pan by 15% of the viewport, `+`/`-` zoom by 1.5 about the centre, `Home` flies to the home
view. A press and release within 4 px and within `--t-base` is a `click` (read the token
through `theme.ts`; do not write the number). `prefersReducedMotion()` turns inertia off.
`touch-action: none` on the element so the browser does not scroll the page.

Read `js/canvas_input.js` for the behaviours a referee expects; copy none of it.

### A1.9 `apps/web/src/views/MapView.vue`

A full-bleed `<canvas tabindex="0">` plus a small status line (`aria-live="polite"`) that
says what is loading. Owns one `TruthClient`, one `MapRenderer`, one camera held in a plain
variable (not `ref`). A single `requestAnimationFrame` loop runs **only while dirty**: input,
a flight, an index arriving or a resize marks it dirty; a clean frame schedules nothing.
`ResizeObserver` drives `resize`. On mount: `currentVersion` → `manifest` and `overview` in
parallel → `setChart` → the home view, or fly to the route's target. No loading
spinner: the backdrop and sector rectangles appear as soon as the manifest lands.

### A1.10 Routes, deep links and the page that exists today

`apps/web/src/router.ts` with `vue-router`:

| Route | Shows |
|---|---|
| `/` | the map at the home view |
| `/s/:sector` | the map, that sector fitted |
| `/s/:sector/:hex` | the map, flown to that hex at `ppp = 80` |
| `/account` | **today's holding page, moved unchanged** to `views/Account.vue` (X sign-in and the version line). Johnny needs it to stay signed in as admin |
| `/design` | placeholder for the design-system page (part B); dev and preview only |

The camera is mirrored into the query string (`?x=&y=&z=`, three decimals) with
`router.replace`, debounced by `--t-base`, so a reload or a shared link returns to the same
view and the back button is not flooded. An unknown sector or hex falls back to `/` with a
toast-less status line message (the toast component is part B).

`apps/web/src/App.vue` becomes `<RouterView />` and nothing else.

**Check (`tests/web/routes.test.js`):** the pure function that turns a route into a target
camera (`targetFor(route, manifest)`), for all five rows plus an unknown sector.

### A1.10a Running the dev server against production data

`apps/web/vite.config.ts`: the `/api` proxy target becomes
`process.env.VOYAGE_API ?? 'http://127.0.0.1:8787'` with `changeOrigin: true`. Then
`VOYAGE_API=https://traveller.voyage npm run dev:web` serves the local viewer against the
released truth: the two API calls go through the proxy (no CORS involved) and the CDN allows
any origin. Nothing else in the config changes.

### A1.11 Pan cache, after measuring

With A1.7 working, measure a drag at tier `sector` over the Spinward Marches and at tier
`hex` with about 10,000 hexes visible (Chrome performance panel; report median and worst
frame). The budget is 16 ms (`architecture.md` §10). If either is over, add the pan cache
inside `MapRenderer`: draw to an offscreen canvas larger than the viewport by a margin, blit
it while the camera only translates, redraw when the margin is used up or `ppp` changes.
If both are under, do not add it; say so in the report.

### A1.11a Amendments accepted from the A1 report (2026-10-03)

The implementer met three gaps in this recipe and reported each; all three are accepted and
are now the spec:

- `attachInput`'s api also has `home(): Camera`, so the `Home` key has a target.
- `flight` has no viewport, so a far flight zooms out to
  `clamp(min(from.ppp, to.ppp) * 12 / distance)`: the two centres end up 12 parsecs apart
  on screen in units of the closer zoom. Tune by feel in the browser check.
- Wheel gain is the legacy notch: 1.1 per 100 CSS pixels; `deltaMode` 1 counts a line as
  16 px and `deltaMode` 2 a page as the viewport height. A drag coasts only if the last move
  was within 100 ms of release.
- `platform/browser.ts` also exports `pageOrigin()` and `scrollToTop()`.
- Canvas type sizes follow `design_reference.md` §5: 13 px hex numbers, 14 px world names,
  18 px sector names.

### A1.11b Sector names must fit their sector (from the first browser look, 2026-10-03)

At the home view a sector is about 110 px wide and an 18 px name is often wider, so names ran
into each other. Rule, replacing layer 7 of A1.7: measure the name at 18 px. If it is wider
than 84% of the sector rectangle, scale the font down so it fits that width exactly; if
that would go below 9 px, do not draw the name. Never draw a name wider than its rectangle.
Above 2,400 px of rectangle width the name is still hidden. The measured widths are cached
per name, so `measureText` runs once per sector, not once per frame.

**Check (`tests/web/renderer.test.js`):** with a stub `measureText` that returns 12 px per
character at 18 px (and scales in proportion to the font size): an **8-character** name
(96 px at 18 px) in a 110 px rectangle is drawn once, with a font size of 18 × 92.4 / 96 =
17.325 px and a measured width of at most 92.4 px; the same name in a 40 px rectangle is not
drawn (it would need 6.3 px); a 20-character name (240 px) in a 110 px rectangle is not
drawn (it would need 6.93 px); a 5-character name (60 px) in a 110 px rectangle is drawn at
18 px unchanged.

(The first version of this check used the 20-character name as the drawn example, which
contradicts the 9 px floor. The implementer caught it and stopped; the rule stands and the
example was wrong.)

### A1.12 Verification for part A

- [ ] `npm test` green, including `tests/web/*.test.js` and `tests/generation/overview.test.js`
- [ ] `npm run check` clean; the allowlist gained exactly one file (A1.1)
- [ ] `npm run typecheck` clean; `npm run build` writes `apps/web/dist`
- [ ] `npm run dev:web` against the production CDN: `/` opens on the home view; wheel,
      drag, pinch (touch emulation) and keyboard all move it; `/s/Spinward_Marches/1910`
      lands on Regina with its name drawn
- [ ] Cold load, cache disabled, broadband: sector rectangles within 1 s; report the
      transfer sizes of the four start-up requests
- [ ] The two frame measurements of A1.11
- [ ] `/account` still signs in
- [ ] Report: every place the recipe could not be followed as written, and every question
      for Johnny

## B1. Chart symbols, routes, capital names, selection and the omnibox (Track W, with one Track B step)

**Status:** WRITTEN 2026-10-03. Runs on truth v2 as released; no new truth version.
**Evidence for every legacy rule below:** `legacy_map_inventory.md`. Re-read the cited legacy
lines before implementing a step; if the code says something different from this recipe,
stop and report.
**Acceptance, on top of the tests:** the map stays as smooth as part A (Johnny, 2026-10-03).
Steps B1.4, B1.5 and B1.6 each end with a frame-time note for the browser check.

Legacy sizes are in legacy world units (hex size 50, one parsec = 75 units). Everything in
this part is expressed in **parsecs**: a legacy world-unit number divided by 75. A size that
the legacy code writes as `x / zoom` is a constant `x` screen pixels.

### B1.1 Chart colours as tokens — `apps/web/src/design/tokens.css`, `apps/web/src/map/theme.ts`

Add a `/* chart */` block to `:root`. The values are the legacy literals; the renderer still
contains no colour.

```css
  --chart-world: #ffffff;        /* default world disc and chart text (renderer.js:1438, 1468) */
  --chart-water: #46b4e8;        /* default wet-world rule (filter_engine.js:58) */
  --chart-zone-amber: #FFBF00;   /* renderer.js:1415 */
  --chart-zone-red: #FF0000;
  --chart-grid: #1f2833;         /* renderer.js:1047 */
  --chart-selected: #66fcf1;     /* inspected hex outline (renderer.js:2030) */
  --chart-route-xboat: #016a01;  /* a route with no allegiance (core.js:137-150) */
  --chart-route-other: #9faeb8;  /* an allegiance with no colour until truth v3 resolves stylesheets */
```

Then one token per entry of `OTU_DEFAULT_ROUTE_COLORS` (`js/otu_metadata_parser.js:33-56`),
named `--chart-route-<code>` with the code lower-cased and spaces as hyphens
(`--chart-route-im`, `--chart-route-core-route`), values copied exactly, named colours
included. `readTheme` returns them as `chart` (the eight above) and
`routeColours: Record<string, string>` keyed by the **original** code.

**Check (`tests/web/theme.test.js`):** a stub style object with those properties produces a
`routeColours` with 22 keys including `Im`, `ZhCo` and `Core Route`.

### B1.2 Reading a UWP for display — `apps/web/src/map/uwp.ts` (new, pure)

```ts
export function worldIsBelt(uwp: string): boolean
export function worldHasWater(uwp: string): boolean
export function starport(uwp: string): string          // uwp[0] as written, '' if absent
export function hasGasGiant(pbg: string): boolean       // third character is 1-9 or a letter
export function baseMarks(bases: string): { naval: boolean; scout: boolean; text: string }
```

The first two are the legacy app's two default display rules and nothing more
(`js/filter_engine.js:44-62`):
- `worldIsBelt`: the size character (`uwp[1]`) is `0`. It decides the **shape**.
- `worldHasWater`: the atmosphere character (`uwp[2]`) is one of `2 3 4 5 6 7 8 9 D E`
  **and** the hydrographics character (`uwp[3]`) is one of `1 2 3 4 5 6 7 8 9 A`. It
  decides the **colour**.
- Any `?` in the character a rule reads makes that rule false.

These are display rules copied from the legacy app, not Traveller rules. Do not add a case
that is not in `filter_engine.js:44-62`.

`baseMarks`: `naval` when the string contains `N`, `scout` when it contains `S`, `text` is
the **whole** string when it contains any character other than `N` or `S`, else `''`
(`js/renderer.js:1788-1815`).

**Check (`tests/web/uwp.test.js`):** `A788899-C` → not a belt, water, starport `A`;
`X000000-0` → belt, no water; `C8858??-4` → not a belt, water; `???????-?` → neither,
starport `?`; `pbg` `703` → gas giant, `700` → none; bases `NS` → both, text `''`; `NW` →
naval, text `NW`; `''` → nothing.

### B1.3 Where each mark sits — `apps/web/src/map/glyphs.ts` (new, constants only)

Offsets from the hex centre in parsecs, y down. Font sizes are in parsecs too: the drawn
size in pixels is the constant times `ppp`, exactly as the legacy map's world-space fonts
scale.

| Constant | Value (legacy units / 75) | Legacy source |
|---|---|---|
| `NUMBER_Y` | -37.5 / 75, anchored centre / top | 1450 |
| `PORT_Y` | -12 / 75, centre / bottom | 1459 |
| `DISC_R` | 10 / 75 | 1409 |
| `HALO_R` | 15 / 75, stroke 2.5 px, fill at 20% | 1419-1431 |
| `UWP_Y` | +13 / 75, centre / top | 1707 |
| `NAME_Y` | +37.5 / 75, centre / bottom | 1729 |
| `GAS_X`, `GAS_Y`, `GAS_R` | +26 / 75, -9 / 75, 3.5 / 75 | `constants.js:229-238` |
| ring: scale x, scale y, radius, stroke | 1.26, 0.385, 5.5 / 75, 2.5 px | same |
| `NAVAL_X`, `NAVAL_Y`, outer, inner | -22 / 75, -9.9 / 75, 4.9 / 75, 2.205 / 75 | 1815; `constants.js:239-247` |
| `SCOUT_X`, `SCOUT_Y`, `SCOUT_R` | -22 / 75, +6.3 / 75, 4.9 / 75 | 1788 |
| `BASE_TEXT_X`, `BASE_TEXT_Y` | -20 / 75, 0, right / middle | 1804 |
| `BELT_DOTS` | five circles of radius 2.5 / 75 at (-8,-2) (0,-5) (8,-2) (-5,5) (5,4), each / 75 | 1480-1483 |
| `FONT_SMALL`, `FONT_NAME`, `FONT_PORT` | 10 / 75, 12 / 75, 18 / 75 | 1439-1441 |

Naval star: six points, first point up. Scout triangle: apex at `(x, y - r)`, base corners
at `(x ± r, y + 0.6 r)`.

The hex number sits just inside the top edge of its own hex and the name just inside the
bottom edge, with the hex outline between a name and the number of the hex below it. That
fixes the "Hefry reads as 1910" confusion seen in part A.

### B1.4 The chart layer — `apps/web/src/map/MapRenderer.ts`

Replace part A's layers 3 and 6 at tier `hex`:

- **`PPP_GRID` ≤ ppp < `PPP_NAMES`** (22.5 to 63.75): one filled disc of radius `DISC_R` per
  world, `--chart-water` when `worldHasWater`, else `--chart-world`. Nothing else per hex.
  (Legacy: `renderer.js:1308-1352`.)
- **ppp ≥ `PPP_NAMES`**: every mark of B1.3, for every world of every loaded index in view.
  Paint in passes, each pass one font and one fill style for the whole frame, never per
  world: (1) zone halos, amber then red; (2) white discs; (3) blue discs; (4) belt dots,
  white then blue; (5) gas giants and rings; (6) naval stars and scout triangles;
  (7) hex numbers; (8) starport letters; (9) UWP lines; (10) base text; (11) names.
  Hex numbers and UWP lines use `--font-data`; names and starport letters use `--font-text`
  (starport bold). All chart text and marks are `--chart-world`.
- The hex number is the four-digit `hhhh`. A world with an empty name still gets its gas
  giant and base marks (the legacy nesting that hides them is an accident; inventory
  finding 2).
- The hex grid colour becomes `--chart-grid`; sector and subsector lines keep part A's
  tokens.
- A world whose index has not arrived keeps the overview point, as in part A.

**Check (`tests/web/renderer.test.js`), with the recording context:** at ppp 80, a
one-world index for `A788899-C`, bases `NS`, zone `A`, pbg `703`, trade codes `['Sa']`
produces exactly one of each: amber halo, blue disc, gas giant with a ring, star, triangle,
hex number text `1910`, starport text `A`, UWP text, name text; and no base text. The same
world with name `''` still produces the gas giant, star and triangle. At ppp 40 it produces
one disc and no text. `fillStyle` and `font` are each assigned at most once per pass.
**Frame-time note for the browser check:** tier `hex` at ppp 80 over the Spinward Marches,
dragging.

### B1.5 Routes — `apps/web/src/map/route_lines.ts` (new, pure) and a renderer pass

```ts
export type RouteSegment = { x0: number; y0: number; x1: number; y1: number; colourKey: string; dash: 'solid' | 'dashed' | 'dotted' };
export function routeSegments(index: SectorIndex): RouteSegment[]
```

For each record of `index.metadata.routes` (attributes exactly as the XML wrote them):
- Ends: `Start` and `End` are `hhhh` in sector `(index.x + StartOffsetX, index.y +
  StartOffsetY)` and `(index.x + EndOffsetX, index.y + EndOffsetY)`; a missing offset is 0.
  The neighbouring sector's index is not needed, only its coordinates.
- The line runs between the two hex centres and stops `20 / 75` parsec short of each; a
  route whose centres are `40 / 75` parsec apart or less is dropped (`renderer.js:1143,
  1168`).
- `colourKey`: the record's own `Color` if it has one (prefixed `own:`), else its
  `Allegiance` code, else `xboat`. `dash` from `Style`: `dashed`, `dotted`, anything else
  solid (`renderer.js:745-750`). The XML `Type` is ignored, as in the legacy app.
- Side-by-side spread: routes of one sector that share both ends are offset perpendicular
  by `(i - (n - 1) / 2) * 5 / 75` parsec (`renderer.js:1163`). The legacy direction-bucket
  spread for routes that share only one end is **not** carried into B1; say so in a comment.

The renderer caches `routeSegments` per index (a `WeakMap` keyed by the index object) and,
at **ppp ≥ `PPP_GRID`**, strokes them under the worlds: one path per colour and dash, width
2 px, dashes `[8 / 75, 5 / 75]` and `[1.5 / 75, 3 / 75]` parsec. Colour: `own:` values as
given; an allegiance found in `routeColours`; `xboat` → `--chart-route-xboat`; any other
allegiance → `--chart-route-other`. Routes are not drawn below `PPP_GRID` in B1, because
indexes are not loaded there; zoomed-out routes arrive with truth v3.

**Check (`tests/web/route_lines.test.js`):** a route `Start 1910 End 2010` gives one segment
whose ends are each `20 / 75` from a hex centre; `EndOffsetX: "1"` moves the far end 32
columns; two routes with the same ends come out `5 / 75` apart; `Style="dashed"` → dashed;
a route with `Allegiance="Im"` and no `Color` has `colourKey` `Im`.
**Frame-time note:** the same drag as B1.4 with routes on.

### B1.6 Capital names when zoomed out — `universe/far_labels.json`

Import the JSON into the bundle (`resolveJsonModule`; add `server.fs.allow` for the repo
root in `apps/web/vite.config.ts` so the dev server can read it). At tiers `galaxy` and
`sector`, for each label whose sector is in the drawn layer and on screen: a 3 px dot in
`--signal` at the hex centre and the `name` to its right in `--font-text`, 12 px,
`--text-1`. Labels are tried in file order; a label whose text box overlaps one already
placed this frame is skipped. Below ppp 1.2 draw none (a sector is under 40 px wide and
nothing fits). The `code` and `canonical` fields in the file are ignored by the app.

**Check (`tests/web/renderer.test.js`):** two labels in the same hex → one text drawn; a
label in a sector outside the layer → none; ppp 1.0 → none.
**Frame-time note:** the home view zoomed to ppp 3, dragging.

### B1.7 Selecting a world — `MapView.vue`, `map/routes.ts` (targets), `MapRenderer`

A click on a hex that holds a world (from the loaded index at tier `hex`, from the overview
cell otherwise) selects it: `router.push('/s/<sector>/<hhhh>')` without moving the camera,
and the renderer strokes that hex's outline in `--chart-selected`, 2.5 px
(`renderer.js:2030-2032`). A click on an empty hex clears the selection (back to `/`,
keeping the camera query). Opening `/s/<sector>/<hhhh>` cold selects and flies, as part A
already does. The status line shows `Name · Sector hhhh · UWP` for the selection once its
index has arrived. There is no panel yet; the dossier is part B3.

### B1.8 Search ranking on the server — `apps/api/src/routes/truth.ts` (Track B)

The legacy omnibox ranks an exact name first, then names that start with the query, then
everything else, alphabetically within each (`js/input_init.js:497-524`). Make the API do
the same so the top 50 are the right 50: `ORDER BY` a three-way `CASE` on `lower(ts.name)`
against the lower-cased query (equal; then `LIKE query || '%'` with `%`, `_` and the escape
character escaped), then `ts.name`. The `MATCH` clause and the released-only join stay.
Gated test: with rows `Regina`, `Regis`, `Reginante` and `New Regina`, the query `regina`
returns `Regina` first, and `reg` returns the three prefix names in alphabetical order
before `New Regina`.

### B1.9 The omnibox — `apps/web/src/search/omni.ts` (pure), `components/OmniBox.vue`

Johnny, 2026-10-03: "the omnibox we had in the previous app was very important". It is a
**field that is always visible** at the top centre of the map, as in the legacy app
(`hex_map.html:1011-1024`, `js/input_init.js:417-570`), not a palette that has to be
summoned. `design_reference.md` §3's "command palette" row is this component.

`omni.ts`:

```ts
export type OmniResult =
    | { kind: 'system'; name: string; detail: string; sector: string; hex: string }
    | { kind: 'sector'; name: string; detail: string; sector: string }
    | { kind: 'command'; name: string; detail: string; id: string };
export function rankResults(query: string, results: OmniResult[]): OmniResult[]   // legacy order, at most 40
export function sectorMatches(query: string, manifest: TruthManifest, layer: 'canonical' | 'all'): OmniResult[]
export function systemResults(items: SearchItem[], manifest: TruthManifest): OmniResult[]
```

- Matching and ranking are the legacy ones: the query is trimmed, lower-cased and stripped
  of accents; it is split on spaces and **every** word must appear; rank 0 exact name, 1
  name starts with the query, 2 otherwise; then by name; cut at 40
  (`input_init.js:490-526`).
- Sources: **systems** from `GET /api/truth/search?q=&version=` (detail
  `Sector Name hhhh · UWP`, in `--font-data`); **sectors** from the manifest, matched in the
  browser (detail `Sector`); **commands** from the registry (B1.10), which today holds
  "Home view" and "Account".
- Requests: debounced by 100 ms (`input_init.js:540`), the previous request aborted with
  `AbortController`, the last 20 queries cached in memory. An empty query shows commands
  only. A failed request shows "Search is unavailable." in the popup's status line and keeps
  the sector and command results.

`OmniBox.vue`: a combobox with a listbox popup, the legacy ARIA shape (`role="combobox"`,
`aria-expanded`, `aria-controls`, `aria-activedescendant`; rows `role="option"`). Arrow keys
move, `Enter` opens the active row or the first, `Escape` closes the popup and a second
`Escape` blurs. `/` and `Ctrl+K` focus it from anywhere on the map. Opening a system flies
to it and selects it (B1.7); a sector fits it; a command runs. Rows: a kind badge, the name,
the detail. Styling from tokens only: `--bg-1` field with a `--line-2` border and a
`--signal` focus ring, popup rows hover `--surface-2`.

The legacy omnibox also held the world filter pane. Filters are slice 2
(`feature_inventory.md` K1); leave room on the right of the field and build nothing for it.

**Check (`tests/web/omni.test.js`):** ranking of `Regina`, `Regis`, `New Regina` for
`regina` and for `reg`; two words must both match; accents are ignored; the cut at 40;
`sectorMatches('spin')` finds Spinward Marches and, on the canonical layer, no
non-canonical sector.

### B1.10 Shortcut and command registry — `apps/web/src/shell/registry.ts`

```ts
export function registerCommand(c: { id: string; name: string; keys?: string[]; run: () => void }): () => void
export function commands(): readonly { id: string; name: string; keys?: string[]; run: () => void }[]
export function handleKey(e: KeyboardEvent): boolean
```

One registry (manifesto, Simplicity). `MapView` registers "Home view" (`Home`) and
"Account" (no key); `OmniBox` registers "Search" (`/`, `Ctrl+K`). `handleKey` ignores a key
typed into an input unless that key is `Escape` or carries `Ctrl`. The generated help screen
is part B3.

### B1.11 Verification for B1

- [ ] `npm test`, `npm run check`, `npm run typecheck`, `npm run build` green
- [ ] Browser, against production: at Regina every mark of B1.3 is where the table says and
      the name reads as belonging to its own hex; routes draw in the Spinward Marches; the
      capital names show from the home view inward; clicking a world selects it and the URL
      follows; the omnibox finds `Regina`, `reg`, `Spinward` and `Regina 191`
- [ ] The three frame-time notes: no visible stutter, and the worst frame reported
- [ ] Report: anything the legacy lines said that this recipe did not, and every question
      for Johnny

## B. What is left of part B after B1 (outline)

- **Smoothness is an acceptance criterion** (Johnny, 2026-10-03: "it's so smooth, we want
  to keep that smoothness"). Part A at hex tier felt smooth on his machine with no pan cache.
  Every layer part B adds is measured before and after (frame time while dragging at tier
  `sector` and at tier `hex`); a layer that pushes a frame over 16 ms is reworked or cached
  before the next one is added.
- **Hex label layout.** In part A the world name sits at the bottom of its hex, directly
  above the next hex's number, so "Hefry" (1909) reads as if it belonged to "1910" and
  Regina (1910) to "1911". The data is right; the spacing misleads. Part B places the number
  tight under the hex's top edge and the name tight under its own world symbol, following
  the legacy layout.

- **The legacy rules are written down**: `legacy_map_inventory.md` (2026-10-03). What it
  settles:
  - **B1, on truth v2 as released, no new version:** every per-world symbol. Hex number
    (four digits, not the legacy slot id), starport letter, world disc (water, asteroid
    belt, plain), travel-zone halo, UWP line, name, gas giant with the ringed variant, naval
    star, scout triangle, other base codes as text. All of them need only `uwp`, `zone`,
    `bases`, `tradeCodes`, `pbg` and `name`, which v2 has. Also on v2: sector and
    subsector lines, subsector title pills, the far-zoom names from `universe/far_labels.json`,
    and **routes** (straight segments with the legacy end gap and side-by-side spread;
    colour from the route's own `Color`, else a built-in table by allegiance, else the
    X-boat green).
  - **B2, needs truth v3:** borders, polity fills, regions and their names. The legacy app
    turns each border path into a set of hexes with a flood fill at import
    (`js/borders.js:755-1132`); the viewer must not do that in the browser. It becomes a pure
    function in `packages/`, proven against the legacy oracle like the engines, run by the
    truth build, and the index gains the result (per border: name, colour, hex set or
    outline loops) plus the three things v2 drops: stylesheet colours (resolved at build
    time, 62 sectors have a stylesheet), the allegiance name table, and regions (206).
    Trees do not change, so v3 reuses every object; only indexes, overview, manifest and
    search rows are new.
  - **Not copied from legacy:** the name-must-be-non-empty accident that hides gas giants
    and bases; the procedural starfield; an unknown size digit (`?`) drawing as an asteroid
    belt (it draws as the plain disc).
  - **Things people expect on a Traveller chart that the legacy map never drew:** allegiance
    per world, star symbols, capital or high-population name styling. None is in part B
    unless Johnny asks; capitals are covered by the far-labels file.
- **Colours.** The legacy symbols use literal colours (water `#46b4e8`, amber `#FFBF00`,
  red `#FF0000`, X-boat green `#016a01`, grid `#1f2833`). Each becomes a named token in
  `tokens.css` (`--chart-water`, `--chart-zone-amber`, ...) in the first B1 step; the
  renderer still holds no literal colour.
- **Selection, locator line, hover.** Click a hex → select → URL.
- **Search** as the command palette over `GET /api/truth/search` (type-ahead exists).
- **The one panel at three widths**, the dossier (mainworld, stellar, system tree, world map
  lead) fed by `objects/<hash>`, the rail, toast, progress, the shortcut registry and its
  generated help, the legend, view settings (A6), the alternate-sector layer chooser, the
  design-system page at `/design`.
- **Tests with a DOM** (component and cold-route tests) need a test DOM dependency; Agent B
  installs it when part B starts.

## C. Orbit view (outline; recipe written when part B reports)

`architecture.md` §9 and `design_reference.md` §7: the orrery model as a pure TS module
copied from `js/system_viewer.js:237-400` with golden tests, the 2.5D WebGL renderer with the
2D fallback, time controls, line-up (`system_viewer.js:1225-1551`), planet profile, bakes and
projections (`planet_profile.js`, `planet_gl.js`, `planet_renderer.js`), body deep links.

---

## Tuning knobs

- The five `ppp` constants in `tiers.ts`
- Index cache size (32) and fetches in flight (4)
- The 12,000-hex cap for hex outlines; the 60 px and 2,400 px limits for sector names
- The dot radius (0.18 parsec) and the overview point size

## Halt & Challenge items this recipe already raises

1. (closed 2026-10-03) **Which worlds are named when zoomed out** is not derived from the
   chart at all: it is **our own list**, `universe/far_labels.json`, which Johnny owns and edits
   by hand ("make our own table or file that calls out the names after the fact"). It was
   seeded from the chart remarks `Cx` and `Cs` as a starting point; no code depends on what
   those remarks mean. Part B bundles the file into the viewer and draws those names from
   tier `sector` down to the galaxy view. It is not part of the truth, so it needs no new
   truth version and can change with any deploy.
2. **Alternate sectors that share coordinates with canonical ones** (the Judges Guild
   sectors and others): shown how? Part A draws the canonical layer only.
3. Any chart symbol whose legacy rule cannot be found in `js/renderer.js` (part B).

## Needed from Johnny

- Prune or extend `universe/far_labels.json` to taste before part B.
- Icons: `design_reference.md` §6 says Font Awesome Free through one `<Icon>` component;
  the reviewers suggest dropping the 9 MB Pro kit. Part A draws no icons, so this waits for
  part B.
