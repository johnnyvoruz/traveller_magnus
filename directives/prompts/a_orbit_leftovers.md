# Agent A — three leftovers from the orbit pass

Issued 2026-10-10 by the orchestrator. Common rules: `directives/swarm_restart.md`.
Accepted: the orbit picture draws in all six cases (`builderEpoch` follows the store's
`tick()`), no age where none is stored, the sector's name on the orbit head. Agent D is
building in `workspace/` now; stay out of it.

1. **The client asks the CDN for a chart index an own sector cannot have**
   (`404 …/truth/v5/sectors/~01M4…/index.json`, three times in your pass). A sector id
   that starts with `~` is never asked of the chart: no request is made. Find every
   caller (the map, the orbit view, the dossier, search) and stop it at one place. A
   test: opening an own sector makes no request under `truth/`.
2. **A world that orbits two stars.** Agent B's hand walk now gives `orbitType`
   `P-Type`, `parentStarIdx` and `pairStarIdx`
   (`findings/builder_step3_close_ready.md`). `apps/web/src/orbit/hand_present.ts` does
   not carry them. Carry them, and the dossier says what the body orbits ("orbits Aster
   and Aster B") from the document's own names. Nothing is placed on the canvas that
   has no orbit typed; nothing is invented.
3. **The double-click on the Architect of Worlds hex** (0107) opened the dossier over
   the hex and the second click never reached the canvas; the other five did. Find out
   why that one differed (the pane's position, the timing, the hex's place on screen)
   and fix it if it is in your lane; if it is the pane's layout, give Agent D the exact
   cause in your report.

Report only: the left dossier pane joins an empty subsector name as "Far Home -". Say
which file and line builds that string.

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. No git, no
deploy. Stop and report.
