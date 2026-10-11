# Orchestrator state — 2026-10-11 18:30

Overwritten every turn. History is `handoff.md` (last section: 245).

## Where the roadmap is
Pushed: `951724d`, version 1.1.1. **Push 1.1.2 is written and waiting on Johnny**
(`findings/push/builder_2026-10-11c.md`): Campaign crumb and avatars, the marketplace
stub end to end (screens, client, server, routes, menu entry), the hand designer's
third pass, belts around a world, plain server messages, the disc-texture handover.
After it: publish from one system (D), roll again (A), star number fields (B then D),
record visibility and player notes (E), F's review turned into prompts, then public
games.

## Lanes
- A go: `a_roll_again` then `a_market_types`. Had not started at 18:12.
- B go: `b_star_numbers` (contract first; engine file only if fixtures stay
  byte-identical; three error codes).
- C free. Texture fix accepted; the live cause is not proven (see board, Known).
- D go: `d_publish_single`. Had not started at 18:12. Holds one line of
  `DossierPanel.vue`.
- E go: `e_record_visibility` (RecordPage.vue and AccountMenu.vue lent).
- F go: `f_build_ux_review`. One Progress line at 17:01, `findings/kf_state/` made, no
  shots, no note: treat as stopped; restart text is `directives/lanes/START.md`.

## Next turn
1. If Johnny pushed: record the hash on the board ("Last push"), clear Pending push.
   If a lane edited a listed file before the push, re-run the gates before trusting it.
2. Reports: A, B, D, E, F. D after B: the star number fields. A after B: the codes.
3. Johnny's look at the live orbit view after the deploy decides whether C or F goes
   back to the texture fault.
4. Deploy note given to Johnny: migration `0010_packages.sql` must be applied to D1
   before the Worker that mounts `/api/packages` serves it; the `voyage-publish` queue
   is already in the committed wrangler config.

## Versions
Every push list bumps `APP_VERSION` in `apps/web/src/version.ts` by one in the last
place and lists the file; the commit message starts with the version. Last pushed:
1.1.1. On disk: 1.1.2. Engine version untouched (fixtures folder name).

## Traps
- **Clean copy recipe that works:** `outer/node_modules` = junction to the repo's
  `node_modules`; `outer/clean` = `git archive HEAD` plus the push paths;
  `outer/clean/node_modules/@voyage/{engines,generation,shared,api}` = junctions to
  the copy's own packages, made with PowerShell `New-Item -ItemType Junction`; check
  with `import.meta.resolve('@voyage/engines')`; run `node scripts/gen_rules_esm.js`,
  `node scripts/gen_names_esm.js`, then `node --test "tests/**/*.test.js"`. zod
  resolves differently there: one campaign import test and tsc complain.
- Flip the board before telling Johnny to say go. "All agents reported" and "frozen"
  are checked against `reports/`, Progress lines and file times, not assumed.
- `handoff.md` is 450 KB: read by offset.
- Never print a golden test's assertion output.
- The engine water-against-ice set and B's truth-build hardening stay out of pushes.
- Copy standard: Google developer style in every prompt that has an agent write UI text.
- Write files with the Write tool or a script file, not long bash heredocs.
- Rules questions are answered from `rules/` with citations, never from memory.
- Use `date` for time stamps.
