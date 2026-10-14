# Static character sheets at /sheets (standalone, not part of the app)

Issued 2026-10-13 on Johnny's word. Small web task. No rules, no engine, no app code.

## Goal
Host Johnny's hand-made HTML character sheets as plain static files on traveller.voyage,
with clean URLs, completely separate from the Vue app and from the existing character
and campaign features (`apps/web/src/characters/`, `/claim/:token`, campaign panels).
Do not add routes, components, imports, nav links or API calls.

## Source files
`findings/sheets_source/` (copy them; do not edit their content):
- `meridian-03.html` ("MERIDIAN-03 Dossier") -> SECRET: reachable by URL, NOT listed
- `man-in-the-low-berth.html` ("The Man in the Low Berth") -> listed

## Do
0. Copy `findings/sheets_source/portrait.webp` to `apps/web/public/sheets/portrait.webp` (both sheets reference it as `../portrait.webp`).
1. Create `apps/web/public/sheets/meridian-03/index.html` and
   `apps/web/public/sheets/man-in-the-low-berth/index.html` (verbatim copies).
2. Create `apps/web/public/sheets/index.html`: a simple standalone menu page (may reuse
   the sheets' fonts/look) linking ONLY to `/sheets/man-in-the-low-berth/`.
   Meridian-03 must not appear in it, in any comment, or in any sitemap/manifest.
   Adding a sheet later = add a folder + one link line.
3. Add `<meta name="robots" content="noindex">` to `sheets/meridian-03/index.html`
   only if Johnny agrees (question 1); otherwise leave the file verbatim.
4. Verify the SPA fallback does not swallow these paths: after `npm run build`, with the
   local preview/worker, `/sheets`, `/sheets/`, `/sheets/man-in-the-low-berth`,
   `/sheets/man-in-the-low-berth/` and `/sheets/meridian-03/` each return the sheet
   HTML (status 200, title matches), not the map app. If the host config
   (wrangler assets / not_found_handling / _redirects) needs a change for that, make the
   smallest one and name it in the report.

## Done when
- The five URLs above serve the right files in a local build.
- `sheets/index.html` lists exactly one sheet.
- `git status --short` shows only new files under `apps/web/public/sheets/` plus any
  one named host-config line.
- Four gates pass: `npm test`, `npm run check`, `npm run typecheck`, `npm run build`.

## Questions for Johnny (recommended answer first)
1. Add noindex to Meridian-03 so search engines don't list it? Recommended: yes.
   (Note: unlisted is not private; anyone with the URL can open it.)

## Assigned to Lane E by the orchestrator, 2026-10-13

- Read `CLAUDE.md`, `directives/manifesto.md`, `directives/board.md` and `directives/lanes/E.md` first. No git but read-only, no deploy.
- You own, for this pass only: new files under `apps/web/public/sheets/`. Nothing under `apps/web/src`.
- The working tree holds other lanes' uncommitted work, so "git status shows only new files" cannot hold. Read it as: your own edits are only the new files under `apps/web/public/sheets/`. List them in the report.
- `apps/api/wrangler.toml` is Johnny's. If step 4 needs a host-config change, write the exact line in the report and stop that part; do not edit the file.
- Question 1 (noindex) is with Johnny. Until he answers, leave `meridian-03` verbatim and say so in the report.
- Use your own ports and state directory for the local preview and stop what you start. Lane Z is editing engine files this turn: a red engine test goes under "Needs from others".
- Report: `directives/reports/z_sheets_static.md` from `directives/reports/_TEMPLATE.md`. Append one line under Progress after each step.

## Progress

done: copied the portrait and both sheets, hashes match the source. next: the menu page.
done: menu lists only The Man in the Low Berth. Meridian-03 stays verbatim, with no noindex until Johnny answers. next: the gates and the five URLs.
done: tests, check, typecheck and build passed. The worker serves the five sheet URLs. next: the report.

