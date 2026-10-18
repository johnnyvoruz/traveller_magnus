# Lane E — the Player Pack design note; then handout images when Lane B's field is in

Issued 2026-10-12 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/E.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your step-1 report on handout images is accepted: the entry has no image
field, and Lane B is adding it now (`prompts/b_entry_images.md`).

**Order:** if `directives/reports/b_entry_images.md` (or its copy in `reports/done/`)
exists when you start, do part 2 first, then part 1. If it does not, do part 1, look
again, and do part 2 only if it has arrived; otherwise say in the report that part 2
waits.

## 1. Read-only: a design note for the Player Pack (step 9 of your own order)

`findings/campaign_gap_audit.md` §4 step 9: "Player Pack as a file the referee
downloads… No server for a file built in the browser." The plan is
`directives/campaign_manager_plan.md` §9.1, written for the old local app. Johnny's
rulings that bind: visibility is per record (one switch plus player notes); the
Google developer style for every sentence.

Write `findings/player_pack_design.md`. Change no product code. Answer, from the code
as it is today, naming files and lines:

- **What goes in.** For each stored kind (records of every type, journal entries,
  timeline rows, the party and its ship, characters): the field that marks it
  player-visible today, and what an item with no mark does. The plan says anything
  untagged fails closed: show that the stored data lets that be true, and list every
  kind that has no visibility field at all.
- **Links and mentions.** A player-visible record that mentions or links a
  referee-only one: what the pack shows in its place (the plan: a link is rendered
  only if both ends are visible). Where the mention text itself would leak a name
  (`@` mentions in a body), say so plainly and propose the rule.
- **Images.** The object route serves bytes to the owner only (your own step 1). A
  pack built in the browser can fetch them as the owner and put them in the file.
  Sizes: the worst case for a campaign at the stored limits, and a proposed ceiling.
- **The map.** What a pack needs from the map, if anything, in a first version. The
  old plan's fogged subsector pages belong to the legacy exporter; say what exists in
  the new app and recommend leaving the map out of the first version unless it is
  nearly free.
- **The file.** One self-contained HTML file, or a ZIP of pages: what each costs in
  the browser (is there a ZIP writer in the tree or in `package.json` already? a new
  dependency is Johnny's to approve; name it and its size, install nothing), how the
  reader opens it with no account and no network, and where a player's own notes
  would live.
- **The audit line.** The plan wants a count of what was withheld, with no names, so
  the referee can trust the file. Where it shows.
- **The smallest first version** you would build, the lane that owns each file
  (`workspace/` is Lane D's; say what could live in `workspace/journal/` or a new
  folder of your own), and what it needs from Lane B, if anything.
- **Questions for Johnny**, each written out in full with your recommended answer
  first. Quote the plan or the code for each; state no Traveller rule.

## 2. Handout images (when Lane B's report exists)

Build step 2 of `prompts/e_handout_images.md` exactly as written there (read it; its
owned files, copy rule and browser pass stand), on the field Lane B added, from the
section "Images on a record and on a journal entry" in `directives/api.md`. If that
section or the field is not as your step 1 asked, write what differs and stop that
part.

## Owned files (this pass)

Part 1: `findings/player_pack_design.md` only. Part 2: as in
`prompts/e_handout_images.md`. `directives/reports/e_handout_images_2.md`.

## Gates

Part 1: none (no product code). Part 2: `npm test`, `npm run check`,
`npm run typecheck`, `npm run build`, pasted, and the browser pass the first prompt
names, on your own ports and Vite cache, stopped after.

## Stop rule

Stop when the note is written and part 2 is either done or reported as waiting.

Write `directives/reports/e_handout_images_2.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Added 2026-10-12 21:00 (orchestrator)

Part 1 (the Player Pack note) is accepted; your eight questions are with Johnny.
**Part 2 may start now:** Lane B's report is at `directives/reports/done/b_entry_images.md`.
From it: a patch that leaves `images` out keeps the stored list; send `null` to clear;
an older entry reads as null; thirteen images are refused with "An entry can hold 12
images." Your first report was filed as `reports/done/e_handout_images_2_part1.md`;
write this one as `directives/reports/e_handout_images_2.md`.

## Progress

done: part 1, findings/player_pack_design.md. B's entry-images report was not in at the start. next: look again, then part 2 or a waiting report.
done: looked again. directives/reports/b_entry_images.md is still absent. The schema field and the api.md section are on disk. Part 2 waits for the report. next: the report, then stop.
done: B's report is in. Entry gallery, list avatar, and timeline avatar write images through saveEntry. next: tests and gates.
done: npm run check, typecheck, and build passed. npm test is 1527 pass, 22 skipped, and 1 fail in tests/api/passkeys.test.js (Lane B). next: the browser pass.
done: browser pass on API 127.0.0.1:8852 and Vite localhost:5197. Choose, drop, reload, keyboard lightbox, undo, list and timeline avatars, wrong type, over 8 MB, column, half, full, 520 px. Clock days stayed null. Servers stopped. next: the report.

