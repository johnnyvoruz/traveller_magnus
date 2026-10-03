# Manifesto — Traveller.voyage

**Status:** ADOPTED 2026-10-02 (Johnny). Governs everything under `apps/`, `packages/`,
`tests/`, `tools/` and every directive written after this date. The legacy single file
(`hex_map.html` + `js/`) is frozen as the reference implementation; it is read, never extended.
**Load this file at the start of every session that touches the new app**, then `plan.md`.
It is short on purpose. If a rule here conflicts with an older directive, this file wins.

**Product:** Traveller.voyage, a lean mapping engine and orbit engine for the Traveller RPG,
hosted at traveller.voyage. **Stack:** Vue 3 + Vite + TypeScript on one Cloudflare Worker with
Hono, D1, R2 (`architecture.md`). **Posture:** what TravellerMap does, with a dose of D&D
Beyond, within the same fair-use terms.

---

## 0. Why this exists

The legacy app grew across many sessions that each saw one corner. It works, but it is
245 window globals, 75 script tags, 940 `getElementById` calls, 76 native dialogs, four
show/hide mechanisms and no tests. The generation engines underneath are deterministic,
DOM-free and worth keeping. The shell is not.

Adjectives do not constrain a session. Rules with a check do. Every word below is a rule
and every rule names its check.

## 1. The seven words, as rules

### Simplicity — one way to do each thing
- One panel system, one show/hide, one toast, one modal, one shortcut registry, one
  command palette. A second implementation of any of these is a defect.
- No native `alert`, `confirm` or `prompt`. Destroy = tombstone + toast with Restore. Bulk
  actions snapshot first. The only confirm in the app is "delete this universe".
- **Check:** `npm run check` greps `apps/*/src` and `packages/*/src` for `window\.`, `alert(`, `confirm(`,
  `prompt(`, `innerHTML`, `getElementById` and must print zero for each, with an allowlist
  file for justified exceptions that names the reason.

### Extendability — everything joins through a registry
- Editions, panels, exporters, filters, commands and record types register themselves.
  No file knows the list of the others.
- ES modules only. Explicit imports. No globals. A module boundary is enforced by the
  build, not by convention: `packages/engines` imports nothing from `apps/`; `apps/api` never
  imports `apps/web` and vice versa (`architecture.md` §3).
- `rules/` stays read-only and is consumed through a generated ESM wrapper (slice 0 §6).
- **Check:** `npm run check` fails on a cross-boundary import; `npm test` must pass.

### Sleek, minimal — tokens and one panel
- One token file for colour, type, space, radius, motion. No literal colour or duration in
  a component.
- One panel at three widths (column, half, full). Layouts are designed for all three.
- A feature gets no chrome until it works from the command palette.
- **Check:** `npm run check` greps components for hex colours and `ms` literals: zero.

### Connected — everything has a URL and every name is a link
- Universe, sector, hex, body, record, package: each has a route. The back button works.
- If two things are related, the relation shows on both pages.
- **Check:** every route in the router table has a test that renders it from a cold load.

### Graceful — nothing pops, nothing blocks, nothing loads twice
- Panels dissolve, the camera flies, lists virtualize. No layout shift on data arrival.
- Nothing seen before on this device shows a loading state again (HTTP cache on
  immutable truth files; in-memory cache in session).
- The main thread never blocks over 50 ms: generation runs on the platform and reports
  progress; heavy client work (bakes, exports) runs in a Web Worker.
- **Check:** a Lighthouse run on the viewer route scores no CLS; a bulk generation shows
  progress events within one second of being accepted.

### Sci-fi — a reference, not a rule
- This cannot be checked by grep. The definition is `design_reference.md`: the look of the
  legacy planet select controls, the tracker (locator) line and the sci-fi inspector panel,
  extracted into tokens, components and motion rules. It lives in the app as
  `apps/web/src/design/` (tokens plus a design-system page), and sessions copy from it
  instead of inventing.
- Type: Orbitron for display, Inter for text, both self-hosted. Dark is the default theme;
  light is a token swap, not a second stylesheet.

## 2. Architecture, in six sentences

1. **Immutable things are files; mutable things are rows.** The truth (the charted universe
   at a version) and packages (published homebrew at a version) are static files on R2
   behind the CDN. Everything a signed-in builder edits is rows in D1, with blobs in R2.
2. **The platform is the compute.** Engines run in the Worker, inline for small requests and
   as Queue jobs for bulk and truth builds. One runtime means one truth; no engine code
   reaches a browser.
3. **Engines are pure.** Input: a hex id, a settings object, a seed, optional prior state.
   Output: a system object. No DOM, no map state, no globals. Logging goes to a trace sink.
4. **The overlay document v3 is the contract** between client and server and the package
   format for sharing. Hexes carry `rev` and `updatedAt`; deletes are tombstones.
5. **A package is a diff against the truth at known hex ids.** Install is a merge. Proposing
   to canonical is the same merge with a reviewer. Relocation is a stretch goal.
6. **`rules/` is read-only** and every RPG number comes from it. Halt & Challenge stands:
   an ambiguous rule stops the work and asks Johnny.

## 3. How a session works

1. Read this file, then the slice spec it is working in, then the legacy file it is
   replacing — to learn the behaviour, never to copy UI code. Engine code is copied on
   purpose and verified by golden tests.
2. Work from a recipe (numbered steps, file, function, exact code, one-line check). If a
   step cannot be done as written, stop and report; do not improvise an approach.
3. Run `npm test` and `npm run check` before reporting done. Report what failed verbatim.
4. New files over edits. Never edit `rules/`. Never edit the legacy tree except to delete it
   at a slice cutover.
5. No git. Johnny stages and commits.

## 4. Decisions taken (Johnny, 2026-10-02)

- **UI framework:** Vue 3 + Vite + TypeScript. Canvas map and orbit engines are plain TS
  classes outside Vue reactivity; Vue owns panels, routing and state.
- **Hosting the truth publicly:** cleared. Same terms TravellerMap operates under.
- **Marketplace:** free homebrew sharing, snapshot on publish, locked to exact hex
  coordinates. Relocation is a stretch goal.
- **Name and domain:** Traveller.voyage at traveller.voyage.

- **Truth generation defaults:** the two keys the legacy settings never pinned are rules as
  written: `generationNoTravelZones = false`, `generationPopCheckFrequency = 100` (slice 0 §3).

Still open: the OAuth app credentials and Cloudflare resources listed in `plan.md` §7.
