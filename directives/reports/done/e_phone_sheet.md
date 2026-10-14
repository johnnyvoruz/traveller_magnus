# Lane E e_phone_sheet report
Prompt: prompts/e_phone_sheet.md
Status: done

Found no half-finished edit of this prompt.
Finished the bottom sheet, the Back stack, the recentre, and the browser pass.
Backed out nothing.

## Changed files
- `apps/web/src/shell/Panel.vue`: below 600 px the open pane is a bottom sheet, half the viewport, full width, with a grab handle. A tap or a drag on the handle toggles half and full. Column, Half and Full are hidden there, because the sheet is always the width of the window. Above 600 px the side pane is unchanged. A Back button (`chevron-left`, 18) sits directly left of Close, same size and look, accessible name and title "Back". It is absent when this is the first pane.
- `apps/web/src/shell/pane_back.ts`: a session stack of the panes opened in this tab. A pane counts once. Back pops one and navigates to that address and query. Closing the pane clears the stack. The browser history is not used.
- `apps/web/src/shell/PanelHost.vue`: records each pane, and on a narrow window reports no side width and sets `--sheet-cover` to half the viewport while the sheet is half height.
- `apps/web/src/map/camera.ts`: `centreAbove`, one function. It puts a world point at the centre of the band above a bottom sheet.
- `apps/web/src/views/MapView.vue`: reads `--sheet-cover` and recentres the selected hex in that band when the sheet starts covering it. The date chip is teleported to `.app` so a full sheet does not paint over it. `camera.ts` had no call that could move this view's camera, so this is the call site.
- `apps/web/src/shell/Panel.vue` also shows the date chip again below 600 px, under the search and above the sheet. `StardateChip.vue` hides it from 680 px down; that file is Lane D's this turn.
- `tests/web/phone_sheet.test.js`: the recentre, Back from journal to the sector to Regina, and the 599 px rule.
- Shots: `findings/ui_design_shots/kb17_sheet_520_half.png`, `kb17_sheet_520_full.png`, `kb17_sheet_390_half.png`, `kb17_sheet_390_full.png`, `kb17_sheet_1600.png`.

## Gates
npm test: 1661 tests, 1632 pass, 2 fail, 27 skipped. `tests/web/phone_sheet.test.js` passed. The two failures are under Needs from others.
npm run check: pass. manifesto clean.
typecheck: pass.
npm run build: pass. `index-CEIWbUQh.js` 178.36 kB (gzip 59.99 kB).

Browser, stopped after: Vite on 127.0.0.1:5217, its own cache, signed out. At 520 × 900 and 390 × 844 Regina's dossier opens as a half-height sheet; the hex and the date chip (002-1105) sit above it. The handle toggles full height by click and by Enter. At 1600 px the pane is the side column, the handle is not shown, and the date stays on the search row. Regina, then Spinward Marches from search, then the journal: Back twice lands on Regina's dossier, and that first pane has no Back. Escape closes the sheet.

## Contract published
none

## Needs from others
- Lane B, while the marketplace install step is open: `tests/api/packages_job.test.js` "the marketplace files do not name install, proposal, or report tables" fails because `apps/api/src/routes/packages.ts` names install. `tests/api/packages_migration.test.js` "package tables apply on a fresh local D1 and on today's schema" fails because `package_installs` is present. Not touched.

## Questions for Johnny
none
