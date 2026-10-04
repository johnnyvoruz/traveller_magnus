# Campaign Manager — Design Plan

**Status:** PLAN, awaiting review. Nothing here is implemented. Drafted 2026-10-02.
**Scope:** turn the Campaign Atlas into a complete referee's instrument for an epic
Mongoose Traveller 2e campaign — war, trade, faith, exploration — without leaving the map.
**Rules posture:** every RPG number on a character or ship sheet comes from a file in
`rules/` that Johnny (the referee) supplies. This plan designs the *frames*; it does not fill in the rules
(§10 lists what is needed, Halt & Challenge style).

**Execution format (decided 2026-10-02):** work may be carried out by a lower-effort
implementer. Before any step is executed it is expanded into a **recipe** in the style of
§7.6b: numbered steps, each naming the file, the function, the lines to touch, the exact
code to add, and a one-line check; a verification list at the end; and a short list of
tuning knobs that may be changed without re-deciding the design. Recipes are written
just-in-time (line numbers drift), from the design sections here, by whoever is
orchestrating — never improvised by the implementer. A recipe never changes the approach;
if it cannot be written without doing so, the design section is wrong and is fixed first.

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
Johnny provides (§10). The engine knows field types; it does not know Traveller. Until the
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

### 5.2a The character sheet — data model (front and back supplied 2026-10-02)

Referee's instruction: *not* a 1:1 reproduction — the point is the data and the
architecture. Labels below are transcribed from the official MgT2E sheet image as supplied.
What a value means, how a characteristic's DM is obtained from its value, and each skill's
specialities (the sheet prints `( )`) are **not** here; they are Johnny's to supply (§10 Q1, narrowed).

#### Schema (goes into `rules/mgt2e_character_sheet.js` by Johnny; transcription below)

```js
window.MGT2E_CHARACTER_SHEET = {
  version: 1,
  sections: [
    { id: 'personal', title: 'Personal Data File', layout: 'grid', fields: [
        { id: 'name', label: 'Name', type: 'text' },       { id: 'age', label: 'Age', type: 'int' },
        { id: 'species', label: 'Species', type: 'text' }, { id: 'homeworld', label: 'Homeworld', type: 'text', link: 'system' },
        { id: 'traits', label: 'Traits', type: 'text' },   { id: 'rads', label: 'Rads', type: 'int' } ] },
    { id: 'core', title: 'Core Characteristics', layout: 'characteristics', fields:
        ['Strength', 'Dexterity', 'Endurance', 'Intellect', 'Education', 'Social']
          .map(n => ({ id: n.toLowerCase(), label: n, type: 'characteristic' })) },   // value + DM
    { id: 'other', title: 'Other Characteristics', layout: 'characteristics', fields:
        ['Morale', 'Luck', 'Sanity', 'Charm', 'Psionic', 'Other']
          .map(n => ({ id: n.toLowerCase(), label: n, type: 'characteristic' })) },
    { id: 'careers', title: 'Careers', layout: 'table', fields: [
        { id: 'careers', type: 'table', columns: [
            { id: 'career', label: 'Career' }, { id: 'terms', label: 'Terms', type: 'int' }, { id: 'rank', label: 'Rank' } ] } ] },
    { id: 'training', title: 'Skills', layout: 'grid', fields: [
        { id: 'trainingSkill',  label: 'Training in Skill', type: 'text' },
        { id: 'trainingWeeks',  label: 'Weeks', type: 'int' },
        { id: 'trainingDone',   label: 'Training Period Complete', type: 'text' },
        { id: 'studyPeriod',    label: 'Study Period', type: 'text' } ] },
    { id: 'skills', title: null, layout: 'skills', fields: [ { id: 'skills', type: 'skills', vocab: 'skills' } ] },
    { id: 'finances', title: 'Finances', layout: 'tags', fields: [
        { id: 'monthlyShipPayments', label: 'Monthly Ship Payments', type: 'cr' },
        { id: 'pension', label: 'Pension', type: 'cr' }, { id: 'cashOnHand', label: 'Cash on Hand', type: 'cr' },
        { id: 'debt', label: 'Debt', type: 'cr' },       { id: 'livingCost', label: 'Living Cost', type: 'cr' } ] },
    { id: 'armour', title: 'Armour', layout: 'table', fields: [ { id: 'armour', type: 'table', columns: [
        { id: 'type', label: 'Type' }, { id: 'rad', label: 'Rad' }, { id: 'protection', label: 'Protection' },
        { id: 'kg', label: 'KG', type: 'number' }, { id: 'options', label: 'Options' } ] } ] },
    { id: 'weapons', title: 'Weapons', layout: 'table', fields: [ { id: 'weapons', type: 'table', columns: [
        { id: 'weapon', label: 'Weapon' }, { id: 'tl', label: 'TL' }, { id: 'range', label: 'Range' },
        { id: 'damage', label: 'Damage' }, { id: 'kg', label: 'KG', type: 'number' }, { id: 'magazine', label: 'Magazine' } ] } ] },
    { id: 'augments', title: 'Augments', layout: 'table', fields: [ { id: 'augments', type: 'table', columns: [
        { id: 'type', label: 'Type' }, { id: 'tl', label: 'TL' }, { id: 'improvement', label: 'Improvement' } ] } ] },
    { id: 'equipment', title: 'Equipment', layout: 'table', fields: [
        { id: 'equipment', type: 'table', columns: [ { id: 'type', label: 'Type' }, { id: 'mass', label: 'Mass', type: 'number' } ],
          total: { column: 'mass', label: 'Total Mass Carried' } } ] }
    // ── back side ──
    { id: 'personal2', title: 'Personal Data File', layout: 'grid', fields: [
        { id: 'title', label: 'Title', type: 'text' },
        { id: 'race', label: 'Race', type: 'text' },                       // the back prints Race; the front prints Species — both kept, same box group
        { id: 'portrait', label: 'Portrait', type: 'image', source: 'record.primaryImage' },   // the record's own portrait, not a second upload
        { id: 'facialFeatures', label: 'Facial Features', type: 'text', multiline: true } ] },
    { id: 'upp', title: 'Universal Character Profile', layout: 'upp',
      fields: ['strength', 'dexterity', 'endurance', 'intellect', 'education', 'social'].map(id => ({ id, ref: 'core.' + id })) },
      // display only: the six hexes show the SAME values entered in Core Characteristics (front); nothing is re-entered
    { id: 'wounds', title: 'Wounds', layout: 'table', fields: [ { id: 'wounds', type: 'table', columns: [
        { id: 'type', label: 'Type' }, { id: 'location', label: 'Location' },
        { id: 'recovery', label: 'Recovery Period' }, { id: 'notes', label: 'Notes' } ] } ] },
    { id: 'background', title: 'Background Notes', layout: 'text', fields: [ { id: 'background', type: 'text', multiline: true, tokens: true } ] },
    { id: 'history', title: 'Previous History', layout: 'text', fields: [ { id: 'history', type: 'text', multiline: true, tokens: true } ] },
    // The four connection boxes are NOT value fields. They are views of the record's
    // links (§2.3), with the polarity the sheet prints beside each title.
    { id: 'allies',   title: 'Allies',   layout: 'connections', linkKind: 'ally',    polarity: '+' },
    { id: 'contacts', title: 'Contacts', layout: 'connections', linkKind: 'contact', polarity: '+' },
    { id: 'rivals',   title: 'Rivals',   layout: 'connections', linkKind: 'rival',   polarity: '+/-' },
    { id: 'enemies',  title: 'Enemies',  layout: 'connections', linkKind: 'enemy',   polarity: '-' }
  ],
  vocab: {
    // Skill names exactly as printed. `spec: true` where the sheet prints "( )"; the
    // sheet repeats those lines (Animals ×3, Athletics ×3, …) — that count is a print
    // allowance, not a rule, so it is not recorded. Specialities themselves: Johnny.
    skills: [
      'Admin', 'Advocate', { name: 'Animals', spec: true }, { name: 'Athletics', spec: true }, 'Art', 'Astrogation',
      'Broker', 'Carouse', 'Deception', 'Diplomat', { name: 'Drive', spec: true }, { name: 'Electronics', spec: true },
      { name: 'Engineer', spec: true }, 'Explosives', 'Flyer', 'Gambler', 'Gunner', { name: 'Gun Combat', spec: true },
      { name: 'Hvy Weapons', spec: true }, 'Investigate', 'Jack of all Trades', { name: 'Language', spec: true },
      'Leadership', 'Mechanic', 'Medic', { name: 'Melee', spec: true }, 'Navigation', 'Persuade',
      { name: 'Pilot', spec: true }, { name: 'Profession', spec: true }, 'Recon', { name: 'Science', spec: true },
      { name: 'Seafarer', spec: true }, 'Stealth', 'Steward', 'Streetwise', 'Survival', { name: 'Tactics', spec: true },
      'Vacc Suit'
    ]
  }
};
```

#### Data stored on the person record

```js
sheet: {
  schema: 'mgt2e_character@1',
  values: {                       // keyed by field id; tables are arrays of row objects
    strength: { value: 8, dm: 0 },  // `characteristic`: both numbers are ENTERED; dm is never computed here
    skills: [ { name: 'Pilot', spec: 'Spacecraft', level: 2 }, { name: 'Admin', level: 0 } ],   // `skills`: free rows over the vocab
    careers: [ { career: 'Navy', terms: 3, rank: 'Lieutenant' } ],
    equipment: [ { type: 'Vacc suit', mass: 8 } ],
    ...
  }
}
```

New field types for the engine (§5.1): `characteristic` (value + DM pair, rendered as the
hexagon-and-tab), `skills` (a vocab-backed list with optional speciality and level; typing
`@` in the name cell autocompletes from `vocab.skills`; speciality cell appears only for
`spec: true`), `cr`, `table.total` (a summed column with its label). `link: 'system'` on
Homeworld makes the value a system chip (picker from the map) while still storing the text.

#### Why this shape (architecture, since that is the request)

- **Schema-driven, no code per sheet.** Front and back are sections in one schema; the
  engine renders any `sections[]`. A future edition or house sheet is a different file.
- **Values are a flat map keyed by field id.** Tables are arrays of row objects. This is
  what per-document sync (§3.4) and the Player Pack need: diffable, no nesting beyond one
  level, every row addressable.
- **Nothing derived lives in `values`.** DMs, totals, budgets are computed at render time
  only when the schema declares how (`derived` with an `expr`, or `total`); until Johnny
  supplies the expressions the DM box is simply typed.
- **Links, not copies.** Homeworld → a system; Equipment rows → optional `itemId`;
  Careers rows → optional `orgId` (the Navy as an organization record); the skill vocab is
  shared, not pasted into each sheet, so a renamed skill renames everywhere.
- **Status that changes at the table** (Rads, Cash on Hand, Debt, the training tracker)
  writes a dated `log` line like the ship's, so a session's wear-and-tear is readable later.
  Training Weeks + Study Period become a timeline reminder (§7.2) when the referee asks.
- Visual: same language as the ship sheet (§5.3b) — black header bars with red titles,
  hexagonal characteristic cells — but the layout is the app's, not the paper's.

#### Delighter: Connections are the campaign graph

The sheet's **Allies / Contacts / Rivals / Enemies** boxes are the same relationships as
the `ally`, `contact`, `rival`, `enemy` link kinds in §2.3 — so the sheet does not *store*
them, it *shows* them. That is what makes it work at the table:

- **Each box lists the record's links of that kind.** Row = portrait chip · name · the
  link's `role` ("fixer at the downport") · the link's `notes` (the sheet's NOTES column) ·
  where they are *now* (resolved anchor, §2.2). Hover → the hover card; click → their page;
  the `where` chip flies the map to them.
- **Adding a row adds a person to the campaign.** The `+` on the box opens the picker
  (§4.4): choose an existing person *or type a name and press Enter* — `@@` semantics —
  and a new `person` record is created at the party's current location, linked with that
  kind, with the cursor left in the NOTES cell. Sixty seconds from "the PC mentions a
  cousin" to a real NPC on the map with a page and a pin.
- **Both ends see it.** The new NPC's own page shows "Contact of *Captain Voss*" with the
  same notes (symmetric kinds, §2.3). Promote a Contact to an Ally by dragging the row
  between boxes — it rewrites the link's `kind`, with a *Put back* toast.
- **Polarity badges** `(+)`, `(+)`, `(+/-)`, `(-)` are printed on the box headers exactly as
  on the sheet; they are labels, not mechanics.
- **Rivals and Enemies get the map treatment:** a toggle on the box, "show on map", draws
  rust pins for every enemy's current location and amber for rivals, on the campaign layer
  (§6.4) — "who is where" for the people who want you dead.
- **Organizations count too.** A link to an organization (the Navy as an enemy, a cartel
  as a contact) lists in the same box with the org's glyph, and the box header shows a
  small sum: "Enemies (-) · 2 people, 1 organization".
- **Wounds** rows are the character's `status.log` entries of kind `wound`; a row with a
  Recovery Period becomes a reminder on the timeline (§7.2) dated from the clock when the
  referee asks ("Heals 041-1105"); Rads on the front is the same status family.
- **Previous History** and **Background Notes** accept `[[tokens]]`, so a history that
  mentions *Regina* or *Baron Kalle* links there and shows under their *Mentions*.
- **Portrait** is the record's primary image — one upload, shown on the record page, the
  sheet, the hover card, the org chart and the Player Pack.
- **UPP strip** on the back renders the six Core values from the front as the hexagon
  strip; it is a second *view* of the same stored values, never a second entry.

Player Pack: the sheet exports with its connections only where **both** ends are
player-visible, and link `notes` only when the link itself is (§9.1).

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

### 5.3b Delighter: the ship sheet (from the referee's MgT2E sheet, 2026-10-02)

The referee supplied the official sheet layout as an image. Its **labels and arrangement**
are transcribed below verbatim — that is the sheet's structure, supplied, not inferred. What
the fields *mean*, their legal values, and anything derived from them (hull points from
tonnage, power from drives, what a critical hit does) are **not** here and stay with Johnny
(§10 Q2, now narrowed). The sheet renders in the app in the same visual language: angular
chamfered panels, cyan section tabs, rust-red value tags, a thin orange frame line.

#### Schema transcribed from the sheet (goes into `rules/mgt2e_ship_sheet.js` by Johnny)

```js
window.MGT2E_SHIP_SHEET = {
  version: 1,
  sections: [
    { id: 'identity', title: null, layout: 'header', fields: [
        { id: 'name',       label: "Ship's Name", type: 'text' },
        { id: 'class',      label: 'Class',       type: 'text' },
        { id: 'hullPoints', label: 'Hull Points', type: 'int', tag: true, track: 'current' },  // current/max (see Status)
        { id: 'armour',     label: 'Armour',      type: 'int', tag: true } ] },
    { id: 'power', title: 'Power', layout: 'budget', fields: [
        { id: 'powerPoints', label: 'Power Points', type: 'int' },
        { id: 'powerReq', label: 'Power Requirement', type: 'table', budgetAgainst: 'powerPoints',
          columns: [ { id: 'system', label: '', type: 'text' }, { id: 'points', label: '', type: 'int' } ],
          rows: [ 'Basic Ship Systems', 'Manoeuvre Drive', 'Jump Drive', 'Sensors', 'Weapons', '', '', '' ] } ] },
    { id: 'sensors', title: 'Sensors', layout: 'table', fields: [
        { id: 'sensors', type: 'table', columns: [ { id: 'type', label: 'Type', type: 'text' }, { id: 'dm', label: 'DM', type: 'text' } ] } ] },
    { id: 'systems', title: 'Systems', layout: 'list', fields: [ { id: 'systems', type: 'list' } ] },
    { id: 'computer', title: "Ship's Computer", layout: 'list', fields: [
        { id: 'bandwidth', label: 'Bandwidth', type: 'int', tag: true },
        { id: 'software',  label: 'Software Packages', type: 'list' } ] },
    { id: 'drives', title: 'Drives', layout: 'grid', fields: [
        { id: 'mDrive',    label: 'Manoeuvre Drive', type: 'text' }, { id: 'mThrust', label: 'Thrust', type: 'text' },
        { id: 'rDrive',    label: 'Reaction Drive',  type: 'text' }, { id: 'rThrust', label: 'Thrust', type: 'text' },
        { id: 'jDrive',    label: 'Jump Drive',      type: 'text' }, { id: 'jump',    label: 'Jump',   type: 'text' } ] },
    { id: 'costs', title: null, layout: 'tags', fields: [
        { id: 'fuelCost',    label: 'Fuel (Full Tank) Cost',        type: 'cr' },
        { id: 'mortgage',    label: 'Mortgage',                     type: 'cr' },
        { id: 'lifeSupport', label: 'Life Support',                 type: 'cr' },
        { id: 'salaries',    label: 'Salaries',                     type: 'cr' },
        { id: 'maintenance', label: 'Cost Per Maintenance Period',  type: 'cr' } ] },
    { id: 'weapons', title: 'Weapons', layout: 'table', fields: [
        { id: 'weapons', type: 'table', columns: [
            { id: 'weapon', label: 'Weapon' }, { id: 'mount', label: 'Mount' }, { id: 'tl', label: 'TL' },
            { id: 'range', label: 'Range' }, { id: 'damage', label: 'Damage' }, { id: 'ammunition', label: 'Ammunition' },
            { id: 'traits', label: 'Traits' } ] } ] },
    { id: 'cargo', title: 'Cargo Hold Content', layout: 'table', fields: [
        { id: 'cargo', type: 'table', columns: [ { id: 'item', label: '' }, { id: 'tons', label: 'Tons', type: 'number' } ] } ] },
    { id: 'criticals', title: 'Critical Hits', layout: 'tracks', fields: [
        'Armour', 'Bridge', 'Cargo', 'Crew', 'Fuel', 'Hull', 'J-Drive', 'M-Drive', 'Power Plant', 'Sensors', 'Weapons'
      ].map(name => ({ id: 'crit_' + name.toLowerCase().replace(/[^a-z]/g, ''), label: name, type: 'track', pips: 6 })) }
  ]
};
```

New field types the sheet engine (§5.1) must support for this: `cr` (a credits field,
shows `Cr` prefix), `track` (a row of `pips` toggles), `tags` layout (the rust-red value
tags), `budget` layout (a table whose numeric column is summed and shown against a scalar),
`header` layout (name/class with the two tags on the right). Everything else already exists
in the §5.1 contract.

#### How the sheet behaves (the delighter part)

- **Hull Points** is a tag *and* a track: the tag shows `current / max`; a bar under the
  name fills by the ratio in the hull colour, turning amber then rust as it falls. Click
  the tag to type, or use the `−`/`+` nudge buttons that appear on hover (hold to repeat).
  Changes write `status.condition.hullPoints` with a one-line entry in `status.log`
  ("−8 hull — 034-1105 1420"). Nothing computes *how much* damage anything does.
- **Power Requirement** sums its `points` column live and shows `used / Power Points`
  as a thin bar across the panel; over budget turns the bar rust and shows the overage.
  Arithmetic on numbers the referee typed, nothing more.
- **Critical Hits** are eleven rows of six pips. A pip toggles on click (left adds, right
  removes, keyboard: arrows + Space). Filling a pip pulses it once (120 ms) and writes to
  `status.condition.crit_*` plus a `status.log` line. A row with any pip lit gets its label
  tinted rust so the damaged systems can be read at a glance across the table. The pips
  carry **no** rule text until Johnny supplies it; a `?` on the row header says so.
- **Cargo Hold Content** is the same table as `status.cargo` (§5.3): rows link to item
  records via the picker, tons sum at the foot, and the row's `destination` (from
  `status.cargo`) shows as a small chip. Over a tonnage capacity *if the referee enters
  one* in Systems, the total turns rust.
- **Weapons**, **Sensors**, **Systems**, **Software** are plain tables/lists; rows are
  draggable to reorder; Enter in the last row adds one.
- **Costs** are the five rust tags. Each has a "post to ledger" action that writes a
  `status.ledger` row of that amount dated to the clock (kind `expense`, memo = the tag's
  label). No period is assumed; the referee posts when the period falls due. "Mortgage"
  and "Cost Per Maintenance Period" can be set as **reminders** (§7.2 Reminders lane) with
  a period in days the referee types.
- **Crew** is not on the printed sheet and is not added to it; the crew roster lives above
  the sheet in the vessel page (from `crew` links), so the printed sheet stays faithful to
  the original.
- **Print / export**: a print stylesheet reproduces the sheet on one page in the same
  layout (chamfers via `clip-path`, tags as filled parallelograms); the Player Pack
  includes it when the vessel is player-visible, with Critical Hits and Hull Points *as of
  export*.
- **Empty sheet** reads exactly like the paper one: every box present, light placeholder
  text, so a referee can fill it top to bottom in the order they know.

#### Visual spec (so it looks like the sheet, in the app's palette)

- Panel: `--atlas-raised` fill, 1 px `--atlas-line` border, top-left and bottom-right
  chamfers of 14 px via `clip-path: polygon(...)`; a 1 px orange (`#d9742b`) frame line at
  the page edge like the original's margin rule.
- Section tab: cyan (`#7fd3ea` light / the app's `--atlas-accent` dark), skewed
  parallelogram, black uppercase display face (the sheet's angular font → use the already
  loaded **Orbitron** at 600, letter-spacing 0.06em; it is loaded and barely used today).
- Value tag: rust (`#b5452f`) parallelogram, white uppercase label, value beneath in the
  panel.
- Tracks: 6 hollow circles 14 px, 1.5 px stroke; lit pip fills rust with a 2 px inner
  white dot.
- Everything respects column/half/full span: column stacks the panels in the sheet's
  reading order; half puts the two columns side by side; full matches the sheet.

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
- *Convention:* The northern spring equinox occurs at orbit angle 0° in the system frame,
  measured along the direction of motion. For a moon, the parent planet's orbit angle is
  used. This convention holds regardless of orbit eccentricity. (Johnny, 2026-10-03; it is
  stated in the tooltip and is one constant.)
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
- *Tidally locked:* A world locked to its star has no day/night cycle and no seasons; one
  face always points at the star. A moon locked to its parent planet has a day equal to its
  orbital period and seasons set by the parent's year and the moon's effective axial tilt.
  (Johnny, 2026-10-03.)
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

### 7.5 Delighter: temperatures people can feel (K / °C / °F)

Asked for 2026-10-02. Today the inspector's world table shows `288 K` with `15 °C` beside
it (`system_inspector.js:485-487, 776`); high/low temperatures are K-only (`:804`); the
orbit-view card, the season line, the surface climate text and both exporters are K-only.
Kelvin means nothing at the table. Players should read a habitable world the way they read
a weather forecast.

**One formatter, everywhere:** `formatTemp(kelvin, { style })` in `js/campaign_time.js`'s
sibling `js/units.js` (new, tiny; nothing in `js/` does units today):

- `style: 'full'` → `15 °C · 59 °F · 288 K` — the dossier world table, the orbit-view
  card, the sheet.
- `style: 'human'` → `15 °C (59 °F)` — the season line, Party panel, journal prefill,
  hover cards, exports. Kelvin is dropped here on purpose; it is in the `?` tooltip.
- `style: 'delta'` for ranges and day/night swings → `−40 … +35 °C (−40 … 95 °F)`.
- Rounding: whole degrees above 100 K spans; one decimal only when the value is within
  ±5 °C of a threshold the referee cares about (freezing, boiling, 30 °C "hot" from the
  rules' temperature bands) so "0.4 °C" reads as the edge it is.

**Setting** (Settings → Display): *Temperature units* — **Both (default)**, Celsius,
Fahrenheit. "Both" is the default because a table has both kinds of people at it; the two
scales are always in the same order (°C first) so the eye lands in the same place.

**Where it changes what you see:**
- Dossier world table: the `Mean temp.` row becomes `15 °C · 59 °F · 288 K`; high/low rows
  the same; the rules' band label (*Temperate*) stays as the row's kicker — the band is the
  rule, the degrees are the feel.
- Orbit-view hover card: one line `Temperate · 15 °C (59 °F)`.
- Season line (§7.4): `Northern autumn, severe · 9 °C (48 °F) today` — the "today" figure is
  the mean adjusted by the seasonal flux term already computed in §7.4; the `?` tooltip shows
  the annual mean and the swing. It is an estimate and is labelled as one.
- Surface climate text in the orbit view (`system_viewer.js:3541-3557`) keeps its own
  internal Kelvin; only its displayed strings go through the formatter.
- Player Pack and Obsidian/HTML exports: `human` style, so handouts never show Kelvin.
- Rules posture: nothing new is *derived*; the K→°C→°F conversion is arithmetic, and the
  band labels still come only from `rules/mgt2e_data.js` `temperatureBands`.

### 7.6 Delighters: living planets (orbit view, `js/planet_gl.js`)

Asked for 2026-10-02. Both are fragment-shader changes over the existing bake; no new
textures, no CPU work per frame.

#### 7.6a Clouds that move

**Today:** the cloud field is baked once into texture B's alpha (`cloudRaw`, `:155`,
`:315`) and sampled with a single rotation, `uCloudSpin`, set to 1.03 × the ground spin
(`system_viewer.js:2755`, `planet_gl.js:511`). Shapes never change; the 3 % drift is
invisible at normal time rates. Cloud *shadows* (`:606`) and night-side under-lighting
(`:628`) already exist and will follow for free.

**Change — sample the baked field through a moving, latitude-banded warp:**

```glsl
// in the planet pass, replacing toPlanet(n, uCloudSpin + …):
float lat   = asin(clamp(dot(n, uAxis), -1.0, 1.0));            // −π/2 … π/2
float zonal = uCloudSpin
            + uWind * cos(lat * 3.0) * 0.6                         // trade winds / jets: bands run at different speeds and signs
            + uWind * 0.15;                                        // mean drift
vec3  flow  = vec3(fbm3(n * 2.0 + uCloudTime * 0.05)) * 0.035;    // slow domain warp: shapes evolve, cyclones breathe
vec3  cn    = normalize(n + flow);
float cloud = texture(uB, toPlanet(cn, zonal + uSweep * 1.03 * f), bias).a;
```

- `uWind` (radians of longitude per sim-day) and `uCloudTime` (sim-days) come from the
  orrery's campaign clock, so clouds stream with the time shuttle and stand still when the
  clock is paused — like everything else in the orbit view. Scale: a full circuit in
  roughly 8–20 sim-days depending on the world (set from `profile.clouds.wind`, derived in
  `planet_profile.js` from rotation period and atmosphere density — a *derivation of look*,
  not of rules; it stays in the profile file).
- **Idle breath:** when the clock is paused, a very slow `uCloudTime` advance of
  0.02 sim-days per real second keeps the shapes alive without moving the terminator.
  Off under `prefers-reduced-motion`.
- Tidally locked worlds (`uSweep`): the warp still runs; the zonal term is replaced by a
  sub-stellar-point outflow (`flow` biased away from the sun direction), which is the
  pattern such a world would show.
- Gas giants keep their own band shader (`:704`); only the extra `flow` warp is added so
  belts ripple.
- Cost: one 3-octave `fbm3` and one `asin` per cloud sample; the same 1–5 samples per
  fragment as today.

#### 7.6b City lights: cities, not honeycombs (recipe)

> **Written as a recipe.** Every step names the file, the function, the exact lines to
> touch, the code to add, and how to check it. Do the steps in order; each one leaves the
> app working. Do not reinterpret the look — the "why" is given so the numbers can be tuned,
> not so the approach can be changed.

**The two symptoms (referee's screenshots, 2026-10-02):**
1. Zoomed *in*, roads swell into fat glowing bars (widths are in cell units, so they grow
   with zoom).
2. Zoomed *in*, cities read as a **honeycomb**: polygons with uniformly bright edges and
   black interiors, clusters with hard edges, and little cross-shaped flares. Zoomed out it
   looks right because the cells are sub-pixel and average into a glow.

**Why (one paragraph, so the fix makes sense):** `planet_gl.js` draws the night network
as Worley cell *edges* at three scales (`w1` 7, `w2` 26, `w3` 90; lines 538-545). Every edge
is lit the same whether it is downtown or the city's rim; cell interiors get only a flat
`base` of 0.018; the urban mask `density` has a hard boundary. Real cities from orbit are a
*gradient* of light (bright core → faint rim) with a ring-and-radial web riding on it,
speckle inside every block, and ribbon lights along the roads between towns. The recipe
adds those four things and caps line width in screen pixels. Nothing here changes the
far-away look, because every new term averages to the same brightness at sub-pixel scale.

All edits are in the **planet pass** fragment shader in `js/planet_gl.js` (the string
containing `uniform float uTime, uDetail, uCityHaze;`, line 331) unless a step says
otherwise. `fp` = cell units per screen pixel (already computed at line 530 as
`1.0 / (uRadiusPx * max(z, 0.15))`). `hash33` (line 374) and `hash13` (line 344) exist.

---

**Step 1 — `worleyF` must also return the *second* nearest cell id.**
File `planet_gl.js`, function `worleyF` (lines 381-393). It returns `vec3(d1, d2, id)`.
Change it to return `vec4(d1, d2, id1, id2)`:

```glsl
vec4 worleyF(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    float d1 = 8.0, d2 = 8.0, id1 = 0.0, id2 = 0.0;
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec3 o = vec3(float(x), float(y), float(z));
        vec3 h = hash33(i + o);
        vec3 r = o + h - f;
        float dd = dot(r, r);
        if (dd < d1) { d2 = d1; id2 = id1; d1 = dd; id1 = h.x; }
        else if (dd < d2) { d2 = dd; id2 = h.x; }
    }
    return vec4(sqrt(d1), sqrt(d2), id1, id2);
}
```
Then change every `vec3 w1/w2/w3 = worleyF(...)` to `vec4` (lines 531, 536, 540) and
every `.z` that meant "cell id" keeps working (`w2.z`, `w3.z`). `roads()` takes a `vec3 w`
and reads `w.x`, `w.y` — change its parameter to `vec4 w`; no other change inside it.
*Check:* the app renders exactly as before.

**Step 2 — cap road width in screen pixels (symptom 1).**
Add above `roads()`:
```glsl
float capW(float width, float fw, float maxPx) { return min(width, fw * maxPx); }
```
Replace lines 543-545 with:
```glsl
highway  = roads(w1, capW(0.02, fp *  7.0, 1.6), fp *  7.0) * (0.75 + 0.25 * sin(w1.x * 70.0 - uTime * 3.0));
arterial = roads(w2, capW(0.03, fp * 26.0, 1.3), fp * 26.0);
street   = roads(w3, capW(0.05, fp * 90.0, 1.0), fp * 90.0);
```
*Check:* at maximum zoom no road is wider than ~2 px. Far away: unchanged.

**Step 3 — an edge is only a road if the two cells it separates are both built-up, and
only some edges exist (kills the honeycomb).**
Right after `w2` is computed (line 536) add:
```glsl
// Which edge of the cell net are we on? Same id for both sides of one edge.
float edgeId  = fract((min(w2.z, w2.w) * 53.17 + max(w2.z, w2.w) * 91.31));
float keepArt = step(0.42, edgeId);                       // ~58 % of arterials exist
```
and after `w3`:
```glsl
float edgeId3 = fract((min(w3.z, w3.w) * 53.17 + max(w3.z, w3.w) * 91.31));
float keepStr = step(0.30, edgeId3);                      // ~70 % of streets exist
```
Multiply: `arterial *= keepArt;` and `street *= keepStr;` right after they are computed.
*Why:* a Voronoi net lights *every* edge; dropping a random 30-40 % of them turns the
polygons into an irregular web. The dropped edges are stable per world (they come from
cell ids, which come from `uOffset`).
*Check:* zoomed in, blocks are no longer closed polygons; some streets dead-end.

**Step 4 — brightness follows the city gradient, not the edge (kills "every edge the
same").**
The urban field `density = props.g` (line 520) is the city's shape. Build a *core-weighted*
gradient from it and from the highway-tier core (line 553 already has
`core = exp(-pow(w1.x / (0.1 + 0.18 * density), 2.0))`). Add after `core`:
```glsl
// Light falls off from downtown to the rim. Rim roads are faint, core roads bright.
float grad = pow(density, 0.6) * (0.35 + 0.65 * core);
```
Then change line 554-555 so lines are multiplied by `grad`, not just `density`:
```glsl
float lines  = (street * stW * 0.45 + arterial * arW * 0.7) * grad;
float fabric = mix(0.2 + 0.15 * core, base + lines, uDetail);
```
(`stW`, `arW`, `hwW` come from Step 6; until then use 1.0.)
*Check:* a city's rim roads are dim, its downtown web bright; no polygon is uniformly lit.

**Step 5 — fill the blocks: windows, and a soft block glow (kills the black interiors).**
After `street` is computed add:
```glsl
// Individual lights inside a block: a fine hash speckle, only once blocks are big
// enough on screen to show it (below that it averages into the base glow).
vec3  wq      = qc * 420.0 + uOffset.xzy;
float windows = step(0.86, hash13(floor(wq))) * smoothstep(0.012, 0.004, fp * 90.0);
// A block is never black: a soft fill that is brighter near the block's own centre.
float blockFill = 0.06 * (1.0 - smoothstep(0.0, 0.5, w3.x)) ;
```
and fold them into `base`:
```glsl
float base = 0.018 + 0.06 * core + (windows * 0.9 + blockFill) * grad;
```
*Check:* zoomed in, blocks glitter with points; nothing inside a city is pure black.

**Step 6 — tiers hand over as the finer tier resolves (no brightness jump).**
Add after `fp` (line 530):
```glsl
float resA = smoothstep(0.30, 0.10, fp * 26.0);   // arterials readable (cells ≥ ~6 px)
float resS = smoothstep(0.30, 0.10, fp * 90.0);   // streets readable
float hwW  = 1.0 - 0.75 * resA;                   // highways dim to 25 % once arterials show
float arW  = (1.0 - 0.65 * resS) * resA;          // arterials dim once streets show
float stW  = resS;
```
Use `hwW` on the highway in `cityNight` (line 557): `gold * (highway * hwW * 1.1 + core * 0.15)`.
*Check:* zoom from fit to maximum; mean night-side brightness does not step.

**Step 7 — radial avenues from each core (ring-and-radial = reads as a city).**
After `core` add:
```glsl
// Spokes out of downtown. 5-8 per city, from the highway cell's own id.
vec3  toCore  = qc - (floor(qc * 7.0 + uOffset) + 0.5) / 7.0;      // approx vector to this cell's centre
float ang     = atan(toCore.y, toCore.x);
float spokes  = floor(5.0 + 4.0 * fract(w1.z * 17.3));
float spoke   = 1.0 - smoothstep(0.0, fp * 7.0 * 1.4, abs(fract(ang * spokes / 6.2832 + w1.z) - 0.5) * 2.0 * length(toCore) * 0.5);
float radial  = spoke * core * smoothstep(0.05, 0.3, density) * arW;
arterial = max(arterial, radial);
```
*Check:* each downtown shows a few avenues radiating out, fading with distance.

**Step 8 — soften cluster boundaries with scattered outskirts.**
After `density` is read (line 520):
```glsl
// Suburbs: scattered lights past the city edge, thinning with distance.
float outskirts = step(0.93, hash13(floor(qc * 160.0 + uOffset.yxz))) * smoothstep(0.0, 0.25, density) * 0.35;
density = max(density, outskirts * (1.0 - density));
```
*Check:* cluster edges feather into scattered points instead of a hard mask.

**Step 9 — beacons: tiny, and no flare up close (the cross-shaped artefacts).**
Line 546-548 (`beacon`): change the last factor so beacons shrink with zoom and never
exceed 2 px:
```glsl
float beacon = step(0.965, fract(w3.z * 57.3)) * (1.0 - smoothstep(0.0, fp * 90.0 * 2.0, w3.x))
    * (0.6 + 0.4 * sin(uTime * 2.0 + w3.z * 40.0)) * smoothstep(0.3, 0.8, density);
street += beacon * 1.2;
```
*Check:* beacons are 1-2 px twinkles at any zoom; no crosses.

**Step 10 — day side gets the same caps.**
Line 558-561: `roadsDay` and the highway tint use `highway`, `arterial`, `street` which
are now capped and thinned; no further change needed. *Check:* daytime roads are thin.

---

**Verification (do all five):**
1. Hi-pop TL 12 world at night, zoom to maximum: no honeycomb; downtowns bright, rims
   dim; blocks glitter; some streets dead-end; avenues radiate from cores.
2. Same world zoomed to fit: identical to before within eyeballing (the far look must
   not change).
3. Lo-pop world: a few towns with ribbon lights between them, no net.
4. Zoom continuously in and out: no brightness step, no road ever wider than ~2 px.
5. `prefers-reduced-motion` unaffected (nothing here animates except the existing
   traffic shimmer and beacons).

**Tuning knobs** (change only these): `0.42` / `0.30` keep thresholds (Step 3),
`0.6` density exponent (Step 4), `0.86` window density and `420.0` window scale (Step 5),
`0.30→0.10` resolve ramps (Step 6), `5.0 + 4.0` spoke count (Step 7), `0.93` outskirts
(Step 8).

#### 7.6c Lightning in the clouds

Asked for 2026-10-02. Storms live where the cloud field is densest; a flash lights the
cloud top from *inside* on the night side and is barely visible by day — which is how it
reads from orbit.

**Where storms are:** `storm = smoothstep(0.78, 0.95, cloudRaw-sampled alpha)` — the
thickest 10–15 % of cover. No new bake: it is the same texture B alpha the clouds use, so
storms ride the 7.6a flow and drift with the weather.

**When a flash happens (per fragment, no CPU):**

```glsl
// Storm cells: coarse Worley over the warped cloud coordinate, ~40 cells per hemisphere.
vec3  sc     = worleyF(cn * 12.0 + uOffset.zyx);                 // sc.z = cell id
float cellT  = uCloudTime * 40.0 + sc.z * 97.0;                  // each cell has its own clock
float burst  = step(0.93, hash11(floor(cellT)));                 // ~7 % of ticks start a flash
float phase  = fract(cellT);
float flash  = burst * exp(-phase * 14.0)                        // sharp attack, ~70 ms decay at 1 sim-day/s
             * (1.0 + 0.6 * step(0.5, hash11(floor(cellT) + 0.5)) * exp(-abs(phase - 0.12) * 40.0)); // sometimes a double strike
float spot   = exp(-sc.x * sc.x * 18.0);                         // flash centred in the cell, soft edge
float bolt   = storm * flash * spot;
```

**How it is drawn:**
- Night side: `color += uFlashColor * bolt * (0.35 + 0.65 * cloud) * (1.0 − lit)` — the
  cloud top glows a cold white-blue (`uFlashColor = (0.85, 0.9, 1.0)`), brighter where the
  cloud is thicker, invisible on bare ground. A touch (`× 0.15`) bleeds into the night-side
  atmosphere term so the limb flickers when a storm sits near it.
- Day side: `× (1.0 − lit)` already makes it vanish in sunlight; in the terminator band it
  shows faintly, which is correct.
- Under `uHasClouds == 0` or gas giants: off (gas giants may get their own, deeper flashes
  later; not now).
- Frequency scales with the world: `uStormRate` from the profile — more on thick, wet
  atmospheres (`profile.clouds.cover` high and hydrographics ≥ 5), none on thin or
  vacuum worlds. Derived in `planet_profile.js` as a *look* parameter, not a rule.
- With the clock paused the idle breath (7.6a) keeps `uCloudTime` creeping, so a paused
  night side still flickers every few seconds — rarely, so it is noticed rather than
  watched. `prefers-reduced-motion` turns lightning off entirely.
- Cost: one coarse Worley (already one per road tier) and two hashes per fragment, only
  inside `storm > 0`.
- Check: a Hi-hydro, dense-atmosphere world at night shows an occasional soft flash inside
  a cloud bank, never on open sea; a vacuum world shows none; speeding the time shuttle
  makes storms visibly roll with the weather rather than blink in place.

### 7.7 Delighter: twice the worlds (terrain archetypes and palette families)

Asked for 2026-10-02: "everything starts to look samey." The cause is structural, not a
matter of tuning: there is **one** terrain generator (`terrainHeight`, `planet_gl.js:137-145`:
fbm continents + detail + optional craters), **nine** rock palettes (`planet_profile.js:87-97`),
and a family switch (`kind()`, `:49-66`) that maps every temperate world to the same
blue-sea/green-land continental look. Two Hi-pop garden worlds differ only in their noise
offset. The fix is more *kinds of* variation, each gated by the world's data so the look still
says something true about it, and chosen by the world's own seed so it is stable forever.

All of this is presentation (`planet_profile.js` → uniforms → `planet_gl.js`); nothing feeds
generation or export, and every new mapping is recorded in `directives/planet_rendering.md`
as that file already requires ("values still open for review").

#### 7.7a Terrain archetypes (`uTerrain`, one integer uniform; branch is uniform, so free)

Today's generator becomes archetype 0. Nine more height functions, each a few lines of
noise, each eligible only where the data allows:

| # | Archetype | Height function (sketch) | Eligible when |
|---|---|---|---|
| 0 | Continental (today) | fbm continents + detail | any |
| 1 | Archipelago | ridged fbm, sea level pushed high → thousands of islands and shelves | hydro 6–9 |
| 2 | Pangaea | one domain-warped supercontinent, one ocean, long shallow shelf | hydro 4–8 |
| 3 | Rift & ranges | ridged multifractal: long parallel chains, rift valleys, inland seas | tectonic stress high (`geology.mountains` ≥ 0.6) |
| 4 | Cratered highlands | dense crater field with a few flooded maria basins | barren / airless, craters ≥ 0.6 |
| 5 | Badlands & dune seas | terraced erosion (quantised height steps) + anisotropic dune noise along the wind axis | desert, atm ≥ 2 |
| 6 | Fractured ice shell | smooth shell with linear crack networks (Worley edges) and chaos terrain patches | ice, hydro ≥ 3 |
| 7 | Shield volcanoes | radial shield bumps with calderas, lava channels down the flanks, flood-basalt plains | volcanism ≥ 0.5 |
| 8 | Basin lakes (karst) | cellular basins (Worley) flooded to a fill level → a world of ten thousand lakes | hydro 2–5, atm ≥ 4 |
| 9 | Impact giant | one hemispheric basin with multi-ring rims and ejecta rays across the far side | barren or ice, size ≤ 5 |

Selection: from the eligible set by the world's seed (`seedOf(hexId + name)`), weighted so
the data's "natural" archetype is likeliest (an ocean world draws archipelago/pangaea 70 %
of the time, continental 30 %). Belts, rings and gas giants are unchanged (gas giants
already vary by band count and storm).

#### 7.7b Palette families (per family, 3–5 seeded sub-palettes)

Colour today is `ROCKS[composition]` plus a fixed sea, canopy and cloud colour. Each
becomes a small table drawn by seed within what the data permits:

- **Vegetation** — by the primary star's spectral type (already on the system): G stars
  green/olive; K and M stars darker red-brown to near-black (plants under red light); F and
  A stars pale blue-green; **exotic** or **tainted** atmospheres unlock violet, rust and
  grey-blue flora. Low biocomplexity stays mats and films (today's rule), in ochre, rust or
  teal.
- **Seas** — blue (default), teal, green (algal bloom, Hi hydro + life), wine-dark (iron
  rich, oxide rock), milky (silica, hot), pink (hypersaline, low hydro + warm), black (tar
  seas on exotic / corrosive atmospheres, `liquid` not water).
- **Ice** — white, blue-white, dirty grey (dusty), pink-tan (tholins, far from the star),
  translucent green-blue (thin shell over ocean, archetype 6).
- **Deserts** — ochre (default), red oxide (today's OXIDE), white salt flats, black sand
  (basalt), yellow (sulphur), pale pink (feldspar), banded (two-tone strata on badlands).
- **Barren rock** — the six compositions today plus two tones each (lit/dark), and a
  "mottled" variant that mixes two rock palettes by a coarse noise.
- **Clouds** — white; cream (dusty deserts); grey-blue (cold, thin); yellow-brown (high
  pressure, tainted); banded cirrus vs. cumulus clumps as a *shape* variant in `cloudRaw`.
- **Night cities** — the warm sodium default, cool white (high TL), neon (today's
  `uNeon`), and amber-red (low TL, firelight scale on TL ≤ 3 worlds).

Rough count: today ≈ 1 terrain × 9 palettes. After: 10 terrains × ~30 palette combinations,
gated by data — comfortably "at least double" in what a referee *sees*, and no two
neighbouring worlds share both a terrain and a palette unless their data forces it.

#### 7.7c Surface accents (small, cheap, each on by data)

- Polar caps with three shape styles (smooth, lobed, offset from the axis).
- Salt flats and playas in desert basins (bright patches at local minima).
- River hints: thin dark lines following the height gradient on temperate archetypes
  (screen-resolution, like roads — the same `roads()` trick over a flow field).
- Lava glow on volcano flanks at night (already partly there via `props.b`); extent tied
  to volcanism.
- Aurorae: faint green/violet ovals near the poles on the night side for worlds with an
  atmosphere and a fast rotation (a proxy for a magnetic field — stated as a proxy in
  `planet_rendering.md`). Off under reduced motion since they shimmer.

#### 7.7d Implementation notes

- Shader size: ten height functions add roughly 150 lines to the bake shader; the bake
  runs once per world, so render cost is unchanged. Palette choice is CPU-side in
  `planet_profile.js` and ships as uniforms it already has (`uRockLow/High`, `uLiqShallow/Deep`,
  `uCanopy/uScrub`, `uCloudColor`, `uCityColor`).
- `profile.id` must include the archetype and palette ids so the bake cache
  (`planet_gl.js:1003`) never serves one look for another.
- The referee can pin a look: `_manualFields` on the body for `terrainStyle` and
  `paletteId`, exposed in the hex editor's world panel as two dropdowns with live preview.
- Check: open twelve consecutive Hi-pop temperate worlds in the sample universe; no two
  share both terrain and vegetation palette; a K-star garden world is visibly red-brown; a
  Zero-hydro airless world is never an archipelago.

### 7.8 Delighter: the lineup transition (orbit view)

Asked for 2026-10-02. Today `_setLineup(mode)` (`system_viewer.js:2072-2081`) flips
`_lineup`, calls `fitView()`, and the next frame `_paintOrrery` dispatches to a different
renderer (`_drawLineup`, `:2775`). Orbits → Horizontal is a hard cut between two pictures.
The bodies are the same objects in both; they should *travel*.

**Model — one layout tween, driven by the existing rAF loop:**

```
_layoutTween = null | { from: 'orbits'|'row'|'column', to, t0, ms: 650,
                        fromCam: {offX, offY, zoom}, toCam: {offX, offY, zoom},
                        nodes: Map(body → { fromPx, toPx }) }
```

1. On switch: measure both layouts without drawing — the orbit layout via the existing
   `measureOnly` pass (`_paintOrrery(true)`), the lineup via `_drawLineup(true)` — and
   record each body's **screen** position in each. Also record the camera each layout
   wants (`fitView` for the target, current for the source) so the fit happens *during*
   the tween, not before it.
2. For `ms = 650` with ease-in-out quintic (slow in, fast middle, soft landing), every
   frame paints a **blend frame**: each body's disc at `lerp(fromPx, toPx, e)`, its radius
   at `lerp(fromR, toR, e)`, its caption at the target's caption position fading in over the
   last 40 %, the PlanetGL tile for that body sampled at the interpolated screen radius (the
   tile cache already keys by size), highports and moons riding their parent.
3. Paths rather than straight lines: a body leaving an orbit follows a short arc tangent
   to its orbit for the first 20 % (`e < 0.2` blends a tangential offset of
   `12 px · sin(πe/0.2)`), so the system looks like it *unspools* into the row rather than
   collapsing on a point. Reverse on the way back: they curve into their orbits.
4. **Stagger by orbit:** body *i* (innermost first) starts at `t0 + i · 28 ms` and keeps
   the same duration, capped so the outermost begins no later than 220 ms in. The star
   does not move in screen space during Orbits → Row (it is the anchor); the camera tween
   carries it to its row/column position instead, so the eye has one fixed point.
5. Orbit rings: in the blend frame the rings are drawn at `alpha = 1 − e` with their
   radius scaling toward the lineup's arc geometry (the lineup already draws orbit arcs
   behind the row, `:2609-2614`), so rings deform into arcs instead of vanishing.
   Jump-limit ring and scan reticles fade over the first 30 %.
6. Belts: the lineup draws a belt as a band of rocks; during the tween the orbit's dashed
   ring thins and its dash pattern flows (`dashOffset`) toward the band's position, then
   the rocks fade in over the last 30 %.
7. The time shuttle keeps running under it; positions for the *from* layout are re-measured
   each frame while `e < 0.5` (cheap: it is the measure pass), so a playing system does not
   jump at the end.
8. Interrupting: clicking another lineup mid-tween retargets from the *current blended*
   positions (same trick as the map's dissolve capture); no snap.
9. `prefers-reduced-motion` → `ms = 0`, today's behaviour.

**Row ↔ Column** uses the same tween (positions only; no unspool arc).

**Cost:** one extra measure pass at switch time and a lerp per body per frame for 650 ms.
No new textures. The hover card and the campaign locator read positions from
`_hitBodies`, which the blend frame fills with the interpolated positions, so the locator
line follows the body as it travels — which is the moment that will make people smile.

Check: on a six-world system with moons and a belt, Orbits → Horizontal reads as the
system unrolling left to right; the mainworld's locator line (if a record is tracked)
stays attached throughout; switching back mid-flight reverses smoothly; `showMapPerf`-style
timing in the orrery shows no frame over 8 ms during the tween.

### 7.9 Delighter (note for later): days of the week

**From Johnny, 2026-10-03. Not started; a note so it is implemented when the date and time
readout is rebuilt.** The date and time display shows the day of the week. The names, in
order:

| 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|
| Wonday | Tuday | Thirday | Forday | Fiday | Sixday | Senday |

**Day 001 is called "Holiday"** (Johnny, 2026-10-03) and is outside the week. The week
starts after it: day 002 is Wonday, and the seven names repeat through day 365 (364 days,
exactly 52 weeks, so day 365 is Senday). The "Holiday" name is confirmed; the day 002 start
follows from it.

Where it shows: wherever the stardate does (§7.1: the orrery header, the stardate dialog,
the timeline's Now line), beside the `DDD-YYYY` form answered in §10 Q4.

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

## 10. Halt & Challenge — what Johnny must supply before the sheets can be real

Per the Zero-Assumption Policy none of the following is filled from memory. Each item names
the file the data should land in and what the engine will do until it exists.

| # | Question | Needed for | Until answered |
|---|---|---|---|
| Q1 | ~~Character sheet schema~~ **Structure supplied by the referee 2026-10-02** (official MgT2E sheet front and back, transcribed in §5.2a: characteristic names and order, every field and table, the skill names as printed). **Still needed:** how a characteristic's value maps to its DM (as a table), each skill's specialities, what Rads / Wounds / Recovery Period mean, and any rule the sheet implies but does not print | §5.2a, `rules/mgt2e_character_sheet.js` (Johnny places it from the transcription) | Sheet renders with the DM typed by hand; speciality cell free text |
| Q2 | ~~Ship sheet schema~~ **Structure supplied by the referee 2026-10-02** (official MgT2E sheet, transcribed in §5.3b; `rules/mgt2e_ship_sheet.js` to be placed by Johnny from that transcription). **Still needed:** the vocabularies the boxes expect (sensor types and DMs, software packages and bandwidth, weapon stats and traits, drive ratings), what a critical-hit pip means per system, how Hull Points relate to the hull, and crew post names | §5.3b | Sheet renders with free text in every box; pips carry no rule text |
| Q3 | ~~Default jump duration~~ **Answered by the referee 2026-10-02: one week, 168 hours, editable** (`settings.jumpHours`) | §5.3a | — |
| Q4 | ~~Calendar display form~~ **Answered by the referee 2026-10-02: `DDD-YYYY HHHH` everywhere** (365-day year, days 1–365, no leap/holiday handling — still to confirm with Johnny if the orrery's year length should differ) | §7.1 | — |
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
`js/campaign_party.js`, `renderer.js` (jump trail), `rules/mgt2e_*_sheet.js` (Johnny, when ready).
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
