# Lane E — build the Player Pack, first version

Issued 2026-10-12 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/E.md`,
`findings/player_pack_design.md` (your own design note, accepted), then this file. No
git but read-only, no deploy, no `rules/`, no Traveller rule from memory. Finish
`prompts/e_handout_images_2.md` first if it has no part-2 report yet.

## Johnny's answers (2026-10-12): yes to all eight, as you recommended

1. A mention of a referee-only record becomes the words "a record"; the stored label
   is ignored; it is counted. Ordinary prose stays as written.
2. A hex mention shows the label written in the token, or the hex key when there is
   none; the world's current name is never looked up.
3. A link shows when both records are player-visible: the connection and its kind,
   without role or notes, counted as withheld text. No per-link switch yet.
4. One HTML file. No ZIP, no new package.
5. No map in the first version. A record's hex is shown as text.
6. No images in the first version.
7. A party member or the ship is listed only when that record is for players. The
   cutoff is the campaign clock's day, shown in the file. No Characters API; a
   person's `sheet` only as part of an included person record.
8. A notes box with "Download my notes" as the copy that counts; browser storage is a
   convenience only. No import of those notes yet.

## Build

Your note's "Smallest first version", exactly:

- `apps/web/src/pack/` (new, yours): the selection, the redaction, the counts, the
  HTML string. Pure functions over the loaded campaign; it reads the store and writes
  nothing.
- **Fails closed.** Anything without a `players` mark is left out. A kind with no
  visibility field is left out unless an answer above names how it gets in. A test
  builds a campaign in which every referee-only string is a unique marker and asserts
  that none of them appears anywhere in the file's bytes (names, notes, link roles,
  mention labels, titles, alt text, ids that carry a name). This test is the gate.
- The first page: the campaign's name, the clock day or "no date", and the audit:
  counts of what was withheld, by kind, no names.
- One self-contained file: inline styles and script, no network request, no account,
  opens from disk in a browser. The styles follow the app's look closely enough to
  feel like the same product; colours come from the tokens at build time (no hex
  colour outside `tokens.css`: the checker stays clean).
- The file name: `<campaign name> - Player Pack - <clock day or date>.html`, made
  safe for a file system.
- "Download the Player Pack" on `JournalList.vue` (yours). Before the download, one
  short confirmation in the house pattern (no native dialog) that states the counts:
  "N records, N entries. N items are left out because they are not marked for
  players." Then the file.
- Size: say the file size for a campaign at ten times your test fixture, and the
  build time.

## Copy

Every sentence in the app and in the file follows the Google developer documentation
style guide.

## Owned files (this pass)

`apps/web/src/pack/`, `apps/web/src/workspace/journal/` (the button; `body.ts` reused
as your note says, its journal behaviour unchanged), `tests/web/player_pack.test.js`,
shots `ke7_*`, `directives/reports/e_player_pack.md`. Not yours: other `workspace/`
screens (Lane D), `campaign/` (Lane A), `packages/`, `apps/api` (Lane B).

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted (the pack
code loads only when the button is used: paste the chunk sizes). Fourth gate: a
browser pass on your own ports and Vite cache, stopped after: a campaign with records
of every kind in both visibilities, linked and mentioned across the line; download;
open the file from disk in a fresh profile with the network off; read it for anything
referee-only; type a note, download it; the file at phone width and at desktop width.

## Stop rule

Stop when the leak test and the gates pass and the report is written. If a stored
kind turns out to carry referee text the note did not list, leave that kind out, say
so, and finish.

Write `directives/reports/e_player_pack.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

