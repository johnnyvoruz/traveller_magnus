# Lane B — build username and passkey sign-in (the server side and the contract)

Issued 2026-10-12 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/B.md`,
`findings/passkey_signin_design.md` (your own design note, accepted), then this file.
No git but read-only, no deploy, no `rules/`. Do `prompts/b_entry_images.md` first if
it has no report yet (Lane E is waiting on it). `prompts/b_generate_speed.md` comes
after this one.

## Johnny's answers (2026-10-12)

1. **Yes: add `@better-auth/passkey` pinned to exactly 1.7.7** (it brings
   `@simplewebauthn/server` and `@simplewebauthn/browser`). No two-factor plugin, no
   captcha plugin, no other auth package. If installing it would move `better-auth`
   or any other installed package to another version, stop and report the lockfile
   change before keeping it.
2. **Yes: the username is the public handle.** One name, 3 to 24 characters, letters,
   digits and underscore, case ignored, stored lowercase; a taken name is refused;
   `admin`, `api`, `support` and `user` are reserved. `profile.handle` is that value.
   Accounts that exist today keep the handle they have.
3. **Yes: five passkey sign-up ceremonies an hour for one address**, in our own check.
   Turnstile only later, if that is not enough.

Earlier rulings that bind: an account is a username and a passkey, no email is asked
for, no email service, no password, no two-factor; recovery by one-time codes shown
once at sign-up; a nudge to add a second passkey; linking Google, Discord or X is
optional; if the passkey, the codes and every linked provider are lost the account is
lost, and the screen says so.

## Build

As your design note says, sections 2 to 8. In particular:

- **No account without a verified passkey.** The user, profile and recovery codes are
  written only after the ceremony verifies. If 1.7.7 cannot do that, use the row your
  note describes (cannot sign in, removed on failure or after one hour) and prove it
  cannot call the app.
- **Migration `0012`:** `user.username`, `passkey`, `recovery_code`. Confirm the
  `passkey` column names against the installed plugin's schema before writing the SQL,
  and say what you found.
- **Recovery codes:** ten, hashed with the pepper, used once, five failures in fifteen
  minutes is 429; a valid code gives a session that can do nothing but add a passkey;
  regenerating replaces the unused set.
- **The last way in cannot be removed:** deleting the only passkey of an account with
  no linked provider is refused with a plain sentence. Unlinking the only provider of
  an account with no passkey likewise.
- **A signed-in account from Google, Discord or X can add a passkey and a username.**
- `rpID` and `origin` from `BETTER_AUTH_URL`; local needs `http://localhost:8787`
  (Johnny sets `.dev.vars`; you do not touch secrets or `wrangler.toml`: if a variable
  is needed there, name it in the report).
- **Every sentence a person can read** (refusals, limits, a taken name) follows the
  Google developer documentation style guide.
- The generation allowance row is made for a new passkey account like any other.

## The contract

Write `directives/contracts/b_auth.md`: every route a screen calls (path, body,
answer, errors with codes and sentences), the client plugin import for the browser
(`@better-auth/passkey/client`: which workspace must depend on it; a new dependency
in `apps/web` is part of Johnny's yes to this package and nothing wider), the order of
calls for sign-up, sign-in, recovery, adding a second passkey, renaming and removing
one, regenerating codes, and what `GET /api/me` now carries (username, whether the
account has a passkey, how many unused codes, linked providers). The screens lane
builds from that file alone.

## Owned files (this pass)

`apps/api/`, `packages/shared/`, `package.json` files and the lockfile for this one
package, tests in `tests/api/`, `directives/contracts/b_auth.md`,
`directives/reports/b_passkeys_build.md`. Not yours: `apps/web/src/`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
`RUN_API_TESTS=1` on your own ports, server stopped after, with a software
authenticator in the test (say which): sign-up makes one user with a username and a
passkey and no real email; a ceremony that stops early leaves no row; a taken and a
reserved name are refused; sign-in; the sixth sign-up in an hour from one address is
429; a recovery code works once and its session can only add a passkey; five bad
codes are 429; the last passkey cannot be removed; a social account adds a passkey;
the three social sign-ins still work as before (their tests unchanged).

## Stop rule

Stop when the gates pass and the report and contract are written, or at a lockfile
change beyond the one package.

Write `directives/reports/b_passkeys_build.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: read the design note and the 1.7.7 passkey plugin. The ceremony can create the user after verification, so no pending row is required. next: migration 0012 from the plugin's column names.
done: migration 0012 from the plugin column names (name, publicKey, userId, credentialID, counter, deviceType, backedUp, transports, createdAt, aaguid). next: wire username, passkey, and recovery.
done: wired sign-up after verification, recovery codes, the last-way-in checks, and the recovery gate. next: black-box test on a private port.
done: the passkey API test passed once with a Node WebCrypto P-256 authenticator. next: re-run the gates on startDev, then write the contract and the report.
done: gates passed and directives/contracts/b_auth.md is written. next: the report.
done: directives/reports/b_passkeys_build.md written. next: stop.

