# E record dates report
Prompt: prompts/e_record_dates.md
Status: done

found: Progress empty. The record page has no date field. A new record is stored with when: null. The timeline already draws a record once when is set.
finished: nothing from a previous session on this prompt.
backed out: nothing.

## Changed files
- apps/web/src/workspace/RecordWhen.vue: the date field. Empty reads "No date" and "Set a date". Set, it shows DDD-YYYY and the weekday. Click, type, Enter, or blur, as on a journal entry. An empty field clears. A bad date stays, with one sentence. "Use the campaign date" copies the clock's day onto the record. "Add an end date" appears only after a start. An end before the start is refused and not written.
- apps/web/src/workspace/record_when.ts: parses the start and the end, and compares two dates by year and day. It does not read or write the clock.
- apps/web/src/workspace/RecordPage.vue: the field sits in the page head, under the type line. The date is how the record is found on the timeline, so it stays with the name. Every kind gets it. Saving goes through saveRecord, and only from the field.
- apps/web/src/workspace/records.ts: a record patch can carry when. The same start and end count as no change. Null clears the date.
- apps/web/src/workspace/TimelineList.vue: the empty sentence also names setting a date on a record. The Journal button is unchanged. No change to how rows are grouped.
- tests/web/record_when.test.js: typed dates, the end-before-start refusal, the clock copy, and saveRecord leaving the clock where it was.
- tests/web/workspace_records.test.js: a new record still has when null, and a when patch is compared by day.
- tests/web/record_visibility.test.js: the rendered page shows "No date" for a person and a place, and both days for a dated event.
- tests/web/timeline_list.test.js: the empty sentence names a record date.
- findings/ui_design_shots/ke5_*.png: the browser pass.

## Gates
npm test:      pass (1464 tests, 1446 pass, 0 fail, 18 skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass (tsc --noEmit -p apps/api, and vue-tsc -b during the build)
fourth gate:   pass

Browser, own ports, fresh Vite cache, servers stopped after. Pointer: set 040-1105, change to 050-1105, clear. Keyboard: set 060-1105, clear. "Use the campaign date" wrote 100-1105. End 120-1105. An end of 090-1105 showed "Choose an end date on or after the start date." and left the end at 120-1105. Reload still showed 100-1105 to 120-1105. Person, event, job, and place appeared newest first (010-1106, 200-1105, 100-1105, 080-1105). Clearing the place removed it. Column, half, full, and 520 px.

The new campaign had no date (null). The campaign date was set once, through its own control, to 100-1105 so the record field had a day to copy. Day count 403424, revision 1. After every record-date action, the reload, and the timeline pass, it was still 100-1105, day count 403424, revision 1.

## Contract published
none

## Needs from others
none

## Questions for Johnny
none
