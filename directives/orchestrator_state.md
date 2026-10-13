# Orchestrator state — 2026-10-12 23:00

Overwritten every turn. History is `handoff.md` (last section: 256).

## Where the roadmap is
Pushed: 1.1.10 (`f99a8a2`). On disk: **1.1.11, the passkey release**, push list
`findings/push/builder_2026-10-12d.md`. After it: public games in the browser, D's
first-visit review (top ten), the Regina investigation (C, read-only, in flight).

## Lanes
- A held until the push. Next prompt: wrap `link-social` in `account/passkey.ts`
  (D's `workspace/passkey/link.ts` then goes); the public games feed
  (`contracts/b_public_games.md`, end section) and the mark (MapRenderer.ts lent).
- B held until the push. Next prompt: run the eight Builder worker suites with 0013
  applied (the raw SQL path in `ownedUniverse`); `publicGames` on the owner's
  universe list (Johnny: yes); then 0013 and `tests/api/public_games.test.js` join
  a push. Speed leftovers (quota race, byte double count) if time.
- C in flight: `c_regina_temperature` (read-only).
- D held until the push. Next prompt: "Your map" and the universe's name on the
  Build strip; first visit opens on the Spinward Marches with one line of help; the
  review's top ten in its files; the public games switch after B.
- E free. Player Pack accepted (`apps/web/src/pack/`, leak test). Next: review
  findings in `workspace/journal/` (13, 14), or the next Campaign step.
- **F is retired.**

## Held out of 1.1.11
`apps/api/src/db/migrations/0013_public_games.sql`, `tests/api/public_games.test.js`,
the six engine paths, the ten parked truth-build paths.

## Next turn
1. Check `git log` and `origin/campaign` for 1.1.11 before recording a hash.
2. Deploy for Johnny: `npm run deploy:ci` (migration 0012 with the Worker); then a
   real sign-up on production is the first true test of rpID and origin; his own
   account can add a passkey from the account page.
3. Write the four held prompts (A, B, D, E) as soon as the push is confirmed.
4. C's Regina note will bring engine questions for Johnny.

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
  each time (last used: outer15).
- "All agents reported" and "frozen" are checked against `reports/`, Progress lines
  and file times. Read "Needs from others" before writing the next lane's prompt.
- `handoff.md` is large: read by offset. Never print a golden test's assertion output.
- The six engine water-against-ice paths and the ten parked truth-build paths stay
  out of every push.
- Google developer style in every prompt that has an agent write UI text.
- Prompts with the Write tool; scripts as files; `date` for time stamps.
- Rules questions are answered from `rules/` with citations, never from memory.
