# One hour — the integration sweep (read-only)

Issued 2026-10-17 15:35 by the orchestrator, for a one-hour session. You may be a fresh session with no
memory. Read `CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, then this file. **You change
no file in `apps/`, `packages/`, `tests/`, `tools/` or `directives/` (except your report).** No git but
read-only, no deploy, no `rules/`. Use ports 6100–6199 and a state folder of your own; stop everything
you start.

## Why
Since 1.2.6 (`d6658f5`) nine lanes have changed the tree with no push. Each ran its own gates, often
while other lanes were mid-edit. Nobody has checked the whole of it at once, in a browser. You do,
before the next push.

## Do (timebox each step; stop at 55 minutes and write what you have)
1. **A frozen copy (10 min).** Make a copy of the tree as it is now under the OS temp folder: `git archive
   HEAD` plus every changed and untracked path from `git status --porcelain -z --untracked-files=all`,
   leaving out `findings/`, `versionvideo/` and `*.wav`. Link `node_modules` (a junction) rather than
   installing. Run `npm run rules:gen`, `npm run names:gen`, then `npm test`, `npm run check`,
   `npm run typecheck`, `npm run build` there. Record every failure with its first assertion.
2. **Every route in a browser (30 min).** Serve the copy's build (`vite preview`) with the public chart
   (no local API is fine: signed out). In headless Edge or Chrome, at 1600 × 900 and 390 × 844, open cold:
   `/`, a sector, a subsector, a hex, a body, the orbit view of Regina (Spinward Marches 1910),
   `/packages`, one package page, `/changes`, `/help`, `/design`, `/account`. For each, record:
   - console errors and failed requests (other than the missing API);
   - anything wider than the window (`document.documentElement.scrollWidth > innerWidth`);
   - elements that overlap where they shouldn't (a control covered by another at its centre:
     `elementFromPoint` on every button and link);
   - text cut off (`scrollWidth > clientWidth` on headings and buttons);
   - a shot of each, `findings/ui_design_shots/x_sweep_<route>_<width>.png`.
3. **The new pieces, once each (10 min):** the dice roller (palette "Roll dice", then Boon), the store's
   filter column (tick two kinds, Back), a record hover card if the signed-out map has one, the Help
   window from the palette. Note anything broken.
4. **Report (5 min):** `directives/reports/x_integration_sweep.md`: a table of every finding (route, width,
   what, the file it most likely lives in, the owning lane from the board's lane table and
   `directives/streams/*.md` areas), worst first. Then the step 1 gate results. No fixes.

## Owned
Your temp copy, your shots, your report. Nothing else.
