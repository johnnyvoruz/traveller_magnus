# B passkeys report
Prompt: prompts/b_passkeys.md
Status: blocked

found: better-auth 1.7.7 is installed with the admin plugin and the three social providers. It has no passkey plugin, and the app stores a required unique email.
finished: the design note only. No package was installed and no route was added.
backed out: nothing.

## Changed files
- `findings/passkey_signin_design.md`: the eight answers, with the package named for approval.

## Gates
npm test:      not run for this prompt. The cap pass already passed 1474 tests. This prompt changed no code.
npm run check: not run. No source change.
typecheck:     not run. No source change.
fourth gate:   not run. Step 2 waits on the dependency.

## Contract published
none

## Needs from others
none yet. The screen routes belong in `directives/contracts/b_auth.md` after the package is approved.

## Questions for Johnny
1. May I add `@better-auth/passkey` at 1.7.7, the same version as the installed `better-auth`? It depends on `@simplewebauthn/server` and `@simplewebauthn/browser`. The published unpacked size is 9.4 MB. I recommend yes, pinned to 1.7.7, and no other auth package. The two-factor plugin stays out.
2. Local passkeys need `http://localhost:8787`, not `http://127.0.0.1:8787`. The passkey docs allow `localhost` and do not list an IP origin. I recommend you set `BETTER_AUTH_URL` in `.dev.vars` to `http://localhost:8787` when you try a passkey. Production stays `https://traveller.voyage` with `rpID` `traveller.voyage`.
3. Sign-up with no email is open to a bot. I recommend a limit of 5 passkey ceremonies an hour for one address, and Turnstile only if that is not enough. The daily generation cap does not cover creating the account.
