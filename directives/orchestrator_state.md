# Orchestrator state — 2026-10-11 16:30

Overwritten every turn. History is `handoff.md` (last section: 241).

## Where the roadmap is
Builder: grow with one Undo, hand orbits, picker, belts, plain copy and the engine's
one-body roll are all accepted and in a push list that is ready
(`findings/push/builder_2026-10-11b.md`). Left on the Builder: B's follow-ups (orbits
lost on "Design by hand", star class, star dropdowns, messages), then D's third
hand-designer pass (wire the roll, dropdowns, belt around a world), A drawing that
belt, and the live texture fault (C). Campaign crumb and avatar: E, in flight.
Marketplace stub size b: contract and client done; screens (D) and server (B) queued.

## Lanes
- A go: `a_belt_around_world`.
- B go: `b_hand_followups` (part 4 added: star selects with options cited from
  `rules/`), then `b_marketplace_server`.
- C: `c_orbit_textures_2` shows no Progress line and no report although Johnny said
  all lanes reported. Told him.
- D: `d_marketplace_screens` the same. `d_hand_designer_3` is written for after it.
- E working: `e_campaign_nav_avatar`.

## Checked this turn
B's engine change on a copy with its own `@voyage/*` links (see Traps): golden and
parity pass with committed fixtures and without the held lines. One unrelated test
fails in the copy only (zod resolution); typecheck and build not run in the copy.

## Next turn
1. If Johnny pushed: note the hash on the board; E's files and anything later start
   the next list.
2. B's follow-ups now include required star values as pickers (luminosity): expect
   questions where rules/ gives a formula and no list.
3. Reports: C (regression or never built), D screens, E crumb and avatar (check the
   build is green again), A belt, B follow-ups (then flip `d_hand_designer_3`).
4. After B's schemas: A swaps the marketplace client's local types.

## Versions
Every push list bumps `APP_VERSION` in `apps/web/src/version.ts` by one in the last
place and lists the file; the commit message starts with the version. Current list:
1.1.1. Engine version untouched (fixtures folder name).

## Traps
- **Clean copy recipe that works:** `outer/node_modules` = junction to the repo's
  `node_modules`; `outer/clean` = `git archive HEAD` plus the push paths;
  `outer/clean/node_modules/@voyage/{engines,generation,shared,api}` = junctions to
  the copy's own packages, made with PowerShell `New-Item -ItemType Junction` (cmd
  `mklink` through Git Bash mangles the paths); check with
  `import.meta.resolve('@voyage/engines')`; run `node scripts/gen_rules_esm.js`,
  `node scripts/gen_names_esm.js`, then `node --test "tests/**/*.test.js"`. zod
  resolves differently there: one campaign import test and tsc complain.
- Flip the board before telling Johnny to say go. "All agents reported" is checked
  against `reports/` and the Progress lines, not assumed.
- `handoff.md` is 448 KB: read by offset.
- Never print a golden test's assertion output.
- The engine water-against-ice set and B's truth-build hardening stay out of pushes.
- Copy standard: Google developer style in every prompt that has an agent write UI text.
- Write files with the Write tool or a script file, not long bash heredocs.
- Rules questions are answered from `rules/` with citations, never from memory.
- The orchestrator's time stamps drifted ahead of the clock earlier today; use `date`.
