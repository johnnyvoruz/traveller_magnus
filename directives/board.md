# Board

One line per lane. Only the orchestrator edits this file. Updated 2026-10-14 12:30 (by the clock).

**Last push: `cfe88a4`, version 1.1.13, engine 1.2.0, 2026-10-14, deployed** (migration
0015 applied 16:54:42 UTC; GitHub run 38601979211 green; live index `index-CEIWbUQh.js`;
`GET /api/packages?sort=updated` 200 signed out). Truth v10.

| Lane | Status | Current prompt | Blocker / next |
|---|---|---|---|
| A | free | (none) | `a_sheet_row_and_skills` accepted |
| B | free | (none) | the marketplace moved to Z (Johnny, 2026-10-14) |
| C | free | (none) | no-sea accepted |
| D | free | (none) | `d_polish_note_and_frame` accepted; question on the picker fade open |
| E | free | (none) | `e_phone_sheet` accepted |
| Z | reported | prompts/z_marketplace.md | phase 3 accepted (placement, provenance `package`, undo an import); phase 4 (browser) waits for three answers and a go |
| F | retired | (none) | Johnny, 2026-10-11: unreliable (runs out of budget); do not use or propose until he says it is back |

## Engine 1.2.0 (every lane, 2026-10-13)
**The engine on the working tree is 1.2.0** (Lane Z's water and ice patch, applied 20:11,
not pushed). Fixtures: `tests/golden/fixtures/engine_1.2.0/`. Ledger:
`tests/generation/parity_deviations_1.2.0.json`. The `engine_1.1.0` fixtures are back at
the last commit and are no longer run. A body may carry `liquidType: null` with
`liquidStatus`. The Worker refuses a truth build, a retry or a Builder generate that spans
more than one sector: "The limit is one sector per request." Lane Z changes engine output
once more this turn (`z_liquid_land_changes.md`): a red engine or parity test in your
gates goes under "Needs from others"; do not touch `packages/engines`, the fixtures or
the ledger.

**Restarting a frozen lane:** paste the block in directives/lanes/START.md with the
lane's letter as the first message of a new session; from then on "go" is enough.

## Shared files this turn
- packages/engines, tests/golden/fixtures/engine_1.2.0/, tests/generation/parity*, tools/truth/: nobody (Z has finished).
- apps/api/src/jobs/generate_queue.ts, jobs/one_sector.ts, routes/builder.ts: B (taken over from Z's patch).
- views/MapView.vue, workspace/build/, workspace/passkey/: D.
- shell/ (PanelHost, Panel, frame, pane.ts): E.
- Marketplace server (routes/packages.ts, installs.ts, admin_packages.ts, universe/install.ts, migration 0015, schemas/package.ts): Z. universe/hexes.ts and campaign.ts: Z, install changes only. routes/admin.ts: nobody (parked hunks). apps/api/src/character/widgets.ts (`widgetKind`): lent to A.
- shell/Rail.vue: E. map/public_games.ts: A.
- tests/golden/fixtures/engine_1.2.0/profile_regina.json: C, that one file, only after it explains the change.
- apps/web/public/sheets/ (new): E.
- design/tokens.css: any lane may append its own token lines.

## Contracts
- contracts/b_marketplace.md, contracts/b_public_games.md (B): size b and the opt-in
  hex mark; nothing open; public games server being built.
- contracts/b_auth.md (B): username and passkey sign-in, built, **held out of pushes** until the gate is fixed.
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
- (fixed on disk, B, 2026-10-13) `ownedUniverse` is the Drizzle select again; every worker
  suite passed with 0013 applied except the parked `truth_build.test.js`.
- (fixed on disk, B) the byte charge falls back to the plain add when 0014 is absent; both
  states run in the worker suites.
- (fixed on disk, Z, 21:00) the late exotic die is on a side stream; 220 of 1,735 sampled
  systems changed, Regina's social rolls among them (399 values; her physical row did
  not move). **`truth-local/v10` from 20:11 is stale: Johnny deletes and rebuilds after
  the push.**
- (fixed) `npm test` green again at 21:40: C's surface edits and the regenerated Regina fixture.
- (fixed on disk, D) the account menu is teleported to `body` and opens above any panel.
- (fixed on disk, B) the cap's worker test and the job's sentence (`BuilderJob.error`).
- Parked truth-build work: `truth_build.test.js` line 1333 expects 1 `truth.remove` audit row
  on `vreconcile` and gets 2 (B's run). Nobody owns it until the water and ice landing.
- Lane Z's patch applies only to the tree with the sixteen always-out paths in place; what
  must be pushed with it is question 2 of C's review.
- `tests/web/renderer.test.js` "draw reports animating while a title fades in" failed
  once in E's run and passes in the orchestrator's: watch for a timing flake.
- (fixed in 1.1.11, needs the deploy) Live: sign-out did not end the session (a body-less POST answered 415).
- A journal entry's image bytes are owner-only (`GET .../objects/:hash`); a player
  view will need a read opened by B. Not needed until a player view exists.
- Not seen yet: dots and the toast advancing while a job runs (D's local queue answered
  only at the end). Look on production after the deploy.
- Speed leftovers (B's own): two jobs on one universe can race the 250 MB quota; a
  crash between the D1 byte add and the settled mark double-counts bytes.
- (fixed, in push 1.1.6) **Keep on a freshly generated system throws** "w.solarDayHours.toFixed is not a
  function" on most MgT2E systems (D, local API, production bundle). The call is a
  trace line, `mgt2e_world_engine.js` 1692; the caller in `packages/generation` is
  the suspect. May be live. B, urgent.
- Zoomed out, the map's dots come only from the published overview. Route (B) and
  store and renderer (A) are done; the two `MapView.vue` calls are D's, this turn.
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
**1.1.14 called for, 2026-10-14 12:30:** `findings/push/release_2026-10-14b.md` (list
`release_2026-10-14b_files.txt`, 22 paths), migration 0016. Rehearsed in
`scratchpad/outer18`. Still out: the ten parked truth-build files.

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

- 2026-10-11: a software renderer for discs without WebGL is not ruled out; later.
  The "your own map" note stays under the Build strip. The strip's own line is
  rewritten in the Google style (both wordings read as confusing). Job progress goes
  beside the Generate button and into a lower-right toast that lasts the job, so a
  person can do other things while it runs; it does not cover the pane's first line.

- 2026-10-11: signed out, the rail shows the Campaign and Build items switched off,
  so visitors see what an account gives; only those two.

- 2026-10-11: yes, a switched-off rail item opens the sign-in card when chosen.

- 2026-10-11: **non-admins may generate 100 systems a day** (a bot must not drive
  costs up); a premium account with more may come later, not now.

- 2026-10-11, the dossier's surface map (live 1.1.3): a button to open it large; a
  key for the symbols; the hex grid always on, as in the old app; day and night as a
  soft light and dark overlay with no outline; less crunched at column width.

- 2026-10-11: B's speed plan approved (third for B, behind the cap). The referee's own
  systems must show as dots on the zoomed-out map (A).

- 2026-10-11, yes to seven: the strip reads "YOUR MAP / <name> · your copy of the
  published chart" with the version in the tooltip; the note as D wrote it; preview,
  Keep and opening a draft stay held while a job runs. The cap: the UTC day; Undo
  gives nothing back; previews and Roll again count; a request over the allowance is
  refused whole.

- 2026-10-11: the ice caps are good enough for now; come back later, perhaps with a
  higher-effort model, after the process is streamlined. Yes: a high-tilt world's
  orbit disc should show its ice where the dossier map does (C, later, small).

- 2026-10-11: **the Undo system is low priority**: no more Undo work unless something
  more important needs it. Yes: a generate job stays one resumable message until the
  speed pass measures a split; a left hex named by number; the refused Undo stays
  offered; the spinner moves to design/. The sun marker on the surface map: Johnny
  looks on 1.1.5 first.

- 2026-10-11, **flow:** questions are answered before a lane is told to go; a lane
  whose prompt an open question could change is held.

- 2026-10-11, yes to six: the column map has no key pop-over, "Key" opens the large
  view; day and night keeps its fade, gains a faint terminator line and a darker night;
  the sun marker comes back, small; the record page gets a date with an optional end;
  a job's result has no Undo if the map was left in its first second, and says so;
  Referee-only rows stay unmarked on the timeline. Also from him: the large map view
  is centred, has zoom and pan controls, and a full legend that can be read.

- 2026-10-11, passkey sign-in: **no email service if it can be avoided**; one account
  when sign-ins share a verified email (yes); it goes after the cap and before speed in
  B's queue (yes).

- 2026-10-11, passkey sign-in: **an account is a username and a passkey; no email is
  asked for** (his users care about privacy and do not want to give one).

- 2026-10-11, passkey sign-in, yes to three: passkey only, no two-factor or
  authenticator code; recovery by one-time codes shown at sign-up, a nudge to add a
  second passkey, linking a provider optional; if passkey, codes and any linked
  provider are all lost the account is lost, and the screen says so.

- 2026-10-11: yes, B brings the passkey package (name, size, dependencies) to Johnny in
  its design note and installs nothing until he says so.

- 2026-10-11, density: **whenever more than one hex is selected, generating asks for
  the density every time**; the choices read in plain words ("about half of the empty
  hexes"), not "3 in 6".

- 2026-10-12 (orchestrator, trivial): the four density choices stay in the order
  Sparse, Standard, Dense, Every hex.

- 2026-10-12, yes to six: add `@better-auth/passkey` 1.7.7; the username is the
  public handle (3 to 24, letters, digits, underscore; taken refused); five passkey
  sign-up ceremonies an hour for one address, Turnstile only if needed; a right-click
  inside a subsector or sector opened by its address acts on all of it; a
  hydrographics-0 world keeps its painted percent and is captioned "no seas"; C does
  the city lights now.

- 2026-10-12, yes to twelve: a recovery session may sign out; Generate stays on when
  the density roll might pass what is left; at zero the note under the Build strip
  stays while nothing is selected; C takes the second look at the ice caps now. The
  Player Pack, first version: a referee-only mention reads "a record"; a hex mention
  shows its written label; a link between two player-visible records shows without
  role or notes; one HTML file, no ZIP package; no map; no images; party and ship
  only when marked for players, the clock day as cutoff; a notes box with "Download
  my notes", no import yet.

- 2026-10-12: no shared noise between the map's ice edge and the disc's; they agree on the ice line and that is enough.

- 2026-10-12, yes to three (D's first-visit review): a read-only pass on why Regina
  reads -84 C and Ethane, rules text cited, before any engine change (C); the Build
  strip shows "Your map" and the universe's name, "My campaign" stays for the records
  (D, after the passkey push); a first visit opens on the Spinward Marches with Regina
  in view and one dismissible line of help (D, after the passkey push).

- 2026-10-12: yes, the owner's universe list carries `publicGames` (only when migration 0013 is present).

- 2026-10-13, Regina: **yes** to an engine pass that keeps a charted mainworld's
  atmosphere and hydrographics when it is a moon and stops defaulting a missing
  temperature band to Temperate; no to the lock alone; no to hiding it on the screens.
  The orchestrator runs a trial outside the tree first (C's trace says the forbidden
  zone, not the default, moved Regina out). Passkeys: no change wanted; the build
  already takes password-manager passkeys.
- 2026-10-13: **a real passkey sign-up works on production** (Johnny).
- 2026-10-13, the sign-in card: "Create an account" at the top; the passkey button
  last in the list and labelled "Sign in"; the passkey helper sentence removed (D,
  added to `d_first_run_fixes.md`). The button sits below the provider rows; only
  the fingerprint sentence goes (yes to both).
- 2026-10-13: **Lane Z** is new: heavier-effort requests, run by another model
  (`lanes/Z.md`). It has the water and ice pass; C is free.
- 2026-10-13: water, ice and temperature are to be solved once, by a high-effort
  session (`c_liquid_temperature_once.md`); the Regina trial prompt is withdrawn.
- 2026-10-13: yes, a new account's map is named "My map" (existing ones keep their
  name); yes, a sector's or subsector's address opens its pane (finding 12). Lane A.

- 2026-10-13 21:10, **yes to nine**. Engine 1.2.0: the chart lock holds a charted
  mainworld's atmosphere and hydrographics for **every** charted mainworld, not only a
  moon (his word for the deviation, rule 4; no rules text either way, recorded as a gap);
  the book's temperature roll is parked for a separate decision; only atmosphere 0 is a
  vacuum for the ice rule; atmosphere 0 at or above water's melting point names no liquid
  and keeps its hydrographics digit; exotic liquids stay with atmospheres 10 to 12.
  A session written before the campaign had a date stays off the timeline. The public
  games switch stays in the account menu under Rename with D's words, and gains a line
  when it is on and the party has no place. `noindex` on the unlisted sheet.
- 2026-10-13 21:10: "let's get into a good place for a push."

- 2026-10-13 21:40, yes to both: Build's two one-sector sentences as written (D); the
  screen keeps 273.15 and the engine 273 (C). A go.

- 2026-10-14, yes to both: the lanes take D's first-visit polish (D, E); a universe made
  on an older engine generates its new systems with the current engine, and stored systems
  keep what they have (its row keeps the engine it was made with).
- 2026-10-14, Johnny's goal for the marketplace: make a map, sector or whatever, publish
  it, and import it into a campaign either in the same place or placed like a puzzle
  piece somewhere else. 10:10, yes to all five: own maps publish; anyone browses
  (importing needs an account; report and takedown); any package moves as one rigid shape
  snapped to the hex grid; a piece may land anywhere, charted space included, replacing
  the chart's systems in that campaign only, listed in the preview; a campaign keeps its
  copy and shows "update available".
- 2026-10-14, the character sheet: the six profile hexes on one row (abbreviations STR,
  DEX, END, INT, EDU, SOC allowed); one line per skill with a "+" in a left gutter to add
  the next specialism line, names aligned, specialism lines as tiers. No cap on specialism lines ("it doesn't make sense to cap it").
- 2026-10-14, yes to all four: the orbit picker keeps its fade; imported records name their package (provenance mode `package`); restore an import's undo point (after placement); a takedown keeps a private manifest copy.
- 2026-10-14: the marketplace goes to Lane Z, not B. Yes to Z's five: edges leaving a piece dropped on publish; another edition refused; theirs or mine per hex; takedown keeps objects, deletes manifests; an install counts against the quota, not the daily cap.
- 2026-10-14, a Back "<" left of the pane's X: one pane back; X still closes the pane.

## Open with Johnny
- Z phase 3: refund on undo; pin a never-opened universe on import; two placements of
  one package share records (handoff 270).

## Decided by the orchestrator, 2026-10-13
- The public games feed leaves out the caller's own universes (built, B).
- In a window too small for the whole Regina subsector with names, a first visit opens on
  Regina with names (D's question 2, as built).
- The dossier codes with no line in rules/ or assets/ stay bare (E's eight: Cr, nobility
  letters, allegiance, the trade codes Ph An Cp and sophont remarks, PCR, the government,
  law, tech, starport and military strings, AoW and RTT, luminosity classes other than V
  and D and BD). Johnny may supply text for any of them later.
- No push of engine 1.2.0 and no v10 upload before Lane C's change 1 is in (it is, 21:00).
- Z's three: the side-stream key is `<hexId>|liquid|<world>|<moon>|<orbitId>` under the
  master seed; the 20:11 v10 build is thrown away; the uploader's `--endpoint` reads the
  version state from the local emulation and needs its own `S3_ENDPOINT_*` keys.
- The map draws every public game the server sends (D's question 1; A removes the name guard).
- The account menu under a panel is fixed before the push (D's question 4).
- C's surface change to `engine_1.2.0/profile_regina.json` is intended: 7 fields on three
  bodies of Regina's system (w1m3, w6, w7) that carry `liquidType: null` now paint no sea;
  Regina herself is unchanged. Regenerated by the orchestrator with a guard that refused
  any other difference.
- The ten parked truth-build files stay out of 1.1.12; `admin.ts` goes by the cap-only
  patch (B's question; a local v9 released on that shape).
- `tests/generation/liquid_temperature_census.test.js` skips when `universe/raw/Core.tsv`
  and the other sample files are absent (git-ignored; CI has none). Edited by the
  orchestrator: one guard line, no assertion changed.
- The Generate sheet's "top down" note becomes "from the star outward" too (D's question
  2; after the push).

## Queue (prompts not yet written)
- After 1.1.12: Johnny rebuilds v10 locally, uploads (`tools/truth/upload_truth.js`, bulk
  over R2's S3 interface, keys in `.env`) and releases. His commands only.
- D: E's suggested words ("Full system, from the star outward."); the Build pane saying
  the one-sector limit before a request is sent (after B's contract).
- The 250 MB quota race: B's reservation design (reports/done/b_public_games_0013.md).
- D's review, left over: finding 18
  (520 px: the dossier hides the world), the shared modal frame (`Lightbox.vue`,
  `build/OrbitPicker.vue`, `PersonCard.vue`, `PlanModal.vue`, `design/base.css`), the
  `h1`/`p` reset moved from `views/Account.vue` to `base.css`.
- An engine pass for the Regina fault, on Johnny's word only (the generator rebuild;
  the held nine water-against-ice lines belong with it).
- Player Pack next steps: images in the file, the map, importing player notes; a
  player read of image bytes needs B.
- Campaign order (findings/campaign_gap_audit.md §4): 7 more than one ship, 8 flight
  log (on Johnny's word), 10 ship numbers and dice.
- A software disc renderer for browsers without WebGL: later, not ruled out.
- Worker: `retry_delay = 10` on the `voyage-generate` consumer (B's recommendation;
  wrangler.toml is Johnny's).
