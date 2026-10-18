# Builder, step 2: closing the editor

Issued 2026-10-08 by the orchestrator. The editor is built and seen working on the real
store for a Mongoose system, an Architect of Worlds system and a charted one (Agent D);
the draft handle carries `keepMine`, `takeTheirs`, `dropped`, `replaced` and `blank`
(Agent A). Step 1 is pushed and live (`3d28e33`). Common rules:
`directives/swarm_restart.md`. Read `prompts/builder_step2.md` and its additions first.

**Know this before you touch generation:** the engines are now **1.1.0**. Another agent,
working for Johnny, applied ten Mongoose world-creation rule fixes
(`findings/engine_1_1_0_rule_fixes.md`; source `assets/2eWorldCreation.txt`), changed
`rules/mgt2e_data.js`, added `tests/golden/fixtures/engine_1.1.0/` and
`tests/generation/parity_deviations_1.1.0.json`. It is committed and live. Bases now
reach the chart entry. The legacy oracle is unchanged, so "what the legacy editor did"
and "what the engine does now" can differ: where they do, the engine wins and you say so.

## Agent B: four faults found by Agent D in the form and its routes

1. **A changed tree answers 404, not a conflict.** `apps/api/src/routes/builder.ts`,
   `loadEnvelope` (about lines 412 to 422): when the stored tree's hash is no longer the
   one the draft names, draft and Keep answer 404 "No stored tree" and never reach the
   `baseRev` check. It must be a 409 carrying the current row, as every other stale
   write is, so the screen shows the conflict strip and A's `keepMine` can rebase. A
   test: two drafts on one hex, the second Keep after the first changed the tree.
2. **Typing a starport corrupts the profile.** Mongoose, `profile.st`: typing "7" into
   the starport cell of hex 2009 and keeping left a chart entry of `9D6302-6` where it
   had been `C9D6302-6` (a character lost, the profile shifted). Whatever is typed in a
   profile cell lands in that cell only; a value the cell cannot hold is refused by the
   form with the field named, not written. No rule about what a starport may be is
   added (nothing is rule-checked): this is the string's shape only. Tests for each
   profile cell: one character in, one character changed, the length and the dash kept.
3. **A name-only change marks another field as changed by the engine** (hex 2009: D
   thinks the Scout Base switch). Find which, and why. Since 1.1.0 the bases are a
   string on the mainworld: if the form reads the switch from one place and writes the
   other, that is the fault. A name change changes the name and nothing else. A test.
4. **Architect of Worlds: changing only a star's type renames the system** (hex 1911).
   A star edit re-runs the bottom-up generator, as the legacy editor did; the system's
   own name is the referee's and must be carried across the re-run, as must every field
   the referee has typed in this draft. Tests on both engines: change a star's type,
   the name and each typed field stand.
Gates, a round trip on your own port. No deploy.

## Agent D

1. Drop the `buildReady` guard in `shell/PanelHost.vue` (A fixed `dossierDefault` at the
   source); with Build on, open the pane on a sector or subsector with `panel=dossier`.
2. The conflict strip on A's handle: `replaced`, `keepMine()`, `takeTheirs()`,
   `dropped` (name the dropped fields to the person). Remove your own rebase.
3. "Blank system" in the build bar, on A's `blank(hexKey, edition, star?)`, as designed.
4. **Rulings on your two questions (Johnny's words: "all your recommendations sound
   good" for this slice; these follow yours):** under a field the engine moved, the
   first line of its words, the rest one press away; Keep closes the editor and returns
   to the read view.
5. A browser pass after B's four fixes: a real conflict from a second tab (the strip,
   both choices), the starport cell, a name-only change, an Architect of Worlds star
   change. `kb_edit_built2_*`. Gates.

## Agent A

Free unless B's fix 1 changes what the handle receives; if it does, adopt it and say so.
