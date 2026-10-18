Found: Progress was empty, and no half-done gate or dots edit was in the tree. The passkey build stayed as its own report. Other lanes' dirty files were left alone.
Finished: the recovery flag rides on the session lookup, a database without migration 0012 still serves signed-in routes, a missing overview is 503, a recovery session may sign out, and a recovery GET /api/me is 403. The public-games note is written.
Backed out: nothing.

# B auth_gate_dots report
Prompt: prompts/b_auth_gate_dots.md
Status: done

## Changed files
- apps/api/src/auth/passkey_schema.ts: one pragma per isolate. A missing `must_add_passkey` column is logged once and means "not a recovery session".
- apps/api/src/db/auth-schema-legacy.ts: user and session tables without `username` and `must_add_passkey`, used only when 0012 is absent.
- apps/api/src/auth/auth.ts: the adapter uses those legacy tables when the probe misses.
- apps/api/src/auth/options.ts: when the probe misses, auth matches commit 57ec8d0 (social providers and the admin plugin only).
- apps/api/src/auth/recovery_gate.ts: the per-request `SELECT must_add_passkey` is gone. The flag is read off the session object.
- apps/api/src/auth/session.ts: `getSession` runs the before hook, which throws `passkey_required` for a recovery session. That throw is returned as the app-envelope 403. Any other error still propagates.
- apps/api/src/auth/passkey_flow.ts: a recovery session may call `POST /api/auth/sign-out` and the two passkey registration routes. No other extra route.
- apps/api/src/index.ts: with 0012 missing, passkey, username, and recovery routes answer 503 before Better Auth. Social sign-in is unchanged.
- apps/api/src/auth/passkey_words.ts: the 503 sentence is "Passkey sign-in is not available yet."
- apps/api/src/auth/passkey_data.ts: one profile-card statement covers the profile, the username, the passkey count, unused recovery codes, and linked providers.
- apps/api/src/routes/auth.ts: `GET /api/me` uses that statement when 0012 is present. When it is absent, the four new fields are empty.
- apps/api/src/routes/builder.ts: an unreadable overview is cached as unread. A chart slug on that universe is 503 `chart_unavailable`. An own sector id, a universe with no truth version, and a slug a readable overview simply omits stay on the 1,280-dot path.
- tests/api/passkey_schema.test.js: Worker against a database with the 0012 columns dropped. Port 18849.
- tests/api/passkeys.test.js: a recovery session signs out, then `GET /api/me` is 401.
- tests/api/builder_dots.test.js: overview missing, overview malformed, and a sector absent from a readable overview.
- directives/contracts/b_auth.md: Recovery allows sign-out. The error table has `passkey_unavailable`.
- directives/contracts/b_builder.md: a missing overview is not the 1,280-dot case.
- findings/public_games_ready.md: read-only note. Nothing in that contract was built.

## D1 reads
At 57ec8d0, a signed-in `GET /api/me` was one session lookup, the profile read inside `ensureProfile`, the `lastSeenAt` update, and the allowance reads. A signed-in builder read was that session lookup plus one `universes` select.

The passkey build had added a second session read on every signed-in request, plus two more statements on `GET /api/me`. Those three are gone.

Steady `GET /api/me`, with 0012 applied and the profile already stored: the same session lookup (it now also selects `username` and `must_add_passkey`), one profile-card statement, the `lastSeenAt` update, and the same allowance reads. The first request in an isolate also runs the pragma once. That result is cached. A missing profile still runs `ensureProfile`, then the profile-card statement once.

A signed-in builder read is the session lookup plus the `universes` select. The Durable Object dots SQL is unchanged. The pragma is the only extra read, and only on the first request of an isolate.

Without 0012, passkey, username, and recovery routes answer 503 `passkey_unavailable`. Google, Discord, and X sign-in, and every existing route, behave as they do at 57ec8d0. `GET /api/me` returns `username: null`, `hasPasskey: false`, `unusedRecoveryCodes: 0`, and `linkedProviders: []`.

## Dots
The answer is an HTTP error. `cells` stays a 1,280-character string. No shared schema change and no `apps/web/src` change. The software authenticator is unchanged.

## Gates
npm test:      pass (1550 tests, 1527 pass, 0 fail, 23 skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass (`tsc --noEmit -p apps/api`)
npm run build: pass
fourth gate:   pass, then the servers were stopped
- tests/api/passkeys.test.js pass (21.2s, port 18847). Recovery `GET /api/me` is 403, `GET /api/auth/get-session` is 403, sign-out is 200, and the next `GET /api/me` is 401.
- tests/api/health.test.js pass (2.3s, port 8799)
- tests/api/builder_dots.test.js pass (16.3s, port 18842)
- tests/api/passkey_schema.test.js pass (10.3s, port 18849)

## Contract published
directives/contracts/b_auth.md (Recovery, and the 503 row)
directives/contracts/b_builder.md (dots)

## Needs from others
none

## Questions for Johnny
none. A recovery session may sign out. That answer is in the contract and in the passkey test.

## Public games
findings/public_games_ready.md. The next migration is 0013. Lane A calls `GET /api/public-games` when a sector is drawn and the pin is non-null. Lane D owns the on/off switch. The prompt that draws the dot has to name `map/MapRenderer.ts`. No question is left for Johnny.
