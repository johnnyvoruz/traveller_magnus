# Lane E — a date on a record, so records appear on the timeline

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/E.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your timeline report is accepted. Johnny: Referee-only rows stay unmarked on
the timeline until the lists themselves grow a mark (yes, leave it). Lane D changed
one assertion in your `tests/web/toast_shell.test.js` when it swapped the strip's ring
for `design/Spinner.vue`: accepted; nothing for you to do.

## Why

Your report: "Nothing in the screens sets `when` today. A new record is stored with
`when: null`." So the timeline shows journal entries only. Johnny, 2026-10-11: yes,
the record page gets a date field, with an optional end date, so people, places,
events and jobs can appear on the timeline.

## What to build

1. **A date on the record page.** In the page head or its first section (your
   judgement; say why), "Date": empty it reads "No date" with the way to set one; set,
   it shows `DDD-YYYY` in the app's form (`workspace/stardate.ts`). Editing: type a
   date in the form the journal's date control already accepts, or choose "Use the
   campaign date"; match the journal entry's date control in pattern, words and
   states (find it in `workspace/journal/`; reuse the component if it can be reused
   without editing `journal/` files' behaviour). A bad date shows one plain sentence
   at the field. Clear removes the date.
2. **An optional end date**, offered only once a start date is set ("Add an end
   date"): the same control; an end before the start is refused with a sentence. The
   timeline already words an end as "to DDD-YYYY".
3. **It writes `when.start` and `when.end`** through the store's record write, the way
   your visibility switch does (`workspace/records.ts`). Read the record schema in
   `packages/shared` for the exact shape of `when` and write nothing the schema does
   not hold; if the store or the schema cannot take the write, stop and report the
   line (the store is Lane A's, the schema Lane B's).
4. **All nine kinds** get the field; do not decide per kind which may have a date.
5. **Setting a date never moves the campaign clock**, and looking at a record never
   sets a date (K6: looking is not advancing).
6. **The timeline** then shows the record with no change of yours to its code: prove
   it in the browser pass (set a date on a person, a place, an event and a job; all
   four appear in order; clear one, it goes).
7. On the timeline's empty state, the sentence now also names the second way to put
   something there ("…or set a date on a record."), in your own words.

## Copy

Every sentence follows the Google developer documentation style guide.

## Owned files (this pass)

Lent: `apps/web/src/workspace/RecordPage.vue` (the date field), `workspace/records.ts`
(the write). Yours: `workspace/timeline.ts`, `TimelineList.vue`, a new small component
for the date field if that keeps `RecordPage.vue`'s edit small, tests in `tests/web/`,
shots `ke5_*`, `directives/reports/e_record_dates.md`. Not yours: `campaign/` (Lane
A), `packages/` (Lane B), `workspace/build/`, `workspace/market/`, `shell/`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
a browser pass on your own ports and Vite cache, stopped after: set, change and clear
a date by pointer and by keyboard; "Use the campaign date"; an end date, and one
before the start; reload, still set; the four records on the timeline; the campaign
clock unchanged throughout (say its value before and after); column, half, full and
520 px.

## Stop rule

Stop when it works and the report is written, or at a line you need from another lane.

Write `directives/reports/e_record_dates.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: date field on the record head, when written through saveRecord, empty timeline sentence names a record date. next: gates.
done: npm test 1464 tests, 1446 pass, 0 fail, 18 skipped; manifesto clean; typecheck pass; build pass. next: browser pass.
done: browser pass. Clock stayed 100-1105 (day count 403424, rev 1) after it was set. Report directives/reports/e_record_dates.md. next: stop.