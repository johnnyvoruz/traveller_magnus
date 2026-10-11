# Lane E — who can see a record, player notes, and the menu's file control

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/E.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your packages-entry report is accepted: the two routes, the menu item, and the
client staying opened in `workspace/market/market.ts` (no second opener).

## Goal

Steps 1 and 2 of your own Campaign order (`findings/campaign_gap_audit.md` §4, approved
by Johnny), plus the one fault your last report found.

## What to build

1. **Record visibility on the record page.** The record already stores `visibility`;
   nothing on the record page writes it. One control in the page head that shows who
   can see the record and changes it, written the way the journal entry already
   writes its own (find that control in `workspace/journal/` and match its pattern,
   words and states). Johnny's ruling: visibility is per record, one switch, not per
   section. It saves through the store's existing record write; no new server call.
   Undo follows whatever the page's other edits do.
2. **Player notes on the record page.** `playerNotes` is on the record and is always
   null. One section, "Player notes", under the referee's text: empty it shows one
   plain sentence and the way to add; it edits in place like the page's other text.
   Say in the page, in one short line, what the section is for (the text players see
   when a record is shared). No Player Pack, no export, no link: those are later.
3. **The account menu's file control.** Your shot `km2_menu.png` shows the native
   "Choose File" control in the menu: the import input uses the class `vplan-file`,
   which is styled only in `VesselPlan.vue`. Hide it the way `VesselPlan.vue` does,
   with a rule that lives where the menu can use it (name the file); the Import item
   keeps opening the picker by pointer and by keyboard.

## Copy

Every sentence follows the Google developer documentation style guide: sentence case,
second person, present tense, the next step named. Use the journal's existing words
for the visibility values; do not invent a second vocabulary.

## Owned files (this pass)

Lent for this pass: `apps/web/src/workspace/RecordPage.vue` (the head control and the
one section), `apps/web/src/workspace/AccountMenu.vue` (the file input's class or rule
only). Yours: a new component or two beside them if that keeps the edits small, tests
in `tests/web/`, your token lines in `design/tokens.css`, shots `ke_*`,
`directives/reports/e_record_visibility.md`. Not yours: `campaign/` (Lane A; if the
store has no write for either field, stop and report the line), `workspace/build/` and
`workspace/market/` (Lane D), `apps/api`, `packages/`, the three shared files.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
a browser pass on your own API port and state directory and your own Vite, both
stopped after: change a record's visibility by pointer and by keyboard, reload, still
set; write player notes, reload, still there; clear them; the account menu with no
native file control and Import still working; a person record and a place record; the
pane's column, half and full widths and 520 px.

## Stop rule

Stop when the three items work and the report is written, or blocked on a line in
another lane's file, named.

Write `directives/reports/e_record_visibility.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress
