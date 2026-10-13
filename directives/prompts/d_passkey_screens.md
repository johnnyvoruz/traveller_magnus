# Lane D — the screens for username and passkey sign-in

(Edited 2026-10-12 21:05: part 2 is no longer held.)

Issued 2026-10-12 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/D.md`,
`directives/agent_d_brief.md`, then this file. No git but read-only, no deploy, no
`rules/`, no Traveller rule from memory. Your dots and allowance report is accepted
and goes out in version 1.1.9, with both of your own choices as built unless the
board says Johnny ruled otherwise.

## What Johnny decided

"I don't want to deal with password resets ever." An account is **a username and a
passkey**. No email is asked for, no password, no authenticator code. Recovery is ten
one-time codes shown once at sign-up, and a nudge to add a second passkey. Linking
Google, Discord or X stays, as an option. If the passkey, the codes and every linked
provider are lost, the account is lost, and the screen says so plainly. The username
is the public handle (3 to 24 characters; letters, digits, underscore).

## What to read

`directives/contracts/b_auth.md` (the server, built), then
`findings/passkey_client.md` when it exists (Lane A is writing the client this turn),
then the screens as they are: `workspace/SignInCard.vue`, `views/Account.vue`,
`workspace/account.ts`.

## Part 1, now: the design, then the screens against the contract's shapes

Write `findings/passkey_screens_design.md` first, short: each screen and state as a
list, with every sentence a person reads. Then build. Until Lane A's note exists,
build against a small typed stub of the client (the functions and result shapes the
contract implies) in your own folder; when `directives/reports/a_passkey_client.md`
or its copy in `reports/done/` exists, wire to A's module and delete the stub. If it
has not arrived when everything else is done, report part 1 with the stub in place
and say so.

- **The sign-in card.** First choice: "Sign in with a passkey" (one button; the
  browser shows the person's passkeys, no username typed). Then "Create an account":
  a username field with the rule said once beside it, checked as typed where the
  contract allows, the server's sentence shown at the field when refused. Then the
  three providers, below, as today. A browser with no passkey support is told so in
  one sentence and offered the providers.
- **Right after sign-up: the recovery codes.** Shown once, in a form that can be
  copied and downloaded as a text file; one plain paragraph on what they are for and
  that this is the only time they are shown; the person confirms they saved them
  before going on. Then the nudge: add a second passkey on another device, with
  "Not now".
- **"I lost my passkey"** on the sign-in card: one field for a recovery code, the
  server's sentence on a bad code and on the limit.
- **The account page:** the username; passkeys as a list (name, when added, rename,
  remove; the last way in cannot be removed and the control says why before it is
  pressed); "Add a passkey"; recovery codes (how many are unused; "Make new codes",
  which says the old ones stop working, then shows the new set once); linked
  providers (link, unlink, the same last-way-in rule); for an account that came from
  a provider: "Add a passkey" and "Choose a username".
- **The lost-means-lost sentence** sits where the codes are shown and on the account
  page by the passkey list, once each, calm, no alarm colour.
- No email appears anywhere, including the stand-in address the server stores.
- Every state: idle, the ceremony open, cancelled by the person (no error tone),
  refused, done. Keyboard through all of it; focus returns sensibly; the card and the
  page at column, half, full and 520 px.

## Part 2: the screen for a session that came from a recovery code

**Johnny, 2026-10-12: yes, such a session may sign out** (Lane B is adding that one
route this turn; until its report exists the server still refuses it: build the
control, and say in the report whether you saw it work).

That session can do two things: add a passkey, or sign out. One screen, nothing else
reachable: what happened ("You signed in with a recovery code. That code is used
up."), what to do ("Add a passkey to finish."), the button, and "Sign out" as the
quiet second choice. After the passkey is added: how many codes are left, and the
offer to make new ones. Every other route sends a person in this state here.

## Copy

Every sentence follows the Google developer documentation style guide. "Passkey" is
not explained with jargon: one short line the first time ("A passkey signs you in
with your fingerprint, face, or device PIN. There is no password.").

## Owned files (this pass)

`apps/web/src/workspace/SignInCard.vue`, `workspace/account.ts`,
`apps/web/src/views/Account.vue`, new components beside them, tests in `tests/web/`,
shots `kb15_*`, `findings/passkey_screens_design.md`,
`directives/reports/d_passkey_screens.md`. Not yours: `apps/web/src/account/` (Lane A
this turn), `apps/web/src/map/`, `apps/api`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted (the first
chunk must not grow: nothing of the passkey client loads before sign-in or the account
page is opened; paste the chunk sizes). Fourth gate: a browser pass on your own ports
and Vite cache, with the browser's virtual authenticator (CDP `WebAuthn.enable`,
`addVirtualAuthenticator`) on `http://localhost` (a passkey does not work on
`127.0.0.1`), stopped after: sign up, the codes, sign out, sign in, add a second
passkey, rename, remove one, the last one refused, make new codes, a taken name, a
cancelled ceremony, no-WebAuthn. If A's client has not arrived, the same over the
stub, and say which.

## Stop rule

Stop when parts 1 and 2 pass and the report is written.

Write `directives/reports/d_passkey_screens.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: design note findings/passkey_screens_design.md (each screen, state and sentence). next: the client stub in workspace/passkey/ (A's client not here yet), then the card, the page and the recovery screen.
done: part 1 and part 2 built over my own stub client (workspace/passkey/client.ts; A's not here yet): the card (SignInCard.vue a thin wrapper, the body its own chunk), the codes, the nudge, the account page, the recovery screen; 20 tests; first chunk 250.58 -> 248.39 kB. next: the browser pass with a virtual authenticator on my own ports.
done: browser pass kb15_* on my own ports with a virtual authenticator (pk1-pk7 over my stub); A's client arrived, so the screens now call account/passkey.ts and session.gate, the stub is deleted, and pk8-pk9 passed on A's client; found two gaps in A's lent files (sign-out answered 415; a closed prompt not mapped). next: the report.
done: report directives/reports/d_passkey_screens.md; servers and browser stopped. next: wait for the next prompt.
