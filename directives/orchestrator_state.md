# Orchestrator state — 2026-10-11 19:25

Overwritten every turn. History is `handoff.md` (last section: 248).

## Where the roadmap is
Pushed: `da727c7`, version 1.1.2. **Push 1.1.3 is written and waiting on Johnny**
(`findings/push/builder_2026-10-11d.md`): the dossier fix, the no-WebGL notice,
generation visibly in flight, "your own map", publish from one system, roll again,
star numbers and codes on the server, record visibility and player notes. Still to
come for Johnny's three live findings: density (B, then A, then D). Then star numbers
on the form (D), Undo faults (A), ice caps (C), palette (E), then public games.

## Lanes
- A go: `a_undo_faults` (F's two Undo faults; density through the store when B
  reports; B's three codes).
- B go: `b_generate_density` (legacy `autoPopulate`, `js/macro_orchestrator.js`
  526-554; optionally landed hex keys on the job).
- C go: `c_ice_caps` (edge shape only; first steady the `longestChunkMs` test).
- D go: `d_star_numbers` (four fields with lookups; density dropdown when B and A
  have it; one string if Johnny says yes).
- E go: `e_palette_runnable` (OmniBox.vue, Lightbox.vue lent).
- **F is retired** (Johnny): never assign or propose it until he says it is back.

## Next turn
1. If Johnny pushed: record the hash, clear Pending push.
2. His answers to the four open questions (board); D's string depends on one.
3. Reports; the density chain B, A, D is the priority.

## Versions
Every push list bumps `APP_VERSION` in `apps/web/src/version.ts` by one in the last
place and lists the file; the commit message starts with the version. Last pushed:
1.1.2 (`da727c7`). On disk: 1.1.3. Engine version untouched (fixtures folder name).

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
