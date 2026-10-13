# Lane B public games report
Prompt: prompts/b_public_games.md
Status: done

Found: the auth contract already stated list-accounts, link-social, the JSON body rule, the local passkey recipe, and createdAt. The public-games server was on disk and unrun. The contract still said "not built".
Finished: the linking test, the Worker checks for list-accounts, createdAt, and a body-less sign-out, and public games steps 1 to 5, including the no-0013 path. The contract is marked built.
Backed out: nothing.

## Changed files
- directives/contracts/b_auth.md: list-accounts fields, link-social, the JSON body rule, the local passkey recipe, production rpID and origin, createdAt.
- apps/api/src/auth/linking.ts, auth_http.ts, options.ts, passkey_words.ts, index.ts: account linking on the ready path; a body-less sign-out rewritten to `{}`; the already-linked sentence on the redirect.
- tests/api/account_link.test.js: a passkey-style account links a provider and stays the same user; a second account is refused with the sentence. In-process, not the Worker.
- tests/api/passkeys.test.js: body-less sign-out, createdAt as an ISO string, list-accounts as a bare array.
- packages/shared/src/public_hex.ts, schemas/public_games.ts, index.ts: the hex function and the public-games schemas.
- tests/shared/public_games.test.js: parked hex, flight, jump, a `~` slug, no vessel.
- apps/api/src/db/migrations/0013_public_games.sql: `public_games` and `public_marks`.
- apps/api/src/auth/public_schema.ts, universe/public_mark.ts, universe/forward.ts, routes/public_games.ts, routes/universes.ts, index.ts: the switch, the recompute, the feed, and the delete of the mark.
- tests/api/public_games.test.js: two accounts, on and off, a move, a second game, two truth versions, a null truth version, the leak test, the 61st poll, and no-0013.
- directives/contracts/b_public_games.md: sections marked built, plus cost, the rate limit, and what Lanes A and D need.

## Gates
npm test:      pass (1566 tests, 1542 pass, 0 fail, 24 skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass (`tsc --noEmit -p apps/api`)
npm run build: pass
fourth gate:   pass. `tests/api/public_games.test.js` on 18850 then 18851. `tests/api/passkeys.test.js` on 18847. `tests/api/health.test.js` on 8799. Servers stopped. No listener left on those ports.

## Contract published
contracts/b_auth.md and contracts/b_public_games.md

## Needs from others
- Lane A: the feed and the switch are at the end of contracts/b_public_games.md. Call the feed when a sector is drawn and the pin is set. Do not poll. `account/passkey.ts` `startSocial` still posts `POST /api/auth/sign-in/social`. The passkey account page (`workspace/passkey/AccountPage.vue`, Lane D's tree) already posts `link-social`. Keep sending a JSON body on sign-out. The Worker also accepts a body-less sign-out, so an old cached page can sign out. Pass `createdAt` through from `list-user-passkeys`. The dot prompt has to name `map/MapRenderer.ts`.
- Lane D: the local passkey recipe and the production origin path are in contracts/b_auth.md.
- Orchestrator: the board still says contracts/b_auth.md is held out of pushes until the gate is fixed. This prompt says that gate is accepted. The board was not edited.

## Questions for Johnny
1. `GET /api/universes` does not include whether public games are on. After a reload, the switch only knows the value from the last PATCH, and a new universe is off. Recommended answer: add `publicGames: boolean` on the universe object the owner already loads, and only when migration 0013 is present. When 0013 is missing, omit the field so that response stays as it is today. I left `present()` unchanged so a Worker without 0013 still answers the old shape.
