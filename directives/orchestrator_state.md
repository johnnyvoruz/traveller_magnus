# Orchestrator state — 2026-10-11 21:05

Overwritten every turn. History is `handoff.md` (last section: 251).

## Where the roadmap is
Pushed: `ac18cbb`, version 1.1.3 (was `findings/push/builder_2026-10-11d.md`): the dossier fix, the no-WebGL notice,
generation visibly in flight, "your own map", publish from one system, roll again,
star numbers and codes on the server, record visibility and player notes. Still to
come for Johnny's three live findings: density (B, then A, then D). Then star numbers
on the form (D), Undo faults (A), ice caps (C), palette (E), then public games.

## Lanes
- A go: `a_density_store` (density, `leftEmpty`, `placed` with `?since=`; dots when
  B's route exists; allowance when B's cap exists).
- B go, urgent: `b_keep_crash_dots` (Keep crash on generated systems: fix in the
  caller, no engine edit without Johnny; `GET .../hexes/:sector/dots`), then
  `b_generate_cap`, then `b_generate_speed`. Density accepted: the job is one message
  posting every 32 hexes, resumable; one message per slice did not run under two local
  wrangler processes.
- C free: `c_surface_map_read` accepted (SurfaceKey.vue, large view by teleport, grid
  always on, night tint with a 12 degree band, sun reticle removed unasked, map width
  at column was already 474 px so only type changed). E saw the
  checker fail on a comment in `SurfaceStage.vue` ("window." ban); green at 20:55.
- D go: `d_density_sheet` (refusal at field, spinner to `design/`, toast flags and
  `job`/`stopJob` on the seam; density gated on A; allowance gated on B and A).
- E go: `e_timeline_list` (Campaign step 3).
- **F is retired** (Johnny): never assign or propose it until he says it is back.

## Next turn
1. C's report, then push 1.1.5 (gates, list, clean copy). B's density files go in now.
2. B's Keep crash: if it is live, it is the next push's headline; if it needs an
   engine line, it is a question for Johnny.
3. Chains: B dots -> A dots. B cap -> A -> D. A density -> D sheet.

## Versions
Every push list bumps `APP_VERSION` in `apps/web/src/version.ts` by one in the last
place and lists the file; the commit message starts with the version. Last pushed:
1.1.3 (`ac18cbb`). 1.1.4 pushed (`76e5a57`). On disk: 1.1.5, push list f written. Engine version untouched (fixtures folder name).

## Traps
- A live fault is looked at on the live page first (computed styles, console,
  `data-discs`), before a lane is sent to reproduce it locally. Two lane passes missed
  what ten minutes on traveller.voyage showed.
- The sector in a URL is `Spinward_Marches`, with an underscore.
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
