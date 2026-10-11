# Agent D — restart, 2026-10-10: Builder step 3, the close

You are Agent D, lead design agent on Traveller.voyage, a fresh session. Read, in order:
`directives/swarm_restart.md` (the common rules: no git but read-only, no deploy, your
own API and Vite ports, audit your lane to green first, no Traveller rule from memory),
`directives/agent_d_brief.md` (your standing brief), then this file.

**Do not start until `findings/builder_step3_close_ready.md` exists** (Agent B's note
with the exact shapes). If it is not on disk, say so and stop.

## Where you are (your predecessor, all on disk, unpushed)

- Step 3's screens are built and were passed in a browser on Agent A's real store and
  Agent B's server: an empty slot selectable in Build with "New sector" (N); a sector of
  the referee's renamed (F2), moved, deleted with Undo; a subsector renamed and
  generated; the hand designer (`workspace/build/HandDesigner.vue`, `hand.ts`,
  `hand_acts.ts`, `DesignAsk.vue`, `SectorPane.vue`, `SectorBar.vue`, `sector_acts.ts`):
  a system of two stars, three worlds and two moons built from the bar, bodies given
  away by picker, keyboard and grip; "Design by hand" on a generated system.
- Notes: `findings/builder_system_design.md` (section 16 is this step), mockups `kb3_*`,
  built shots `kb3_built_*`. Your notes say how you test (API 8797, Vite 5197, a
  universe pinned to v5, signed in as dev-admin).
- Four things could not be built on B's contract. B has now changed it
  (`prompts/b_step3_close.md`); the ready note above has the shapes.

## Johnny's rulings, 2026-10-10

1. **Adding and removing a body wait for Keep**, like every other change. Today you
   store each add and remove at once with its own Undo: take that out. One draft, one
   Keep, one rev; Discard drops the adds and removes with the rest.
2. **A world that has moons cannot be given to another world.** It stays greyed with the
   reason. Its moons are not moved for the referee.
3. **A star can be removed with everything that orbits it.** Before it happens the
   screen says so: "All N bodies orbiting this star will also be removed", with the
   count from the server. Johnny said "a modal or something"; the manifesto has no modal
   and no native dialog, so use the ask you already have (`DesignAsk.vue`, the same
   pattern as the ask before leaving a draft). Nothing is gone until Keep.
4. **Roll does nothing in hand mode: hide the Roll control there.**
5. **Hand and generated go both ways.** A referee who designed by hand may generate the
   system again; one who generated may tweak by hand. So: remove every "one-way" word
   from "Design by hand" (it still says what will happen: the engine stops running for
   this system; Undo returns the kept version before). And a hand-made system offers
   **Generate** (G, with the preview and Roll again as on any hex), which says before it
   runs that it replaces the hand-made system, and offers Undo after.
6. Standing, now confirmed: a referee's sector goes only in a slot the chart leaves
   empty.

## Build

1. The five rulings above.
2. The two that were blocked: **a world that orbits two stars together** (one entry in
   the "orbits" picker for each pair of paired stars; ruling of 2026-10-09), and
   **"Design by hand" on Regina** (a charted system; Keep makes it the referee's and
   "Restore to the chart" still works).
3. "Blank system" sends no edition and no star.
4. Command first for every act; tokens only; the 2 px amber ring; reduced motion;
   contrast pairs; column, half, full, 520 px.

## Check

The four gates pasted. A browser pass on your own ports, `kb3_close_*` shots:
- a hand system: add two stars, three worlds, two moons, change a just-added body, then
  Discard (all gone), do it again and Keep (one rev), reload;
- a world given to a pair of stars, Keep, reload;
- remove a star that has worlds: the ask with the count, confirm, Keep, Undo;
- "Design by hand" on Regina, Keep, then "Restore to the chart";
- on one generated hex: design by hand, edit, Keep, Generate again, Undo back to the
  hand version;
- the orbit view of each (Agent A's fix for "Loading this system." should be on disk: if
  the picture still does not draw without a nudge, report it, do not patch it).

Not yours: `apps/web/src/builder/`, `shell/pane.ts`, `apps/api`, `packages/`, `orbit/`,
`surface/`, `characters/`. In `dossier/DossierPanel.vue`, `DossierBody.vue` and
`views/OrbitView.vue` leave the surface map's lines alone
(`findings/push/hybrid_surface_notes.md` names them). Stop and report in the brief's
format, with every question written out.
