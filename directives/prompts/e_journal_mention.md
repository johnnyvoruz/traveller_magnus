# Lane E — `@` to insert a mention in a journal entry

Issued 2026-10-10 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/E.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your campaign audit is accepted and Johnny approved its order; this is step 4
of it, the one step in your own folder that needs no server and no ruling.

## Goal

While writing a journal entry, typing `@` opens a small list of the campaign's records
(people, places, ships, whatever the entry can already mention); choosing one inserts
the mention token the journal already stores. Nothing new is stored: on save,
`mentionsOf` in `apps/web/src/campaign/journal.ts` already extracts mentions from the
body. This pass adds the way to type one.

## Owned files (this pass)

- `apps/web/src/workspace/journal/` (`EntryPage.vue`, `JournalBody.vue`, `body.ts`, and
  new files beside them, for example `mention.ts` for the pure logic and
  `MentionList.vue` for the list)
- `tests/web/journal_mention.test.js` (new)
- `apps/web/src/design/tokens.css`: appended token lines only, if one is truly missing
- `directives/reports/e_journal_mention.md`

Read, never edit: `apps/web/src/campaign/` (Lane A's; `journal.ts` for the exact token
format `mentionsOf` parses and for how records are listed and searched), the rest of
`workspace/` (Lane D's), `apps/api`, the three shared files. If the token format cannot
be produced from what `campaign/` exports today, stop: write a blocked report naming
the export you need from Lane A. Do not add it yourself.

## Contract to read

None published for this. The interface is `apps/web/src/campaign/journal.ts` as it
stands on disk (`mentionsOf` and the record lookup it uses). Quote in your report the
exact token text you insert and the line of `mentionsOf` that parses it.

## What must be true

1. `@` at the start of a word opens the list at the caret; `@` inside a word (an email
   address) does not. Typing narrows it; Up, Down, Enter and Tab choose; Escape closes
   and leaves the typed text; clicking away closes.
2. Choosing inserts the token and one space, the caret after it; Backspace straight
   after removes the whole token, not one character of it.
3. The saved entry lists that record under its stored mentions (`EntryPage.vue` already
   shows them) with no change to what is sent to the server.
4. The list is the app's one existing popover or list pattern (manifesto: one way to do
   each thing; look in `apps/web/src/shell/` and `design/` before making anything). No
   second popover implementation, no native dialog, no colour or duration literal.
5. Many records: the list shows at most a screenful, filters as you type without a
   frame at or over 50 ms on 2,000 records (pure function, tested).
6. Keyboard only and screen reader: the list is announced, the active row is exposed
   (`aria-activedescendant` or the pattern the existing list uses).
7. No records yet: `@` says so in one line and offers nothing that creates a record.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
a browser pass on your own API port and state directory and your own Vite, both
stopped after: type `@`, narrow, choose, save, reload, the mention is listed; shots
`findings/ui_design_shots/kj_mention_open.png`, `_chosen.png`, `_saved.png`, at column
and at 520 px.

## Stop rule

Stop when the seven points hold, the gates pass and the report is written. Stop early
with a blocked report if any point needs an edit outside the owned files. Build only
the `@` insert: not the Mentioned rail, not handout images, not Promote to job.

Write `directives/reports/e_journal_mention.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: token format is [[cr_<uuid>|label]], parsed by mentionsOf in packages/shared (called from campaign/journal.ts on save). next: pure mention logic and the list.
done: mention.ts, MentionList, JournalBody insert and backspace, EntryPage records, journal_mention tests. next: caret placement and browser shots.
done: the list sits under the caret. Shots are in findings/ui_design_shots. next: the report.
