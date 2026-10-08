# Agent B — the journal in the Durable Object (K7b)

Issued 2026-10-07 by the orchestrator. Do this after `b_build_hardening.md` is reported.
If v6 finishes first, `b_engine_t1_7.md` still goes ahead of everything.

## Why

The journal is the campaign slice's next step (`slice_2_campaign.md` K7; the entry is
`campaign_manager_plan.md` §2.4). Agent A's schema (K7a) is on disk and accepted, in
`packages/shared/src/schemas/campaign.ts`: `CampaignEntry`, `EntryChange`,
`CampaignChanges.journal`, an optional `CampaignPage.journal`, `'journal'` in the result's
`applied` table and in `conflicts`, `CAMPAIGN_LIMITS.journal` (20,000), and `mentionsOf`.
Read them first; do not edit that file (say what you need).

**Today the server parses a change that carries `journal` and silently drops it**: the
schema accepts it and `applyCampaignChanges` never looks. Nothing sends one yet. This step
makes the server store, page and guard entries exactly as it does records.

## Build, in `apps/api/src/universe/campaign.ts`, in the file's own style

1. **The table.** `campaign_journal`, created in `installCampaignSchema` with the others
   (`IF NOT EXISTS`): one column per field of `CampaignEntry`, the structured ones (`when`,
   `anchor`, `mentions`) stored as the records table stores its like fields, plus `seq`.
   Indexes on `seq` and on `kind`.
2. **Reading.** `readCampaign` merges journal rows into the page by `seq` with records and
   links, under the same cap, and returns `journal` on every page (an empty array when
   there is none). `entryFrom(row)` beside `recordFrom`.
3. **Writing.** `applyCampaignChanges` applies `input.journal` in the same transaction:
   a new id inserts at `rev` 1 (the `baseRev` a new record must carry); an existing one
   needs `baseRev` equal to the stored `rev`, else a `'journal'` conflict carrying the
   stored entry; a delete is a tombstone (`deleted = 1`, new `rev`, new `seq`), and a
   tombstoned entry can be brought back as a record can. Every applied row is pushed to
   `applied` with table `'journal'`.
4. **`mentions` are the server's.** Whatever the change carries, the stored `mentions` are
   `mentionsOf(body)`. The browser derives them with the same function, so both sides
   agree, and a stale or forged list cannot be stored.
5. **The limit.** `requireRoom` and `countLive` learn the journal: 20,000 live entries,
   the refusal in the words the other two use.
6. **A record anchor whose record is deleted.** An entry may be anchored to a record
   (`{ kind: 'record', id }`). Do exactly what a record anchored to another record gets
   today when its target is deleted, and say what that is. If nothing is done today, do
   nothing here and say so: it is a question for the orchestrator, not a place to invent.
7. **Everything else that walks the campaign's tables.** Find every place that enumerates
   them (deleting or purging a universe, a snapshot or export if one exists, the copy
   between campaigns, any count shown to the owner) and either include the journal or say
   why it is rightly left out. List them in the report.
8. **`directives/data_model.md` and `directives/api.md`:** the table and the wider page,
   changes and result, in the places the records are described.

Not in this step: no session numbering on the server (the browser assigns it; two tabs may
collide and that is accepted for now), no history of an entry's edits, no images on
handouts, no players' writes.

## Check

Unit tests beside the existing ones for `applyCampaignChanges` and `readCampaign`: insert,
edit, a stale `baseRev`, delete and restore; a session with no sequence refused as
`validation`; the 20,001st live entry refused as `too_large`; `mentions` recomputed from
the body when the change carries a different list; a page that mixes the three tables in
`seq` order and one that breaks across the cap; a universe with no entries returns
`journal: []`. The `tests/api` suite with `RUN_API_TESTS=1` extended by one round trip
(write an entry, read it back on a second session), and run. `npm test`, `npm run check`,
`npx tsc --noEmit -p apps/api`, pasted.

Not yours: `apps/web`, `packages/shared` (read only), `packages/engines`. Your hardening
files (`jobs/`, `routes/admin.ts`) stay as you left them. No deploy, no production call,
no git. Stop and report, with the list from item 7 and your answer to item 6.
