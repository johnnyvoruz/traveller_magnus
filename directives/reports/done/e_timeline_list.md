# E timeline list report

found: Progress empty. No timeline view. CampaignPanel, crumb, journal date order, and stardate were already in the tree from earlier campaign work.
finished: the timeline as a list in the Campaign pane, newest first, with a crumb back to Campaign.
backed out: nothing.

Prompt: prompts/e_timeline_list.md
Status: done

Built from these lines:

- `findings/campaign_gap_audit.md` §1: "Timeline: dated records and journal entries in one list, ribbon, choosing a row focuses the place — not started. K8; §7.1–7.3."
- `findings/campaign_gap_audit.md` §4 item 3: "Timeline as a list, not a ribbon. Rows from journal dates and dated records A already stores. Choosing a row uses the locator. No new server. No new rule."
- `directives/campaign_manager_plan.md` §7.3: "Grouped by year then day, newest first, with the Now marker; the same keyboard as lists."
- `directives/slice_2_campaign.md` K8: "Dated records and journal entries in one list; choosing a row focuses its place."
- `directives/slice_2_campaign.md` K6: "Looking is not advancing. Scrubbing time in the orbit view never changes the campaign date."
- `directives/handoff.md` on K7c: "the list's order (newest by `updatedAt`; today's order kept as `entriesByDate` for K8)".

§7.3 decides the order. The list is newest first. There is no flip control.

## Changed files

- `apps/web/src/workspace/timeline.ts`: groups dated journal entries and dated records by year, then day, newest first. Marks Today from the campaign clock. Writes nothing.
- `apps/web/src/workspace/TimelineList.vue`: the list. One tab stop. Arrows move. Enter opens. A pointer click opens. Opening locates the place the row already has.
- `apps/web/src/workspace/crumb.ts`: a timeline trail, Campaign then Timeline.
- `apps/web/src/workspace/CampaignPanel.vue` line 432: the Timeline control beside the tabs. The view replaces the record list while it is open. Escape and the Campaign crumb return to the records list.
- `apps/web/src/workspace/CampaignList.vue` line 229: Timeline in the record list's tool row.
- `apps/web/src/workspace/journal/list.ts`: `entryIcon`, the icon the journal rows already use.
- `apps/web/src/workspace/RecordAvatar.vue`: an optional icon so a journal row can use that icon inside the avatar.
- `tests/web/timeline_list.test.js`: order, grouping, the nine record kinds, Today, the crumb, and the read-only list.
- Shots: `findings/ui_design_shots/ke4_empty_column.png`, `ke4_years_column.png`, `ke4_years_half.png`, `ke4_years_full.png`, `ke4_narrow_520.png`, `ke4_place_pointer.png`, `ke4_place_keyboard.png`, `ke4_long.png`.

## What a row is

A journal entry with `when` set. All four kinds use that one field: session, note, handout, rumor. Undated entries stay off the list. The order function is `entriesByDate` in `campaign/journal.ts`.

A record with `when` set. All nine kinds use `when.start`: person, place, business, organization, job, event, item, note, vessel. A different `when.end` is the words "to DDD-YYYY" on that same row. The row stays under the start day. No date field was added. Nothing in the screens sets `when` today. A new record is stored with `when: null`, so it appears after something else sets that field.

Left off this list, and named so the ribbon can pick them up later: a link's `since` and `until`, and a vessel track leg's `departs` and `arrives`. Those are dates the store holds. They are not a journal entry and they are not a record's `when`.

Each row shows DDD-YYYY, the avatar, the title, the kind, and the place when the row has one. Rows that share a start day sit under one date heading. The campaign clock's day is marked Today, and the list opens scrolled to it. With no clock, there is no Today heading. Opening the list does not call `setCampaignDate`. In the browser pass the clock day count stayed 403789 (`100-1106`) from before the scrolling and the choosing.

## Choosing a row

The list is one tab stop (`tabindex="0"` on the listbox). Arrow keys move the active row. Enter opens it. A click opens it. Opening uses the same pane address as the record list or the journal list (`go` / `goEntry`) and `startLocate` with the hex the row already resolves to. The browser pass opened Regina berth with the pointer and Beowulf with the keyboard. Both located `Spinward_Marches/1910`, and the place line was on the map. The Campaign crumb returned to the record list.

The timeline is not its own address. `shell/pane.ts` is unchanged. Browser Back is the record list's Back, not a timeline URL.

## Visibility

The referee sees every dated row. `CampaignList.vue` and `JournalList.vue` do not mark a Referee-only row. The timeline does not add a mark of its own. Voss was referee-only in the pass and sat in the list like the other rows.

## Empty and long

An empty campaign says: "This campaign has no dated entries or records yet. Add a session in the Journal to put the first one here." The button is "Open the Journal". A session there takes the campaign date. The timeline does not create the session.

A plain list of 2,005 dated rows scrolled without a windowing pass. Twelve scroll frames measured 13, 14, 23, 27, 28, 29, 30, 30, 30, 32, 35, and 36 ms. The median was 30 ms and the longest was 36 ms. Painting the rows after they were added took 278 ms. The plain list stays.

## Gates

npm test:      pass (1455 tests, 1438 pass, 0 fail, 17 skipped)
npm run check: pass
typecheck:     pass
npm run build: pass
fourth gate:   pass. Own ports 8896 and 5236, Vite cache `.tmp/e-timeline-vite`. Empty campaign, dated rows across 1104–1107, scroll, pointer and keyboard (the place shown), crumb back, the long list, column, half, full, and 520 px. Servers stopped.

## Contract published

none

## Needs from others

none

## Questions for Johnny

1. The record list and the journal list do not mark a Referee-only row, so the timeline shows those rows with the others and adds no mark. Recommended answer: leave it. When those lists grow one quiet mark, the timeline uses that mark.
