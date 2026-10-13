Found: sign-out posted with no body, so the live site answered 415 and the cookie stayed. A closed passkey prompt arrived as `Auth cancelled` and was shown as a library sentence.
Finished: sign-out posts `{}` and leaves the local session in place unless the server succeeds. A closed prompt is `ceremony_cancelled` on sign-up, sign-in, and add. `listPasskeys` passes `createdAt`. `guardRecovery(router)` is installed where the router is made.
Backed out: nothing. `platform/http.ts` was left as it is.

# Lane A a_signout_fix report
Prompt: prompts/a_signout_fix.md
Status: done

Parts 1 and 2. The importer is `directives/reports/a_importer.md`.

## Changed files
- apps/web/src/account/session.ts: `signOut` posts `body: '{}'`. Success clears the user, the allowance, and the error, sets `gate` to `signed-out`, and bumps the epoch. Any other answer returns `{ ok: false, code, message }` and clears nothing. A throw is `network` / "The server could not be reached. You are still signed in." A body with no code is `sign_out_failed` / "Sign-out did not finish. You are still signed in." A body with a code keeps that code and sentence. `passkey_required` still sets `gate` to `recovery`.
- apps/web/src/account/passkey.ts: message `Auth cancelled` is `ceremony_cancelled` on every ceremony. A ceremony code outside the server table is `ceremony_failed` / "The passkey ceremony did not finish." `PasskeyRow.createdAt` is the server string, or null.
- apps/web/src/router.ts: one call, `guardRecovery(router)`, after `afterEach`.
- tests/web/session_import.test.js: the request is `{}` with `content-type: application/json`. A 415 and a 500 leave the user and the allowance. A throw does too.
- tests/web/passkey_client.test.js: the wrapped cancel shape on sign-up, sign-in, and add. `createdAt` on the list.
- findings/passkey_client.md: the sentences Lane D should show, and the menu gap below.

## What a person sees when sign-out fails
The account page (`workspace/passkey/AccountPage.vue`) waits on the result. On failure it stays signed in and shows the sentence in the page alert. Offline: "The server could not be reached. You are still signed in." A 415, or a 5xx with no code: "Sign-out did not finish. You are still signed in." A 5xx that carries a code shows that sentence.

The recovery screen does the same and does not emit `signedOut`.

The account menu does not. `AccountMenu.vue` `leave()` ignores the result, always calls `resetCampaign`, `forgetDeleted`, and `forgetOpening`, and closes. The rail still shows the signed-in person, because `session.user` is still set. Lane D: wait on `{ ok }` before those three calls, and show `message`. This pass did not edit the menu.

## http.ts
Left unchanged. `apiFetch` already sets `content-type: application/json` when `body != null`. The fault was the missing body. A change there would touch every POST.

## Other body-less POSTs
- `account/session.ts` `signOut`. This was the fault. Fixed.
- `account/session.ts` social sign-in. Has a JSON body.
- `account/passkey.ts` `post()`. Sends `{}` when the caller passes no body, and sets the content type itself.
- `campaign/store.ts` both POSTs. JSON bodies.
- `characters/store.ts` create. JSON body.
- `characters/live.ts` and `characters/share.ts` `giveOwnership` / `claim`. JSON bodies.
- `characters/share.ts` `makeInvite`: `POST /api/characters/:id/invites` with no body. Not edited. `characters/` is not in this prompt's owned files. The handler `charactersRoute.post('/:id/invites')` does not call `readJson`. It returns 201, or 401, 403, or 404. It is not this 415.

## Passkey follow-ups
`list-accounts` is still read as a bare array of `{ id, providerId }`. At the end of this pass, `directives/contracts/b_auth.md` "Linked providers" still does not name that JSON type, and it does not name a link route other than `POST /api/auth/sign-in/social`. There is no `directives/reports/b_public_games.md`. Nothing was invented.

`guardRecovery` keeps a `WeakSet`. The second call, from `views/Account.vue`, does not add another `beforeEach` or `watch`. It only calls `leave()` again. Twice is harmless. `Account.vue` was not edited.

## Gates
npm test:      pass (1534 pass, 0 fail, 23 skip)
npm run check: pass
typecheck:     pass (`tsc --noEmit -p apps/api`)
fourth gate:   pass (`tests/web/session_import.test.js`, `tests/web/passkey_client.test.js`)

`npm run build` stops in `vue-tsc` at `apps/web/src/pack/plan.ts(144,51)`: `Property 'id' does not exist on type 'never'`. That file is Lane E's untracked `apps/web/src/pack/`, not this pass, and it was not edited. Vite on its own (`npm --workspace apps/web exec vite build`) finished:

| | file | size | gzip |
|---|---|---|---|
| after a_passkey_client | index-DWRLu7RK.js | 171.33 kB | 57.78 |
| after this pass | index-H-OJSFqz.js | 171.50 kB | 57.87 |

The session stayed its own chunk: `session-CrJ4M9hh.js` 3.68 kB (gzip 1.43). `recovery-C4a_ZnYM.js` is 0.37 kB.

## Contract published
none

## Needs from others
- Lane D: in `AccountMenu.vue` `leave()`, wait on `signOut()` before `resetCampaign`, and show the failure sentence. The account page and the recovery screen already do. `createdAt` is on each passkey row. A closed prompt is `ceremony_cancelled`. Any other ceremony failure with no server-table code is `ceremony_failed`. `guardRecovery(router)` now runs from `router.ts`, so the call in `views/Account.vue` can come out. Until then both calls are harmless.
- Lane B: `contracts/b_auth.md` still does not name the `list-accounts` JSON. The client still expects a bare array of `{ id, providerId }`.

## Questions for Johnny
none
