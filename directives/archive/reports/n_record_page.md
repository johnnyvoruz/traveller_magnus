# N n_record_page report
Prompt: prompts/n_record_page.md
Status: partial (steps 1, 3 and 4 done; in step 2 the rows are drawn, but clicking one does nothing until the Campaign panel is wired: see Needs from others)

Found: a fresh start. The prompt had no Progress lines, and git showed no changes in the files I own.
Finished: nothing was half-done.
Backed out: nothing.

## What the page does now
- **Mentioned in** (`RecordMentions.vue`): lists the journal entries whose stored `mentions` hold this
  record. It reads `entriesMentioning(id)` from `campaign/journal.ts`, so the order is the journal's
  date order: latest in-fiction date first, undated entries last. Each row is a real link (`href` to
  `?panel=journal&entry=…`, pushed by the router) that shows the entry's icon, title, kind and date
  (or "No date"). The list stops at 20 rows and shows "Show all 24" until pressed. The section is
  hidden when no entry mentions the record. In the browser, clicking "The run to Efate" opened
  `?panel=journal&entry=cj_…0002` on that entry.
- **Visibility (what I found):** the journal list in the workspace filters on nothing. The workspace
  is the referee's own, and no player view of the record page or the journal list exists. The only
  filters on `visibility === 'players'` are in `pack/plan.ts` and `pack/text.ts` (the player pack
  export). To match the journal list, "Mentioned in" lists every entry. If a player view of the
  record page is added later, its filter belongs in `mentionRows` beside the pack's rule.
- **On the timeline** (`RecordTimeline.vue`): shows the record's own rows. It runs the same
  `buildTimeline` (same inputs as `TimelineList.vue`) and keeps the rows whose id is this record
  (`recordTimelineRows`), so nothing is copied. A row shows the date, any end date, the weekday,
  Today, and the place. The section is hidden when the record has no date. **Ship legs are not
  shown,** because the timeline does not list them: `timeline.ts` says in its header that "vessel
  track legs stay off this list". On a ship's page they stay in its Track section, which already
  dates each leg (question 1).
- **The shared look** (step 3; Lane M's "done: shared pieces in base.css" was there): Summary,
  Details, Player notes, Tags, Mentioned in and On the timeline use `.ui-kicker` (kept with
  `.ui-heading` for its spacing). The record's date, its end date and the dates on both new lists
  are in `.ui-date`. The image strip and Connections are `.ui-frame`, with `.ui-frame-label` and
  `.ui-frame-count`. Style and layout only: no stored data or control changed.
- Not restyled: the **Where** heading. `WhereBlock.vue` is also used by the journal entry page and
  the Party tab, and the Party tab restyles that heading (question 2). **Track** (`TrackBlock.vue`)
  and **Character sheet** (`PersonSheet.vue`) are not in my files and keep the old heading.

## Changed files
- apps/web/src/workspace/record_links.ts (new): pure rows for both sections, `MENTIONS_SHOWN = 20`, `shownMentions`, `recordTimelineRows`.
- apps/web/src/workspace/timeline_focus.ts (new): `timelineAt`, the timeline row another page asked to be shown.
- apps/web/src/workspace/RecordMentions.vue (new): "Mentioned in".
- apps/web/src/workspace/RecordTimeline.vue (new): "On the timeline"; a row sets `timelineAt`.
- apps/web/src/workspace/RecordPage.vue: mounts both sections after Connections; kickers on its four headings; frame spacing; header comment.
- apps/web/src/workspace/LinksBlock.vue: the section is a `.ui-frame`; the heading is its label and count.
- apps/web/src/workspace/RecordGallery.vue: the image strip is a `.ui-frame`; the heading is its label and count.
- apps/web/src/workspace/RecordWhen.vue: start and end dates in `.ui-date`, plus one rule so the clock line's `.clock-date b` does not override the date box's font.
- tests/web/record_page_links.test.js (new): order, deleted and undated entries, a title-less note, the 20 cap and Show all, a record's timeline rows with until/Today, no date gives nothing, the page wiring.
- findings/kn_runtime/ (new): my local run (`setup.mjs`, `seed.mjs`, `drive.mjs`, `shoot.mjs`, `top.mjs`, `vite.config.mjs` that builds before/after copies into its own folders). My state is in findings/kn_state (a copy of kf_state). Both are scratch and can be deleted.
- findings/ui_design_shots/kn_record_*: before and after shots at 1600 and 390. `top_*` shows the page from the top. `person_*` and `ship_*` show the new sections (before: the same place on the page). `many_after_1600` shows 20 rows and Show all. `many_all_after_1600` shows all 24. `none_after_390` shows a record with no date and no mentions (no sections). `ship_after_390` shows a 24-leg track.

## Gates
npm test:      1845 pass, 8 fail, none in my files:
  - tests/web/surface_soft_disc.test.js (untracked, Lane L's in-flight disc work): "a caster eclipses the disc", "a fast spin is blurred…", "a large disc gets a sharper globe…", "an unchanged frame paints nothing…", "globes match the dossier sheets", "rings: in front of the planet…", "says it is ready, then answers a watch…", "the disc geometry is the WebGL disc's", "the worker paints tiles for the page", "vanilla: the globe is painted in steps…"
  - tests/web/journal_mention.test.js "two thousand records filter inside one frame": a timing test. It failed under the full parallel run and passed 3 of 3 times alone.
  - An earlier run today failed 6 marketplace tests (store_scroll, store_filters, packages_entry: Lane D's in-flight files). The last run did not fail them.
  - tests/web/record_page_links.test.js: 4 of 4 pass.
npm run check: pass (manifesto: clean)
typecheck:     pass (`npm run typecheck`, and `vue-tsc -b` inside the build)
fourth gate:   `npm run build` pass. Browser on my local Worker (port 5916, own state, dev-admin cookie, headless Edge on CDP 5918): seeded a person mentioned by 4 entries (one undated), a ship with a dated span and a 24-leg track, a person mentioned by 24 notes, and a person with no date and no mentions. 20 rows, then 24 after Show all. Clicking a mention opens its entry. No console errors. My server and browser are stopped.

## Contract published
none

## Needs from others
- **Whoever owns `CampaignPanel.vue` and `TimelineList.vue` today (TimelineList is Lane M's for
  style; the panel is named in no lane file):** two small changes so a row in "On the timeline"
  opens the timeline at that row. Until then, `timelineAt` is set and nothing else happens. The
  timeline is a local `showTimeline` ref in the panel, not an address, so my files cannot open it.
  1. `CampaignPanel.vue`: `import { timelineAt } from './timeline_focus.ts';` and
     `watch(timelineAt, (id) => { if (id) openTimeline(); });`
  2. `TimelineList.vue`, in place of `onMounted(openAtToday)`:
     ```ts
     onMounted(() => {
         const asked = timelineAt.value;
         timelineAt.value = null;
         const at = asked ? flat.value.findIndex((row) => row.id === asked) : -1;
         if (at < 0) { openAtToday(); return; }
         active.value = at;
         void nextTick(() => reveal(asked as string));
     });
     ```
     (`reveal` scrolls to the nearest edge; use `scrollIntoView({ block: 'center' })` if the row
     should sit in the middle, as Today does.) Lane M has uncommitted changes in TimelineList.vue,
     so this needs to be applied on top of M's version.

## Questions for Johnny
1. Should "On the timeline" on a ship's page also list its track legs? **My recommendation: no,
   not now.** The timeline itself leaves legs out on purpose (timeline.ts header), and the ship's
   Track section on the same page already lists every leg with its dates. If you want legs on the
   timeline, add them to `buildTimeline` (one row per leg, id = the vessel's id). The record page
   then shows them with no further change, because it reads the same model.
2. Should the "Where" heading become a kicker on every screen that uses `WhereBlock` (the record
   page, the journal entry and the Party tab)? **My recommendation: yes, once Lane M has moved the
   journal entry to kickers.** It is one class in `WhereBlock.vue`. I left it as is today because
   on the Party tab it would be the only kicker among the old headings ("Ships", "The party").
