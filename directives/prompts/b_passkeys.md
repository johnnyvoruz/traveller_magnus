# Lane B — sign in with a username and a passkey: no email, no password

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/B.md`,
`findings/signin_setup.md`, then this file. No git but read-only, no deploy, no
`rules/`, no Traveller rule from memory. Do `prompts/b_keep_crash_dots.md` and
`prompts/b_generate_cap.md` first if they have no report yet. This prompt goes before
`prompts/b_generate_speed.md` (Johnny's order).

## What Johnny decided (2026-10-11)

His users care about privacy. They want a username and a passkey and nothing else.

- **An account is a username and a passkey. The app asks for no email** and sends
  none. No email service is set up.
- **No password, anywhere. No two-factor or authenticator-code option.**
- **Recovery is one-time recovery codes**, shown once when the passkey is created;
  each works once and lets the person create a new passkey. The account page nudges
  them to add a second passkey. Linking Google, Discord or X stays possible as an
  optional backup, never required.
- **If the passkey, the codes and any linked provider are all lost, the account is
  lost.** Johnny does no manual recovery. The screen that shows the codes says so.
- X, Discord and Google sign-in stay as they are. Two sign-ins that share an email
  the provider reports as verified are one account (that can only happen between
  those three now).

## What the orchestrator read

`apps/api/src/auth/options.ts`: better-auth 1.7.7 with `plugins: [admin()]` and the
three social providers. The installed package's `dist/plugins` has `username`,
`anonymous`, `two-factor`, `email-otp`, `magic-link` and others, and **no passkey
plugin**; there is no `@better-auth/passkey` in `node_modules`. Everything about what
better-auth offers must come from its documentation and the installed source, read
now and cited (page and date, or file and line), not from memory.

## Step 1: a design note first, before any code

Write `findings/passkey_signin_design.md` and stop for the orchestrator if any of
these has no clean answer:

1. **The passkey package**: its name and the version that matches 1.7.7, what it adds
   (routes, tables, client calls), and what installing it changes in
   `package-lock.json`. A new dependency is Johnny's to approve: name it, its size and
   its own dependencies.
2. **Creating an account with only a passkey.** Does the plugin register a passkey
   for a person who is not signed in yet, or only add one to an existing session? If
   only the second, give the cleanest supported way to get there (for example a
   short-lived pending account that becomes real when the passkey is registered) and
   what happens to a pending account nobody finishes. No path may leave a usable
   account with no way to sign in.
3. **No email.** better-auth's user table expects an email. Say exactly what is
   stored for a passkey account (nothing, null if the schema allows it, or a value
   that is plainly not an address and can never collide or be mailed), and check that
   no code path of ours or the library's tries to use it.
4. **The username**: the `username` plugin or our existing profile handle
   (`apps/api/src/auth/profile.ts` `ensureProfile`, the handle the marketplace
   listing shows): one name, not two. Rules for it (length, characters, case,
   reserved names, uniqueness) from what the profile already enforces.
5. **Recovery codes.** The two-factor plugin has backup codes; say whether they can be
   used without a password and without turning two-factor on. If not, a small table of
   our own: how many codes, their length and alphabet, stored only as hashes, each
   used once, regenerating replaces the set, rate-limited, constant-time compare. Say
   what a code does: signs the person in once, into a state where the first thing
   they must do is create a new passkey.
6. **The relying party**: `rpID` and origin for production (`traveller.voyage`),
   preview and local (`localhost`), from `BETTER_AUTH_URL`; what Johnny must set.
7. **Abuse**: sign-up with no email is free to a bot. What limits account creation
   (rate limit by address, Turnstile through the `captcha` plugin, the daily
   generation cap already there), and your recommendation.
8. **Migration** `0012` (or the next free number): the tables and columns.

## Step 2: contract, then code

`directives/contracts/b_auth.md` (new): every route the browser calls (begin and
finish registering, begin and finish signing in, list, add, rename and remove a
passkey, show and regenerate recovery codes, use a recovery code, link and unlink a
provider), each with its body, answer, errors with stable codes, and the sentence for
each error in the Google developer documentation style. Then build it. A person can
never remove their last way in (their only passkey with no codes left and no linked
provider): refuse with a sentence.

## Owned files (this pass)

`apps/api/`, `packages/shared/`, `tests/api/`, `tests/shared/`, the contract, the
design note, a setup note for Johnny (`findings/passkey_setup.md`: what to set and
what he should see), `directives/reports/b_passkeys.md`. `package.json` and the lock
file only for the one approved dependency. Not yours: `apps/web`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
`RUN_API_TESTS=1` on your own ports, server stopped, with a software authenticator in
the test (say which library or how the WebAuthn responses are made): register a new
account with a username and a passkey; sign in; add a second passkey; remove one;
refuse removing the last way in; show codes; sign in with a code and be made to
create a passkey; a used code refused; regenerate; link a provider; no email stored
or sent anywhere (grep the database after the run and paste the user row).

## Stop rule

Stop after step 1 if a question in it needs Johnny (the dependency always does: put
it first in the report with your recommendation). Otherwise stop when step 2 passes
and the report is written.

Write `directives/reports/b_passkeys.md` from `directives/reports/_TEMPLATE.md`. Under
"Needs from others" give the screens lane the routes in ten lines. Questions for
Johnny written out in full, recommended answer first. After each meaningful step
append one line under Progress: "done: X. next: Y."

## Progress
