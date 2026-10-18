# Agent E — audit: what of the Campaign is live, and what is left

Issued 2026-10-10 by the orchestrator. Common rules: `directives/swarm_restart.md`.
Your colour audit is accepted. This is another read-only pass: you change no file but
your findings note. Johnny has said the Campaign is the next focus after the push now
being prepared, and he needs the list of what is left before he picks an order.

Read `directives/campaign_manager_plan.md` (all of it, it is long), `slice_2_campaign.md`,
`character_mvp.md`, `plan.md` section "After 5", and the tree: `apps/web/src/campaign/`,
`workspace/`, `workspace/journal/`, `characters/`, `apps/api/src` for the campaign,
journal and character routes. The live site is commit `3d28e33`; say where something
is on disk and unpushed.

Write `findings/campaign_gap_audit.md`:

1. **Every feature the plans name for the Campaign, one line each**, grouped as the plan
   groups them (party, ships and ship sheet, navigation and the nav console, calendar
   and time, journal, characters, records and the workspace, sharing and players,
   import and export, the delighters). For each: live / on disk unpushed / part built
   (say what is missing) / not started / dropped by a ruling (cite the handoff section
   or the plan line). Cite the plan section for each.
2. **Johnny's own backlog items**, with what each would need before it can be built: a
   party with more than one ship (`settings.party.vesselId` is one vessel today: list
   every place that assumes one); the flight log; the timeline; portraits; the journal's
   second pass (`prompts/e_journal_build_2.md`); the Player Edition; the 3D dice roller;
   the ship's own numbers; anything else the plans call "later".
3. **What needs a rule or a decision from Johnny before any design**, each as one
   question written out in full with what it blocks. No Traveller rule from memory.
4. **Your proposed order**, smallest shippable steps first, each with which agent's lane
   it falls in (A: `campaign/`, `characters/*.ts`, orbit; B: `apps/api`; D: `workspace/`;
   E: `workspace/journal/`, `characters/screens/`) and whether it needs the server.

Nothing is built or fixed in this pass. Stop and report with the counts per status.

## File bus (added 2026-10-10, replaces "report in chat")

Lane rules: `directives/lanes/E.md`. Nothing is pasted to Johnny any more.
Read-only: the one file you write besides the report is `findings/campaign_gap_audit.md`.
When finished or blocked, write `directives/reports/e_campaign_gap_audit.md` from
`directives/reports/_TEMPLATE.md` (status, every changed file with one line each
including files outside your lane, the four gates, contract, needs, questions written
out in full with your recommended answer first), then stop. After each meaningful step
append one line under Progress below: "done: X. next: Y."

## Progress

done: read the plans and the live tree against 3d28e33. next: write the gap list.
done: wrote findings/campaign_gap_audit.md (26 live, 4 part built, 37 not started, 5 dropped, 0 on disk unpushed). next: write the bus report and stop.
