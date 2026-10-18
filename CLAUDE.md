# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read this first — the project changed direction on 2026-10-02

This repository now holds two things:

1. **Traveller.voyage** — the product being built: a hosted, account-based mapping engine and
   orbit engine for the Traveller RPG on Cloudflare (Vue 3 + Vite + TS, one Worker with Hono,
   D1 for the catalogue, one Durable Object per universe, content-addressed objects in R2,
   Queues for bulk generation and truth builds). The platform runs the engines; no engine code
   reaches a browser. It lives under `apps/`, `packages/`, `tests/`, `tools/`. **All new work
   goes here.** The storage model is git-shaped: immutable objects named by hash, pointer
   rows, manifests for versions, snapshots and packages (`directives/architecture.md` §2).
2. **The legacy single-file app** ("As Above, So Below", `hex_map.html` + `js/` + `style.css`) —
   **frozen** as the reference implementation. Read it to learn behaviour and to copy engine
   logic. Never extend it. Its removal is Johnny's call (question in
   `directives/questions_for_johnny.md`).

**Start every session by reading:** a lane reads `directives/BOOT.md`; the orchestrator reads
`directives/ORCHESTRATOR.md`. Both then follow what those files say. `architecture.md`,
`data_model.md`, `api.md` and `design_reference.md` are the specs they point to.
`feature_inventory.md` says what happens to every legacy feature.

## Roles and protocol

- **Johnny** is the referee: owns `rules/`, product decisions, Halt & Challenge answers, git,
  deploys and secrets.
- **The orchestrator** writes lane prompts and stream queues as files in `directives/`, reviews
  reports against the tree, and keeps `board.md`, `orchestrator_state.md`, `decisions.md` and
  `handoff.md` true.
- **Lanes** (A to E, and L, M, N when Johnny adds them, on prompts or streams; Z, heavy effort;
  F retired) read their prompt or queue from files, claim files in `directives/streams/claims.md`,
  and report to files, never to chat. Johnny says "go"; nothing is pasted. Lanes never change
  approach, never "clean up" beyond their item, never touch `rules/` or the legacy tree, never
  run git but read-only.

A prompt or queue item names the files, what to build and its check. Done means `npm test`
green, `npm run check` clean, `npm run typecheck` clean, `npm run build` passing, and a report
listing what was created, what was stubbed or skipped and every Halt & Challenge item raised.

## Critical rules (The Johnny Protocol)

1. **`rules/` changes only on Johnny's word.** No session edits a file in `rules/` unless Johnny
   has named that change. Each change cites the rules text in `assets/`, is written up in
   `findings/`, and is reviewed by Johnny before it is pushed. The new app consumes the tables
   through a generated ESM wrapper (`scripts/gen_rules_esm.js`). These are the authoritative
   RPG tables.
2. **Zero-Assumption Policy.** Do not interpret, guess, or "fill in" Traveller RPG rules from
   training data. If a rule is ambiguous or missing from `rules/`, stop and ask.
3. **Halt & Challenge.** On any ambiguity in RPG logic, or any step of a recipe that cannot be
   done as written, draft a specific question for Johnny, log it, and stop. Do not improvise.
4. **Engine output is pinned.** `packages/engines` must produce byte-identical output to the
   golden fixtures of its own version (`tests/golden/fixtures/engine_<version>/`). The engines
   began as a copy of `js/` and now differ from it on purpose: every difference from the legacy
   app is listed in `tests/generation/parity_deviations_<version>.json`, and the parity test
   fails on any difference not listed. A new deviation needs Johnny's word, a citation and a
   version bump. An unplanned difference is reported, never "fixed" toward either side.
5. **No globals, no native dialogs, no hex colours outside `tokens.css`.** `npm run check`
   enforces the manifesto; a session is not done while it fails.
6. **Do not interact with Git.** Johnny stages and commits. You only work on the code.
7. **New files over edits** in the new tree; **no edits at all** in `js/`, `hex_map.html` or
   `style.css`, and none in `rules/` but under rule 1.

## Commands (root `package.json`, npm workspaces)

| Command | Does |
|---|---|
| `npm test` | `node --test "tests/**/*.test.js"` — legacy golden fixtures, ESM parity, shared schemas, generation; the `tests/api` black-box suite runs only with `RUN_API_TESTS=1` |
| `npm run check` | manifesto checker over `apps/*/src` and `packages/*/src` |
| `npm run rules:gen` | regenerates `packages/engines/src/generated/rules/` from `rules/` |
| `npm run truth:build` | builds `truth/<version>/` from `universe/raw/` with pinned seed and settings |
| `npm run dev` | Worker and Vite together on http://localhost:5173, local D1 migrated, chart from production (`scripts/dev.mjs`) |
| `npm run dev:web` / `npm run dev:api` | Vite dev server / `wrangler dev` |
| `npm run build` / `npm run deploy` | builds `apps/web/dist` and deploys the Worker (deploy is Johnny's) |

## Layout

See `directives/architecture.md` §3. Short version: `packages/engines` (pure ESM engines +
core: rng, trace, hex, names, manual, settings, audit), `packages/shared` (zod schemas and
types for the overlay document v3, truth files, package manifest, API envelopes),
`packages/generation` (the one generation code path: `generateHex`, `buildSector`,
`buildSectorSlice`), `apps/web`
(Vue), `apps/api` (Hono Worker, Drizzle schema, migrations, auth), `tools/truth`, `tests/`.

Boundaries enforced by the checker: engines import nothing from `apps/`; `shared` imports
only zod; `api` never imports `web`; `web` never imports `api`.

## Determinism and trace logging

Generation is seeded: `masterSeed` + `reseedForHex(hexId)` via `mulberry32(hashString(...))`
in `packages/engines/src/core/rng.js`. Twelve `generation*` settings keys affect output and are
pinned for the truth in `tools/truth/settings.js`. Every generation step logs through
`tSection` / `tResult` / `writeLogLine` in `core/trace.js`; the sink is an array, the UI
decides what to do with it.

## Legacy notes (for reading `js/`, not for extending it)

Script load order is in `hex_map.html` lines 16-121. Per-edition files follow
`*_stellar_engine`, `*_world_engine`, `*_socio_engine`, `*_topdown_generator`,
`*_bottomup_generator`, `*_uwp_auditor`, plus `system_driver.js`. Global state lived in
`js/core.js` (`hexStates`, `masterSeed`, `rng`, `selectedHexes`, `window.sectorRoutes`,
`window.activeFilterRules`). The headless harness `tests/harness/legacy.js` loads this layer
into a Node `vm` context; use it instead of a browser when you need legacy behaviour.

The legacy version procedure (`directives/archive/legacy/update_version.md`) no longer applies; the new app's
version is `packages/engines/package.json` and `apps/web/src/version.ts`.
