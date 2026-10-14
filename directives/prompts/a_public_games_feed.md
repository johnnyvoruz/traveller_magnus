# Lane A — wrap link-social; then the public games feed and its mark on the map

Issued 2026-10-12 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/A.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Username and passkey sign-in went out in version 1.1.11 (`ef92359`) and is
deployed; your sign-out fix is live.

## 1. Small: `account/passkey.ts` wraps `link-social`

`directives/contracts/b_auth.md`, "Linked providers": a signed-in person links a
provider with `POST /api/auth/link-social` and `{ provider, disableRedirect: true,
callbackURL }`. Lane D's `workspace/passkey/link.ts` stands in for it. Add
`linkProvider(provider, callbackURL)` to your client with the same typed results as
the rest (the already-linked refusal carries the server's sentence), a test, and one
line in `findings/passkey_client.md`. Lane D then deletes its stand-in. `startSocial`
stays for signing in.

## 2. Public games: the feed

Contract: `directives/contracts/b_public_games.md` (built; read "What Lanes A and D
need" and "Abuse"). Johnny's rulings: one mark per hex and the universe's name only
when that hex has one game; a count when more; hex precision only; opt-in; shared
only between maps on the same non-null truth version.

- A small store in `apps/web/src/map/` or `builder/` (say which and why): for each
  sector drawn at the hex tier, when the map's truth pin is not null and a person is
  signed in, one `GET /api/public-games?truthVersion=&sector=`. **No polling.** One
  call per sector per visit to that sector; held while the sector stays in view; a
  sector seen again after leaving is asked again no sooner than 60 seconds later.
  The server allows 60 calls a minute: stay far under it when panning (say your
  worst case, with a test).
- Signed out, a null pin, an own sector (`~` slug): no call.
- 401, 429, 5xx, offline: no mark, no error on screen, no retry storm.
- **Your own game is not drawn as a public mark on your own map** (the contract says
  whether the feed includes the asker's own universe; if it does, drop it here and
  say so).
- The server is live with migration 0013 **not** applied, so today the feed answers
  `{ hexes: [] }`: build and test against a stub with the contract's shape, and show
  the live empty answer draws nothing.

## 3. Public games: the mark (lent: `apps/web/src/map/MapRenderer.ts`, one new setter and one draw call)

- One small mark in the hex, distinct from a system's dot, a vessel mark and a
  selection, from tokens only (append tokens to `design/tokens.css`). The universe's
  name beside it when `name` is a string, at the zooms where hex labels are drawn; a
  count when there is more than one game; nothing zoomed out past the hex tier.
- It is not interactive in this version: no click, no hover card, no entry in any
  list. It must not block a click on the hex under it.
- Draw time with 0, 10 and 200 marks in view; no cost when there are none.
- `MapView.vue` is Lane D's: write the two or three lines it needs (where the store
  is told which sectors are drawn, where the setter is called) in your report, as
  you did for the dots. Do not edit that file.

## Owned files (this pass)

`apps/web/src/account/`, `apps/web/src/builder/`, `apps/web/src/map/` (your store),
lent: `apps/web/src/map/MapRenderer.ts` (the setter and the draw). Tests in
`tests/web/`. `directives/reports/a_public_games_feed.md`. Not yours: `views/`,
`workspace/` (Lane D), `apps/api`, `packages/` (Lane B).

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted, with the
`index` chunk size (about 171 kB; the feed must not add zod to the first chunk: a
type-only import and a hand check, as in the session). Fourth gate: the store and
renderer tests named above.

## Stop rule

Stop when the gates pass and the report is written.

Write `directives/reports/a_public_games_feed.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: linkProvider posts link-social and keeps the server's refusal sentence. next: the public-games store.
done: public-games store and the diamond in MapRenderer. next: the store and renderer tests.
done: store and renderer tests, check, typecheck, and the web build. next: the report.
done: the report. next: stop.

