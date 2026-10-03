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
| **B. Chart detail and the dossier** | Read a hex like a chart (starport, world, bases, zones, routes, borders), search, select a world, read its dossier | outline, §B |
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
| Input is **Pointer Events** from the first line (mouse, touch, pen, pinch). Whether phone and tablet *layouts* are in scope is still open; pointer input costs nothing and keeps the door open | orchestrator; Johnny to confirm layouts |
| World **names at far zoom** are not drawn. Which worlds deserve a label when zoomed out (capitals, high importance) is a chart-reading convention that `rules/` does not hold and the legacy renderer does not implement, so it is a Halt & Challenge question, listed at the end | Zero-Assumption Policy |

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

## 3. Part A1 — the map (Track W: `apps/web` and `tests/web`)

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

### A1.11 Pan cache, after measuring

With A1.7 working, measure a drag at tier `sector` over the Spinward Marches and at tier
`hex` with about 10,000 hexes visible (Chrome performance panel; report median and worst
frame). The budget is 16 ms (`architecture.md` §10). If either is over, add the pan cache
inside `MapRenderer`: draw to an offscreen canvas larger than the viewport by a margin, blit
it while the camera only translates, redraw when the margin is used up or `ppp` changes.
If both are under, do not add it; say so in the report.

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

## B. Chart detail and the dossier (outline; recipe written when part A reports)

- **Chart glyphs.** Replace the dot: starport letter, world disc, gas giant mark, base marks,
  zone ring, allegiance tint, name styling. Every one of these is a Traveller chart
  convention. The orchestrator reads `js/renderer.js:1032-2060` and writes down, per glyph,
  the legacy rule, its line range and the index fields it needs, before any of it is
  recipe. Anything the legacy rule reads that the v2 index entry does not carry is added to
  the index by name (`data_model.md` §5), which means a new truth version: decide the full
  list once.
- **Stars.** 106,146 of 180,312 chart rows have no `stars` value. If the map draws stellar
  colour, those come from the generated tree: one more index field, same new version.
- **Routes and borders** from each index's `metadata`, batched per style.
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

1. **Which worlds get a name when zoomed out?** Capitals? Importance above some value? High
   population in capitals, as printed charts do? `rules/` does not say and the legacy map
   draws no names below its label threshold. Until Johnny answers, names appear only from
   `PPP_NAMES` up.
2. **Alternate sectors that share coordinates with canonical ones** (the Judges Guild
   sectors and others): shown how? Part A draws the canonical layer only.
3. Any chart symbol whose legacy rule cannot be found in `js/renderer.js` (part B).

## Needed from Johnny

- Phones and tablets: are their **layouts** in scope for slice 1? (Input already is.)
- Which agent takes Track W (`apps/web`). Agent A is free once A0 is in.
- Icons: `design_reference.md` §6 says Font Awesome Free through one `<Icon>` component;
  the reviewers suggest dropping the 9 MB Pro kit. Part A draws no icons, so this waits for
  part B.
