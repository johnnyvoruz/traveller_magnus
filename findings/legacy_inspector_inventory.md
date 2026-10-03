# Legacy inspector inventory — what `js/system_inspector.js` shows, rule by rule

**Status:** REFERENCE, written 2026-10-03 for slice 1 part B3. A read-only pass read
`js/system_inspector.js` in full, the `.dossier-*`, `.atlas-*` and `#dg-panel` rules in
`style.css`, and the helpers the inspector calls to decide text: `mainworld`,
`SystemViewer.normalizeSystem` / `_detectSystem` / `rotationText`, `formatDisplayNumber`,
`formatUwpDigit`, `formatTradeCodes`, `toEHex`, `getSubsectorName`, `buildJourneyTimesUI`,
`openDiamondWorldMap.spec`. Line numbers are `js/system_inspector.js` unless a file is named.
**Re-read the cited lines before a B3 step depends on one.**

`#dg-panel` is not this pane. `hex_map.html:1376` is `<div id="dg-panel" class="player-knowledge"></div>`
inside `#disclosure-tray`. Its rules are `style.css:1934-1953` and `2246-2401` (player-knowledge
buttons). The world dossier is `#system-inspector` (`hex_map.html:1396-1415`).

`directives/design_reference.md` §2.7: "Column (320px) for glancing, half for reading, full for
charts and timelines." §3 Panel: "Three widths; header with title in `--font-display`, meta in
`--text-muted`, close; body scroll with the teal scrollbar (`--scroll-*` legacy)." §3 Dossier:
"Mainworld identity block, stellar line, system tree, world-map lead with stage/caption/badge/hint;
scanner reveal." §4: "Dossier first render | scanner sweep `--t-long`; cache hit renders sharp
with no delay." The legacy widths and the scanner timing are the CSS and script below, not those
sentences.

## 1. Sections for one world, in order

A present system with no selected body calls `renderSystem` (984). A selected body returns first:
`if (body) { renderBody(body); return; }` (985). Empty rows are skipped: a value that is
`undefined`, `null`, `''`, or an empty array is not shown (395).

### Header (always, above the sections)

`renderHeader` (1099-1134). Overview: title is `state.name`, else `mainworld(state).name`, else
the hex id (51-53). Hex chip is the id when the title is not already the id (1131-1132). Place
line is `locationLine` (42-49): id split on `-`, sector number and letter `A`–`P`, then
"`sectorName - subName`". Sector name is `window.sectorNames[sectorNum]` or `` `Sector ${sectorNum}` ``.
Subsector name is `getSubsectorName`, which reads `window.subsectorNames[sectorNum-letter]` or
`` `Subsector ${letter}` `` (`js/core.js:88-93`). A bad id returns `''` and the place line is hidden.

Body view (1103-1122): title is `body.name` trimmed, else `body.type`, else `'Star'` (167-168).
Eyebrow is a crumb back to the system, plus `/` and the parent name when `parentWorld` finds the
body in some `world.moons` (152-154, 1106-1110). Place is `bodyPlace` joined with ` · ` and the
hex id with `-` replaced by `‑` (1121). `bodyPlace` (743-754): type label; for a star, role from
`star.role` or `'Primary'` / `'Companion'` (829-833); for a moon, `` `moon of ${parent name}` ``;
else `` `Orbit ${orbitId}` `` at 2 decimals and `au` at 3 decimals with unit `AU`.

### A. Surface-map lead

`worldMapLead` (579-624), first child of the overview and of a body profile. Omitted when
`openDiamondWorldMap.spec` returns null or `PlanetRenderer.renderFlatMap` is missing (580-581).
`canMapWorld` (`js/hex_editor.js:2329-2334`) is false for types `Gas Giant`, `Planetoid Belt`,
`Empty`, `Star`, `Asteroid Belt`, for a body with `sType != null` and no `size` and no `uwp`,
and when the size code is not `> 0`.

Shows a `<canvas>` (800×400, 512-513), a caption badge, and the hint text `Surface map` (620).
Overview badge text is `mainworldCallout` (977-982): `` `Mainworld · moon of ${parent}` ``, or
`` `Mainworld · ${name}` `` when the mapped name differs from the system name, else `Mainworld`.
Body badge is `Mainworld` only when `b.type === 'Mainworld'` (765). Stage, caption, badge, and
hint are the classes `dossier-map-stage`, `dossier-map-caption`, `dossier-map-badge`,
`dossier-map-hint` (`style.css:2770-2781, 2868`).

The body passed in is `mappedMainworld` (877-885): a `system.worlds` entry or moon with
`type === 'Mainworld'`, else `mainworld(state)`.

### B. Action row inside `.dossier-identity`

Only buttons that pass their guards (998-1014). Not data. See §4.

### C. UWP ribbon

`uwpRibbon(world.uwp || state.uwp)` (1015-1016). `world` is `mainworld(state)` (39-40):

`state.aowSystem?.mainworld || state.mgt2eData || state.ctData || state.t5Data || state.rttData || {}`

A string matching
`/^([A-HXY?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])-([0-9A-Z?]+)$/i`
(446) is split into cells labelled `Port Size Atm Hyd Pop Gov Law`, a `–`, and `TL` (443, 457-458).
Any other non-empty string is one `<p class="atlas-uwp">` (447). Empty string: nothing.

### D. Identity stat rows (no heading)

`detailRows` (1020-1033). Labels and paths:

| Label | Path | Format |
|---|---|---|
| Starport | `world.starport` | `formatUwpDigit('starport', value)` → `` `${value} — ${name}` `` or the value (`js/universal_math.js:103-121`) |
| Size | `world.size` | same, kind `size`, after `uwpCode` |
| Atmosphere | `world.atm` | kind `atmosphere` |
| Hydrographics | `world.hydro` | kind `hydrographics` |
| Population | `world.pop ?? world.population` | kind `population` |
| Government | `world.gov ?? world.government` | kind `government` |
| Law level | `world.law` | kind `law` |
| Tech level | `world.tl` | eHex code; if the number is `>= 10`, also `` `TL ${number}` `` (372-376) |
| Trade codes | `world.tradeCodes \|\| state.tradeCodes` | `formatTradeCodes`: each code `` `${name} (${code})` `` or the code (`js/universal_math.js:107-116`); each chip is a button |
| Travel zone | `state.travelZone \|\| world.travelZone` | `g`/`green` → code `G` name `Green`; `a`/`amber` → `A` `Amber`; `r`/`red` → `R` `Red`; anything else is the raw string (347-361) |
| Allegiance | `{ code: state.allegiance \|\| world.allegiance \|\| '', name: state.allegianceName \|\| '' }` | code and name; both empty → row omitted (355-357) |
| Bases | `world.baseCodes`, else `world.bases` joined with `''` when an array, else `world.bases`, else `state.bases` | `String(value)` (389) |
| Nobility | `state.t5Socio.nobleCodes` or `world.nobleCodes` | as written |
| PBG | `pbgCode(state, world)` | see below |
| Resource units | `state.mgtSocio.RU`, else `state.t5Socio.RU` | `String` (1017-1019) |
| Gas giants | `state.gasGiantCount` | `formatDisplayNumber` at 2 decimals (`js/universal_math.js:11-21`) |
| Belts | `state.beltCount` | same |
| Age (Gyr) | `system?.age` | same, 2 decimals |
| Edition | `system?.edition` | `String` |

`uwpCode` (342-345): a finite number, or a string of digits, goes through `toEHex`
(`js/core.js:768-774`: `0`–`9`, then `ABCDEFGHJKLMNPQRSTUVWXYZ`). `S`, `R`, and `GG` stay
themselves. Other strings stay themselves.

`pbgCode` (901-906): `''` unless `state.t5Data || world` has `popDigit` and `toEHex` exists.
Belts are `data.planetoidBelts` or else `state.beltCount` or `0`. Gas giants are
`data.gasGiantsCount` or else `state.gasGiantCount` or `0`. Result is three `toEHex` calls
concatenated.

Name strings for starport, size, atmosphere, hydrographics, population, government, law, and
trade codes are the constants in `js/universal_math.js:26-101`. This file does not restate them.

### E. Referee notes

Only when `state.notes` is truthy (1034-1038). `<details class="atlas-notes">`, summary
`Referee notes`, paragraph `state.notes` as text. Open when the span is not `column`.

### F. 100D jump times

`appendJourney` (921-931) calls `buildJourneyTimesUI(world, star)` (`js/hex_editor.js:22-58`).
Host is `journeyHost` (914-919): mapped mainworld, else the profile, and only when `size` is
set and `system.stars.length` is set. Star is `stars[world.parentStarIdx || 0] || stars[0]`.
The helper returns `''` when `world.type === 'Empty'` or `size` is `undefined`, `'R'`, or `'S'`
(`hex_editor.js:25-26`). Otherwise it prints the title `100D Jump Travel Times`, plus
`(Stellar Masked)` or `(Masking Available)` when `UniversalMath.isMaskingEligible` is true,
and six figures `1G`–`6G` with an `h` suffix (`hex_editor.js:73-87`). Masking follows the
checkbox `#edit-stellar-mask` (`hex_editor.js:33-34`). The inspector assigns that HTML with
`innerHTML` (930).

### G. No-orbit brief

When `system` has no stars and no non-`Empty` world (1041-1045): "Orbit data has not been
generated. You can still keep campaign records for this system."

### H. Campaign

`campaignSection` (627-666). Omitted unless `CampaignAtlas.createAt`, `window.campaignAtlas`,
and no `dbManager.campaignLoadError()` (629). Heading `Campaign` plus the record count.
Each record: `record.name`, then `record.summary` or `` `${singular type} · ${locationLabel}` ``.
No records: `` `Nothing is tied to ${subject} yet. Add a contact, a hook, or a place to start.` ``
Then one chip per `api.TYPES`.

### I. Socioeconomics

`<details class="dossier-socio-acc">` (1048-1080). Summary label `Socioeconomics`. Second line
`socioHeadline(state.mgtSocio)` (891-899): `` `Importance ${Im}` ``, the second comma-separated
piece of `economicProfile`, `` `WTN ${WTN}` ``, `` `Cr${pcGWP}` ``, joined with ` · `. Missing
pieces are left out.

When `state.mgtSocio.pValue !== undefined`, rows from `state.mgtSocio`: `Im` Importance,
`economicProfile`, `WTN` World trade number, `pcGWP` GWP per capita, `RU` Resource units,
`IR` Inequality, `DR` Development, `pValue` Population value, `totalWorldPop` Total population,
`pcr` PCR, `` `${urbanPercent}%` `` Urbanization, `majorCities`, `govProfile`, `factions`,
`judicialSystemProfile`, `lawProfile`, `techProfile`, `culturalProfile`, `starportProfile`,
`militaryProfile` (1058-1078). Numbers use `formatDisplayNumber` (387-388). Arrays are joined
with `, ` (389). Otherwise the sentence "Mongoose socioeconomics have not been built for this
world." (1080). The accordion starts open only at span `full` (1049).

### J. Stellar configuration

`appendStellar` (933-948), inside the socio column. Stars whose `separation === 'Companion'`
are not their own line (935). Each other star: glyph plus
`` `${spectral} (+${companion spectrals joined ', +'}) — ${role}` ``. The `(+…)` part is
omitted when that star has no companion with `parentStarIdx` equal to its index. The role
suffix is omitted when `role` is missing or `'Primary'`. Spectral is
`sType subType sClass`, or else `` `${type}${decimal} ${size}` ``, or else `name`, or else
`Star` (908-912). No such stars: the block is omitted.

### K. System tree

`appendTree` (950-975). Omitted when `system` is null, and omitted when no row was added (975).
Heading `System` and the count `(system.stars || []).length + worlds.length`, where `worlds`
drops `type === 'Empty'` (954-956). Moons are not in that count. Order: every star, then each
non-empty world, then that world's non-empty moons indented (`.dossier-moons`,
`style.css:2751-2752`). A star row's detail is the spectral phrase when
`star.name` without spaces differs from the spectral phrase, plus `starPlace` (959-962).
A world or moon row's detail is `bodyFacts` (856-867): type label; a moon adds `pd` at 1
decimal with unit `PD`; other bodies add `Orbit ${orbitId}` at 2 decimals, `au` at 2 decimals
with `AU`, and `diamKm` at 0 decimals with `km`. The mainworld row adds the tag `Mainworld`.
Any other non-star with `uwp` shows that string at the right (851-852).

### Body profile (replaces B–K)

`renderBody` (756-825), under the body bar (§4). Order:

1. Map lead, badge `Mainworld` or none.
2. UWP ribbon of `selected.uwp`, same formatter as C.
3. Fact tiles (462-474). Star: `temp` K at 0 decimals, `lum` `L☉` at 3, `mass` `M☉` at 3,
   `diam` `D☉` at 3 (771-773). World: `diamKm` km at 0, `gravity` G at 2, `meanTempK` K at 0
   with a second line from `celsius` (`` `${kelvin - 273.15}` °C at 0 decimals, only when
   kelvin `> 0`, 487-489), `SystemViewer.rotationText` (4318-4322: `Tidally locked`, or hours
   at 1 decimal plus `, retrograde` when `axialTilt > 90`), `periodText` (480-485: `periodDays`
   as years at 1 decimal when `>= 730`, else days; else `periodYears` at 2 decimals with `yr`),
   and `moons.length` excluding `Empty`.
4. Star section, or world sections. Star (785-788): `Type` spectral phrase, `Role`, `separation`,
   `orbitId` at 2 decimals, `eccentricity` at 3. World profile (790-795): `starport`, `size`,
   `atm`, `hydro`, `pop`, `gov`, `law`, `tl`, `tradeCodes`, `travelZone`, formatted as in D.
   Orbit (796-802): `orbitId`, `au` as Distance (AU) at 3, `pd` as Satellite orbit (PD) at 2,
   `eccentricity` at 3, `periodDays` at 1, `axialTilt` at 1, `tidallyLocked === true`,
   `isTwilightZone === true`. Booleans render `Yes` (385); a false value is passed as `null`
   and the row is skipped. Physical (803-808): `massEarths ?? mass` as Mass (M⊕) at 3,
   `composition`, `totalPressureBar ?? pressureBar` at 2, `highTempK` at 0, `lowTempK` at 0,
   `tempBand`, `albedo` at 2. Life & resources (809-814): `habitability`, `biomass`,
   `biocomplexity`, `biodiversity`, `compatibility`, `nativeSophont`, `extinctSophont`,
   `resourceRating`.
5. `Moons` list, then for a star a `Worlds` list of non-empty worlds whose
   `parentStarIdx ?? 0` is that star's index (816-820).
6. Campaign section for that body's location key (822).

### Not a world

`render` (1166-1170), when there is no hex state or `state.type !== 'SYSTEM_PRESENT'`:
heading "Your campaign starts with a system" and "Click a system on the map to inspect it.
Double-click to explore its orbits." The campaign tab does not render this dossier
(1165): `CampaignAtlas.render`.

## 2. The three widths

`applySpan` (277-291) keeps only `'half'` and `'full'`; anything else is `'column'`. It sets
`panel.dataset.span` and `localStorage['traveller_inspector_span']`. CSS
(`style.css:2687-2698`), all `!important`:

- **column:** `width: min(520px, calc(100vw - var(--nav-width) - 20px))`. One column
  (`style.css:2755-2762`). `.dossier-side` is `display: contents` (2723), so the DOM order is
  the visual order: map, identity, socio (with stellar), tree. Socio block has `margin-top: 18px`
  (2727-2728). Notes start closed. Socio accordion starts closed. Body profile is one scrolling
  column (2756-2762).
- **half:** `width: min(calc(100vw - var(--nav-width) - 20px), max(520px, calc((100vw - var(--nav-width) - 20px) / 2)))`.
  Overview is two columns (`style.css:2933-2935`): column 1 is the map over the identity;
  column 2 is `.dossier-side` as a block (socio accordion, stellar, tree) with its own scroll
  (2953-2956). Notes start open (1036). Socio accordion is not forced open. Body rows hide
  `.atlas-body-extra` (553), the part after the first fact (842-847). Body profile is two
  equal columns, main then side (`style.css:2982-2985`).
- **full:** `width: calc(100vw - var(--nav-width) - 20px)`. Overview is three columns
  (`style.css:2937-2962`): map over identity; socio column (the accordion and the stellar
  block, because stellar is appended inside `.dossier-socio`); tree in column 3. Notes start
  open. Socio accordion starts open (286-288, 1049). Body profile columns are `1.1fr` and `1fr`
  (`style.css:2986`).

Without a map, the grid rows collapse to one (`style.css:2964-2973`). A body re-render is
requested on span click only when a body is selected (1253). The 320px in the design reference
is not the column width in this CSS. Older rules at `style.css:277-284`, `647-649`, `776`,
`2057-2061`, and `2681-2682` set 400px, 360px, 320px, 290px, or 300px; the `data-span` rules
override them.

Editing layout (not the read view): at half and full, `syncEditAccordions` opens
`#acc-btn-mgt-socio`; at full it also opens `#acc-btn-mgt-system` (306-316). The half and full
editor grids are `style.css:3013-3054`.

## 3. Open, close, change world, loading, scanner

**Open.** The pane starts `hidden inert` (`hex_map.html:1396`). `show` (65-72) sets `open`,
clears `hidden` and `inert`, removes `.open` from `#help-panel`, and sets `--inspector-width`
to the pane width plus 20, or `0` when closed (58-60). `body` gains `inspector-open`.

A map mouseup on a `SYSTEM_PRESENT` hex calls `openForHex` (`js/canvas_input.js:286-297`).
The second argument is `'system'` when `CampaignAtlas.trackedHexId()` is a different hex,
otherwise the current tab. Search calls `openForHex(result.id, 'system')` (`js/input_init.js:473`).
`openForHex` (93-105) refuses when `canLeave()` is false, unless the campaign draft is already
for that hex (94-95). `canLeave` is `CampaignAtlas.confirmLeave()` when that exists (55-56).
A hex change clears `body`, `bodyKey`, and `signature` (97). Then `UniverseSnapshot.ensureSystemBuilt(id)`,
`refresh(true)`, and `prefetchAround(id)`. The rail button `#atlas-toggle` closes the pane when
it is already the system tab, otherwise shows it and refreshes (1226-1234).

**Change world.** The same `openForHex`. `refresh` (1195-1210) is also the 800 ms poll. It
`JSON.stringify`s `hexStates.get(hexId)`. A new string clears the selected body and, when the
orrery is on this hex, calls `SystemViewer.refresh`. Then `system` is
`SystemViewer.currentSystem()` if the orrery is on this hex, else `SystemViewer.normalizeSystem(state)`.
`normalizeSystem` (`js/system_viewer.js:4922-4929`) uses `_detectSystem` (444-455): the first of
`aowSystem`, `mgtSystem`, `ctSystem`, `t5System`, `rttSystem` whose `stars.length > 0`. No match:
`system` is null. There is no "loading" string in the inspector. Until that object exists, §1.G
is the overview and the stellar and tree blocks are absent.

**Close.** `#atlas-close` (1240-1241), `#atlas-toggle` when already on the system tab, Escape
when no body is selected and the orrery is closed (1291-1295), and `reset` (1212-1216). `close`
(74-91) stops when `canLeave()` is false unless `force`. It sets the tab back to `'system'`,
calls `closeHexEditor` when editing, hides and inerts the pane, `CampaignAtlas.releaseView`,
`TradeMatch.close`, `syncMapFocus`, and sets both rail toggles to `aria-expanded="false"`.

**Escape while open** (1263-1296), capture phase, ignored inside `#omni-search`, an open
`.campaign-stardate-dialog` or `.atlas-crop-dialog`, or `#world-image-panel`. Order: close an
open `.atlas-menu`; else `TradeMatch.close`; else `CampaignAtlas.cancelPick`; else
`closeHexEditor`; else if a campaign draft exists, `render()` when `canLeave()`; else if the
orrery is closed, leave the body or close the pane.

**Scanner.** States in the comment at 498-501: `waiting`, `ready`, `revealing`, `full`.
`mapSheet` (507-524) keys a cache of at most 16 by
`[spec.seed, spec.worldData, planetContinentalDefinition, planetCoastlineComplexity, printMode]`.
A cached sheet in state `full` is appended with no scanner (590). A new sheet waits two
`requestAnimationFrame` callbacks, then `PlanetRenderer.renderFlatMap(..., { projection: 'diamond' })`,
then `state = 'ready'`. While not `full`, the lead is `aria-busy="true"` and `mapScanner`
(552-577) shows `blankSheet` (`PlanetRenderer.renderDiamondBlank`, 526-538) plus a beam that
starts `scan-down`. On `animationend`, a `ready` sheet calls `revealSheet`; otherwise the beam
class swaps to the other direction. `revealSheet` (541-550) sets `revealing` until the canvas
`animationend`, then `full` and removes `aria-busy`. CSS (`style.css:2863-2921`): waiting and
ready hide the real canvas; revealing runs `map-reveal` for `--scan-pass: 0.9s`; each pass is
`--scan-cycle / 2` with `--scan-cycle: 2.4s`. A different world crossfades the previous full
sheet (`.map-outgoing`, 0.24s) and, if the new sheet is already `full`, adds `.is-arriving`
(0.36s after 0.12s) (598-609, `style.css:2910-2921`). `prefers-reduced-motion`: a sheet already
`ready` reveals immediately (592); `revealSheet` skips the fade (548); CSS sets
`animation: none` and hides `.map-outgoing` (`style.css:2923-2925`). A sheet still `waiting`
still mounts the scanner.

## 4. Controls

Read-only navigation and view:

| Control | Does | Edits data |
|---|---|---|
| Column / Half / Full (`hex_map.html:1404-1408`, 1252-1253) | `applySpan`, then `render()` if a body is open | no (writes `localStorage` only) |
| Close (`hex_map.html:1411`) | `close()`, focus `#atlas-toggle` | no |
| `#atlas-toggle` (1226-1234) | close, or show the system tab and `refresh(true)`; may call `openHexEditor` | no, unless it opens the editor |
| Surface map button (583, 733-736) | `openDiamondWorldMap(body, hexId)` | no |
| Explore orbits (1000-1003) | `SystemViewer.open(hexId)` when the orrery is not already here and `normalizeSystem(state)` is truthy | no |
| Mainworld (1006-1009) | `focusBody(mapped)` | no |
| Body row (836-837) | `focusBody` | no |
| Breadcrumb (1105-1110) | `leaveBody` or `focusBody(parent)` | no |
| Previous / Next (710-716) | `focusBody` of the neighbour in `navBodies` (157-165). Disabled at the ends | no |
| Center (719-727) | only while the orrery is on this hex: `SystemViewer.centerOnBody`, then `render` | no |
| Orbits (728-731) | `SystemViewer.open` then `centerOnBody` on the next frame (697-703) | no |
| Trade-code chip (405-417) | `TradeMatch.open({ hexId, focus, sourceLabel })` or `close` when that chip is already the focus. Title: "Worlds that trade with this, within 12 hexes" | no |
| Referee-notes `<summary>` (1037) | opens or closes the note | no |

Edits data (later slice):

| Control | Does |
|---|---|
| Edit (`hex_map.html:1409`, 293-304, 1255-1257) | Shown when the tab is `system`, `state.type === 'SYSTEM_PRESENT'`, and one of `ctData`, `mgt2eData`, `t5Data`, `rttData` is set. Calls `openHexEditor(hexId)` or `closeHexEditor()`. Label becomes `Editing` |
| Edit system (1011-1012) | Shown when any of `ctData`, `ctSystem`, `mgt2eData`, `mgtSystem`, `t5Data`, `t5System` is set. Calls `SystemEditor.openEdit(hexId)` |
| Campaign row (639) | `CampaignAtlas.openRecord` |
| Campaign chips and the Record menu (655-681, 738) | `CampaignAtlas.createAt` for each `api.TYPES` |
| `#campaign-toggle` (1236-1238) | switches to the campaign workspace (`CampaignAtlas.showAll`) or closes it |

`#edit-stellar-mask` is not drawn here. Journey HTML still reads it if it is in the document
(`js/hex_editor.js:33-34`).

## 5. Chart row versus generated tree

`mainworld` (39-40) is the profile object: `aowSystem.mainworld`, else `mgt2eData`, `ctData`,
`t5Data`, `rttData`. The identity rows in §1.D and the overview ribbon read that object and the
hex-state fields named in the table (`uwp`, `tradeCodes`, `travelZone`, `allegiance`,
`allegianceName`, `bases`, `notes`, `gasGiantCount`, `beltCount`, `t5Data`, `t5Socio`, `mgtSocio`).

The tree is `system`, from `normalizeSystem` / `currentSystem`. `_detectSystem` reads only
`aowSystem`, `mgtSystem`, `ctSystem`, `t5System`, `rttSystem`, and only when `stars.length > 0`
(`js/system_viewer.js:444-455`). From that object the dossier reads `stars`, `worlds`, `moons`,
`age`, `edition`, and the body fields in §1.J, §1.K, and the body profile. `mappedMainworld`
prefers a tree body with `type === 'Mainworld'` and falls back to the profile (877-885).

`state.mgtSocio` and `state.t5Socio` are read by name. They are not taken from `system.stars`
or `system.worlds` in this file.

## 6. Poll, timers, globals

**Poll.** `setInterval(() => refresh(), 800)` (1262). The comment above it (1260-1261):
"Generated data is edited in place by existing tools. Only inspect one hex, and only while
visible; polling avoids changes to generation engines." `refresh` returns immediately when
`open` is false (1196). A changed `JSON.stringify(state)` drops the open body (1200-1202).

**Other timers.** Two `requestAnimationFrame`s before the map draw (517). `requestAnimationFrame(draw)`
when the inspected hex changes (1189-1193). `requestAnimationFrame` before `centerOnBody` (700).
`animationend` on the scan beam (562), the revealing canvas (550), and the outgoing canvas (607).
`window` `resize` calls `layout` (1259). `prefers-reduced-motion` is read via `matchMedia`
(506) and is not given a listener in this file. No other `setInterval` or `setTimeout`.

**Reads.** `hexStates`; `window.sectorNames`; `window.subsectorNames` through `getSubsectorName`;
`window.CampaignAtlas` and `window.campaignAtlas`; `window.TradeMatch`; `window.SystemViewer`;
`window.SystemEditor`; `window.UniverseSnapshot`; `window.AppNavigation`; `window.dbManager`;
`window.planetContinentalDefinition`; `window.planetCoastlineComplexity`; `window.printMode`;
`window.openDiamondWorldMap`; `window.PlanetRenderer`; `toEHex`, `formatUwpDigit`,
`formatTradeCodes`, `formatDisplayNumber`, `buildJourneyTimesUI`, `openHexEditor`,
`closeHexEditor`, `editingHexId`, `draw`; `localStorage['traveller_inspector_span']`.

**Writes.** `window.SystemInspector` (2, 1300-1303). `--inspector-width` and the class
`inspector-open` (60-61). Pane `hidden`, `inert`, `data-span`, `data-workspace`, class `editing`.
`localStorage['traveller_inspector_span']` (280). `aria-expanded` on `#atlas-toggle` and
`#campaign-toggle` (88-89, 272-273). Removes `open` from `#help-panel` (70). Appends
`#atlas-glyph-defs` to `document.body` (186-200). Moves `#hex-editor` into the pane (1246-1248).
Does not assign `hexStates` in this file. Calls that write other modules' state: `ensureSystemBuilt`,
`prefetchAround`, `SystemViewer.open` / `refresh` / `selectBody` / `centerOnBody`, `TradeMatch.open`
/ `close` / `sync`, `CampaignAtlas` create, open, release, and focus methods, `openHexEditor`,
`closeHexEditor`, `SystemEditor.openEdit`, `openDiamondWorldMap`, and `draw`.

## 7. Gaps

Shown, and not found in this file as a field of the chart profile (`mainworld`) or of the
normalized tree (`system.stars` / `system.worlds`):

- Place line: `window.sectorNames`, `window.subsectorNames` (`core.js:88-93`).
- `state.mgtSocio` (the whole socio block and the identity resource-units fallback).
- `state.t5Socio.nobleCodes` and `state.t5Socio.RU`.
- `state.gasGiantCount` and `state.beltCount` (identity rows and the PBG fallback). Where those
  two counts are written: not found in `system_inspector.js`.
- `state.allegianceName`. No lookup from `state.allegiance` to a name in this file.
- `state.notes`.
- Campaign rows: `window.campaignAtlas` through `CampaignAtlas.recordsForHex` / `recordsForBody`.
- Jump hours: computed in `buildJourneyTimesUI` / `UniversalMath`, not stored on the world.
  Also reads `#edit-stellar-mask` when that node exists.
- Surface image: `PlanetRenderer`, `window.planetContinentalDefinition`,
  `window.planetCoastlineComplexity`, `window.printMode`, and `PlanetRenderer.imageSeed`
  (`js/hex_editor.js:2339-2346`). Inputs from the body are `worldMapData`
  (`js/hex_editor.js:2295-2320`): `name`, `size`, `atmCode` / `atm` / `atmosphere`, `hydroCode` /
  `hydro` / `hydrographics` / `hydrosphere` / `hydroPercent`, `meanTempK` / `avgSurfaceTemp` /
  `temperatureK`, `tempBand`, `uwp`.
- Glyph colour: `SystemViewer.surfaceKind` and `SystemViewer.starColor` (203-204, 231). The
  fallback kind is the string `barren`.
- Day tile: `SystemViewer.rotationText` (778, `system_viewer.js:4318-4322`).
- Header and tree text for a body use `SystemViewer.locationForBody` / `locationEntries` when
  those exist (114-121). The key format: not found in `system_inspector.js`.

Not found in the code: a loading sentence for the tree other than §1.G, and a loading sentence
for socioeconomics other than the one in §1.I. The design-reference column width of 320px is
not the `data-span="column"` width.
