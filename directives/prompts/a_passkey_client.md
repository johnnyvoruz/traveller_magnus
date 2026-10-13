# Lane A — the first-load bundle, then the passkey client for the screens, then one renderer line

Issued 2026-10-12 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/A.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your allowance-store report is accepted and goes out in version 1.1.9.

## 1. First: the main bundle grew by 82 kB (do this before anything else)

`npm run build`: the `index` chunk was 168.88 kB (gzip 56.98) at 1.1.8 and is 250.58 kB
(gzip 86.43) now. The orchestrator's lead: `apps/web/src/account/session.ts` line 2
and `apps/web/src/builder/allowance.ts` line 5 import `GenerationAllowance` from
`@voyage/shared` as a value (the zod schema), and the session is loaded on the first
page, so zod and the shared schemas now ride in the first chunk. Confirm it (say what
the chunk holds, before and after), then get the first chunk back to about 169 kB:
the session reads the four fields with a small hand check and a type-only import, or
the parse stays behind the builder's lazy chunk. Add a test or a build check that
fails if `account/session.ts` imports a value from `@voyage/shared` again. Paste the
chunk sizes.

## 2. The passkey client

Lane B built username and passkey sign-in on the server. The contract is
`directives/contracts/b_auth.md`: read it whole; build from it alone. It names the
real routes of `@better-auth/passkey` 1.7.7 and the client methods
(`authClient.passkey.addPasskey`, `authClient.signIn.passkey`). `apps/web/package.json`
already lists `better-auth` and `@better-auth/passkey` at 1.7.7 (Johnny approved that
package and nothing wider; add no other).

Build one module the screens call, in `apps/web/src/account/` (lent to you for this):

- sign up with a username (the ceremony, then the recovery codes revealed once);
- sign in with a passkey;
- redeem a recovery code (the session it gives can only add a passkey: surface that
  state as a named value the screen can route on, from `passkey_required` and from
  what `GET /api/me` or the session says);
- list, add, rename and remove passkeys; regenerate recovery codes; set a username on
  an account that came from Google, Discord or X; unlink a provider;
- what `GET /api/me` now carries (`username`, `hasPasskey`, `unusedRecoveryCodes`,
  `linkedProviders`) on the session value.

Rules:

- **All of it loads lazily.** Nothing from `better-auth` or `@better-auth/passkey` is
  in the first chunk; it arrives when a person opens sign-in or the account page.
  Paste the chunk sizes.
- Every failure reaches the screen as a typed result: the server's code and its
  sentence, unreworded (taken name, reserved name, `signup_limit`, `recovery_limit`,
  the last way in, a cancelled ceremony, a browser with no passkey support). A
  cancelled ceremony is not an error sentence from a library: give it its own code.
- A browser without WebAuthn: one function says so before any ceremony starts.
- The recovery codes are held in memory only for the screen that shows them; never in
  storage, never in a log.
- Signing in or out by any way leaves the allowance and builder state as your last
  pass made them (cleared on a change of account).
- **Whether a recovery session may sign out is with Johnny.** Build `signOut` as it
  is; if the server refuses it in that state, pass the refusal through. Do not work
  around it.

Write `findings/passkey_client.md` for Lane D: the import path, each function, its
result and failure shapes, one example each. Lane D builds the screens from that note.

Tests over a stub server and a stub `navigator.credentials`: each flow, each failure,
the lazy load, the no-WebAuthn answer.

## 3. One renderer line (lent: `apps/web/src/map/MapRenderer.ts`)

Lane D's finding: zoomed out, with a whole sector selected, `selectionOutline` is
drawn after `overviewPoints` and its hex outlines cover that sector's dots. Draw the
selection so the dots stay readable at the zoomed-out tiers (for one: the sector's
outer outline only, when the tier is not `hex`). A test, and say the draw time
before and after.

## Owned files (this pass)

`apps/web/src/account/`, `apps/web/src/builder/`, lent: `apps/web/src/map/MapRenderer.ts`
(the selection draw only). Tests in `tests/web/`. `findings/passkey_client.md`,
`directives/reports/a_passkey_client.md`. Not yours: `workspace/`, `views/` (Lane D),
`apps/api`, `packages/` (Lane B).

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted, with the
chunk table. Fourth gate: the tests in part 2.

## Stop rule

Stop when the gates pass and the report and note are written. If the contract lacks
something a flow needs, write what and stop that flow.

Write `directives/reports/a_passkey_client.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: session reads the allowance with a hand check and a type-only import. next: the passkey client.
done: passkey client, its tests, and the zoomed-out selection outline. next: the gates, the note, and the report.
done: gates passed, the note and the report are written. next: nothing.

