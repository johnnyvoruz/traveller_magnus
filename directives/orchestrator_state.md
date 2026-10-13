# Orchestrator state — 2026-10-12 19:15

Overwritten every turn. History is `handoff.md` (last section: 254).

## Where the roadmap is
Pushed: 1.1.7 (`79a8076`). On disk: 1.1.8, push list `findings/push/builder_2026-10-12a.md`.
Builder: density asked every time (done), cap on the server (done), allowance on
screen (A then D), own dots zoomed out (D's two calls), speed (B). Then passkeys
(held on Johnny), then public games. Campaign: handout images wait on B's field;
Player Pack design note with E.

## Lanes
- A go: `a_allowance_store` (value off `/api/me` and every generate answer; typed
  429; note `findings/builder_allowance_store.md` for D). Dots accepted:
  `builder/dots.ts`, `noteDots`, `dotOverlay`, `MapRenderer.setDotOverlay`.
- B go: `b_entry_images` then `b_generate_speed` (note added: the 120-a-minute
  `UniverseDO` budget stalled the 68-of-80 job). Cap accepted: migration 0011,
  `auth/allowance.ts`, `GET /hexes/hold-rows`, admins uncapped (`user.role`).
  **Passkeys held**: `reports/b_passkeys.md` stays in reports/ (blocked), design note
  `findings/passkey_signin_design.md`; three questions open.
- C held: tilt and caption accepted (`surface/tilt_latitude.ts`, `BAKE_FRAG_TILT`,
  `hybridCaption` reads the body). Next job is Johnny's call (city lights). Owed with
  it: the 1.6 s first-use compile of the tilt program.
- D go: `d_dots_allowance` (part 1 A's two calls and the browser pass; part 2 the
  allowance, gated on A's report and note). Accepted: `density_ask.ts`,
  `DensityAsk.vue`, `input.ts` ignores a secondary press, `menuKeysFor`.
- E go: `e_handout_images_2` (Player Pack design note; handout images when
  `reports/b_entry_images.md` exists).
- **F is retired.**

## Next turn
1. If Johnny pushed 1.1.8: record the hash. The cap and the Keep fix need the Worker
   deployed, with migration 0011 applied; his account must have role `admin` or he is
   capped too.
2. Passkey answers: yes to all three -> write `b_passkeys_build.md` (install, contract
   `contracts/b_auth.md`, build), after speed or before it as he says.
3. C: on a yes, write the city-lights prompt with the compile hitch.
4. Chains: A allowance -> D part 2. B entry images -> E part 2.

## Versions
Every push list bumps `APP_VERSION` in `apps/web/src/version.ts` by one in the last
place and lists the file; the commit message starts with the version. Engine version
untouched (fixtures folder name).

## Traps
- **Flow (Johnny): questions first.** Reply order QUESTIONS, GO, PUSH. A lane is not
  given GO while a question that could change its prompt is open; held lanes are
  listed as held.
- Undo is low priority: no Undo polish unless something more important needs it.
- A live fault is looked at on the live page first. The sector in a URL is
  `Spinward_Marches`.
- **Clean copy:** `outerN/node_modules` = junction to the repo's; `outerN/clean` =
  `git archive HEAD` plus the push paths; `clean/node_modules/@voyage/{engines,
  generation,shared,api}` = junctions to the copy's own packages (PowerShell
  `New-Item -ItemType Junction`); `node scripts/gen_rules_esm.js`,
  `gen_names_esm.js`, `node --test "tests/**/*.test.js"`, `check_manifesto.js`. Known
  artefact: one zod failure in `tests/web/campaign_import.test.js`. Fresh `outerN`
  each time (last used: outer11).
- "All agents reported" and "frozen" are checked against `reports/`, Progress lines
  and file times. Read "Needs from others" before writing the next lane's prompt.
- `handoff.md` is large: read by offset. Never print a golden test's assertion output.
- The six engine water-against-ice paths and the ten parked truth-build paths stay
  out of every push.
- Google developer style in every prompt that has an agent write UI text.
- Prompts with the Write tool; scripts as files; `date` for time stamps.
- Rules questions are answered from `rules/` with citations, never from memory.
