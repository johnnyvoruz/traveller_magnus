# Players contract

**Status:** P2b contract, 2026-10-17. Orchestrator review 19:55 accepted P2a except the five fixes below, which are written in. The decisions below are decided (Johnny 15:30, 17:00, and 18:40, the five answers of 16:55, and the two B2c answers). This paper adds no route, no migration, and no code. P2b builds from this file.

Source: `directives/backlog_players_landing_trade.md` Epic P, `directives/reports/x_players_review.md` §6 items 1 to 17, `directives/decisions.md`.

Envelope, as `directives/api.md`: `{ ok: true, data }` or `{ ok: false, error: { code, message, details? } }`.

Auth gains one level, `member`: a row in `universe_members` for that universe whose `status` is `active`. An `archived` row is not a member. The levels already in `api.md` stay. `owner` is still `universes.owner_id`. The owner is not a member row.

## Decided

Johnny, 2026-10-17 15:30, then replaced in part at 17:00 and 18:40:

- Players write journal notes.
- A campaign can have 255 active players. Archived players do not count. This replaces "12 players".
- There is no second referee in this leg. The `role` column stays, for a later value.
- Johnny 18:40: B may build P2 after the orchestrator reviews this file.

Decisions 1 to 9 of Epic P stand, with the seat count and the archive rule below, and with these further answers written in as decided.

Johnny, 2026-10-17 16:55, the five contract questions:

- `universe_invites` stores `token` beside `token_hash`. Owner routes may read it. It is never logged. Revoke clears it.
- The 255 guard counts current active members. A claim count does not refuse.
- The owner's `PATCH /api/universes/:id/players/:userId` `{ personId }` is in P2.
- The later slice-4 revoke, when it is built, is `DELETE /api/universes/:id/players/publishes/:publishId`. It is not this paper.
- The projection drops every `rev` except on a note whose `author_id` is the caller. A players note the member could see travels on the poll as `deleted: true`. Record and link tombstones stay out.

Johnny, 2026-10-17 18:40, review questions 1 to 8:

- A players ship's track or anchor that points at a hidden place keeps the hex and drops the name.
- A player the referee archived cannot rejoin through a live link. A player who archived themself can, and that claim reactivates the same row.
- A signed-in account that is not a member gets 404 `not_found`, "No such universe." `403 not_a_member` is only for an archived member.
- A member's own notes keep `rev`. Nothing else in the projection does.
- Guards, not design limits: 10 note writes a minute and 60 reads a minute per player. There is no 500-note cap. The live-notes guard is 65,535 per player.
- The publish form warns when a chosen record is referee-only. No change to the published data. That warning is the publish form (Lane D), not a route in this paper.
- A member page `seq` may climb when the referee writes something the member cannot see.
- The request log masks `/join/*` and `/claim/*`.

Stream B2c, orchestrator 19:55, both answers yes:

- The leak suite uses the live Origin sentence, "That request was blocked. Reload the page and try again." Review case 35 follows that sentence.
- The pre-0014 plain add stays. When `object_byte_charges` is missing, a retry can still add the bytes twice. Production has 0014.

Decisions 1 to 9, restated with those answers:

1. Two D1 tables. `role` holds only `'player'` for now. A co-referee is a later role value, not a new table. The owner stays `universes.owner_id`.
2. One reusable invite link per campaign, `/join/<token>`, 30 days. The referee can revoke the link and make a new one. The referee archives a member; the referee does not delete the row. Characters' single-use link stays as it is.
3. Players read a projection, never the rows. Lane A builds `playersView` in `packages/shared/src/players_view.ts`. The Durable Object applies it to a member's read. The field list, word for word, plus the exceptions decided above: a record is in when `visibility === 'players'`; a link when both ends are in; a journal entry when `players` or `public`; mentions of hidden records read "a record"; the party, clock and settings are in; `provenance` and tombstones of records and links are out. `rev` is out except on the caller's own notes. A players note the caller could see is in when it is deleted, with `deleted: true`.
4. A member writes journal entries of kind `note` only, `visibility: 'players'`, `author: 'players'`, and may edit or delete their own. `author_id` on `campaign_journal` is the caller's user id. The Durable Object enforces it. Everything else is read-only for a player. The referee's "Player notes" field is renamed in the UI to "For players" (that rename is P10, not this paper). The stored key `playerNotes` does not change.
5. A member may be one person record, `person_id`, changeable by the referee or the player. A character sheet stays reachable only through `character_access`.
6. A member may read an object hash that appears in the players projection. The server computes the allowed set from the projection on request (cache per isolate for a minute, keyed by `GET /campaign/seq`). Nothing else opens.
7. Both roles poll every 30 s while the panel is open and the tab is visible. The owner polls `GET /campaign?after=`. The member polls the same Worker path, and the Worker calls the Durable Object at `GET /campaign/players`. Realtime is P12, later.
8. Defaults do not change. A new record is `referee`. The referee gets "View as players", and that switch runs the same projection.
9. Players never see the Builder, never export, never publish, and are not counted toward the owner's 10 universes. "Playing in" is a separate list from "Your campaigns".

## D1 tables

Migration `0021_universe_members.sql`, hand-written, the same way as 0003 onward. `apps/api/src/db/schema.ts` is kept in step when P2b builds this. This paper does not add the file.

`universe_members`

| Column | Holds |
|---|---|
| `universe_id` | the universe. With `user_id`, the primary key |
| `user_id` | the account |
| `role` | `'player'` only, in this leg |
| `person_id` | a campaign record id, or NULL |
| `status` | `'active'` or `'archived'`. Default `'active'` |
| `archived_at` | ISO time, or NULL while `status` is `active` |
| `archived_by` | `'owner'` or `'self'`, or NULL while `status` is `active` |
| `created_at` | ISO time of the first join. A later return does not change it |

`universe_invites`

| Column | Holds |
|---|---|
| `id` | primary key |
| `universe_id` | the universe |
| `token` | the raw token. Set while the link is live. NULL after revoke. Owner routes may read it. No log line writes it |
| `token_hash` | SHA-256 of the invite token. The claim looks up by this |
| `role` | `'player'` |
| `expires_at` | ISO time, 30 days after the link is made |
| `revoked_at` | ISO time, or NULL while the link is live |
| `uses` | how many accounts have claimed this link. It does not refuse |
| `created_at` | ISO time |

There is no `max_uses` column.

The token follows the character invite where this table does not override it: 32 random bytes, encoded in the path. One live link per universe: at most one row with `revoked_at` NULL. A later `POST` while that row is unexpired returns it, `token` included, so the owner can copy the same URL. Making a new link sets `revoked_at` and sets `token` NULL on the previous row in the same write. An expired row is not live. Characters' `character_invites` table, the 14-day single-use claim, and `POST /api/characters/claim` are unchanged.

The seat guard is the number of `universe_members` rows for that universe with `status = 'active'`. The owner is not a row and is not one of the 255. Archived rows do not count. `uses` counts claims and never refuses.

`person_id` is NULL, or the id of a person record that is in the projected party (`Party.memberIds` after `playersView`). The sheet on that record is not opened by membership. The sheet loads only through `character_access`.

## Words for the screens

Lane D, P5. This paper does not draw them.

- The two groups are "Playing" and "Archived".
- The owner's action that archives is "Archive".
- The owner's action that sets `status` back to `active` is "Bring back".

## Routes

P2b mounts these on the universe routes, except the account routes and `GET /api/join/:token`. Schemas are new in P2b, in `packages/shared`, in a new players schema file. `packages/shared/src/schemas/campaign.ts` is left to Lane A.

| Method | Path | Auth | Purpose | Schema |
|---|---|---|---|---|
| POST | `/api/universes/:id/players/invite` | owner | Makes the live link, or returns the one that is already live. Data: `{ url, expiresAt, role, uses }`. `url` is the site origin plus `/join/<token>`. `role` is `player`. `expiresAt` is 30 days from `created_at`. A second POST while the link is live returns that same link. | `PlayerInvite` |
| DELETE | `/api/universes/:id/players/invite` | owner | Revokes the live link. Sets `revoked_at` and sets `token` NULL. Data: `{ revoked: true }`. No live link answers the same data. | — |
| GET | `/api/universes/:id/players` | owner | Both groups. Data: `{ playing: Member[], archived: Member[] }`. `Member` is `{ userId, handle, personId, joined, status, archivedAt, archivedBy }`. `handle` is `profile.handle`. `joined` is `created_at`. `playing` is `status` `active`. `archived` is the rest. The owner is not an item. | `PlayerList` |
| DELETE | `/api/universes/:id/players/:userId` | owner, or that member | Archives that member. Sets `status` `archived`, `archived_at` now, `archived_by` `'owner'` when the caller is the owner and `'self'` when the caller is that member. Access ends at once. The row stays. Data: `{ status: 'archived' }`. An already archived row answers the same data and does not change `archived_by`. | — |
| PATCH | `/api/universes/:id/players/:userId` | owner | Body `{ personId }` (`personId` is a string or null), or body `{ status: 'active' }`. One of those, not both. `{ personId }` sets that member's `person_id` and answers `{ personId }`. `{ status: 'active' }` is "Bring back": `status` `active`, `archived_at` NULL, `archived_by` NULL, and answers `{ status: 'active' }`. | `PlayerPerson` or `PlayerStatus` |
| PATCH | `/api/universes/:id/players/me` | member | Body `{ personId }` (`personId` is a string or null). Sets this caller's `person_id`. Data: `{ personId }`. | `PlayerPerson` |
| POST | `/api/join` | user | Body `{ token }`. Claims the live link. A new account inserts `universe_members` with `status` `active`. An active member gets `{ universeId, name, role }` and no second row. A self-archived member is set back to `active` on the same row (`archived_at` and `archived_by` NULL) and gets that same data. Data: `{ universeId, name, role }`. The owner claiming their own link gets 403 `forbidden`. An owner-archived member gets 403 `not_a_member`. | `JoinClaim` |
| GET | `/api/join/:token` | public | Data: `{ name, ownerHandle, expiresAt }` for a live token. Signed out is allowed. The token is in the path because the page already holds it. The log masks it. 60 a minute by IP. | `JoinPreview` |
| GET | `/api/me/playing` | user | Universes where the caller has an active member row, and the universe is not deleted. Data: `{ items: [ { id, name, ownerHandle, truthVersion } ] }`. `truthVersion` is the universe's column, or null. This is "Playing in". It is not `GET /api/universes`. An archived membership is absent. | `PlayingList` |
| GET | `/api/universes/:id/campaign?after=&limit=` | owner or member | **Built for the owner.** The owner is forwarded to the Durable Object `GET /campaign`, as today. A member is not. For a member the Worker calls `GET /campaign/players` on the Durable Object. The Worker builds that URL from its own checked `after` and `limit` (default 1000, cap 1000). Nothing from the client's query string is forwarded. | — |
| PATCH | `/api/universes/:id/campaign/changes` | owner or member | **Built for the owner.** The owner's body stays `CampaignChanges`. A member may send only journal creates, updates, and deletes of kind `note`, with `author: 'players'` and `visibility: 'players'`, and with no `images`. The Durable Object sets `author_id` to the caller on create. On update and delete, `author_id` must already be the caller. Anything else is 403 `forbidden`. | `CampaignChanges` |
| GET | `/api/universes/:id/objects/:hash` | owner or member | **Built for the owner.** A member is allowed when the hash is in the set taken from the projection's `images[].hash` and `images[].thumbHash` only. The allowed set is computed on request and cached per isolate for one minute, keyed by universe id and the `{ seq }` from `GET /campaign/seq`. Any other hash is 404, the same body as an unknown hash. | — |

`POST /api/universes/:id/players/publish` and `DELETE /api/universes/:id/players/publishes/:publishId` in `api.md` slice 4 stay unbuilt (`player_publishes`). The membership archive uses `DELETE /api/universes/:id/players/:userId`.

Build note for P2b: register `PATCH /api/universes/:id/players/me` before `PATCH /api/universes/:id/players/:userId`. If `:userId` is registered first, the path segment `me` is captured as a user id.

Owner-only routes stay owner-only. A member, an archived member, and a signed-in non-member who call the Builder, export, publish, generate, or any other owner route receive the same 404 `not_found`, "No such universe.", that a missing id receives. Players are not counted toward the owner's 10 universes: `POST /api/universes` still counts universes that account owns.

A member's journal write does not count toward the owner's 120 non-GET Durable Object calls a minute. It counts toward that member's 10 writes a minute, below.

### Member campaign read

The Durable Object runs `playersView` over the whole live set in one call and answers the projected rows with `seq` greater than `after`, plus `visible: { records, links, journal }` (ids only) when `after` is `0`, and on every later page whose `seq` moved past `after`. `seq` and `done` stay, so the poll can move. `seq` may climb when the referee writes a row the member does not see. The owner still receives the full page from `GET /campaign`, including tombstones.

`playersView(full, { userId, handles })` takes the caller and a map of user id to profile handle. Lane A builds that. P2b does not reimplement the filter.

On a member page:

- `rev` is present only on a journal entry whose `author_id` is the caller.
- `authorName` (the profile handle) is present on every journal entry that has an `author_id`.
- The owner's read does not add `author_id` to the body. It is not a field of the campaign schema. The Worker passes the handle map on the owner's read too, so `authorName` is on those entries for the owner as well as for a member. Dropping `authorName` from the owner's read was the other option; this contract keeps it.
- Records, links, settings, and the clock carry no `rev`. No row carries `provenance`.
- A track or an anchor on a players-visible record that points at a hidden place keeps the hex and drops the name.
- A link is in when both ends are in. A link's own `visibility` is not read by the projection. Changing that needs a migration of existing links.
- A mention of a hidden record reads "a record", and the mention list holds no hidden id.
- A deleted record or link the member could see leaves the poll with no tombstone. A deleted players note the member could see is in the page with `deleted: true`.

The response shape is `PlayersPage`: the `playersView` rows plus `seq`, `done`, and optional `visible`. Lane B writes that schema in `packages/shared/src/schemas/players.ts` in P2b, with the other players schemas. Lane A does not add it. This paper does not add the file.

`GET /campaign/seq` on the Durable Object answers `{ seq }`. It is not a public route. The Worker reads it on every member poll and every member object read, and uses it as the key of the one-minute isolate caches.

### Member campaign write

The Durable Object applies the member's changes inside `applyCampaignChanges(sql, changes, now, acknowledgePublic, member?)`. A wrong author is `forbidden` before any `conflicts` row is built. A member note's `anchor` is `null`, a system anchor (`kind: 'system'`), or a record anchor whose id is in the current projection. A hidden record and a missing record answer the same 400 `validation` body. A note on a hex is a system anchor and is accepted.

Accepted from a member, and only this:

- a journal create, update, or delete
- `kind` is `note`
- `author` is `players`
- `visibility` is `players`
- no `images`
- the anchor is `null`, a system anchor (`kind: 'system'`), or a record anchor whose id is in the current projection
- on update and delete, the stored `author_id` is the caller

The Durable Object writes `author_id` on create and does not accept a different `author_id` from the body. A record, a link, settings, the clock, a session, a handout, a rumor, any other journal kind, any other visibility, any other author, a note with `images`, and another player's note are 403 `forbidden`, "You cannot change that."

The DO campaign schema adds `author_id TEXT NULL` to `campaign_journal` inside `installCampaignSchema`, by the same pragma-then-`ALTER` path the `images` column uses. `schemaVersion` stays `'3'`. Existing rows read `author_id` as NULL. A referee's note may leave it NULL. The referee may still delete any note.

A member's 65,536th live note (counted by `author_id` in that universe) is 400 `too_large`, "You have 65,535 notes in this campaign, the most one player can keep." A delete frees one. This is a guard, not a design limit.

### Header hygiene

Before the Worker sets its own `x-voyage-*` headers on a Durable Object fetch, it drops every `x-voyage-*` header that arrived on the client request. It then sets `x-voyage-user-id` and `x-voyage-universe-id` itself. A member call also sets `x-voyage-member` to that member's user id. `x-voyage-journal` is copied from the client value after the drop, and only when the client sent it. A client `x-voyage-user-id`, `x-voyage-worker`, or `x-voyage-member` does not reach the Durable Object.

On today's owner routes this drop, the journal copy, and `cache-control: private, no-store` on the campaign read, the campaign write, and the campaign export are already built (stream B4). The member header and the member routes are P2b.

### Cache

Every campaign read, campaign write, players read, join answer, and playing answer carries `cache-control: private, no-store`. That includes `GET /api/universes/:id/campaign`, `PATCH .../campaign/changes`, `GET .../campaign/export`, `GET .../players`, `GET /api/join/:token`, `POST /api/join`, and `GET /api/me/playing`.

### Log

`requestContext` logs `/join` and `/join/*` as `/join/<token>`, and `/claim` and `/claim/*` as `/claim/<token>`. The token is not the logged route. This is built (stream B4). `GET /api/join/:token` is masked the same way when P2b adds it: the log line does not contain the token.

### Origin

Member mutations check `Origin` the same way owner mutations do. `POST /api/join`, `PATCH .../players/me`, `PATCH .../players/:userId`, and `DELETE .../players/:userId` do too. A mismatch is 403 `forbidden`, "That request was blocked. Reload the page and try again."

### Join rate limit

`POST /api/join` allows 3 claims per 10 seconds per user, the same window as `POST /api/characters/claim`. The 4th is 429 `rate_limited`, "Too many requests.", with `retry-after: 10`.

### Member rate limits

Per member and per universe, in the Worker:

- 10 journal writes a minute. The 11th is 429 `rate_limited`, "Too many requests." The owner's next write still succeeds.
- 60 reads a minute, the `publicLimited` window. The 61st is 429 `rate_limited`, "Too many requests."

### Polling

Decision 7 is the client (P9). The server side is the member `GET` above. Both roles poll every 30 s while the panel is open and the tab is visible. This contract does not add a WebSocket. Realtime is P12.

### Errors

Through `fail()`:

| Status | Code | When | Message |
|---|---|---|---|
| 401 | `unauthenticated` | signed out, on a route that is not public | Sign in to continue. |
| 404 | `not_found` | the universe is missing or deleted; a signed-in non-member calls a member route or an owner route; a member calls an owner route; a member object hash is not in the projected set | No such universe. |
| 403 | `not_a_member` | an archived member calls a member route | You are not in this campaign. |
| 403 | `not_a_member` | `POST /api/join`, and that account's row is archived by the owner. `details.reason` is `archived` | The referee archived you from this campaign. |
| 400 | `invite_expired` | the link's `expires_at` is past. `details.reason` is `invite_expired`. Used by `POST /api/join` and by `GET /api/join/:token` | This invite has expired. |
| 400 | `invite_revoked` | `revoked_at` is set. `details.reason` is `invite_revoked`. Same two routes | This invite was revoked. |
| 400 | `campaign_full` | that universe already has 255 active member rows. `details.reason` is `campaign_full` | This campaign has 255 players, the most it can have. |
| 403 | `forbidden` | a member change that is not their own players note; the owner claims their own invite | You cannot change that. |
| 403 | `forbidden` | `Origin` is present and is not this request's origin | That request was blocked. Reload the page and try again. |
| 404 | `not_found` | `POST /api/join` or `GET /api/join/:token`, and no invite has that token | No such invite. |
| 429 | `rate_limited` | join, more than 3 per 10 s per user; a member's 11th note write in a minute; a member's 61st read in a minute; `GET /api/join/:token` past 60 a minute by IP | Too many requests. |
| 400 | `validation` | a bad body, a `personId` that is not null and not a person in the projected party, or a record anchor that is hidden or missing (a null anchor and a system anchor are accepted) | Invalid request. |
| 400 | `too_large` | a member's 65,536th live note | You have 65,535 notes in this campaign, the most one player can keep. |
| 503 | `players_unavailable` | migration 0021 is not applied, or `author_id` is not on `campaign_journal` yet and the call needs it | Players are not available yet. |

`GET /api/join/:token` for an unknown token is 404. Expired and revoked are 400 with `details.reason`, including when the caller is signed out.

A hidden object and an unknown object answer the same 404 body. `PUT` of an object by a member is 404 `not_found`, "No such universe."

### Before migration 0021, and either order

0021 is the D1 membership tables. `author_id` is a column on the Durable Object table `campaign_journal`, not a D1 migration. Either may land first. Neither statement depends on the other, so applying one cannot fail because the other is absent.

Until the D1 tables exist, the Worker follows the 0020 pattern: a safe default on the read that the menu needs, and a refusal on a write.

| Route | Before the two tables exist |
|---|---|
| POST invite, DELETE invite, DELETE member, PATCH member, PATCH me, POST join, GET `/api/join/:token` | 503 `players_unavailable`, "Players are not available yet." |
| GET `/api/universes/:id/players` | 503 `players_unavailable`, "Players are not available yet." An empty list would look like a campaign with no players. |
| GET `/api/me/playing` | 200 `{ items: [] }` |
| GET `/api/universes/:id/campaign` | Owner: unchanged. Anyone else: 404 `No such universe.` There are no members to project for. |
| PATCH campaign changes | Owner: unchanged. Anyone else: 404 `No such universe.` |
| GET object | Owner: unchanged. Anyone else: 404. |

Until `author_id` exists on `campaign_journal`, and the D1 tables do exist:

| Route | Answer |
|---|---|
| A member journal create, update, or delete | 503 `players_unavailable`, "Players are not available yet." |
| A member GET campaign | 200, the projection. No note carries `rev`. `authorName` is absent. |
| A member GET object | 200 when the hash is in the projected set. |
| The owner's campaign read and write | Unchanged. The owner does not need `author_id`. |
| Invite, join, members, playing, `GET /api/join/:token` | They use D1 only. They answer as in the routes table. |

When the DO opens after P2b, `installCampaignSchema` adds `author_id` if the pragma says it is missing, and leaves `schemaVersion` at `'3'`. A DO that has not opened yet still refuses the member journal write, as the table above says.

## What this paper does not build

No migration, no route, no Durable Object edit, no schema edit, no client. P1 (Lane A) builds `playersView` and the object-hash helper. P2b builds the tables, the routes, and `PlayersPage` in `packages/shared/src/schemas/players.ts` from this file. P3 builds the client store. P9 builds the 30 s poll. "View as players", hiding the Builder, the "For players" label, and the publish-form warning are client work. The stored key `playerNotes` stays.
