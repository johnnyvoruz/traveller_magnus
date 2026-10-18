# Campaign list summary

Status: built. BC1b. The BC1 proposal was accepted at 23:15 with three changes, and this file matches those.

D's DU10 cards can say the party, the date and the record count for the open campaign only, because that is the one campaign the browser has loaded. `GET /api/universes` gains an optional `summary` so every card can say the same things. The list does not call a Durable Object once per universe.

## Shape

On each item of `GET /api/universes`, and on `GET /api/universes/:id`:

```ts
summary?: {
  vessels: string[];
  aboard: number;
  clockDays: number | null;
  records: number;
  changedAt: string;
} | null;
```

- `vessels` is the stored names of `party.vesselIds`, in that order, skipping a missing or deleted id.
- `aboard` is the number of `party.memberIds` that still point at a live record.
- `clockDays` is the stored clock, or null when the campaign has none. The card formats the date with the same function as the open campaign. This API does not send a date sentence.
- `records` is the count of live `campaign_records` (`deleted = 0`).
- `changedAt` is the time of the campaign write that stored this summary.

The card builds the party line from `vessels` and `aboard`. This API does not send that sentence.

`GET /api/me/playing` does not gain `summary` here. A later item can join the same row.

`updatedAt` on the universe stays what it is today. `changedAt` is the campaign, not a rename.

The public campaign-change body stays `CampaignChangesResult`. The install apply and remove bodies stay `InstallResult` and `InstallRemoved`. `summary` is not a field on those answers. The Worker reads it off the Durable Object response and removes it before the client sees the body.

## Where it is stored

Two copies. The list reads only D1.

The Durable Object keeps one row, replaced at the end of a campaign write that stored a change (`applyCampaignChanges`, including a member note, and install apply and remove):

```sql
CREATE TABLE IF NOT EXISTS campaign_summary (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  vessels TEXT NOT NULL,
  aboard INTEGER NOT NULL,
  clock_days REAL,
  record_count INTEGER NOT NULL,
  changed_at TEXT NOT NULL
);
```

`vessels` is a JSON array of strings. `schemaVersion` stays `'3'`. The table is created the same way as the other campaign tables, `CREATE TABLE IF NOT EXISTS`, so an old object gains it on open. No campaign migration.

There is no `GET /campaign/summary`. The write that stored the change returns `summary` on its own JSON body, next to `applied` or the install counts. The Worker upserts D1 from that field. It does not call the Durable Object a second time.

D1, migration `0022_universe_summaries.sql`. That was the next free number when BC1b was built (`0021_universe_members.sql` was the last file on disk). Session ingest takes the next free number after this one.

```sql
CREATE TABLE universe_summaries (
  universe_id TEXT PRIMARY KEY REFERENCES universes(id),
  vessels TEXT NOT NULL,
  aboard INTEGER NOT NULL,
  clock_days REAL,
  record_count INTEGER NOT NULL,
  changed_at TEXT NOT NULL
);
```

No second index. The list already has the universe rows.

After a successful owner or member campaign write, or a successful install apply or remove, the Worker upserts this row from the summary on that response. Two gates, both on an isolate cache:

- The values are the same as the last upsert this isolate wrote for that universe: skip.
- The values differ, and that upsert was less than a minute ago: skip.

The Durable Object row still updates on every stored change. A burst of writes can leave D1 up to a minute behind. The list and the single-universe read join D1. They do not call the Durable Object.

## Either order

Probe `sqlite_master` for `universe_summaries`, once per isolate when the answer is yes, and again when the answer is no.

| State | `GET /api/universes` | A campaign write |
|---|---|---|
| Table absent | The item has no `summary` key. | The Durable Object still stores its row and returns it on the write. The Worker does not write D1. |
| Table present, no row yet | `summary: null` | The next write that stores a change, and that passes both gates, upserts the row. |
| Both present | `summary` is the object above | The upsert replaces the row when the values changed and a minute has passed. |

A universe that has not been written since the Durable Object learned the table stays `summary: null`. The card keeps the name and `updatedAt`. Filling every closed campaign without a write is a later backfill, not this item.

## What this does not build

No card. No `summary` on `GET /api/me/playing`. No second read of the Durable Object per write. No backfill.
