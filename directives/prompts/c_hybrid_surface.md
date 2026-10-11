# Agent C — take over the hybrid surface map and get it ready for production

Issued 2026-10-09 by the orchestrator. Johnny: *"Let's have Agent C pick up the rest of
this thread because it was the right agent for this; I needed a higher effort agent to
solve. Please implement these changes and get them ready for prod."*

You are Agent C on Traveller.voyage. Read `directives/swarm_restart.md` (the common
rules: read-only git, no deploy, no production call, your own API and Vite ports, audit
first, no Traveller rule from memory, `rules/` and the legacy tree read-only), then this.

## What you are inheriting

A separate agent ("Traveller Architecture") worked for Johnny in this tree. Everything
it did is **uncommitted, on disk, at HEAD `3d28e33`**. It is now yours. Its own account:

- **Hybrid surface map:** `apps/web/src/surface/hybrid/*`, `SurfaceStage.vue`,
  `orbit/sun.ts`, `orbit/sim_clock.ts`, `dossier/SurfaceTimeBar.vue`, and edits in
  `dossier/DossierPanel.vue`, `dossier/DossierBody.vue` and `views/OrbitView.vue`.
  Per-hex terrain, climate and ice, cities and features; fixes for purple seas, pole
  cropping and white equatorial mountains. **"Enhanced" now means the hybrid map.**
- **Day/night:** a shared sim clock, an animated terminator (`hybrid/motion.ts`,
  `hybrid/daynight_layer.ts`), Day/Night and Symbols toggles kept in `localStorage`
  (`voyage_surface_daynight`, `voyage_surface_style`).
- **Swappable icons:** `apps/web/public/surface-icons/default/`, `manifest.json`, a
  README.
- **Engines 1.1.0, a second batch** (`packages/engines`; spec
  `assets/2eWorldGeneration_EngineSpec.md`; the first batch is already live, see
  `findings/engine_1_1_0_rule_fixes.md`): water against ice is decided after `highTempK`
  is computed; five fixtures in `tests/golden/fixtures/engine_1.1.0/` changed from Water
  to Ice.
- **Docs:** `assets/HybridSurfaceMap_Design.md` (section 13 says what was built; section
  12 holds open questions for Johnny). **Tests:** `tests/web/surface_hybrid.test.js`
  new; three older assertions "that encoded the old bugs" changed.
- **Its own list of what is open:** the globe does not use the hybrid layer; hex edits
  cannot be saved on the server; seasonal ice does not move with the clock; extreme
  axial tilt is unchecked; **nothing was tested by hand in the running app.**

Johnny also logged, before this work, that the ice caps on the surface map looked wrong
(hard horizontal bands across the unfolded map, cutting through land and sea; handoff
204). That is what this map must have fixed: check it against his words.

## Step 1: audit, and say what you found (before changing anything)

`git status` and `git diff` over that list. Write `findings/hybrid_surface_audit.md`:
every file added or changed, what it does, anything half-finished, anything dead; the
three older assertions that were changed, each with what it asserted before, what now,
and whether the old one "encoded a bug" or guarded something real (if real, it comes
back); what the design's section 13 claims against what the code does. Gates as you
find them.

## Step 2: make it ready for production

"Ready" means all of this, and you do not report done without each:

1. **Seen by hand, in a browser, on your own ports**, on the real chart (Vite proxying
   the truth from production, as `agent_d_brief.md`'s local harness describes): the
   dossier's surface map and the orbit view's planets for at least Regina, Rhylanor, a
   water world, a desert world, an ice world, a tidally locked world, a gas giant, an
   asteroid belt, a vacuum rock, and one system generated in Build. For each: the map,
   the day/night terminator moving with the clock, the Symbols toggle, the caption.
   Screenshots `hy_*`. Anything wrong is fixed and shot again.
2. **The ice.** Caps follow the world's temperature with ragged edges, never a ruler
   line across the unfolded map, on land and on sea; a locked world's cap is on its
   night side. Show the same worlds Johnny's screenshot class came from (a "Water, ice
   from 50°" world) before and after.
3. **The look he approved must survive.** City lights look C went live two days ago
   (`surface/enhanced/city_look.ts`; `findings/city_lights_design.md`; handoff 200 to
   202) and the Vanilla look is parity-guarded. Since "Enhanced" now means the hybrid
   map: say exactly what happened to the enhanced globe, the city lights and the
   Vanilla path; `DRAW_FRAG` bytes unchanged; `scripts/surface_parity.js` run and
   pasted (its driver is known to exit 1 on a shade row marked `allowedDrift`: say if
   that is the only failure). If the city lights no longer show anywhere, that is a
   regression to fix, not to report.
4. **The four open items,** each either finished or cut cleanly with a reason and
   nothing half-wired on screen: the globe using the hybrid layer; seasonal ice with
   the clock; extreme axial tilt checked (name the worlds); **saving hex edits on the
   server is not in this step** (it needs Agent B's routes and Johnny's say): make sure
   no control on screen offers an edit that cannot be kept.
5. **Budget:** no presented frame at or over 50 ms through opening a dossier, a mode
   switch, the terminator running at a day a second, and a zoom on the orbit view with
   twenty bodies; the worst number, at DPR 1 and 2; memory. Reduced motion: the
   terminator steps, it does not sweep.
6. **The manifesto:** tokens only (the icons' colours too), no globals (the
   `localStorage` keys go through `platform/` as the others do), keyboard reach and the
   2 px amber ring on the new toggles and the time bar, contrast pairs in their own
   block of `tests/web/contrast.test.js`. `npm run check` clean.
7. **The engine batch, verified, not extended.** For the water-against-ice change:
   what the spec (`assets/2eWorldGeneration_EngineSpec.md`) and the rules text
   (`assets/2eWorldCreation.txt`) say, quoted, and that the code does that and no more;
   the five changed fixtures explained one by one; `tests/generation/parity.test.js` and
   its deviations file agreeing; the surface map reading the engine's liquid and
   temperatures, never its own guess. **No new rule from memory, and no further engine
   change in this step:** anything else you find wrong in the engines goes to
   `findings/generator_oddities.md` for Johnny's generator rebuild.

## The three shared files: leave the others' work exactly as it is

`dossier/DossierPanel.vue` also holds Agent D's Build pane and system editor;
`views/OrbitView.vue` also holds Agent A's builder orbit fix and Agent E's Campaign
control lines; `dossier/DossierBody.vue` may hold either. All of that is unpushed too.
Re-read each before every edit, touch only the surface map's lines, and **write
`findings/push/hybrid_surface_files.txt`** (every file of this work, one path a line,
paths only) **and `findings/push/hybrid_surface_notes.md`** (for each of the three
shared files, the exact line ranges that are the surface map's, so the push can be cut
by hunks). The Builder agents are working in those files now.

## Check and report

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted; the parity
script; the audit file; the `hy_*` shots; the two push files; what you finished, what
you cut and why; every question for Johnny written out with your recommended answer
first (the design's section 12 questions that still matter among them). No git, no
deploy. Stop and report.
