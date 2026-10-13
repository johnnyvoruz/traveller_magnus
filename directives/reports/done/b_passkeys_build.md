# B passkeys build report
Prompt: prompts/b_passkeys_build.md
Status: done

found: the prompt's Progress had only the design-note line. No passkey source, migration, or test was half-written. Other lanes' dirty files were left as they were.
finished: nothing left over from a frozen session. This session wrote the server, the test, the contract, and this report.
backed out: nothing.

## Changed files
- `apps/api/package.json`: `@better-auth/passkey` pinned at `1.7.7`. `better-auth` stays `^1` (resolved `1.7.7`). npm sorted the keys. No other version changed.
- `apps/web/package.json`: `better-auth` and `@better-auth/passkey`, both exact `1.7.7`. No file under `apps/web/src/` was edited.
- `package-lock.json`: the passkey tree was added (`@simplewebauthn/browser` 13.3.0, `@simplewebauthn/server` 13.3.3, and their new packages). Removed lines are `"dev": true`, `"license": "0BSD"`, and `"optional": true`. No installed package moved to another version, so the install was kept.
- `apps/api/src/db/migrations/0012_passkey.sql`: `user.username`, `session.must_add_passkey`, `passkey`, `recovery_code`, plus `recovery_failure`, `recovery_envelope`, and `passkey_signup`.
- `apps/api/src/db/auth-schema.ts` and `schema.ts`: the same columns and tables for Drizzle.
- `apps/api/src/auth/passkey_words.ts`: the sentences and the username check.
- `apps/api/src/auth/passkey_data.ts`: address, rate limit, last-way-in checks, allowance, handle sync, and recovery hashes.
- `apps/api/src/auth/passkey_flow.ts`: sign-up after verification, username, reveal, regenerate, and redeem.
- `apps/api/src/auth/recovery_gate.ts`: a recovery session is refused on `/api/*` outside `/api/auth` by reading `session.must_add_passkey`. It does not call `getSession`.
- `apps/api/src/auth/options.ts`: username plugin, passkey plugin (`requireSession: false`), relying party from `BETTER_AUTH_URL`, `mustAddPasskey` on the session.
- `apps/api/src/index.ts`: mounts the recovery gate.
- `apps/api/src/routes/auth.ts`: `GET /api/me` adds `username`, `hasPasskey`, `unusedRecoveryCodes`, and `linkedProviders`. The previous fields stay.
- `tests/api/software_authenticator.js`: Node WebCrypto ECDSA P-256, attestation `none`. Checked by `@simplewebauthn/server` 13.3.3.
- `tests/api/passkeys.test.js`: port 18847, inspector 19847, persist `.tmp/lane-b-passkeys`. Applies D1 migrations before `wrangler dev`, because a fresh persist does not finish migrations before the first request.
- `directives/contracts/b_auth.md`: the screen contract.
- `directives/prompts/b_passkeys_build.md`: Progress lines.

`tests/api/health.test.js` was not edited.

## What the plugin schema said
`@better-auth/passkey` 1.7.7 fields: `name`, `publicKey`, `userId`, `credentialID`, `counter`, `deviceType`, `backedUp`, `transports`, `createdAt`, `aaguid`, plus the model `id`. SQL uses the same snake_case as `user` and `session`. `credentialID` is `credential_id`, with a unique index. The plugin asked only for an index.

1.7.7 can create the user after verification. `resolveUser` returns a new id and the username and does not insert. `afterVerification` inserts the user, then the plugin inserts the passkey. `createSession: true` wraps that in one transaction. No pending user row.

Extra tables, beyond the three objects in the design note: `recovery_failure` (five bad codes in 15 minutes), `recovery_envelope` (the ten codes, sealed, deleted on reveal), `passkey_signup` (five signed-out ceremonies an hour), and `session.must_add_passkey`. Recovery `created_at` is integer milliseconds.

A new passkey account gets a `generation_allowance` row at the same default as any other account (100).

## Relying party
No new variable. `wrangler.toml` already has `BETTER_AUTH_URL = "https://traveller.voyage"`. A local browser ceremony needs `BETTER_AUTH_URL=http://localhost:8787` in `apps/api/.dev.vars`. That file was not edited.

## Gates
npm test:      pass (1503 pass, 0 fail, 22 skipped). The skips are the API files, which stay skipped unless `RUN_API_TESTS=1`.
npm run check: pass (`manifesto: clean`)
typecheck:     pass (`tsc --noEmit -p apps/api`, exit 0)
npm run build: pass (exit 0). Vite printed `INEFFECTIVE_DYNAMIC_IMPORT` for `apps/web/src/router.ts`, imported by `apps/web/src/workspace/market/command.ts`. That file was not part of this pass.
fourth gate:   pass. `RUN_API_TESTS=1 node --test tests/api/passkeys.test.js` on port 18847: `username and passkey sign-in` passed (24472 ms). Server stopped after. `RUN_API_TESTS=1 node --test tests/api/health.test.js` passed (`health envelopes`, 3667 ms), including the three social starts. Ports 8799 and 18847 were not listening afterwards.

The authenticator is a Node WebCrypto P-256 software authenticator (`tests/api/software_authenticator.js`), verified by `@simplewebauthn/server` 13.3.3.

Covered in that test: one user with username `ada_lane`, one passkey, email ending `@users.invalid` and not verified; an early stop leaves no row; a taken name and `Admin` are refused; sign-in returns that username; the sixth signed-out ceremony from one address is 429 `signup_limit`; a recovery code works once; that session gets 403 `passkey_required` on `GET /api/me` and on `GET /api/auth/get-session`, then a second passkey clears it; five bad codes end in 429 `recovery_limit`; the last passkey is refused; a Google account adds a passkey and can unlink; an account with only Google cannot unlink; Google, Discord, and X start as before (200 with a provider URL, or 404 `PROVIDER_NOT_FOUND`).

## Contract published
`directives/contracts/b_auth.md`

Real routes are the 1.7.7 ones: `GET /api/auth/passkey/generate-register-options`, `POST /api/auth/passkey/verify-registration`, `GET /api/auth/passkey/generate-authenticate-options`, `POST /api/auth/passkey/verify-authentication`. The design note's `POST /passkey/add-passkey` and `POST /sign-in/passkey` are not in this version. The client methods are `authClient.passkey.addPasskey` and `authClient.signIn.passkey`.

## Needs from others
- Lane A (web build): the Vite warning above. The build exited 0. Not changed here.

## Questions for Johnny
1. Should a recovery session be allowed to sign out? Recommended answer: yes. Allow `POST /api/auth/sign-out` and no other extra route, so a person is not kept on a 30-day session when adding a passkey fails. Today that call is refused with 403 `passkey_required`, the same as every route except the two passkey registration calls. The strict reading is what is implemented.
