# Lane D — a small version number at the foot of the sign-in and account windows

Issued 2026-10-14 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/board.md`, `directives/lanes/D.md`, then this file. No git but
read-only, no deploy, no `rules/`.

Johnny, 2026-10-14: "add a small version number to the bottom of the sign in and account
windows."

## Do

1. At the bottom of the sign-in window (`workspace/passkey/SignInBody.vue`, inside its
   card, below everything else) and of the account window
   (`workspace/passkey/AccountPage.vue`, same place), one small muted line:
   `Version 1.1.15`, read from `APP_VERSION` in `apps/web/src/version.ts` (never typed).
   The app version only; no engine version. (If the engine is ever shown, it is written
   `e1.2`; not in this pass.)
2. Small: the app's smallest text size and its muted text colour token, centred or
   right-aligned to match each card's footer. Selectable text, not a link. It does not
   push the card taller than it needs to be at 520 px.
3. If the account window you find is not `AccountPage.vue` (for example, the account
   menu is what Johnny means), put it in both and say so in the report with a shot.

## Owned files (this pass)

`workspace/passkey/SignInBody.vue`, `workspace/passkey/AccountPage.vue`,
`workspace/AccountMenu.vue` (only if step 3 applies), `design/tokens.css` (your own
lines), one test under `tests/web/`, `directives/reports/d_version_label.md`. Lane Z is
editing `workspace/market/`, `marketplace/`, `router.ts`, `views/MapView.vue` and `map/`
this turn: do not touch them.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. **Browser:**
shots of both windows at 1600 px and 520 px, `findings/ui_design_shots/kb18_version_*`.
Start Vite with its own cache directory.

## Stop rule

Stop when the gates pass and the report is written.

Write `directives/reports/d_version_label.md` from `directives/reports/_TEMPLATE.md`.
After each meaningful step append one line under Progress: "done: X. next: Y."

## Progress

- done: "Version {{ APP_VERSION }}" last in SignInBody.vue, AccountPage.vue (not while signed out or loading, where the sign-in card says it) and the signed-in AccountMenu.vue (step 3: the menu is the account window people open). next: a test, then the browser shots.
- done: tests/web/version_label.test.js (4); shots kb18_version_* (8) at 1600 and 520 px, servers stopped. next: the four command gates.
- done: gates pass (1690 tests, 0 fail; check clean; typecheck; build, index 178.36 kB); the report is written. next: nothing.
