# Agent A — the draft handle: three changes Agent D's hand designer is blocked on

Issued 2026-10-10 by the orchestrator. Common rules: `directives/swarm_restart.md`.
Accepted from your last report: no chart request for a `~` sector, the three pair fields
in `hand_present.ts`, the second press on the pane. Agent D stopped half-way through
step 3's close because the handle cannot carry what Agent B's server now accepts
(`findings/builder_step3_close_ready.md`: read it first, the shapes are there). **The
push waits on this, then on D.** Write `findings/builder_handle_ready.md` for D with the
exact signatures before you report.

## 1. Several adds in one draft

`DraftHandle.set` keeps one change for each field id (`upsert`, `draft.ts` about 228 to
232) and drops a change to a field that is not on the form yet (about 279 to 280). So a
second added body overwrites the first, and a just-added body cannot be named or
re-parented before the server answers. The server applies the whole changes array in
order and takes client ids for adds.

- `add(field: 'star.add' | 'body.add', id: string)` appends one change a call; ids are
  the client's and stay stable through to Keep.
- `set` is accepted for a field of a body added in this draft, before the draft answer
  is back; order in the array is the order of the calls (the star before the world that
  orbits it; kind and parent after the add).
- Discard drops the adds with everything else. `dirty`, the "N changes" count and
  "Keep mine" after a conflict (re-apply by field id) all count and carry them.

## 2. Taking a remove back

`<starId>.remove` goes into the draft so the server can say "N bodies go with this
star." (a message with `holds: false`); by then the star is off the form, so
`set(id + '.remove', false)` is dropped and D's Cancel cannot undo it. Give the handle
`unset(fieldId)` (or make `set` work for a change the draft itself took off the form):
the change leaves the array, the next draft answer puts the star and its bodies back,
and adds or edits made before it are untouched. The same for a world's and a moon's
remove.

## 3. Blank with no edition

`Builder.blank(hexKey, edition, star?)` (`store.ts` about 167 and 322 to 344) sends an
edition. The route needs only `{ baseRev }`. Make it `blank(hexKey)`; the old arguments
are gone from the type, and nothing is sent that the server ignores.

## 4. Two small ones

- `apps/web/src/dossier/model.ts` about line 836 builds
  `sectorName + ' - ' + subsectorName`; an unnamed subsector leaves "Far Home -". No
  dash when the subsector name is empty (the orbit head already does this: one helper,
  used by both).
- Your second-press fix for the double-click was not seen in a browser. See it: a hex
  drawn against the pane's right edge, double-clicked, opens the orbit view; a single
  click on the pane after a click on the chart, later than the double-click time, does
  not. One shot, `kb_orbit2_dblclick.png`.

## Check and report

Tests for 1, 2 and 3 in `tests/web/builder_draft.test.js` and `builder_store.test.js`
against the fake transport, each failing on today's tree. `npm test`, `npm run check`,
`npm run typecheck`, `npm run build`, pasted. Do not edit `workspace/` (D's stand
exactly as they are; `seam.ts` is D's to change). No git, no deploy. Stop and report.

## File bus (added 2026-10-10, replaces "report in chat")

Lane rules: `directives/lanes/A.md`. Nothing is pasted to Johnny any more.
**If you are a fresh session:** this work looks finished in the tree (`findings/builder_handle_ready.md`, `kb_orbit2_dblclick.png`, the tests). Do not redo it. Check each numbered item against the tree, run the four gates, and write the report. List your edits to `views/MapView.vue` and `views/OrbitView.vue` with line ranges: the first is Lane D's and D is editing it now, the second is a shared file.
When finished or blocked, write `directives/reports/a_draft_handle_close.md` from
`directives/reports/_TEMPLATE.md` (status, every changed file with one line each
including files outside your lane, the four gates, contract, needs, questions written
out in full with your recommended answer first), then stop. After each meaningful step
append one line under Progress below: "done: X. next: Y."

## Progress
done: the handle is in the tree. Do not reimplement it. next: confirm the checklist, re-run the four gates, write directives/reports/a_draft_handle_close.md, stop.
done: D is editing views/MapView.vue and map/input.ts right now. next: do not edit either file, or views/OrbitView.vue, or workspace/, or board.md, or handoff.md. Cite the lines below. If a line has moved, cite the new line and say so.
done: a gate failure outside the files below belongs to another lane. next: paste it under Needs and do not fix it.

Confirm, then copy into the report. One line per file:

- apps/web/src/builder/draft.ts: DraftHandle.add(field: 'star.add' | 'body.add', id: string) and unset(fieldId: string) at lines 63–65. blank(hexKey: string) at lines 77 and 92. add appends at 302. unset drops one pending change at 309, including a remove whose field has left the form. set accepts <id> and <id>.* after that add. keepMine keeps every star.add, body.add, and field of those ids, and does not put them on dropped.
- apps/web/src/builder/store.ts: Builder.blank(hexKey: string) at line 167. The post body is { baseRev } only (blankBody). BlankStar is gone.
- apps/web/src/builder/index.ts line 6: exports BlankOpened, DraftHandle, DroppedField. BlankStar is not exported.
- apps/web/src/dossier/model.ts: sectorPlace at line 804. header.place uses it at line 845. Empty sector or subsector means no dash. This file is outside lanes/A.md; the prompt named it.
- apps/web/src/views/MapView.vue line 1114: setDraftOpener(openDraft, (hexKey) => blank(hexKey)). This is D's file. The line was 1080 before D edited the view. Do not edit it.
- apps/web/src/views/OrbitView.vue lines 256–259: place is header.place, with the slug as fallback. The old trailing " - " trim is gone. Shared file. This turn's edit is already there. Do not edit it again.
- apps/web/src/map/input.ts lines 165–219 and 280: the second press on the pane is still the chart double-click (addEventListener, not window.). D has added pan and box handling around it. Do not edit this file. The shot already covers it.
- tests/web/builder_draft.test.js: "several adds stay in call order…" at 655, "Keep mine carries every add…", "unset takes a star, world, or moon remove back…" at 774. The older blank tests expect { baseRev } only.
- tests/web/builder_store.test.js line 562: "blank posts only the row rev".
- tests/web/dossier_model.test.js lines 72–74: sectorPlace('Far Home', '') is 'Far Home'.
- findings/builder_handle_ready.md: the signatures D reads. Do not rewrite it unless a line number in it is now a lie.
- findings/ui_design_shots/kb_orbit2_dblclick.png: Regina orbit, opened by a press on the chart and a second press 3 px onto the dossier card. A pane click 450 ms later stayed on the map. Do not reshoot.

Gates last run in this session, before D's later edits: npm test 1298 tests, 1284 pass, 0 fail, 14 skipped; npm run check clean; npm run typecheck exit 0; npm run build exit 0, 486 modules. Re-run all four. Paste the new counts. The report's Needs line for D: call add and unset; blank takes only hexKey; workspace BlankOpener still types an edition argument, and seam.ts is still D's. Questions: none.
done: checklist rechecked. Line numbers still match, except map/input.ts onWindowUp now ends at 220. next: write the report from the colour step's gates.
done: directives/reports/a_draft_handle_close.md written. Gates: 1316 tests, 1302 pass, 0 fail, 14 skipped; check clean; typecheck exit 0; build exit 0, 492 modules. next: stop.
