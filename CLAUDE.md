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
   logic. Never extend it. It is deleted at milestone M2.

**Start every session by reading, in order:** `directives/manifesto.md` → `directives/plan.md`
→ the directive for the slice you are on. `architecture.md`, `data_model.md`, `api.md` and
`design_reference.md` are the specs those point to. `feature_inventory.md` says what happens to
every legacy feature.

## Roles and protocol (from `directives/plan.md` §3)

- **Johnny** is the referee: owns `rules/`, product decisions, Halt & Challenge answers, git,
  deploys and secrets.
- **Orchestrator sessions** write recipes just-in-time from the specs, review reports and keep
  the directives true.
- **Implementer sessions** (lower-effort model) execute one recipe exactly as written and
  report. They never change approach, never "clean up", never touch `rules/` or the legacy
  tree, never run git.

A recipe is numbered steps naming the file, the function, the exact code and a one-line check.
Done means `npm test` green, `npm run check` clean, every verification box ticked, and a report
listing what was created, what was stubbed or skipped and every Halt & Challenge item raised.

## Critical rules (The Johnny Protocol)

1. **`rules/` is read-only.** Never edit any file in `rules/`. The new app consumes them through
   a generated ESM wrapper (`scripts/gen_rules_esm.js`). These are the authoritative RPG tables.
2. **Zero-Assumption Policy.** Do not interpret, guess, or "fill in" Traveller RPG rules from
   training data. If a rule is ambiguous or missing from `rules/`, stop and ask.
3. **Halt & Challenge.** On any ambiguity in RPG logic, or any step of a recipe that cannot be
   done as written, draft a specific question for Johnny, log it, and stop. Do not improvise.
4. **Engine parity is sacred.** Engine code is copied from `js/` into `packages/engines` and must
   produce byte-identical output to the golden fixtures in `tests/golden/fixtures`. Any
   difference is reported, never "fixed" toward either side.
5. **No globals, no native dialogs, no hex colours outside `tokens.css`.** `npm run check`
   enforces the manifesto; a session is not done while it fails.
6. **Do not interact with Git.** Johnny stages and commits. You only work on the code.
7. **New files over edits** in the new tree; **no edits at all** in `js/`, `hex_map.html`,
   `style.css` or `rules/`.

## Commands (root `package.json`, npm workspaces)

| Command | Does |
|---|---|
| `npm test` | `node --test tests/` — legacy golden fixtures, ESM parity, shared schemas, API handlers |
| `npm run check` | manifesto checker over `apps/*/src` and `packages/*/src` |
| `npm run rules:gen` | regenerates `packages/engines/src/generated/rules/` from `rules/` |
| `npm run truth:build` | builds `truth/<version>/` from `universe/raw/` with pinned seed and settings |
| `npm run dev:web` / `npm run dev:api` | Vite dev server / `wrangler dev` |
| `npm run build` / `npm run deploy` | builds `apps/web/dist` and deploys the Worker (deploy is Johnny's) |

## Layout

See `directives/architecture.md` §3. Short version: `packages/engines` (pure ESM engines +
core: rng, trace, hex, names, manual, settings, audit), `packages/shared` (zod schemas and
types for the overlay document v3, truth files, package manifest, API envelopes), `apps/web`
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

The legacy version procedure (`directives/update_version.md`) no longer applies; the new app's
version is `packages/engines/package.json` and `apps/web/src/version.ts`.
