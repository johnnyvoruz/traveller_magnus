# Lane D — say what Undo did; the refusal at its field; then density and the allowance

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/D.md`,
`directives/agent_d_brief.md`, then this file. No git but read-only, no deploy, no
`rules/`, no Traveller rule from memory. Your star-numbers report is accepted. Johnny's
answers to its three questions are on the board (Decisions) if he has given them; until
then your first strip wording, the note and the held acts stay as built.

## 1. Undo tells the truth (Lane A's store is ready)

Read `findings/builder_undo_faults.md` and `UndoOutcome` (`{ id, restored, left,
message }`) in `apps/web/src/builder/`. Today `offerUndo` in `acts.ts` ignores what
Undo returns, so a refused or partial Undo looks like a whole one.

- `message` set (an old Undo after a later edit): show the server's sentence; the
  token stays, so the Undo offer stays.
- `message` empty and `left` not: one toast, "Undo put back N systems. M had changed,
  so they were left as they are: <names>." (A's note has the words; make them read
  well for 1 and for many, name hexes the way the pane does, and cap the list with
  "and K more"). The token is spent. Mark the left hexes on the map for as long as
  the toast shows.
- A return with `left` is not a Restore token.
- The same for Undo of a grow act and of Remove, if they go through the same call.

## 2. A refusal at its field

Only when `directives/reports/a_form_followups.md` or its copy in `reports/done/`
exists: show a refused field's sentence at that field (hand designer and system
editor), scroll it into view, focus it; the loose message at the top goes for that
case. If A's report is not there, skip and say so.

## 3. Density on the Generate sheet

Only when B's `b_generate_density` report and A's note say it is on the store's call.
The design is part 2 of `prompts/d_generate_feedback.md`.

## 4. The daily allowance

Only when B's `b_generate_cap` report exists and A's note says the store exposes it.
On the Generate sheet and by the Generate button for many hexes: "N of 100 left
today", quiet while there is plenty, plain when the selection would pass it ("This
selection has 240 empty hexes. You can generate 63 more today."), with the button off
and the reset time in the person's own time zone. An admin sees none of it. A refusal
from the server shows its sentence in the same place. Do not mention pricing or a
premium account.

## Not yours this turn

`apps/web/src/views/MapView.vue`: Lane E has it for one line (the toast strip moves to
the app shell). Do not edit it in this pass.

## Copy

Every sentence follows the Google developer documentation style guide; add new strings
to the design note's table.

## Owned files (this pass)

`apps/web/src/workspace/build/`, `tests/web/build_*.test.js`, your token lines, shots
`kb10_*`, `directives/reports/d_undo_words.md`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted (four of Lane
C's surface tests may be red in flight: name them and go on). Fourth gate: a browser
pass on your own ports and Vite cache, stopped after: the two Undo sequences from A's
report (the refused one-hex Undo, the partial job Undo), by pointer and by keyboard;
each later part that ran; column, half, full, 520 px.

## Stop rule

Stop when part 1 passes, with each later part built if its files were there, and the
report is written.

Write `directives/reports/d_undo_words.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress
