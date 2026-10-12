# Lane A — two Undo faults Lane F reproduced before it stopped

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/A.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your market-types and generate-density reports are accepted.

## What is known

Lane F (a read-only review of Build) ran out of budget before writing its note. All
that is left is three Progress lines and its shots. Its last line: it "reproduced stale
Undo removing a later edit, silent partial bulk Undo and modal focus escape". The
shots that go with the first two:

- `findings/ui_design_shots/kf_18_two_undos.png`, `kf_19_old_undo_drops_edit.png`: an
  Undo offered for an earlier act is used after a later edit to the same hex, and the
  later edit is lost without a word.
- `kf_17_partial_undo.png`: an Undo of a many-hex act takes back only part of it and
  says nothing about the rest.

There are no written steps. Look at the shots first (the Read tool shows images), then
work the steps out yourself.

## Do

1. **Reproduce each** against a local API on your own port and state directory, at the
   store level (a test that drives `apps/web/src/builder/` against the server, or
   against the store's fake if it shows the same thing): for the first, generate or
   edit a hex, keep the Undo token, edit the same hex again and Keep, then use the old
   token; for the second, a many-hex generate where some hexes change before Undo
   (another edit, a second job, a conflict), then Undo. Write down the exact sequence
   that shows each, what the server answered, and what the store told the screen.
2. **Say whose fault each is,** from `directives/contracts/b_builder.md` (the undo
   routes, what a moved rev does): the server takes back more than the token's act,
   the store drops a refusal or a partial answer, or the screen words promise more
   than the act does. Quote the contract line.
3. **Fix what is in `builder/`:** the store must never report an Undo as done when
   only part was taken back, and must hand the screen what was and was not undone
   (counts and hex keys); an old token used after a later edit must either be refused
   with a reason the screen can show, or be withdrawn the moment the later edit is
   kept. Recommend which, build it if it is yours, and write
   `findings/builder_undo_faults.md` for Lanes B and D with the part that is theirs:
   the exact contract change wanted from B, the exact words and state wanted from D.
4. Tests that fail on today's code and pass on yours, for both.

## Also in this pass

- **Density through the store** (the part of `a_generate_density` that waited on B):
  only when `directives/reports/b_generate_density.md` or its copy in `reports/done/`
  exists. Pass the field on the three generate calls, carry the left-empty count, and
  update `findings/builder_density_ready.md`. If B's report is not there, skip and say so.
- **Read B's three codes** (`directives/contracts/b_builder.md`, "Codes the browser
  reads"): `details.code` `field`, `slot_in_use` and `hex_changed` in place of the
  three places the store matches a sentence. The sentences still reach the screen.

## Owned files (this pass)

`apps/web/src/builder/`, `tests/web/builder_*.test.js`, the note,
`directives/reports/a_undo_faults.md`. Not yours: `workspace/`, `packages/`, `apps/api`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
the two reproductions, before and after, with the server's answers pasted; your
server stopped.

## Stop rule

Stop when both are reproduced and what is yours is fixed, or when you have tried the
sequences above and the shots' state does not appear: then say exactly what you ran.

Write `directives/reports/a_undo_faults.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress
done: the shots are an old Undo after a later Keep, and a many-hex Undo that leaves one edited hex. next: reproduce both on a private server, then fix the store.
done: both faults reproduced on a private server. The old store sent the live rev and dropped the job's conflicts. next: the store sends the act rev and returns the report.
done: the store refuses a stale one-hex Undo with the server sentence and reports a partial job Undo. Tests cover both. next: the after-run, the gates, the note, and the report.
done: the after-run matches the contract. Gates are in. Four failing tests are Lane C surface files. next: stop.
