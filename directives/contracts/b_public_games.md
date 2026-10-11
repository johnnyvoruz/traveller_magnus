# Public games contract

Written 2026-10-11. Nothing in this file is built. It is the feed the map will call after the marketplace stub. Decisions 4 to 10 are Johnny's, 2026-10-10.

A public game is one hex on a chart, plus the universe's name when that hex has only one such game. It is not a vessel in the owner's campaign layer.

## The setting

Decision 7: opt-in, default off. A new universe publishes no position.

The flag is a new column on D1 `universes`: `public_games INTEGER NOT NULL DEFAULT 0`. `0` is off. `1` is on. The column is **proposed**. `data_model.md` §2 has no such column, and `CampaignSettings` has no public flag. The flag is a property of the universe, so a reader never opens the campaign document to learn it.

Who may set it: the owner, by the same check as `ownedUniverse`.

### `PATCH /api/universes/:id/public-games` — **not built**

Body: `PublicGamesSetting` `{ public: boolean }`, in `packages/shared/src/schemas/public_games.ts` (named here, not added in this pass). `.strict()`.

Answer: 200 `{ public: boolean }`.

Turning it on writes the mark from the campaign as it stands, in the same request. Turning it off deletes the mark. The campaign rows are not changed.

Errors: 401 `Sign in required.` 404 `No such universe.` 403 `Origin check failed.` 400 `Invalid JSON.` 400 `Invalid request.`

## The write

Decision 5: the position is the hex from the owner's last save. No heartbeat and no expiry. It stays until public is turned off.

The mark is one D1 row, table `public_marks` (**proposed**. No current table holds another universe's position, and a reader must not open that universe's Durable Object):

| Column | Holds |
|---|---|
| `universe_id` | primary key |
| `truth_version` | the universe's non-null `truth_version` |
| `sector_slug` | the slug half of the hex key |
| `local_hex` | the four digits |
| `updated_at` | ISO time of this write |

The universe's name is not copied. The read joins `universes.name`, so a rename shows on the next sector load.

When the row is written: after a successful `PATCH /api/universes/:id/campaign/changes` that touched records, settings, or the clock, and only when `public_games` is 1. A journal-only patch does not move the mark. The hex is computed on the server from the same inputs the owner's map uses: the current vessel, its track, and the campaign date (`clock.days`, or the default start when the clock is null).

Decision 10: the mark follows the current ship. Today that ship is `CampaignSettings.party.vesselId` (`packages/shared/src/schemas/campaign.ts`), one id or null. Johnny's list of vessel ids, with one flagged current, is not in that schema. This contract does not add it. The write uses `vesselId`. When a later campaign change stores the list, the same write follows the flagged id and copies nothing about the other ships.

Decision 6: hex precision only. The stored columns are the sector and the four digits. Body, open-space point, and jump state are not columns.

The hex itself:

- At a system, that system.
- Holding at an open-space point, the system the point sits in. The point is dropped.
- In flight, the system the leg is crossing.
- In jump, the system the leg left. Decision 4: the answer does not say "in jump". The dot is the same shape as any other dot.

Decision 8: games share a map only on the same non-null `truth_version`. The write stores no row, and deletes one that was there, when any of these is true:

- `truth_version` is null (a from-scratch universe).
- The hex slug starts with `~` (a referee's own sector).
- The party has no hex (no current vessel, or a vessel the date cannot place).

Removed when:

- The owner turns public off.
- The owner deletes the universe (`DELETE /api/universes/:id`, which already sets `deleted_at`). The mark is deleted in that same write.
- A later save lands on a hex this contract does not publish.

## The read

### `GET /api/public-games?truthVersion=&sector=` — **not built**

Who: any signed-in user. This is not owner-only. A signed-out caller is 401 `Sign in required.` The map calls it when it draws a sector. It does not poll.

Query: `truthVersion` (required, the pin of the map on screen) and `sector` (required, the sector slug).

Answer: 200 `PublicGamesSector`.

```
{ hexes: [ { hex, count, name } ] }
```

`hex` is the four-digit local hex. `count` is how many public games stand on it. Decision 9: the layer draws one dot and the count, not one glyph per game.

Decision 4: where `count` is 1, `name` is that universe's name. Where `count` is greater than one, `name` is null. The count is the only extra fact. No list of names.

Rows match `truth_version` and `sector_slug`. A universe with public off has no row. An empty sector is `{ hexes: [] }`, including a sector slug the chart has never heard of, so a blank sector does not 404.

Order: `hex` ascending. Upper bound: 1280 hexes, one entry per local hex. Counts collapse onto the hex, so the body cannot grow with the number of games. A sector is 32 by 40.

Cache: `Cache-Control: private, no-store`. The bytes are not a CDN object. The client loads them with the sector.

Errors: 400 `validation`, `truthVersion is required.` 400 `validation`, `sector is required.` 400 `Invalid request.` when the version or the slug fails the schema.

## What must never appear in the answer

A test can reject a body that contains any of these keys or strings at any depth:

- `universeId`, `ownerId`, `authorId`, `userId`, `handle`, `email`
- `vesselId`, `memberIds`, `recordId`, and any `cr_` id
- `bodyKey`, `point`, `jump`, `in jump`
- `referee`, `player`, `journal`, `notes`, `sheet`
- a hex slug that starts with `~`
- a second universe name on a hex whose `count` is not 1

The answer object has one key, `hexes`. Each item has only `hex`, `count`, and `name`.

## What the browser needs

Lane A calls `GET /api/public-games?truthVersion=<the map's pin>&sector=<slug>` when a sector is drawn, and skips the call when the pin is null. It draws `PublicGamesSector` and does not poll.

Whoever owns `map/` that turn draws one dot per item, with the count beside it. When `name` is a string, the dot may show that name. When `name` is null, it shows the count alone. The dot is not a campaign vessel and is not added to the owner's vessel list. `MapRenderer.ts` is not named in a lane file. The prompt that builds the layer has to name it.

The owner's switch is `PATCH /api/universes/:id/public-games` with `{ public: true }` or `{ public: false }`. Default off. The switch lives with the universe's own settings, not on the public layer.
