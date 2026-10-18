# Swarm restart — 2026-10-08

Most agent sessions were lost. Every agent below is a **fresh session with no memory**.
The tree holds your predecessor's work, some of it half-done. Last commit: `3b32761`.

## Every agent, before anything else

1. Read `CLAUDE.md`, then `directives/manifesto.md`, then **`directives/character_mvp.md`**
   (the current priority and its contract), then your own section here and the prompt
   it names. Do not read all of `directives/handoff.md`; search it by section number
   when a prompt cites one.
2. **You never run git except read-only** (`git status`, `git diff`, `git log`). Johnny
   commits. You never deploy, never call production, never edit `rules/`, `js/`,
   `hex_map.html` or `style.css`. No Traveller rule from memory: if a rule is missing,
   stop and ask.
3. **Audit your lane first.** `git status` and `git diff` on the files your section
   lists. Your predecessor may have stopped mid-edit. Get `npm test`, `npm run check`
   and `npm run typecheck` to pass **for your files** (finish or back out a half-edit in
   your own lane only; never touch another lane to make a check pass: report it). Start
   your report with three lines: what you found, what you finished, what you backed out.
4. Your own local API: a free port and its own state directory, your own Vite pointed
   at it, both stopped when you finish. Never use, restart or stop a server you did not
   start (a stuck process may still hold 8787).
5. Done means the four gates pasted (`npm test`, `npm run check`, `npm run typecheck`,
   `npm run build`), what you created, what you stubbed or skipped, every question.
   Then stop and report.

## Agent A — the browser's logic (stores, the orbit picture)

Yours: `apps/web/src/campaign/`, `apps/web/src/characters/` (not yet created),
`apps/web/src/orbit/OrbitRenderer.ts`, `orbit/ships.ts`, `shell/pane.ts`.
**On disk from your predecessor:** the start of `prompts/a_nav_drag.md` in
`orbit/OrbitRenderer.ts`, `orbit/ships.ts`, `views/OrbitView.vue`,
`tests/web/orbit_ships.test.js`. Audit it to green and **leave it there**; it resumes
later. **Your task now: `prompts/a_characters_client.md`.**

## Agent B — the Worker (API, Durable Objects, D1)

Yours: `apps/api/`, `tests/api/`, and for this step
`packages/shared/src/schemas/character.ts` (new).
**On disk from your predecessor, all parked, none pushed:** the build hardening
(`apps/api/src/jobs/`, `routes/admin.ts`, `tests/api/truth_build.test.js`,
`tests/generation/reconcile_derived.test.js`) and the start of `prompts/b_hardening_2.md`
(`jobs/release_seal.ts`, `tests/generation/release_seal.test.js`,
`apps/web/src/views/TruthPreview.vue`, `scripts/dev_make_admin.js`, `tests/api/server.js`,
`tests/api/session.js`). Audit to green, say in two lines where it stands, and **do not
continue it**: the truth-build and climate work is on hold by Johnny's order. The
journal's server step is pushed. **Your task now: `prompts/b_characters.md`.** Write the
shared schema file first and the note `findings/characters_contract_ready.md`.

## Agent C — the planet surfaces

Yours: `apps/web/src/surface/`, `apps/web/src/dev/city-lights/`, its route in
`router.ts`, `platform/browser.ts`.
**On disk:** city lights steps 3 and 4 (accepted, unpushed) and the start of step 4b
(`surface/enhanced/city_look.ts`). **Your task: `prompts/c_city_lights_4b.md`**, after
reading `findings/city_lights_design.md`. Three variants on one strip for Johnny to
choose from. Lowest priority of the five: it must not hold anyone else up.

## Agent D — lead design agent, the workspace screens

Read `directives/agent_d_brief.md` as well: it is your standing brief.
Yours: `apps/web/src/workspace/` except `workspace/journal/`.
**On disk from your predecessor:** the character sheet build, part way
(`workspace/CharacterSheet.vue`, `PersonSheet.vue`, `SheetBox.vue`, `SheetPanel.vue`,
`character_sheet.ts`, `sheet_fields.ts`, edits to `RecordPage.vue`, `ShipSheet.vue`,
`ship_sheet.ts`, `list_state.ts`, `tests/web/workspace_character_sheet.test.js`), to the
design in `findings/character_sheet_design.md` and the mockups `kc_*`.
**Your task: finish `prompts/d_character_sheet_2.md`** (read `prompts/d_character_sheet.md`
first, top to bottom: the three "Google Sheets" rules bind the component), **then "D,
Part 2" in `character_mvp.md`** when Agent A's `apps/web/src/characters/` is on disk.
Stay out of `orbit/` and `views/OrbitView.vue`.

## Agent E — screens around a feature

Yours: `apps/web/src/workspace/journal/`, `apps/web/src/characters/screens/` (not yet
created), and listed lines in `workspace/CampaignPanel.vue`, `shell/pane.ts`,
`shell/PanelHost.vue`, `views/MapView.vue`, `router.ts`.
**On disk from your predecessor:** the journal's screens, built and accepted, unpushed
(`workspace/journal/`, `tests/web/journal_screen.test.js`, `tests/web/pane.test.js` and
the shared lines above). Audit to green and leave them.
**Your task now: `prompts/e_characters_screens.md`.** The journal's second pass
(`prompts/e_journal_build_2.md`) waits behind it.
