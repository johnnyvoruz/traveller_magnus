# Lane E — below 600 px, the pane opens as a bottom sheet; a Back button in the pane header

Issued 2026-10-14 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/board.md`, `directives/lanes/E.md`, `findings/first_run_review.md`
finding 18 (shot `findings/ui_design_shots/kb16_520_dossier.png`), then this file. No git
but read-only, no deploy, no `rules/`.

Live is 1.1.12, engine 1.2.0, truth v10. Johnny said yes on 2026-10-14.

## The fault

At 520 × 900, `/s/Spinward_Marches/1910` opens the pane over the whole map: the selected
hex and the date chip are hidden.

## Do

1. In the panel host (`apps/web/src/shell/PanelHost.vue`, and `Panel.vue` / `frame.ts`
   if the layout lives there), below 600 px wide the pane opens as a bottom sheet at half
   the viewport's height, full width, with a grab handle. Dragging or tapping the handle
   toggles between half height and full height. Above 600 px nothing changes.
2. The selected hex stays visible above the sheet: when the sheet opens and the hex
   would sit under it, the map moves so the hex is centred in the space above. Read
   `map/camera.ts` (lent, D's) for the existing pan; if it has none you can call, add one
   small exported function there and say so in the report.
3. The date chip stays visible above the sheet.
4. Keyboard and screen readers: the sheet keeps the pane's focus order and its close
   control; Escape closes it as today.
5. **A back button (Johnny, 2026-10-14):** "add a < to the left of the X close in the upper
   right that will take the user back one pane. I keep pressing the X thinking it'll take
   me back but it closes the whole pane (as it should, but I need something up there that
   works as back)."
   - In `Panel.vue`'s header, a "<" button (`<Icon name="chevron-left" :size="18" />`, in
     `design/icons.ts` already) directly left of `.panel-close`, the same size and look. Accessible name and title: "Back".
   - It reopens the pane shown before this one, as it was (its address and query). Panes
     are URL-driven (`shell/pane.ts`, `PanelHost.vue` `closePane` pushes `atPane(...)`):
     keep, in the shell, a session-only stack of the distinct panes the person has seen
     (a pane counts once even if its URL is pushed again; closing the pane clears the
     stack). Back pops one and navigates to it. Do not use the browser's history: it can
     leave the app.
   - When there is no earlier pane, the button is not shown (the X stays where it is).
   - X still closes the whole pane. Escape is unchanged. In the bottom sheet (step 1) the
     back button sits in the same place.
   - Shots: open Regina, then her sector, then the journal; Back twice lands on Regina's
     dossier; the first pane shows no Back.

## Owned files (this pass)

`apps/web/src/shell/PanelHost.vue`, `shell/Panel.vue`, `shell/frame.ts` (lent), `shell/pane.ts` (lent; A no longer holds it), a new `shell/pane_back.ts` if you want one,
`map/camera.ts` (lent, one function at most), tests under `tests/web/`,
`directives/reports/e_phone_sheet.md`. D is editing `workspace/` and `design/base.css`
this turn: do not touch them; token lines in `design/tokens.css` are fine.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. **Browser:**
shots at 520 × 900 and 390 × 844 of Regina's dossier (half and full height) and at 1600 px
(unchanged), as `findings/ui_design_shots/kb17_sheet_*`. Start Vite with its own cache
directory.

## Stop rule

Stop when the gates pass and the report is written.

Write `directives/reports/e_phone_sheet.md` from `directives/reports/_TEMPLATE.md`.
After each meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: the pane is a half-height sheet below 600 px, Back walks a session stack, and the map recentres a covered hex. next: the test, then the gates.
done: the sheet test covers the recentre, Back, and the 599 px rule. next: the four gates and the browser.
done: check, typecheck and build passed. Regina stays above the sheet at 520 and 390, and Back returns to her dossier. next: the report.

