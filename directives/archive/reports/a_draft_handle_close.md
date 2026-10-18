# A draft handle close report
Prompt: prompts/a_draft_handle_close.md
Status: done

## Changed files
- apps/web/src/builder/draft.ts: DraftHandle.add(field: 'star.add' | 'body.add', id: string) and unset(fieldId: string) at lines 63–65. blank(hexKey: string) at lines 77 and 92. add appends at 302. unset drops one pending change at 309, including a remove whose field has left the form. set accepts <id> and <id>.* after that add. keepMine keeps every star.add, body.add, and field of those ids, and does not put them on dropped.
- apps/web/src/builder/store.ts: Builder.blank(hexKey: string) at line 167. The post body is { baseRev } only (blankBody, blank at 813). BlankStar is gone.
- apps/web/src/builder/index.ts line 6: exports BlankOpened, DraftHandle, DroppedField. BlankStar is not exported.
- apps/web/src/dossier/model.ts: sectorPlace at line 804. header.place uses it at line 845. Empty sector or subsector means no dash. This file is outside the old lane list; the prompt named it, and lanes/A.md now lists dossier/model.ts.
- apps/web/src/views/MapView.vue line 1114: setDraftOpener(openDraft, (hexKey) => blank(hexKey)). This is D's file. The line was 1080 before D edited the view. Not edited this pass.
- apps/web/src/views/OrbitView.vue lines 256–259: place is header.place, with the slug as fallback. The old trailing " - " trim is gone. Shared file. Not edited this pass.
- apps/web/src/map/input.ts lines 165–220 and 280: the second press on the pane is still the chart double-click (addEventListener, not window.). The handler now ends at 220 (it was 219 when the checklist was written). D has added pan and box handling around it. Not edited this pass. The shot already covers it.
- tests/web/builder_draft.test.js: "several adds stay in call order…" at 655, "Keep mine carries every add…" at 707, "unset takes a star, world, or moon remove back…" at 774. The older blank tests expect { baseRev } only.
- tests/web/builder_store.test.js line 562: "blank posts only the row rev".
- tests/web/dossier_model.test.js lines 72–74: sectorPlace('Far Home', '') is 'Far Home'.
- findings/builder_handle_ready.md: the signatures D reads. Not rewritten; the line numbers in it still match.
- findings/ui_design_shots/kb_orbit2_dblclick.png: Regina orbit, opened by a press on the chart and a second press 3 px onto the dossier card. A pane click 450 ms later stayed on the map. Not reshot.

## Gates
npm test:      pass (1316 tests, 1302 pass, 0 fail, 14 skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass (tsc --noEmit -p apps/api, exit 0)
fourth gate:   pass (npm run build exit 0, 492 modules)

## Contract published
none

## Needs from others
- Lane D: call add and unset. blank takes only hexKey. workspace BlankOpener still types an edition argument, and seam.ts is still D's.

## Questions for Johnny
none
