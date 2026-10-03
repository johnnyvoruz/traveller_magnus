# Bugfix Pass — triage and execution order

**Status:** TRIAGED 2026-10-02, fixes not started. Precedes the campaign manager work
(`directives/campaign_manager_plan.md`).
**Method:** five independent read-only reviews of the whole `js/` tree (persistence/undo,
map input & render, overlays, panels, fog-of-war + exporters), each asked for correctness
defects only with a concrete failure scenario. Duplicates merged. Two headline findings were
re-verified by hand before being listed as confirmed (A1, fog-of-war semantics).
**Not in scope:** style, naming, performance-only, missing features. Those belong to the
campaign plan.

Tier A is data loss or corruption. Tier B is wrong behaviour the referee can see. Tier C is
latent. Within a tier the order is the suggested fix order. `confirmed` means the full code
path was read; `plausible` means the defect is real in the code but the trigger was not
exercised.

---

## 0. Decisions taken in this pass

### 0.1 Fog of war is paused, not removed

What it does today, in one paragraph: Player Knowledge tags on a hex change **only** what a
*Players' export* contains (Export panel → Version "Players — fog of war"). The referee's
map, inspector and referee export never change, and nothing on the map shows a hex has tags.
The seven tags are **independent checkboxes, not a ladder**: an untouched hex means
"players see everything"; ticking one box on it means "players see *only* that box";
unticking the last box, or unticking *Unknown*, snaps the hex back to everything. So the
natural gesture ("hide a bit more") does the opposite (`disclosure.js:155-166`). On top of
that the export leaks (F3, F4, F6, F7 below) and tagging a vacant hex manufactures a phantom
system page in *both* exports (F2).

**Action (small, reversible):** a Settings flag `Player knowledge (experimental)`, default
off, that hides the four entry points — the `D` nav button and tray, the action-bar
"Player Knowledge" menu, the two context-menu items, and the "Players — fog of war" option
in the Export panel. Data stays on the hexes; `DisclosureModel` stays loaded; nothing else
changes. It returns in the campaign plan's Player Pack phase with ladder semantics, a live
"view as players" toggle (`setMapDisclosure` already supports it) and the leak fixes.

Findings parked for that phase (all from `js/disclosure.js`, `html_exporter.js`,
`obsidian_exporter.js`, `renderer.js`, `export_core.js`):

| # | Defect | Where | Sev |
|---|---|---|---|
| F1 | Independent-tag semantics: first tick narrows from "everything" to one box; last untick / untick Unknown restores everything | `disclosure.js:88, 155-166` | high |
| F2 | Tagging a vacant hex creates `{type:'BLANK'}`; both exporters skip only `EMPTY`, so phantom "Unnamed (0304)" pages appear, even in the Referee export | `disclosure.js:54-57`, `html_exporter.js:954`, `obsidian_exporter.js:548` | high |
| F3 | Obsidian hub YAML writes the full mainworld UWP at every level | `obsidian_exporter.js:230` | high |
| F4 | Obsidian world/moon pages print `**UWP:**` and the moon-table UWP with no (g) gate | `obsidian_exporter.js:413, 459, 492` | high |
| F5 | HTML index hrefs are built from `d.hex`, which is blanked without tag (a) → unreachable pages | `html_exporter.js:708, 736, 742` | med |
| F6 | Travel zone withheld in text (reads as Green) but still drawn on the map PNG and written to Obsidian YAML | `export_core.js:551-560`, `renderer.js:1415`, `obsidian_exporter.js:406` | med |
| F7 | Map PNG draws routes into *Unknown* hexes | `renderer.js:1061-1170` | med |
| F8 | Map PNG honours live filter colours and `hideNoPlanetSystems`, against §9.3a | `renderer.js:1310-1385, 1456` | med |
| F9 | Star dot drawn without tag (a) | `renderer.js:1311, 1380` | low |
| F10 | Obsidian hub shows allegiance and hex without tag (a) | `obsidian_exporter.js:231-240` | low |
| F11 | `onDone` fires even when `downloadBlob` returned false | `html_exporter.js:1080`, `obsidian_exporter.js:707` | low |
| F12 | Stars with no `sType`/`sClass` print "undefined" | `obsidian_exporter.js:210, 328, 344`, `html_exporter.js:466` | low |
| F13 | Right-click "Assign Player Disclosure" acts on the selection/inspected hex, not the right-clicked hex (same convention as B6); modal has no Default button | `disclosure.js:314` | low |

### 0.1a Decisions, round 2 (referee, 2026-10-02)

1. **Undo is removed.** No stacks, no Ctrl+Z, no patches. `saveHistoryState(action, opts)` —
   already called before every mutation and already the autosave trigger — becomes
   `markChanged(action, opts)`: it schedules the autosave and records `opts.hexIds` as dirty.
   Call sites stay as they are. `applyHistoryPatch`, `captureHistoryInverse`, the stacks, the
   Ctrl+Z/Ctrl+Shift+Z handler, `CampaignAtlas.restoreHistory` and the stack walk in
   `CampaignAtlas.reachable()` go. `directives/large_campaigns.md` is superseded by
   `directives/persistence_v2.md`.
   **Findings closed by this decision:** A5, A7, A8, A9, A10 (the undo half), A16, B4,
   B12c, B15c. A12 remains (validate before clearing).
2. **Safety net = rolling autosaves + manual saves**, like a game: 5 rotating autosave slots
   (time-based and *before every bulk action*), named manual slots, a Saves tray with
   Restore (which autosaves first). Specified in `directives/persistence_v2.md`.
3. **Base + overlay, now.** The charted universe becomes a read-only local snapshot (raw
   TravellerMap TSV + metadata XML **and the Mongoose-built systems**, per sector, built once
   by a script, loaded on demand by `<script>` injection so `file://` keeps working). The
   importer stops calling the travellermap.com API; `tsvCache` goes. Everything the referee
   changes is the overlay, and the overlay is what autosaves, manual saves and the JSON file
   hold. "Build your own map" is simply an empty base.
4. **Allegiances are saved** (A4 stands).

### 0.1b Decision: the "grace" step joins the bugfix pass (referee, 2026-10-02)

Nothing on the map or in the chrome should **pop**. The map's LOD text fade was disabled
because it cost frames; the cause is that every fade frame ran the full `draw()` →
`_rebuildPanCache()` repaint (`renderer.js:430, 436, 2049-2050`), not the fade itself.
Step 3 below replaces that with a presentation-only dissolve and gives the DOM chrome one
show/hide convention. The design is in §G at the end of this file; the campaign plan's
§6.1/§6.2 inherit it.

### 0.2 Dead code found (decide: wire up or delete — not touched in this pass)

- Allegiance Manager window handlers (`allegiances.js:315-436`) target `#allegiance-window-list`,
  which does not exist in `hex_map.html`. Unreachable; also broken (no hex persistence, Clear
  not undoable).
- `autoDiscoverAllegianceCodes` and `autoPopulateAllegianceFromBorders` have no callers.
- `ApproachViewer.open` is never called outside `js/archive/`; `approach_viewer.js` and
  `surface_viewer.js` are unreachable today (their defects are listed in Tier C as latent).

### 0.3 File in flux

`js/system_viewer.js` changed on disk during the review (5295 → 5392 lines, 18:06
2026-10-02). Findings in that file (B18, C7, C8, C9) carry line numbers that must be
re-checked, and the file is not edited in this pass until the owner of that change says so.

---

## Tier A — data loss or corruption

| # | Defect | Where | Scenario | Conf |
|---|---|---|---|---|
| A1 | **Hex editor Save never persists or records undo.** No call to `saveHistoryState`, `saveHexes`, `scheduleSyncAll` or `dbManager` anywhere in the file; same for the inline system-tree editors, solar-day popup and gas popup. The Map watch in `renderer.js:116` only invalidates draw caches. | `hex_editor.js:3077-3342, 3352+` | Edit a UWP or notes, Save ("Changes saved successfully"), reload → gone, unless another action happened to trigger a full sync. Ctrl+Z cannot undo it. | confirmed (re-verified by grep) |
| A2 | **`syncAllHexes` clears in one transaction and rewrites in a second, unwatched one.** No `oncomplete/onerror/onabort`; `try/catch` only catches sync throws. Every other `save*` is fire-and-forget. | `db_manager.js:181-240` | Quota hit during the put loop → clear already committed, write aborts silently → IndexedDB holds zero hexes; reload starts empty. | confirmed |
| A3 | **A failed startup read "starts fresh" and the next autosave overwrites the stored map.** Hex cursor has no `onerror` (promise never settles → boot hangs); `indexedDB.open` has no `onblocked`. | `db_manager.js:32-53, 141-166` | Transient read error → empty map → first edit runs `syncAllHexes` → saved campaign destroyed. | plausible / high impact |
| A4 | **Allegiances are never persisted.** `dbManager.saveAllegianceDefinitions/Assignments` do not exist (every `?.()` call is a no-op: `allegiances.js:56, 128, 351, 366, 371, 382, 412, 432, 530, 635, 735`); not in the save file; not reset on load or Clear Canvas. `state.allegiance` on hexes does survive. | `db_manager.js:562-589`, `io_manager.js:175-193, 456-512, 728-914`, `allegiances.js:751` | After any reload the Assign Allegiance modal shows "No allegiance codes defined yet"; names, colours and code groups lost. Loading another map keeps the old map's allegiances in memory. | confirmed |
| A5 | **Undo/redo write only hexes and routes to IndexedDB.** Borders, border paths, regions, region paths, allegiances are restored in memory only; no `scheduleSyncAll`; no `invalidateBorderNamesCache`. | `keyboard_shortcuts.js:233` (`applyHistoryPatch` `core.js:317-337`) | Delete border, Ctrl+Z (reappears), reload → gone again. | confirmed |
| A6 | **Loading a map never saves sector/subsector names or `sectorReview`**; `scheduleSyncAll` does not cover them; `purgeSectorSlots` deletes them without saving. `sectorReview` is also not in the save file and not reset on load. | `io_manager.js:904-913`, `db_manager.js:247-261`, `sector_manager.js:299-300` | Load map B over A, reload → A's sector names on B's hexes. Clear sector 3, reload → its name is back. | confirmed |
| A7 | **Undoing "Load Map JSON" mixes two maps.** The load's undo entry carries only `{campaignAtlas, includeRouteDefinitions}`; the stack is not cleared on load. | `io_manager.js:721-724`, `campaign_atlas.js:122` | Load B over A, Ctrl+Z → A's campaign and route *definitions* with B's hexes and legs; further Ctrl+Z replays A's hex patches onto B. Persisted. | confirmed |
| A8 | **Undoing an ASAB system import does not restore the overwritten system** — `commit` is passed no `hexIds`. | `io_manager.js:2494-2496` | Import over an existing system, confirm, Ctrl+Z ("Undid: Import ASAB System") → only the atlas reverts; the system is gone. | confirmed |
| A9 | **Fill & Save snapshots undo after the preview has already mutated the live hex** (`_preview` → `_generateAndCommit` edits in place; the original lives only in `_previewOriginalState`). | `system_editor.js:2595, 2650` | Edit → Preview → Save → Ctrl+Z restores the last preview; for Create, undo never returns the hex to empty. | confirmed |
| A10 | **Region rename rewrites `state.cluster` on every hex but saves only definitions/paths, records no undo**, silently merges on name collision, and leaves `filters.cluster` rules pointing at the old name. | `regions.js:123-139` | Rename "Region 3" → "Spinward", reload → definition says Spinward, hexes say Region 3 → region shows 0 hexes. | confirmed |
| A11 | **Background Mongoose build is never cancelled by load / Clear Canvas / import** (`_mgtBuildCancel` set only inside the file); Stop and the progress bar are shared with BTN generation (Stop cancels both; build's `finally` hides BTN's bar; BTN's Dismiss sets the build's cancel flag). | `macro_orchestrator.js:420-499`, `ui_menus.js:2556-2617` | Start a build, load another map → the loop keeps writing Mongoose systems into the *new* map's matching hexes, saved, no undo entry. | confirmed |
| A12 | **An error mid-load leaves a half-loaded map that then autosaves**: the campaign is committed and the undo entry/`scheduleSyncAll` armed *before* `_applyLoadedMapData`, which clears `hexStates` before validating e.g. `hexBorderAssignments` pairs or null `borderDefinitions`. | `io_manager.js:721-733, 795`, `campaign_atlas.js:121-125` | Malformed file → "Error loading map file" → 2 s later the partial state overwrites the autosave. | plausible / high impact |
| A13 | **Clear Canvas races an in-flight sync**: `clearDB` cancels the timer but not a sync between its clear and its put; `hexStates` is emptied only after `await clearDB`. | `io_manager.js:464-488`, `db_manager.js:218-240, 454` | Large map, Clear Canvas during a sync → old hexes written back → reload resurrects the map. | plausible (narrow window) |
| A14 | **Every sector XML import deletes user-created empty border and region slots** (`isUsed` counts only hexes/paths/codes; all unused definitions after the first are spliced off). Not undoable. Fires on *every* XML import. | `borders.js:89-106`, `regions.js:57-70`; callers `io_manager.js:2298`, `borders.js:1525` | Add borders "Aslan Frontier" and "Zhodani Buffer" (no hexes yet), import one sector XML → both gone. | confirmed |
| A15 | **Border paths are not stored per sector** (`{rawPath, labelPos, allegianceCode}`, no slot), so metadata export writes every stored path of a border into whichever sector is exported. Regions key paths `slot:label` correctly. | `borders.js:780-781`, `io_manager.js:1359-1369` | Import Marches (slot 1) and Deneb (slot 2) with a Third Imperium border; export slot 1 → Deneb's polygon in the Marches file, read as slot-1 hexes. | confirmed |
| A16 | **"Not undoable" actions leave the old stack in place**: TSV sector import and Clear Sector record no patch and do not clear `undoStack`/`redoStack` (only `persistGridChange`, `clearCanvas` and grid edits do). | `io_manager.js:1760-2033`, `sector_manager.js:286-304` | Edit `1-A-0101`, import a TSV into slot 1, Ctrl+Z → the pre-edit hex overwrites the imported world. After Clear Sector, an older `routes:true` patch resurrects that sector's routes. | confirmed |

---

## Tier B — wrong behaviour the referee can see

| # | Defect | Where | Scenario | Conf |
|---|---|---|---|---|
| B1 | **Boot failure leaves the nav rail and search permanently `inert` with no error.** The 14 s failsafe only reveals the canvas; `inert` is cleared only at the end of `setupNavigation`. Triggers: `indexedDB.open` blocked by another tab (no `onblocked`), hex cursor error (A3), any `setup*()` throw. | `input_init.js:769-805`, `hex_map.html:992-1001`, `db_manager.js:32-53` | Map appears after 14 s; nothing is clickable; no message. | confirmed |
| B2 | **Action-bar Generate (CT, CT bottom-up, RTT, T5) reads the selection *after* `await ensureNamesLoaded()`**, but `withActionHexes` runs `finishAction()` synchronously, so "Clear after action" empties the selection first. MgT2E captures targets before its await and is fine. | `input_init.js:706-718`, `macro_orchestrator.js:979, 1117, 1252, 1501` | 50 hexes selected, More → Generate → T5 → "No populated hexes", or only the inspected hex is generated. | confirmed |
| B3 | **Action-bar Generate passes `skipPop = false`**, re-rolling system presence (3 in 6) on every target; the context menu passes `true`. | `macro_orchestrator.js:573-585` (+ CT/RTT/T5 equivalents) | Inspect an existing system, More → Generate → Mongoose, confirm → ~50 % of the time the hex becomes EMPTY. | plausible (maybe intended for blank regions; nothing says so) |
| B4 | **`saveHistoryState` runs before the "overwrite… Proceed?" confirm** in MgT2E, CT, CT bottom-up, RTT, AoW macros → Cancel pushes a no-op entry and wipes redo; on >35-sector grids (limit 5) it evicts a real step. | `macro_orchestrator.js:547/563, 982/994, 1120/1132, 1255/1267, 1406/1408` | Ctrl+Alt+M, Cancel, Ctrl+Z → "Undid" nothing. | confirmed |
| B5 | **Escape ladder conflicts** (five handlers): (a) `#region-window` is missing from the ladder → Esc falls through to `deselectAllHexes()`; (b) `ui_menus.js` document handler and the allegiance-input handler do not `preventDefault` → the window handler also fires (double close / deselect); (c) the inspector's capture-phase handler swallows Esc whenever open → an armed MapPick, RouteEdit, context menu or route-name modal stays active while the inspector closes; (d) the `.atlas-lightbox` image dialog is not excluded → Esc closes the inspector (and orbit view) and revokes the image's blob URL under the still-open dialog; (e) no open-modal guard on shortcuts → Ctrl+Z under the System Editor reverts `hexStates` beneath it, then Save writes the stale copy back; R/B/G/D/F toggle palettes behind modals. | `keyboard_shortcuts.js:56-235, 162-189`, `ui_menus.js:158-161, 3524-3531`, `system_inspector.js:1260-1294` | Open Region window, press Esc → window stays, selection wiped. | confirmed (e plausible) |
| B6 | **Context menu acts on the selection / inspected hex, not the right-clicked hex.** `contextHexId` is set (`canvas_input.js:47`) and used by nothing. Create/Edit System and Export use `[...selectedHexes][0]`; generation/expansion handlers use `currentActionHexes()`. Same for the disclosure modal (F13) and regions (existing convention). | `canvas_input.js:70-108`, `system_editor.js:2707-2714`, `io_manager.js:2560`, `ui_menus.js` handlers | A selected, right-click B → Edit System opens A; Export writes A; with no selection but inspector on A, right-click B → Generate regenerates A. | confirmed |
| B7 | **`remapSectorSlots` replaces `selectedHexes` with a plain `new Set`**, discarding the action-bar monkey-patch; and does not remap the hex editor's `editingHexId`, `SystemEditor._workingCopy.hexId`/`_previewOriginalState.hexId`, or `CampaignAtlas` `draft.anchor.hexId`/`origin`/`systemFilter`. | `core.js:613-614, 671`, `hex_editor.js:3078-3080` | After inserting a column, shift-click no longer updates the action bar until reload; an editor open on `3-A-0101` during a slot move saves onto another sector's `3-A-0101`. | confirmed / plausible |
| B8 | **Select Sector / Subsector hard-code the 7×5 bounds** (`q <= 223`, `r <= 199`). | `canvas_input.js:417-418, 434-435` | 16×8 OTU grid: Ctrl+S / Ctrl+B / context "Select Sector" do nothing for column ≥ 8 or row ≥ 6. | confirmed |
| B9 | **Hex editor**: (a) `canLeave()` only asks `CampaignAtlas`, so unsaved editor fields are discarded without a prompt when picking another hex, Esc, close, or toggling Edit; (b) the name-propagation dialog survives Esc (`closeHexEditor` → `editingHexId = null`) and "Propagate Names" then runs `hexStates.set(null, …)`; (c) AoW hexes: Save writes `mgt2eData`/`mgtSystem` but inspector and orbit read `aowSystem` → stale ribbon. | `system_inspector.js:74-102, 1280-1284`, `hex_editor.js:3004, 3267-3274` | Type long referee notes, click a neighbouring system → notes lost. | confirmed (c plausible) |
| B10 | **Body location keys embed the body's name**, and campaign `bodyKey` matches by exact equality → renaming a system/body (hex editor Save, propagate, System Editor, changing the mainworld) silently detaches every record pinned to that body: gone from `recordsForBody`, locator returns null, "Back to…" lands on the overview. | `system_viewer.js:~5305` (re-check, file in flux), `campaign_atlas.js:88-93` | NPC pinned to "Regina"; rename the system → NPC vanishes from the body view. | confirmed |
| B11 | **Overlay caches go stale**: (a) border-name cache rebuilds only when `hexBorderAssignments.size` or identity changes → moving hexes A→B leaves both labels at old centroids/counts; (b) Clear Border and reassign never delete `borderPaths` of the border that *lost* hexes, and the action-bar "Clear region" and the region modal's Clear don't delete `regionPaths` → export prefers the stale stored polygon; (c) region rename/clear/delete/assign never call `reapplyAllRules()` → rules keyed on `cluster` keep their old hex set. | `borders.js:461-466, 506-521`, `renderer.js:2555`, `regions.js:123-162, 419-426, 450`, `input_init.js:670-680` | Trim an imported border by hand → the exported metadata still has the full polygon. | confirmed |
| B12 | **Routes**: (a) X-boat bridging builds connectivity from *every* slot, so pairs joined only by a Trade route are skipped; (b) "Continue route" de-dupes only against `groupId === p2p_<id>`, so slots with `net_/btn_/xboat_/OTU/none` groupIds get duplicate legs and `produced` is reported true; (c) `_generateIntoSlot` and `_runBtnGeneration` `undoStack.pop()` unconditionally on "produced nothing" — pops an unrelated entry when `saveHistoryState` returned false or a hex edit happened during the async BTN run; BTN's restore also discards route edits made during the run. | `routes.js:99-106, 508`, `ui_menus.js:2526, 2566-2599, 2847, 2872` | Trade A–B–C exists; X-boat generation on Ix-4 worlds A and C → no bridge. | confirmed (async race plausible) |
| B13 | **Region XML gap-sealing treats offset (q,r) as axial** (`s = -q - r`); the border version converts odd-q → cube correctly. | `borders.js:1362-1375` vs `875-890` | Waypoints (0,4)→(4,0): every other step leaves a one-hex hole → flood fill leaks / falls back / floods outside. | confirmed |
| B14 | **Importing a malformed rules file wipes all rule styling and throws forever**: rules are assigned unvalidated after `custom_ui` has been reset on every hex; a rule without `filters` throws in `reapplyAllRules` on every later call. Also `rule.id` unescaped in `onclick`; missing `color` pushes `undefined` into `appliedColors`. | `filter_engine.js:714-715, 755, 774, 974` | One bad rule → all colours gone, console error on every redraw. | confirmed |
| B15 | **Save/load gaps**: (a) legacy flat-format load replaces hexes only, keeping the previous map's routes/borders/regions/names/grid and then saving them; (b) save file omits `sectorReview` and `autoRouteCounter`; (c) XML metadata import takes its undo patch (routes only) *after* borders/regions/subsector names are applied, and only if the XML has routes → Ctrl+Z undoes the wrong thing. | `io_manager.js:175-193, 786-787, 869-889, 2177, 2260-2303` | Import an XML with borders+regions, Ctrl+Z → only routes revert (or the previous unrelated action). | confirmed |
| B16 | **Campaign atlas**: (a) `persist()` returns silently while `busy || loading` and never retries → a sector remap during an image upload is not saved, records keep old hexIds after reload; (b) `addImages` keeps a reference to the fieldset across `await prepare`; a re-render (800 ms poll, background build refresh) leaves the *new* form disabled on error. | `campaign_atlas.js:109-110, 727-757`, `core.js:624-631` | Upload a large image, move a sector, reload → anchors wrong. | plausible |
| B17 | **`alert()` inside the per-hex CT generation catch** → up to one modal per hex. | `macro_orchestrator.js:1083-1086` | 1280-hex selection, generator throws → 1280 dialogs. | confirmed |
| B18 | **Campaign clock never saves while the orrery runs**: every frame resets the 600 ms debounce; flushed only on `close()`. *(file in flux — re-check lines)* | `system_viewer.js:~411-416` | Leave orbit view playing, reload → all clock advance lost. | confirmed (lines to re-check) |
| B19 | **Inspector resets the body view on any hex-JSON change**, including view-only fields filters write (`isHiddenByFilter`, `custom_ui`). | `system_inspector.js:1197-1201, 1257` | Viewing a moon, toggle a filter → panel jumps to the overview within 800 ms. | plausible |
| B20 | Dev socio expansion clears the selection before checking whether the editing hex is a target → editor shows stale socio fields; Save overwrites the new data. | `ui_menus.js:589-597` | | confirmed |
| B21 | bg-color modal recomputes `currentActionHexes()` at Apply instead of using the counted set; combined with B5(b), Esc in the colour input wipes the selection and Apply colours 0 hexes while pushing an undo entry. | `ui_menus.js:94-121` | | confirmed |
| B22 | `paintAction` is reused when a selection drag starts in the off-map margin → a drag after a deselect-paint deselects. | `canvas_input.js:210-215` | | confirmed |
| B23 | Deleting a column/row leaves campaign records whose slot was removed pointing at the *new* occupant of that slot number (`mapSlot` null → anchor kept); `purgeSectorSlots` only runs when the slot had hexStates. | `core.js:624-631`, `sector_manager.js:368-400` | Sample campaign on an empty map, delete column A → records now "in" old column B. | confirmed |

---

## Tier C — low / latent

| # | Defect | Where | Conf |
|---|---|---|---|
| C1 | Reused allegiance slot keeps the evicted polity's name (`free.codes = [code]`, name untouched); XML import can empty a named slot by evicting its last code. | `allegiances.js:91-93, 239-241` | plausible |
| C2 | Border assignment to a missing id keeps the id, which may equal a renumbered border → silent hex gain. | `borders.js:116-120` | plausible |
| C3 | `resolveRouteId` falls back to hard-coded slot 4 / `max(def ids)+1`, ignoring segment ids (`_nextRouteSlotId` exists to avoid this). Every current caller passes `routeId`. | `routes.js:59, 65` | latent |
| C4 | BTN eviction: `rival.btnMax === null ? Infinity : rival.btnMax` treats `undefined` (older saves) as a number → older BTN segments always evicted. | `routes.js:1236` | plausible |
| C5 | Zoomed-out route stroke cache keyed on count + first/last leg + defs stamp; `invalidateRouteStrokeCache` is never called → in-place middle-segment edits draw stale below zoom 0.3. | `renderer.js:745-758` | plausible |
| C6 | Bare `r` branch lacks `!e.ctrlKey` → Ctrl+R toggles the Route Manager and blocks browser reload. | `keyboard_shortcuts.js:199-201` | confirmed |
| C7 | PlanetGL caches by `profile.id` (hex+name+type+UWP+diam+AU+PD); `world.profile` is never updated and `PlanetGL.clear()` never called → editing temp/pressure/tilt keeps the old bake. *(file in flux)* | `planet_gl.js:1003-1006`, `system_viewer.js:~3653` | plausible |
| C8 | `_drawStarField` repaints the backdrop *after* `PlanetGL.render` on first frame / resize / span / DPR change → planets drawn from nebula pixels (flicker while resizing). *(file in flux)* | `system_viewer.js:~2677, ~3323`, `planet_gl.js:1145-1156` | confirmed sequence |
| C9 | Orrery `resize` early-returns on unchanged CSS size, ignoring DPR change → blurry / mis-sized planets after moving to another monitor. *(file in flux)* | `system_viewer.js:~5175-5184` | plausible |
| C10 | `openFlatMapPanel` removes an existing panel without removing its capture-phase `onMapKey` listener → stale listener swallows the first Esc. | `hex_editor.js:2131-2132` | confirmed |
| C11 | ApproachViewer's Esc listener (loaded before SystemViewer) closes the approach view, then SystemViewer closes orbit view too. Latent — never opened. | `approach_viewer.js:378`, `hex_map.html:75/80` | latent |
| C12 | `seed_restoration`: a seed world of type `'Mainworld'` is classed `'Rocky'`, so a user-edited mainworld's name/UWP/`_manualFields` can land on the nearest rocky world instead of the generated mainworld. | `seed_restoration.js:35-37, 64-72` | plausible |
| C13 | Clear Canvas does not reset `allegianceDefinitions`, `hexAllegianceAssignments`, `autoRouteCounter`. | `io_manager.js:456-512` | confirmed |

**Refuted during review:** "`applyHistoryPatch` never restores `routeDefinitions`" — it is
restored by the caller, `keyboard_shortcuts.js:13-21` (`_restoreRouteDefinitions`).

**Checked and found sound:** hex/grid math (`getHexId`, `pixelToHex`, `getHexDistance`,
`remapSectorSlots` coverage), multipart save validation, resize/DPR on the sector map,
canvas save/restore balance, orrery `close()` teardown, campaign asset GC vs. commit ordering,
PlanetGL context-loss recovery, trade-match distances across sector boundaries.

---

## Execution order (revised 2026-10-02 after round-2 decisions)

Each step is a self-contained change set with its own in-browser check. `rules/` is never
touched. `js/system_viewer.js` is the referee's own working file; it is edited only for a
named finding and only after saying so.

### Step 0 — Fog of war pause (§0.1)
Files: `hex_map.html`, `io_manager.js`, `input_init.js`, `ui_menus.js`.
Check: flag off → no Player Knowledge entry point visible, Export shows only "Referee —
everything", existing `disclosure` tags survive save/load.

### Step 1 — Persistence core, what loses data today (A1, A2, A3, A4, A6, A13, B1)
Files: `db_manager.js`, `hex_editor.js`, `io_manager.js`, `allegiances.js`,
`sector_manager.js`, `input_init.js`, `hex_map.html`.
- `syncAllHexes`: clear and put in **one** transaction; every `save*` watches
  `oncomplete/onerror/onabort` and surfaces failure as a sticky toast.
- `loadFromDB`: a read failure never "starts fresh" silently — show the error, keep the map
  empty, block autosave until the user loads or clears explicitly; add `onblocked` and
  cursor `onerror`.
- Allegiance definitions/assignments: DB functions, load, save-file fields, reset on
  load/clear. Sector/subsector names and `sectorReview` in the autosave and the save file.
- Hex editor Save, inline tree editors, solar-day and gas popups call
  `saveHistoryState(…, { hexIds })` (soon `markChanged`) so the autosave fires.
- Clear Canvas awaits any in-flight sync.
- Boot: a throw in `initializeInput` still un-inerts the nav and shows the error.
Check: edit notes, reload → present. Reload → allegiance slots present. Load B, reload →
B's names. Bump `DB_VERSION` in a second tab → error shown, nav usable.

### Step 2 — Persistence v2 (its own directive, `directives/persistence_v2.md`)
Undo removal (`markChanged`), base + overlay split, universe snapshot + offline importer,
autosave slots + manual saves + Saves tray. This is also the first half of the campaign
plan's Phase 0 (per-document `rev`, tombstones, campaign-id namespace), done once.
Closes A5, A7, A8, A9, A10, A16, B4, B12c, B15c by construction; A12 is handled by the new
load path (parse and validate everything before touching the live state).

### Step 3 — Grace: LOD dissolve, eased zoom, one chrome convention (§G)
Files: `renderer.js`, `canvas_input.js`, `input_init.js`, `style.css`, `hex_map.html`
(markup attributes only), `ui_menus.js` (show/hide call sites).
- Frame dissolve replaces the per-frame LOD repaint; all LOD layers snap in the paint and
  dissolve in the present. `_tickLod`, `_lodFrameAnimating` and the `requestAnimationFrame(draw)`
  fade loops go. Hysteresis on every threshold.
- Wheel zoom eased toward the cursor with the scaled cache per frame and one sharp frame
  at settle; `deltaMode` normalized.
- `requestAnimationFrame(draw)` call sites (~200) → `scheduleDraw()` so no frame draws twice.
- `uiShow`/`uiHide` helper and `data-state` CSS for context menu, action bar, trays, legend,
  palettes, omni popup, inspector, modals, orrery tooltip. `prefers-reduced-motion` → instant.
Check: `window.showMapPerf` on a 16×8 universe map — zoom from 0.05 to 3 and back; no frame
over 16 ms *during* a dissolve (dissolve frames should read ~1 ms); labels fade in, never
pop; wheel zoom glides; right-click menu and action bar fade rather than appear.

### Step 4 — Background build and action bar (A11, B2, B3, B17)
The Mongoose build becomes a snapshot-time script for the base; in the app it remains for
own-map mode only, with a cancel token that load/clear/import set, and its own progress
owner separate from BTN. `withActionHexes` passes the captured list to the macro.
Decide B3 (recommend: `skipPop = true` on hexes that already have a system).

### Step 5 — Input, Escape, context menu (B5, B6, B7, B8, B20, B21, B22, C6, C10)
One Escape ladder; shortcuts ignored while a dialog/modal is open; context menu prefers the
right-clicked hex when nothing is selected; `remapSectorSlots` mutates `selectedHexes` in
place and remaps editor/campaign hex ids; sector select uses the real grid size.

### Step 6 — Overlays and exports (A14, A15, B11, B13, B14, B15a-b, B12a-b, C1–C5)
`borderPaths` per sector; stale path/label caches; region edits reapply rules; region
gap-sealing in cube coordinates; rules import validated; X-boat bridging by slot; Continue
de-dupes by endpoints; user-named empty slots survive XML import.

### Step 7 — Panels (B9, B10, B16, B19, B23, C12, C13; then B18, C7–C9 in `system_viewer.js` with the referee)
Dirty check for the hex editor; body keys without names + re-key of campaign records on
rename; `persist()` retries; inspector change detection ignores view-only fields; records
detach (not misplace) on slot delete; Clear Canvas resets allegiances and the counter.

### Step 8 — Fog-of-war leak fixes (F1–F13)
Deferred to the campaign plan's Player Pack phase.

## Working notes

- The working tree on branch `campaign` already carries uncommitted changes to most of
  these files. Batches are kept small so each can be reviewed and committed by the user on
  its own; no batch touches `rules/`.
- After each batch the check list above is run in the browser (Claude in Chrome can drive
  the app directly against `hex_map.html`). `utilities/campaign_atlas_test.js` and the route
  tests are run where they cover the change.
- Every fix that changes persistence adds a line to `changelog.md` under the next version per
  `directives/update_version.md`; the version bump itself happens once at the end of the pass.

---

## G. Grace — design for Step 3

### G.1 What pops today, and why

| Pop | Where | Cause |
|---|---|---|
| World labels / UWP / detail glyphs at zoom 0.85; sector names and subsector titles | `renderer.js:567-589` (`_snapLodLayer`, `_applyTextLod`) | Text was made snap-only because fading it re-rasterized every label per frame |
| Dots (0.05–0.07) and grid (0.22–0.3) fade, but each fade frame repaints the pan bitmap | `renderer.js:430, 436, 2049-2050` → `_presentLiveFrame` → `_rebuildPanCache` | The fade loop is routed through `draw()` instead of a present-only path |
| Blur → sharp after every wheel tick | `_presentScaledCache` then `_presentPanCache` | The sharp frame replaces the stretched one in a single frame |
| Zoom itself: 10 % per tick, instant | `canvas_input.js:377-400` | No easing; `deltaMode` ignored |
| Context menu, action bar, trays, legend, omni popup, inspector, modals | `display:flex`, `hidden`, `style.display` toggles | Four show/hide mechanisms, no transition on most |
| Double draws | ~200 direct `requestAnimationFrame(draw)` sites | Frames are not coalesced through `scheduleDraw()` |

### G.2 Frame dissolve (presentation-only, generic)

Instead of fading *layers* (which needs each layer at an in-between alpha, i.e. a repaint),
dissolve *frames*: when the next sharp frame's look differs from what is on screen, keep a
copy of the screen and blend it out over the new frame. Both frames are complete renders;
pixels that did not change blend into themselves, so only what changed appears to fade.

```
state  _dissolve = null | { canvas, zoom, cameraX, cameraY, dpr, t0, ms }

before a sharp frame replaces the screen (in _presentLiveFrame, after _rebuildPanCache succeeds):
    sig = LOD signature of the frame about to be presented (labels|sectorNames|subLabels|dots|grid|routes|macro on/off)
    if sig !== _lastSig        → ms = 220   // a LOD layer appeared or vanished
    else if zoom !== _lastZoom → ms = 120   // blur → sharp after a zoom step
    else ms = 0
    if ms && !reducedMotion:
        _dissolve.canvas ??= document.createElement('canvas')   // screen-sized, device px
        size it to the screen canvas; ctx.drawImage(screenCanvas, 0, 0)   // one GPU copy, ~0.2 ms
        _dissolve = { ..., zoom: _lastZoom, cameraX: _lastCamX, cameraY: _lastCamY, t0: now, ms }
    _lastSig = sig; _lastZoom = zoom; _lastCamX = cameraX; _lastCamY = cameraY

_present():                                   // NEW present-only path; never calls draw()
    blit the pan cache (as _presentPanCache does today)
    if _dissolve:
        u = min(1, (now - t0) / ms); a = 1 - u * (2 - u)        // ease-out
        draw _dissolve.canvas with the scaled-cache transform (its zoom/camera → current), globalAlpha = a
        if u < 1 requestAnimationFrame(_present) else _dissolve = null
    _paintPinnedMapLabels()                   // new pinned text on top at alpha 1; the old is inside the dissolving copy
```

- All LOD layers become **snap** in the paint (`_syncLodLayer` → `_snapLodLayer` for every
  layer); `_tickLod`, `_lodFrameAnimating`, `LOD_FADE_MS` and the `requestAnimationFrame(draw)`
  loops at `renderer.js:430, 436, 2049-2050` are deleted. The dot/label handover
  (`lodDotAlpha = dots.alpha * (1 - labelsAlpha)`) becomes a plain switch; the dissolve does
  the blend.
- The dissolve survives panning (its camera is known, so it is offset like the scaled cache)
  and zooming (scaled like the scaled cache). A new sharp frame mid-dissolve captures the
  *current composite* screen as the new "from", so chained crossings stay smooth.
- Cost per dissolve frame: two `drawImage` calls plus pinned labels. No repaint.
- Memory: one screen-sized canvas (about 15 MB at 2560×1440 DPR 1, about 59 MB at 4K DPR 2).
- `prefers-reduced-motion` → `ms = 0`, identical to today.
- **Hysteresis:** each threshold gets an off value 8 % below its on value
  (`LOD_LABELS` on 0.85 / off 0.78, `LOD_GRID` 0.30 / 0.276, `LOD_DOTS` 0.07 / 0.064,
  `LOD_ROUTES` 0.10 / 0.092), so a camera settling on a boundary never flickers.
- Print capture (`captureSubsector`) and export paths pass `snap` as today and never dissolve.

### G.3 Eased wheel zoom (`canvas_input.js`)

```
wheel: normalize deltaY (deltaMode 1 → ×16 px, 2 → ×innerHeight); clamp to ±120
       zoomTarget = clamp(zoomTarget * exp(-deltaY * 0.0022), 0.03, 10)
       anchor = world point under the cursor (as today); window.mapZoomFocus as today
       start _zoomLoop if not running
_zoomLoop (rAF): zoom += (zoomTarget - zoom) * 0.35          // exponential approach, ~140 ms to settle
                 re-anchor cameraX/Y so the anchor stays under the cursor (today's math)
                 if |zoomTarget - zoom| > 0.001 * zoom: _presentScaledCache() (cheap stretch), loop
                 else: zoom = zoomTarget; scheduleDraw()        // one sharp frame → the dissolve (G.2) finishes it
```
Pinch (`ctrlKey` wheel) takes the same path. Keyboard `+`/`-` set `zoomTarget` by ×1.25.
The sharp frame is painted once per gesture, not once per tick — fewer repaints than today.

### G.4 Frame coalescing

Replace every `requestAnimationFrame(draw)` in `js/` with `scheduleDraw()` (mechanical;
`grep -c "requestAnimationFrame(draw)" js/*.js` must read 0 afterwards). `draw()` stays
callable synchronously where a caller needs the frame now (`resize`, capture).

### G.5 One show/hide convention for chrome (`input_init.js`, `style.css`)

```js
uiShow(el)   // removes hidden/inert, forces reflow, sets data-state="open"
uiHide(el)   // sets data-state="closing"; on transitionend (or a 200 ms timeout) sets hidden + inert and clears data-state
```
```css
[data-ui]                          { transition: opacity 140ms ease-out, transform 140ms ease-out; }
[data-ui][data-state="open"]       { opacity: 1; transform: none; }
[data-ui]:not([data-state="open"]) { opacity: 0; transform: translateY(4px); pointer-events: none; }
[data-ui="menu"]:not([data-state="open"])  { transform: scale(.98); transform-origin: var(--origin, top left); }
[data-ui="panel"]:not([data-state="open"]) { transform: translateX(12px); }   /* inspector, side panels */
[data-ui="tray"]:not([data-state="open"])  { transform: translateX(-8px); }
@media (prefers-reduced-motion: reduce) { [data-ui] { transition: none; } }
```
Applied to: `#context-menu` (menu, origin at the pointer), the map action bar and its menus,
`.nav-tray` and `#legend-tray` (tray), `.draggable-palette` (keeps its 0.2 s opacity, gains
transform), the omni-search popup, `#system-inspector` (panel; its width change already
animates), `.modal-overlay` and `#disclosure-assign-modal`, the orrery tooltip, `.side-panel`
(already slides; unify under the same attribute). Existing class toggles (`.visible`,
`.open`) are left in place and driven by the helper so no call site changes meaning. Toasts
keep their own transition. Layout timing does not change: `AppNavigation.layout()` already
runs on attribute changes via its MutationObserver.

### G.6 Not in this step (campaign plan §6.1)

Camera flights (`flyTo`), pan inertia, keyboard panning and per-frame map resizing while a
panel animates stay in the campaign plan; they build on G.2–G.4 without changing them.

