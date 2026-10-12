# Lane E — the Campaign timeline, as a list

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/E.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your toast-shell report is accepted; Lane D lifts the spinner to `design/` and
swaps it into the strip (Johnny: yes).

## Goal

Step 3 of your own Campaign order (`findings/campaign_gap_audit.md` §4, approved by
Johnny): "Timeline as a list, not a ribbon." Dated journal entries and dated records
in one list in date order; choosing a row opens it and focuses its place. No new
server, no new rule. The ribbon, re-dating by dragging, seasons and print are later
and are not in this pass.

## Read first

Your audit's lines on the timeline (§1 "Calendar and time", §2 "The timeline"), the
plans it cites (`directives/campaign_manager_plan.md` §7.1 to §7.3 and K8 in the
handoff's Campaign sections: quote the lines you build from in the report),
`apps/web/src/campaign/journal.ts` (the date order already defined there),
`workspace/stardate.ts` (how a date is shown), and how the Campaign pane lists and
opens things today (`CampaignPanel.vue`, `CampaignList.vue`, the crumb you built).

## What to build

1. **A Timeline view in the Campaign pane**, reached the way the pane's other lists
   are, with a crumb back. One list, newest or oldest first as the plan says (say
   which line decides; if it is silent, oldest first with a control to flip, and put
   the question in the report).
2. **Rows:** every journal entry with a date and every record with a date field the
   store already holds (list which record kinds carry which date; do not add a date
   field). Each row: the date in the app's `DDD-YYYY` form, the avatar (your
   `RecordAvatar`), the title, the kind, and the place if it has one. Rows on the same
   day group under one date heading. The campaign's current date is marked in the list
   ("Today"), and the list opens scrolled to it.
3. **Choosing a row** opens the entry or record in the pane and uses the existing
   locator to show its place on the map, exactly as choosing it from its own list
   does. Keyboard: the list is one tab stop, arrows move, Enter opens.
4. **Visibility:** the referee sees everything; a row whose record is "Referee" only
   shows the same quiet mark the lists use. No player view in this pass.
5. **Empty and long:** an empty campaign shows one plain sentence and the way to add
   the first dated thing; a campaign with 2,000 dated rows scrolls smoothly (render
   only what is near the view if a plain list does not: measure first, say the frame
   time).
6. Nothing writes: this is a reading view. Looking at a date does not move the
   campaign clock (K6).

## Copy

Every sentence follows the Google developer documentation style guide.

## Owned files (this pass)

New files in `apps/web/src/workspace/` for the view (name them), the one line each in
`CampaignPanel.vue` and the pane's list or menu that links to it (lent; name the
lines), your crumb files, tests in `tests/web/`, your token lines, shots `ke4_*`,
`directives/reports/e_timeline_list.md`. Not yours: `campaign/` (Lane A: if the store
lacks a read you need, stop and report the line), `workspace/build/`,
`workspace/market/`, `shell/`, `apps/api`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
a browser pass on your own ports and Vite cache, stopped after: a campaign with dated
entries and records across several years; open the timeline, scroll, choose a row by
pointer and by keyboard (the place is shown), back by the crumb; empty campaign; the
long list; column, half, full, 520 px.

## Stop rule

Stop when it works and the report is written, or at a line you need from `campaign/`.

Write `directives/reports/e_timeline_list.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: Timeline list in the Campaign pane, newest first, with a crumb back to Campaign. next: gates, then the browser pass.
done: gates green, and the browser pass on ports 8896 and 5236. next: the report.
done: report directives/reports/e_timeline_list.md. next: stop.
