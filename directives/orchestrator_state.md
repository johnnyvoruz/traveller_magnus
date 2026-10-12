# Orchestrator state — 2026-10-11 22:20

Overwritten every turn. History is `handoff.md` (last section: 253).

## Where the roadmap is
Pushed: `ac18cbb`, version 1.1.3 (was `findings/push/builder_2026-10-11d.md`): the dossier fix, the no-WebGL notice,
generation visibly in flight, "your own map", publish from one system, roll again,
star numbers and codes on the server, record visibility and player notes. Still to
come for Johnny's three live findings: density (B, then A, then D). Then star numbers
on the form (D), Undo faults (A), ice caps (C), palette (E), then public games.

## Lanes
- A go: `a_own_dots_2` (B's dots routes; pages of 32; ETag; MapRenderer three places).
- B go: `b_generate_cap`, then `b_passkeys` (design note and dependency approval
  first), then `b_generate_speed`. Keep crash: `stable()` stores a non-finite number
  as `{ $num }`, `physSeed` copied the object and marked it manual; fixed in
  `packages/generation/src/form.ts`; in the tree since `3d28e33`. B freezes at worker
  suites: three times now.
- C in flight: `c_surface_map_2`. Eight files held out of 1.1.6
  (`SurfaceStage.vue`, `SurfaceKey.vue`, `surface/hybrid/overlay.ts`, `symbols.ts`,
  `chrome.ts`, `view.ts`, `tests/web/surface_hybrid.test.js`, `design/tokens.css`).
- D go: `d_menu_selection` (right-click inside a selection loses it, `MapView.vue`
  about 1541; allowance gated on B and A). Density dropdown accepted: Standard
  default, per universe, "up to N", "hexes checked", the nothing-new sentence.
- E go: `e_handout_images` (step 1 confirms schema and upload; stops if B is needed).
  Record dates accepted (`RecordWhen.vue`, `record_when.ts`).
- **F is retired.**

## Next turn
1. If Johnny pushed 1.1.6: record the hash. Tell him the Keep fix needs the deploy.
2. C's report: its eight files go in 1.1.7.
3. Chains: B cap -> A -> D allowance. B passkey design note -> Johnny approves the
   dependency -> build -> screens lane.

## Versions
Every push list bumps `APP_VERSION` in `apps/web/src/version.ts` by one in the last
place and lists the file; the commit message starts with the version. Last pushed:
1.1.3 (`ac18cbb`). 1.1.4 pushed (`76e5a57`). 1.1.5 pushed (`cdb6385`). On disk: 1.1.6, push list g written. Engine version untouched (fixtures folder name).

## Traps
- **Flow (Johnny, 2026-10-11): questions first.** A lane is not given GO while a
  question that could change its prompt is open. Reply order: QUESTIONS, GO, PUSH.
  Under GO, only lanes no open question touches; the rest are listed as held. No more
  "built on the recommended answer, say otherwise".
- Undo is low priority (Johnny): write no prompt for Undo polish unless a more
  important job needs it.
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
