# Orchestrator state — 2026-10-12 21:05

Overwritten every turn. History is `handoff.md` (last section: 255).

## Where the roadmap is
Pushed: 1.1.8 (`57ec8d0`). On disk: 1.1.9, push list `findings/push/builder_2026-10-12b.md`; Johnny said pushed at 21:05 but HEAD was still 57ec8d0.
Builder: density, cap, allowance on screen, own dots zoomed out, speed: all built.
Passkeys: server built and held out of pushes (gate fault); client A, screens D.
Then public games (B is reading the contract). Campaign: handout images E; Player
Pack note done, eight questions with Johnny.

## Lanes
- A go: `a_passkey_client` (first: main chunk 251 -> 169 kB, the value import of
  `GenerationAllowance` in `account/session.ts`; then the client from
  `contracts/b_auth.md`, lazy, note `findings/passkey_client.md`; then
  `selectionOutline` over dots). Accepted: `session.allowance`, `builder/allowance.ts`,
  `AllowanceRefused`.
- B go: `b_auth_gate_dots` (recovery gate: no extra D1 read, safe without 0012; dots
  route without overview; `findings/public_games_ready.md`). Accepted: entry images
  (`images` on `CampaignEntryObject`, ALTER for old tables), speed (slice read, trees
  six at a time, counts at the end, a job's own posts skip the 120 budget, a busy job
  fails with a sentence; local gain about 15 to 25 percent, store is still the bulk),
  passkey build (migration 0012 with seven objects, `passkey_flow.ts`, software
  authenticator test). B freezes at worker suites.
- C go: `c_ice_caps_2` (look first; edge follows land and sea, broken margin, ice
  area within 2 percent). City lights accepted (`enhanced-cities-4c`).
- D go: `d_passkey_screens` (stub until A's note; the recovery screen is in, sign-out
  allowed: Johnny). Accepted: A's two calls with a cached map, `allowance_words.ts`,
  the held toast until `job` is set.
- E in flight: `e_handout_images_2` part 2, then `e_player_pack` (Johnny: yes to all
  eight; leak test is the gate).
  Its first report is `reports/done/e_handout_images_2_part1.md`.
- **F is retired.**

## Passkey paths held out of every push until B's gate fix is accepted
apps/api/package.json, apps/web/package.json, package-lock.json,
apps/api/src/db/migrations/0012_passkey.sql, apps/api/src/db/auth-schema.ts, schema.ts,
apps/api/src/auth/passkey_data.ts, passkey_flow.ts, passkey_words.ts, recovery_gate.ts,
options.ts, apps/api/src/index.ts, apps/api/src/routes/auth.ts, tests/api/passkeys.test.js,
tests/api/software_authenticator.js, directives/contracts/b_auth.md,
directives/reports/done/b_passkeys_build.md.

## Next turn
1. Check HEAD: 1.1.9 was not committed at 21:05 though Johnny said pushed.
2. Chains: A client note -> D wires. B gate fix -> the passkey paths join a push,
   with the screens if ready. E handout images -> its eight files join a push.
3. B's `findings/public_games_ready.md` -> the public games build prompts.
4. Deploy notes for Johnny: migrations with the Worker (`npm run deploy:ci`); his
   account role `admin`; optional `retry_delay = 10` on the generate consumer.

## Versions
Every push list bumps `APP_VERSION` in `apps/web/src/version.ts` by one in the last
place and lists the file; the commit message starts with the version. Engine version
untouched (fixtures folder name).

## Traps
- **Flow (Johnny): questions first.** Reply order QUESTIONS, GO, PUSH. A lane is not
  given GO while a question that could change its prompt is open; a held part is
  named as held inside the prompt.
- Undo is low priority: no Undo polish unless something more important needs it.
- A live fault is looked at on the live page first. The sector in a URL is
  `Spinward_Marches`.
- **Read a server lane's new middleware before pushing it**: a per-request read or a
  dependence on migration order is a deploy hazard (the recovery gate, this turn).
- `findings/` is git-ignored: never in a push list.
- **Clean copy:** `outerN/node_modules` = junction to the repo's; `outerN/clean` =
  `git archive HEAD` plus the push paths; `clean/node_modules/@voyage/{engines,
  generation,shared,api}` = junctions to the copy's own packages (PowerShell
  `New-Item -ItemType Junction`); `node scripts/gen_rules_esm.js`,
  `gen_names_esm.js`, `node --test "tests/**/*.test.js"`, `check_manifesto.js`. Known
  artefact: one zod failure in `tests/web/campaign_import.test.js`. Fresh `outerN`
  each time (last used: outer12).
- "All agents reported" and "frozen" are checked against `reports/`, Progress lines
  and file times. Read "Needs from others" before writing the next lane's prompt.
- `handoff.md` is large: read by offset. Never print a golden test's assertion output.
- The six engine water-against-ice paths and the ten parked truth-build paths stay
  out of every push.
- Google developer style in every prompt that has an agent write UI text.
- Prompts with the Write tool; scripts as files; `date` for time stamps.
- Rules questions are answered from `rules/` with citations, never from memory.
