# Agent D — step 3's close, second half

Issued 2026-10-10 by the orchestrator, for when `findings/builder_handle_ready.md` is on
disk (Agent A's note; if it is not there, say so and stop). Common rules:
`directives/swarm_restart.md`, your brief, and `prompts/d_step3_close.md`, which still
binds.

Accepted from your report: the world that orbits two stars, "Design by hand" on Regina
with Restore, Generate on a hand-made system with Undo, no Roll by hand, the "one-way"
words gone. Your two questions, answered with your own recommendations (Johnny may
overrule): **the star-removal ask shows the server's count, not one the screen works
out; "Generate with…" is not offered on a hand-made system until someone asks.**

Agent A's handle now has `add(…)`, a way to take a remove back, and `blank(hexKey)`;
the note has the signatures. Build what was blocked:

1. **Adds and removes wait for Keep** (ruling 1). Nothing is stored when a body is
   added or removed; the per-add and per-remove Undo toasts go; the bar counts them as
   changes; Discard drops them; one Keep, one rev.
2. **Remove a star with what orbits it** (ruling 3). The star is no longer greyed. The
   remove enters the draft, the server's message arrives ("N bodies go with this
   star."), `DesignAsk.vue` shows "All N bodies orbiting this star will also be
   removed"; Cancel takes the remove back and everything returns; confirm leaves it in
   the draft until Keep. The same ask, with its count, when a world with moons is
   removed.
3. **"Blank system" sends no edition.**
4. **The right-click menu** on a hex whose bar has not been shown says "Design by
   hand…" for an instant before the server answers: it shows nothing for that item
   until it knows.
5. **The pane covers the left of the chart** (from Agent A): a hex centred by the
   camera can sit under the dossier pane, because the camera does not inset by the
   pane's width. `MapView.vue` about 1501 and 1875 to 1882: `setWidth` stores the width
   and only the locate flight uses it. Say what the smallest right fix is and whose
   lines it is in; build it only if it is in yours.

## Check

The four gates pasted. The browser passes not yet run, `kb3_close2_*`:
- a hand system: add two stars, three worlds, two moons, name a just-added body, then
  Discard (all gone, server has no new rev); again, and Keep (one rev), reload;
- remove a star that has worlds and a paired star: the ask with the count, Cancel
  (all back), again, confirm, Keep, then Undo;
- blank, with the request body shown to carry no edition;
- the right-click menu on a cold hex;
- signed out: Build offers nothing that saves.

In `dossier/DossierPanel.vue`, `DossierBody.vue` and `views/OrbitView.vue` leave the
surface map's lines alone. Stop and report in the brief's format.

## File bus (added 2026-10-10, replaces "report in chat")

Lane rules: `directives/lanes/D.md`. Nothing is pasted to Johnny any more.
Shared files this prompt allows: `dossier/DossierPanel.vue`, `dossier/DossierBody.vue`, `views/OrbitView.vue`, only the hand designer's and Build's lines; give the line ranges in the report. `findings/builder_handle_ready.md` is on disk (18:59); start only when the board shows A's report accepted.
When finished or blocked, write `directives/reports/d_step3_close_2.md` from
`directives/reports/_TEMPLATE.md` (status, every changed file with one line each
including files outside your lane, the four gates, contract, needs, questions written
out in full with your recommended answer first), then stop. After each meaningful step
append one line under Progress below: "done: X. next: Y."

## Added 2026-10-10 19:50
- Agent A's handle is accepted; start now. Signatures: `findings/builder_handle_ready.md`.
- Server shapes: read `directives/contracts/b_builder.md`, not the older
  `findings/builder_*_ready.md` notes (two lines in those are stale: removing a star of
  a pair cascades, it is not refused; blank needs only `baseRev`).
- Your `select_hexes` report is accepted, including line 136 of `DossierPanel.vue`.
- Do **not** change `grow_acts.ts` in this pass: Lane B is building the one-act route
  and you get a small prompt for it when B's contract section is final.
- Johnny has not yet answered your three questions; they stand as built.

## Progress
- done (2026-10-10, D before this session, setup only, nothing built): findings/builder_handle_ready.md checked against draft.ts. `add(field, id)` is at draft.ts:302, `unset(fieldId)` at :65, `blank(hexKey)` posts `{ baseRev }`. Item 5 (pane inset) was already built under d_select_hexes (MapView `area`, `aim`, `clearPane`; findings §18 item 6), so verify it, don't rebuild it. Code to change: hand_acts.ts:108/117/165 (`keepStay` for add and remove becomes `handle.add` and draft removes; Cancel is `handle.unset('<id>.remove')`); hand.ts `removeWhy`/`removeChanges` (stop greying a star; send only `<id>.remove`, the server cascades); edit.ts:134/381 (`BlankOpener` and `openBlank` drop `edition`); BuildPane.vue:37/165 and commands.ts:137 (`'MgT2E'` goes); BuildBar.vue `hand`/`isHandHex` (the bar's menu waits for the answer; the right-click menu in commands.ts `menuFor` still shows "Design by hand…" until `isHandHex` answers, which is item 4). Tests to update: tests/web/build_hand.test.js (the "stored at once" tests at about 266 and 299). Browser state and scripts: findings/builder_pass_src/ (lib.mjs, lib4.mjs, drive.mjs; cookie.txt and dstate are in the previous session's scratchpad, see findings §17 "How I tested"). next: the build, items 1 to 4.
- note: the local test state (wrangler dstate with the dev-admin session, cookie.txt) is at C:\Users\johnn\AppData\Local\Temp\claude\D--webstorm-traveller-magnus\6ae123d8-6eed-49df-807b-445daff3397d\scratchpad\ (copy dstate and cookie.txt to your own scratchpad; universe 01M479EYFA4HVP9MGPFNFS4DSH, hand system Hollow Reach Two 0312, empty slot (-6,-4) beside it). next: the build, items 1 to 4.
- done: built items 1 to 4 (adds and removes wait for Keep, the remove ask with the server's count, Blank sends no edition, menus wait for the mode); type-check clean. next: tests, gates, browser pass.
- done: tests rewritten (build_hand 21 pass, build_editor), npm test 1297 pass, typecheck and build pass; check fails on workspace/journal/JournalBody.vue (lane E's, not mine, left alone). next: browser pass kb3_close2_*.
- done: browser pass run (kb3_close2_*), servers stopped, report written to reports/d_step3_close_2.md. next: stop; check gate red only on lane E's JournalBody.vue.
