# Orchestrator handoff, 2026-10-09

You are the orchestrator for Traveller.voyage, a fresh session. **Read this file first,
then `directives/swarm_restart.md` (the rules every agent works under), then
`directives/handoff.md` from section 212 on** (the Builder). `orchestrator_start_here.md`
is older and long: sections 1 to 3 (who is who, how Johnny wants to be worked with, the
rules) still hold; its state sections do not. `CLAUDE.md` and `manifesto.md` as always.

## How Johnny wants this run

- He pastes agents' reports; you check them against the tree, write the next prompts as
  files in `directives/prompts/`, give him 3 to 5 line pastes, and exact git and
  production commands (he runs all git; you use read-only git only).
- **Every question for him is written out in chat**, numbered, recommended answer first.
- End every reply with a **Board**: one line per agent and one for Johnny.
- Plain language, short, lead with what he must do. He wants the fewest turns.
- `directives/handoff.md` is the numbered log (next is **section 223**): append with a
  quoted heredoc and nothing else in that command.

## Where the product is

Live at traveller.voyage, branch `campaign`, last commit **`3d28e33`**.
- **Live:** the viewer; campaigns; ship sheet, nav console, waypoint dragging with ghost
  worlds; city lights look C; journal; **character sheets and live Characters** (share by
  link, pregens; `directives/character_mvp.md`); **Builder step 1** (Build switch;
  generate, remove, restore one hex, many, a subsector, a sector); sign-in card offering
  each provider the server has configured (only X has secrets; Johnny has
  `findings/signin_setup.md` to add Discord and Google).
- **Also live, and not reviewed by the orchestrator: engines 1.1.0** (ten Mongoose
  world-creation rule fixes, a change to `rules/mgt2e_data.js`, new golden fixtures and
  `tests/generation/parity_deviations_1.1.0.json`), made by another agent working
  directly for Johnny and swept into `3d28e33` by a push list that was "everything
  except" (handoff 221). Their note: `findings/engine_1_1_0_rule_fixes.md`.
- **Known live defect:** a generated system has no orbit picture. A's fix is on disk.

## On disk, unpushed (131 files changed since `3d28e33`; the tree is green: 1,215 tests, 0 fail, `vue-tsc -b` clean)

- **Builder step 2, complete and browser-tested by D:** the system editor (a draft you
  Keep; the server's edit form; conflict with "Take theirs" / "Keep mine"; blank
  system). B's four fixes are in. One small fault open, **A's**:
  `apps/web/src/builder/draft.ts` about lines 192 to 196 (`publish`) swallows a refused
  draft, so typing two characters in a profile cell is refused silently (the bar still
  says "1 change"); the server's words must reach `messages`.
- **A's orbit fix:** an Architect of Worlds tree never became a picture
  (`normalizeSystem` returned null for anything but Mongoose); a universe's own object
  is fetched from `/api/universes/:id/objects/:hash`. **A did not generate a system in a
  local universe to see it**; only Regina (a charted system) was seen. Needs a real pass.
- **Builder step 3, part way** (`prompts/builder_step3.md`): B's contracts and routes
  for referee sectors and hand-made systems are on disk with ready notes
  (`findings/builder_sector_ready.md`, `builder_hand_ready.md`) and
  `findings/builder_isolation.md`; **B has not reported.** A's store does not list
  referee sectors yet and its draft handle does not carry the hand kind. D has designed
  the step 3 screens on paper (`kb3_*`, design note section 15) and built none.
- **Parked, never push:** `apps/api/src/jobs/inputs.ts`, `reconcile_transform.ts`,
  `truth_build.ts`, `release_seal.ts`, `apps/api/src/routes/admin.ts`,
  `apps/web/src/views/TruthPreview.vue` and its one `/admin/preview` line in
  `apps/web/src/router.ts`, `scripts/dev_make_admin.js`,
  `tests/api/truth_build.test.js`, `tests/generation/reconcile_derived.test.js`,
  `tests/generation/release_seal.test.js`. (v6, climate, liquids and the build
  hardening: on hold until Johnny's generator rebuild.)
- **Now Agent C's (Johnny, 2026-10-09; `prompts/c_hybrid_surface.md`): the work of the "Traveller Architecture" agent**, which worked directly for Johnny in this
  tree (its own heads-up, pasted by Johnny on 2026-10-09). All of its changes are
  **uncommitted, for Johnny's review; do not revert, overwrite or push any of them
  without his word.** Its lane:
  - **Engines 1.1.0** (`packages/engines`; spec `assets/2eWorldGeneration_EngineSpec.md`).
    The first batch went live in `3d28e33` by accident (handoff 221). It has since
    changed them again on disk: water against ice is decided after `highTempK`, and five
    golden fixtures in `tests/golden/fixtures/engine_1.1.0/` changed from Water to Ice.
  - **The hybrid surface map:** `apps/web/src/surface/hybrid/*`, `SurfaceStage.vue`,
    `orbit/sun.ts`, `orbit/sim_clock.ts`, `dossier/SurfaceTimeBar.vue`,
    `apps/web/public/surface-icons/default/`, `tests/web/surface_hybrid.test.js`, three
    older surface assertions changed, `assets/HybridSurfaceMap_Design.md` (its section
    13 says what was built). "Enhanced" now means the hybrid map. Day/night on a shared
    sim clock. Not yet tested by hand in the running app, by its own account.
  - **It also edits files our agents edit:** `dossier/DossierPanel.vue` (Agent D: the
    Build pane and the editor are mounted there), `dossier/DossierBody.vue`, and
    `views/OrbitView.vue` (Agent A: the builder's orbit fix; Agent E's Campaign-control
    lines). **Those three files hold two owners' work at once: a push of ours that
    includes them goes by hunks, or waits for Johnny to say the hybrid map may go too.**
  - It says it did not touch the builder, `PanelHost.vue`, `BuildPane.vue`,
    `directives/`, `packages/generation/src/form.ts`, the API routes or the shared
    schema.
  - Agent C's old lane (`apps/web/src/surface/`) now overlaps it: give C nothing there
    without asking Johnny.

## The next push (not cut)

Step 2 plus the orbit fix would be a good push, **but A, B and D are all mid step 3 in
the same folders**, so it needs a quiet point or a careful list. Rules learned the hard
way:
1. **A push list names every file you have accounted for. Never "everything except".**
2. **Rehearse on a clean scratch copy**: `git archive HEAD … | tar -x`, copy the listed
   files in, **run `node scripts/gen_rules_esm.js` and `gen_names_esm.js` there (never
   copy `packages/engines/src/generated/`)**, junction `node_modules` (four explicit
   `cmd //c "mklink /J …"`, removed with `cmd //c rmdir`, never `rm -rf`), then
   `npx tsc --noEmit -p apps/api`, `vue-tsc`, `vite build`, the whole test suite, the
   manifesto check. Sections 209, 210 and 220 of the log show the commands.
3. The scratch copy resolves `@voyage/*` to the **real** tree: fine only when
   `packages/` in the push equals `packages/` on disk.
4. After a push: `git log -1`, `gh run list -R johnnyvoruz/traveller_magnus -L 1`, and
   check the live build **by content** (a string only the new work has).
5. A feature that needs the server goes server first. Never ship a screen that saves to
   a route production does not have.
6. Something nobody has seen in a browser is said to Johnny in those words before he
   pushes. (The orbit view went out unseen; he found it.)

## Johnny's standing rulings for the Builder

Build is a switch, off by default. Not live: a draft you Keep, one save with a `rev`,
conflicts shown. **Nothing is rule-checked; no Traveller rule from memory, ever.** "Roll
again" by a roll number. Settings are the universe's. Two ready generator pairs
(Mongoose top-down, Architect of Worlds bottom-up). Filled hexes are left alone unless
asked. The dossier's odd reading of Architect of Worlds stars ("Star", age 0) is left
for the generator rebuild. **The generator will be rebuilt: everything keeps it behind
one seam** (`generateHex`, `chartEntry`, `formOf` / `applyForm`, the dossier's walk; a
hand-made system is a document of our own schema).

## Open with Johnny

1. Whether the Traveller Architecture agent's work (hybrid surface map, the second engine 1.1.0 batch) may be pushed, and when; it shares three files with our agents.
2. Whether `CLAUDE.md` rules 1 and 4 (`rules/` read-only; engine parity sacred) should be
   rewritten now the engines deliberately differ from the legacy app.
3. Step 3's defaults, put to him and not yet confirmed: a referee's sector goes only in
   a slot the chart leaves empty; "Design by hand" is one-way for a system. D's six
   further questions were answered by the orchestrator at his request
   (`prompts/d_restart_2026-10-09.md`); he may overrule any.

## The road (his order)

Builder: system CRUD (steps 1 and 2 done), sectors and subsectors and the hand designer
(step 3, in flight), then areas and lanes (routes, borders, regions, allegiances). Then
the marketplace (packages; B's sketch is in `findings/builder_isolation.md`). Then
accounts and a cleanup of the account menu. Backlog in `plan.md` "After 5": party with
more than one ship, ice caps on the surface map, a 3D dice roller, flight log, timeline,
portraits, city lights step 5, the generator rebuild.

## The agents (all fresh sessions since the restart; each audits its lane first)

- **A:** browser logic: `apps/web/src/builder/`, `campaign/`, `characters/*.ts`,
  `orbit/OrbitRenderer.ts`, `orbit/ships.ts`, `shell/pane.ts`. Next: the silent-refusal
  fault, a real pass of the orbit fix, then step 3's store.
- **B:** `apps/api/`, `packages/shared` contracts, `packages/generation`. Step 3 report
  owed.
- **C:** `apps/web/src/surface/`, and since 2026-10-09 the hybrid surface map and the second engine 1.1.0 batch inherited from the Traveller Architecture agent (`prompts/c_hybrid_surface.md`): audit, then ready for production. Its push goes by hunks in three files shared with D, A and E.
- **D:** lead design, `apps/web/src/workspace/` (and `workspace/build/`). Being cleared
  and restarted with `prompts/d_restart_2026-10-09.md`.
- **E:** `workspace/journal/`, `characters/screens/`. Free.
- **F:** parked.

## Your first reply to Johnny

Say in a few lines where things stand and what you need from him, ask who the other
agents are, and end with the Board.
