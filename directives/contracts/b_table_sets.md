# Table sets contract

**Status:** built, 2026-10-18. Johnny 20:39 (questions 69 to 78) is written in as decided. TS4 built the server: migration 0024, the R2 objects, and `/api/table-sets`. Lane A wrote the schema and `validateTableSet` (TS1). Lane D writes the editors. The screens are not this file.

Source: `findings/trade_tables_design.md` sections 6 and 9 (ZT1, widened by ZT1b), and `directives/decisions.md` 2026-10-17 20:39.

Envelope, as `directives/api.md`: `{ ok: true, data }` or `{ ok: false, error: { code, message, details? } }`.

## Decided

Johnny, 2026-10-17 19:55: one mechanism for every rules table a roller reads. The Random Passenger table is in that mechanism. This replaces all of backlog T3c. There is no `campaign_tables` row in the Durable Object.

Johnny, 2026-10-17 20:39, questions 69 to 78, every recommendation:

- A set is the whole file for one kind. Not one table, and not a mix of two sets.
- Sets live on the referee's account: one D1 table and one R2 object each. A campaign chooses a set. It does not keep its own copy.
- "From scratch" is copy, then clear, in the editor. The server does not store a set that fails validation.
- A player may read the one set the campaign has chosen, when that set belongs to the campaign's owner, and nothing else on the account. Read-only.
- No marketplace listing in this leg. Download and Load move a set between accounts.
- 20 sets an account, 256 KB a set. Both are guards.
- A loaded file must be a kind the app has a roller for.
- One route family, `/api/table-sets?kind=`, for every kind.
- The passenger editor ships before the trade editor. That is Lane D. It does not change these routes.

The official set of a kind is the file in `rules/`, reached through `rules:gen`. It is never a D1 row and never an R2 object. Its id is `official:<kind>`.

## Kinds

Closed, in `packages/shared` (`TABLE_KINDS`), written by Lane A:

| Kind | Official file | Id of the official set |
|---|---|---|
| `trade` | `mgt2e_trade` | `official:trade` |
| `randomPassenger` | `mgt2e_random_passenger` | `official:randomPassenger` |

A later kind is one more line, plus its schema and its validator. It needs no new route, no new table, and no new migration. A kind that is not in the registry is refused: "This app has no roller for that table."

## Storage

Account-level. Not charged to a universe's object bytes. Migration `0024_table_sets.sql`. 0022 is `universe_summaries` and 0023 is `access_tokens`, so the table sets took the next free number.

```sql
CREATE TABLE table_sets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES user(id),
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  based_on TEXT,
  edition TEXT NOT NULL,
  object_key TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  rev INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX table_sets_owner_kind ON table_sets(owner_id, kind, updated_at);
```

- `id` is `ts_` plus a ulid. `name` is 1 to 80 characters. `rev` starts at 1.
- The bytes are an R2 object at `table-sets/<owner_id>/<id>/<sha256>.json`. The object is the `TableSet` envelope. It is immutable. A save writes the object first, then the row. A failed save does not leave a row whose key is missing.
- `kind` does not change after create.
- Delete sets `deleted_at`. The row stays so a campaign that named it can fall back. The list omits a deleted row. A GET of a deleted id is 404.
- Twenty counts live rows (`deleted_at` null) on the account, across every kind.

`CampaignSettings` gains `tableSets`, optional, a map of kind to set id. Lane A adds it. The object is `.strict()`, so the schema ships before any client writes the key. A kind left out means `official:<kind>`. This paper does not edit `packages/shared/src/schemas/campaign.ts`.

Changing the chosen set does not rewrite cargo already bought. A lot keeps the price on its ledger line.

## Routes

`owner` is the signed-in account that owns the row. `member` is an active player, and it exists only once P2b's member check exists. Until then a caller who is not the owner is a stranger.

| Method | Path | Auth | Answer |
|---|---|---|---|
| GET | `/api/table-sets?kind=` | owner | 200 `{ items }` of that kind: id, kind, name, basedOn, edition, bytes, rev, updatedAt. Not the table body. `kind` is required. |
| POST | `/api/table-sets` | owner | 201 the new row plus the envelope. Body is `{ kind, name, tables }`, or `{ copyOf, name? }`. `copyOf` is `official:<kind>` or an id this account owns. |
| GET | `/api/table-sets/:id` | owner, or a member of a campaign whose owner owns this set and whose `tableSets` for that kind is this id | 200 the envelope. A player does not receive any other set. A named set from another account is the same 404 as a missing id. |
| PUT | `/api/table-sets/:id` | owner | 200. Body `{ baseRev, name?, tables }`. A stale `baseRev` is 409. Kind is not in the body. |
| DELETE | `/api/table-sets/:id` | owner | 200. Soft-deletes. A campaign that named it falls back to the official set of that kind. |

A player has no list route. `GET /api/table-sets?kind=` does not answer for a member.

Download is the GET body. Load is POST of a file the browser already parsed. Both are these routes. There is no second path.

The server runs that kind's validator on POST and PUT. The same function Lane A ships for the browser. A failure is 400, and `details.problems` is the validator's list. A set that fails cannot be stored and cannot be chosen.

`PUT` writes a new R2 object, then updates the row's key, hash, bytes and `rev`. The previous object is left. It is content-addressed.

## Errors

| Status | Code | When | Message |
|---|---|---|---|
| 401 | `unauthenticated` | signed out | Sign in to continue. |
| 404 | `not_found` | the id is missing, deleted, or not this caller's to read. A stranger and a player whose campaigns did not choose it get the same body. | No such table set. |
| 400 | `validation` | a bad body, an unknown kind, a change of kind, or the kind's validator failed. Problems ride in `details` when the validator produced them. | Invalid request. |
| 400 | `too_large` | a 21st live set on the account | An account holds at most 20 table sets. |
| 400 | `too_large` | the JSON is over 256 KB | A table set is at most 256 KB. |
| 409 | `conflict` | `baseRev` is not the row's `rev` | Someone else saved this table set. Reload it and try again. |
| 503 | `table_sets_unavailable` | the migration is not applied | Your own tables are not available yet. |

Unknown kind uses the validation row, and the message stays "Invalid request." The sentence "This app has no roller for that table." is `details.problems[0].words`, from the validator.

## Before the migration, and either order

The migration is a new table only. It does not alter a campaign table. `tableSets` on the settings document is optional. Either may land first.

| Caller | Migration absent | Migration present, players server absent | Both present |
|---|---|---|---|
| GET list, POST, PUT, DELETE | 503 `table_sets_unavailable` | As in the routes table, owner only. | As in the routes table. |
| GET one set, owner | 503 `table_sets_unavailable` | 200 when it is theirs. | 200 when it is theirs. |
| GET one set, anyone else | 503 `table_sets_unavailable` | 404 `No such table set.` There is no member check yet, so a player is a stranger. | 200 only when a campaign they play has chosen that id and the set's owner is that universe's owner. Otherwise 404. |
| Campaign settings with no `tableSets` | The rollers use the official file. | Same. | Same. |
| Campaign settings naming a `ts_` id, and the row is missing or deleted | The roller uses the official set of that kind and can say "This campaign's table could not be read; using the official table." The words are Lane E's. The fallback is this contract. | Same. | Same. |

Until the client ships, nothing calls the routes. The select, when it cannot load the account's sets, shows the official set only.

## What this paper does not build

No screen. `CampaignSettings.tableSets` is Lane A's, already on the schema. The passenger editor is first when Lane D builds the screens, and it uses these same routes. TS4 built the server this file describes. The migration file is `0024_table_sets.sql`.
