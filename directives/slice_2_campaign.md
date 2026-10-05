# Slice 2 — Campaign on the truth

**Status:** WRITTEN 2026-10-04 by the orchestrator. Steps K1 to K5 are issued; K6 to K8 are
outlines, written in full when K5 reports.

**Johnny, 2026-10-04:** "Get actual campaign features roughed in next, to make this something
people would want to use, including the optional login. Our first pass will be everyone has
their own campaign layer for the base truth map, and then we can look at creating their own
maps." X sign-in only is fine.

**Evidence:** `findings/campaign_inventory.md` (Agent A: the plan and the legacy campaign code,
with the build order in its item 4), `findings/campaign_api_gaps.md` (Agent B: what the API has
against the specs), `findings/campaign_workspace_design.md` (Agent D: the look; in progress).
Specs: `data_model.md` §2 and §3, `api.md` slices 2 and 3, `campaign_manager_plan.md` §2.

---

## 0. Decisions for this slice

These settle what the specs left open. Where a spec file disagrees, this section wins and the
spec is corrected in the same step that builds it.

1. **What a visitor gets.** Signed out: the viewer, unchanged, and it never waits on the
   session. Signed in: one private universe, created on first use, named "My campaign",
   **pinned to the released truth version, with no map edits**. It holds campaign rows only.
2. **Not in this slice:** generation, hex or system editing, routes, borders, own maps,
   sharing, player views, snapshots, import and export, images, sheets, the org chart.
   `visibility` is stored (default `referee`) and has no UI. Discord and Google stay off.
3. **Record types:** the legacy eight (`person`, `place`, `business`, `organization`, `job`,
   `event`, `item`, `note`) plus `vessel`. Fields in the first pass: `id`, `type`, `kind`
   (free text, no UI yet), `name`, `summary`, `details`, `tags`, `anchor`, `visibility`,
   `rev`, `createdAt`, `updatedAt`, `deleted`. `when`, `sheet`, `status`, `images`,
   `playerNotes` are in the schema as nullable and are not written by any screen yet.
4. **Anchors use the new keys.** `null`, or
   `{ kind: 'system', hexKey: '<sector_slug>/<hhhh>', bodyKey?: string, locationLabel?: string }`,
   or `{ kind: 'record', id }`. `bodyKey` is the dossier body key (`s0`, `w3`, `w3m1`), the
   same one the surfaces identity uses. The legacy `hexId` is not used anywhere.
   **A body key is only stable within one truth version.** That is acceptable because the
   universe is pinned; migration to a rebuilt truth (v7) re-resolves body anchors by
   `locationLabel` and lists the ones it cannot place. Recorded here so nobody is surprised.
5. **Links** follow `campaign_manager_plan.md` §2.3, which is fuller than the three columns in
   `data_model.md`: `id`, `from`, `to`, `kind`, `role`, `order`, `since`, `until`, `notes`,
   `visibility`, `rev`, timestamps, `deleted`. First-pass kinds: `member`, `crew`, `owns`,
   `commands`, `ally`, `rival`, `enemy`, `contact`, `patron`, `client`, `target`, `involved`.
   The vocabulary table (labels on each end, allowed type pairs, which are symmetric) is data
   in `packages/shared`, copied from the plan's table. Labels only; no rules.
6. **The party** is a settings document, list kind `campaignSettings`:
   `{ party: { vesselId, memberIds, anchor }, kinds, calendar }`. "Where are we" resolves
   `vesselId` through its anchor chain, else `party.anchor`. The dated position log waits for
   the clock (K6).
7. **Ids** are made in the browser: `cr_`, `cl_` plus a UUID. The server accepts an id only if
   it matches the pattern for its table.
8. **Two counters per row.** `rev` is the row's own version, for optimistic writes: a change
   carries the `rev` it was based on, and a mismatch is a conflict returned with the server's
   row. `seq` is one counter per universe, stamped on every write, so a client can ask for
   "everything after seq N". Loading a campaign is that same call from zero.
9. **The browser holds the campaign in memory.** Load once, build an index, edit locally,
   send edits as one batched `PATCH`. The server is the truth; on a conflict the server's row
   wins and the user is told. Search, backlinks and "records here" are answered from the
   in-memory index. The server FTS table and `campaign/search` are **not** built in this
   slice (`data_model.md` keeps them for the Builder's larger universes).
10. **Limits:** 20,000 live records and 60,000 live links per universe; a `PATCH` carries at
    most 200 rows and 1 MB; `name` 200 characters, `summary` 500, `details` 20,000, 32 tags of
    40 characters; ten universes per account. Over a limit is `too_large` or `validation`,
    never a silent trim.
11. **Authorisation.** The Worker checks the session and the D1 `universes.owner_id`, checks
    `Origin` on every mutation, then forwards to the Durable Object named by the universe id.
    The Durable Object is reachable only through the Worker and trusts the forwarded request.
    A per-universe mutation budget (120 a minute) lives in the Durable Object.
12. **Tracks.** K1 touches `packages/shared`; K2 and K3 touch `apps/api`; K4 touches
    `apps/web/src/account` and `apps/web/src/campaign` (logic, no screens); K5 touches screens.
    No step edits another track's files; a step that needs to says so and stops.

---

## K1. Shared schemas (Agent A) — `packages/shared`

New file `packages/shared/src/schemas/campaign.ts`, exported from `index.ts`, zod only.

- `Universe`, `UniverseCreate` (`name`, `truthVersion: string | null`, `editionDefault`),
  `UniverseUpdate` (`name`).
- `CampaignAnchor`, `CampaignRecord`, `CampaignLink`, `CampaignSettings` as §0.3 to §0.6, with
  the limits of §0.10 in the schema. `hexKey` reuses the overlay document's hex key pattern.
- `CAMPAIGN_RECORD_TYPES`, and `CAMPAIGN_LINK_KINDS`: one row per first-pass kind with
  `fromTypes`, `toTypes`, `labelFrom`, `labelTo`, `symmetric`, copied from
  `campaign_manager_plan.md` §2.3. A test asserts every row's types are record types.
- `CampaignChanges`: `{ records?: RecordChange[], links?: LinkChange[], settings?: SettingsChange }`.
  A row change is the full row plus `baseRev` (0 for a new row), or
  `{ id, baseRev, deleted: true }`.
- `CampaignPage`: `{ records, links, settings, seq, done }`.
- `CampaignChangesResult`: `{ applied: [{ table, id, rev, seq }], conflicts: [{ table, id, current }] }`.
- Pure helpers, same file or `campaign_logic.ts`, no I/O:
  `locate(id, recordsById)` following `record` anchors to a system anchor or null, depth 8,
  cycle-safe; `linkAllowed(kind, fromType, toType)`.

**Check (`tests/shared/campaign.test.js`):** each schema accepts a good value and rejects each
limit breach and a legacy-style hex id; `locate` handles a chain, a cycle and a dangling id;
`linkAllowed` matches the table.

## K2. Universes in the catalogue (Agent B) — `apps/api`

- Migration `apps/api/src/db/migrations/0008_universes.sql` and the Drizzle table in
  `db/schema.ts`, columns as `data_model.md` §2, index on `owner_id`. Hand-written, like 0004
  to 0007.
- `apps/api/src/routes/universes.ts`, mounted at `/api/universes`:
  `GET /` (mine, not deleted), `POST /` (`UniverseCreate`; `truthVersion` must be a released
  version or null; refuses an eleventh), `GET /:id`, `PATCH /:id` (`UniverseUpdate`),
  `DELETE /:id` (soft delete, `purge_after` 30 days on).
- `apps/api/src/universe/forward.ts`: `ownedUniverse(c)` loads the row, answers 404 for a
  missing or deleted one and for one the caller does not own (never 403: do not reveal that
  an id exists), checks `Origin` on a mutation, and returns a function that forwards the
  request to `env.UNIVERSE.idFromName(id)` with the user id and universe id in headers.
- Correct `api.md` (slice 2 rows that this slice builds are marked built; the rest untouched).

**Check (`tests/api`, the black-box suite, `RUN_API_TESTS=1`):** signed out, every route is
401; create then list; a second account gets 404 on the first one's universe; an eleventh create
is refused; delete hides it. Say in the report whether the suite ran.

## K3. The campaign in the Durable Object (Agent B, after K2) — `apps/api/src/universe`

- `universe/schema.ts`: schema version 2 adds `campaign_records`, `campaign_links`, with the
  columns of §0.3 and §0.5 plus `rev`, `seq`, `deleted`; indexes on `seq`, `type`, `from_id`,
  `to_id`. `campaign_journal` and the FTS table are **not** created yet. Version 1 databases
  upgrade in place. Correct `data_model.md` §3 to these columns.
- `universe/campaign.ts`, pure over a small SQL interface (`exec(sql, ...params)`), so it runs
  under Node in tests:
  - `readCampaign(sql, afterSeq, limit)` → a `CampaignPage`; rows ordered by `seq`; tombstones
    included so a client can drop what it holds; `limit` at most 1,000.
  - `applyCampaignChanges(sql, changes, now)` in one transaction: validate with
    `CampaignChanges`; per row, compare `baseRev` with the stored `rev`; equal (or 0 and
    absent) writes `rev + 1` and the next `seq`; otherwise the row goes to `conflicts` with
    the stored row. A link whose `from` or `to` is not a live record is a conflict. A
    `member` link that would make an organization its own ancestor is refused with a
    message. Limits of §0.10 enforced. Deleting a record tombstones its links in the same
    transaction and reports them in `applied`.
- `UniverseDO.fetch` routes `GET /campaign?after=&limit=` and `PATCH /campaign/changes`, keeps
  the mutation budget, and answers anything else 404.
- `routes/universes.ts` forwards `/:id/campaign` and `/:id/campaign/changes` through
  `ownedUniverse`. Correct `api.md` slice 3 (the `after` cursor; search deferred).

**Check (`tests/api/campaign_logic.test.js`, plain Node with `node:sqlite`):** create, edit
with the right `baseRev`, edit with a stale one (conflict carries the stored row), delete and
its link tombstones, paging by `seq` with a limit of 2, the ancestor cycle, each limit. If
`node:sqlite` cannot stand in for the Durable Object's SQL, stop and report what differs.

## K4. The browser's side, no screens (Agent A, after K1) — `apps/web/src`

- `account/session.ts`: one module holding the session. `loadSession()` is called once after
  the map's first paint, never blocks it, and treats 401 as signed out with no message.
  `signIn()` and `signOut()` are the calls `views/Account.vue` makes today, moved here;
  `Account.vue` uses the module. A reactive `session` for components.
- `campaign/store.ts`: `openCampaign()` lists the universes, creates "My campaign" pinned to
  the truth version the map is showing when there is none, then loads pages until `done`.
  State: `status` (`signed-out`, `loading`, `ready`, `error`), records and links by id,
  settings, `seq`.
- `campaign/index.ts`: built on load and updated per change: by type, by tag, by resolved hex
  key, by body key, links from and to, a word index over name, summary, tags.
- `campaign/commit.ts`: `commit(changes)` applies to the store at once, queues the change, and
  flushes one `PATCH` at most every 800 ms and on page hide. Results: `applied` updates `rev`
  and `seq`; a conflict replaces the local row with the server's and raises one message
  through the existing toast path; a network failure keeps the queue and retries with
  backoff. `pending` and `lastError` are reactive, for a "saving / saved / offline" mark.
  New ids come from `platform/browser.ts`.
- All fetches go through the existing fetch wrapper with `credentials: 'same-origin'`.

**Check (`tests/web/campaign_store.test.js`, with an injected fetch):** first open creates one
universe and a second open does not; paging; commit then flush sends one batched body; a
conflict replaces the row; a failed flush keeps the queue and a later one sends it once; the
index answers "records at this hex", including a person aboard a vessel anchored there.

## K5. The screens (Agent D, to `findings/campaign_workspace_design.md`)

Built in this order, each a visible step, each reported:

- **K5a. Sign in.** The entry on the Rail and the account menu, from the design. Signed out,
  the campaign entry says what signing in gives and offers the X button. Nothing else in the
  viewer changes.
- **K5b. Records.** The campaign entry on the Rail; the list in the Panel (type chips with
  counts, search, empty state); the record page (name, summary, details, tags, type);
  create, edit in place, delete with undo by toast; the saving mark. No native dialogs.
- **K5c. Places.** The anchor editor: pick the system from the map or the omnibox, then
  optionally a world or moon from that system's bodies. The locator line jumps the map and
  the orbit view. A system's dossier and a body's dossier show "records here" and a button
  that creates one anchored there.
- **K5d. Links.** Add, edit and remove a link from either end, labelled from the shared
  vocabulary; "aboard" (an anchor on a vessel record). Both pages show it.
- **K5e. The party.** Members, the vessel, "Where are we" focusing the map, and the party's
  marker on the map at each zoom tier. The omnibox finds records and offers "New person
  here" and the like.

**Check for each:** `npm test`, `npm run check`, `npm run build` green; the step exercised in
a browser signed in and signed out, at 520 px, half and full; keyboard reach; reduced motion;
the contrast test; screenshots beside the legacy campaign screens.

- **K5f. More than one campaign (Johnny, 2026-10-04).** Create, name, switch and delete
  campaigns from the account menu; the store is keyed by universe id and reloads on a switch;
  the last one used opens on sign-in. Each is its own universe: nothing is shared between two
  campaigns unless the Library (K10, K11) puts it there.

### Rulings on Agent D's design (`findings/campaign_workspace_design.md`), 2026-10-04

All sixteen of D's recommended choices (J1 to J16) are adopted as drawn, with J1 settled as X
only. D's five points for the orchestrator:
- **Body anchor:** §0.4. Store the dossier body key and the body's name as `locationLabel`;
  when the key no longer matches, show the system and say the world could not be matched.
- **Undo:** a delete is a tombstone, never purged in this slice. Undo sends the record and its
  links back with `deleted: false` and the current `rev`. "Recently deleted" is the session's
  own list.
- **Map drawing:** the party marker and the locator are a new `map/campaign_layer.ts`, drawn
  after the chart layers; it reads the campaign index and never fetches.
- **Search:** the OmniBox's campaign group reads the in-memory word index (K4).
- **Contrast pairs** go into `tests/web/contrast.test.js` with the screen that uses them.

## K6 to K8 (outlines)

- **K6. The clock (written in full 2026-10-04).** The campaign date is one number, `days`, the
  same count the orbit view's clock already uses (`orbit/clock.ts`: `totalDays`, `splitDays`,
  365-day display years, fractional for the time of day). No new calendar arithmetic.
  - **Looking is not advancing.** Scrubbing time in the orbit view never changes the campaign
    date. The date changes only by an explicit act: "Set as campaign date" in the orbit view,
    or editing it in the campaign panel.
  - **K6a (Agent B), shared and API.** `CampaignClock = { days, rev }` (`days` finite, at least
    0); `CampaignChanges.clock?: { days, baseRev }`; `CampaignPage.clock` (null until first
    set); `applied` gains table `clock`. Stored as list kind `campaignTime`, with a
    `list_history` row per change so the date can be walked back. A stale `baseRev` is a
    conflict carrying the stored clock.
  - **K6b (Agent A), the store.** `campaign.clock`, `setCampaignDate(days)` through `commit`;
    conflicts take the server's value and say so.
  - **K6c (Agent D), the screens.** With a campaign open and no date in the link, the orbit
    view opens on the campaign date and shows it as a mark on the time row; "Set as campaign
    date" appears when the view's date differs; the campaign panel shows the date
    (`DDD-YYYY`, the weekday names of `campaign_manager_plan.md` §7.9, day 001 "Holiday") and
    edits it. Signed out, the orbit view is exactly as now.
  - **"Advance 1 week" (Johnny, 2026-10-04).** A button in the orbit view's time controls that
    moves the date on seven days, placed with the primary controls. Johnny: it is "way, way
    more important than when the planets align", because a week is the typical time for a
    jump. **The line-up search moves out of the time row into an overflow ("kebab") menu.**
    Signed out, or with the view away from the campaign date, it moves the view only. With a
    campaign open and the view on the campaign date, it advances the campaign date as well,
    with undo by toast (the one case where a time control writes the date; orchestrator's
    proposal, Johnny may overrule). The view part needs no campaign and is built first.
  - **K6d, later:** the vessel's dated position log and the Jump button.
- **K7. The journal.** `campaign_journal` (schema version 3, columns from the plan's §2.4),
  sessions and notes dated from the clock and anchored to the party.
- **K8. The timeline.** Dated records and journal entries in one list; choosing a row focuses
  its place.

- **K9. Deck plans on the ship sheet (Johnny, 2026-10-04).** A vessel record can carry a deck
  plan imported from the JSON that the Geomorph Shipyard exports. The JSON is the ship: it is
  validated and stored on the vessel record (`sheet.deckPlan`: `name`, `parts`), and the plan is
  drawn in the browser from tile images, exactly as `assets/geomorphs/REBUILD.md` describes
  (three-corner mapping, array order, overlays, mirrored tiles, missing tiles skipped). Later, a
  builder of our own writes the same JSON. Before this is written in full:
  - **Where the tiles live.** 3,028 files, 87 MB. They are served from the public CDN under
    `geomorphs/`, with `manifest.json` beside them; they do not go into the web bundle, and
    whether the PNGs are committed to git is Johnny's call (recommended: not).
  - **Licences, from `assets/geomorphs/ATTRIBUTION.txt`.** The images are CC BY-NC 4.0 (Robert
    Pearce and Eric B. Smith): credit shown wherever a plan is shown, and non-commercial use
    only. The shipyard software is GPL-3.0: the placement code is written from REBUILD.md's
    description and its own tests, not copied from the shipyard's source.
  - A parity check: one exported JSON drawn by our code against the shipyard's own picture
    export of the same ship.

- **K10. The Library: copy between campaigns ("instanced").** Johnny: a referee with two games
  wants to bring a character from one into the other. Pick records in one campaign, copy them
  into another: new ids, links among the copied set kept, and
  `provenance: { mode: 'copy', universeId, recordId, rev, at }` on each copy. The copy then
  lives its own life. Places are copied with their anchors because both campaigns sit on the same truth.
- **K11. The Library: shared records.** The same character in two games, where what happens in
  one shows in the other. A record lives in exactly one store, so a shared record lives in an
  **account library** (one more universe-shaped store per account) and each campaign holds a
  reference to it. Proposed split, to confirm with Johnny when this is written: what the
  character **is** (name, summary, details, tags, sheet, status) is shared; where they are and
  who they know **in this game** (anchor, links, visibility) belongs to each campaign. A shared
  record can be detached into a copy at any time. This needs its own design pass (conflicts
  when two tables are open at once, deleting from the library, the vessel a shared person is
  aboard).

## Verification for K1 to K5

- [ ] `npm test`, `npm run check`, `npm run build` green; the API suite run at least once
      against `wrangler dev` with `RUN_API_TESTS=1`
- [ ] Migration 0008 applied in production before the first sign-in is offered
- [ ] Signed out, the viewer's cold load is no slower than before (measured)
- [ ] A second account cannot read or write the first account's campaign
- [ ] Sign in on one machine, add a record at Regina; sign in on another and find it
- [ ] `data_model.md` and `api.md` match what was built
