# Campaign Manager — Design Plan

**Status:** PLAN, awaiting review. Nothing here is implemented. Drafted 2026-10-02.
**Scope:** turn the Campaign Atlas into a complete referee's instrument for an epic
Mongoose Traveller 2e campaign — war, trade, faith, exploration — without leaving the map.
**Rules posture:** every RPG number on a character or ship sheet comes from a file in
`rules/` that Sean supplies. This plan designs the *frames*; it does not fill in the rules
(§10 lists what is needed, Halt & Challenge style).

---

## 0. Where we actually are (audit, 2026-10-02)

Read before judging the plan. These are facts from the code, not opinions.

### What is already good and must be kept

| Thing | Where | Why it matters |
|---|---|---|
| Records of 8 types anchored to a system **and a body** (`anchor.bodyKey`) | `campaign_atlas.js:46-52` | The "everything lives somewhere" idea already exists |
| Locator line from panel to map/orbit target, follows pan/zoom via its own rAF | `campaign_atlas.js:251-317`, `style.css:339-350` | Our first delighter; the whole plan builds on this feeling |
| Images: resized to WebP, thumbnails, 50 MiB budget, GC of orphans, bytes never in undo | `campaign_assets.js`, `db_manager.js:539-556` | Solved properly once; reuse for portraits, ship art, handouts |
| Stardate clock (year × 365 + day, fractional day = time) persisted and shared with the orrery | `system_viewer.js:5242-5290` | The time axis already has a source of truth |
| Fog of war per hex, player export fails closed on untagged fields | `disclosure.js`, `export_core.js:566-611` | The referee/player split has a proven pattern to copy |
| `saveHistoryState` is called before every mutation app-wide | `core.js:233-361` | Becomes `markChanged` in Persistence v2 — the one change signal autosave, index and events hang off |
| Single-system backup carries its campaign records with it | `io_manager.js:2430-2503` | Portability of a place and its cast |
| Omni-search already indexes campaign records | `input_init.js:371-531` | The command palette has a seed |
| Inspector with column/half/full span, `el`/`button`/`iconButton` helpers | `system_inspector.js:13-38, 275-290` | One panel, three widths — we extend this, we do not add windows |

### What blocks an epic campaign today

1. **No links.** `normalizeRecord` rejects any `links` (`campaign_atlas.js:45`). No organizations
   with members, no hierarchy, no "owns", no "enemy of". Every record is an island.
2. **Every record must sit at a system** (`anchor.kind === 'system'` is mandatory, line 32).
   A sector-wide church, a fleet in jump, a person aboard a ship — none can be modelled.
3. **Events have no date.** `event` is a type with only real-world `createdAt`. There is no
   timeline, no Imperial `DDD-YYYY` formatter, no "when" on anything.
4. **Players do not exist.** `visibility` is hard-coded `'referee'` (line 50). Exporters
   never read the atlas (`html_exporter.js`, `obsidian_exporter.js`). There is no player
   journal and no way for a player's notes to come back.
5. **No ships, no characters, no sheets.** `rules/mgt2e_data.js` holds world/stellar tables
   only — no characteristics, skills, hulls or components (`grep` confirmed, 2026-10-02).
6. **Every commit clones and rewrites the entire atlas** (`snapshot()` → `commitCampaignAtlas`
   → one IndexedDB key `campaignAtlas`). 20,000-record cap. This will not scale to a
   timeline of thousands of entries.
7. **Motion layer is nearly nil.** Pan and zoom are instant; every "go to" teleports
   (`centerHexInView`, `core.js:497`); wheel ignores `deltaMode`/magnitude; no inertia; no
   keyboard pan; toasts have no type or action; `alert()`/`confirm()` ×71; four different
   show/hide mechanisms; no shortcut registry; no global design tokens (only `--atlas-*` on
   the inspector).
8. **Inspector polls** every 800 ms and `JSON.stringify`s hex state to detect change
   (`system_inspector.js:1257`).
9. **Allegiances are never written to IndexedDB** — `allegiances.js` calls
   `dbManager.saveAllegianceDefinitions?.()`, which does not exist. Factions will lean on
   allegiances; this must be fixed first.
10. Side bug: `applyHistoryPatch` never restores `routeDefinitions` though it stores them.

---

## 1. The feeling we are building

Ten rules. Each later section cites them by number.

1. **The map is home.** Nothing opens a new window. Panels slide over the map; the map
   answers every panel by moving the camera. Closing a panel returns you to where you were.
2. **The camera moves, it never teleports.** Every "go to" is a flight (§6.1). Short hops
   are quick; long ones arc out and back in so you keep your bearings.
3. **Everything is a link.** Any name can be dragged, hovered, @-mentioned, or dropped on
   something else. If two things are related, the relation shows on *both* pages.
4. **Time is an axis, not a page.** The stardate is visible everywhere in the Campaign
   workspace. Any dated thing can be found on the timeline; scrubbing time moves ships and
   dims what has not happened yet.
5. **Referee first, players by export.** One switch on every record and journal entry.
   Player-facing output is produced from the referee's truth; it never leaks by default.
6. **Rules are data.** Sheets render from `rules/` schemas. Nothing on a sheet is typed
   into JS from memory. Where data is absent the sheet degrades to a free-form sheet, it
   never invents.
7. **No modal for the common path.** There is no undo (decided 2026-10-02, see
   `directives/persistence_v2.md`). Destroy → **tombstone** + toast with *Restore*; bulk
   actions take an autosave first. `confirm()` is reserved for Clear Canvas / Clear Sector.
8. **Keyboard parity.** Every pointer interaction has a keyboard route; a shortcut
   registry generates the help screen.
9. **One panel, three widths.** Column for glancing, half for reading, full for
   charts/timelines. Layouts are designed for all three, not one.
10. **Degrade gracefully at scale.** 20k records, 50 MiB of images, 10k timeline entries:
    lists virtualize, indexes are incremental, saves are per-record.

---

## 2. Data model v2

`campaignAtlas.schemaVersion` becomes `2`. v1 stores load and upgrade in memory; the
upgraded store is written only after a successful normalize (same posture as `prepareImport`).

### 2.1 Store

```js
{
  schemaVersion: 2,
  records:  { [id]: Record },     // cr_…
  links:    { [id]: Link },       // cl_…
  journal:  { [id]: Entry },      // cj_…
  assets:   { [id]: ImageMeta },  // ca_…  (unchanged)
  settings: {
    calendar: { dateFormat: 'imperial' | 'long' },        // display only
    party:    { vesselId: null, memberIds: [] },           // "the PCs"
    kinds:    { organization: [...], place: [...], item: [...] }  // user-extensible sub-types, seeded (§2.2)
  }
}
```

### 2.2 Record

```js
{
  id, type, name, summary, details, tags, images, primaryImageId, createdAt, updatedAt, provenance,
  kind: '' ,                  // sub-type label from settings.kinds[type]; free text allowed
  anchor: null                // "nowhere in particular" (a sector-wide faith, an idea)
        | { kind: 'system', hexId, locationLabel, bodyKey? }   // v1 shape, unchanged
        | { kind: 'record', id },  // "wherever THAT is": a person aboard a vessel, a bar inside a startown
  when: null | { start: { year, day }, end?: { year, day } },  // event, job; optional elsewhere
  visibility: 'referee' | 'players',
  playerNotes: '',            // player-authored; always player-visible; never overwritten by referee edits
  sheet: null | Sheet,        // person, vessel (§5)
  status: null | Status       // vessel (§5.3), job ({ state: 'open'|'accepted'|'done'|'failed' })
}
```

**Types.** The 8 existing types stay exactly as they are (saved maps and
`campaign_sample.js` keep loading). One is added: **`vessel`**. A character is a `person`
with a `sheet` and `kind: 'pc'`. A fleet is an `organization` of kind `fleet` whose members
are vessels. A religion is an `organization` of kind `faith`. `business` stays a type for
compatibility; new businesses may also be entered as `organization` kind `company` — the
list and chart views treat both alike.

**Seed kinds** (editable per campaign, stored in `settings.kinds`; purely labels, not rules):
- organization: `government, nobility, military, navy, scout service, corporation, company,
  faith, order, guild, syndicate, cartel, rebellion, fleet, mercenary unit, academy, family`
- place: `startown, downport, highport, naval base, scout base, station, settlement, ruin,
  outpost, wilderness, ship interior`
- item: `cargo, artifact, document, weapon, vehicle, data`
- person: `pc, npc, patron, contact, ally, rival, enemy` (the last five are also link kinds;
  the kind is a quick label, the link is the relationship)

**Anchor resolution.** `CampaignIndex.locate(id)` follows `anchor.kind === 'record'` chains
(max depth 8, cycle-safe) to a system anchor or `null`. A person aboard a vessel is wherever
the vessel is *now* (§5.3 position log). This is what the locator line, the map layer and
"Where are the PCs" all call.

### 2.3 Link

Links live in their own map, once, so both ends see them and a change (or a tombstone)
touches one document, not two records.

```js
{ id, from, to, kind, role: '', order: 0, since: null | {year,day}, until: null | {year,day},
  notes: '', visibility: 'referee' | 'players', createdAt, updatedAt }
```

**Kinds** (`js/campaign_links.js`, a vocabulary table with inverse labels and allowed
type pairs — labels only, no rules):

| kind | from → to | label on `from` page | label on `to` page | notes |
|---|---|---|---|---|
| `member` | person/org/vessel → org | Member of | Members | **hierarchy edge**; `role` = title ("Bishop", "Captain"), `order` = sort among siblings |
| `owns` | person/org → vessel/item/place/business | Owns | Owned by | |
| `crew` | person → vessel | Crew of | Crew | `role` = post ("Pilot", "Engineer") |
| `commands` | person → vessel/org | Commands | Commanded by | |
| `ally`, `rival`, `enemy`, `contact` | person/org ↔ person/org | Ally / Rival / Enemy / Contact | same (symmetric) | symmetric: one link, rendered on both |
| `family` | person ↔ person | `role` ("mother") | inverse typed by user | |
| `patron` | person/org → job | Patron of | Patron | |
| `client` | person/org → job | Client of | Client | |
| `target` | job → anything | Concerns | Subject of | |
| `involved` | anything → event | Involved in | Involved | `role` ("instigator") |
| `faith` | person/org → org(kind faith) | Follows | Followers | |
| `presence` | org → place/system record | Present at | Presence of | drives map halos (§6.4) |
| `custom` | any → any | `label` | `inverseLabel` | free text both ways |

**Hierarchy** = the subgraph of `member` edges where `to` is an organization. Writes run a
cycle check (DFS from `to` up to roots; reject with "That would make X its own ancestor").
Multiple parents are allowed (an order inside a church *and* a noble house); the org chart
draws a node under its first `member` link by `order` and marks "also in …".

### 2.4 Journal entry

```js
{ id, kind: 'session' | 'note' | 'handout' | 'rumor', title, body, when: { year, day },
  realDate, sequence,            // session number for kind 'session'
  author: 'referee' | 'players', visibility: 'referee' | 'players',
  anchor: null | { kind:'system', hexId } | { kind:'record', id },
  mentions: []                   // derived from [[…]] tokens on save; stored for fast backlinks
}
```

### 2.5 Text with links

`details`, `playerNotes`, `body`, link `notes`: plain text with inline tokens
`[[cr_abc|Captain Voss]]` and `[[hex:1-A-0101|Regina]]`. Rendered as chips (§4.4); typed
with `@` autocomplete. No HTML. Line breaks preserved; `#tag` tokens become tag chips.
Rename a record → all tokens re-label on render (token carries the id, the label is a
fallback for export).

### 2.6 Identity and anchors

- Ids: `cr_`, `cl_`, `cj_`, `ca_` + `crypto.randomUUID()` (as `CampaignAssets.id()` does).
- `remapSectorSlots` (`core.js:595`) already rewrites `anchor.hexId`; it must also rewrite
  `journal[*].anchor.hexId` and vessel position-log hexIds. `purgeSectorSlots` must *detach*
  (anchor → `null`, status → "location unknown") rather than delete records whose system is
  cleared — a cast should survive a redrawn map.

### 2.7 Index (in memory, rebuilt incrementally)

`window.CampaignIndex` — never persisted:

- `byType`, `byKind`, `byTag`, `byHex` (resolved location), `byAnchorRecord`
- `linksFrom`, `linksTo` (Maps of Sets), `children(orgId)`, `parents(id)`
- `mentions(id)` from token scans of details/journal (backlinks)
- `dated[]` sorted by `when.start` for the timeline (records with `when`, journal entries,
  vessel position log rows)
- `search` word index feeding the command palette (replaces the per-keystroke scan in
  omni-search)

Rebuild is per-commit from the list of changed ids (the commit API returns it); a full
rebuild on load must stay under 50 ms for 20k records (measured, not assumed — add to
`utilities/campaign_atlas_test.js`).

---

## 3. Persistence v2

### 3.1 IndexedDB (DB_VERSION 3)

New object store `campaign`, out-of-line keys:

| key | value |
|---|---|
| `meta` | `{ schemaVersion: 2, settings }` |
| `record:<id>` / `link:<id>` / `journal:<id>` | one document |
| `asset:<id>` | image meta (payload stays under `appState` `campaignAsset:<id>` — unchanged, so the GC and the per-system backup keep working) |

Commit writes only the keys the edit touched (`put`/`delete` lists), in one transaction,
through the existing serialized `_campaignWrite` queue. Load cursors `campaign` once.

**Upgrade path:** on open, if `appState.campaignAtlas` exists and `campaign.meta` does not:
normalize v1 → convert to v2 in memory → write all keys → only then delete the legacy key.
A failure leaves the legacy key untouched and sets `_campaignLoadError` exactly as today.

### 3.2 Deletes and Restore (no undo)

There is no undo stack (`directives/persistence_v2.md`). A deleted record, link or journal
entry becomes a **tombstone** (`{ id, deleted: true, rev, updatedAt }`), hidden by the index,
restorable from the toast ("Deleted *Captain Voss* — Restore") or from a *Trash* view in
the Campaign workspace, and purged by the GC after 90 days. Bulk campaign actions (import
player notes, merge, delete-by-filter) call `Saves.beforeBulk(label)` first. Every commit
calls `markChanged('…', { campaign: true })` so the autosave and the change event fire.
`reachable()` for image GC = working copy + save slots' `assetIds` + staged uploads.

### 3.3 Save file

`campaignAtlas` key in the map JSON carries the v2 store; `campaignAssets` unchanged.
Loader accepts v1 or v2. Single-system export (`exportSystemJson`) includes: records resolved
to that system, links between included records, journal entries anchored there. Links to
records outside the file are exported as **stubs** (`{ id, name, type }`) so the importer can
offer "link to an existing X named Y?" — no silent dangling edges.

### 3.4 Sync-ready from day one (decided 2026-10-02, for the later Cloudflare version)

The cloud version (§13) must be a sync adapter over this store, not a second app. That
costs the local version four small things. The hex-side ones (`rev`, tombstones,
`campaignId`) are delivered by `directives/persistence_v2.md` before this plan starts; the
campaign-document ones land in Phase 0:

- Every campaign document carries `rev` (integer, +1 per write) beside `updatedAt`.
- Deletes write a **tombstone** (`{ id, deleted: true, rev, updatedAt }`) instead of removing
  the key; the index hides tombstones; GC after a configurable age (default 90 days).
- The store is namespaced by a **campaign id** (`settings.campaignId`, a UUID); the
  IndexedDB keys become `<campaignId>/record:<id>` so one browser can hold several
  campaigns, which the local version wants anyway.
- `stripHexViewState` stamps `updatedAt` and `rev` on a hex at save time so system edits
  can sync too (one line; no behaviour change locally).

A commit's patch (`{ puts: [docs], deletes: [ids] }`) is exactly the payload a Worker will
accept later. Nothing else in this plan changes for the cloud.

### 3.5 Change events

`CampaignAtlas.commit` dispatches `document` event `campaign:changed` with
`{ records:[ids], links:[ids], journal:[ids] }`. The inspector, map layer, timeline and
palette subscribe. The 800 ms poll in `system_inspector.js:1257` is retired; the hex-state
side gets the same treatment via a `hex:changed` event raised from `saveHistoryState`.

---

## 4. Campaign workspace — information architecture

The Campaign workspace stays inside `#system-inspector` (rule 9). The nav rail gains three
buttons under the existing type buttons: **Party**, **Timeline**, **Journal**. The stardate
readout moves into the workspace header beside the title (always visible, click to edit,
`±` keys nudge a day).

```
Campaign ▸ Home            dashboard: party, clock, open jobs, recent, "nearby" for the inspected system
         ▸ People/Places/… existing type lists (now with kind sub-filter, sort, group-by-system)
         ▸ Record          a page per record (§4.2)
         ▸ Org chart       hierarchy view for an organization (§4.3)
         ▸ Party           party ship status + member sheets (§5)
         ▸ Timeline        ribbon (§7)
         ▸ Journal         sessions, notes, handouts (§8)
```

Navigation is a **stack**: Back always returns to the previous view with its scroll and
selection (the existing `origin` idea generalized). Browser-like: Alt+← / Alt+→.

### 4.1 Lists (all types)

- Toolbar: search, type chips (existing), **kind** chips (appear when the type has kinds),
  sort (name / updated / stardate for dated), group by (none / system / organization).
- Rows: portrait or initial, name, summary, meta line; a **where** chip that flies the camera
  on hover-hold (350 ms) and on click; **drag handle** — rows are draggable (§4.4).
- Virtualized past 200 rows (fixed-height rows, recycled nodes).
- Keyboard: ↑↓ move, Enter open, Space track (locator), `l` link-to…, `m` move-to-hex, `e`
  edit, Del delete (tombstone, toast with Restore).
- Empty states say what to do next and offer the one action ("Add a person at Regina").

### 4.2 Record page (column / half / full)

Top to bottom; sections collapse and remember their state per type.

1. **Identity.** Portrait/cover (click → lightbox), name, kicker `Type · Kind · Where`,
   **visibility eye** (referee/players toggle; players state tints the header edge amber),
   dated badge for `when`.
2. **Where.** The resolved location with the locator line, plus the chain when anchored to a
   record ("aboard *Far Margin* → in orbit of Regina"). "Fly to" button. For vessels this is
   the position log head (§5.3).
3. **Summary / Details.** Details render tokens as chips (§4.4). Edit in place (single
   click on the text → editor with the same tokens; Esc cancels, Ctrl+Enter saves).
4. **Relationships.** Grouped by link kind using the inverse labels from §2.3. Each entry:
   chip + role + since/until. Hover a chip → **hover card** (portrait, summary, where, 2–3
   relationships). Inline "+" per group opens the picker (§4.4). Empty groups are hidden;
   a single "Add relationship" affordance remains.
5. **Hierarchy** (organizations only): ancestor breadcrumb, children as a compact tree
   (two levels, expandable), "Open org chart".
6. **On the timeline.** Dated things that mention or involve this record, newest first,
   each a row that flies the camera and selects it on the ribbon.
7. **Mentions.** Backlinks from details and journal.
8. **Player notes** (if visibility is players): rendered distinctly (amber rule), editable
   only in Player Edition (§9); referee sees it read-only with a "clear" option.
9. **Images.** Existing strip.
10. **Sheet / Status** (person with sheet, vessel): §5.

Widths: column shows 1–4 with 5–10 as collapsed headers; half opens 4–7; full lays 1–3 and
4–7 side by side and opens the sheet.

### 4.3 Org chart (full span, works in half)

- Tidy tree (layered, Reingold–Tilford-style horizontal spacing), root = the organization
  (or its topmost ancestor with a breadcrumb to switch). Nodes are cards: portrait, name,
  role, member count. Collapsed subtrees show a count.
- Same camera as the map (§6.1): wheel zoom to cursor, drag pan, inertia, `Fit` and `Focus`.
- **Drag a node onto another node → re-parent** (writes the `member` link; toast with Restore of the previous parent).
  Drop on empty canvas → detach. Shift-drag → add as *additional* membership.
- Click a node → selects it on the chart and loads its page in a side column (half span) or
  a hover card (full span) without leaving the chart.
- Keyboard: arrows walk the tree, Enter opens, `r` re-parent (picker), `+/-` expand/collapse.
- Vessels in a fleet org appear with their status dot (§5.3).
- Export: PNG of the chart via the same offscreen pattern as `captureSubsector`.

### 4.4 Linking interactions (rule 3)

1. **@-mention.** In any text field, `@` opens an inline popover fed by `CampaignIndex.search`
   (records first, then systems by name/hex). Enter inserts a token; the chip renders live
   in the editor (contenteditable with token spans; plain-text fallback keeps the raw form).
   `@@` inserts a *new* record of the typed name at the current anchor and links it.
2. **Drag and drop.** Draggable: list rows, chips, chart nodes, journal mention chips.
   Drop targets: a record page's Relationships area (→ link-kind popover, prefilled by the
   type pair, e.g. person→org = *member* with role field focused), a chart node (→ member),
   a map hex (→ "Move *X* to *Regina*?" inline chip, Enter confirms; the toast offers *Put back*), the Party
   panel (→ crew/member), the timeline (→ sets `when` to the dropped day).
   Native HTML5 drag with a custom drag image (the chip); keyboard route is `l` on a row.
3. **Picker.** One component: search box, type/kind filter, recent, "Create new…" row.
   Used by Relationships "+", `l`, re-parent, the party builder and move-to.
4. **Chips** everywhere: `[portrait] Name` with the type icon; hover 300 ms → hover card;
   click → open; middle-click/Ctrl+click → open in half span without leaving current view.

### 4.5 Command palette (Ctrl+K, `/` when the map has focus)

Upgrade of omni-search, same DOM. Sections: Records, Systems, Journal, Timeline, Actions,
Navigation. Actions are verbs with context: "New person at Regina", "Jump party to…",
"Advance clock 1 day / 7 days / to date…", "Open org chart of …", "Toggle campaign layer".
Selecting a record flies the camera (§6.1) *and* opens the page. Recent items first on an
empty query. Fed by `CampaignIndex.search`, so it is O(prefix) not O(records).

---

## 5. Party, ships and characters (MgT2E)

### 5.1 Principle

The sheet engine (`js/campaign_sheets.js`) renders from a **schema file in `rules/`** that
Sean provides (§10). The engine knows field types; it does not know Traveller. Until the
schema exists a person/vessel gets the **free-form sheet**: named sections, key/value rows,
simple tables — fully usable, nothing invented.

Schema shape the engine consumes (this is the contract we are asking for, not the content):

```js
// rules/mgt2e_character_sheet.js  (read-only, supplied)
window.MGT2E_CHARACTER_SHEET = {
  version: 1,
  sections: [
    { id, title, layout: 'grid' | 'table' | 'list',
      fields: [ { id, label, type: 'int' | 'text' | 'enum' | 'list' | 'table' | 'derived',
                  enum?: [...], columns?: [...], expr?: '…' } ] }
  ],
  vocab: { /* any lists the fields reference, e.g. skills with specialities */ }
};
```

`derived` fields carry an expression evaluated by a tiny safe evaluator (arithmetic, lookup
in `vocab`, `floor`, `max`, `min`) — the *formula* lives in the rules file, never in JS.

### 5.2 Character (person with sheet)

- `sheet: { schema: 'mgt2e_character@1', values: { fieldId: value } }`.
- The page's Sheet section renders the schema; Relationships already show allies, contacts,
  rivals, enemies (link kinds), crew post and memberships.
- "Equipment" = `owns` links to item records plus an inline free table if the schema has one.
- `kind: 'pc'` adds the person to the Party panel; Party membership is `settings.party.memberIds`.
- Export: a one-page printable sheet (print stylesheet) and inclusion in the Player Pack
  when visibility is players.

### 5.3 Vessel

`sheet` as above against `mgt2e_ship_sheet@1` (hull, drives, components — from the rules
file). `status` is engine-owned and schema-independent:

```js
status: {
  position: [ { when: {year, day, seconds}, hexId, bodyKey?, state: 'docked'|'orbit'|'jump'|'transit', note } ],
  // newest last; the head is "now"; a 'jump' row has an `arrives` date
  condition: { [fieldId]: value },       // fields named by the ship schema (hull, fuel, …); free-form otherwise
  cargo:     [ { itemId?, label, tons, value, origin, destination, note } ],
  passengers:[ { personId?, label, class } ],
  ledger:    [ { when, amount, memo, kind: 'income'|'expense'|'recurring' } ],
  log:       [ { when, text } ]           // maintenance, repairs, incidents
}
```

**Ship status panel** (Party ▸ ship; also the vessel page's Status section):
- Header: ship art, name, class/kind, **status dot** (docked/orbit/jump/transit) and where.
- Crew roster from `crew` links with posts; empty posts show as dashed slots (post names from
  the schema if it names them; otherwise free).
- Condition gauges rendered from schema (bar when the field declares `max`).
- Cargo manifest table with tonnage total; rows link to item records; a "sell here" button
  is **not** a rule engine — it opens the existing Trade Match panel for the current system.
- Ledger with running balance; recurring entries are *reminders* on the timeline, nothing
  is computed from rules.
- **Jump** action: picker for a destination within range *entered by the referee* (range
  drawn as a hex ring on the map while picking — pure geometry, `getHexDistance`), arrival
  date defaulted from `settings.jumpDurationDays` **if set** (§10 Q3), else asked. Writes a
  `jump` position row and an `arrives` row; the map plays the flight (§6.1) and a dashed
  jump trail; the clock does not auto-advance — "Advance clock to arrival" is offered in the
  toast.

### 5.3a The Jump button (clock)

Supplied by the referee 2026-10-02: a jump takes **one week (168 hours)** by default. This is
the first rule-derived number in the campaign layer and it lives in
`settings.jumpHours = 168`, editable in Settings, never hard-coded in the engine.

The clock readout in the workspace header gets a **Jump** button beside it:

- Click → the clock advances by `settings.jumpHours`, the readout counts up with a short
  tick animation (digits roll, 400 ms), a toast says "Jumped: 7 days — now 008-1105 0830 ·
  Back" (restores the previous time). One click, no dialog.
- Hold or Shift+click → an inline popover with a duration field prefilled from settings
  (hours, with `d` suffix accepted: `7d`, `170h`), Enter commits. The last tweaked value is
  remembered for the session, the default is not changed.
- If the party vessel exists, Jump also offers "and move *Far Margin* to …" (opens the
  §5.3 jump picker) so clock and position advance together; when a jump position row has
  an `arrives` date, the button reads "Arrive" and jumps the clock exactly to it.
- Keyboard: `J` in the Campaign workspace. The previous time is kept for the toast's *Back*;
  autosaved on the existing 600 ms debounce.

### 5.4 Party panel

Party ship status, member cards (portrait, name, where if not aboard), open jobs (jobs with
`client`/`patron` links to party members or state `accepted`), today's reminders. "Where are
the PCs" is a nav-rail action that flies to the party ship and pulses it.

### 5.5 Dice

A generic roller in the palette and the sheet (`2d6+1`, `3d6`, `d66`) with a visible log.
No target numbers, no task rules, until §10 Q6 is answered.

---

## 6. Motion, loading and chrome (the meticulous part)

> Delivered earlier by `directives/bugfix_pass.md` Step 3 (§G): the LOD frame dissolve
> (presentation-only, no repaint), threshold hysteresis, eased wheel zoom, frame coalescing
> through `scheduleDraw()`, and the `uiShow`/`uiHide` chrome convention. §6.1–6.2 below build
> on those and do not change them.

### 6.1 Shared camera (`js/camera.js`, new — nothing in `js/` does this today)

One helper used by the sector map, the org chart and the timeline ribbon:

- `flyTo({ x, y, zoom }, { duration })`: duration = clamp(350, 900, 350 + 120·log2(1 + distance/screen)).
  Ease in-out cubic. For long hops the zoom follows a **lift-and-settle** curve: zoom out to
  `min(current, fit(both points))` at the midpoint, then in — the eye never loses the sector.
  While in flight the map presents the scaled pan cache (`_presentScaledCache`) and renders
  one sharp frame at the end; cancelled by any pointer/wheel input (hand-off is seamless: the
  flight's current pose becomes the new camera). `prefers-reduced-motion` → instant with a
  single 120 ms crossfade.
- **Inertia:** sample pointer velocity over the last 80 ms; on release decay ×0.92 per frame,
  stop below 0.05 px/frame; re-engages the pan cache slack rule (48 px) so blits stay cheap.
- **Wheel normalization:** `deltaMode` lines→16 px, pages→viewport; zoom factor
  `exp(−deltaY · 0.0015)` clamped per event to [0.8, 1.25]; pinch (`ctrlKey` wheel) uses
  the same path; zoom stays cursor-anchored (existing math).
- **Keyboard pan/zoom:** arrows (hold accelerates), `+`/`−`, `0` fit selection, `Home` party.
- Every existing teleport (`centerHexInView`, `fitHexesInView`, `centerSectorInView`,
  omni-search `focusSystem`, `CampaignAtlas.syncMapFocus`) routes through `flyTo`.
- All ~200 direct `requestAnimationFrame(draw)` call sites migrate to `scheduleDraw()` so
  frames coalesce (mechanical sed, verified by grep count).

### 6.2 Panel and content motion

- Inspector open/close: 180 ms translateX(12px)+fade; span change: width 220 ms with the
  map's `--inspector-width` updated per frame (so the map does not jump at the end).
- View swap inside the panel: 120 ms crossfade with scroll memory; lists stagger rows 20 ms
  up to 8 rows; hover cards 120 ms scale 0.98→1.
- The locator line keeps its 650 ms draw-on; add a 200 ms fade-off instead of vanishing.
- Skeleton rows (shimmer) while images decode; thumbnails blur-up to the display image.
- All transitions obey `prefers-reduced-motion` (existing pattern).

### 6.3 Toasts v2 and the end of `confirm()` in campaign flows

`showToast(message, { type: 'info'|'success'|'warn'|'error', action: { label, run },
duration, sticky })` — backward compatible with the `(message, ms)` signature. Live region
(`aria-live="polite"`, errors `assertive`), max 3 stacked, hover pauses the timer, Esc
dismisses the top one. Delete record / link / journal entry → toast "Deleted Captain Voss —
Restore" (tombstone). `confirm()` remains only for clearing a map and sector-slot purges.

### 6.4 Map campaign layer (`renderer.js`, toggle `C`, nav-rail eye-submenu)

Drawn after routes, before labels, into the pan cache so it pans free:
- **Pins** per system with records: small type-glyph stack (max 3 glyphs + count), colored
  by visibility (players = amber ring). Hidden below zoom 0.3 (grid threshold), fade like LOD.
- **Party ship** marker with a 3-hex dashed trail of the last positions and, in jump, an
  animated dash toward the destination (this one draws in screen space over the cache,
  like pinned labels, so it can animate without invalidating).
- **Org presence halos**: for the org selected in the inspector, translucent rings on
  systems where it has `presence` links or anchored members/places; colour = the org's
  allegiance colour if it has one, else a per-org hash colour.
- **Event markers** when the timeline is open: dots sized by proximity to "now".
- Hover a pin → hover card listing the records; click → opens the system's Campaign section.

### 6.5 Loading

- The campaign store loads **after** the map boot reveal, not before (the map should never
  wait on the cast). Nav campaign buttons shimmer until `campaign:loaded`.
- Large operations (v1→v2 upgrade, Player Pack build, journal merge) use the existing
  `showWorkStatus` bar with real fractions and a Stop that leaves data consistent.
- Save-file load: progress through the same bar per chunk, replacing the fixed
  `setTimeout(100)` pause.

### 6.6 Chrome consistency

- Promote the `--atlas-*` tokens to `:root` (`--bg`, `--raised`, `--text`, `--muted`,
  `--line`, `--accent`, `--warn`, `--player` amber) and have new CSS use only tokens.
- One show/hide convention for new UI: `hidden` + `inert`, animated via `data-state`.
- Shortcut registry (`keyboard_shortcuts.js`): `registerShortcut({ keys, scope, label, run })`;
  the help screen and `title` hints are generated from it. Existing bindings are migrated
  into the registry first so there is one Escape ladder.
- Load 'Share Tech Mono' or stop referencing it (it currently falls back to monospace).

---

## 7. Timeline

### 7.1 Model

The timeline is a *view* over `CampaignIndex.dated`: records with `when`, journal entries,
vessel position rows, link `since`/`until` spans, ledger reminders. Nothing is stored twice.
Dates are `{ year, day }` on the existing 365-day clock; `seconds` optional.

**Standard date format, everywhere (supplied by the referee 2026-10-02, from *Agent of
the Imperium*): `DDD-YYYY HHHH`** — day of year zero-padded to 3, year, a space, then the
24-hour time with no separator (`001-1105 0830`). When a time is not meaningful the
`HHHH` part is omitted (`001-1105`). This replaces the current
"Year 1,105 · Day 1 · 00:00:00" readout in the orrery header, the stardate dialog, the
Campaign workspace, exports and logs. Seconds are kept in the model, never shown unless a
view asks for them (the orrery's time scrubber may). One formatter and one parser in
`js/campaign_time.js` (extracting `_dateText`/`_clockParts` from `system_viewer.js` so the
orrery and the campaign share one module); the parser accepts `DDD-YYYY`, `DDD-YYYY HHHH`
and `DDD-YYYY HH:MM` so typed input is forgiving.

### 7.2 Ribbon (full/half span; column shows the list form)

- Horizontal, zoomable from decades to single days with the shared camera (§6.1); years are
  major ticks, days minor; labels thin out with the same LOD fade as the map.
- **Lanes:** Journal (sessions as numbered diamonds), Events, Jobs (bars from accepted to due,
  colour by state), Party ship (position rows as dots, jumps as arcs), Organizations (spans
  from `since`→`until` for the selected org), Reminders.
- **Now line** at the stardate; everything after it is dimmed ("not yet"). Drag the Now line
  or press `[` `]` (day) / `Shift+[ ]` (10 days) / `Ctrl+[ ]` (year) to move the clock —
  with *Back* in the toast, autosaved on the existing 600 ms debounce.
- Click an item → selects it, flies the map to where it was *then* (vessel position at that
  date, else its anchor), opens its page in the side column.
- Drag an item along the lane → re-dates it (toast with *Put back*). Drop a record from a list onto
  the ribbon → sets `when`.
- Hover → card with the date, title, where, and who is involved.
- Brush-select a range → "Export these N days as a handout".

### 7.3 List form (column)

Grouped by year then day, newest first, with the Now marker; the same keyboard as lists.

### 7.4 Delighter: "What season is it here?"

Asked for 2026-10-02. Every generated world already carries what a season needs:
`axialTilt` (degrees; > 90° is retrograde), `eccentricity`, `periodDays`, `tidallyLocked`
and `meanTempK` (`mgt2e_world_engine.js:1578-1830`), and the orrery already places each body
on its orbit for the campaign date. So this is geometry over existing data, not a guess —
with one stated convention and one explicit approximation.

**Model (`js/campaign_seasons.js`, pure functions, no DOM):**
- *Orbital phase* `φ` = the body's true anomaly at the campaign date, taken from the same
  orbit solver the orrery uses (so the dot on the orrery and the season never disagree).
- *Convention:* the northern vernal equinox sits at periapsis (`φ = 0`). It is a
  convention, not a rule; it is stated in the tooltip and is one constant to change.
- *Seasonal drive* `s = sin(φ) · sin(tilt)` for the northern hemisphere (negated for
  southern); the four labels come from `φ` quartered (spring → summer → autumn → winter
  north; the reverse south), **but** the label is only shown when `|sin(tilt)| ≥ sin(5°)`.
  Below that the answer is "no seasons (tilt 1.2°)".
- *Strength* word from `|sin(tilt)|`: mild (< 15°), marked (15–35°), severe (35–60°),
  extreme (> 60°, with the note "the poles face the star in turn").
- *Eccentricity term:* `1 ± e` on the stellar flux at periapsis/apoapsis; when `e ≥ 0.1` a
  second line says "orbit-driven: whole-world warm/cool season" with the flux ratio
  `((1+e)/(1−e))²` shown to one decimal — this is the *approximation* the referee accepted;
  it is flux geometry, not climate.
- *Tidally locked* → "no seasons — one face always sunward"; the line names the solar-day
  state instead (perpetual noon / twilight ring / night side).
- *Retrograde tilt* (> 90°) → computed with `180° − tilt`, labelled "retrograde".
- *Temperature flavour* from `meanTempK` with the existing temperature band table in
  `rules/mgt2e_data.js` (`temperatureBands`) — the band label is displayed as-is, nothing is
  derived from it.

**Where it shows:**
- The inspector's world dossier and the orrery's selected-body card: one line, e.g.
  "Northern autumn, severe · southern spring · 203-1105" with a small sun-angle glyph
  (a disc with the terminator tilted by the current solstice offset).
- The Party panel and any record anchored to a body: "Autumn at the downport" beside the
  location.
- Journal "New session" prefills "Season at <party location>: …" into the session header.
- Advancing the clock (Jump, scrub) updates the line live; across a season boundary the
  glyph eases over 400 ms.

**Honesty rule:** the line always carries a `?` tooltip stating the convention and the
inputs (`tilt 23.4° · e 0.02 · φ 147°`), so a referee can disagree with the geometry and
set a manual override (`_manualFields` already exists for exactly this).

---

## 8. Journal

- Sessions are numbered automatically (`sequence`), dated both in-fiction (`when`) and
  real-world; "New session" prefills `when` with the clock and anchors to the party's location.
- Body uses the same token editor (§2.5); a right-hand "Mentioned" rail collects the chips
  found in the text, and each chip's page lists the session under *On the timeline*.
- **Handouts** are player-visible by definition and may carry images (assets).
- **Rumors** are jobs-in-waiting: a "Promote to job" button creates the job and links the
  rumor as its source event.
- Player notes arrive through merge (§9.3) and appear with the player badge; the referee can
  reply inline (threaded under the entry) — the reply is a referee note linked to the player
  entry.

---

## 9. Players

No server exists and this plan does not invent one. Players get a **Player Pack**; their
notes come back as a file. This is honest, offline, and works at the table.

### 9.1 Player Pack (extends `html_exporter.js`, uses `export_core.js` levels)

A ZIP of static HTML: the existing fogged subsector pages, plus:
- Atlas pages for records with `visibility: 'players'` (links rendered only if both ends are
  player-visible; `role`/`notes` on a link obey the link's own visibility).
- The timeline (ribbon as inline SVG + list) of player-visible dated things up to the clock.
- Journal entries that are player-visible, sessions and handouts included.
- Party ship status and PC sheets if player-visible.
- Every page carries a **Notes** box stored in the pack's own `localStorage` and a
  "Download my notes" button producing `player_notes_<name>.json`.

Leak posture copies fog-of-war: anything untagged fails closed; a build-time audit lists
every referee-only thing it withheld (count only, no names) so the referee can trust it.

### 9.2 Player Edition (later)

The same `hex_map.html` opened with a Player Pack's `campaign.json`: read-only records, the
timeline, the journal, and editable `playerNotes` + player journal entries. Same notes export.

### 9.3 Merge

Journal ▸ "Import player notes": shows a merge sheet (entry, player, date, target record);
accept all / per row. Entries are keyed by id; a player note never overwrites referee text —
it lands in `playerNotes` or as a `players`-authored journal entry. `beforeBulk` autosave
first, so the whole merge can be restored as one.

---

## 10. Halt & Challenge — what Sean must supply before the sheets can be real

Per the Zero-Assumption Policy none of the following is filled from memory. Each item names
the file the data should land in and what the engine will do until it exists.

| # | Question | Needed for | Until answered |
|---|---|---|---|
| Q1 | Character sheet schema for MgT2E: characteristic names and order, how a characteristic maps to a DM (as a table), the skill list with specialities, any other sheet fields (age, terms, benefits, etc.) | §5.2, `rules/mgt2e_character_sheet.js` | Free-form sheet |
| Q2 | Ship sheet schema: hull/tonnage fields, drive and power fields, component list, the condition fields that have maxima (what the gauges are), crew post names | §5.3, `rules/mgt2e_ship_sheet.js` | Free-form sheet; condition/crew posts free text |
| Q3 | ~~Default jump duration~~ **Answered by the referee 2026-10-02: one week, 168 hours, editable** (`settings.jumpHours`) | §5.3a | — |
| Q4 | ~~Calendar display form~~ **Answered by the referee 2026-10-02: `DDD-YYYY HHHH` everywhere** (365-day year, days 1–365, no leap/holiday handling — still to confirm with Sean if the orrery's year length should differ) | §7.1 | — |
| Q5 | Recurring ship costs (mortgage, maintenance, salaries): are any derived from the ship sheet, or always entered by the referee? | §5.3 ledger | Entered by the referee |
| Q6 | Task resolution: target numbers, effect, any roll conventions the roller should show | §5.5 | Plain dice, no interpretation |
| Q7 | Trade: should cargo rows connect to the MgT2E trade goods table (not in `rules/` today)? | §5.3 cargo | Free-text cargo rows |
| Q8 | Organization kinds: is the seed list in §2.2 acceptable, and should any map to allegiance codes automatically? | §2.2 | Seed list, manual allegiance colour |
| Q9 | Player visibility granularity: record-level plus player notes (this plan), or per-section (summary vs details)? | §4.2, §9.1 | Record-level |

---

## 11. Phases

Each phase is shippable on its own; later phases never require redoing an earlier one.
"Done" lines are what a reviewer checks in the browser.

### Phase 0 — Foundations (no visible feature yet; everything else stands on it)
Files: `db_manager.js`, `core.js`, `campaign_atlas.js` (split: keep UI, move store logic to
new `js/campaign_store.js`), new `js/campaign_index.js`, `js/campaign_time.js` (extracted),
`io_manager.js`, `utilities/campaign_atlas_test.js`.
- Builds on Persistence v2 (`markChanged`, overlay, saves). Schema v2 normalize + v1
  upgrade; per-key IndexedDB store; tombstones + Restore; `campaign:changed` /
  `hex:changed` events; index with timing test; `remapSectorSlots` / `purgeSectorSlots`
  detach behaviour.
- Done: a v1 map with sample data loads, upgrades, round-trips through save/load and
  single-system backup; deleting a record shows Restore and restoring brings it back with
  its links; a commit writes only the documents it touched (inspect the transaction in
  DevTools); inspector no longer polls.

### Phase 1 — Links, organizations, hierarchy
Files: new `js/campaign_links.js`, `campaign_atlas.js` (record page), new
`js/campaign_chart.js`, new `js/camera.js` (used first by the chart), `style.css`,
`hex_map.html` (markup only), `keyboard_shortcuts.js` (registry).
- Link vocabulary, cycle check, Relationships section, picker, @-mention editor, chips and
  hover cards, drag-and-drop linking, optional/record anchors with resolution, org chart with
  drag re-parent, `kind` sub-types, toasts v2 with actions, shortcut registry.
- Done: build a church with three orders and a bishop in each, put a bishop aboard a ship,
  move the ship — the bishop's page says where she is; delete a link and restore it from the
  toast; re-parent an order by dragging on the chart; `Ctrl+K`, type her name, Enter — the
  map flies.

### Phase 2 — Camera and map layer
Files: `camera.js` (map adoption), `canvas_input.js`, `renderer.js`, `core.js`,
`input_init.js` (omni-search → palette), `style.css`.
- Flights replace every teleport; inertia; wheel normalization; keyboard pan; rAF coalescing;
  campaign map layer with pins, party marker, presence halos; palette actions; panel motion;
  design tokens at `:root`; campaign store loads after reveal.
- Done: perf overlay shows no frame over 16 ms during a flight on a 7×5 map; reduced-motion
  disables all of it; `grep -c "requestAnimationFrame(draw)" js/*.js` is 0.

### Phase 3 — Party, vessels, sheets
Files: new `js/campaign_sheets.js`, `campaign_atlas.js` (vessel/person pages), new
`js/campaign_party.js`, `renderer.js` (jump trail), `rules/mgt2e_*_sheet.js` (Sean, when ready).
- Vessel type, status model, position log, Jump action with range ring and flight, crew
  roster from links, cargo/ledger/log tables, Party panel, free-form sheets now, schema
  sheets the day the rules files land, dice roller, printable sheet.
- Done: the party jumps from Regina to Efate; the trail draws; "Where are the PCs" flies
  there; a free-form sheet survives save/load; dropping a rules schema file renders without
  a code change.

### Phase 4 — Time
Files: `campaign_time.js`, new `js/campaign_timeline.js`, `campaign_atlas.js` (dated
fields, journal), new `js/campaign_journal.js`, `system_viewer.js` (consume shared time).
- `when` on records, journal with sessions/handouts/rumors, ribbon and list timeline, Now
  line and clock scrubbing, re-dating by drag, "On the timeline" sections, imperial format.
- Done: scrub the Now line back a year — the party marker moves to where the ship was; a
  session written today appears under every record it mentions.

### Phase 5 — Players
Files: `html_exporter.js`, `export_core.js`, `io_manager.js`, `campaign_journal.js`
(merge sheet), later a Player Edition boot mode in `input_init.js`.
- Player Pack with atlas/timeline/journal/party, notes box and export, merge sheet, withheld
  audit, Player Edition.
- Done: a pack built from the sample campaign shows only player-visible things (audit count
  matches a manual count), a note typed in the pack round-trips into the referee's journal.

### Phase 6 — Polish and delighters
- Relationship web (force layout, 2 hops) on the record page at full span.
- "Nearby" on Home: records within N jumps of the inspected system (hex distance only).
- Session mode: a focused layout (clock, party ship, current system dossier, open jobs,
  dice, live session note) as a span preset `session`.
- Chart/timeline/sheet PNG and print exports; handout styling.

---

## 12. Non-goals (for this plan)

- A sync server or real-time multi-user editing.
- Any rules automation (combat, trade pricing, skill checks) beyond what a supplied rules
  file declares as data.
- Replacing the sector generators or the fog-of-war model; both are consumed as-is.
- A new app shell: everything stays in `hex_map.html` + `js/`, no build step.

---

## 13. After local: the shared-universe version (Cloudflare) — sketch, not a plan

Order of work agreed 2026-10-02: **bugfix pass → local campaign manager (this plan, built
sync-ready per §3.4) → cloud.** The cloud version is sketched here only so Phase 0 makes the
right choices; it gets its own directive when its turn comes.

**Stack:** Cloudflare Pages (the static app, as today) · Workers (API) · D1 (documents:
campaign docs, universe hexes, accounts) · R2 (images, replacing IndexedDB blobs online) ·
one Durable Object per campaign (fan-out of patches to connected referee/players) · OAuth
sign-in (GitHub/Google/Discord; "X" is just another OAuth provider).

**Three layers, in order of what overrides what:**
1. *Shared universe* — base sector data (OTU imports, published sectors), versioned,
   public read-only. The TravellerMap-shaped part.
2. *Campaign overrides* — a campaign's private edits to systems, stored as per-hex deltas
   over the base (your Regina is not everyone's Regina).
3. *Campaign layer* — records, links, journal, party (this plan's store), private to the
   campaign; the player-visible subset is computed **server-side**.

**Hard parts to go in clear-eyed about:**
- Fog of war becomes access control: `FIELD_LEVELS` (fail-closed) must run in the Worker so a
  player's browser never *receives* referee data. This is why the feature is paused, not
  deleted, in the bugfix pass.
- The app assumes one map (`hexStates`, `sectorRoutes`, `campaignAtlas` are globals). The
  campaign-id namespace in §3.4 is the first step; universe/override split is the second.
- Public launch means accounts, quotas, moderation, abuse handling, and reading Far Future
  Enterprises' fair-use policy before publishing OTU data.
- Conflicts: per-document last-writer-wins by `rev` plus a visible "changed elsewhere"
  notice. No CRDTs at this scale.
- Offline stays first-class: IndexedDB becomes the cache; the app works on a train.

## 14. Open design questions for the referee (not rules — taste)

1. Should `business` be folded into `organization` (kind `company`) with a one-time upgrade,
   or kept as a type forever? The plan keeps it; folding is one migration line.
2. Hover cards: on hover (300 ms) or only on a modifier/long-press? The plan says hover with
   a setting to disable.
3. Should the campaign map layer be on by default once a campaign has records?
4. Session mode as a span preset, or a separate full-screen "referee screen"?
