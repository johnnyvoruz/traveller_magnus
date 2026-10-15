# Party ships contract

Written 2026-10-14. Server, schema, and the smallest screen edits so the project typechecks. The ship list on screen is the next pass for A and D. Decisions 1 to 6 are the orchestrator's, from Johnny's answers the same day. The public-games contract (`b_public_games.md`) still describes the single mark. Where this file differs, this file is the one to build.

## The party

`CampaignSettings.party` is:

| Field | Holds |
|---|---|
| `vesselIds` | Ordered record ids. The first is the ship the screens open on. |
| `aboard` | Member id to vessel id. A member who is absent is aboard no ship. |
| `memberIds` | As today. |
| `anchor` | As today. Where a member aboard no ship stands. |

`vesselId` is not a field of a new row.

`CAMPAIGN_LIMITS.partyShips` is 20. A table's spare hulls fit in that list, and the public feed lists the same number of ships on one hex. A 21st id, a repeated id, or an `aboard` map with more keys than `CAMPAIGN_LIMITS.records` is `Invalid request.`

A member is aboard the ship `aboard` names. The current screens still treat "aboard" as they do today: a member's own anchor names the first ship. A and D replace that when they draw the list. `withVessel` on those screens stores one id and puts every current member aboard that ship. That save is a new-shape write. It replaces the stored list.

## Reading a row written before this change

A stored settings payload with `vesselId` and no `vesselIds` reads as the new shape.

- `vesselId` is a record id: `vesselIds` is `[vesselId]`, and every `memberIds` entry is aboard that ship. Until this change the whole party travelled on that one ship.
- `vesselId` is null: `vesselIds` is `[]` and `aboard` is `{}`.

`CampaignSettings`, `SettingsChange`, and `CampaignPage` accept that old object and return the new one. A payload that already has `vesselIds` is read as itself. A payload that has both keys is refused.

An empty campaign, and a missing settings row, is `vesselIds: []`, `aboard: {}`, `memberIds: []`, `anchor: null`.

## A save from a 1.2.0 tab

The 1.2.0 bundle parses a campaign page with `CampaignPage.parse` (`apps/web/src/campaign/store.ts`). That schema is strict: the party must be `vesselId`, `memberIds`, and `anchor`, and an unknown key fails the parse. A save sends the whole settings object the tab holds (`partyChange` in `apps/web/src/workspace/party.ts`, flushed by `apps/web/src/campaign/commit.ts`). It does not send `vesselIds` or `aboard`.

The server accepts that body. The rule depends on what is already stored:

- The stored payload has `vesselIds`. The write keeps that list and that `aboard` map. It takes `memberIds`, `anchor`, `kinds`, and `calendar` from the tab. It does not drop a ship or an `aboard` entry. A tab that changes `vesselId` does not reorder the list.
- The stored payload has no `vesselIds` (it is still the old shape, or there is no row). The write stores the lifted party: one ship, or none, and every member aboard that ship. A 1.2.0 tab can still change its only ship.

A new-shape body is stored as sent, after the limits above.

## What that tab sees

An already open 1.2.0 tab keeps the one ship it loaded. Its later save does not erase the other ships on the server. It does not show those ships, and it does not show `aboard`.

A reload parses the new page and throws. `loadPages` does not catch that throw, so the campaign stays on `loading` and does not open. The tab has to load the bundle that knows `vesselIds`.

The public feed is the exception. The 1.2.0 map reads `hex`, `count`, and `name` and leaves any other key unread (`readSector` in `apps/web/src/map/public_games.ts`). Adding `ships` does not stop those dots.

A conflict answer returns the new party. The 1.2.0 `CampaignChangesResult` schema is strict, so that answer fails the same way a reload does. The tab retries the save. The merge above still applies when the save is the old shape and the base revision matches.

## Where each ship is

`publicShips` (`packages/shared/src/public_hex.ts`) returns one place per id in `vesselIds`, in that order. The place is the same rule the single ship used: the vessel's track at `clock.days`, or `PUBLIC_DEFAULT_DAYS` when the clock is null. Flight stands in the system the leg is crossing. Jump stands in the system the leg left. A point keeps the hex and drops the point.

A ship is left out of the list when any of these is true:

- The record is missing, deleted, or not a vessel.
- `visibility` is `referee`.
- The hex is missing, the sector slug starts with `~`, or the local hex is not four digits.
- The universe's `truth_version` is null. The caller deletes the public rows and writes none.

`publicFirstHex` is that same place for the first ship only, and it does not look at visibility. With no ship it uses `party.anchor`, which is the pre-0017 mark. `publicMarkHex` is removed. Nothing in the tree calls it.

A member aboard a ship is where that ship is. A member aboard none is at `party.anchor`. Neither member is a public mark.

## Public rows

Migration `0017_public_ships.sql` adds `public_ships`. It does not drop `public_marks`.

| Column | Holds |
|---|---|
| `mark_id` | Primary key. See below. |
| `universe_id` | The campaign. Not part of the feed. |
| `truth_version` | The universe's non-null chart version. |
| `sector_slug` | Slug half of the hex. |
| `local_hex` | Four digits. |
| `ship_name` | The vessel's name. |
| `aboard_names` | JSON array of names, already capped. |
| `updated_at` | ISO time of this write. |

`mark_id` is `pm_` plus 26 Crockford characters (digits, `A`–`H`, `J`, `K`, `M`, `N`, `P`–`T`, `V`–`Z`). Those characters are the first 130 bits of SHA-256 of the UTF-8 string `voyage-public-ship`, a NUL, the universe id, a NUL, and the vessel id. The same pair always produces the same id. The id does not contain the universe id or the `cr_` id, and it is not reversible to either. `publicMarkId` computes it.

The write runs on the same trigger as today: a campaign save whose `applied` list includes `records`, `settings`, or `clock`, and only when `public_games` is 1. It also runs when the owner turns public on. One D1 batch deletes that universe's `public_ships` rows, deletes that universe's `public_marks` row, and inserts one `public_ships` row per ship `publicShips` returned.

Plain deletes, with no undo:

- A ship taken out of `vesselIds` is absent from the next batch, so its row is gone.
- Public turned off deletes `public_ships` and `public_marks` for that universe.
- `DELETE /api/universes/:id` does the same delete.

A name in `aboard_names` is a `memberIds` entry whose `aboard` value is that ship, whose record is live, and whose visibility is `players`. Order follows `memberIds`. `PUBLIC_NAMES_PER_SHIP` is 20. A longer list is cut. A referee member is left out. An `aboard` entry whose id is not in `memberIds`, or whose ship is not in `vesselIds`, is stored on the party and is not published.

## The feed

`GET /api/public-games` is unchanged for who may call it, the query, the cache header, the rate limit, and the caller's own games being left out.

Each hex item keeps `hex`, `count`, and `name`. Once 0017 is applied it also has `ships`: `{ mark, ship, aboard }[]`.

`count` is the number of public ships on that hex, before the cap. `name` is the universe's name when `count` is 1, and null otherwise. Two ships from one game on one hex have `count` 2 and `name` null. That is the old rule that a shared hex does not carry a single name, now counting ships. One ship still has `count` 1 and the universe name, which is what a 1.2.0 tab draws.

`PUBLIC_SHIPS_PER_HEX` is 20. The listed ships are the first 20 in `mark` order. `count` stays the full number when the list is shorter than the hex. `ships` on the wire is capped again at 20 names per ship.

Order of hexes is `hex` ascending. At most 1,280 hexes.

Before 0017 the body has no `ships` key. `hex`, `count`, and `name` are the single `public_marks` row, as today.

## What must never appear in the answer

Everything in `b_public_games.md` under "What must never appear", except a ship name and the names aboard it, and only inside `ships`.

Also absent, at any depth:

- a `cr_` id
- a universe id
- a referee-only record's name
- a ship that is not in `party.vesselIds`
- `vesselId`, `memberIds`, `aboard` as a map of ids

The hex item's keys are `hex`, `count`, `name`, and, when 0017 is applied, `ships`. A ship object's keys are `mark`, `ship`, and `aboard`.

## Before migration 0017

`detectPublicShips` (`apps/api/src/auth/public_schema.ts`) reads `sqlite_master` for `public_ships` once per isolate and remembers the answer.

When the table is missing and `public_games` exists, the worker keeps today's `public_marks` behaviour for the first ship (`publicFirstHex`). The feed reads `public_marks` and omits `ships`. A referee first ship still publishes a hex, because that row carries no name.

When `public_games` is missing, nothing here runs. The 0013 sentences in `b_public_games.md` still hold.

## `public_marks` after 0017

The table stays. This migration does not drop it. The feed does not read it. Each public write deletes that universe's row and does not insert a replacement. Rows for a universe that has not saved since 0017 can remain until that save, that owner turns public off, or that universe is deleted. A later migration drops the table.

## Cost

A campaign save when 0013 is absent adds no public-games statement. When 0013 is present and 0017 is absent, the cost is the one in `b_public_games.md`.

When both are present, the `sqlite_master` probe is once per isolate. A save that applied `records`, `settings`, `clock`, or `journal`, with public on, reads the campaign and then runs one D1 batch. Before 0018 that batch is two deletes and one insert per published ship. With 0018 it also deletes and reinserts that universe's `public_cards` rows. Turning public off deletes `public_marks`, `public_ships`, and, when the table exists, `public_cards`. One sector load of the feed is one join of `public_ships` and `universes`.

## What A and D need

The screens in this pass still open on the first ship. They do not draw one mark per party ship, and they do not edit `aboard`. Build that from this contract. Do not read `vesselId` off `party`.

| File | What changes |
|---|---|
| `apps/web/src/workspace/party.ts` | Done for compile. `leadVesselId` is `vesselIds[0]`. `withVessel` still stores one ship. A stores the ordered list and the `aboard` map here. |
| `apps/web/src/campaign/track.ts` | Done for compile. "Where are we" for the party still follows the first ship. Per-ship places already exist on each vessel's track. |
| `apps/web/src/campaign/journal.ts` | Done for compile. A new entry's place still follows the first ship. |
| `apps/web/src/workspace/party_where.ts` | No edit. `partyWhere` and `partyMarker` follow `partyVessel`, which is the first ship. A marker per ship uses `vesselWhere`, which is already per vessel. |
| `apps/web/src/map/vessel_marks.ts` | Done for compile. The party flag is the first ship. A party ship is any id in `vesselIds`. |
| `apps/web/src/map/campaign_layer.ts` | No edit. `resolvePartyHex` still takes one id, and the stand-in still builds one ship. The layer draws one party marker. |
| `apps/web/src/views/MapView.vue` | No edit. The party marker is `partyMarker` of the first ship. `map/public_games.ts` (A's file, not in this list) already draws `hex` / `count` / `name` and ignores `ships`. Draw one mark per ship from `ships`. |
| `apps/web/src/views/OrbitView.vue` | Done for compile. The list still puts `vesselIds[0]` first. |
| `apps/web/src/pack/plan.ts` | Done for compile. The player pack still names the first ship. |
| `apps/web/src/workspace/PersonField.vue` | No edit. `vesselId` here is the crew link's target, not the party. |
| `apps/web/src/workspace/sheet_people.ts` | No edit. Same: a link target, not the party. |

`GET /api/public-games` now includes `ships` when 0017 is applied. A 1.2.0 caller can ignore it. The next map pass should not ignore it.

## The public card

`GET /api/public-ships/:mark` reads the `mark` from the feed. The id is the one the last pass guaranteed: stable for that ship across saves, `pm_` plus 26 Crockford characters, not a `cr_` id, not reversible to one, and not the universe id.

Anyone can call it, signed in or out, once migration 0018 is applied. The answer is one JSON object:

| Field | Holds |
|---|---|
| `game` | The universe's name. |
| `referee` | The owner's profile handle when that game's `show_referee` is on, otherwise null. No handle row means null even when the switch is on. |
| `example` | True when `universes.example` is 1. |
| `ship` | The ship's name. |
| `aboard` | The same names the feed lists for that ship. |
| `legs` | Finished legs only. Each is `from`, `to`, `departs`, `arrives`. `from` and `to` are system hex keys (`sector/1910`). A leg whose arrival is after the campaign date is left out. A body, a point, and a note are left out. An end that is not a chart hex is left out, and that leg is left out. |
| `journal` | Public journal entries, newest `updatedAt` first. Each is `title`, `body`, `when` (`{ year, day }` or null), and `realDate`. |

`PUBLIC_CARD_ENTRIES` is 20. `PUBLIC_CARD_BODY` is 2,000 characters: a journal body may be 100,000, and the card is stored on every ship. `PUBLIC_CARD_BYTES` is 100,000 for `legs` plus `journal` on one ship. Past that, the oldest finished legs are dropped, then the oldest notes.

An unknown mark, a game that is off, a deleted universe, or a ship that is no longer public is 404 `No such ship.` Until 0018 is applied the route is 503 `Public ship cards are not available yet.` for a signed-in caller, and 401 for a signed-out caller, because the feed's old sign-in rule still applies.

The date is `clock.days`, or `PUBLIC_DEFAULT_DAYS` when the clock is null.

### Public journal entries

A journal entry's `visibility` is `referee`, `players`, or `public`. Records and links stay `referee` or `players`. A `public` entry is the only kind that is copied onto the card. A deleted entry is not.

The current bundle sends the header `X-Voyage-Journal: public` on `GET /api/universes/:id/campaign` and on `PATCH /api/universes/:id/campaign/changes`. With that header, each entry's `visibility` is the stored value, and a conflict's `current` entry is too. A write of `players` stores `players`, and the next card drops the entry. A write of `public` stores `public`. A write of `referee` stores `referee`.

A request without that header keeps the cached-tab rule. `GET /api/universes/:id/campaign` and a conflict's `current` entry rewrite `public` to `players` before the response is sent. The stored row stays `public`. A write of `players` for an entry whose stored visibility is `public` leaves it `public`, including a write that also edits the title or the body. Any other header value is the same as a missing header.

A cached 1.2.0 or 1.2.1 tab does not send the header. It parses each entry with `CampaignPage.parse`. `visibility` is the enum `referee` or `players`, and the object is strict. The value `public` fails that parse, `loadPages` does not catch the throw, and the campaign stays on `loading`. The rewrite is what keeps that journal opening. The tab sees the entry as `players`, in the journal with the other entries. It has no Public control. A later bundle reads the stored word, so the referee can see Public and can set the entry back to Players.

A journal-only patch refreshes the card. The same trigger as the ship rows: `applied` includes `journal`.

### No reader opens another universe's object

The card is D1. The write is the same `writePublicMark` batch as the ship rows. It reads the campaign once, then deletes that universe's `public_cards` rows and inserts one per published ship. `legs` and `journal` are JSON text. `game`, `referee`, and `example` are read from `universes` and `profile` when the card is served, so a change to the name switch or the example flag shows on the next read without another campaign save. The handle column is selected only when `show_referee` is 1.

One save with public on, 0018 applied, writes at most 20 card rows (one per published ship). Each row's `legs` plus `journal` is at most 100,000 bytes. The probe for `public_cards` is once per isolate.

### The referee's name

`PATCH /api/universes/:id/public-games` accepts `{ public }` as before. `showReferee` is optional. A body that is only `{ public }` does not change `show_referee`. The default is off.

When 0018 is applied the response is `{ public, showReferee }`. `GET /api/universes` and `GET /api/universes/:id` add `showReferee` for the owner, on the same rule as `publicGames`: the key is absent until the migration is applied.

A cached 1.2.0 or 1.2.1 tab parses that list with `Universe`, which is strict and has no `showReferee`. After 0018 the parse throws and `readList` does not open the campaign until the tab loads the bundle that knows the field. Until 0018 the key is absent and that tab is unchanged. `{ public }` alone still turns the game on or off.

The bundle that sends the journal header parses server answers with `parseRead` in `apps/web/src/campaign/read.ts`. The helper drops keys the schema does not declare, on the campaign page, the changes result, the universe list, and one universe (create and rename use the same universe parse). A key added later on those answers does not leave the campaign on loading. Nested keys the schema does not declare are dropped the same way. A `passthrough` object, such as a record's `status`, keeps its extra keys. The schemas the server uses on writes stay strict: `CampaignChanges`, `UniverseCreate`, and `UniverseUpdate`. A tab already open on the older strict schema still needs the journal rewrite above.

### Signed-out viewers

When 0018 is applied, `GET /api/public-games` and the card answer a signed-out caller. The rate limit is 60 calls in 60 seconds, counted by user id when a session is present and by `CF-Connecting-IP` when it is not. A missing IP shares one local bucket. A caller's own games are left out only when the caller is signed in. Until 0018, a signed-out feed is still 401 and the body is the 0017 feed.

### Example games

`universes.example` is an integer, default 0. There is no owner route that sets it. The seed tool, or an admin SQL session, sets it. The feed's `ships` objects include `example` once 0018 is applied. The card includes it always. Both read the column at request time.

Removing the examples is a plain delete, in this order, so foreign keys that do not cascade are cleared before the user row:

1. `SELECT DISTINCT owner_id FROM universes WHERE example = 1` and keep that list.
2. `DELETE FROM universes WHERE example = 1`. That cascades `public_marks`, `public_ships`, and `public_cards`.
3. For each saved owner id that now has no universe row: delete `profile` and `generation_allowance` for that id, then `DELETE FROM user WHERE id = ?`. `session` rows cascade from the user. The universe's Durable Object is not opened by any route once the universe row is gone.

The accounts, the ships, and the journal text are the next pass (Lane Z). This pass is the flag, the column, and that delete.

### What must never appear on the card

Everything the feed still withholds, plus:

- the referee's handle when `show_referee` is off
- a journal entry that is not `public`
- a leg that has not arrived
- a body key, a point, or a note
- a `cr_` id, a `cj_` id, a universe id, or a user id
- an email address

### Before migration 0018

`detectPublicCards` reads `sqlite_master` for `public_cards` once per isolate.

When the table is missing, the feed is the 0017 feed (no `example` key, signed-in only) and `PATCH` ignores `showReferee`. The card route is 503 for a signed-in caller. `showReferee` is omitted from universe reads.
