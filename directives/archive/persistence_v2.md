# Persistence v2 — no undo, rolling autosaves, base + overlay, local universe snapshot

**Status:** Implemented 2026-10-02 (Step 2). The shipped chart snapshot is Spinward Marches; the builder can add the rest. Supersedes
`directives/large_campaigns.md` (undo patches) once Step 2 of `directives/bugfix_pass.md`
lands. Precedes `directives/campaign_manager_plan.md` Phase 0 and does its persistence half.

Decisions this encodes (referee, 2026-10-02): undo is removed; autosaves rotate like a game's;
the charted universe is a read-only local snapshot **including Mongoose-built systems**;
everything the referee changes is an overlay; allegiances are saved; the app stays a single
`hex_map.html` that works from `file://`.

---

## 1. The two layers

```
   ┌──────────────────────────────────────────────────────────────┐
   │ OVERLAY   what the referee changed — small for a universe map │  autosaved, saved, exported
   ├──────────────────────────────────────────────────────────────┤
   │ BASE      read-only universe snapshot, per sector, on demand │  shipped in the repo, never written
   └──────────────────────────────────────────────────────────────┘
                         ▼ merged at load into
                 hexStates (unchanged shape, so renderer and engines do not change)
```

**Only hexes are layered.** Routes, borders, regions, allegiances, names, settings, campaign:
the overlay owns them whole (they are small; a universe's route list is a few MB at most).
At import, the base's metadata (routes/borders from the sector XML) is *copied* into the
overlay once; after that the referee's lists are the truth.

"Build your own map" = base is `null`. Nothing else differs.

### 1.1 Base snapshot files (REVISED 2026-10-02 — inputs only, systems built on demand)

> **Decision (Johnny, 2026-10-02):** the snapshot holds the *inputs*, not the built systems.
> A built snapshot measured 21 MB for one sector (439 systems × ~48 KB of MgT2E trees),
> ~2.7 GB for the universe. Instead each system's tree is built **the first time it is
> needed**, deterministically from the snapshot's seed, in a few milliseconds, and cached.
> This must be **invisible to the referee** ("rule grace"): no progress bars, no "building…"
> text, no delay the eye can see. §1.4 says exactly how.

```
universe/
  index.js                      window.UNIVERSE_INDEX = { milieu:'M1105', snapshotVersion, builtAt,
                                  buildVersion (APP_VERSION), seed, buildSettings, sectors:[{ name, slug, x, y, defaultSlot, bytes }] }
  allegiances.js                window.UNIVERSE_ALLEGIANCES = [...]        (the t5ss/allegiances list, fetched once)
  sectors/Spinward_Marches.js   window.UNIVERSE_SECTOR_DATA = window.UNIVERSE_SECTOR_DATA || {};
                                UNIVERSE_SECTOR_DATA['Spinward Marches'] = {
                                  name, x, y, milieu, snapshotVersion,
                                  tsv: '…raw TravellerMap tab-delimited text…',
                                  metadataXml: '…raw TravellerMap metadata XML…'
                                };
```

- No `built` key. A sector file is ~50 KB; the universe is ~6 MB.
- `index.js` carries the two things determinism needs: `seed` (the string passed to the
  seeded RNG) and `buildSettings` — the generation-affecting keys of `collectMapSettings()`
  (every key whose name starts with `generation`) as they were when the snapshot was made.
- Loaded on demand by `<script>` injection exactly as before (`UniverseSnapshot.load`).

### 1.2 Building the snapshot (one time, by script)

`utilities/build_universe_snapshot/`:
1. `fetch.js` (Node) — unchanged: writes `universe/raw/<name>.tsv` and `.xml` and
   `universe/allegiances.js`, with a polite delay.
2. `pack.js` (Node, **replaces `build.html`**): for every pair in `universe/raw/`, writes
   `universe/sectors/<slug>.js` with the shape above, then writes `index.js` with sizes,
   `APP_VERSION` read from `js/core.js` by regex, `seed: 'TravellerMagnus'`, and
   `buildSettings` copied from the defaults in `js/io_manager.js` `collectMapSettings()`
   (read the literal defaults by regex, or hard-code the object and keep it in step — note
   which in a comment). No browser is involved.
3. Delete `build.html` and `.tmp/atlas-testing/build-snapshot.cjs`.

### 1.3 Offline importer

Unchanged in intent: `otu_importer.js` reads TSV and XML from `UNIVERSE_SECTOR_DATA` after
`UniverseSnapshot.load(name)`; no `fetch(`; no `travellermap.com`; no delays; no
localStorage cache readers. `UniverseSnapshot.adopt(name, slot)` now:
1. Parses the TSV with the existing T5 tab parser (the same code `importT5Tab` uses —
   extract it into `parseT5Tab(text, slot)` returning `Map<hexId, state>` so both callers
   share it) → **base hexes at sector scale**: `type`, `name`, `allegiance`, `t5Data`,
   `t5Socio`, `t5System`, `beltCount`, `gasGiantCount`, `uwp`, `tradeCodes`, `travelZone`,
   `bases`. This is everything the sector map, the omni-search, trade match and the
   campaign anchors need. It takes milliseconds.
2. Sets them into `hexStates` under `${slot}-${key}`; they are **not** in `overlayHexes`.
3. Records `overlayBase.sectors[] = { name, slot }`; copies routes/borders/regions from the
   XML into the overlay lists as before.
4. Marks the sector's built-cache entries (§1.4) stale if `snapshotVersion` changed.

### 1.4 Systems built on demand (the invisible part)

**One accessor, called by every consumer that needs a full system tree:**

```js
// js/universe_snapshot.js
function ensureSystemBuilt(hexId) {
    const state = hexStates.get(hexId);
    if (!state || state.type !== 'SYSTEM_PRESENT') return state;
    if (state.mgtSystem || window.overlayHexes.has(hexId)) return state;   // built already, or the referee's own
    if (!UniverseSnapshot.baseSectorFor(hexId)) return state;              // not a chart hex
    const cached = _builtCache.get(hexId);                                  // in-memory copy of the IndexedDB baseBuilt store
    if (cached && cached.buildVersion === UNIVERSE_INDEX.buildVersion && cached.snapshotVersion === UNIVERSE_INDEX.snapshotVersion) {
        Object.assign(state, cached.state);
        return state;
    }
    _withSnapshotGeneration(() => _buildOneMgtHex(hexId));                  // §1.4a
    void dbManager.putBuilt(hexId, { state: stripHexViewState(state), buildVersion, snapshotVersion }); // fire-and-forget cache
    return state;
}
```

**1.4a Determinism — `_withSnapshotGeneration(fn)`.** `_buildOneMgtHex` reads the global
`masterSeed`/`rng` (`reseedForHex(hexId)`) *and* the generation settings on `window`
(`generationStarportMod`, `generationRttTL`, … — every key `collectMapSettings()` emits
starting with `generation`). The referee's own seed and settings must not change a chart
system, so the wrapper: saves `masterSeed` and the current values of those `window`
keys → sets `masterSeed = UNIVERSE_INDEX.seed` and the keys from `UNIVERSE_INDEX.buildSettings`
→ runs `fn` → restores everything in `finally`. Trace logging (`tSection`/`tResult`) stays
as it is; if logging is enabled the build appears in the log like any generation.

**1.4b Where it is called (all of them, nothing else needs trees):**
- `SystemInspector.openForHex` and `refresh` (before `normalizeSystem`)
- `SystemViewer.open` (orbit view) — *this file belongs to Johnny; add the one call at the
  top of `open(hexId)` and nothing else*
- `openHexEditor` (hex editor) and `SystemEditor.open`
- `HtmlExporter`/`ObsidianExporter` per-hex page builders, before `normalizeSystem`
- `CampaignAtlas.recordsForBody` / `SystemViewer.locationEntries` callers that resolve a
  `bodyKey` (through the inspector, so covered by the first item)
- Approach/Surface viewers (through the orbit view)
- `captureSubsector` does **not** need trees (it draws from mainworld fields) — do not add it.

**1.4c Invisible.** A single build is a few milliseconds, synchronous, before the panel
renders — there is nothing to show. Two things keep it that way:
- **Prefetch neighbours:** after `openForHex(id)` renders, schedule
  `requestIdleCallback(() => for each system within 2 hexes: ensureSystemBuilt(id))`
  (fallback `setTimeout(…, 50)`), one hex per idle slice, so the next click is already built.
- **Exports** build many systems in a row: they already yield between pages
  (`await new Promise(r => setTimeout(r, 0))`) and already show their own progress bar; the
  per-hex build rides inside that. No new UI.
- Never `showWorkStatus` for a build. Never a toast. If a build throws, the hex stays at
  sector-scale data, the error is logged with the hexId, and the inspector shows the
  mainworld as it does for any system without a tree.

**1.4d Cache.** IndexedDB store `baseBuilt` (DB_VERSION 5), key hexId, value
`{ state, buildVersion, snapshotVersion }`. Read into `_builtCache` lazily per sector on
first `ensureSystemBuilt` for that sector (one cursor over the key range `${slot}-`), not
at boot. Cleared by `Clear Canvas`, by `purgeSectorSlots` for the purged slots, and ignored
(then overwritten) on version mismatch. It is **never** in saves, overlays or files — it is
reproducible.

**1.4e What "base" means for comparisons now.** `UniverseSnapshot.baseState(hexId)` returns
the sector-scale state from the TSV (built on the fly from the parsed row, cheap). For
`sameAsBase` (Attach snapshot) and the hex editor's per-field "Chart" revert:
- Sector-scale fields (name, UWP, bases, zone, allegiance, PBG, trade codes) compare and
  revert against the TSV row.
- Tree fields (orbits, worlds, moons): if the live hex has `mgtSystem`, compare against a
  fresh `_withSnapshotGeneration` build of that hex into a scratch object (do not touch
  `hexStates`); Attach shows progress through `showWorkStatus` because it may build
  hundreds (this is a one-time referee action, not the invisible path). **Known effect,
  stated in the Attach confirm text:** a hex that matches is dropped from the overlay and
  its tree will be the chart's build from then on.

**1.4f Own maps.** `base` is null; `ensureSystemBuilt` returns immediately (the second
guard). The "Build systems" action stays for own maps and is hidden on universe maps (a
chart hex builds itself).

---

## 2. The overlay

### 2.1 Document

```js
{
  format: 'asab-overlay', schemaVersion: 3, appVersion,
  saveId,                         // uuid per save
  campaignId,                     // uuid, stable for this campaign (sync-ready)
  base: null | { milieu, snapshotVersion, sectors: [ { name, slot } ] },
  grid: { width, height },
  hexes: { [hexId]: state | { deleted: true, rev, updatedAt } },   // overlay hexes only
  routes, routeDefinitions, autoRouteCounter,
  borderDefinitions, hexBorderAssignments, borderPaths,            // borderPaths gain sectorNum (bugfix A15)
  regionDefinitions, regionPaths,
  allegianceDefinitions, hexAllegianceAssignments,                  // new (bugfix A4)
  sectorNames, subsectorNames, sectorReview,                        // new in file (bugfix A6, B15b)
  settings, campaignTime,
  campaignAtlas, campaignAssets                                     // as today; v2 schema when the campaign plan lands
}
```

Every overlay hex carries `rev` (integer, +1 per change) and `updatedAt` (ISO), stamped by
`stripHexViewState` at save time. A base hex that the referee deletes becomes a tombstone so
the merge removes it.

### 2.2 In memory

`hexStates` stays the merged Map. Two additions in `core.js`:

- `overlayHexes: Set<hexId>` — which hexes are the referee's (loaded from the overlay,
  grown by `markChanged`).
- `markChanged(action, opts)` — **the renamed `saveHistoryState`.** Same signature so the
  ~200 call sites do not change. It: adds `opts.hexIds` to `overlayHexes` and the dirty set;
  sets dirty flags for `routes / borders / regions / allegiances / names / settings /
  campaign`; schedules the autosave; logs `[Change] <action>`. It never clones anything.
  `saveHistoryState` remains as an alias until the last caller is renamed, then is deleted.

Removed: `undoStack`, `redoStack`, `applyHistoryPatch`, `captureHistoryInverse`, the
Ctrl+Z/Ctrl+Shift+Z branch, `_restoreRouteDefinitions`, `CampaignAtlas.restoreHistory`, the
undo-stack walk in `CampaignAtlas.reachable()`, the `undoStack.pop()` calls in route
generation, `HISTORY_LIMIT`, and `directives/large_campaigns.md`.

### 2.3 Merge at load

1. Read the overlay (IndexedDB working copy, or a file, or a save slot).
2. For each `base.sectors[i]`: `await loadBaseSector(name)` (script injection; progress
   "Loading Spinward Marches (3 of 35)"), then for each `built.hexes[key]` set
   `hexStates.set(`${slot}-${key}`, clone)`.
3. Apply overlay hexes: tombstone → `delete`; else `set`. Fill `overlayHexes`.
4. Apply overlay metadata lists wholesale.
5. Only now swap the globals. **Everything above runs on a staging object**; the live map is
   replaced in one step after the whole file validated (closes bugfix A12).

### 2.4 Working copy (IndexedDB, `DB_VERSION 3`)

| store | key | value |
|---|---|---|
| `overlayHexes` | hexId | state or tombstone |
| `appState` | name | each overlay metadata list, `base`, `grid`, `settings`, `campaignTime`, `campaignAsset:<id>` payloads |
| `campaign` | per the campaign plan §3.1 | records/links/journal (when that lands) |
| `saves` | `auto:<n>` / `manual:<uuid>` | `{ meta, blob }` (§3) |

Autosave of the working copy: 2 s debounce as today, but it writes **only the dirty hexes
and dirty lists, in one transaction**, with `oncomplete/onerror/onabort` handled and a
sticky error toast on failure (closes bugfix A2). `syncAllHexes` (clear + rewrite) is
deleted. A failed open or read at boot never "starts fresh" silently: the map stays empty,
a toast says why, autosave is blocked until the referee loads or clears on purpose
(closes A3). `navigator.storage.persist()` is requested once so the browser does not evict.

**Migration v2 → v3:** the old `hexStates` store becomes `overlayHexes` with `base: null`
(own-map mode); nothing else changes, the map opens as before. If the referee's current
universe map was imported from the API, a one-time **"Attach snapshot"** action matches
sector slots to snapshot sectors by name, drops every overlay hex that is deep-equal to the
base hex, and records `base`. Hexes that differ (edited, or generated before a change in the
engines) stay in the overlay and are listed in the result ("312 hexes kept as yours").

---

## 3. Saves

### 3.1 Autosave slots

Five slots, a ring. A slot is a full overlay serialization (§2.1) gzip-compressed with
`CompressionStream` when available (fallback: plain JSON), stored in `saves` as
`{ meta: { kind:'auto', n, at, trigger, label, bytes, hexCount, sectorCount, base, assetIds }, blob }`.

Triggers:
- **Timed:** every 10 minutes while the tab is open, *only if* something changed since the
  last slot (`markChanged` sets a flag).
- **Before a bulk action:** `Saves.beforeBulk(label)` is awaited by: import sector(s),
  Clear Canvas, Clear Sector, insert/remove column/row, Mongoose build, any generate over
  more than one hex, XML metadata import, rules import, restore, Attach snapshot. The label
  becomes the slot's trigger text: "Before: Import Deneb".
- The oldest slot is overwritten. **Keep** copies a slot to a manual save so it leaves the
  ring.

Not a trigger: `beforeunload` (async writes do not survive it; the working copy is already
continuous).

### 3.2 Manual saves

Named slots in the same store (`manual:<uuid>`), unlimited within storage. **Export file**
writes the overlay JSON (gzip optional) — the existing multipart split stays for own-map
monsters. **Load file** accepts v1/v2 full maps (treated as overlay with `base: null`) and
v3 overlays.

### 3.3 Saves tray (nav footer, icon `clock-rotate-left`, shortcut none)

- Two lists: **Autosaves** (newest first: time, trigger, hex/sector counts, size) and
  **Saved games** (name, time, size). Current base and snapshot version shown at the top.
- Row actions: **Restore**, **Keep** (autosave → manual), **Rename**, **Export file**,
  **Delete** (manual only; toast "Deleted *Before the war* — Restore" for 10 s via a
  tombstone in the store, then gone).
- **Restore** first writes an autosave of the current state ("Before: Restore *X*"), then
  loads the slot through §2.3. Toast: "Restored *X* — the state before this is in
  Autosave 1." No confirm dialog; the autosave *is* the confirmation.
- Storage meter from `navigator.storage.estimate()`; a warning band at 80 %.
- Every action here shows progress in the existing `showWorkStatus` bar for anything over
  ~300 ms.

### 3.4 Campaign assets and saves

Image payloads are stored once by id, outside the slots. The GC keep-set is: ids referenced
by the working copy, plus `meta.assetIds` of every slot (so a restore never finds a missing
portrait), plus staged uploads. A deleted manual save releases its ids on the next GC.

---

## 4. What "delete" means now

With no undo, destructive actions use the two tools above:
- **Bulk** (clear, import, generate-over-selection): `beforeBulk` autosave; the toast names
  the slot.
- **Single record / link / journal entry** (campaign plan): a **tombstone** (soft delete,
  also what sync needs); toast "Deleted *X* — Restore"; purged after 90 days by the GC.
- **Single hex edit:** no safety net beyond the timed autosave — the same as every editor
  without undo. The hex editor gains a per-field "revert to base" when a base hex exists
  (the base value is one lookup away), which covers the common "oops" for universe maps.

`confirm()` remains only for Clear Canvas and Clear Sector, and both now say which autosave
slot will hold the previous state.

---

## 5. Order of work (this is bugfix Step 2)

1. `markChanged` alias + remove stacks/handlers/patch code; delete
   `large_campaigns.md`; `CampaignAtlas.reachable()` without stacks. *(small; everything
   still works)*
2. DB v3: `overlayHexes`, per-dirty-key autosave in one transaction with error surfacing,
   boot failure handling, `storage.persist()`. Migration from v2. *(closes A2, A3)*
3. Overlay file format v3 writer/reader with staging-then-swap load; allegiances, names,
   review, counter in it. Accept v1/v2. *(closes A4, A6, A12, B15a-b)*
4. Saves store, autosave ring, `beforeBulk` at every bulk call site, manual saves, the
   Saves tray.
5. Snapshot builder (`fetch.js`, `build.html`, `index.js`), `universe/` committed.
6. `loadBaseSector`, merge-at-load, offline importer, "Attach snapshot", hex-editor
   "revert to base". Remove `tsvCache` and the API code paths.

Checks after each step are listed in `directives/bugfix_pass.md` Step 2 and here:
- After 1: every former Ctrl+Z call site still saves; `grep -c saveHistoryState js/*.js`
  trends to 0.
- After 2: unplug the DB mid-save (DevTools → Application → delete database while editing)
  → sticky toast, no silent loss; reopen → map intact from the last good write.
- After 3: v0.13 `solo_6.json`, a v0.18 map, and a v3 overlay all load; save/load round
  trip is byte-stable for the overlay.
- After 4: import a sector → "Before: Import …" appears in Autosaves; Restore it →
  the import is gone and "Before: Restore" exists.
- After 6: fresh profile, Import → Spinward Marches, no network → systems present with
  orbits; edit one world; reload → edit present, `overlayHexes.size === 1`.

---

## 6. Delighter: cache everything (decided 2026-10-02)

Johnny's rule: **local-cache as much of the experience as possible.** Nothing the app has
fetched, parsed, generated, baked or rendered once is ever done again on the same machine
unless its inputs changed. Second visits are instant; the app works without a network; the
referee never sees a loading state for something they have already seen.

### 6.1 What is redone today, and the cache that stops it

| Today | Cost | Cache (store · key · value) | Invalidated by | Prefetch |
|---|---|---|---|---|
| `js/solo_6_data.js` (17 MB), `names.js` (0.8 MB), `otu_system_data.js` (0.5 MB) parsed by `<script>` on **every boot** (`hex_map.html:112-121`) | seconds of parse before the map appears | Move Solo 6 and Foreven into `universe/sectors/` as input snapshots (§1.1) loaded on demand; `names.js` and `otu_system_data.js` become on-demand scripts loaded the first time a generator or the inspector needs them, then held in memory | file version in `UNIVERSE_INDEX` | none needed |
| Universe sector files (§1.1) | ~50 KB script per sector, network on the hosted version | Service worker runtime cache (§6.3) on the hosted version; `file://` reads from disk anyway | `snapshotVersion` | adjacent sectors of any attached sector, at idle |
| System trees (§1.4) | ms per hex, repeated per visit | `baseBuilt` IndexedDB store (§1.4d) | `buildVersion`, `snapshotVersion` | systems within 2 hexes of the inspected one, at idle (§1.4c) |
| Planet bakes: colour + height cube maps per world, GPU only, redone on every orbit-view open (`planet_gl.js:916-1033`) | 6 faces per body, tens of ms each; the first second of an orbit view is bakes | `planetBakes` store · `profile.id` · the six face bitmaps as `ImageBitmap`/`Blob` (PNG, via `canvas.toBlob` from `readPixels` at `planet_gl.js:1188`) plus `world.stats` | `profile.id` already encodes hex, name, type, UWP, diameter, AU, PD (and, after campaign plan §7.7, terrain and palette ids); add `PlanetGL.VERSION` | on inspector open, bake the mainworld and its moons at idle before the orbit view is asked for |
| Surface map sheets (diamond maps) rendered per view (`system_inspector.js:507-552`, hidden by the scanner animation) | ~100–300 ms per sheet | `surfaceSheets` store · `profile.id + ':' + projection + ':' + size` · PNG `Blob` | same as bakes, plus `PlanetRenderer.VERSION` | the inspected world's sheet when its dossier opens; the scanner still plays on first render, and on a cache hit the sheet simply appears sharp (no fake delay) |
| Campaign image thumbnails/display | already cached in IndexedDB (`campaignAsset:*`) | — | — | — |
| Google Fonts Inter + Orbitron (`hex_map.html:11`) | network on every boot; fallback fonts offline, so the UI changes shape without a network | **Self-host** under `assets/fonts/` with `@font-face` + `font-display: swap`; delete the Google link | — | — |
| Omni-search / campaign word index rebuilt from scratch at boot and per keystroke | O(records) per query | In-memory `CampaignIndex` (campaign plan §2.7) rebuilt incrementally from `campaign:changed`; persisted to `appState.searchIndex` and rehydrated at boot, rebuilt only if `rev` sums differ | per-document `rev` | — |
| Exports' subsector PNG captures (`captureSubsector`) | hundreds of ms each, per export | `captures` store · `sectorNum:subsector:hash(options + max hex rev)` · PNG `Blob` | any hex `rev` in the subsector | — |
| Snapshot parse (`JSON` inside the sector script) | once per session | the sector script is already cached by the browser's HTTP cache on the hosted version and by disk on `file://` | — | — |

### 6.2 Policy

- **One module, `js/cache.js`** (new; nothing in `js/` does this): `Cache.get(store, key)`,
  `Cache.put(store, key, value, { version, bytes })`, `Cache.touch`, `Cache.evict(store,
  budget)`, `Cache.sizes()`. All caches share it. Values are structured-cloneable (`Blob`,
  `ImageBitmap`, plain objects). Every record carries `{ version, bytes, lastUsed }`.
- **Budgets per store** (LRU by `lastUsed`): `baseBuilt` 200 MB, `planetBakes` 300 MB,
  `surfaceSheets` 100 MB, `captures` 100 MB. `Cache.evict` runs after each put that pushes a
  store over budget, dropping least-recently-used records until under.
- **Never block on a cache.** Every read is `await`ed off the render path with the
  uncached path as the fallback; a cache miss costs exactly what today costs. A cache
  error (quota, corruption) logs once per store per session and disables that store for
  the session — never a toast, never a broken feature.
- **Never cache referee data here.** Saves, overlays and files are the truth; everything in
  §6 is reproducible from them and can be deleted at any time without loss. The Saves tray
  gets a **Storage** section listing each cache with its size and a *Clear* button, and a
  *Clear all caches* — separate from saves, with no confirm (nothing can be lost).
- **`navigator.storage.persist()`** is already requested (§2.4), so caches are not evicted
  by the browser behind the referee's back.
- **Idle prefetch** uses `requestIdleCallback` (fallback `setTimeout 50`), one item per
  idle slice, cancelled when the camera moves to a different subsector, so prefetch never
  competes with a drag.

### 6.3 The hosted version: a service worker (not for `file://`)

When served from Pages (`_redirects` already routes `/` to `hex_map.html`), `sw.js`:
- **Precache** the app shell on install: `hex_map.html`, `style.css`, every `js/*.js` the
  page loads at boot, `assets/fontawesome/**`, `assets/fonts/**`, `universe/index.js`,
  `universe/allegiances.js`. Versioned by `APP_VERSION`; a new version installs in the
  background and a toast offers "Reload for v0.19" (never a forced reload mid-session).
- **Runtime cache, cache-first,** for `universe/sectors/*.js` (immutable per
  `snapshotVersion`) and `assets/starports/**`.
- **Network-only** for nothing — the app has no API. Offline, everything the referee has
  opened before works; a sector never opened says "not in this copy" exactly as `file://`
  does today.
- Registration is guarded: `if (location.protocol.startsWith('http') && 'serviceWorker' in navigator)`.
  On `file://` nothing changes.

### 6.4 Order of work

This is **Step 2b**, after Step 2's fix list (R1–R23) passes and before Step 3 (Grace):
1. `js/cache.js` + Storage section in the Saves tray.
2. Boot data on demand (Solo 6, Foreven → snapshots; `names.js`, `otu_system_data.js` lazy).
   *Check:* boot on a cold profile shows the map in under one second on a laptop; DevTools
   shows no 17 MB script.
3. Self-hosted fonts. *Check:* offline reload keeps Inter/Orbitron.
4. `baseBuilt` already exists (§1.4d) — move it onto `Cache`.
5. `planetBakes` and `surfaceSheets`. *Check:* open a system's orbit view, close, reopen →
   no bake time (`showMapPerf`-style counter in the orrery reads 0 bakes); open the dossier
   twice → the second sheet appears sharp immediately.
6. Idle prefetch (neighbour systems, mainworld bakes, adjacent sectors).
7. `captures` for exports. *Check:* exporting the same subsector twice takes half the time.
8. Service worker for the hosted build. *Check:* load on Pages, go offline, reload → app
   opens; previously opened sectors work.
