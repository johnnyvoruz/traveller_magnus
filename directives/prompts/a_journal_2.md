# Agent A — the journal in the browser's store (K7c)

Written 2026-10-07 by the orchestrator, ahead of need. **Do this only when the
orchestrator's paste says K7a is accepted.** If the schema you shipped in K7a differs from
what this file assumes (`CampaignEntry`, `EntryChange`, `CampaignChanges.journal`, the
optional `CampaignPage.journal`, `mentionsOf`, the `'journal'` result table), the schema
wins: say where this file is out of date and carry on.

## What this is

The store's side of the journal, with no screen: entries held, committed and indexed
exactly as records are, so Agent E's screens (designed in `findings/journal_design.md`,
which may not exist yet: do not wait for it) have one place to read and write. The
server does not store entries until Agent B's K7b is deployed; nothing calls this yet, and
everything here is proved against the fake transport the store's tests already use.

## Build

1. **`campaign/store.ts`.** `campaign.journal`, entries by id, beside `records` and
   `links`: filled from each page (`page.journal ?? []`), cleared wherever the rows are
   cleared, replaced wherever they are replaced. Nothing else in the file changes.
2. **`campaign/commit.ts`.** `journal` rows ride the same road as records: queued by id
   with the first `baseRev` remembered, applied to the store at once, sent in the same
   flush, `applied` rows taking the server's `rev`, a `'journal'` conflict taking the
   server's `current` and saying so through `lastError` in the words records use, a failed
   send restored. `newEntryId()` beside `newRecordId()` (`cj_` and a UUID). The row count
   and byte limits already cover them through the schema.
3. **`campaign/journal.ts`, new.** Pure functions over the store's entries, with their own
   small index rebuilt when the others are (hook it where `reindex` is called; do not
   change `rebuildCampaignIndex`'s signature, Agent D's screens call it):
   - `entriesNewestFirst(kind?)`: live entries, by `when` (latest first), undated ones
     after the dated, ties by `createdAt`, then id. One fixed order, tested.
   - `entriesAtHex(hexKey)` (the entry's anchor: a system anchor directly; a record anchor
     through `placeAt` at the campaign date, as the record index does) and
     `entriesMentioning(target)` (a record id or `hex:<hexKey>`, from the stored
     `mentions`).
   - `nextSessionNumber()`: one more than the highest live session's `sequence`, 1 for
     the first. A deleted session's number is not reused while a higher one lives.
   - `draftSession()` and `draftNote()`: a complete `CampaignEntry` ready to commit.
     A session: the next number, title `Session <n>`, `when` from the campaign clock,
     `realDate` today (local date, `YYYY-MM-DD`), `anchor` the party's place at the
     campaign date (the party's vessel through `placeAt`, else the party's own anchor,
     else null), `author: 'referee'`, `visibility: 'referee'`, empty body. A note: no
     title, no dates, no anchor. Neither commits: the caller does.
     **The clock is a day count and `when` is `{ year, day }`.** Use the one conversion
     the tree already has for a record's `when` (find it; `orbit/clock.ts` has
     `splitDays`). If the campaign code has none and you would have to choose how a day
     count maps to a year and a day, **stop and ask**: that is a calendar rule.
   - `saveEntry(entry)`: sets `mentions` from `mentionsOf(entry.body)`, `updatedAt`, and
     commits with the right `baseRev`; `deleteEntry(id)` and `restoreEntry(id)` as the
     record pair works today (read how a record's delete and its Undo are written and
     follow them).
4. **Tests** (`tests/web/campaign_journal.test.js`, and the store's and commit's tests
   extended): a page with and without `journal`; commit, flush, the applied `rev`; a
   conflict; a failed send restored; the order; the three lookups; session numbers with a
   gap and after a delete; both drafts with and without a clock and a party; `saveEntry`
   deriving mentions; signed out, nothing is held.

## Check

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Do not touch
`workspace/`, `views/`, `orbit/`, `apps/api`, `packages/`. No git. Stop and report, with
the signatures E will call listed in one block.
