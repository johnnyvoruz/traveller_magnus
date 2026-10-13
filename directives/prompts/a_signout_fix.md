# Lane A — sign-out does not end the session (live); passkey client follow-ups; the campaign importer

Issued 2026-10-12 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/A.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your bundle fix, passkey client and selection outline are accepted. The
passkey paths wait one more push for parts 1 and 2 below.

## 1. First, a live fault: sign-out never reaches the server

Lane D found it; the orchestrator confirmed it on production at 21:50:
`POST https://traveller.voyage/api/auth/sign-out` with no body answers **415**; with
`content-type: application/json` and `{}` it answers 200. `signOut()` in
`apps/web/src/account/session.ts` posts with no body, and `apiFetch`
(`apps/web/src/platform/http.ts`) sets the content type only when there is a body. So
on the live site the page shows signed out while the cookie's session stays: a reload
signs the person back in, and on a shared computer the next person is them.

- Fix it (`body: '{}'`), and make `signOut` treat any answer that is not a success
  as "not signed out": the screen must not show signed out while the server still
  holds the session. Say what a person sees when sign-out fails (offline, 5xx).
- A test that fails on today's code: the request carries a JSON body and content
  type; a 415 or 500 leaves the session in place and returns a typed failure.
- Look for the same fault in every other body-less POST the browser makes
  (`grep` for `method: 'POST'` without a body across `apps/web/src`): list each, with
  what the server answers. Fix those in your files; name the others.
- `platform/http.ts` is lent for this if the right fix is there (say why).

## 2. Passkey client follow-ups (from `reports/done/d_passkey_screens.md`)

- **A closed prompt is not recognised.** `signInWithPasskey()` returned
  `code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY'`, `message: 'Auth cancelled'`: how
  `@simplewebauthn/browser` wraps the browser's `NotAllowedError`, with the cause
  dropped by better-auth's sign-in. Map it to your `ceremony_cancelled` on every
  ceremony (sign-up, sign-in, add). No library sentence may reach a screen: any
  failure with no server sentence gets one of your own codes and a plain sentence.
  Tests with the real wrapped shapes.
- **`listPasskeys()` passes `createdAt`**, so a row can say when it was added.
- **Linked providers.** Your question (is `GET /api/auth/list-accounts` a bare array
  of `{ id, providerId }`) is Lane B's to answer, not Johnny's; B is writing it into
  `contracts/b_auth.md` this turn, with the route that links a provider to a
  signed-in account. When `directives/reports/b_public_games.md` or its copy in done/
  exists, read the contract's "Linked providers" and match it; if it is not there
  when you finish, say so.
- **`apps/web/src/router.ts`, lent, one line:** `guardRecovery(router)` from
  `workspace/passkey/recovery.ts`, where the router is made. Lane D removes its
  workaround in `views/Account.vue` afterwards; until then the guard is installed
  twice, so make sure twice is harmless (or say what D must do first).

## 3. The campaign importer does not read the journal

Lane B's finding: an exported campaign file includes `journal`, and
`apps/web/src/campaign/import.ts` does not read it, so export then import loses every
journal entry (and now their images). Confirm it with a round-trip test, then make
import read the journal as export writes it: entries, their `when`, visibility,
mentions and `images`; a file from before `images` existed still imports. Say what
import does with an entry whose id already exists, in the same words the importer
uses for a record.

## Owned files (this pass)

`apps/web/src/account/`, `apps/web/src/campaign/`, lent: `apps/web/src/platform/http.ts`
(part 1 only), `apps/web/src/router.ts` (the one line). Tests in `tests/web/`.
`directives/reports/a_signout_fix.md`. Not yours: `workspace/`, `views/` (Lane D),
`apps/api`, `packages/` (Lane B).

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted, with the
`index` chunk size (it must stay at about 171 kB). Fourth gate: the tests named above.

## Stop rule

Stop when the gates pass and the report is written. Report part 1 first if anything
else is slow: it is the urgent one.

Write `directives/reports/a_signout_fix.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

