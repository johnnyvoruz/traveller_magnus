# X players review — report
Prompt: prompts/x_players_review.md
Status: done (read-only on code; this file and `directives/players_build_plan.md` written)
Written 2026-10-17 by the orchestrator's review session on the strongest model. A lower-effort
session may extend it; the "Answers" section at the end of the prompt says how.

Every fact below names a file and a function or line as the tree stood on 2026-10-17 (after Lane A's
AP1 `players_view.ts` and Lane B's B2 contract proposal; before B2b and before any P2 code). Line
numbers drift; the function names do not. The two probes in §8 reproduce the two findings that were
checked by running the real projection; a lane can re-run them.

**Read this first, in one paragraph.** The projection (`playersView`) is the right design and holds
for text: no referee string survives it. What is not safe yet is everything around it. (1) A row that
was players-visible and is then hidden or deleted never reaches a player's open tab, because the
projection drops tombstones and the poll returns only changed rows, so the tab keeps the referee's
secret until the player reloads. (2) The contract puts the "own note" check in the Worker, which
cannot see `author_id` without a read, and the Durable Object's conflict answer returns the full
stored row, so a member who sends a stale write for an id they once saw gets the hidden entry back.
(3) The projection keeps hidden people's ids in the party and turns a hidden id inside a ship's
track or cargo into the string "a record", which fails the client's schema, so a player's whole
panel fails to load. (4) The Worker copies the client's headers into the Durable Object call, so
any `x-voyage-*` header P2 adds for members would be client-settable. (5) The contract's "project
each page" is wrong when a campaign spans pages: links and anchors whose records are on an earlier
page vanish. Each has an exact fix and a test below. None needs a new decision from Johnny except
the eight questions in §7, each with a recommendation.

---

## 1. Findings, worst first

Severity words: **leak** (referee data reaches a player), **inference** (a player learns that
something hidden exists or changed), **tamper** (a player changes what they may not), **denial**
(a player can stop the referee or the other players), **bug** (wrong but not a leak).

### F1 — leak — a hidden-again row stays in the player's tab
What: decision 3 drops tombstones and hidden rows. The member poll `GET /campaign?after=<seq>`
returns rows with `seq > after` (`universe/campaign.ts`, `readCampaign`, lines 379 to 415) and then
`playersView` of them. A record, link or entry that was `players` and becomes `referee`, or is
deleted, is either not in the page (a link whose end was hidden has no new `seq` at all) or is
filtered out of it. The tab holds the old copy until a reload, and nothing tells it to reload.
Decision 5 covers only a deleted player note, and only because it chose to send `deleted: true`.
Why it matters: "mark for players, notice the mistake, mark referee" is the one thing a referee
will do every session; today's design leaves the mistake on every player's screen.
Fix (contract and B, P2): the member read is **a delta of the projection, not a delta of rows**.
The Durable Object gains `GET /campaign/players?after=&limit=` (same file as `readCampaign`): it
reads every live row, runs `playersView` from `@voyage/shared` over the whole set in that one
synchronous call (a consistent snapshot; see F16 and F17), and answers `{ records, links, journal,
settings, clock, seq, done, visible }` where the rows are the projected ones with `seq > after`, and
`visible` is `{ records: [ids], links: [ids], journal: [ids] }` of everything in the projection
now. `visible` rides on every page whose `seq` moved past `after` (and on `after=0`); a poll with
nothing new answers without it. The client (P3) deletes any held row whose id is not in `visible`.
No `was_players` column, no history table, no per-member state, and nothing in `visible` is an id
a player may not see. Cost: ids only, gzipped by Cloudflare, only when something changed.
The DO stays role-free in the sense that matters: it never reads a user id to decide; the Worker
picks `/campaign` or `/campaign/players` after its D1 check, and builds that URL itself (F5).
Test: `players_leaks.test.js` cases 7, 8, 9 (§5).

### F2 — leak — the conflict answer returns the hidden row
What: `applyCampaignChanges` answers a stale `baseRev` with the stored row in `conflicts[].current`
(`campaign.ts` lines 586, 673, 680, 757). The contract forwards a member's journal change to the
same code and says the Worker checks `author_id` "on update and delete"; the Worker has no copy of
`author_id` without reading the entry first, and a read-then-write is a race. A member who sends
`{ id: <cj_ of an entry they once saw>, baseRev: 0, kind: 'note', ... }` gets `current` = the
entry as it is now, hidden or not. They know such ids from any entry that was once `players`, and
after F1 from `visible`. The same shape returns a record (`records` conflicts) if the Worker ever
lets a record change through by mistake.
Fix (B, P2): the own-note rule lives **in the Durable Object, inside the transaction**, as a
`member` argument the Worker passes and the client cannot set:
`applyCampaignChanges(sql, changes, now, acknowledgePublic, member?: { userId: string })`.
With `member` set: the body may hold only `journal` changes; each full change is `kind === 'note'`,
`author === 'players'`, `visibility === 'players'`; a create (no stored row, `baseRev` 0) stores
`author_id = member.userId`; an update or delete of a stored row whose `author_id !== member.userId`
throws `CampaignRefusal('forbidden', 'You cannot change that.')` **before** the `baseRev`
comparison, so no `current` is ever built for a row that is not theirs; a stored row that is theirs
and stale returns `current` as today (their own note). The Worker's 403 for a wrong body shape
stays as a first gate; the DO is the one that holds. The `member` value travels on a header the
Worker sets after stripping every `x-voyage-*` header from the client (F5).
Test: cases 10, 11, 12.

### F3 — bug (denial) and inference — hidden ids survive in the party and break the client inside `status`
Checked by running `playersView` (§8, probe 1). Two facts:
(a) `projectSettings` (`players_view.ts` line 205) spreads `settings.party`, so `memberIds`,
`vesselIds` and `aboard` keep the ids of hidden people and ships. A player learns how many hidden
party members there are and their `cr_` ids, which are also the probe keys for F2.
(b) `redactValue` (line 102) replaces a hidden id inside any string. A vessel's
`status.track[].to` of `{ kind: 'record', id: <hidden> }` becomes `{ kind: 'record', id: 'a record' }`;
`status.cargo[].itemId` and `status.passengers[].personId` likewise. The client parses the page with
`CampaignPage` (`campaign/store.ts`, `loadPages`), whose `RecordId` regex refuses the string, so the
**whole member read fails** and the player's panel shows an error until the referee changes data
they cannot see the reason for. Probe output: `path: ["records",0,"status","track",0,"to","id"]`.
Fix (A, before P2; `players_view.ts`): a structured projection of `party` and `status`:
- `party.memberIds` and `party.vesselIds` filtered to kept ids; `party.aboard` keeps a pair only
  when both ids are kept.
- `status.track[].from` and `.to`: a record anchor to a hidden record is replaced by the system
  anchor that `locate` (`schemas/campaign.ts`) finds for it, carrying `hexKey` and `bodyKey` only
  (no `locationLabel`, no `point`), or `null` when none is found (`null` is a legal anchor). This
  shows the hex a players ship went to and not the hidden place's name: **question 1 for Johnny**.
- `status.cargo[].itemId` and `status.passengers[].personId`: the key is dropped when hidden.
- Everything else in `status` and all of `sheet` keep the string redaction.
- A new test asserts that `playersView` of every fixture **parses as `CampaignPage`** after adding
  `rev: 0` and `provenance: null` back (the client's own parse), so no future field can break a
  player's read silently.
Test: cases 2, 3, 4; `tests/shared/players_view.test.js` extended.

### F4 — leak and tamper — the Worker cannot enforce "own note"; the body shape alone is not enough
What: the contract's member write check is a body-shape check in the Worker plus an `author_id`
check the Worker cannot make (F2). Also unchecked today: a member's note `anchor` of
`{ kind: 'record', id: <hidden> }` is stored as sent and shows on the referee's record page under
"Your journal here" (harmless on its own, but it is a write that names a hidden id, and the server
should not accept names of things the caller cannot see).
Fix (B, P2): in the DO member path (F2) and in the Worker: a member change's `anchor` must be
`null`, a system anchor, or a record anchor whose id is in the current projection; a record anchor
to a hidden or missing id is `400 validation`, the **same answer for hidden and missing** so the
check is not an oracle. `mentions` stay server-computed from the body (`mentionsOf`); a `[[cr_…]]`
token for a hidden id in a player's body is redacted for every other player and shows the referee a
mention, which is fine.
Test: cases 11, 14.

### F5 — tamper (latent leak) — client headers reach the Durable Object
What: `ownedUniverse` builds the DO request with `new Headers(request.headers)` and then sets
`x-voyage-user-id` and `x-voyage-universe-id` (`universe/forward.ts` lines 37 to 39);
`universesRoute.get('/:id/campaign')` and the changes route pass `c.req.raw` through
(`routes/universes.ts`). The DO reads `x-voyage-worker` (`UniverseDO.ts` line 34, the budget
bypass) and `x-voyage-journal` (line 66, meant to be client-set). Today no client route reaches a
`/jobs/*/batch|fail|settled` path, so the budget bypass is not reachable, and `CharacterRoom`'s
`x-voyage-user-id` is overwritten by `openSocket` (`character/rooms.ts` line 64). But the moment
P2 adds a member header (F2's `member`), a copied header is a forged member id.
Fix (B, P2, one place): `forward` and the new `memberUniverse` delete every header whose name starts
with `x-voyage-` from the client's set before setting their own; `x-voyage-journal` is read in the
Worker from the client request and re-set explicitly. A unit test over the forward function and a
black-box case.
Test: case 26.

### F6 — denial — one player can lock the table
What: `/campaign/changes` spends the universe's 120-a-minute mutation budget (`UniverseDO.ts`,
`allowMutation`; `universe/budget.ts`), shared with the owner's Builder writes. One member script
sending 120 note writes a minute leaves the referee with `429 Too many requests.` on every save.
The journal cap is 20,000 live entries for the universe (`CAMPAIGN_LIMITS.journal`, `requireRoom`);
one member can fill it, after which the referee cannot write a session entry. Member reads are not
limited at all; each one is a full projection.
Fix (B, P2): three guards, all before the DO budget: (a) in the Worker, a member may make **10
journal writes a minute** (per user and universe, the `claimRateLimited` pattern in
`character/rate.ts`), the 11th is `429 rate_limited`; (b) member reads **60 a minute per user**
(reuse `publicLimited` in `routes/public_games.ts`); (c) in the DO member path, a member may hold
**500 live notes** in a campaign, counted by `author_id`, the 501st is `400 too_large` with the
sentence "You have 500 notes in this campaign, the most one player can keep." Numbers are guards
(**question 5**).
Test: cases 25, 28; the 500-note cap as a pure test on `applyCampaignChanges` with the fake `Sql`
(`tests/api/campaign_logic.test.js` pattern).

### F7 — leak (logs, history) — the invite token is in a logged path
What: the join page is `/join/<token>`. The Worker serves `index.html` for it and `requestContext`
logs `route: c.req.path` for every request (`http.ts` line 22), so the raw token lands in the
Cloudflare log of the page load; it also sits in browser history and in `Referer` if the page loads
anything cross-origin. Decision 1 (orchestrator, 2026-10-17 16:55) says the token is "never logged".
The character claim link `/claim/<token>` has the same exposure today (single-use, so less harm).
Fix: (a) B, P2: `requestContext` logs `/join/*` and `/claim/*` as `/join/<token>` and
`/claim/<token>` (the literal word), nothing else changes in the line; (b) E, P4: the join page
reads the token on mount and calls `history.replaceState` to `/join` so the token leaves the bar
and the history entry; (c) C or A, L1: `<meta name="referrer" content="same-origin">` in
`index.html`. The path form stays for copy and paste (**question 8** confirms the masking).
Test: a pure test on the log line (case 27); a `tests/web` route test that the join page's URL is
`/join` after mount.

### F8 — inference — `not_a_member` confirms a universe exists
What: the contract answers `403 not_a_member` to "a member route, the universe exists, and the
caller has no member row". Any signed-in account can then test whether a universe id exists
(ids are ULIDs or the client's own `uni_…` ids). Owner routes already answer `404 No such
universe.` to everyone else, which is the right shape.
Fix (contract): a signed-in non-member on a member route gets `404 not_found` "No such universe.",
exactly as a stranger and as the owner routes. `403 not_a_member` "You are not in this campaign."
is kept for one caller only: an **archived** member, who already knows the campaign and needs the
sentence (**question 3**).
Test: cases 18, 19.

### F9 — leak (cache) — campaign reads carry no `Cache-Control`
What: the DO answers `/campaign` with `Response.json` and no cache header; the Worker passes it
through (`maskOwnerJournal` keeps the headers). Browsers do not heuristically cache a response with
no validator, but nothing says so to a proxy or a future shared cache, and the players routes are new.
Images are `private, immutable` (`routes/objects.ts`), which is right for content-addressed bytes;
after an archive the browser keeps what it already showed, and that is accepted (they saw it).
Fix (B, P2): `cache-control: private, no-store` on `GET /campaign` for both roles and on every
`/players`, `/join`, `/me/playing` answer.
Test: case 30.

### F10 — tamper — an archived player can walk back in through the live link
What: B2b (queued, held) says "joining again with a live link also reactivates the same row". A
referee who archives someone to keep them out must also revoke the link and tell the other players
the new one, or the archive means nothing.
Fix (contract, B2b): `universe_members.archived_by` (`'owner'` or `'self'`, NULL while active). A
row archived by the owner is reactivated only by the owner's `PATCH …/players/:userId
{ status: 'active' }`; `POST /api/join` by that account answers `403 not_a_member` with
`details.reason: 'archived'` and the sentence "The referee archived you from this campaign." A row
archived by the member themself (they left) is reactivated by a live link. (**question 2**)
Test: case 24.

### F11 — inference — a hidden id in a member's own write is accepted
Covered by F4: anchors are validated against the projection with the same answer for hidden and
missing. Nothing else in a member body can name an id: `mentions` are server-computed, `images` are
not accepted from a member (P7: images off), `author_id` is not in the schema.

### F12 — inference — `seq` moves when the referee writes hidden things
What: the page's `seq` is the universe counter (`meta.campaignSeq`), stamped on every write. A
member's poll sees it climb while nothing visible changes. The member cannot page without it.
Fix: none; **accepted** and recorded (**question 7**). A per-role counter would need a second
column on every row and buys little.

### F13 — leak by design, to be seen — the projection carries text the pack does not print
What: the read includes a players record's `details`, a link's `role` and `notes`, `settings.kinds`
and the party anchor's `locationLabel` (AP1's two questions, decided "keep"). The Player Pack prints
none of the link text. From P6 on, every one of those strings is on a player's screen.
Fix: no code; P5's "View as players" must render exactly the projection (it does, by using
`playersView` on the full store), and the P10 help sentence "What players see" lists these fields
by name so the referee is not surprised. The leak suite's marker test (case 1) already covers them.

### F14 — latent leak — a link's own `visibility` is ignored
What: `playersView` keeps a link when both ends are kept; `link.visibility` is not read (line 227
onward). Today every link is written `visibility: 'referee'` with no switch (`workspace/links.ts`
line 120), so the rule is the only workable one. The day a lane adds a link visibility switch, a
link marked referee between two players records will show.
Fix (A, P1b): a test that pins the behaviour by name ("a link's own visibility is not read; the
rule is both ends"), and one sentence in the contract. When a switch is wanted, the rule changes to
"both ends in and `visibility === 'players'`" with a migration that flips existing links, and not
before.
Test: in `players_view.test.js`.

### F15 — leak (minor) — any 64-hex string opens an object
What: `playersObjectHashes` (`players_view.ts` line 251, `collectHashes`) collects every
64-character hex string anywhere in the projection, including note bodies. A hash is never shown
to a player, so they cannot learn one; but a referee who pastes an image hash into a players note
opens that image to members. Cheap to close.
Fix (A, P1b): collect from `images[].hash` and `images[].thumbHash` of records and entries only.
Test: in `players_view.test.js` ("a hash written in a body does not open an object").

### F16 — bug — projecting one page loses links and anchors
What: the contract says "the Worker calls the DO as it does today, then returns `playersView` of
that page". `playersView` needs the full record set: a link whose records are on an earlier page is
dropped (`kept` does not hold them), a mention of a visible record on an earlier page reads "a
record" (`playersName` finds nothing), a record anchor to a visible earlier record is nulled.
Fix: F1's design (the DO computes over the whole set in one call). Test: case 34.

### F17 — leak (race) — a visibility change between two page reads
What: with paging, page 1 can be read before a record goes hidden and page 2 after; the link
filter and the redaction are then inconsistent. Fix: F1's single synchronous DO call per member
read. The Worker caches the projection per isolate keyed by `(universeId, seq)` for a minute and
asks the DO for the current `seq` first on every poll (a `GET /campaign/seq` that answers
`{ seq }`), so a cache entry is never served past a change. Test: case 16.

### F18 — product, outside Epic P — publishing sends referee-only records to the public bucket
What: `campaign_copy.ts` lines 177 and 178 copy `visibility` and `playerNotes` into the package
content; a referee who picks a referee-only record for a package publishes it with its "For
players" text to the marketplace. The referee chose the record, so it is not a players leak, but
the publish form says nothing. **Question 6** (recommended: a warning line, no data change).

### F19 — leak — the member has no way to read the universe row they need
What: `GET /api/universes/:id` is owner-only (right). P3 needs the campaign's `name` and
`truthVersion` to open the map on the right chart. The contract's `GET /api/me/playing` returns
`{ id, name, ownerHandle }` only.
Fix (contract): add `truthVersion` to the playing item. Nothing else of the row (no `objectBytes`,
no counts, no flags). Test: case 32.

### F20 — contract gap — own notes need `rev`
What: decision 5 drops every `rev`. A member's update or delete of their own note sends `baseRev`
(`EntryChange` requires it); without `rev` they cannot. Fix (contract, A P1b): the projection keeps
`rev` on a journal entry whose `author_id` equals the caller, and only there; everything else stays
`rev`-free. `playersView` gains an optional `{ userId }` option for this and for `author_name`.
(**question 4**). Test: case 31.

### F21 — tamper — origin check on member mutations
What: `ownedUniverse` refuses a cross-origin non-GET (`forward.ts`, `originAllowed`). The new
`memberUniverse` must do the same for every member mutation, and `POST /api/join` must too (the
character claim does: `routes/characters.ts`, `actor(c, true)`). Test: one case per mutation
route with a foreign `Origin` → 403.

### F22 — leak (window) — the object-hash cache must follow `seq`
What: decision 6 caches the allowed hash set "per isolate for a minute by universe seq". If the
Worker keys by a `seq` it read a minute ago, an image hidden ten seconds ago answers for fifty more.
Fix (contract): the cache key is `(universeId, seq)` **and the current seq is read on every
request** (F17's `GET /campaign/seq`), so the window is one DO call, not a minute. A hash not in the
set is `404 not_found` "No such object.", byte-identical to a missing hash. Test: cases 15, 16.

### F23 — leak (window) — the archived member's open tab
What: an archived member's tab keeps polling. `memberUniverse` reads D1 on every call, so the next
poll is refused at once (good). The client must then clear its rows and stop; nothing today does
that for a non-owner. Fix (A, P3 and P9): on `403 not_a_member` or `404` the store clears rows,
sets `status: 'signed-out'`-like `'gone'`, stops the timer, and the panel says "You are not in this
campaign." Test: a store test with the fake transport; black-box case 19.

### F24 — leak (screen) — the "left out" count
What: `planPack` returns `leftOut` and `packConfirm` says "N items are left out because they are
not marked for players." That sentence is for the referee. P6 must never render a count of hidden
things in a player's panel; the member read carries no such count (F1's `visible` lists ids of
visible rows only). Fix: a sentence in the P6 prompt and an SSR test that the player's panel holds
no "left out".

### F25 — denial (migration) — before 0021 and the `author_id` column
The contract's "either order" table is right. One addition: the DO member read (F1) needs
`author_id` to decide `rev` on own notes (F20); before the column exists the DO reads it as NULL and
no note carries `rev`, which is the same as the contract's 503 on member writes. No change.

### F26 — no finding — the public card and the feed
`public_ships.aboard_names` are players-visible members only (`public_hex.ts`, `publicShips`); the
card's journal is `public` entries only (`publicCardJournal`); a member cannot write `public`
(F2). The referee can make a player's note public; that is the referee's act. The pre-0017
`public_marks` row ignores visibility (`publicFirstHex`, by its own comment) and carries no name.

### F27 — no finding — character sheets
A sheet is reached only through `character_access` (`character/service.ts`, `accessFor`);
membership grants nothing. A players person record carries `sheet: { schema, characterId }`, so a
member learns a `ch_` id; `GET /api/characters/:id` without a grant is 404 (`open`). A hidden
person's sheet reference is out with the record.

### F28 — no finding — the Player Pack and the export
Both are the referee's downloads (`pack/build.ts`; `routes/campaign_export.ts`, owner-only). The
pack calls `playersView`, so file and live view agree; case 33 pins it.

---

## 2. Every path data takes to a browser (the map)

### 2.1 Worker routes that read a universe, a campaign, objects, characters, cards, packages, the overview
| Route | Guard today | File |
|---|---|---|
| `GET /api/universes` | own rows only (`owner_id = actor.id`) | `routes/universes.ts` |
| `GET, PATCH, DELETE /api/universes/:id` | `ownedUniverse`: not owner → 404 | `universe/forward.ts` |
| `GET /api/universes/:id/campaign?after=&limit=` | owner; then `maskOwnerJournal` | `routes/universes.ts` |
| `PATCH /api/universes/:id/campaign/changes` | owner; `refreshAfterCampaign` rewrites public rows | same |
| `GET /api/universes/:id/campaign/export` | owner | `routes/campaign_export.ts` |
| `GET, PUT /api/universes/:id/objects/:hash` | owner; GET streams the private object, `private, immutable` | `routes/objects.ts` |
| `/api/universes/:id/hexes*`, `/sectors*`, `/jobs*`, `/generate`, `/pin` | owner, each handler calls `ownedUniverse` | `routes/builder.ts` |
| `/api/universes/:id/install/preview`, `/install`, `/install/remove`, installs list | owner | `routes/installs.ts` |
| `PATCH /api/universes/:id/public-games` | owner | `routes/universes.ts`, `public_games.ts` |
| `GET /api/public-games?truthVersion=&sector=` | signed out allowed once 0018; 60/min per user or IP | `routes/public_games.ts` |
| `GET /api/public-games/overview` | same; `public, max-age=60` | same |
| `GET /api/public-ships/:mark` | same; the card: players-visible ship name and names aboard, finished legs, course, `public` entries | `routes/public_ships.ts` |
| `GET /api/packages*`, `GET /api/packages/:id` | public catalogue; content is in the public bucket | `routes/packages.ts` |
| `POST /api/packages/:id/versions` | the author; reads the owner's universe through `publish-read` | `jobs/publish_queue.ts` |
| `/api/characters/*` | `character_access` row; a non-holder is 404 | `routes/characters.ts`, `character/service.ts` |
| `/api/admin/*` | role `admin` | `routes/admin.ts` |
| `/api/truth/*`, `/api/generate/preview` | public; user, stateless | `routes/truth.ts`, `routes/generate.ts` |

### 2.2 Durable Object endpoints and who reaches them
`UniverseDO.fetch` (`universe/UniverseDO.ts`): `GET /campaign`, `PATCH /campaign/changes`,
`POST /publish-read`, `POST /install/preview | /install | /install/remove`, `POST /quota/reserve |
/release`, and the builder paths `/pin`, `/hexes*`, `/jobs*`, `/sectors*` (`respondBuilder`). A
Durable Object is reachable only through the Worker's binding; no public URL. Callers: the owner
routes through `forward`, the publish and generate queue consumers, `installs.ts`, `public_mark.ts`
(`readDocument`, reads every page, no user id). The DO reads two client-reachable headers (F5).
`CharacterRoom` (`character/CharacterRoom.ts`): `/doc`, `/apply`, `/replace`, `/meta`,
`/close-user`, `/close-all`, `/retell`, the WebSocket; the Worker checks the grant in D1 first.

### 2.3 R2
Public bucket: truth files, package manifests and contents, covers; served by the CDN; public by
design. Private bucket: `u/<universeId>/objects/<hash>`, only through `GET /objects/:hash`.

### 2.4 The browser
- In memory: `campaign` reactive store (`campaign/store.ts`); cleared by `clearRows` on open and
  sign-out; rows with `deleted: true` are kept as tombstones for the owner (`commit.ts`).
- `localStorage` keys (grep over `storageSet`): the last universe id (`voyage.campaign.universeId`),
  the panel span, surface preferences (mode, flags, style, icon set, day-night), the first-visit
  hint, the greeted flag, the last map view, two Build strip flags and the Build choice. **No
  campaign row is ever stored on the device.** No IndexedDB, no `caches.`, no service worker (grep).
- HTTP cache: truth files immutable (`map/truth_client.ts`, in-memory jar per session); objects
  `private, immutable`; campaign reads **no header** (F9); the public overview `public, max-age=60`.
- Export file and Player Pack: the referee's downloads only.

### 2.5 Things that could reveal hidden rows by their shape
| Signal | Today | After the fixes |
|---|---|---|
| 404 vs 403 | owner routes: 404 for everyone else | member routes: 404 for non-members, 403 only for archived (F8) |
| "N hidden records" | the pack's sentence, referee-only | never in a player's panel (F24) |
| ids in URLs | `/join/<token>`, `/claim/<token>` logged (F7) | masked in the log, replaced in the bar |
| `rev` gaps | dropped by the projection | kept on own notes only (F20) |
| `seq` gaps | visible | accepted (F12) |
| mention text | hidden → "a record", the referee's label dropped; hex labels kept | unchanged |
| link ends | both in, else out | unchanged; link `visibility` pinned (F14) |
| image hashes | hashes of players rows only, computed from the projection | from `images[]` only (F15) |
| timeline dates | `when` on players rows | unchanged |
| the party's position | `party.anchor` to a hidden record → null; hidden member ids leak (F3) | filtered |
| the public card's journal | `public` entries only | unchanged |
| conflict answers | return the stored row (F2) | never for a row that is not the caller's |
| status ids | "a record" strings break the parse (F3) | structured |

---

## 3. Authorization matrix (after P2)

Columns: **O** owner · **M** active member · **X** archived member · **U** other signed-in · **S**
signed out · **P** public card reader (signed out, has a `pm_` mark). Each cell says the answer and
where it is enforced: *today* (file, function) or *P2* (contract section, after the changes in §6).

| Route | O | M | X | U | S | P |
|---|---|---|---|---|---|---|
| `GET /api/universes` | own list (today, `universes.ts`) | own list; members' campaigns absent (today) | same | same | 401 | 401 |
| `GET/PATCH/DELETE /api/universes/:id` | row (today, `ownedUniverse`) | 404 (today) | 404 | 404 | 401 | 401 |
| `GET …/campaign` | full page with tombstones (today) | projection delta + `visible` (P2, F1) | 403 `not_a_member` (P2, F8) | 404 (P2, F8) | 401 | 401 |
| `PATCH …/campaign/changes` | full (today) | own `note` only, DO-enforced (P2, F2/F4); 10/min (F6) | 403 | 404 | 401 | 401 |
| `GET …/campaign/export` | file (today) | 404 (today) | 404 | 404 | 401 | 401 |
| `GET …/objects/:hash` | any stored (today) | hash in projection set, else 404 (P2, F22) | 404 | 404 | 401 | 401 |
| `PUT …/objects/:hash` | write (today) | 404 (today) | 404 | 404 | 401 | 401 |
| Builder: `/hexes*`, `/sectors*`, `/jobs*`, `/generate`, `/pin` | (today) | 404 (today, `ownedUniverse`) | 404 | 404 | 401 | 401 |
| Installs, `/install*` | (today) | 404 (today) | 404 | 404 | 401 | 401 |
| `PATCH …/public-games` | (today) | 404 | 404 | 404 | 401 | 401 |
| `POST …/players/invite`, `DELETE …/players/invite` | link / revoked (P2) | 404 | 404 | 404 | 401 | 401 |
| `GET …/players` | both groups (P2, B2b) | 404 | 404 | 404 | 401 | 401 |
| `DELETE …/players/:userId` | archive that member (P2, B2b) | own id only → self-archive; another id → 404 | 404 | 404 | 401 | 401 |
| `PATCH …/players/:userId` `{ personId \| status }` | (P2) | 404 | 404 | 404 | 401 | 401 |
| `PATCH …/players/me` `{ personId }` | 404 (owner is not a member) | sets own; id must be in projected party, else 400 same as missing (P2) | 403 | 404 | 401 | 401 |
| `POST /api/join` | 403 `forbidden` on own link (P2) | 200 same data, no new row | self-archived: reactivated; owner-archived: 403 reason `archived` (P2, F10) | joins; 255 guard; 3/10 s | 401 | 401 |
| `GET /api/join/:token` (new, P4) | `{ name, ownerHandle, expiresAt }` for a live token | same | same | same | same, 60/min by IP | same |
| `GET /api/me/playing` | own memberships (none if only owner) | items with `truthVersion` (P2, F19) | the archived one absent | own | 401 | 401 |
| `GET /api/public-games*`, `GET /api/public-ships/:mark` | (today) | same as anyone | same | same | allowed | allowed |
| `GET /api/packages*` | public | public | public | public | public | public |
| `/api/characters/*` | by grant (today) | by grant; membership adds nothing | by grant | by grant | 401 | 401 |
| `/api/admin/*` | 403 unless admin | 403 | 403 | 403 | 401 | 401 |
| DO `GET /campaign` (full) | via owner routes only | never | never | never | never | never |
| DO `GET /campaign/players`, `GET /campaign/seq` | via member routes; the Worker builds the URL | never directly | — | — | — | — |
| DO `PATCH /campaign/changes` with `member` | never for the owner | via the member route only; the header set by the Worker (F5) | — | — | — | — |
| Private bucket | via objects route | via objects route, set-checked | — | — | — | — |

---

## 4. Attack walk, role by role

**Active member.** Read everything the projection hands out (fine). Probe hidden ids: from the party
lists (F3, closed), from once-visible rows (F1 gives `visible` ids only). Use a known id in a stale
write to read the row back (F2, closed in the DO). Name a hidden id in an anchor (F4, closed, no
oracle). Send `x-voyage-member: <ownerId>` or `x-voyage-worker: generate` (F5, stripped). Flood
writes to spend the referee's budget, fill the journal, hammer reads (F6, three guards). Ask for an
image hash hidden a moment ago (F22, seq read per request). Keep a tab open after being archived
(F23, refused at once; the client clears). Call any owner route (404, same as a stranger). Read the
universe row (404; `playing` gives name and truth). Edit another player's note (DO refuses,
no row). Set `visibility: public` on their note to reach the public card (403). Send 13 images
(images refused for members at all). Set `person_id` to a hidden person (400, same as missing).
Replay a stale page with `?after=0` (gets the projection; fine). Race a visibility flip (F17,
one DO call). Cross a hidden place with the ship (F3, hex only; question 1).

**Archived member.** Every member route is 403 `not_a_member` (they know the campaign, F8); every
owner route 404; `playing` omits it; the live link does not readmit them unless they left
themselves (F10, question 2); their notes keep their handle for the others (B2b); the images their
browser cached stay in that browser (accepted, F9).

**Other signed-in user.** Owner and member routes are 404 alike (F8); a guessed universe id learns
nothing; `POST /api/join` with a guessed token is 404 after 3 tries per 10 s; a revoked or expired
token says so (that is the link holder's own link, by design); `GET /api/join/:token` leaks the
campaign name to whoever holds the link (the link's purpose).

**Signed out.** 401 everywhere but the public feed, the card, the catalogue, truth and the join
preview; the join page sends them to sign-in and returns to `/join` with the token kept in the
client (F7).

**Public card reader.** The card is players-visible names and `public` entries, unchanged by Epic P;
a member cannot write `public`; the referee can promote a player's note to `public`, and that is the
referee's act.

**The referee against themself.** "View as players" shows the projection; the help sentence names
what the projection carries (F13). Publishing a referee-only record to the marketplace is their act
and gets a warning line (F18, question 6).

---

## 5. Leak test suite spec — `tests/api/players_leaks.test.js`

Built by Lane B **before any P2 route**, in the `tests/api/campaign.test.js` shape: `RUN_API_TESTS=1`
skip guard, its own ports (`VOYAGE_API_PORT`, `VOYAGE_INSPECTOR_PORT`, `VOYAGE_PERSIST_TO`),
`withDevServer`, `userCookie` from the characters test, `jsonFetch`. Every case is written first
as a failing or skipped test with the expectation below; P2 is done when all pass. Marker rule as in
`tests/web/player_pack.test.js`: every referee-only string starts with `ZREF_`, every players string
with `ZPLAY_`; "holds no referee marker" means the response **text** does not contain `ZREF_`.

**Fixture (one universe, owner O; set up once through the owner routes):**
- hidden place `H` (`referee`, anchored at `Spinward_Marches/1910`, name `ZREF_place`, image hash B);
- players place `P` (name `ZPLAY_place`, image hash A, caption mentions `[[H|ZREF_label]]`);
- players vessel `V` with `status.track` one leg `P → H` and `cargo: [{ itemId: H }]`;
- players person `PP`, hidden person `RP` with `sheet: { schema, characterId: 'ch_ZREF' }`;
- links `PP crew V` (both players) and `PP ally RP` (one hidden), a `member` link `V → hidden org`;
- journal: referee session `S` (`ZREF_`), referee-authored players note `N0`, public entry `PUB`;
- settings: party `memberIds [PP, RP]`, `vesselIds [V]`, `aboard { PP: V, RP: V }`, `anchor { record H }`,
  `kinds { person: ['ZREF_kind'] }`; clock `{ days: 10 }`.
- Accounts: members `M1`, `M2` (joined by the link), `M3` (joined then archived by O), other user `U`,
  and no cookie for signed out.

**Cases (name → expectation):**
1. `member read holds no referee marker` → `GET …/campaign` as M1: 200; body text has no `ZREF_`;
   has `ZPLAY_`; `PUB` present; `S` absent; `RP` absent; `H` absent; `ch_ZREF` absent.
2. `member read parses as the client page` → `CampaignPage.safeParse` of `data` (after adding
   `rev: 0`, `provenance: null` to rows and `rev: 0` to settings and clock) succeeds. Guards F3(b).
3. `party lists hold no hidden id` → `settings.party.memberIds` is `[PP]`, `vesselIds` `[V]`,
   `aboard` `{ PP: V }`, `anchor` null.
4. `a ship leg to a hidden place shows the hex and not the name` → `V.status.track[0].to` equals
   `{ kind: 'system', hexKey: 'Spinward_Marches/1910' }` (question 1); `cargo[0]` has no `itemId`.
5. `a link with one hidden end is absent` → links contain `PP crew V` and not `PP ally RP` nor the
   member link.
6. `a mention of a hidden record reads "a record"` → P's caption text contains `a record` and not
   `ZREF_label`; `mentions` of any entry hold no hidden id.
7. `a record made players then referee leaves the open tab` → as O, patch `P` to `referee`; as M1,
   poll `?after=<seq before>`: `visible.records` lacks `P`; no row of `P` is in `records`.
8. `a deleted players record leaves the poll` → as O, delete `PP`; M1's poll: `visible.records`
   lacks `PP`, `visible.links` lacks `PP crew V`, and no tombstone body is sent.
9. `a hidden record created after the member's seq sends nothing` → as O, create a `referee`
   record; M1's poll: `records` empty, `visible` unchanged except that it is present (seq moved),
   `seq` moved (accepted, F12).
10. `a stale write against an entry the member cannot see returns no row` → as M1, PATCH changes
    `journal: [{ id: S, baseRev: 0, kind: 'note', author: 'players', visibility: 'players', … }]`:
    403 `forbidden`; body has no `current`, no `ZREF_`; the same with `baseRev: 1`, and with
    `{ id: S, baseRev: 1, deleted: true }`.
11. `a member can write only their own players note` (table-driven) → each of: a record create, a
    link create, `settings`, `clock`, a `session`, a `handout`, a `rumor`, a note with
    `author: 'referee'`, a note with `visibility: 'referee'`, a note with `visibility: 'public'`, a
    note with `images: [...]`, a note whose `anchor` is `{ record: H }`, a body with two kinds of
    change → 403 `forbidden` or 400 `validation` as the contract says; O's read afterwards is
    unchanged (same `seq`).
12. `a member cannot edit or delete another member's note` → M1 creates `N1`; M2's update and delete
    of `N1` → 403, no `current`; O's delete of `N1` → 200.
13. `a member's note round-trips with their name` → M1 creates `N1`: 200 `applied` with `rev` 1;
    M1's read has `N1` with `rev` (own note) and `authorName` = M1's handle; M2's read has `N1`
    without `rev` and with `authorName`; O's read has `author: 'players'` and `author_id` absent
    from the body (it is not a schema field) but `authorName` present.
14. `a note anchored to a hidden record is refused like a missing one` → anchors `{ record: H }`
    and `{ record: cr_<random> }` both → 400 `validation` with byte-identical bodies.
15. `a member reads a players image and not a referee one` → `GET …/objects/A` as M1: 200,
    `cache-control: private, immutable`; `GET …/objects/B`: 404 with the same body as a random
    hash; `PUT` as M1: 404.
16. `an image hidden with its record stops at once` → O hides `P`; M1's next `GET …/objects/A`
    (within a second) is 404.
17. `owner routes answer a member as a stranger` → for each of export, `GET /hexes`, `POST
    /generate`, `GET /install/preview`, `PATCH /public-games`, `PUT /objects/:hash`, `GET /sectors`,
    `GET /jobs/x`: M1 and U get byte-identical `404 { not_found, "No such universe." }`.
18. `a non-member on a member route gets 404` → U on `GET …/campaign`, `PATCH …/players/me`:
    404 identical to a random universe id.
19. `an archived member is refused at once` → M3 on `GET …/campaign`: 403 `not_a_member`; on
    `PATCH …/campaign/changes`: 403; `GET /api/me/playing` as M3 lacks the universe; O's
    `GET …/players` lists M3 under archived with their handle.
20. `a revoked link cannot be claimed and a new one can` → O revokes; `POST /api/join` old token →
    400 `invite_revoked`; O makes a new link; new token claims; old token still 400.
21. `an expired link cannot be claimed` → set `expires_at` in the past by `d1 execute`; claim →
    400 `invite_expired`.
22. `the owner cannot claim their own link` → 403 `forbidden`.
23. `the 256th active member is refused` → insert 254 member rows by `d1 execute`, claim as U →
    200 (255th); claim as a 256th account → 400 `campaign_full`; O archives one; the 256th → 200.
24. `a member the referee archived cannot rejoin by the live link` → M3 claims → 403
    `not_a_member` reason `archived`; a member who left themself (`DELETE …/players/<own id>`)
    claims → 200 and the same row is active again (question 2).
25. `join is rate limited` → four claims in a second as U: the fourth is 429 with `retry-after: 10`.
26. `client x-voyage headers are ignored` → M1's read with `x-voyage-member: <O's id>`,
    `x-voyage-user-id: <O's id>`, `x-voyage-worker: generate` is byte-identical to the read
    without them; M1's write with them is still 403 for a record change.
27. (pure, `tests/api/players_logic.test.js`) `the request log masks join and claim tokens` →
    `requestContext`'s line for `/join/abc` and `/claim/abc` carries `/join/<token>` and
    `/claim/<token>`.
28. `a member cannot spend the referee's budget` → M1 sends 11 note writes in a minute: the 11th is
    429; O's write right after is 200.
29. (pure, `tests/api/campaign_logic.test.js` pattern) `a member's 501st live note is refused` →
    with `member` set, the 501st create throws `too_large` with the sentence; a delete frees one.
30. `campaign reads are not cacheable` → `cache-control: private, no-store` on O's and M1's
    `GET …/campaign`, on `GET …/players`, `GET /api/me/playing`.
31. `only own notes carry rev` → in M1's read, `N1` has `rev`; `N0`, `PUB`, every record, link,
    settings and clock have no `rev`; no row has `provenance`.
32. `playing carries what the map needs and nothing else` → `GET /api/me/playing` as M1:
    `{ id, name, ownerHandle, truthVersion }` exactly; after O deletes the universe, the list is
    empty and `GET …/campaign` is 404.
33. (pure, `tests/web/player_pack.test.js` extension) `the pack and the member read agree` →
    `planPack(fixture)` record, entry and link ids equal `playersView(fixture)`'s.
34. `a member read across pages keeps links whose ends came earlier` → fixture with 1,001 records
    (`d1`/DO seeded through the owner's changes route in batches of 200): `PP crew V` is present
    in M1's read and P's caption mention reads P's name, not "a record".
35. `member mutations check Origin` → M1's write with `Origin: https://evil.example` → 403
    `forbidden` "Origin check failed."; the same for `POST /api/join`, `PATCH …/players/me`,
    `DELETE …/players/<own id>`.

---

## 6. Changes to `contracts/b_players.md` (for Lane B; B2b folds these in)

1. **No 12 cap; playing and archived** (decisions 2026-10-17 17:00; B2b as queued): `status`
   (`active` | `archived`), `archived_at`, and **`archived_by`** (`'owner'` | `'self'`, NULL while
   active; F10). The 255 guard counts active rows. `max_uses` goes.
2. **The member read is `GET /campaign/players?after=&limit=` on the DO** (F1, F16, F17): the DO
   runs `playersView` over the whole live set in one call and answers the projected rows with
   `seq > after` plus `visible: { records, links, journal }` (ids) on every page whose `seq` moved
   past `after`. The Worker builds the DO URL from its own validated `after` and `limit`; nothing
   from the client's query string is forwarded. The owner keeps `GET /campaign`.
3. **`GET /campaign/seq` on the DO** answers `{ seq }`; the Worker reads it on every member poll and
   every member object read to key its one-minute isolate caches (F17, F22).
4. **The own-note rule is in the DO**: `applyCampaignChanges(sql, changes, now, acknowledgePublic,
   member?)` (F2, F4); a wrong author is `forbidden` before any `conflicts` row is built; member
   anchors validated against the projection, hidden and missing answer alike.
5. **Member limits** (F6): 10 journal writes a minute per member and universe (Worker); 60 reads a
   minute per member (Worker, `publicLimited`); 500 live notes per member (DO, by `author_id`).
   Sentences: "Too many requests." and "You have 500 notes in this campaign, the most one player
   can keep."
6. **Header hygiene** (F5): the Worker drops every `x-voyage-*` header from the client before it
   sets its own; the member id travels on `x-voyage-member`; `x-voyage-journal` is re-set from the
   client's value explicitly.
7. **Errors** (F8): a signed-in non-member on a member route is `404 not_found` "No such universe.";
   `403 not_a_member` is for an archived member only; `POST /api/join` by an owner-archived account
   is `403 not_a_member` with `details.reason: 'archived'`, "The referee archived you from this
   campaign."
8. **`rev` on own notes** (F20): the projection keeps `rev` on a journal entry whose `author_id` is
   the caller; `authorName` (the profile handle) is added to every journal entry with an
   `author_id`; `playersView(full, { userId, handles })` takes the caller and a handle map.
9. **`cache-control: private, no-store`** on every campaign, players, join and playing answer (F9).
10. **`GET /api/join/:token`** (new; P4 needs it): `{ name, ownerHandle, expiresAt }` for a live
    token; 404 unknown; 400 with `details.reason` for expired and revoked; 60 a minute by IP;
    signed out allowed. The token is in the path here only because the page already holds it;
    the log masks it (F7).
11. **`GET /api/me/playing`** items gain `truthVersion` (F19).
12. **The log line** masks `/join/*` and `/claim/*` paths (F7).
13. **Link visibility sentence** (F14): "A link's own `visibility` is not read by the projection;
    the rule is both ends. Changing that needs a migration of existing links."
14. **Object hashes** come from `images[].hash` and `images[].thumbHash` only (F15).
15. **Member mutations check `Origin`** as owner mutations do; `POST /api/join` too (F21).
16. **Before 0021 and before `author_id`**: unchanged, plus one line: without `author_id` no note
    carries `rev` and `authorName` is absent (F25).
17. The member read's response shape is a new schema in the players schema file:
    `PlayersPage` = `PlayersView` rows + `seq`, `done`, `visible?`.

---

## 7. Questions for Johnny (recommended answer first)

1. **A players ship's track or anchor that points at a hidden place: show the hex, not the name?**
   Recommended: **yes.** The ship is players-visible, so where it went is players' knowledge; the
   place's name and label stay hidden. The alternative (drop the leg end to null) loses the ship's
   position for players and breaks "Where are we" at that leg. (F3)
2. **A player the referee archived: may they rejoin through the still-live link?** Recommended:
   **no.** Only the referee's "Bring back" readmits them; a player who left by themself may rejoin
   with a live link. Otherwise "Archive" means nothing until the link is also revoked. (F10)
3. **A signed-in account that is not a member calls a member route: 404 like a stranger, with 403
   "You are not in this campaign." kept for an archived member?** Recommended: **yes.** (F8)
4. **May a member's own notes keep `rev` (an exception to decision 5), so they can edit and delete
   them?** Recommended: **yes**; nothing else carries `rev`. (F20)
5. **Member guards: 10 note writes a minute, 60 reads a minute, 500 live notes per member?**
   Recommended: **yes**; they are guards against a script, not a design limit, like the 255. (F6)
6. **Outside Epic P:** publishing a referee-only record to the marketplace ships it with its "For
   players" text as it stands. Recommended: a one-line warning in the publish form when a chosen
   record is referee-only, no change to the data. Or leave it: the referee picked the record. (F18)
7. **Accept that a member's page `seq` climbs when the referee writes hidden things?** Recommended:
   **yes**; a per-role counter is a column on every row for a count nobody can read much from. (F12)
8. **Mask `/join/<token>` and `/claim/<token>` in the request log (the claim link today is logged
   too)?** Recommended: **yes**, both. (F7)

---

## 8. Probes (re-runnable; run from a folder inside the repo so `@voyage/shared` resolves; Node 24 strips types)

Probe 1 (F3; output quoted in §1):
```js
import { playersView, CampaignPage } from '@voyage/shared';
const S = '2026-10-17T00:00:00.000Z';
const hid = 'cr_11111111-1111-4111-8111-000000000001';
const ship = 'cr_11111111-1111-4111-8111-000000000002';
const pc = 'cr_11111111-1111-4111-8111-000000000003';
const refpc = 'cr_11111111-1111-4111-8111-000000000004';
const rec = (id, type, visibility, over = {}) => ({ id, type, kind: '', name: 'N', summary: '', details: '', tags: [],
  anchor: null, when: null, visibility, playerNotes: null, sheet: null, status: null, images: null, provenance: null,
  rev: 1, createdAt: S, updatedAt: S, deleted: false, ...over });
const full = {
  records: [
    rec(hid, 'place', 'referee', { anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910' } }),
    rec(ship, 'vessel', 'players', { status: { track: [{ from: { kind: 'system', hexKey: 'Spinward_Marches/1912' },
      to: { kind: 'record', id: hid }, departs: 1, arrives: 2, mode: 'jump' }], cargo: [{ itemId: hid, label: 'crate', tons: 1 }] } }),
    rec(pc, 'person', 'players'),
    rec(refpc, 'person', 'referee'),
  ],
  links: [], journal: [],
  settings: { party: { vesselIds: [ship], aboard: { [pc]: ship, [refpc]: ship }, memberIds: [pc, refpc],
    anchor: { kind: 'record', id: hid } }, kinds: {}, calendar: { dateFormat: 'imperial' }, rev: 3 },
  clock: { days: 10, rev: 2 },
};
const view = playersView(full);
console.log(JSON.stringify(view.settings.party));           // memberIds and aboard still hold refpc
console.log(JSON.stringify(view.records[0].status));        // to: { kind: 'record', id: 'a record' }; itemId: 'a record'
const page = { records: view.records.map(r => ({ ...r, rev: 0, provenance: null })), links: [], journal: [],
  settings: { ...view.settings, rev: 0 }, clock: { days: 10, rev: 0 }, seq: 1, done: true };
console.log(CampaignPage.safeParse(page).success);           // false
```
Observed 2026-10-17: `memberIds` keeps `…004`; `aboard` keeps `…004`; the parse fails at
`records[0].status.track[0].to.id` and `records[0].status.cargo[0].itemId`.

Probe 2 (F2, by reading): `campaign.ts` lines 756 to 762: a stored entry with a different
`baseRev` pushes `current: entryFrom(stored)` with no author or visibility check anywhere above it.

---

## Gates
Read-only session: no code changed, no gate run. `npm test` was not run.

## Contract published
None (the contract is Lane B's; §6 is the list).

## Needs from others
- Lane A: P1b (`players_view.ts` hardening) before P2 starts (see `players_build_plan.md`).
- Lane B: §6 into `contracts/b_players.md` (B2b), then the leak suite skeleton, then P2.
- Johnny: the eight questions above.
