# Implementer brief — read this first, every session

**For:** a fresh implementer session with no memory of earlier work. An orchestrator session
writes your prompts and reviews your reports; Johnny relays between you. You execute one
prompt exactly as written and report. Written 2026-10-03; the orchestrator keeps it current.

## What this project is, in six lines

Traveller.voyage: a hosted map and orbit engine for the Traveller RPG. Vue 3 + Vite + TS in
`apps/web`; one Cloudflare Worker (Hono, D1, R2, Queues) in `apps/api`; pure packages in
`packages/` (`engines`, `generation`, `shared`); tests in `tests/`. The old single-file app
(`hex_map.html`, `js/`, `style.css`) is **frozen**: read it to learn behaviour, never edit it.
`rules/` holds the RPG tables and is **never** edited. The live site is
`https://traveller.voyage`; the public data ("truth") is on `https://cdn.traveller.voyage`.

## Read, in this order, before your prompt's own reading list

1. `CLAUDE.md` (the rules of the repository).
2. `directives/manifesto.md` (short; the rules every line of new code obeys).
3. The directive sections your prompt names. Recipes are in `directives/slice_1_viewer.md`.

You do not need `directives/handoff.md`; that is the orchestrator's log.

## Rules that never change

- **Do exactly what the prompt and the recipe say.** If a step cannot be done as written,
  or the legacy code says something the recipe does not, **stop and report**. Do not pick a
  different approach, loosen a test, widen an allowlist, or "clean up" nearby code.
- **Never use Traveller rules from memory.** If a rule or a meaning is not in `rules/`, the
  legacy code or the recipe, write "not found" and stop.
- **Never edit** `rules/`, `js/`, `hex_map.html`, `style.css`.
- **Golden fixtures** (`tests/golden/fixtures`) are written once from the legacy code with
  `UPDATE_GOLDEN=1` and never edited by hand. If ported code differs from a fixture, report
  the first difference; adjust neither side.
- **No git.** No commits, no stash, no checkout. Johnny commits.
- **No `npm install`** unless your prompt says you may.
- **Stay in your scope.** Each prompt names the folders you may touch. Other implementers
  are working in the same tree at the same time; a failure in a folder that is not yours is
  theirs: report it, leave it.
- New files over edits. No globals, no native dialogs, no colour or duration literals outside
  `apps/web/src/design/tokens.css`. `npm run check` enforces this.
- Files under `apps/web/src/map`, `search`, `shell` and `dossier` that end in `.ts` must run
  under Node with type stripping (no `enum`, no parameter properties, no namespaces), because
  the tests import them directly.

## Commands

| Command | Does |
|---|---|
| `npm test` | every test except the Worker suite |
| `npm run check` | the manifesto checker |
| `npm run typecheck` | TypeScript over `apps/api` |
| `npm run build` | generated files plus the web build (`vue-tsc` type-checks `apps/web`) |
| `RUN_API_TESTS=1 node --test "tests/api/**/*.test.js"` | the Worker suite against local `wrangler dev` (about 90 s) |

"Done" means the commands your prompt lists are green and pasted, every check in the recipe
step is met, and the report says what was created, what was skipped and why, every place the
legacy code and the recipe disagreed, and every question for Johnny.

## What exists today (so you do not rebuild it)

- **Truth v2** is released: 512 sectors, 180,312 systems. Files: `truth/v2/manifest.json`,
  `truth/v2/overview.json`, `truth/v2/sectors/<slug>/index.json`, and one generated system
  document ("tree") per world at `objects/<hash>`. Shapes: `data_model.md` §5 and
  `packages/shared/src/schemas/truth.ts`.
- **The map** (`apps/web/src/map`): geometry in parsecs, camera, tiers, `TruthClient`,
  `MapRenderer` (chart symbols, routes, capital names, subsector titles), input.
  `apps/web/src/search` and `components/OmniBox.vue`: the omnibox.
  `apps/web/src/shell/registry.ts`: commands and shortcuts. Browser globals only through
  `apps/web/src/platform/browser.ts`.
- **The Worker** (`apps/api`): auth, `/api/truth/versions`, `/api/truth/search`, the admin
  truth build (sliced queue consumer, windowed feeding, dead-letter handling, retry,
  release).
- **Ported legacy logic with exact parity:** the generation engines (`packages/engines`),
  border territories (`packages/generation/src/territories.ts`).

## How to report

Lead with one sentence: done, or stopped and why. Then the command output, then the lists
the prompt asks for. Say "not run" for anything you could not run (you have no browser).
