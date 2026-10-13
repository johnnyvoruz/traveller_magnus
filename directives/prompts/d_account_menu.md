# Lane D — tonight: the account page must be reachable (three small things before passkeys ship)

Issued 2026-10-12 22:40 by the orchestrator. You may be a fresh session with no memory.
Read `CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`,
`directives/lanes/D.md`, then this file. No git but read-only, no deploy, no `rules/`.
Your first-visit review and the passkey follow-ups are accepted. **Johnny wants
passkey sign-in out tonight; this prompt is the last browser work before that push.
Keep it small and report fast.**

## Do, from your own review (`findings/first_run_review.md`)

1. **Finding 2, blocks:** the account menu (`workspace/AccountMenu.vue`) gets
   "Account and sign-in" above Sign out, opening `/account`. Keyboard and focus as
   the other items.
2. **From Lane A's report:** in the same file, `leave()` waits on `signOut()`. Only
   on `{ ok: true }` does it call `resetCampaign`, `forgetDeleted`, `forgetOpening`
   and close. On failure it stays signed in and shows A's sentence in the menu.
3. **Finding 10:** after sign-up (the codes, then the nudge) and after the recovery
   screen, "Back to the map" and the final Continue return to the address the card
   was opened from, not the home view. If no address is known, the home view.
4. **Finding 17 only if it is one line:** the account menu shows the name twice.

Nothing else from the review tonight. No restyle.

## Copy

Google developer documentation style.

## Owned files (this pass)

`apps/web/src/workspace/AccountMenu.vue`, `apps/web/src/workspace/passkey/`,
`workspace/SignInCard.vue`, `views/Account.vue`, tests in `tests/web/`,
`directives/reports/d_account_menu.md`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted, with the
`index` chunk size. Fourth gate: one short browser pass with the virtual
authenticator on your own ports, stopped after: sign up from a world's address,
through the codes, back to that address; the menu item opens the account page; a
refused sign-out from the menu (patched as before) leaves the person signed in with
the sentence; a real one signs out.

## Stop rule

Stop when the gates pass and the report is written.

Write `directives/reports/d_account_menu.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: the menu item, sign-out that waits on the server, the return address after sign-up and recovery, the name shown once; a test. next: the browser pass.
done: browser pass (sign-up from Regina's address back to it; the menu item by mouse and keyboard; a refused sign-out keeps the person signed in with the sentence; a real one signs out); gates green, index 171.38 kB; report written; servers stopped. next: wait for the next prompt.
