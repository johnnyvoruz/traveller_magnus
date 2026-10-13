# Board

One line per lane. Only the orchestrator edits this file. Updated 2026-10-12 23:00 (by the clock).

**Last push: `f99a8a2`, version 1.1.10, 2026-10-12.** Any prompt that says "start only
after the board says the push is made" may start.

| Lane | Status | Current prompt | Blocker / next |
|---|---|---|---|
| A | held until 1.1.11 is pushed | (next: public games feed and mark, link-social wrap) | prompt not yet written; the push list must stay still |
| B | held until 1.1.11 is pushed | (next: Builder suites with 0013 applied, publicGames on the universe list) | public games server accepted; migration 0013 and its worker test are held out of 1.1.11 |
| C | go | prompts/c_regina_temperature.md | read-only: why Regina reads -84 C, Ethane and desert; trace to the line, cite rules/, count how wide; options for Johnny |
| D | held until 1.1.11 is pushed | (next: "Your map" on the Build strip, first visit opens on the Spinward Marches, the review's top ten) | account menu accepted |
| E | free | (none) | Player Pack, first version, accepted (in 1.1.11) |
| F | retired | (none) | Johnny, 2026-10-11: unreliable (runs out of budget); do not use or propose until he says it is back |

**Restarting a frozen lane:** paste the block in directives/lanes/START.md with the
lane's letter as the first message of a new session; from then on "go" is enough.

## Shared files this turn
- account/, platform/http.ts (sign-out), router.ts (one line, `guardRecovery`): **lent to A**.
- workspace/passkey/, workspace/SignInCard.vue, views/Account.vue, design/base.css (the modal frame): D.
- apps/web/src/pack/ (new): E.
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
- `universe/forward.ts` `ownedUniverse` takes a hand-written SQL path when migration
  0013 is applied; the Builder worker suites have not been run on that path. 0013
  stays out of pushes until B runs them.
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
**Ready: version 1.1.11**, `findings/push/builder_2026-10-12d.md`: **username and
passkey sign-in, whole** (migration 0012), sign-out fixed, the Player Pack, the
campaign importer reads the journal, the public games server (inert: migration 0013
and its worker test are held out).

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

## Open with Johnny
(none)

## Queue (prompts not yet written)
- D's first-visit review, `findings/first_run_review.md`: 19 findings, the ten first; owners to assign after tonight's push (OmniBox, Rail, panel host at 520 px, journal; `design/base.css` reset; the four modal frame files).
- Screens for username and passkey sign-in (sign-in card, account page: passkeys,
  recovery codes, linked providers): after B's contract `contracts/b_auth.md`.
- The rest of F's review (ranking, visual refinement, words, access) was never done;
  no lane has it.
- Public games, browser side: A calls the feed and draws the mark (MapRenderer.ts), D the on/off switch; after B's server.
- Worker queue settings: B recommends in `b_generate_speed`; wrangler.toml changes go out with Johnny's deploy.
