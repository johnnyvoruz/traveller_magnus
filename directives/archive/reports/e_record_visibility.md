# E record visibility report
Prompt: prompts/e_record_visibility.md
Status: done

Found the visibility switch, the player notes section, and the menu's file rule already written, with the store patch and its test. Tests and the gates had not been run.
Finished the page test, the four command gates, and the browser pass.
Backed out nothing.

## Changed files
- apps/web/src/workspace/RecordPage.vue: Referee and Players in the page head, in the journal's words, and a Player notes section under Details.
- apps/web/src/workspace/records.ts: a record write may set visibility and playerNotes.
- apps/web/src/workspace/AccountMenu.vue: the same `.vplan-file` rule VesselPlan.vue uses, so the native file control stays hidden.
- tests/web/workspace_records.test.js: an unchanged visibility or note sends nothing, and a change is stored.
- tests/web/record_visibility.test.js: a person and a place render the switch and the empty notes, and the menu carries the shipyard rule.

## Gates
npm test:      fail. 1389 pass, 1 fail, 16 skipped. The failure is tests/web/surface_service.test.js, "the page path paints when workers are unavailable": `sheet.longestChunkMs < 50` was false. Not a file this prompt owns.
npm run check: pass (manifesto: clean)
typecheck:     pass
fourth gate:   pass. `npm run build` passed (vue-tsc and vite). Browser pass on 127.0.0.1:8847 (persist `.tmp/e-visibility-state`) and Vite on 127.0.0.1:5195, both stopped after. A person: Players by pointer and by the arrow keys, each save 200, still Players after reload. Player notes "Bring the letter." survived reload, then clearing them survived reload. A place: Players by pointer, square avatar. The file input is 1px by 1px at opacity 0, the menu text has no "Choose File", and Import opens the picker by Enter and by pointer (a file that is not JSON shows "The file is not JSON."). Column card 520px wide, half 676, full 1352, and at a 520px window the card is 432 because the rail remains. No console error. Shots: `findings/ui_design_shots/ke_menu.png`, `ke_person.png`, `ke_notes.png`, `ke_place.png`, `ke_column.png`, `ke_half.png`, `ke_full.png`, `ke_520.png`.

## Contract published
none

## Needs from others
- Lane C: `tests/web/surface_service.test.js` fails `sheet.longestChunkMs < 50` on "the page path paints when workers are unavailable". Not edited here.

## Questions for Johnny
none
