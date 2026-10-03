# Persistence v2 — no undo, rolling autosaves, base + overlay, local universe snapshot

**Status:** SPEC, agreed in principle 2026-10-02, not implemented. Supersedes
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

### 1.1 Base snapshot files

```
universe/
  index.js                              window.UNIVERSE_INDEX = { milieu:'M1105', snapshotVersion, builtAt,
                                          buildVersion (APP_VERSION), masterSeed, sectors:[{ name, x, y, defaultSlot, bytes }] }
  sectors/Spinward_Marches.js           window.UNIVERSE_SECTOR_DATA = window.UNIVERSE_SECTOR_DATA || {};
                                        UNIVERSE_SECTOR_DATA['Spinward Marches'] = {
                                          name, x, y, milieu, snapshotVersion,
                                          tsv:  '…raw TravellerMap tab-delimited text…',
                                          metadataXml: '…raw TravellerMap metadata XML…',
                                          built: { hexes: { 'A-0101': state, … }, buildVersion, seed, sectorName, subsectorNames }
                                        };
```

- Keys inside `built.hexes` are **sector-local** (`<subsector>-<QQRR>`); the slot prefix is
  added at load (`${slot}-${key}`). So a base sector can sit in any slot, and the files do
  not depend on the grid.
- States inside `built.hexes` are exactly what `_storeMgtBuild` writes today
  (`mgtSystem`, `mgt2eData`, `mgtSocio`, counts, name, allegiance, …) with view state
  stripped and **no** `disclosure`, `notes`, `custom_ui`, `manualBgColor` (those are overlay
  by definition).
- Loaded on demand by injecting `<script src="universe/sectors/<file>.js">` — the same
  mechanism `solo_6_data.js` uses today, split per sector so a 7×5 campaign loads 35 files
  of ~0.5 MB rather than one of 60 MB. Works from `file://` and from Pages. Loaded sectors
  are cached in memory for the session; `UNIVERSE_SECTOR_DATA[name]` is frozen.
- The raw `tsv` and `metadataXml` are kept so the importer can re-run (own-map mode can
  "start from the Marches without the build"), and so a future snapshot rebuild has its
  inputs without the API.

### 1.2 Building the snapshot (one time, by script)

`utilities/build_universe_snapshot/`:
1. `fetch.js` (Node): for every sector in `js/universe_data.js`, fetch
   `data/<name>/tab?milieu=M1105` and `api/metadata?…` from travellermap.com with a polite
   delay, write `universe/raw/<name>.tsv` and `.xml`. Run once; re-run only to refresh.
   (Read Far Future Enterprises' fair-use policy before publishing the result anywhere.)
2. `build.html` (browser, because the engines are browser modules that use `window`):
   loads the app's scripts, iterates the raw files, places each sector in its
   `defaultSlot` on the 16×8 grid, runs the existing Mongoose build with a fixed
   `masterSeed` recorded in `index.js`, strips view state, re-keys to sector-local, and
   downloads `sectors/<name>.js`. Progress through the existing `showWorkStatus` bar. A
   Node runner can replace this later if the engines are shimmed; the page is the sure path.
3. `index.js` is written last with sizes and the build version.

The seed is fixed and `reseedForHex(hexId)` is hexId-based, so two builds of the same
snapshot version are identical. A new app version that changes generation makes a new
`snapshotVersion`; overlays record which version they were made against (§2.1) and the
loader warns when they differ (it still loads).

### 1.3 Offline importer

`otu_importer.js` keeps its UI (pick sectors, place them in slots) and loses the network:
`fetchSectorTsv`/metadata read from `UNIVERSE_SECTOR_DATA` after `loadBaseSector(name)`;
the `tsvCache` store and the API pauses go. Import of a sector = record it in
`overlay.base.sectors`, merge its built hexes into `hexStates`, copy its routes/borders into
the overlay lists. No Mongoose build runs in universe mode. The allegiance list
(`t5ss/allegiances`) is snapshotted too (`universe/allegiances.js`).

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
