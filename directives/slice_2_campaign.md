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
  - **The date beside the search bar, and the Rail (Johnny, 2026-10-05).** "A clear
    `DDD-YYYY` date next to the search bar", designed by Agent D so it fits the look. Ruling
    until D's design says otherwise: signed in, it is the campaign date and opens the clock
    editor; signed out, it is the date the orbit view is showing, quieter. It is built with
    K6c. Also: **the magnifying-glass entry leaves the Rail** (the search field is already
    on the page); D keeps keyboard reach to the field and checks the narrow layout, where
    the Rail button may be what opens the field today.
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

- **K12. Plotting and flying jumps (Johnny, 2026-10-05; parked until the MVP steps above are
  done).** "A ref or players plot and plan jumps on the Mongoose 2e rules. Plot a location,
  set a speed of 1 to 6 G, and watch the ship's ping go to it in the orbit view; once outside
  the minimum jump distance, with the next system marked, press Jump: the jump bubble
  appears, fades, and appears at the destination a week later", tracking time and place in
  the universe and in the orbit. Builds on K6 (the clock), K5e (the party and its vessel),
  the plan's §5.3 position log and §5.3a Jump button, and the orbit view's clock.
  - **What the app does on its own (geometry and display, no rules):** the destination picked
    on the map; the hex ring while picking (`getHexDistance`); a target in the orbit view; the
    ship marker moving along a straight flight at the chosen rating; the bubble animation;
    position rows (`transit`, `jump`, `arrives`) written through the store; the orbit view
    following the campaign date (K6c).
  - **What must come from `rules/` before any of it is built (Zero-Assumption; nothing in
    `rules/` covers jump or in-system travel today):** (1) the minimum distance from a body
    before a jump; (2) the travel-time rule for a ship at a given G rating over a distance;
    (3) how far a jump may reach, from the drive; (4) the jump duration (already supplied:
    168 h, `settings.jumpHours`) and whether it varies; (5) anything about fuel the app
    should show or refuse on. Johnny supplies these as a `rules/` file; recorded as question
    G1 in `questions_for_johnny.md`. Until then the step has no owner.
  - **Rules supplied (Johnny, 2026-10-06; G1 answered).** The book's text for fuel, jump
    travel and travel times; the numbers are `rules/mgt2e_space_travel.json`, read through
    the generated wrapper, none written in code. What the app does with them
    (orchestrator's rulings; Johnny may overrule):
    1. **One module computes:** `apps/web/src/campaign/travel.ts` (Agent A):
       `transitSeconds(distanceKm, accelG)` from the formula (the Transit Times table is
       reference; 11 of its 90 cells differ from the formula by more than rounding and are
       listed in the test, never "fixed"), `jumpParsecsCounted`, `jumpFuelTons`,
       `rollJumpHours`, and `ASSUMED_HULL_TONS = 100` (Johnny's stand-in, below). The
       book's D is the engines' six-sided die (`roll1D` in `core/rng.js`); a campaign roll
       is not seeded. Reach, refuelling and the fuel prices are in the rules file and are
       not coded until vNext uses them.
    2. **Jump lasts 148 + 6D hours.** The app rolls it when the jump is plotted, shows the
       dice ("148 + 23 = 171 h"), offers "Roll again", and the referee may type over it.
       **`settings.jumpHours` is withdrawn** (it was never pushed); the fixed 168 of
       2026-10-02 is superseded.
    3. **The MVP measures and lets anything go (Johnny, 2026-10-06, answering G2).** While
       plotting a course the preview shows **estimates**: a flight's distance and time at
       the chosen G; a jump's parsecs (`getHexDistance`, at least 1), its rolled time and
       its fuel. The fuel sum takes the hull as **100 tons** (Johnny's stand-in "just for
       MVP"), and the screen says so ("about 20 tons for a 100-ton hull"). Nothing is
       deducted from a ship, no ship field is read, nothing warns or refuses. **vNext**
       ties the ship's own fields to the sums, then warnings and refuelling; which fields,
       Johnny decides. **A flight's fuel (G3 and G4, answered 2026-10-06):** a manoeuvre
       drive uses none; a reaction drive uses 2.5% of the tonnage per Thrust per hour. The
       app does not know the drive, so the flight preview shows both lines: "Manoeuvre
       drive: no fuel" and "Reaction drive: about N tons" for the assumed hull, the G flown
       and the hours of the flight (`reactionFuelTons`).
    3b. **"Where are we" is the track's answer (2026-10-06, from D's finding).** The Party
       tab and the party's marker read `whereAreWe` at the campaign date; "Move the party"
       on a ship with a track writes a docked leg; an empty track is no track. The campaign
       index ("records here", people aboard) still resolves anchors only: part 2b.
    4. **Flight legs:** the duration is filled from `transitSeconds` over the distance
       between the two places at departure and the chosen G; still editable. Part 2.
    5. **Arrival:** the ship comes out on the 100-diameter circle of the destination's
       mainworld. Part 2, with the bubble.
    6. Not supplied, not built: Astrogation checks, inaccurate jumps, the danger of
       unrefined fuel, current fuel aboard.
  - **Many ships, and the track as a record (Johnny, 2026-10-05).** "Orbit could be handling
    multiple ship navigation plots; this will not be single-threaded. Attach ship nav as a
    data / diary feed for the ship so the route can be re-created, re-used or re-traced:
    a GPS record or black-box record for the ship. The engine will create many of these,
    so we could mock up ship traffic: see what ships in the sector are doing, patrols and
    whatnot." Consequences, recorded now so K15 and K6d build toward them:
    1. **A track is data, not UI state.** Each vessel carries a **track**: an ordered list of
       dated legs `{ from, to, departs, arrives, mode: 'flight' | 'jump' | 'docked' | 'orbit',
       accelG?, note? }` on the vessel's `status` (the plan's §5.3 position log, widened).
       The orbit view and the map draw a ship's place at any date from its track; a track
       can be copied to another ship, replayed, or edited. The party's ship is one track
       among many.
    2. **The orbit view draws any number of ships.** D's K15 status strip is for the
       *selected* ship; a ship list (the campaign's vessels in this system, then generated
       traffic) picks which. K15 part 2 reserves for this: the strip takes a ship, not "the"
       ship.
    2b. **Sensor designators and the plotting mode (Johnny, 2026-10-05).** "A cool ship sensor
       reading, rendered as a vector wireframe designator: a triangle, circle, square,
       rectangle, like Homeworld's zoomed-out view." Each ship on the orbit view is drawn as
       a thin wireframe designator in the view's tokens (shape by vessel class or kind, the
       party's ship distinguished), with its name, not a sprite. **Plotting mode** is a
       toggle (a key and a command): while on, horizontal and vertical hairlines and a
       coordinate readout track the pointer over the picture (2D for now; the view's own
       units, with the distance from the selected ship); a click sets the destination and
       the leg is previewed before it is written to the track. Fuel and time rules come
       after (G1); until then a leg's duration is typed or taken from the engines'
       `calculateBaseJourneyTimes` once Johnny confirms it (G1 note).
    3. **Generated traffic (later, K16).** The engines produce tracks for ships that are not
       records (patrols, traders, liners) from the universe's seed and the system's data,
       as a derived file per universe (`architecture.md` §10.1), never in the browser.
       Drawn as the same marks, dimmer; a referee can "take" one into a vessel record. Needs
       the G1 rules and its own recipe.

- **K13. Sheets from the official PDFs (Johnny, 2026-10-05).** Johnny added
  `assets/Ship Sheet 2026_fillable.pdf` (two pages, **312 named form fields**), with print
  A4 and Letter versions; character sheet PDFs are to follow. "We will want to create our
  own versions of these for the campaign tools." These replace the image the plan's §5.3b
  was transcribed from: the fillable PDF's field names and positions are the sheet's
  structure, supplied, not inferred.
  - **Part 1 (read-only inventory, Agent B):** extract every field (name, page, type, box,
    group by its section) into `findings/ship_sheet_fields.json` and a short markdown, and
    diff it against §5.3b's transcription. No meanings, no legal values, no derived numbers.
  - **Part 2 (Johnny):** the field list becomes `rules/mgt2e_ship_sheet.js` (§5.3b), or he
    says the findings file may be consumed as is through the generated ESM wrapper.
  - **Part 3 (Agent D, after K5f):** the vessel record's Sheet section renders the fields in
    the app's own look (§5.3b: chamfered panels, cyan tabs, rust-red tags), stored as
    `sheet` against `mgt2e_ship_sheet@1`, plain fields, nothing computed. The deck plan
    (K9) sits inside it. The character sheet follows the same three parts when its PDF
    arrives.

- **K14. Images on records (Johnny, 2026-10-05): a primary image and further images on every
  record.** The specs already hold the storage: `data_model.md` §1 (images are objects in
  the private bucket under `u/<universeId>/objects/<hash>`, `image/webp`, the asset id is the
  hash), `api.md` (`PUT` and `GET /api/universes/:id/objects/:hash`, hash verified, 8 MB cap),
  and the record's nullable `images` column. Decisions for this step:
  1. **Shape.** `images: CampaignImage[] | null`, `CampaignImage = { hash, thumbHash, width,
     height, bytes, caption?: string (200) }`. **The first entry is the primary image**; order
     is the gallery order. At most 12 per record. The row's `rev` covers it like any field.
  2. **The browser does the work.** It decodes the chosen file, re-encodes to WebP (longest
     side at most 2048 px, quality 0.85), makes a 320 px thumbnail the same way, hashes both
     with SHA-256 (`crypto.subtle`), `PUT`s both (a `PUT` of a hash the bucket already holds
     answers 200 without writing), then commits the record change. A browser that cannot
     encode WebP is told so; nothing is uploaded as another type.
  3. **The Worker** verifies the hash of the body it received, sniffs the WebP header, caps
     8 MB, checks `Origin`, and keeps `universes.objectBytes` current. **Quota 250 MB per
     universe** (orchestrator's number; Johnny may change it); over it is `too_large`.
     `GET` streams the object to its owner with `Cache-Control: private, immutable`.
  4. **Removing** an image removes its entry; the object stays until the sweep in
     `data_model.md` §1 exists (not this step). Deleting a record leaves its images listed on
     the tombstone, so undo brings them back.
  5. **Screens (Agent D, after K5f):** the primary image at the head of the record page and
     as a thumbnail on list rows, "records here" rows and omnibox results; a gallery strip
     with add (file chooser, drop, paste), remove with undo, "Make primary", caption in
     place; a lightbox with keyboard reach; upload progress and failure in the saving mark's
     language. Sheets and deck plans are not images.
  - **Owners:** A, shared schema and `campaign/images.ts` (encode, thumbnail, hash, upload,
    the record change), tested with an injected fetch and a small PNG fixture. B, the two
    object routes and the quota, black-box tested on `wrangler dev`. D, the screens.

- **K17. Shared ship feeds: follow an account, faction accounts (Johnny, 2026-10-05).** "A
  shared data element for anyone using the default universe map in their campaign, so we
  can see all the ships created by players; a way to 'follow' an account that shows the
  ships in their campaign, so it does not spam; and pseudo accounts for the various
  factions where we make NPC ship movements that people can subscribe to." Design, to be
  written in full after K6d and K16:
  1. **Publish is per vessel and opt-in.** A vessel's track is private unless its owner marks
     it published (a flag on the record). Publishing is only possible on a universe pinned
     to the released truth (same map for everyone).
  2. **A feed is a file.** On each change to a published vessel (debounced), the Worker
     writes `feeds/<accountId>/ships.json` to the public bucket: the account's display name,
     the truth version, and each published vessel's name, class, image hash and track (legs
     only, no notes). A D1 row points at the current hash. Readers fetch files from the CDN
     and never reach into anyone's Durable Object.
  3. **Follow is a row** (`follows`: follower, followed, since). The viewer loads the feeds
     of the accounts the visitor follows and draws their ships on the map and in the orbit
     view in a dimmer mark with the owner's name; a click opens a read-only card. Signed
     out: nothing. Caps: published vessels per account, follows per account, publishes per
     hour (anti-spam, with K2's budgets as the pattern).
  4. **Faction accounts** are accounts with `kind: 'faction'`, created and owned by Johnny
     (admin); their universes hold generated traffic (K16) and publish it; subscribing is
     following. A faction's feed can be large; it is one file, cached, versioned by hash.
  5. **Privacy:** only what is published leaves the account: vessel name, class, image,
     legs. Records, people, notes and anchors other than the track never do.

- **Deck plan and orbit follow-ups (Johnny, 2026-10-05, after seeing them live).**
  1. **Full-screen deck plan (D):** an expand icon on the viewer opens the plan in the app's
     one modal (the Lightbox pattern) at the window's size, with pan, zoom, fit, the credit
     and Esc; "to see and pan in a much larger window".
  2. **Fuzzy tiles when zoomed out (C):** the 600 px tiles are drawn at small scales with
     the canvas's default (low) smoothing; set `imageSmoothingQuality = 'high'` and draw from
     pre-halved copies (a two- or three-level mip per tile, made once) when the scale is
     under one half, so lines stay crisp at every zoom.
  3. **The layout choice as a split button (D):** Orbits / Row / Column becomes a split
     button whose face shows the selected view and whose arrow opens the three; same keys
     (1/2/3), same place on the picture.
  4. **The stardate chip (D):** the text in `button.stardate` (the bold date and the weekday)
     is not vertically aligned with its icon; align it.
  5. **Scrub glitch (D):** scrubbing in the orbit view across the "current" tick (the
     campaign mark on the track) makes something jump back and forth for a moment; find the
     cause (a snap, a reset of the drag origin, or two writers of `days`) and remove it. The
     manifesto's "graceful" rule: nothing pops.
  6. **Controls into the top orbit nav, with drawers (D, design first):** Johnny would like
     the controls to live in the orbit header and open as **control drawers** with a
     graceful sci-fi micro-animation (tokens' motion only; none under reduced motion).
     D proposes one layout with a mockup before building: which controls become drawers
     (time, layers, view), what stays always visible (play, the date, the campaign mark),
     and the keys.
  7. **The day/night marker in real time (C):** no "Starport HH:MM" label. The tick becomes a
     **heavy play marker**, about three times its present size, extending a few pixels past
     the strip's top and bottom with rounded ends, in the strip's own tokens. It **moves with
     the running orbit clock** (the dossier subscribes to the clock, not only to the link),
     left to right and looping: a real-time translation of the universal time to the world's
     local time. Clean, minimal, graceful.
  8. **The ship sheet as a panel default (D):** remove "N of 312", the PDF file name, the
     orange frame line and the page numbers; the sheet reads as part of the panel. Every
     section collapses and expands (state kept per session). In any table that scrolls
     sideways, the row's key column (the row number or the first field) stays frozen so the
     user keeps context. Johnny: "love the custom scroll".
  9. **Passengers and crew as people (D, "workshop it, do your best"):** in the Passengers and
     Crew sections, a name field gets a **+** that offers "existing person" (the campaign's
     people, picked as in K5d) or "new person" (created and linked), or the field is typed
     as plain text, untracked. A picked person shows as a **pill** in the field; pressing the
     pill opens that person in the app's one modal (a read-only card with "Open record").
     The link is a `crew` or `passenger` connection (K5d vocabulary; `passenger` is added to
     the shared table if absent, labels only), so both pages show it.

  10. **The credit line (C):** "Deck geomorphs by Robert Pearce and Eric B. Smith, CC BY-NC
      4.0." in smaller type so it sits on one line at every width (always shown; the licence
      requires it).
  11. **The marker's colour (C):** the play marker is the day's yellow; make it a teal (an
      existing accent token) that contrasts with both the yellow day and the dark-blue night;
      the contrast test gets both pairs.
  12. **Stray sideways scrolls in the sheet at column width (D):** several tables show an
      x-scroll of a few pixels that should not be there; size the tables to the column or let
      them wrap, so a scroll appears only when a table is truly wider.
  13. **The folding sections (D):** when folded, the tab's background stops short of the full
      panel width; make it span. Open and close with the tokens' motion (a graceful sci-fi
      reveal, not a snap); none under reduced motion. Johnny: "nice and crisp now" on the
      deck plan, "looking great" on the thermometer.

  14. **Layer toggles with motion (D, design and build):** Paths, Moons, Habitable, Jump
      limit, Day/night, Scan snap on and off today. Johnny wants a micro-animation for each,
      "smooth, elegant, sci-fi": the habitable band and the jump-limit rings grow out from
      their star and shrink back; orbits likewise; moons and day/night could be drawn as a
      teal wireframe sphere that fades in or out as the transition. Durations and easing
      from the tokens' motion only; none under reduced motion (instant); the renderer's
      steady-state frame unchanged (the parity shots still match once the motion ends).
  14b. **Johnny on the live toggle motion (2026-10-06; Agent C,
      `prompts/c_toggle_motion_2.md`).** "The path animation reveal is correct (a little
      fast), but when you hide it, it just instantly vanishes, I want to reverse the reveal
      animation. The moon animation is super lame and stuttery, I want a wave of teal
      wireframe to sweep over the planet, either triangles or quads, and for day / night, it
      can just be a solid teal sci-fi microanimation." His two reference pictures are
      `findings/ui_design_shots/ref_fu14_wireframe_{a,b}.png`. Rulings: a hide is the reveal
      played backwards (the cause of "vanishes": the shrink ran through `--ease-out`, so most
      of it was over in the first fifth); rings and paths over `--t-slow`; Moons is a
      latitude-longitude wireframe globe in `--signal` shown as a wave crossing each world
      that has moons, the moons arriving with it, over `--t-long` (quads chosen; triangles
      only if quads do not read); Day/night is one solid teal sweep from the lit limb to the
      terminator that covers the exchange of flat and shaded discs; no frame over 50 ms,
      measured.
  14c. **Johnny on the second motion pass (2026-10-06; Agent C,
      `prompts/c_toggle_motion_3.md`).** "Toggle animations are okay, let's have the moon and
      day night also radiate from the orbiting sun, and then add some fades to the teal,
      because it just POPS on, so some transparency fades would really put the ux/ui motion
      design polish that I'm looking for, also ring planets textures sorta POP in and out,
      if we can fade those as well it would be nice." Rulings: one front leaves each star
      over `--t-long` and each body's sweep starts as it arrives, running away from the star
      over `--t-slow`; every teal element eases its alpha in and out and the solid band has
      soft edges; the rings' and shaded discs' exchanges cross-fade; a hide is the reverse.
  14d. **Johnny on the third motion pass (2026-10-06; Agent C,
      `prompts/c_toggle_motion_4.md`).** "When I click moons, the moon animate on is
      incredible, but when I click moons off, the texture vanishes immediately and it
      doesn't have the same effect, also the animation is so good, we should use it again
      for the day/night, also the moons is incorrectly removing the shadow / shadow casting
      effects from the planets, we want to keep those." Rulings: a Moons hide keeps the
      moons and their shaded tiles until the wave has run back; Day/night uses the same
      wireframe wave (the solid teal band goes); the Moons switch never changes how a
      planet is lit or shadowed.
  19. **The orbit header and the strip (Johnny, 2026-10-06; Agent D,
      `prompts/d_orbit_small_fixes.md`).** The date readout needs more right padding; "No
      ships here" must not wrap (centred, or its place long enough); the campaign mark
      button beside the readout "does nothing? let's remove": it leaves the header, the
      command and key C stay, the way back sits in the Time drawer when the view is off the
      campaign date. This supersedes choice D2 of the drawers design.
  20. **City lights on the wrong layer (Johnny, 2026-10-06; Agent C, diagnosis first).** "A
      visual texture bug on the planets that the city texture is on the atmosphere layer and
      not the planet layer." C reports what is drawn where and whether the legacy app does
      the same; a port difference is fixed to match the legacy; legacy behaviour goes back
      to Johnny as a choice (vanilla is the legacy look by rule).
  21. **Where the bodies will be (Johnny, 2026-10-06; D designs, then C and D build).** "When
      plotting courses, we're going to want to know where the planets will be at that time,
      so as the time advances, we're going to make like holographic outlines of the
      celestial bodies of where they would be at that time so the user can plot their
      location correctly." Kept easy (a supplement he does not have yet may change the
      rules): ghosts of the bodies at the previewed arrival; the preview's flight line to
      the destination's ghost; the estimate measured to where the destination will be; a
      ship under way drawn on the straight line from where it left to where the destination
      will be at arrival. Design in `findings/plot_ghosts_design.md`.
  22. **The system page and the world page get separate identities (Johnny, 2026-10-06;
      Agent E, `prompts/e_dossier_identities.md`).** An analysis he approved
      (`findings/dossier_identities_analysis.md`): the two sidebars open with the same
      screenful (title, surface map, UWP ribbon, ten decoded rows, jump times) and the pinned
      orbit card repeats the survey. The system page becomes "Regina system": the ribbon as
      a link, a one-line mainworld callout, the chart and polity rows, the socioeconomics
      headline, the stellar lines and the tree. The world page is the only one that decodes
      the UWP and shows the map, and the mainworld's gains the socioeconomics profile.
      The pinned card shows what the picture is doing now and leaves the survey to the
      sidebar when it is open on the same body. **This settles follow-up 15.**
  23. **Places that are not planets (Johnny, 2026-10-06).** "Right now we can only attach a
      ship to a planet, I want to see it on the map and I want to plot points in-system and
      watch it fly around." A system anchor may carry `point: { x, y }` in AU from the
      primary; a ship there is drawn there, a flight to it runs the straight line, a jump
      can leave from it; a docked ship is drawn beside its body, not on its disc. Agent A
      builds the data, geometry and drawing (`prompts/a_points.md`); Agent D the plotting
      click on empty space, the words, the 100D test and Jump from a point. This replaces
      the "cut the flight to jump" interim of part 1.
  24. **Time controls (Johnny, 2026-10-06; Agent D, `prompts/d_part2_go.md`).** The way back
      to the campaign date is a reset button immediately before Play (disabled on the date,
      live off it, holding its place); "Back 1 week" mirrors "1 week" and, on the campaign
      date, rewinds it too (Johnny: yes); the Line up control is hidden for now.
  25. **The orbit view's info card sits under the drawer (Johnny, 2026-10-06; Agent E,
      `prompts/e_card_under_drawer.md`).** "Have the info card in the orbit view stick to
      whatever the shortest values is to the drawer, if there's no drawer it should fill the
      space, and if the drawer is larger, it should push the card down." And, for Agent D
      in `prompts/d_part2_go.md`: a click on the picture must not close the open drawer.
  26. **"Locate" on the system page (Johnny, 2026-10-06).** A button beside Explore orbits
      that flies the map back to the system with the locator's line and ring, for any
      visitor. D: the locator for a system and with no campaign (`prompts/d_part2_go.md`);
      E: the button (`prompts/e_card_under_drawer.md`).
  27. **Every vessel on the sector map (Johnny, 2026-10-06: yes).** Today only the party's
      marker is drawn on the hex map. Each vessel is marked at its hex at the campaign date
      (from its track), the party's distinguished. After the open-space work (23).
  28. **Course plotting like an RTS (Johnny, 2026-10-06).** "We would want to support
      in-system waypoints … Think Homeworld RTS where the user can control units and set
      waypoints, click play, speed up or down time and watch the ship signal fly to the
      location. If a ship is docked on a planet, I want a Sci-fi tag to pop out to indicate
      the ship is on the planet and the user can click on the tag to select the ship."
      Three things: a ship is selected by a press on its mark or its tag; a docked ship has
      a tag that pops out from its body (an HTML control, pressable and reachable); plotting
      builds a **course** of waypoints (bodies or points) written as consecutive legs, each
      flown from rest to rest (the one rule supplied), then Play and the speed steps. Agent
      A draws a course in the picture and gives D the hit test and the docked place
      (`prompts/a_course_preview.md`); Agent D builds the controls
      (`prompts/d_waypoints.md`, after `d_ghost_wiring.md`). **Slingshots round a planet are
      backlog, after the full MVP** (`plan.md`, "After 5", ship navigation backlog).
  15. **The pinned body card beside the open panel (D decides; settled by 22):** when the orbit view's
      docked body card and the dossier panel for the same body are both open, two views of
      one thing show at once. Johnny sees pros and cons. D reviews `manifesto.md` (one
      panel system; connected, the relation shows on both; graceful, nothing pops) and
      makes the design choice (for instance the card collapses to its title while the
      panel shows that body, or the card becomes the panel's handle), records it in the
      orbit design notes, and builds it. Johnny reviews the result.

  16. **The passenger + shifts the layout (D):** in a narrow cell the + wraps under its field
      and its menu opens in the flow, pushing the rows below. The + sits inside the field's
      box at its right edge (never wrapping), and the menu floats over the table (absolute
      or teleported, as the other menus) so nothing moves when it opens. **Same for the
      Crew People row's +:** its menu is clipped by the section's overflow (only a sliver
      shows); the menu must float above the section, never be clipped, and open upward when
      there is no room below.

  17. **Panes swap, views stay (Johnny, 2026-10-05):** in the orbit view, pressing Campaign on
      the Rail routes to the map. It must not: the campaign panel (and any record page)
      opens over whichever view is showing, and the panes swap each other out (dossier ↔
      campaign) in the one panel system. The `/campaign` routes today render `MapView`;
      the panel becomes view-independent (the Panel host lives in the shell, the campaign
      and dossier panes are children of it, and the view under it is the map or the orbit as
      the address says, e.g. `/orbit/<sector>/<hex>?panel=campaign/...` or a nested route).
      D designs the address shape with A (A owns the router and the chunks); the back
      button and cold load of every address keep working (manifesto: connected).

  18. **The locked-world Day and night card (Johnny, 2026-10-05):** for a world that keeps one
      face to its star, the card today reads "No day and night · one face always points at
      the star" over an empty "Day side / Night side" strip. Hide the strip and the marker
      for such a world, and present the fact as a short **sci-fi computer-terminal readout
      "from the Scouts"**: a monospace block in the tokens (the `--signal` on `--bg-2`
      terminal look the design page already has, or one made for it), a few lines such as
      "ROTATION: LOCKED", "DAYSIDE: PERMANENT", "NIGHTSIDE: PERMANENT", with the values
      the dossier already holds (no new facts); the words are a display choice, not a rule.
      Reduced motion: no type-on effect. D designs it; C's `DayNight.vue` carries it.

- **K13 part 4. The character sheet (Johnny, 2026-10-05).** Person records get the same
  treatment from a character sheet PDF, "with all our new design requirements": the field
  inventory (B), the fields into `rules/` (Johnny), the sheet on the person page as a panel
  default with collapsible sections, frozen keys on sideways scroll, pills for linked
  records (D). **Waits on the PDF**, which is not in `assets/` yet.

- **Deck plans on a light background (Johnny, 2026-10-05).** The Geomorph tiles are drawn
  for a light page. The viewer's canvas backdrop becomes a light "paper" token (added to
  `tokens.css`; no hex colour elsewhere), with the box, credit and controls staying in the
  app's dark look. Agent C.

- **K15. The orbit view as a showpiece (Johnny, 2026-10-05; Agent D, design first).** "A
  super clean UI; pare down the tools: the advance 1 h plus and minus is dumb, we'd use the
  scrubbing tools for that anyway; move the toggles from the top to a key at the bottom?;
  put the view choice (Orbits / Row / Column) as a button in the upper left of the orbit map
  like Google Maps, or tuck it into the View button. It's got to sing with the rules of
  `manifesto.md` to really be a showpiece, because we're going to put our other tools for
  the starship plotting on this map later" (K12).
  - **Part 1, the design (to `findings/orbit_showpiece_design.md`, mockups in
    `findings/ui_design_shots/orbit_showpiece_*`):** every control in the view today, listed,
    with keep / move / drop and the reason; the pared time row (no ±1 h; scrubbing, speed,
    play, "1 week", the campaign mark and "Set as campaign date" stay); where the layer
    toggles go (a key at the bottom that is also the toggle, or the View menu) and what the
    key shows; the view choice as a corner control or inside View, with a recommendation;
    **the space reserved for K12** (a destination target, a flight line, a range ring, a
    Jump button, a status strip for "in flight / at the jump point / in jump") so nothing
    moves again when it arrives; column, half and full; 520 px; keyboard reach for every
    control; what the three manifesto checks (one panel system, tokens only, no chrome
    before the command palette has the command) mean for each change. Johnny rules on the
    design before part 2.
  - **Part 2, the build:** to the ruled design; `orbit/` and `views/OrbitView.vue` only; the
    engines and the disc pipeline untouched; the contrast test; screenshots beside the
    current view.

## Verification for K1 to K5

- [ ] `npm test`, `npm run check`, `npm run build` green; the API suite run at least once
      against `wrangler dev` with `RUN_API_TESTS=1`
- [ ] Migration 0008 applied in production before the first sign-in is offered
- [ ] Signed out, the viewer's cold load is no slower than before (measured)
- [ ] A second account cannot read or write the first account's campaign
- [ ] Sign in on one machine, add a record at Regina; sign in on another and find it
- [ ] `data_model.md` and `api.md` match what was built
