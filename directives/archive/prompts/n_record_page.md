# Lane N — the record page: "Mentioned in", and the shared look

Issued 2026-10-17 by the orchestrator, for today only. You may be a fresh session with no memory.
Read `CLAUDE.md`, `directives/manifesto.md` (Connected: "If two things are related, the relation shows
on both pages"), `directives/design_reference.md`, `directives/board.md`, `directives/lanes/N.md`,
then this file. No git but read-only, no deploy, no `rules/`.

## Today
- A journal entry stores the records and hexes it mentions (`mentions`, from `mentionsOf` in
  `packages/shared/src/schemas/campaign.ts` 357). The entry links to them.
- The record page doesn't show the entries that mention it, nor its dated moments on the timeline
  (`findings/campaign_gap_audit.md`: "On the timeline and mentions on the record page — not started").

## Do
1. **"Mentioned in"** on the record page: the journal entries whose `mentions` hold this record's id,
   newest first, each a link to the entry with its title and date; hidden when there are none.
   A player-visible record lists only entries a player could see when the page is in a player view
   (follow the visibility the journal list already applies; say what you found).
2. **"On the timeline"**: the record's own dated items as the timeline shows them (the record's
   `when`, the legs of a ship's track if it is a ship), each a link that opens the timeline at that
   row. Read how `TimelineList.vue` builds its rows and reuse that, don't copy it.
3. **The page in the shared look,** after Lane M's Progress line "done: shared pieces in base.css"
   appears in `prompts/m_video_look.md` (do 1 and 2 first): section kickers (`.ui-kicker`), dates in
   `.ui-date`, the gallery and the links block in `.ui-frame`. Style and layout only; no change to
   stored data or controls' behaviour. If M's line isn't there when you get to this step, finish 1
   and 2, report, and say so.
4. Every state: no mentions, many (cap the list at 20 with "Show all"), a record with no date, a ship
   with a long track, 390 px.

## Gates
- `npm test`, `npm run check`, the typecheck and `npm run build`.
- Browser on a local build with a campaign whose journal mentions a person and a ship: shots
  `findings/ui_design_shots/kn_record_*` at 1600 and 390, before and after.

## Report
Write `directives/reports/n_record_page.md` from the template.

**Owned:** `workspace/RecordPage.vue` and its child blocks (`RecordWhen.vue`, `RecordGallery.vue`,
`LinksBlock.vue`, `WhereBlock.vue`); new files under `workspace/` for the two sections; read-only on
`workspace/journal/` (Lane M styles it today) and `TimelineList.vue`; tests under `tests/web/`; your
shots and report.

After each meaningful step, append one line under Progress: "done: X. next: Y."

## Progress
done: "Mentioned in" (RecordMentions.vue) and "On the timeline" (RecordTimeline.vue) on the record page, pure rows in record_links.ts, timelineAt hand-off in timeline_focus.ts. next: tests, gates.
done: tests (tests/web/record_page_links.test.js), gates, before/after shots kn_record_* on a local build at 5916. next: step 3 waits for M's "done: shared pieces in base.css" (not there); report.
done: step 3 (M's line was there): kickers, .ui-date, gallery and links in .ui-frame; after shots retaken; gates. next: report.
