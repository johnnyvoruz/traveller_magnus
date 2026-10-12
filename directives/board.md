# Board

One line per lane. Only the orchestrator edits this file. Updated 2026-10-11 19:25 (by the clock).

**Last push: `da727c7`, version 1.1.2, 2026-10-11.** Any prompt that says "start only
after the board says the push is made" may start.

| Lane | Status | Current prompt | Blocker / next |
|---|---|---|---|
| A | go | prompts/a_undo_faults.md | the two Undo faults; density through the store when B reports; B's three codes |
| B | go | prompts/b_generate_density.md | density on generate, contract first; A and D wait on it |
| C | go | prompts/c_ice_caps.md | ragged ice caps; first steady one timing test |
| D | go | prompts/d_star_numbers.md | the four star numbers; density dropdown when B and A have it |
| E | go | prompts/e_palette_runnable.md | the palette hides what cannot run; Lightbox focus (OmniBox.vue and Lightbox.vue lent) |
| F | retired | (none) | Johnny, 2026-10-11: unreliable (runs out of budget); do not use or propose until he says it is back |

**Restarting a frozen lane:** paste the block in directives/lanes/START.md with the
lane's letter as the first message of a new session; from then on "go" is enough.

## Shared files this turn
- dossier/DossierPanel.vue, dossier/DossierBody.vue, views/OrbitView.vue: no lane.
- design/tokens.css: any lane may append its own token lines.
- components/OmniBox.vue and workspace/Lightbox.vue: **lent to E**.
- packages/engines/src/mgt2e_roll_body.js: no lane (B's edit accepted; closed again).

## Contracts
- contracts/b_marketplace.md, contracts/b_public_games.md (B): size b and the opt-in
  hex mark; three questions open with Johnny.
- contracts/b_builder.md (B): the Builder routes, the draft cycle, sectors, undo, and
  the one act: `POST .../generate` with `makeSectors`, `POST .../sectors/undo-generate`.
- Next in b_builder.md: "Hand: orbit data", "Hand: roll a profile", "What may orbit what".

## Direction (Johnny, 2026-10-10)
1. Get the galaxy Builder working (this push, then D's one-act Undo).
2. Then the content marketplace, stub size b.
3. Then public games: the party ship as a non-interactive mark on other users' maps
   on the same base truth.
4. Campaign steps alongside where they need no server and no shared file: E's order
   (findings/campaign_gap_audit.md §4), steps 1 to 5 first. Step 4 (`@` mention) is done.

## Known, not fixed
- (fixed in 1.1.3) **Live, 1.1.2: a world's dossier is covered by its Day and night section.**
  `DayNight.vue` 115 and `SurfaceStage.vue` 460 both use the unscoped class
  `doss-daynight`; the stage's `position: absolute; inset: 0` lands on the section.
  Since `8118f72`. C renames the stage's class.
- **Live: no disc textures in Johnny's Edge because it has no WebGL** (both contexts
  null on the main thread and on an OffscreenCanvas; `data-discs="unavailable:0"`).
  The app says nothing when that happens. The older note below is superseded.
- **(superseded) Live grey discs (Johnny's screenshot, Azgul Kou, middle zoom):** C could not make
  them grey on a production build of this tree (12 discs textured at 3.1x), found that
  since `703041d` the disc worker throws away an in-flight answer whenever a new watch
  arrives, even for the same picture, and fixed that (it bites when a bake outlasts
  the gap between watches, which C's machine never did). In 1.1.2. Not proven to be
  the live cause until Johnny looks after the deploy.
- The profile roll is not built yet (B, prompts/b_hand_roll_belt.md); D's button is
  drawn, not wired.
- "Design by hand" on a generated system drops every orbit (D found it): B,
  prompts/b_hand_followups.md.
- About fifty Builder server messages break the copy standard (raw ids, raw JSON,
  legacy control names): B, same prompt.
- B's report says presentHand does not copy the orbit fields: stale, A's accepted pass
  does (tests/web/orbit_hand.test.js).
- Modal frame styles live in workspace/Lightbox.vue and D's picker carries a copy;
  one shared frame in design/base.css is owed.
- `packages/shared/src/orbit_au.ts` is a copy of the MgT2E orbit table from the engine,
  pinned to it by a test, so the browser can convert without engine code.
- Closed: the dossier-open frame. A measured no frame that starts after the click at
  or over 50 ms (worst 25.1 ms); C's 58 to 75 ms counted a frame already on screen.
- **Withdrawn: "the last commit fails five golden tests".** It does not. C ran the
  five on a true archive of `8118f72`: they pass. The orchestrator's clean copy
  borrowed `node_modules`, whose `@voyage/engines` link points back at the working
  tree, so it ran the held nine lines against committed fixtures. The held set changes
  eight `liquidType` fields from Water to Ice and nothing else
  (findings/golden_red_on_head.md).
- A hand-made system stores no orbit distance (only `order`), so the orbit view cannot
  place its bodies truly: prompts/b_hand_orbit_roll.md, then D.
- The hand model refuses any non-moon body around a world ("A world orbits a star.",
  packages/generation/src/hand.ts 374), with no rule cited. B is to quote what rules/
  says about belts and rings around a world; nothing is relaxed until Johnny rules.
- Letting go of a 409-hex box: 175 ms in headless software rendering; not measured on
  a real GPU.
- D's empty-slot Undo is two calls until A's store pass and then prompts/d_grow_one_act.md are done.
- D's browser pass did not show the paired-star removal ask (unit test only) or read
  the blank request body (read from what the server stored).

## Pending push
**Ready: version 1.1.3**, `findings/push/builder_2026-10-11d.md`. Tree green at 19:15
(1397 pass; checker, typecheck, build pass). Carries the dossier fix (class rename),
the no-WebGL notice, generation in flight, the "your map" note, publish from one
system, roll again, the four star numbers (server), three error codes, record
visibility and player notes, the shared marketplace types.
Push before saying go.

## Decisions from Johnny
- 2026-10-10: the file bus replaces pasting.
- 2026-10-10: B builds the one-act "make a sector and generate" (done).
- The dossier-open frame does not hold the push.
- E's Campaign order approved; E's defaults taken for its eight rule questions
  (ship sheet fields stay a stand-in, slingshots and mid-leg re-aim parked, dice show
  and interpret nothing, costs and cargo are typed, visibility is per record).
- A party with more than one ship: a list of vessel ids, one flagged current, and
  "Where are we" follows that one.
- Lane folders confirmed as written in lanes/*.md.
- Selecting hexes: the keyboard keeps `U I O / N M ,` for the six neighbours; Generate
  in an empty slot keeps the systems straight away; the map glides again when the pane
  is widened. All as built.
- Marketplace stub is **size b**: publish and list for the referee's own account; no
  browse by others, no install. A listing shows title, author handle, kind, truth
  version, edition, hex count, tags, latest version. Any signed-in owner publishes a
  subset of a universe they own. No moderation in the stub.
- Public games: one hex mark and the universe's name only; the hex from the last save
  of the party track, no heartbeat or expiry; hex precision only; opt-in, default
  off; shared only on the same non-null truth version; one dot and a count per hex.

- 2026-10-11: the five red golden fixtures get a read-only pass (C) before anything
  is decided about the held engine set.
- 2026-10-11: yes, the right-click menu reserves the "Design by hand…" line with a
  muted "Checking…" line of the same height (D, prompts/d_grow_one_act.md item 6).
- 2026-10-11: assets/HybridSurfaceMap_Design.md goes in a push.

- 2026-10-11: every instruction a person reads follows the Google developer
  documentation style guide (developers.google.com/style). First applied to Build.
- 2026-10-11: the hand designer gets a "Roll profile" button on the Profile heading
  and an orbit picker (a modal of the system; pick a parent, move, Place); typing the
  number stays.

- 2026-10-11, all as recommended: the held nine engine lines stay held for the
  generator rebuild; a universe not on a published chart cannot publish in the stub;
  package manifests go to the public bucket; the public mark follows the single
  `vesselId` until a campaign pass stores the list; no allowlist entry for
  surface/vanilla/map_palette.ts; the Google style standard applies to all app copy.
- 2026-10-11: a belt has no year data in the hand designer.

- 2026-10-11: Discord and Google sign-in secrets are set (Johnny). Passkeys wait.

- 2026-10-11, the hand designer: yes to a one-body profile roll in the engines (his
  word for the engine change; output must stay byte-identical); non-MgT2E systems
  pick orbits in AU only; a moon's period stays off the form; **a belt may be placed
  around a world by hand** (nothing generates one; moon rules come from another book
  later); no belt profile cell is locked; eccentricity takes any finite number; a
  world inside the star's inner limit or two bodies on one orbit are neither refused
  nor called out.

- 2026-10-11, the Campaign pages: the way back moves to the top as a breadcrumb (the
  X keeps closing the pane); "Add an image" moves onto the avatar area in the page
  head and the image becomes the record's avatar wherever it is shown; a circle for
  people and characters, a square for every other kind.

- 2026-10-11: a record's first image is its avatar (no new field).
- 2026-10-11, marketplace: `hex_keys` and `record_ids` JSON columns on
  `package_versions`; limits approved: 1,280 hexes, 500 records, title 1 to 80,
  description to 2000, kind 1 to 40, 32 tags of 1 to 40, 100 versions.

- 2026-10-11: a blank hand system picks orbits in AU; on MgT2E typing an orbit number
  fills AU; an unnamed star shows its spectral class.
- 2026-10-11: **every star value that is a closed list is a dropdown, not free text**
  (B sends the options from rules/, D renders them).

- 2026-10-11, the roll: a gas giant's profile is not filled; on the mainworld only
  size, atmosphere and hydrographics are rolled.
- 2026-10-11: a value the engine needs from a hand-made star to work (luminosity and
  the like) is a picker on the star's form, with its options from rules/ (B).
- 2026-10-11, **versions:** the app version is 1.1.N and the last number goes up with
  every push (first: 1.1.1, the push after `8118f72`); the second number moves when
  features harden, on his word. The orchestrator bumps `apps/web/src/version.ts` in
  each push list. The engine version (1.1.0) stays tied to its fixtures folder.

- 2026-10-11, yes to eight: the parked preview route leaves router.ts for a patch
  file; a hand star's luminosity, mass, diameter and temperature are four number
  fields that show the lookup until typed; the plain-style server messages are applied
  in one pass with the browser lines that quote them; AoW and blank systems keep
  type, subtype and class as text; a package may be published from a single system; a
  chart system removed from the map goes into a package as a deleted hex; E's five
  Campaign choices stay as built; only the app version moves per push.

- 2026-10-11: K or Ctrl+Enter keeps whichever is open (preview or draft); "Remove"
  stays without "from your map"; Lane F does a read-only UX review of Build and the
  hand designer.

- 2026-10-11: yes, hide the account menu's native file control (E).
- 2026-10-11, live on 1.1.2: generating must show a spinner while it runs; generating
  a subsector must not fill every hex; the app must say that what a person generates
  is their own map and never changes the published chart.

- 2026-10-11: density yes to all three (Standard default, one hex always generates,
  seeded per hex), **as a dropdown**: "Every selected hex" and the three densities.

- 2026-10-11: textures confirmed working in Chrome; Edge had turned hardware
  acceleration off on his machine. Not an app fault; the no-WebGL notice stays in C's prompt.

- 2026-10-11: a removed hex is published from the palette only (enough); the palette
  hides commands that cannot run (E, OmniBox.vue lent); ice caps must stop reading as
  a perfect circle: ragged edge, the sea cutting in (C, prompts/c_ice_caps.md).

## Open with Johnny
1. C: no software renderer for orbit discs without WebGL (keep flat disc and notice)?
2. D: the "your own map" note under the Build strip the first time Build is on?
3. D: the strip says "your map over chart v5" in place of "on the chart, v5"?
4. D: the job bar covers the pane's first line (the tally) while a job runs?

## Queue (prompts not yet written)
- E, Campaign order step 3 (timeline as a list), then 6 (handout images; ask B first).
- The rest of F's review (ranking, visual refinement, words, access) was never done;
  no lane has it.
- Public games (contract exists), after density.
