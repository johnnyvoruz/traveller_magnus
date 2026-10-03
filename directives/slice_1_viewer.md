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
| **B2. Borders and polities** | See who owns what: borders, polity colours, regions (needs truth v3) | B2a (the port) in full, §B2; B2b and B2c outlined |
| **B3. The dossier and the shell** | Read a world's dossier in the one panel; rail, toasts, help, legend, design-system page | B3a (panel and dossier) in full, §B3; B3b and B3c outlined |
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

### B1.12 Subsector titles — `apps/web/src/map/titles.ts` (new, pure) and a renderer pass

Added 2026-10-03 after B1 shipped. At hex zoom nothing says where you are; the legacy map
answers with a small title per subsector (`js/renderer.js:2080-2289`;
`legacy_map_inventory.md` §3.5). Shown from `PPP_NAMES` up, in screen space, painted last.

- **Text:** `Sector Name - Subsector Name`. The subsector letter is `A` + row × 4 + column
  (columns of 8 hexes, rows of 10); its name is `index.metadata.names[letter]`, else
  `Subsector <letter>`. No index yet for that sector → no title.
- **Type:** `600 13px` in `--font-text`, shrunk to fit `visible width - 24` px and dropped
  below 9 px. Pill padding `0.55` × font px left and right, `0.32` × font px top and bottom;
  corner radius `min(0.3 × font px, pill height / 2)`. Pill fill `--bg-0` at 55%, text
  `--signal` at 95%.
- **Where:** the visible part of the subsector rectangle (in pixels), minus a top inset of
  56 px for the omnibox. Skip the subsector if that part is under 56 px wide or 24 px tall.
  Candidate positions run along the inside of that rectangle with a 4 px margin: the top
  edge left to right, then the bottom edge, then down both sides, in steps of
  `max(12, pill height)`.
- **Cost of a candidate:** each world whose centre is within `0.8` hex sizes of the pill
  counts 1; within `0.35` hex sizes counts 10 (hex size in pixels is `ppp / 1.5`). A pill
  that overlaps another title already placed this frame, or the selected hex (radius one hex
  size), is not allowed. The cheapest allowed candidate wins, the first one on a tie. If
  none is allowed the title is omitted.

```ts
export type Box = { x: number; y: number; w: number; h: number };
export function titleCandidates(visible: Box, pillW: number, pillH: number): { x: number; y: number }[]
export function placeTitle(visible: Box, pillW: number, pillH: number,
    worlds: { x: number; y: number }[], hexSizePx: number, blocked: Box[]): { x: number; y: number } | null
```

Also in this step: remove the unused `home()` callback from `attachInput`'s api (the Home
key goes through the command registry since B1.10) and from `MapView`.

**Check (`tests/web/titles.test.js`):** with no worlds the first candidate (top left) wins;
a world under the top-left candidate moves the title along the top edge; a visible box 50 px
wide gives no candidates; a blocked box over every candidate gives `null`; the candidate
order is top edge, bottom edge, then sides. `tests/web/renderer.test.js`: at ppp 80 with one
loaded index, one title text containing the sector name and ` - ` is drawn; at ppp 40, none.
**Frame-time note:** the B1.4 drag again with titles on.

### B1.11 Verification for B1

- [ ] `npm test`, `npm run check`, `npm run typecheck`, `npm run build` green
- [ ] Browser, against production: at Regina every mark of B1.3 is where the table says and
      the name reads as belonging to its own hex; routes draw in the Spinward Marches; the
      capital names show from the home view inward; clicking a world selects it and the URL
      follows; the omnibox finds `Regina`, `reg`, `Spinward` and `Regina 191`
- [ ] The three frame-time notes: no visible stutter, and the worst frame reported
- [ ] Report: anything the legacy lines said that this recipe did not, and every question
      for Johnny

## B2. Borders and polities (truth v3)

**Status:** B2a WRITTEN 2026-10-03 (the port, with parity). B2b (the truth build carries the
result; v3) and B2c (the viewer draws it) are outlines, written when B2a reports.
**Why a port and not a rewrite:** the legacy app turns a TravellerMap `<Border>` path into a
set of hexes with a flood fill that has been tuned against real sectors for a long time
(`js/borders.js:535-1154`). That knowledge is worth keeping exactly, like the engines. So it
is converted the way the engines were: copied, made pure, and proven against the legacy code
with golden fixtures. The viewer must never run it; the truth build does, once.

### B2a. The port (Track A: `packages/`, `tests/golden`, `tests/oracle`, `tests/generation`)

#### B2a.1 A DOM stand-in for the oracle — `tests/oracle/xml_dom.js` (new)

The legacy function takes a DOM `<Borders>` element. The oracle has no DOM. Build the
smallest stand-in that satisfies exactly what `importBordersFromXml` calls, from the tree
`parseXmlElements` (`@voyage/shared`) already produces:

```js
export function bordersElementOf(xmlText)   // returns the <Borders> stand-in, or null
```

Each stand-in element has `getAttribute(name)` (the attribute or `null`), `textContent` (the
element's text), `querySelectorAll('Border')` (direct `Border` children, as an array) and
`ownerDocument`, whose `querySelector(sel)` answers exactly two shapes: `'Stylesheet'` and
`` `Allegiance[Code="X"]` ``. Any other selector throws, so a call the stand-in does not
cover is loud.

Add `js/borders.js` to the oracle's file list **after** `js/core.js`. If loading it in the
sandbox throws, stop and report the error and the line; do not edit `js/borders.js` and do
not stub more than the missing global the error names.

#### B2a.2 Golden fixtures from the legacy code — `tests/golden/cases.js`, `.gitignore`

Six sectors, chosen because each exercises a different branch:

| Sector XML | Borders | Why |
|---|---|---|
| `Spinward_Marches` | 7, 2 weak, stylesheet with 2 border rules | the reference sector |
| `Empty_Quarter` | 7, 4 weak | umbrella borders overwritten by the polities inside them |
| `Solomani_Rim` | 5, 1 weak | an enclosed polity inside a sector-spanning one |
| `Riftspan_Reaches` | 2 | sparse waypoints; paths that close on sector edges |
| `Verge` | 2 | a path that crosses a sector edge |
| `Gvurrdon` | 14, stylesheet with 10 border rules | many codes starting `V` collapsing into one group |

Un-ignore the five XML files that are not tracked yet, by exact name (`.gitignore`, one
negation line each, as for Spinward Marches).

One golden case per sector, `borders_<slug>`. Each runs in a **fresh** oracle context
(the legacy function keeps global state): set `window.hexBorderAssignments = new Map()`,
leave `window.borderDefinitions` unset, call
`importBordersFromXml(bordersElementOf(xml), 1)`, then return

```js
{ territories: window.borderDefinitions
      .filter(d => d.allegianceCodes && d.allegianceCodes.length)
      .map(d => ({ id: d.id, name: d.name, color: d.color, allegianceCodes: d.allegianceCodes,
                   hexes: [...window.hexBorderAssignments].filter(([, id]) => id === d.id)
                              .map(([hexId]) => hexId.split('-').pop()).sort() })) }
```

Slot 1 is the sector at grid position (0, 0), so the last four characters of each legacy
hex id are the sector-local `hhhh`. Write the fixtures with `UPDATE_GOLDEN=1` once and commit
them. `legacy borders_* is deterministic` must pass before going on.

#### B2a.3 The port — `packages/generation/src/territories.ts` (new)

```ts
export type BorderRecord = Record<string, string>;   // XML attributes as written, plus `path`
export type Territory = { id: number; name: string; color: string; allegianceCodes: string[]; hexes: string[] };
export function sectorTerritories(input: {
    borders: BorderRecord[];
    allegiances: { code: string; name: string }[];
    stylesheet: string;                               // text of <Stylesheet>, '' when absent
}): Territory[]
```

Copy `js/borders.js:574-1141` and `21-41` (`BORDER_COLOR_MAP`, `BORDER_COLOR_CYCLE`) into the
new file and apply these rules, in order, and nothing else:

1. `el.getAttribute('X')` → `rec.X` (missing → `''`, exactly where the legacy code writes
   `|| ''`); `el.textContent` → `rec.path`. The `ShowLabel` read keeps its
   `.toLowerCase() === 'false'` test.
2. The stylesheet text is `input.stylesheet`; the regular expression is unchanged.
3. `Allegiance[Code="X"]` lookup → the entry of `input.allegiances` with that code; its
   `name` is the element text.
4. The grid is one sector: `slotNum = 1`, `secMinQ = 0`, `secMaxQ = 31`, `secMinR = 0`,
   `secMaxR = 39`. `_hexIdOf(code)` and `getHexCoords` collapse to
   `q = col - 1`, `r = row - 1`; `_qrToHexId(q, r)` is the four-digit `hhhh`. Keep
   `_hexNeighbors` and the cube-coordinate line drawing character for character.
5. `window.hexBorderAssignments` → a local `Map<string, number>` keyed by `hhhh`.
   `window.borderDefinitions` → a local array that **starts as the legacy default five
   slots** (`getDefaultBorderDefinitions`, `js/borders.js:43-51`), so slot reuse, ids and
   default colours come out exactly as in a fresh legacy session. `window.borderPaths` → a
   local `Map` kept only because the free-slot test reads it.
6. Delete what has no meaning without a UI: `assigned` / `skipped` bookkeeping,
   `ensureFreeBorderSlot`, `renderBorderWindow`, `dbManager`.
7. Return the definitions that have at least one allegiance code, each with its sorted
   `hexes`, in definition order.

No behaviour is improved, simplified or "fixed". If a legacy line looks wrong, port it as
it is and list it in the report.

Also in this step, `packages/shared/src/parsers/metadata_xml.ts`: `parseMetadataXml` returns
one more field, `stylesheet: string` (the text of the `<Stylesheet>` element, `''` when
absent). Nothing else in the parser changes; its existing tests stay green.

Export `sectorTerritories`, `BorderRecord` and `Territory` from
`packages/generation/src/index.ts`.

#### B2a.4 Parity — `tests/golden/cases_esm.js`, `tests/generation/territories.test.js`

For each of the six sectors: `sectorTerritories` fed from `parseMetadataXml` of the same XML
must equal the legacy fixture **exactly** (ids, names, colours, allegiance codes, hex lists)
once both are serialised with `stable`. Add the six `esm borders_*` cases beside the engine
cases. A difference is reported with the first differing territory and hex; neither the
port nor the fixture is adjusted toward the other.

`tests/generation/territories.test.js` adds what a fixture does not say in words:
- Spinward Marches: every `hhhh` in every territory is a valid hex (columns 01-32, rows
  01-40) and no hex is in two territories.
- Empty Quarter: at least one territory that the XML marks only with `ShowLabel="false"`
  borders has fewer hexes than its path encloses, because a polity inside reclaimed them
  (assert against the fixture's numbers once they exist; report the numbers).
- An input with no borders returns `[]`.
- The function is pure: two calls with the same input return equal output and the input is
  not mutated.

#### B2a.5 Verification for B2a

- [ ] `npm test` green with six `legacy borders_*` and six `esm borders_*` cases
- [ ] `npm run check` and `npm run typecheck` clean
- [ ] Report: the territory names, colours and hex counts for Spinward Marches and Gvurrdon;
      every legacy line ported "as is" that looked wrong; whether `js/borders.js` loaded in
      the oracle without a new stub

### B2b. The truth carries territories: truth v3 (Track A scope; written 2026-10-03)

B2a reported and was checked: six `legacy borders_*` and six `esm borders_*` cases, exact
parity. This step puts the result into the sector index. **The Worker needs no code change**:
its finalize already builds the index with `assembleSectorIndex` and validates it with
`SectorIndex`. Regions (`<Region>`, `js/borders.js:1171-1513`) are **not** in v3; they are a
second port and a later truth version, taken as its own small step.

#### B2b.1 `packages/shared/src/schemas/truth.ts`

```ts
export const Territory = z.object({
    id: z.number(), name: z.string(), color: z.string(),
    allegianceCodes: z.array(z.string()), hexes: z.array(z.string()),
}).strict();
```

`SectorIndex` gains `territories: z.array(Territory)`, and its `metadata` gains
`allegiances: z.array(z.object({ code: z.string(), name: z.string(), base: z.string().optional() }).strict())`.
Export `Territory` from `src/index.ts`.

#### B2b.2 `packages/generation/src/index.ts`, `assembleSectorIndex`

Add to the returned index:
- `territories`: `sectorTerritories({ borders: meta.borders, allegiances: meta.allegiances,
  stylesheet: meta.stylesheet })` with the territories that have **no hexes removed** (the
  port keeps them for parity; an empty territory has nothing to draw). `[]` when there is no
  metadata XML.
- `metadata.allegiances`: the parser's table as it is.

Nothing else in the function changes. `sectorTerritories` itself is not touched.

#### B2b.3 `tools/truth/build.js` and the root `package.json`

`truth:local` becomes `node tools/truth/build.js v3`. No other change.

#### B2b.4 Tests

- `tests/generation/sector_index.test.js`: the Spinward Marches index passes
  `SectorIndex.parse`; it has four territories whose hex counts are 36, 60, 739 and 52 (the
  B2a report's numbers), 887 in all, every `hhhh` valid and none in two territories; its
  `metadata.allegiances` is not empty.
- `tests/generation/territories.test.js`: the Empty Quarter index (through
  `assembleSectorIndex`) does not contain the zero-hex Julian Protectorate territory, while
  `sectorTerritories` on the same input still returns it.
- `tests/api/truth_build.test.js` (gated; this one file under `tests/api` may be edited):
  the fixture sector's index has `territories` equal to `[]` and passes `SectorIndex.parse`.
- Report the bytes of the Spinward Marches index before and after.

#### B2b.5 v3 is not built yet (re-planned 2026-10-03)

Johnny: "Are we gonna need to re-run the truth all the time? If so, let's get more truthy
stuff done so we can just run it once." B2b is in the code; the v3 build waits for B2d.

### B2d. One more round of truth changes, then v3 once

Two answers to "do we re-run the truth all the time".

**1. Gather what is known to be coming.** Everything below changes what the truth files
hold, and all of it is needed by slice 1:

| Item | What it adds | Why the viewer needs it |
|---|---|---|
| B2d.1 Regions | each index gains `regions`: name, colour, hex list, ported from `js/borders.js:1171-1513` like the borders | region fills and names (206 regions in the catalogue) |
| B2d.2 Route colours | each route in the index gains its resolved colour (own `Color`, else the sector stylesheet's `route.CODE` rule, else the built-in table), ported from `js/otu_metadata_parser.js:33-95` | 62 sectors colour their routes by stylesheet; B1 falls back to grey for those |
| B2d.3 Polities in the overview | the overview gains, per sector, its territory names and colours and one character per hex saying which territory owns it | polity colours and borders when zoomed out, where no index is loaded |

**2. Make an index-only rebuild cheap (B2d.4).** A truth build spends its hour generating and
writing 156,222 trees. None of the items above changes a tree. A **derived build** makes
version N+1 from version N without the engines: per sector, read N's index, keep its
`hexes` (chart rows and tree hashes) exactly, re-run only `assembleSectorIndex` with the
current code and the metadata XML, write the new index and copy the search rows. One short
invocation per sector, a few minutes for all 512, the same queue, states and release. It
refuses unless seed, settings and engine version equal the source version's, because then
the trees are provably the same. After this, changing what an index or the overview holds
costs minutes, and a full build is needed only when the engines or the inputs change.

Order: B2d.1, B2d.2, B2d.3 (packages, parity-tested where legacy code exists), then B2d.4
(Worker). Then **v3 is derived from v2**, released, and B2c draws it. Each item gets its
steps written here just before it is handed out; B2d.1 is first.

#### B2d.1 Regions (same method as B2a)

- `packages/shared/src/parsers/metadata_xml.ts`: `parseMetadataXml` also returns
  `regions`: one record per `<Region>`, its attributes as written plus `path`, like
  `borders`.
- `tests/oracle/xml_dom.js`: `regionsElementOf(xmlText)`, the `<Regions>` stand-in, with
  `querySelectorAll('Region')` and whatever else `importRegionsFromXml` calls and nothing
  more.
- Golden cases `regions_<slug>` for `Riftspan_Reaches` (3 regions) and two more sectors
  chosen from the catalogue so that between them they cover a region that closes on a sector
  edge and one that does not (name them in the report; un-ignore their XML by exact name).
  The legacy function writes `state.cluster` only on hexes that exist in `hexStates`
  (`js/borders.js:1337, 1486-1503`), so each case first fills `hexStates` with a state for
  every one of the sector's 1,280 hexes in slot 1, then calls
  `importRegionsFromXml(regionsElementOf(xml), 1)`, then returns
  `{ regions: [{ name, color, hexes }] }` from `window.regionDefinitions` and the hexes whose
  `cluster` is that name (four-digit `hhhh`, sorted). A region with no `Label` is skipped by
  the legacy code and has no entry.
- `packages/generation/src/regions.ts`: `sectorRegions({ regions })` returning
  `{ name, color, hexes }[]`, ported from `js/borders.js:1171-1513` by the B2a.3 rules:
  records for elements, one sector as slot 1, local maps for globals, UI and persistence
  calls deleted, nothing improved. The filter rule the legacy function upserts is UI state
  and is not ported; say so in a comment.
- `assembleSectorIndex` adds `regions` (empty ones dropped); `SectorIndex` gains
  `regions: z.array(z.object({ name, color, hexes }).strict())`.
- Parity cases `esm regions_<slug>`; `tests/generation/regions.test.js` for validity (every
  `hhhh` valid, purity, no regions → `[]`).

#### B2d.2 Route colours resolved at build time (Track A scope: `packages/`, `tests/`)

B1 colours a route from its own `Color`, else a table by allegiance; 62 sectors colour their
routes through a `<Stylesheet>` the viewer never sees, so those show grey.

- `packages/generation/src/route_colours.ts`: `routeColour(route, stylesheetRules)` and
  `routeStylesheetRules(stylesheet)`, ported from `js/otu_metadata_parser.js:33-95` and the
  colour line at 235: the route's own `Color`; else the stylesheet rule `route.CODE { color }`
  for its `Allegiance`; else `OTU_DEFAULT_ROUTE_COLORS[Allegiance]` (copy the table exactly,
  named colours as written); else `''`. A route with no `Allegiance` returns `''` (the viewer
  draws it in the X-boat colour). The legacy "next unused palette colour" for an unknown
  allegiance is session state and is **not** ported; such a route returns `''`.
- `assembleSectorIndex`: each record of `metadata.routes` gains `resolvedColor` when the
  result is not `''`. Records are otherwise unchanged.
- Parity: if `js/otu_metadata_parser.js` loads in the oracle, golden cases
  `routes_<slug>` for Spinward Marches, Gvurrdon and one sector that has `route.` rules in
  its stylesheet (name it in the report; un-ignore its XML), each returning the colour the
  legacy import gives every allegiance code; the port must match. If it does not load, stop
  and report the error rather than stubbing more than the one global it names.
- `tests/generation/route_colours.test.js`: own colour wins; a stylesheet rule beats the
  table; the table is used when there is no rule; no allegiance → `''`; unknown allegiance →
  `''`.

#### B2d.3 Polities in the overview (Track A scope, same prompt as B2d.2)

So the zoomed-out map can show who owns what without loading an index.

- `SectorOverview` gains `polities: z.array(z.object({ name: z.string(), color: z.string() }).strict())`
  and `owners: z.string().length(1280)`.
- `sectorOverview(index)`: `polities` is the index's `territories` in order (name and
  colour); `owners` has one character per hex at the same position as `cells`: `.` when no
  territory owns the hex, otherwise the territory's position in `polities` as one base-36
  digit (`0`-`9`, `a`-`z`). A sector with more than 36 territories throws with the sector's
  slug; do not invent a wider encoding. Regions are not in the overview.
- `tests/generation/overview.test.js`: for Spinward Marches the counts of each digit in
  `owners` equal the four territories' hex counts (36, 60, 739, 52) and every other position
  is `.`; a sector with no territories has `polities` `[]` and `owners` all `.`; the document
  still passes `TruthOverview.parse`.

#### B2d.4 The derived build (Track C: `apps/api`, `tests/api`, one file in `packages/shared`)

Makes version N+1 from version N without running the engines. Independent of B2d.1-B2d.3:
it calls `assembleSectorIndex` as it is on the day, so whatever those add is picked up.

- **`packages/shared/src/schemas/generate.ts`:** `TruthBuild` gains `from: z.string().optional()`.
- **Migration `0006_truth_versions_derived_from.sql`** (hand-written):
  `ALTER TABLE truth_versions ADD COLUMN derived_from text;` and the column in `schema.ts`.
- **`POST /api/admin/truth/build` with `from`:** 404 if the source version does not exist;
  409 unless it is `released`; 409 unless `milieu`, `seed`, `engineVersion` and `settings`
  (compared with `stable`) equal the source row's, naming the first field that differs. The
  sector list is the source's; `sectors` must be `'all'`. Inputs for the **new** version are
  verified by listing as today (the XML is read from `inputs/<version>/`). The row is inserted
  with `derived_from`; sectors go in `queued`, twelve start; each message is
  `{ version, slug, from, pinned }`.
- **Consumer:** a message with `from` runs `deriveSector`: get
  `truth/<from>/sectors/<slug>/index.json` from `PUBLIC_BUCKET` (a missing index throws),
  take its `hexes` object unchanged, then do exactly what finalize does after it has the
  hexes: `assembleSectorIndex` with this version, the XML and the catalogue entry,
  `SectorIndex.parse`, put the index, the one D1 batch (replace `truth_systems` rows, upsert
  `done`), then `claimNext`. Factor that shared tail out of `finalize` into one function
  both paths call; do not copy it. No tree is generated, read or written. About eight binding
  calls a sector.
- **`claimNext`, `markFailed`, the dead-letter consumer and the retry route** carry `from`
  through: a message they send for a derived version has `from` (read from
  `truth_versions.derived_from` when the dead message or the retry does not have it).
- **Release** is unchanged.
- **Gated tests:** build `vtest` fully and release it; derive `vderived` from it and assert
  each sector is `done`, its index's `hexes` deep-equal the source's, `truthVersion` is
  `vderived`, the `truth_systems` row counts match, and no object was put under `objects/`
  during the derive (count the puts on the test double, or compare the object listing before
  and after). Deriving from an unreleased version is 409; with one setting changed is 409
  naming `settings`; a retry of a derived sector marked `failed` sends a message with `from`.

### B2c.1 Outline geometry (written 2026-10-03; new files only, so it can run beside B3a)

`apps/web/src/map/outline.ts` (new, pure) and `tests/web/outline.test.js`. Ported from
`js/renderer.js:2297-2414` (`_rebuildBorderGeomCache`): read those lines first and port the
algorithm as it is, in parsecs.

```ts
export type Loop = { points: number[]; minX: number; minY: number; maxX: number; maxY: number };   // x0, y0, x1, y1, ...
export function outlineLoops(hexes: { q: number; r: number }[]): Loop[]
```

- Input is a set of **global** hexes (`toGlobal` from `geometry.ts`), so a polity that spans
  sectors is one set and gets one outline across the sector edge.
- A hex side is a border edge when the neighbour across it is not in the set. Neighbours are
  the legacy `NEIGHBOR` table for odd-q offset (`renderer.js:2309-2316`); `q & 1` is correct
  for negative `q`.
- Edges are chained into closed loops by matching vertex keys rounded as the legacy code
  rounds them (2366-2384).
- Each loop vertex is moved **inward** by 10% of the hex size (`HEX_SIZE * 0.1`) along the
  mitre of the two adjacent edge normals (2388-2401).
- Hex corners come from `hexCorners` in `geometry.ts`; do not write a second corner
  function.

**Check:** one hex gives one loop of 6 points, each closer to the centre than the corner by
the inset; two adjacent hexes give one loop of 10 points; a ring of six hexes around an empty
centre gives two loops (outer and inner); two hexes that do not touch give two loops; the
same input in a different order gives the same loops; a hex at negative `q` and `r` works.
Report the legacy lines ported as written that looked wrong.

### B2c.2 Territories and regions on the chart (written 2026-10-03)

`apps/web/src/map/territory_layer.ts` (new, pure) and passes in `MapRenderer.ts`. Runs on
any index that has `territories` and `regions` (truth v3); an index without them (v2) draws
nothing and must not throw.

```ts
export type Shape = { key: string; color: string; loops: Loop[] };
export function territoryShapes(indexes: SectorIndex[]): Shape[]   // borders
export function regionShapes(indexes: SectorIndex[]): Shape[]      // regions
```

- **Joining across sectors.** Territories with the same `name` and `color` in different
  indexes are one shape: their hexes are converted with `toGlobal` and passed to
  `outlineLoops` together, so no line is drawn along a sector edge inside a polity.
  Regions join the same way.
- **Caching.** The renderer recomputes shapes only when the set of loaded indexes on screen
  changes (key: their slugs, sorted and joined). Never per frame.
- **Painting**, at tier `hex` (`ppp >= PPP_GRID`), in the legacy order
  (`legacy_map_inventory.md`, paint order): territory fills and region fills first, under the
  grid; then grid and routes as today; then territory outlines; then the worlds.
  - Territory fill: its loops as one path, filled with the territory's colour at
    `TERRITORY_FILL_ALPHA = 0.2`, fill rule `evenodd` so an enclosed hole stays open.
  - Region fill: the same at `REGION_FILL_ALPHA = 0.3`; regions have no outline.
  - Territory outline: the same loops stroked in the territory's colour, 2.5 px, round joins
    and caps, solid (`js/renderer.js:2431-2447`).
  The colours come from the truth data and are used as given; the two alphas and the stroke
  width are named constants in `glyphs.ts`.
- **A difference from legacy, on purpose:** the legacy app fills each whole hex at grid zoom
  and the inset loop only when zoomed out. Here the inset loop is filled at both, so one path
  per polity replaces thousands of hex paths. The thin unfilled margin is 10% of a hex.
- Territory and region **names** are not drawn in this step (they are off by default in the
  legacy app); they come with the view settings. Polities at tiers `sector` and `galaxy`
  come from the overview's `polities` and `owners` in the next step.

**Check (`tests/web/territory_layer.test.js` and `tests/web/renderer.test.js`):** two
indexes whose territories share a name and colour and touch across the sector edge give one
shape whose loops have no segment on that edge; different names give two shapes; an index
with no `territories` field gives `[]`; with the recording context at ppp 40, one territory
produces one `evenodd` fill at alpha 0.2 before the grid and one stroke after the routes,
and a region produces one fill at 0.3 and no stroke; shapes are computed once across two
`draw` calls with the same indexes.
**Frame-time note for the browser check (after truth v3):** tier `hex` over the Spinward
Marches with borders on, dragging.

### B2c.3 Polities when zoomed out (written 2026-10-03)

At tiers `galaxy` and `sector` no index is loaded, so polities come from the overview
(truth v3): each sector's `polities` (name, colour) and `owners` (one character per hex:
`.` or a base-36 digit indexing `polities`). An overview without those fields (v2) draws
nothing and must not throw.

- **`apps/web/src/map/polity_layer.ts` (new, pure):**
  ```ts
  export type PolityHexes = { key: string; name: string; color: string; hexes: { q: number; r: number }[] };
  export function polityHexes(overview: TruthOverview, layer: 'canonical' | 'all', manifest: TruthManifest): PolityHexes[]
  ```
  One entry per distinct name and colour across all sectors of the drawn layer, its hexes in
  global coordinates (`toGlobal`), entries ordered by key. The position of a hex in `owners`
  is the same as in `cells`: `(col - 1) * 40 + (row - 1)`.
- **Building the outlines without blocking.** `MapRenderer` holds the list from
  `polityHexes` (computed once per `setChart`) and turns entries into loops with
  `outlineLoops` **one polity per drawn frame**, largest first, marking itself dirty until
  all are done; a frame never builds more than one. The manifesto's 50 ms limit applies: if
  one polity's loops take longer than that in the test below, stop and report the number
  rather than splitting it yourself.
- **Drawing**, at tiers `galaxy` and `sector`, under the system points: each finished
  polity's loops as one cached `Path2D` in parsec coordinates, drawn with the camera as a
  canvas transform; filled with its colour at `POLITY_FILL_ALPHA = 0.22` (`evenodd`) and
  stroked at 2.5 px (set `lineWidth` to `2.5 / ppp` under the transform), as the legacy
  zoomed-out layer does (`js/renderer.js:486-517`). The legacy vertex thinning is not ported:
  measure first. At tier `hex` this layer is off and B2c.2's index layer draws.
- **Check (`tests/web/polity_layer.test.js`, `tests/web/renderer.test.js`):** a two-sector
  overview whose polities share a name and colour gives one entry with hexes from both
  sectors; an overview without `owners` gives `[]`; a sector outside the layer contributes
  nothing; with the recording context at ppp 3, the first `draw` builds exactly one polity
  and the second the next; at ppp 40 the layer draws nothing. A timing test builds the loops
  for a synthetic polity of 30,000 hexes (a filled rectangle of 150 by 200 global hexes) and
  reports the milliseconds in the test output without asserting on it.
- **Frame-time note for the browser check (after truth v3):** the home view, dragging and
  zooming, with polities on.

### B2c. The viewer draws them (outline)

Outline loops from each territory's hex set (`js/renderer.js:2297-2452`: sides whose
neighbour is outside the set, chained, inset 10%), with territories of the same name joined
across sector edges; fills at 20% (22% zoomed out); border names; zoomed-out polity shapes.
Measured for frame time like every B1 layer.

## B3. The dossier and the shell

**Status:** B3a WRITTEN 2026-10-03. B3b and B3c are outlines at the end of this section.
**Johnny's instruction:** keep **everything** the legacy inspector shows, restyled to
`design_reference.md`. **The checklist is `findings/legacy_inspector_inventory.md`**; its
section letters (A-K, "Body profile") are used below. Re-read the legacy lines it cites
before each step; if they say something this recipe does not, follow the recipe and list the
difference.

**What moves where.** Nothing is dropped; some things have a later home:

| Inventory item | Where it is built |
|---|---|
| Header, UWP ribbon (C), identity rows (D), no-orbit brief (G), socioeconomics (I), stellar lines (J), system tree (K), body profile, body navigation, the three widths | **B3a, here** |
| Surface-map lead and its scanner (A), Explore orbits, Center, Orbits | part C, with the planet renderer and the orbit view; B3a leaves the slot |
| 100D jump times (F), trade-code chips opening Trade Match | B3b |
| Rail, toast, help, legend, design-system page | B3c |
| Referee notes (E), campaign block (H), Edit, Edit system | Builder and Campaign slices: they show or change a referee's own data, which does not exist until then |

**Data.** The panel reads the selected world's index entry (already loaded by the map) and
its generated system document, `objects/<tree hash>`, whose `body` holds the same fields the
legacy hex state held (`t5Data`, `mgt2eData`, `mgtSocio`, `t5Socio`, `mgtSystem`, `t5System`,
`name`, `uwp`, `allegiance`, `travelZone`, `bases`, `tradeCodes`, `gasGiantCount`,
`beltCount`). Documents are immutable, so there is no polling (the legacy 800 ms poll is
gone) and a document seen once is never fetched again in a session.

### B3a.1 Fetching a tree — `apps/web/src/map/truth_client.ts`

Add `tree(hash: string): Promise<TreeEnvelope>` and `treeNow(hash: string): TreeEnvelope | null`.
One request per hash however many callers ask; the 16 most recently read are kept; a failed
fetch is not cached. Same rules as the index cache.

**Check (`tests/web/truth_client.test.js`):** two concurrent `tree` calls make one request;
the 17th tree drops the least recently read; `treeNow` is null before arrival.

### B3a.2 Display names — `apps/web/src/dossier/labels.ts` (new, data and three functions)

The viewer may not import the engines. The name tables it needs for display are in
`packages/engines/src/universal_math.js:26-101` (`TRADE_CODE_NAMES`, `STARPORT_NAMES`,
`SIZE_NAMES`, `ATMOSPHERE_NAMES`, `HYDRO_NAMES`, `POPULATION_NAMES`, `GOVERNMENT_NAMES` and
the rest of that block). Copy the tables **character for character** and port
`formatUwpDigit`, `formatTradeCodes` and `formatDisplayNumber` (lines 11-21 and 103-121)
beside them. No name is written from memory; a code the tables do not hold is shown as the
code alone, as the legacy functions do.

**Check (`tests/web/labels.test.js`):** the test imports the engine functions from
`@voyage/engines` and asserts that for every key of every table, and for the values `?`,
`''`, `undefined` and an unknown code, the web functions return exactly what the engine
functions return. If the engines' tables change, this test fails until the copy follows.

### B3a.3 The view model — `apps/web/src/dossier/model.ts` (new, pure)

```ts
export function pickSystem(body: HexBody): SystemDoc | null       // first of aowSystem, mgtSystem, ctSystem, t5System, rttSystem with stars.length > 0
export function mainworldProfile(body: HexBody): Record<string, unknown>   // aowSystem?.mainworld || mgt2eData || ctData || t5Data || rttData || {}
export function overviewModel(input: { sectorName: string; subsectorName: string; hex: string; entry: SectorHex; tree: TreeEnvelope | null }): OverviewModel
export function bodyModel(tree: TreeEnvelope, bodyKey: string): BodyModel | null
export function bodyKeys(system: SystemDoc): string[]              // navigation order
```

`OverviewModel` holds exactly what the inventory lists, as plain strings and arrays, so the
components contain no logic:

- **header**: title (`body.name`, else the profile's `name`, else the hex), hex chip, place
  line `Sector Name - Subsector Name` (inventory "Header").
- **ribbon**: the UWP split by the legacy expression into `Port Size Atm Hyd Pop Gov Law`, a
  dash and `TL`; a string that does not match is one cell; empty is no ribbon (C,
  `system_inspector.js:443-458`).
- **rows**: the identity table of D, in its order, with its paths and formats: Starport,
  Size, Atmosphere, Hydrographics, Population, Government, Law level, Tech level, Trade
  codes (each a chip), Travel zone, Allegiance, Bases, Nobility, PBG, Resource units, Gas
  giants, Belts, Age (Gyr), Edition. A row whose value is undefined, null, `''` or an empty
  array is omitted (`system_inspector.js:395`). Allegiance name: the entry of the sector
  index's `metadata.allegiances` with that code when the index has the table (truth v3),
  else the code alone.
- **noOrbit**: true when there is a tree but `pickSystem` is null or has no star and no
  non-`Empty` world (G); the sentence is "Orbit data has not been generated." (the legacy
  sentence's campaign half belongs to a later slice).
- **socio**: headline and rows of I from `body.mgtSocio`, in its order and formats; when
  `mgtSocio.pValue` is undefined, the legacy sentence.
- **stellar**: the lines of J.
- **tree**: the rows of K: every star, each non-`Empty` world, its non-`Empty` moons
  indented; details, the `Mainworld` tag, the UWP at the right; the count in the heading.
- **partial**: when `entry.tree` is null. Header, ribbon and the rows the chart row can fill
  (trade codes, travel zone, allegiance, bases, PBG) plus the sentence "Incomplete survey:
  this world has unknown values, so no system has been generated."

`BodyModel` holds the body profile of the inventory: title, crumb, place line, ribbon, fact
tiles, the Star section or the World, Orbit, Physical and Life & resources sections with
the listed fields, units and decimals, the Moons list, and for a star its Worlds list.
Booleans render `Yes`; a false value omits the row.

**Body keys** (new; the legacy key format was not found): `s<i>` for star `i`, `w<i>` for
world `i`, `w<i>m<j>` for its moon `j`, indexes into `stars`, `worlds`, `moons` as stored.
`bodyKeys` is stars, then each non-`Empty` world followed by its non-`Empty` moons: the
order of the tree and of Previous / Next.

**Check (`tests/web/dossier_model.test.js`):** build Regina's tree in the test with
`buildSector` from `@voyage/generation` (Spinward Marches, the pinned seed and settings, as
`tests/generation/sector_index.test.js` does) and assert: title `Regina`; ribbon cells
`A 7 8 8 8 9 9 - C`; the Starport row equals `formatUwpDigit('starport', 'A')`; the tree
heading count equals stars plus non-empty worlds; exactly one row carries `Mainworld`;
`bodyModel(tree, 'w0')` returns a title and at least one fact tile; `bodyKeys` starts with
`s0`. For hex `0914` of Caesillian (a partial row): `partial` is true, there is a ribbon, no
socio, no tree. No expected value in this test is typed from memory except the UWP `A788899-C`,
which the chart row holds.

### B3a.4 The one panel — `apps/web/src/shell/Panel.vue`, `shell/panel_state.ts`

One panel component for the whole app (manifesto, Simplicity). Props: `title`, `meta`,
`eyebrow`; slots: default body, `actions`. Header: eyebrow, title in `--font-display`, meta
in `--text-muted`, the three span buttons (Column, Half, Full) and Close. Body scrolls.

Widths are the legacy ones (`style.css:2687-2698`), because the legacy column is 520 px and
Johnny keeps the inspector as it is; `design_reference.md` §2.7's 320 px is superseded:

- column: `min(520px, 100vw - rail - 20px)`
- half: `min(100vw - rail - 20px, max(520px, (100vw - rail - 20px) / 2))`
- full: `100vw - rail - 20px`

`rail` is a CSS variable `--rail-width`, `0px` until the rail exists (B3c). The panel sits
on the **left**, over the map; the map stays alive behind it. Open and close: opacity plus
an 8 px translate over `--t-base` with `--ease-out`; none under reduced motion.

`panel_state.ts` (pure plus one storage call through `platform/browser.ts`): the span is
remembered per device (`localStorage` key `voyage_panel_span`; add `storageGet` and
`storageSet` to `platform/browser.ts`). `Escape` closes the panel when the omnibox is not
open and no body is selected; with a body selected it returns to the overview (inventory
§3). Register "Close panel" in the command registry.

`MapView` tells the renderer the panel's width so subsector titles inset on the left by it
(the legacy `--workspace-left` inset that B1.12 left out).

### B3a.5 The dossier — `apps/web/src/dossier/*.vue`

`DossierPanel.vue` (chooses overview or body from the route and feeds `Panel`),
`DossierOverview.vue`, `DossierBody.vue`, `UwpRibbon.vue`, `StatRows.vue`, `SocioBlock.vue`,
`StellarLines.vue`, `SystemTree.vue`, `FactTiles.vue`. Each renders a model from B3a.3 and
nothing else.

Layout by span, as the inventory §2 records:
- **column**: one scrolling stack: map slot, identity (ribbon and rows), socio (accordion
  closed) with stellar inside it, tree.
- **half**: two columns: map slot over identity; socio, stellar and tree in the second with
  its own scroll. Tree rows hide the facts after the first.
- **full**: three columns: map slot over identity; socio (accordion open) with stellar; tree.
- Body profile: one column, two equal columns, `1.1fr 1fr`.

The **map slot** is an empty block with the legacy aspect (800 by 400) carrying the caption
badge text of inventory A (`Mainworld`, `Mainworld · <name>`, `Mainworld · moon of
<parent>`) and the hint "Surface map arrives with the orbit view." Part C fills it.

While the tree is loading, the header, ribbon and chart-row rows render at once from the
index entry; the rest appears when the tree lands, with no layout jump in what is already
shown (reserve nothing; append below). A tree already in memory renders complete on the
first frame. A failed fetch shows "This world's system could not be loaded." and a Retry
button.

Styling: tokens only. Ribbon cells and stat values in `--font-data`; section headings in
`--font-display` 13 / 16 uppercase; hairline rows; chips as pills (`design_reference.md`
§3, §5). Read `style.css` `.dossier-*` and `.atlas-*` for proportions; copy no rule.

### B3a.6 Routes and selection — `apps/web/src/router.ts`, `MapView.vue`

- `/s/:sector/:hex` opens the panel on the overview (it already selects and flies).
- `/s/:sector/:hex/b/:body` opens the body profile for that key; an unknown key falls back
  to the overview.
- Clicking a world on the map, or opening a system from the omnibox, opens the panel.
  Clicking a tree row, the Mainworld button, the breadcrumb, Previous or Next changes the
  body with `router.push`, so Back works. Previous and Next are disabled at the ends.
- Close returns to `/` with the camera query kept and clears the selection.

**Check (`tests/web/routes.test.js`):** the route-to-state function for the two shapes and
an unknown body key.

### B3a.6a Amendments accepted from the B3a report (2026-10-03)

- `overviewModel` takes the sector index's `metadata.allegiances` as an optional argument.
- The title falls back to the index entry's `name` before the hex, so a partial world and a
  world whose tree has not arrived are titled by name.
- Two sentences the recipe did not give: "This hex has no world in the sector index." and
  "Loading this sector."
- The ribbon's dash cell is ASCII `-` (the legacy cell is an en dash); cosmetic, revisit in
  the browser check.
- An unknown body key shows the overview once the tree's keys are known.
- The omnibox stays above a full-width panel; the status line shifts by the panel width.

### B3a.7 Verification for B3a

- [ ] `npm test`, `npm run check`, `npm run typecheck`, `npm run build` green
- [ ] Browser, against production (not run by the implementer): Regina's dossier shows the
      ribbon, every identity row the legacy inspector shows for Regina, socioeconomics, the
      stellar line and the system tree; a body opens from the tree and Previous / Next walk
      it; the three widths lay out as described; Back returns from a body; a partial world
      (Caesillian 0914) shows the incomplete-survey sentence; the map stays smooth with the
      panel open
- [ ] Report: every inventory item and where it now lives (built, slot left, or which later
      part), every legacy line that differed from the recipe, every question for Johnny

### B3b and B3c (outlines)

- **B3b:** 100D jump times (the generated worlds carry a `journeyTimes` field; whether it
  holds what the legacy helper computed is checked first; if not, a small Worker route
  computes it with the engines); Trade Match from a trade-code chip (`js/trade_match.js`).
- **B3c:** the rail, toast, progress, the generated shortcut help, the legend, view settings,
  the design-system page at `/design`.

## B. What is left of part B after B1 (outline)

- **B3 keeps everything the legacy inspector shows** (Johnny, 2026-10-03: "I want to keep
  everything from the inspector"), restyled to `design_reference.md` ("our UI design revamp
  applied to it if possible"). Nothing is dropped for being awkward; a control that edits
  data is kept in the inventory and built in the Builder slice, where saving exists. The B3
  recipe is written from `findings/legacy_inspector_inventory.md`.

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
