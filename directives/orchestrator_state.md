# Orchestrator state — 2026-10-12 22:15

Overwritten every turn. History is `handoff.md` (last section: 256).

## Where the roadmap is
Pushed: 1.1.9 (`615add4`). On disk: 1.1.10, push list `findings/push/builder_2026-10-12c.md`.
Builder: done bar polish. Passkeys: server, client and screens all built, held one
more push for A's sign-out and closed-prompt fixes. Public games: B building the
server (migration 0013); browser side after. Campaign: handout images done; Player
Pack with E. D is reviewing the live site as a first visitor.

## Lanes
- A go: `a_signout_fix` (live: body-less sign-out is 415; cancelled ceremony code;
  `createdAt`; `guardRecovery(router)` in router.ts; importer reads journal).
  Accepted: bundle back to 171 kB, `account/passkey.ts`, sector outline when zoomed out.
- B go: `b_public_games` (part 1 contract lines for A and D; part 2 server steps 1
  to 5 of `findings/public_games_ready.md`, leak test, safe without 0013). Accepted:
  recovery flag off the session lookup, `passkey_schema.ts` probe, legacy tables when
  0012 is absent, dots 503 `chart_unavailable`.
- C free: `c_ice_caps_2` accepted (sheet: `capDetail` paint near the melt line, hex
  class unchanged so ice area identical; disc: four simplex scales, floes, south
  offset; disc ice pins re-pinned in `scripts/surface_parity.js`;
  `hybrid-surface-3`). Next: surface findings from D's review.
- D go: `d_first_run_review` (part 1 read-only on live; part 2 follow-ups gated on
  A's report). Accepted: `workspace/passkey/` (SignInBody, AccountPage,
  RecoveryScreen, CodesBlock, PasskeyAdd, words.ts, recovery.ts).
- E go: `e_player_pack` (Johnny's eight answers inside; leak test is the gate).
  Accepted: `EntryGallery.vue`, `entry_images.ts`.
- **F is retired.**

## Passkey set, held out of pushes until A's `a_signout_fix` is accepted
Server: apps/api/package.json, apps/web/package.json, package-lock.json,
apps/api/src/db/migrations/0012_passkey.sql, db/auth-schema.ts, auth-schema-legacy.ts,
schema.ts, auth/auth.ts, session.ts, options.ts, passkey_data.ts, passkey_flow.ts,
passkey_schema.ts, passkey_words.ts, recovery_gate.ts, src/index.ts, routes/auth.ts,
tests/api/passkeys.test.js, passkey_schema.test.js, software_authenticator.js,
directives/contracts/b_auth.md. Browser: apps/web/src/account/passkey.ts,
workspace/passkey/, workspace/SignInCard.vue, views/Account.vue,
tests/web/passkey_client.test.js, passkey_screens.test.js. Reports in done/:
b_passkeys_build, a_passkey_client, d_passkey_screens, b_auth_gate_dots.

## Next turn
1. If Johnny pushed 1.1.10: record the hash (not pushed at 22:10; A, B, D, E had not
   started their new prompts then).
2. A's report: the passkey set joins a push (needs migration 0012 with the deploy;
   safe either order now). Sign-out fix is urgent: push it even if the rest lags.
3. C's report: ice caps; show Johnny the before-and-after sheet.
4. B's report -> public games browser prompts (A: feed and mark, MapRenderer.ts
   lent; D: the switch).
5. D's review -> rank with Johnny; E's Player Pack.
6. Deploy notes for Johnny: migrations with the Worker (`npm run deploy:ci`); his
   account role `admin`; optional `retry_delay = 10` on the generate consumer.

## Versions
Every push list bumps `APP_VERSION` in `apps/web/src/version.ts` by one in the last
place and lists the file; the commit message starts with the version. Engine version
untouched (fixtures folder name).

## Traps
- **Flow (Johnny): questions first.** Reply order QUESTIONS, GO, PUSH. A lane is not
  given GO while a question that could change its prompt is open; a held part is
  named as held inside the prompt.
- **"Pushed" is checked with `git log` and `git log origin/campaign`** before the
  hash is recorded (2026-10-12: said pushed, was not).
- **A push list is checked at one moment; lanes keep editing.** Tell Johnny to push
  before saying go, or the commit carries later edits (1.1.9 carried A's newer
  `session.ts`; it happened to be good).
- Undo is low priority: no Undo polish unless something more important needs it.
- A live fault is looked at on the live page first (`curl` is enough for a route).
  The sector in a URL is `Spinward_Marches`.
- Read a server lane's new middleware before pushing it: a per-request read or a
  dependence on migration order is a deploy hazard.
- `findings/` is git-ignored: never in a push list.
- **Clean copy:** `outerN/node_modules` = junction to the repo's; `outerN/clean` =
  `git archive HEAD` plus the push paths; `clean/node_modules/@voyage/{engines,
  generation,shared,api}` = junctions to the copy's own packages (PowerShell
  `New-Item -ItemType Junction`); `node scripts/gen_rules_esm.js`,
  `gen_names_esm.js`, `node --test "tests/**/*.test.js"`, `check_manifesto.js`. Known
  artefact: one zod failure in `tests/web/campaign_import.test.js`. Fresh `outerN`
  each time (last used: outer13).
- "All agents reported" and "frozen" are checked against `reports/`, Progress lines
  and file times. Read "Needs from others" before writing the next lane's prompt.
- `handoff.md` is large: read by offset. Never print a golden test's assertion output.
- The six engine water-against-ice paths and the ten parked truth-build paths stay
  out of every push.
- Google developer style in every prompt that has an agent write UI text.
- Prompts with the Write tool; scripts as files; `date` for time stamps.
- Rules questions are answered from `rules/` with citations, never from memory.
