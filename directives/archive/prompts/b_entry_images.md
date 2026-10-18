# Lane B — images on a journal entry (small; Lane E is waiting on it)

Issued 2026-10-12 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/B.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your daily-cap report is accepted and goes out in version 1.1.8. Your passkey
design note is with Johnny: **install nothing and build no passkey route until the
board records his answer.** After this prompt, do `prompts/b_generate_speed.md`.

## Goal

Lane E's handout images (Campaign step 6) stopped at its step 1: a journal entry has
nowhere to hold an image. Read `directives/reports/done/e_handout_images.md`; it names
every line. Add the field. No new upload route: the object route already keys by
universe and hash.

## Build

1. `packages/shared/src/schemas/campaign.ts`: `images` on `CampaignEntryObject`, the
   same shape as `CampaignRecord.images`:
   `z.array(CampaignImage).max(CAMPAIGN_LIMITS.images).nullable()`. It must be accepted
   by `CampaignEntry` and by the full `EntryChange`. Say what a patch that omits the
   field does (it must leave stored images alone) and what a stored entry written
   before this change parses as (null, without failing the strict object).
2. `apps/api/src/universe/campaign.ts`: an `images TEXT` column on `campaign_journal`
   for a new universe, and for a universe that already has the table (the table is
   made with `CREATE TABLE IF NOT EXISTS`, so add the column in the way the object
   already adds a column to an existing table; if it has none, say what you chose and
   show a test over an old table). `entryFrom` reads it; insert and full update write
   `jsonText(change.images)`, as `campaign_records` does. Existing rows read as null.
3. Import and export of a campaign document: an entry's images survive a round trip;
   a document from before this change still imports.
4. The contract: where a record's images are described today there is no
   `contracts/b_*.md`; add a short section "Images on a record and on a journal entry"
   to `directives/api.md` beside the two object rows (the field, the limit of 12, who
   may read the bytes: the owner only). Lane E builds from that section.

## Owned files (this pass)

`packages/shared/`, `apps/api/src/universe/campaign.ts`, your tests in `tests/api/` and
`tests/shared/`, `directives/api.md` (that section),
`directives/reports/b_entry_images.md`. Not yours: `apps/web/`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build` (the web build must
still pass with the schema change), pasted. Fourth gate: `RUN_API_TESTS=1` on your own
ports, server stopped after: an entry saved with two images reads back with them; a
patch that omits `images` keeps them; `images: null` clears them; thirteen are
refused with a plain sentence; an entry in a universe whose table predates the column
reads as null and can then be saved with an image.

## Stop rule

Stop when the gates pass and the report is written. Then start
`prompts/b_generate_speed.md` in the same session if you have room; if not, say so in
the report.

Write `directives/reports/b_entry_images.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: images on the journal schema, the column for an old table, and the omit-or-clear write. next: the unit tests.
done: unit tests, the worker gate, and the web build. next: the report.
done: wrote directives/reports/b_entry_images.md. next: prompts/b_generate_speed.md.

