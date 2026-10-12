# Orchestrator state — 2026-10-11 20:20

Overwritten every turn. History is `handoff.md` (last section: 250).

## Where the roadmap is
Pushed: `ac18cbb`, version 1.1.3 (was `findings/push/builder_2026-10-11d.md`): the dossier fix, the no-WebGL notice,
generation visibly in flight, "your own map", publish from one system, roll again,
star numbers and codes on the server, record visibility and player notes. Still to
come for Johnny's three live findings: density (B, then A, then D). Then star numbers
on the form (D), Undo faults (A), ice caps (C), palette (E), then public games.

## Lanes
- A second: `a_own_dots` (overview dots come from the chart's `sector.cells` only;
  own, hand-made and removed systems are not reflected; data source is the open point,
  may need a B route).
- A go: `a_form_followups` (cloneForm lookup, refusal with its field id, job across
  routes; density and allowance when B's reports exist).
- B in flight: `b_generate_density`, then `b_generate_cap` (100 a day for non-admins,
  per-account number, 429 with a code; `fieldLabel` and the classless-star roll;
  report on job throughput and on the job stuck at 68 of 80).
- B third: `b_generate_speed`. Read from `jobs/generate_queue.ts`: 4 hexes per
  message, about 18 awaited round trips per message (whole-job spec each time, a stop
  check and a row read per hex, counts and two D1 updates per message); `finished` is
  set by the last-offset message, a risk if slices land out of order.
- C go: `c_surface_map_read` (ice caps accepted: `surface/ice_edge.ts`; parity script now
  pins capped worlds' mismatch counts and no longer needs `summary.ok`; legacy fixtures
  untouched). Was: `c_ice_caps`, then `c_surface_map_read` (Johnny's shots
  `findings/ui_design_shots/live_map_symbols_*.png`). Four surface tests red until it finishes (shader, oracle,
  enhanced map, service).
- D go: `d_undo_words` (UndoOutcome shown; later parts gated on A and B).
- E go: `e_toast_shell` (one strip in the shell; busy; sticky action).
- **F is retired** (Johnny): never assign or propose it until he says it is back.

- 20:20: "all reported except B" meant the reports already processed; A, C, D, E had
  not started their new prompts (empty Progress, no file newer than 19:55). **Push
  1.1.4 written** (`findings/push/builder_2026-10-11e.md`), B's density set left out.
  B hit a local queue stall near message 100 and is moving to one walking message:
  note added to its prompt; watch its report against `b_generate_speed`.

## Next turn
1. Reports. Push 1.1.4 as soon as C's tests are green; do not wait for density.
2. Johnny's answers to the seven open questions (board).
3. Chain: B density -> A store -> D sheet. B cap -> A -> D.
4. Worker scaling: answer from B's report, not from memory. Config today:
   `voyage-generate` `max_batch_size = 1`, no `max_concurrency`; `cpu_ms = 60000`.

## Versions
Every push list bumps `APP_VERSION` in `apps/web/src/version.ts` by one in the last
place and lists the file; the commit message starts with the version. Last pushed:
1.1.3 (`ac18cbb`). On disk: 1.1.4. Engine version untouched (fixtures folder name).

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
