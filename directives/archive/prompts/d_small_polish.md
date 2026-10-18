# Lane D — three small fixes left from the last passes

Issued 2026-10-14 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/board.md`, `directives/lanes/D.md`, then this file. No git but
read-only, no deploy, no `rules/`.

**Lane Z is working in `views/MapView.vue`, `apps/web/src/map/`, `workspace/market/`,
`marketplace/`, `shell/Rail.vue`, `shell/registry.ts` and `router.ts` this turn. Do not
touch any of them,** even though some are yours.

## Do

1. **The date chip between 600 and 680 px.** `workspace/StardateChip.vue` 125 hides the
   chip at 680 px and below. Since Lane E's bottom sheet (1.1.13), `shell/Panel.vue` shows
   the date again below 600 px. So from 600 to 680 px wide there is no date anywhere.
   Make the date visible at every width: keep the 860 px rule (the weekday goes), and
   below 680 px show the short date in the space the search row allows. Check that E's
   copy below 600 px and yours never show twice. If the only clean answer needs a
   `shell/` file, stop and write it under "Needs from others".
2. **The global `h1`/`p` reset.** `views/Account.vue` 20-36 carries two global rules (its
   comment says they stay "until base.css takes them over"). Move them, unchanged, into
   `design/base.css` and delete them from `Account.vue`. Nothing on screen may change:
   check a page that has an `h1` and a `p` before and after (the account page, a record
   page, the sign-in card).
3. **The orbit picker's card colour.** Since the shared modal frame (your
   `d_polish_note_and_frame`, Difference 3), the picker alone keeps `--panel-raised` and
   16 px type; the other three dialogs use the frame's `--bg-1` and 14 px. Make the
   picker's card match the frame. If its content reads worse at 14 px (the orbit numbers
   and the table), keep 16 px for the table only and say so with a shot.

## Owned files (this pass)

`workspace/StardateChip.vue`, `views/Account.vue`, `design/base.css`,
`workspace/build/OrbitPicker.vue`, `design/tokens.css` (your own lines), tests under
`tests/web/`, `directives/reports/d_small_polish.md`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. **Browser:**
before and after shots: the date at 1600, 860, 640 and 520 px; the account page and the
sign-in card at 1600 px; the orbit picker at 1600 and 520 px. As
`findings/ui_design_shots/kb19_*`. Start Vite with its own cache directory; stop it after.

## Stop rule

Stop when the gates pass and the report is written.

Write `directives/reports/d_small_polish.md` from `directives/reports/_TEMPLATE.md`.
After each meaningful step append one line under Progress: "done: X. next: Y."

## Progress

- done: read the three items; the date fits in the search row only from about 671 px (the search field is 440 px and not mine), so below 680 px it goes under the search on the right, where E's rule already puts it below 600 px. next: before shots.
- done: the date chip below 680 px sits under the search on the right (the 860 rule hides only the weekday); the h1/p reset moved unchanged from views/Account.vue to the top of design/base.css; the picker's card takes the frame's --bg-1 and 14 px. next: after shots.
- done: after shots kb19_after_* (date at 1600/860/640/520 with and without a panel; sign-in card, account and record page identical; picker at 1600/520); the chip sits under an open side panel and hides beside it from 600 to 680 px; tests/web/small_polish.test.js (3). next: the four command gates.
- done: gates pass (1707 tests, 0 fail; check clean; typecheck; build); servers stopped; the report is written. next: nothing.
