# Feature Inventory — what the legacy app does, and what happens to each piece

**Status:** DRAFTED 2026-10-02 from the code, README, FAQ and `hex_map.html`. Every row is a
feature a user can see or a mechanism the new app depends on.
**Verdicts:** `keep` = logic is copied into `packages/engines` (or `apps/web/src/map`,
`orbit`, `planet` for rendering math) and proven by golden tests; `wrap` = used as-is behind
an interface for the first slice, replaced later; `rebuild` = written fresh in `apps/web`
against the manifesto, the legacy file read only for behaviour; `drop` = not carried;
`defer` = carried, but after slice 5.
**Slices** (from the restart plan): 0 Foundation · 1 Viewer · 2 Builder · 3 Campaign ·
4 Sharing · 5 Merge.

Line counts are from 2026-10-02 (`js/` total 96,877; 21,401 of that is `otu_system_data.js`).

---

## A. Map and navigation

| # | Feature | Where today | Verdict | Slice | Notes |
|---|---|---|---|---|---|
| A1 | Hex grid canvas: sectors, subsectors, LOD text, pan cache, zone rings, route/border/region layers | `renderer.js` (2,784) | wrap | 1 | Behind `MapRenderer.draw(viewport, layers)`. Replace when the viewer is stable. |
| A2 | Pan, zoom, click/box select, alt-drag route draw, wheel | `canvas_input.js` (459), `input_init.js` (878) | rebuild | 1 | Inertia, `deltaMode`, keyboard pan per manifesto Graceful. |
| A3 | Camera: centre hex, fit hexes, centre sector | `core.js:455-518` | rebuild | 1 | Flights, never teleports. |
| A4 | Sector slots: insert/remove column/row, slot numbering, remap hex ids | `sector_manager.js` (438), `core.js:330-731` | keep slot math, rebuild UI | 2 | Truth is layout-independent (sector slug + local hex). Slots are a layout concern of the builder. |
| A5 | Sector and subsector names, sector review flags | `core.js:80-135`, `sector_manager.js` | rebuild | 2 | Rows in D1. |
| A6 | Density toggles (regular/dense/sparse), hide no-planet systems, sector/subsector borders, sector names | `ui_menus.js`, context menu | rebuild | 1 | View settings, per device. |
| A7 | Omni-search: systems by name/hex, campaign records, tools | `input_init.js:371-531` | rebuild | 1 | Becomes the command palette. |
| A8 | Legend tray | `#legend-tray`, `ui_menus.js` | rebuild | 1 | |
| A9 | Deep links to universe/sector/hex/body/record | none | new | 1 | Manifesto Connected. |
| A10 | Map perf counter (`showMapPerf`) | `renderer.js` | drop | — | Use browser tooling. |

## B. Generation engines (the logic worth keeping)

| # | Feature | Where today | Verdict | Slice | Notes |
|---|---|---|---|---|---|
| B1 | Classic Traveller: stellar, world, social, bottom-up skeleton, top-down, auditor, driver, physical library, constants | `ct_*.js` (10 files, ~5,000) | keep | 0 | UMD-wrapped already. |
| B2 | Mongoose 2e: stellar, world, socio, auditor, top-down, bottom-up, math; staged build (generate → flesh → society) | `mgt2e_*.js` (8 files, ~9,000), `macro_orchestrator.js:195-260` | keep | 0 | `mgtBuildStage` and `_storeMgtBuild` are the truth builder path. |
| B3 | Traveller 5: stellar, world, socio, auditor, top-down | `t5_*.js` (5 files, ~2,500) | keep | 0 | |
| B4 | RTT WorldGen: steps 1-3, biographer, physics, satellites, social, auditor | `rtt_engine.js` (2,168) | keep | 0 | Plain globals, not UMD. `expandRTTBiographerOnly` reads `hexStates`; takes `sys` after conversion. |
| B5 | Architect of Worlds: stellar, world, auditor, seed bridge, bottom-up | `aow_*.js` (6 files, ~6,400) | keep | 0 | |
| B6 | Universal system driver (CT/T5 routing, seedSys gating) | `system_driver.js` (307) | keep | 0 | |
| B7 | UWP auditors (per edition) and audit backlog | `*_uwp_auditor.js` | keep | 0 | `window.auditBacklog` becomes an exported array. |
| B8 | Statistical auditor against expectation tables | `statistical_auditor.js`, `rules/expectations_data.js` | keep | 0 | |
| B9 | Seeded RNG, per-hex reseed, dice, eHex, population check frequency | `core.js:183-220, 747-797` | keep | 0 | `packages/engines/src/core/rng.js`. |
| B10 | Trace logging (`tSection`, `tResult`, `tRoll*`, indent, start/end trace) | `core.js:798-937` | keep | 0 | Sink is an array; download is UI. |
| B11 | Deterministic system naming from pool, orbital and moon naming per edition | `core.js:1073-1286`, `names.js` (0.8 MB) | keep | 0 | Pool becomes a lazy-loaded asset. |
| B12 | Manual-field locks (`markManual`, `isManual`, counts) | `core.js:938-1072` | keep | 0 | |
| B13 | Seed restoration (editor seeds back into generation) | `seed_restoration.js` | keep | 0 | |
| B14 | Generation settings: pop/TL/starport max and mod, realistic stellar, TL floor, RTT settlement and TL, no travel zones, pop check frequency | `ui_menus.js:4533-4632`, `io_manager.js:196-225` | rebuild as a settings schema | 0/2 | Two keys are read by engines but never pinned (slice 0 §3). |
| B15 | Bulk macros: generate over selection per edition, autoPopulate by density, validate selection, background Mongoose build with progress | `macro_orchestrator.js` (1,659) | rebuild thin | 2 | Becomes the platform's generation service (inline and Queue jobs) with progress over SSE. Keep `computeSystemCounts` and the staged-build logic. |
| B16 | Batch log download | `io_manager.js:9` | rebuild small | 2 | |

## C. Editing

| # | Feature | Where today | Verdict | Slice | Notes |
|---|---|---|---|---|---|
| C1 | Hex editor: UWP digits, name, bases, zone, PBG, notes, allegiance, trade codes, per-field revert to chart, inline tree editors, solar-day and gas popups | `hex_editor.js` (4,057) | rebuild | 2 | Bugfix A1 (never persisted) disappears by design. |
| C2 | System editor: add and delete stars, worlds, gas giants, belts, moons; seed UWP digits; preview; engine and warn dialogs | `system_editor.js` (2,760) | rebuild | 2 | |
| C3 | Editor adapters (one per edition: read system to editable seed, write back) | `*_editor_adapter.js` (5 files, ~1,800) | keep | 2 | Logic, DOM-free. |
| C4 | Manual hex: create system, mark empty, clear | context menu | rebuild | 2 | |
| C5 | Bulk assign: background colour, region, border, allegiance, disclosure | assign modals | rebuild | 2 | One assign panel, five targets. |
| C6 | Clear canvas, clear sector, purge slots | `core.js:691`, `ui_menus.js` | rebuild | 2 | Server snapshot first; the only confirms left. |

## D. Routes, borders, regions, allegiances

| # | Feature | Where today | Verdict | Slice | Notes |
|---|---|---|---|---|---|
| D1 | Nine route slots, definitions, colours, visibility, route window, systems panel | `routes.js`, `ui_menus.js`, `#route-window` | keep engine, rebuild UI | 2 | |
| D2 | X-boat routes by Importance | `routes.js:460` | keep | 2 | |
| D3 | Custom network: BFS, jump and range, filtered set, empty-hex jumps | `routes.js:571` | keep | 2 | |
| D4 | Point-to-point with waypoints, click-to-chart, extend, partial | `routes.js:722`, `route_*` utilities | keep | 2 | |
| D5 | BTN trade routes | `routes.js:1422` | keep | 2 | |
| D6 | Route chains, ends, combine candidates, subtype stamping | `routes.js:925-1167` | keep | 2 | |
| D7 | Route file save and load, TravellerMap XML route import and export | `io_manager.js:1475, 2279` | keep format | 2 | |
| D8 | Borders: definitions, assignment, path tracing, fill, names, min systems, clear on delete | `borders.js` (1,611) | keep path math, rebuild UI | 2 | Bugfix A15 (sectorNum on paths) lands in the new schema. |
| D9 | Regions: definitions, assignment, outline, label, filter, rename | `regions.js` (580) | keep, rebuild UI | 2 | Rename rewrites hexes atomically server-side. |
| D10 | Allegiances: codes, names, colours, groups, assignment | `allegiances.js` (753) | keep model, rebuild UI | 2 | Allegiance Manager window is dead code today; the model persists as rows (closes A4). |
| D11 | Trade match (goods between worlds) | `trade_match.js` (366) | keep logic | 2 | UI rebuilt as an inspector section. |

## E. Import and shipped data

| # | Feature | Where today | Verdict | Slice | Notes |
|---|---|---|---|---|---|
| E1 | TravellerMap TSV parse to hex states | `io_manager.js:1922-2254` (`parseT5Tab`) | keep | 0 | Truth builder uses it through the harness. |
| E2 | Metadata XML parse (routes, borders, names) | `io_manager.js:2279+` | keep | 0/2 | Copied into the truth sector index. |
| E3 | Universe and Imperium import from local snapshot; allegiance list | `otu_importer.js`, `universe_snapshot.js`, `universe/`, `imperium_data.js`, `universe_data.js` | replaced by the truth | 0/1 | The viewer reads truth files; builders pin a truth version. |
| E4 | OTU system wiki info | `otu_system_data.js` (21,401), `add_otu_system_info.js`, `otu_metadata_parser.js` | keep as data | 0 | Folded into truth sector files at build; never shipped to the client whole. |
| E5 | Traveller Worlds importer | `traveller_worlds_importer.js` (690) | keep parser | 2 | |
| E6 | ASAB single-system JSON export and import with campaign records | `io_manager.js:2624-2699` | keep as the seed of the package format | 4 | |
| E7 | Shipped sectors: Solo 6 (17 MB), Foreven/Mixon, `sectors/` (17 MB) | `solo_6_data.js`, `foreven_mixon_data.js`, `sectors/` | convert to truth inputs or packages | 0 | Never a boot-time script again. |
| E8 | Name pool build script | `utilities/convert_names.ps1` to `names.js` | keep | 0 | Output becomes a lazy asset. |
| E9 | Snapshot fetch and pack scripts | `utilities/build_universe_snapshot/` | becomes the truth builder | 0 | |

## F. Persistence

| # | Feature | Where today | Verdict | Slice | Notes |
|---|---|---|---|---|---|
| F1 | IndexedDB working copy, overlay store, built cache, migrations v2 to v5 | `db_manager.js` (724), `overlay.js`, `universe_snapshot.js` | drop | 2 | Server rows replace it. Signed-out local mode is in-memory plus file export. |
| F2 | Autosave ring, manual saves, Saves tray, gzip | `saves.js` (443) | drop | 2 | Server history: snapshot on bulk actions and daily; `rev` on rows. |
| F3 | Overlay document v3 reader and writer, v1/v2 readers, multipart files | `io_manager.js`, `overlay.js` | keep v3 as the contract; legacy readers become `packages/shared/legacy.ts` with fixtures; multipart dropped | 2 | File export and import stay for portability. |
| F4 | Attach snapshot, `sameAsBase`, scratch build, per-field chart compare | `universe_snapshot.js` | drop; compare logic reused | 4 | Install-time conflict resolution uses the same field compare. |
| F5 | Settings persistence (`collectMapSettings`) | `io_manager.js:196-245` | rebuild as schema | 2 | |
| F6 | `markChanged` and dirty journal as the single change signal | `core.js:242-313` | keep | 2 | Drives the outbound write queue. |

## G. Campaign

| # | Feature | Where today | Verdict | Slice | Notes |
|---|---|---|---|---|---|
| G1 | Atlas: 8 record types, anchors to system and body, tags, filters, target picker, locator line | `campaign_atlas.js` (1,093) | keep data model (v2 per plan), rebuild UI | 3 | Links, dated events, vessels, visibility from the campaign plan. |
| G2 | Image attachments: resize to WebP, thumbnails, budget, GC | `campaign_assets.js` | keep processing | 3 | Storage is R2. |
| G3 | Stardate clock shared with the orrery | `system_viewer.js:5242-5390` | keep | 1/3 | |
| G4 | Sample campaign | `campaign_sample.js` | keep as fixture | 3 | |

## H. Players and fog of war

| # | Feature | Where today | Verdict | Slice | Notes |
|---|---|---|---|---|---|
| H1 | Per-hex disclosure levels, tray, grid, bulk assign | `disclosure.js`, `disclosure_grid.js` | keep model, rebuild as publish-time visibility | 4 | Ladder semantics per bugfix §0.1. |
| H2 | Players' export filter (fails closed on untagged fields) | `export_core.js:566-611` | keep | 4 | Runs at publish. |

## I. Exports

| # | Feature | Where today | Verdict | Slice | Notes |
|---|---|---|---|---|---|
| I1 | HTML site export (index, pages, themes, print) | `html_exporter.js` (1,096) | becomes the published view | 4 | |
| I2 | Obsidian vault export | `obsidian_exporter.js` (721) | defer | 5+ | Download only. |
| I3 | Subsector PNG capture | `export_core.js` | keep | 4 | |
| I4 | TSV export with Ix, Ex, Cx | `io_manager.js` | keep | 2 | |
| I5 | World image bulk export | `export_core.js`, `planet_renderer.js` | keep | 4 | |

## J. Orbit view and planet imagery

| # | Feature | Where today | Verdict | Slice | Notes |
|---|---|---|---|---|---|
| J1 | Orrery: layout, orbit radii, Kepler periods, moons, rings, companions | `system_viewer.js:237-400` | keep math | 1 | Becomes the pure TS orrery model; rendered in 2.5D WebGL with a 2D canvas fallback (`architecture.md` §9). |
| J2 | Time controls: clock, speed, scrub, shuttle, day and night | `system_viewer.js:1552+` | rebuild UI, keep model | 1 | |
| J3 | Line-up search (alignment) | `system_viewer.js:1225-1551` | keep math | 1 | |
| J4 | Orbit view shell, back to sector, seeker lines | `system_viewer.js` (5,420 total) | rebuild | 1 | |
| J5 | Planet renderer: projections (globe, sinusoidal, mercator, mollweide, diamond) | `planet_renderer.js` (1,388) | keep | 1 | |
| J6 | Planet GL cube-map bakes | `planet_gl.js` (1,213) | keep | 1 | The cube maps texture the orbit view's spheres directly. Bake cache is in-session memory. |
| J7 | Planet profile (terrain from UWP), coastline and continent settings | `planet_profile.js` | keep | 1 | |
| J8 | Approach viewer, surface viewer | `approach_viewer.js`, `surface_viewer.js` | drop | — | Unreachable today (bugfix §0.2). |

## K. Filters

| # | Feature | Where today | Verdict | Slice | Notes |
|---|---|---|---|---|---|
| K1 | Rules ledger: colour and style by rule, stellar class and type filters, region filter, suspend and restore, import and export | `filter_engine.js` (1,073) | keep evaluation, rebuild UI | 2 | |

## L. UI chrome

| # | Feature | Where today | Verdict | Slice | Notes |
|---|---|---|---|---|---|
| L1 | Icon rail, trays, settings panel, help panel, splash, shortcut help | `hex_map.html` (3,250), `ui_menus.js` (4,761), `style.css` (3,127) | rebuild | 1 | |
| L2 | Inspector (World Details) at column, half, full | `system_inspector.js` (1,304) | rebuild | 1 | Stops polling (bugfix §0 item 8). |
| L3 | Keyboard shortcuts (F, Shift+F, R, B, G, D, Ctrl+S, Ctrl+B, Ctrl+Del, Ctrl+Alt+M/C/R/5, Esc, Space) | `keyboard_shortcuts.js` | rebuild via registry | 1 | Help screen generated from the registry. |
| L4 | Context menu (50 items) | `hex_map.html`, `ui_menus.js` | rebuild as command palette plus context | 2 | |
| L5 | Toasts, work-status bar, 76 native dialogs | scattered | rebuild | 1 | One toast, one progress, zero native dialogs. |
| L6 | Fonts and icons | `assets/fontawesome`, Google Fonts link | self-host | 1 | |

## M. Utilities and dead code

| # | Feature | Where today | Verdict | Slice | Notes |
|---|---|---|---|---|---|
| M1 | Route test corpus and perf scripts | `utilities/route_*.js` | keep, untouched | — | Rehome under `tests/` when routes convert. |
| M2 | Wiki scraper, sector comparison, name fixer | `utilities/` | keep, untouched | — | |
| M3 | Legacy engine archive | `js/archive/` | drop | — | |
| M4 | Allegiance Manager window, auto-discover functions | `allegiances.js:315-436` | drop | — | Dead today. |

---

## Totals

| Verdict | Rows |
|---|---|
| keep (logic copied, golden-tested) | 38 |
| wrap | 1 |
| rebuild | 26 |
| drop | 8 |
| defer or new | 3 |
