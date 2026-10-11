# Agent A — the orbit picture is stuck on "Loading this system."

Issued 2026-10-10 by the orchestrator. Common rules: `directives/swarm_restart.md`.
Accepted from your last report: the refused draft reaching `messages`, `builder.sectors()`
and the MapView switch, `form.mode` kept by `cloneForm`. This is the live defect Johnny
found ("there is no orbit view for a system that is currently auto generated") and it is
still there. It is the only thing between the Builder and its next push.

## 1. The fault (confirmed in the tree)

`apps/web/src/views/OrbitView.vue`, `state` (about lines 212 to 230) reads
`map.sectorLoaded(slug)` and `map.row(key)`. Neither is reactive. The only reactive read
is `void builderEpoch.value`, and `builder/bind.ts` bumps that **only when the store is
opened or closed**, not when a sector's rows arrive or a row changes. So `state` is
computed once as `loading` and never again; your own 8-second watch of hex 0106 shows it
(object 200, note still loading, no canvas). Agent D got its pictures only by forcing a
recompute in its test page.

Fix it at the source, in your lane (`builder/bind.ts` or the store), so every view that
reads rows through the binding recomputes when: a sector's rows land, a row is generated,
kept, removed, restored or undone, and the store opens or closes. No timer, no polling.
Check that `loadTree` runs again on the same signal (a cold load asks for the tree before
the rows exist). In `OrbitView.vue` touch only your own lines: the clock lines at 59, 381
and 1519 to 1526 are the surface map's (`findings/push/hybrid_surface_notes.md`).

A test in `tests/web/` that fails on today's tree: rows landing after the view's first
read move `state` off `loading`.

## 2. See it, all of it, on your own ports

Each one from a double-click on the map **and** on a cold load of the orbit address, with
the canvas present and a screenshot `kb_orbit2_*`:

1. a Mongoose system generated in Build;
2. an Architect of Worlds system generated in Build;
3. a generated system edited and Kept;
4. a blank system (now an empty hand document): no canvas, and the words "This system
   has nothing to draw.";
5. a system built by hand with two stars, three worlds and two moons: say exactly what
   is drawn and what is absent because no orbit was typed (absent, never invented);
6. Regina, charted, untouched.

Report the page errors and any 4xx or 5xx for each.

## 3. The orbit head on a hand-made system (from D)

It prints "0 Gyr" and the sector's id (`~01AR…`). A document with no age shows no age.
A referee's sector shows its name, from `builder.sectors()`.

## 4. Report only, do not fix

- Hex 0110: the Kept name "Orbit Edit" is the title, but the chips and the body list
  still say Naawan. Say which field of the stored object each of those two reads. (Agent
  B is asked the same from the server's side.)
- Architect of Worlds bodies whose dossier orbit has no AU: list three, with what the
  stored tree holds for each. It goes to `findings/generator_oddities.md`.

## Check and report

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. What you
found, finished, backed out. Not yours: `workspace/`, `surface/`, `apps/api`, `packages/`.
No git, no deploy. Stop and report.
