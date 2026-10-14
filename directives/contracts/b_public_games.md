# Public games contract

Written 2026-10-11. The server side (steps 1 to 5) is built, 2026-10-12. The browser is not. Decisions 4 to 10 are Johnny's, 2026-10-10.

A public game is one hex on a chart, plus the universe's name when that hex has only one such game. It is not a vessel in the owner's campaign layer.

## The setting

Decision 7: opt-in, default off. A new universe publishes no position.

The flag is a column on D1 `universes`: `public_games INTEGER NOT NULL DEFAULT 0`. `0` is off. `1` is on. Migration `apps/api/src/db/migrations/0013_public_games.sql` adds it. The column is not on the Drizzle `universes` table: a select of that table before 0013 would fail. `CampaignSettings` has no public flag. The flag is a property of the universe, so a reader never opens the campaign document to learn it.

Who may set it: the owner, by the same check as `ownedUniverse`.

### `PATCH /api/universes/:id/public-games` — **built**

Body: `PublicGamesSetting` `{ public: boolean }`, in `packages/shared/src/schemas/public_games.ts`. `.strict()`.

Answer: 200 `{ public: boolean }`.

Turning it on writes the mark from the campaign as it stands, in the same request. Turning it off deletes the mark. The campaign rows are not changed.

Errors, through `fail()`: 401 `Sign in required.` 404 `No such universe.` 403 `Origin check failed.` 400 `Invalid JSON.` 400 `Invalid request.` When migration 0013 is not applied: 503 `public_games_unavailable`, "Public games are not available yet."

## The write — **built**

Decision 5: the position is the hex from the owner's last save. No heartbeat and no expiry. It stays until public is turned off.

The mark is one D1 row, table `public_marks` (migration 0013. No other table holds another universe's position, and a reader must not open that universe's Durable Object):

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

### `GET /api/public-games?truthVersion=&sector=` — **built**

Who: any signed-in user. This is not owner-only. A signed-out caller is 401 `Sign in required.` The map calls it when it draws a sector. It does not poll.

Query: `truthVersion` (required, the pin of the map on screen) and `sector` (required, the sector slug).

Answer: 200 `PublicGamesSector`.

```
{ hexes: [ { hex, count, name } ] }
```

`hex` is the four-digit local hex. `count` is how many public games stand on it. Decision 9: the layer draws one dot and the count, not one glyph per game.

Decision 4: where `count` is 1, `name` is that universe's name. Where `count` is greater than one, `name` is null. The count is the only extra fact. No list of names.

Rows match `truth_version` and `sector_slug`. A universe with public off has no row. The join leaves out a universe whose `owner_id` is the signed-in caller, so that person does not see their own game. A hex with no other public game is not in `hexes`. One other game on that hex has `count` 1 and `name` set to that universe's name. Two or more other games have `name` null. An empty sector is `{ hexes: [] }`, including a sector slug the chart has never heard of, so a blank sector does not 404.

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

The owner's switch is `PATCH /api/universes/:id/public-games` with `{ public: true }` or `{ public: false }`. Default off. The switch lives with the universe's own settings, not on the public layer. Success is the raw object `{ public: boolean }`, not the `ok` envelope. The errors are the list under the setting above, including 503 when 0013 is absent.

`GET /api/universes` and `GET /api/universes/:id` include `publicGames: boolean` for the owner when migration 0013 is present. Without that column the field is omitted, and the rest of the object is unchanged. Create, rename, and delete include it on the same rule, so a rename does not drop it from the list the browser already holds. A new universe is off (`false` when the field is present). The switch still learns the value it just wrote from the PATCH answer.

## Before migration 0013 — **built**

`detectPublicGames` (`apps/api/src/auth/public_schema.ts`) runs `pragma_table_info('universes')` once per isolate and remembers the answer. When `public_games` is missing:

- `PATCH /api/universes/:id/public-games` is 503 with the sentence above.
- `GET /api/public-games` is 200 `{ hexes: [] }`.
- Universe create, list, read, and campaign save keep the Drizzle select. `public_games` is not a column of that select, so a later column on `universes` cannot be forgotten in a second list. Soft-delete does not touch `public_marks`.
- `GET /api/universes` and `GET /api/universes/:id` omit `publicGames`.

When the column is present, the switch and the recompute after a campaign save each read `public_games` with one statement of their own. The owner list reads it once for every live universe. The single-universe read reads it once. A soft-delete (`DELETE /api/universes/:id`) also runs `DELETE FROM public_marks`. The foreign key does not fire, because the universe row stays and only `deleted_at` is set.

## Cost

A campaign save when 0013 is absent adds no D1 statement for public games. When 0013 is present and the save answered ok, one statement reads `public_games`. If that value is not 1, nothing else runs. The pragma is once per isolate, on the first list, read, switch, save, or feed call, and is not repeated.

A campaign save with public on, after that read, adds D1 only when the response `applied` array includes `records`, `settings`, or `clock`. The Worker then reads the campaign from the Durable Object (pages of 1,000 rows, at most 40 pages; settings and clock come back on every page; links and journal are not used) and makes one D1 write: an upsert, or a delete when the hex must not be published. A journal-only patch, or a 200 that applied none of those three tables, adds no further D1. A failed save adds none.

Turning public on is one `UPDATE` plus that same one write. Turning it off is one `UPDATE` plus one `DELETE`.

One sector load of the feed is one join of `public_marks` and `universes` (`deleted_at IS NULL`, `public_games = 1`, and `owner_id` not the caller), after the in-memory rate check.

## Abuse

`GET /api/public-games` allows 60 calls in 60 seconds for one user id, counted in memory on that isolate. The 61st call in the window is 429 `rate_limited`, "Too many requests.", and it does not run the join. The count is not shared across isolates. A polling account hits this cap. The map should still load the feed once when the sector is drawn, not on a timer.

## What Lanes A and D need

Lane A, the feed: call `GET /api/public-games?truthVersion=<the map's pin>&sector=<slug>` when a sector is drawn and the pin is not null. Skip the call when the pin is null. Draw `PublicGamesSector`. Do not poll. Send the session cookie. A signed-out caller is 401. The answer already leaves out the caller's own games. Do not subtract them again in the browser.

Lane A, the switch: `PATCH /api/universes/:id/public-games` with a JSON body `{ public: true }` or `{ public: false }`, beside the universe's own settings. Handle 401, 403, 404, 400, and 503. The 503 sentence is "Public games are not available yet."

The prompt that draws the dots has to name `map/MapRenderer.ts`. This contract does not.

Lane A, auth (from `contracts/b_auth.md`, this same pass): link Google, Discord, or X with `POST /api/auth/link-social`, not `POST /api/auth/sign-in/social`. `sign-in/social` starts a new sign-in and can land on a different account. `list-user-passkeys` includes `createdAt` as an ISO 8601 string. The Worker now accepts a body-less `POST /api/auth/sign-out` (it rewrites that one call to `{}`). The browser should still send a JSON body.

Lane D, the switch: read `publicGames` from `GET /api/universes` and from `GET /api/universes/:id`. It is a boolean when 0013 is present and absent otherwise. Do not treat a missing field as on.

Lane D: the local passkey recipe is in `contracts/b_auth.md`. `BETTER_AUTH_URL` is the page origin (`localhost`, not `127.0.0.1`), and `wrangler dev` needs `--host localhost:<port> --local-upstream localhost:<port>`. Production `rpID` is `traveller.voyage` and the expected origin is `https://traveller.voyage`, from `BETTER_AUTH_URL` in `wrangler.toml`, not from the request host.
