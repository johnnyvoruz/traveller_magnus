# Orchestrator: start here

Rewritten 2026-10-06 (early, after Johnny's day of 2026-10-05) by the outgoing orchestrator
session for the next one. `handoff.md` is the full log (126 numbered sections, newest last);
this file is the state on one page. Read this, then `handoff.md` §82 onward, then
`slice_2_campaign.md` (the recipe, with Johnny's follow-ups 1 to 18 near its end). Keep this
file true: replace it, do not append to it.

## 1. Who is who

- **Johnny** is the referee and owner. He relays prompts and reports between you and the
  agents, runs every git command and every production command himself (with `!` in his
  prompt), and owns `rules/`, product decisions, secrets and the Cloudflare account.
- **You** are the orchestrator: review each report critically, verify cheap claims against the
  code, fix the spec first, write the next prompt, keep `directives/` true.
- **Agents A, B, C** are implementers of equal standing. By habit: **A** shared schemas,
  browser logic, the router and chunks, tests; **B** the Worker and Durable Object
  (`apps/api`); **C** renderers and self-contained modules (`deckplan/`, `surface/`,
  `OrbitRenderer.ts`, `dossier/DayNight.vue`). **Agent D** is the high-effort UI agent and
  owns every screen and the look (`workspace/`, `orbit/*.vue`, `views/`). **Agent F** is a
  higher-effort agent on a limited budget (about half spent): parked; use only for hard
  design, never for routine work. **Agent E** (medium effort, added 2026-10-06) takes
  bounded screen work that D's queue cannot reach; its prompt file carries its own identity
  and file list, written so it collides with nobody (first: the dossier pages and the orbit
  card, `prompts/e_dossier_identities.md`).

## 2. How Johnny wants to be worked with

- Short replies that lead with the outcome. He reads the last message, often tired.
- End every reply with a **Board**: one line per agent and one for him.
- Decide and record; ask him only what only he can answer. He does not want lists of
  technical questions. When he must choose, give the recommended option first.
- **Spell every question for him out in the chat** (his ask, 2026-10-06): under "Questions
  for Johnny", numbered, in plain words with the facts he needs (what the code does today,
  the proposed value) and what the answer unlocks, each answerable in a word or a line.
  Never "F2 is open" or "see `questions_for_johnny.md`"; he does not go and read the file.
  Write his answer into that file afterwards.
- Production-grade, no band-aids. The legacy look is the bar for every screen; he now also
  judges the live app himself and sends feedback with screenshots. Record each item as a
  numbered follow-up in `slice_2_campaign.md`, assign it by owner, and say when it is queued.
- He often pastes an old report by mistake, or forgets to hand out a prompt. Check each
  report against what you already accepted; if it is old, say so. **Check `git status`
  before assuming an agent has started:** twice on 2026-10-05 an agent had nothing on disk
  because its prompt was never handed out. Repeat a missing prompt in full.
- He sometimes says "pushed" when the command did not run (three times on 2026-10-05).
  **Verify with `git log -1`** and ask him to confirm the commit message.
- **Prompts are files in `directives/prompts/` (since 2026-10-06, handoff §130).** Write the
  prompt there, ending in "Stop and report", and give Johnny a three-line paste that names
  the agent and the file. Long pastes lost their middles in agents' terminals; if text must
  be pasted, keep lines under about 60 characters, in a code block.
- **Agent D is the lead design agent and has a standing brief,
  `directives/agent_d_brief.md`**; every D prompt says to read it first. Keep it current
  (ownership table, traps). A reset of D needs only the brief and the prompt file.
- When a prompt is superseded, say so in one line; he may otherwise run the older one.

## 3. Rules you must keep (beyond `CLAUDE.md`)

- **Git and production are Johnny's.** `CLAUDE.md` rule 6 stands (an agent confessed a
  `git stash` round-trip on 2026-10-05; restated). Give him exact commands with forward
  slashes (`cd D:/webstorm/traveller_magnus; ...`). A push to `campaign` deploys.
- **Call for a push only when no agent is mid-step**, or give a command that adds finished
  work by path. **Before naming a shared file in a by-path push, `git diff` it for another
  agent's imports** (handoff §109: a by-path push took `DesignView.vue` with D's imports of
  uncommitted files and broke CI). A full push is `git add -A` when everyone is between steps.
- **After every push, check three things yourself:** the GitHub test run
  (`gh run list -R johnnyvoruz/traveller_magnus`; the repo is a fork, always pass `-R`; use
  `gh run watch <id> --exit-status`), the Workers Build (the live bundle hash changes within
  one to three minutes; poll with an `until` loop, do not declare a failed deploy early), and
  that the live bundle contains the new feature (fetch `https://traveller.voyage/`, find
  `assets/index-*.js`; features in the orbit view are in `assets/OrbitView-*.js`, the campaign
  panel in `assets/CampaignPanel-*.js`; minified strings may be in backticks). A route
  answering proves nothing if it existed before; a signed-out 401 on a new route does.
- **CI runs `npm test` before `npm run build`:** a test may not read `apps/web/dist`
  (handoff §123: skip when absent). Tests may not depend on a git-ignored folder, the exact
  Node version, or line endings (CRLF here, LF on CI).
- **Black-box runs need a quiet tree.** `wrangler dev` rebuilds when `apps/api` or
  `packages/*` change; an agent editing mid-run makes the test hang and time out (handoff
  §99). Re-run only when nobody is mid-step there, or read the route in full instead.
- **Stand-ins are not proof.** Every API step ends with its black-box test run against
  `wrangler dev` (`RUN_API_TESTS=1`). The Durable Object refuses SQL `BEGIN` (handoff §78).
- **Shell:** never put backticks inside a double-quoted shell string; it runs them (it bit
  this session too, §105). Write scripts with the Write tool and run them with `node`, or use
  a quoted heredoc. Never re-run a one-off script that appends to a directive (it duplicated
  nine answers once; caught and repaired).
- **Never** edit `rules/`, `js/`, `hex_map.html`, `style.css`. No Traveller rule from memory.
  Where a number already exists in copied engine code (the 100-diameter jump circles,
  `calculateBaseJourneyTimes`), say so and ask Johnny to confirm it, do not re-derive it.
- `findings/` is git-ignored and local: inventories, designs, screenshots, agents' build
  notes (`findings/campaign_workspace_design.md` §9a onward is D's own report of each step;
  read it when a D report is missing).

## 4. Where the product is (production, traveller.voyage, last push `57510d2`)

- **Truth v5** released: 512 sectors, 180,312 systems. Held steady.
- **Viewer:** map, omnibox with the campaign group, dossier (star temperatures in kelvin,
  "100D jump travel times" from the engines, the Day and night strip with a teal play marker
  moving in real time with the orbit clock, surface maps vanilla / enhanced with the three
  new liquid colours and paled non-water ice), **the orbit view as a showpiece**: one header
  with Play, the date readout, the campaign mark and three drawers (Time / View / Layers)
  that reveal over the picture; the layer key is the toggle; a ships layer with wireframe
  designators and a plotting overlay (drawn only when fed; stand-ins in dev builds).
- **Campaign (live):** sign in with X; several campaigns per account (create, rename, switch,
  delete from the account menu, cap ten); records of nine types with create, edit in place,
  delete with undo; places (anchor editor, locator, "records here" in the dossier); links
  (the shared vocabulary, "aboard", `passenger`); the party (ship, members, "Where are we",
  the marker on the map); the clock (campaign date in the panel, beside the search bar as a
  chip, in the orbit view with "Set as campaign date" and "1 week" advancing it with undo);
  images on records (primary image, gallery, lightbox; WebP objects in R2 by hash);
  the vessel's **ship sheet** from the official PDF's 312 fields (as a panel default,
  folding sections, frozen key columns, passengers and crew as people with pills and a
  person card) with the **deck plan** inside it (shipyard JSON, CDN tiles on paper with the
  shipyard grid, crisp at every zoom, full-screen modal, credit always shown); **Export and
  Import** in the account menu (one JSON file per campaign, restored into an empty one).
- **Storage:** D1 holds `universes` (with `object_bytes`); a campaign's rows live in its own
  Durable Object; images in the private bucket `u/<universeId>/objects/<hash>` (250 MB per
  universe, orchestrator's number). No server-side backups; the export file is the backup.
- **Rules files added by Johnny:** `rules/mgt2e_ship_sheet_fields.json` (wrapped by
  `scripts/gen_rules_esm.js`, which now takes `.json`). The three ship sheet PDFs are in
  `assets/`. No character sheet PDF yet.
- **Main entry chunk 153 kB** since A's split (campaign panel, dossier, layout and icons are
  lazy chunks); a test pins it under 450 kB.

## 5. The current slice: campaign on the truth (`slice_2_campaign.md`)

| Step | What | State |
|---|---|---|
| K1 to K5f, K6a to K6c, K9, K13 parts 1 to 3, K14, K15, follow-ups 1 to 13 and 16, the drawers | the campaign MVP, the sheet, images, the orbit showpiece | **done, live** |
| K6d data | the vessel track (`status.track`, `campaign/track.ts`) | done, live |
| K12 picture | `orbit/ships.ts`, designators, plotting overlay (C) | done, live, fed by nothing yet |
| ship MVP 1 | ship list, real marks, status strip, plotting mode, Jump (fixed 168 until part 2) | **done, live** (`c6b6841`) |
| ship MVP 2 (D) | the measuring pass: the Track section, the rolled jump time, the flight estimate with both fuel lines, the Party tab and marker from the track | accepted §133 and §139, **local, not pushed**; the jump's parsecs line waits on A's hex distance |
| designs 18 and 21 (D) | `findings/daynight_locked_design.md`, `findings/plot_ghosts_design.md` | accepted §144; four choices stand at D's recommendation until Johnny answers |
| **fixes now (D)** | `prompts/d_fixes_now.md`: items 1, 2, 3, 4, 5, 8 of the queued fixes and `settleFlight`, unwired | **issued §144**; items 6, 7, 9 and the ghost wiring after A's panes report |
| **city lights (C)** | `findings/city_lights_design.md` (Agent F, accepted §148): five build steps. `prompts/c_city_lights_1.md`: Enhanced as the default look, then step 1 (the separate enhanced program) | **issued §148**, in flight; steps 2 to 5 one at a time, each with frames for Johnny |
| **follow-up 14d (C)** | `prompts/c_toggle_motion_4.md`: Moons off keeps its textures until the wave has run back; Day/night uses the Moons wave; the Moons switch never touches a planet's shadows | **issued §159**, between city lights steps 1 and 2 |
| **ghosts in the picture (A)** | `prompts/a_ghosts.md`, from D's note | **issued §148**; in flight |
| **places that are not planets (A, then D)** | `prompts/a_points.md`: a system anchor with `point: { x, y }` in AU, drawn, flown to, jumped from; docked ships beside their body. D's half (the plotting click on empty space, the words, Jump from a point) not yet written | **issued §158**, after the ghosts |
| **time controls (D)** | `prompts/d_part2_go.md`: a reset button before Play, "Back 1 week", Line up hidden; then Part 2 of `d_visible_first.md` | **issued §155 to §157** |
| **locked world's card (E)** | `prompts/e_daynight_locked.md`, from D's note | **issued §148**, after T1.5 |
| plot readout (C) | AU from the primary and real distance from the ship | accepted §148; in the push called for |
| follow-up 22 (E) | the system page and the world page get separate identities; the orbit card's model splits into "now" and "survey"; settles follow-up 15 | accepted §146; in the push called for (`findings/push/dossier_files.txt`) |
| **T1.5 (E)** | `prompts/e_climate_fields.md`: the world page and the orbit card read `surfaceTempBand`, `orbitalTempBand` and the liquid status when a body carries them | **issued §146** |
| the index follows the track; hex distance (A) | `campaign/place.ts`, `map/geometry.ts` | accepted §141; in the push called for |
| follow-up 21 wiring (D) | `settleFlight` wired, the `preview` prop fed, the browser pass over the ghosts | after A's panes report and C's ghosts; prompt not written |
| **hex distance (A)** | `prompts/a_hex_distance.md`: `hexDistance`, `parsecsBetween` in `map/geometry.ts` | **issued §139**, after the index step |
| small fixes (A) | `reactionFuelTons`, an empty track is no track, a dev proxy for the real chart (`VOYAGE_TRUTH_API`) | accepted §136, local |
| **the index follows the track (A)** | `prompts/a_index_tracks.md`: where a record is at the campaign date, through its ship's track | **issued §136** |
| real distance (C) | `orbit/distance.ts`, `keepHeld` | accepted §132, local |
| follow-up 14b (C) | a moon's real distance; Johnny's motion notes (hide reversed, slower, the wireframe wave, the solid teal sweep) | accepted §134; in the push called for; Johnny judges live |
| panes step 1 (A) | `shell/pane.ts`, pure | accepted §134 |
| engine corrections T1.3 (B) | liquids | accepted §134 with a correction |
| T1.3a (B) | only bodies with a label, a percentage or a code above 0 need a liquid validated | accepted §142; in the push called for |
| T1.4 (B) | the reconciliation as `generateHex`'s last step, behind an option absent by default | accepted §145; in the push called for |
| **T1.6 (B)** | `prompts/b_engine_t1_6.md`: the derived build with the `reconcile-environment` transform, proven on the local Worker; no production command | **issued §145** |
| panes steps 2 to 4 (A) | follow-up 17: `shell/PanelHost.vue`, `frame.ts`, the redirects, every push through `shell/pane.ts` | accepted §149; push called for (`findings/push/panes_files.txt`); **the signed-in pass is owed** |
| **after the panes (D)** | `prompts/d_after_panes.md`: the signed-in browser pass over the panes, then items 6, 7, 9, 10 of the queued fixes | **issued §149**, after `d_fixes_now.md` |
| **plot readout (C)** | `prompts/c_plot_readout.md`: AU from the primary and real distance from the selected ship | **issued §142** |
| follow-up 14c (C) | Moons and Day/night radiate from the star, the teal fades, rings cross-fade | accepted §142; in the push called for; Johnny judges live |
| follow-up 20 (city lights) | the port matches the legacy disc | with Johnny as G6 |
| jump bubble (C) | `placeShips` reports a ship entering jump and arriving; the amber bubble out and in | accepted §138, local; rides with D's part 2 |
| **follow-ups 14c and 20 (C)** | `prompts/c_toggle_motion_3.md`: Moons and Day/night radiate from the star, alpha fades on the teal, ring and late-tile cross-fades; the city lights diagnosed | **issued §135** (after the bubble if begun) |
| **follow-up 19 (D)** | `prompts/d_orbit_small_fixes.md`: readout padding, "No ships here" on one line, the campaign mark out of the header | **issued §135**, after D reports part 2 |
| ship MVP 2b | a leg end in open space, arrival on the 100D circle, the jump bubble (A, C, then D) | after the measuring pass; recipe not written |
| follow-up 14 | layer toggle micro-animations in the renderer | accepted §129; pushed by path with `findings/push/fu14_canvas.patch` (verify with `git log -1`); Johnny judges speed and the ring live |
| travel module | `campaign/travel.ts` from `rules/mgt2e_space_travel.json` | accepted §132, local |
| engine corrections T1.2 | `reconcile_environment.js`, the climate classifier from `rules/mgt2e_climate_bands.json` | accepted §132, local |
| ship MVP 3 (follow-up 17) | panes swap over either view; design accepted (shape A, `findings/panes_swap_design.md`): four steps A, D, A, A | after part 2; A's step 1 any time |
| follow-up 15 | the docked body card beside the open panel: D decides from the manifesto | after the ship MVP |
| follow-up 18 | locked-world Day and night card as a Scouts terminal readout | D, after the ship MVP |
| K13 part 4 | the character sheet | waits on Johnny's PDF |
| K16 | generated ship traffic | after G1 |
| K17 | shared ship feeds, follow, faction accounts | after K6d and K16 |
| K7, K8 | journal, timeline | outlines only |
| K10, K11 | copy between campaigns (logic exists); shared records library | K11 needs a design |
| passkeys | better-auth plugin | `plan.md` "After 5", back of the line |

## 6. In flight right now

- **Agent D (a fresh session, reset 2026-10-06):** ship MVP part 2, the measuring pass
  (`prompts/d_ship_mvp_2.md`), after reading `agent_d_brief.md`.
- **Agent C:** `prompts/c_jump_bubble.md`.
- **Agent A:** `prompts/a_travel_2.md` (reaction fuel, the empty track, the truth proxy);
  steps 2 to 4 of the panes swap when D leaves `views/`.
- **Agent B:** `prompts/b_engine_t1_3a.md`, then T1.4 and T1.6 (recipes not written).
- **Last push: `af1ff99`** (§135), green and live: the second motion pass, the Track
  section, travel, distance, the pane helper, the reconciliation module, the `manoeuvre`
  rules. In flight on disk since: D (part 2) and A (`a_travel_2.md`).
- **The next push (§139):** when A (the index step) and B (T1.3a) are reported and
  accepted, by path, everything except C's five in-flight files (`orbit/OrbitRenderer.ts`,
  `orbit/ships.ts`, `orbit/theme.ts`, `tests/web/orbit_renderer.test.js`,
  `tests/web/orbit_ships.test.js`), rehearsed in a scratch copy first. D holds on a
  paper-only step until then; after it, D gets `d_orbit_small_fixes.md` (seven items).
- **Last push `6fc2d60`** (the ghosts, the reconcile transform), green and live. **Called
  for in §168:** the whole tree (`git add -A`): places in open space, Enhanced as default
  and city lights step 1, D's Part 2, the Scout Survey card, the card under the drawer,
  Locate. Check `git log -1`.
- **v6 is building** (staged, never released by the job): started 2026-10-06 after one
  leftover file was deleted (§167). When every sector is done, B gets
  `prompts/b_engine_t1_7.md`. Before any release: the surfaces must read `surfaceTempBand`
  (C), and Johnny rules on the unresolved counts.
- **Last push `c7d4772`** (Moons off reversed, the Day/night wave, the course drawing),
  green and live. **Called for in §176:** a hunk-level snapshot (`rts_main.patch`,
  `rts_renderer_a_only.patch`, five new files): vessels on the sector map, waypoints,
  ship tags like the planet's, the liquid row, the ribbon. Check `git log -1`.
  **Then:** D `d_nav_console.md`; C is mid `c_city_lights_2.md` (the ring pop Johnny
  confirmed, the corrected climate, city lights step 2); A and E are free (the journal, K7,
  is next and has no recipe yet); B waits for v6 (`b_engine_t1_7.md`).
- **Last push `d4bb7e8`**, green and live (§177). **Since then (§178, §179):**
  - **A's route editing is accepted and on disk, not pushed** (`replaceLegsFrom`, `route`,
    `waypointAt`, `waypoints()`): it shows nothing until D wires it, so it rides with D's
    `d_nav_console.md` push. That push will need the hunk-level method again
    (`OrbitRenderer.ts` holds A's and C's work, `OrbitCanvas.vue` A's and D's).
  - **The journal (K7) has begun, if Johnny pastes the prompts** (he had not answered
    "what next for A and E"; it is the slice's own next step): A `a_journal_1.md` (the
    route's old tail under a preview, then K7a, the shared schema, additive); E
    `e_journal_design.md` (paper design only). **Not written:** K7b for B (the Durable
    Object, when K7a is on disk) and K7c for A (the store).
  - **v6: 170 of 512 at 02:00 UTC on 2026-10-07, about 52 s a sector, no stall; done
    near 07:00 to 08:00 UTC.** Measure it without Johnny by probing
    `cdn.traveller.voyage/truth/v6/reconciliation/sectors/<slug>.json` for the 512 slugs
    of `/api/truth/versions` (v5's list). **The total `report.json` is stale at the plain
    address** (stored `immutable`, rewritten per sector): add a query string.
  - **Answered 2026-10-06 (§180):** the journal is next (G8: yes; A, E and B have their
    prompts, B's being `b_build_hardening.md` for the idle hours); a leg under way stays
    history for the MVP (G9; `plan.md` backlog item 5). **Nothing is open with Johnny.**
  - **K7a is accepted and on disk, unpushed (§183).** A goes on to K7c
    (`a_journal_2.md`); B's K7b is written (`b_journal_k7b.md`), after the hardening step.
    The tree does not build while D is mid-edit in `views/OrbitView.vue`: rehearse
    nothing from the whole tree until D reports.
- **Called for in §181, a C-only push** (`findings/push/c_rings_renderer.patch`,
  `c_surface.patch`, four new files by path): the ring cross-fade on Day/night, the
  enhanced look reading the corrected climate, city lights step 2. Rehearsed green; the
  live entry should become `index-DXPwg3e-.js`. Check `git log -1`. **Then:** C
  `c_city_lights_3.md`. A's route editing, A's journal schema, D's nav console and B's
  hardening are all still local.
- **v6 has finished (§184): 512 of 512 at 08:32 UTC on 2026-10-07, nine hours, not
  released.** 3,580,267 bodies; 19.4% liquid unresolved; 1,247 blocking; 43,376 with no
  surface word. **B does `b_engine_t1_7.md` now**, then the hardening step (no longer
  held), then K7b. Release waits on B's evidence and Johnny's ruling.
- **Direction from Johnny (§187, 2026-10-07): character sheets next.** K13 part 4 goes
  ahead of the timeline (K8) and the flight log. A `a_character_fields.md` (the §5.2a
  transcription as a rules draft) after `a_journal_3.md`; D `d_character_sheet.md` after
  `d_nav_console_2.md` (which now has section 4, a route with a jump after it). Johnny
  copies A's draft into `rules/` and runs `rules:gen` between the two. **He skipped the
  §185 push**: nothing since `9a95a0c` is committed; cut a fresh push at the next quiet
  point. His five answers are G11 to G15. **G16: the character sheet PDFs are in
  `assets/` (§188)**, so A's step is the PDF inventory (the ship sheet's road, §89), and
  Johnny copies `findings/character_sheet_fields.json` to
  `rules/mgt2e_character_sheet_fields.json` and runs `rules:gen` once it is checked.
- **Direction from Johnny (§190): live character sheets and marketplace copies.** A live
  sheet is owned by a player's account, shared with a referee and co-edited; a copy is an
  independent instance in another universe, also through the free marketplace. This is
  K11 and K10 (`slice_2_campaign.md`), with an owner and a second editor. D builds the
  sheet behind a boundary now; A writes `findings/live_sheet_design.md`
  (`a_live_sheet_design.md`) after the PDF inventory. **"Live" is Google Sheets (§191):**
  pushed changes per box and presence; both prompts carry it. G17 to G20 are all
  answered (§192); nothing is open with Johnny.
  **The character sheet's fields are in `rules/` (§192):**
  `rules/mgt2e_character_sheet_fields.json`, 420 widgets, generated wrapper written; D's
  build is unblocked. A is on `a_live_sheet_design.md`. A's `a_journal_3.md` report was
  never pasted.
- **§193 (2026-10-07, late).** C's city lights step 4 is accepted as engineering and
  **held: too dark** against Johnny's bar; `c_city_lights_4b.md` makes three variants
  for him to pick from, and steps 3, 4 and 4b go live together. D's character sheet
  design is accepted as the look; `d_character_sheet_2.md` re-bases it on the PDF and
  builds. **D's report 1 (the nav console's second pass) was never pasted.** A hung
  process holds local port 8787: agents now start their own API on their own port and
  state directory (in D's prompt; owed to E's and B's next prompts).
- **Last push `1f5eccc` (§196), green and live:** the nav console, route editing, the
  journal's schema and store, the character sheet's fields. Johnny loves the console
  and wants dragging fixed (follow-up 32): the worlds move while a waypoint is held,
  every point stays visible, a grab cursor, right-click stops plotting. **A does it now
  (`a_nav_drag.md`), holding D's orbit files; the live sheet design waits behind.** D is
  on `d_character_sheet_2.md` and stays out of `orbit/`. Open with Johnny: whether
  right-click should add the course rather than only stop the laying.
- **§198 (2026-10-07, late).** Johnny delegated v6's three liquid questions ("do your
  best"): provisional rows from the tables already in `rules/`, in
  `b_liquid_policy_2.md` (B, after `b_hardening_2.md`; no build in it; v7 is one console
  command for him later). **Characters are first-class:** a Character owned by either a
  player or a referee, shared with the other, pregens claimed by link, a home outside
  any campaign, Roll20 later as research; all in `a_live_sheet_design.md`'s new section.
  The sheet itself is not live yet (D is building it on the person's page). Open with
  Johnny: G22 (a claimed pregen shared or given) and D2 (Discord and Google sign-in).
- **§197 (2026-10-07, late): B's three reports read.** K7b accepted, **its push
  rehearsed and offered** (`findings/push/k7b_files.txt`, 6 files); the journal's screens
  follow when E reports its second pass. The hardening is accepted and **held for one
  fix** (a released version's sector indexes must be immutable again):
  `b_hardening_2.md`, which also asks for a preview of an unreleased version.
  `findings/v6_open_cases.md` accepted; **open with Johnny: three rules questions on v6's
  unresolved liquids** (airless worlds with ice; water outside its range on ordinary
  atmospheres; exotic atmospheres), no recommendation from Traveller knowledge; a ruling
  means another derived build.
- **§194 (2026-10-07, late).** E's journal screens are accepted and **held for B's K7b**
  (the tab must not go live before the server stores entries); `e_journal_build_2.md` is
  E's second pass. **A push is rehearsed and offered:**
  `findings/push/ships_and_schema_files.txt` (26 files: the nav console and its second
  pass, A's route editing and journal data, the character sheet's rules file). The list
  is by path, so it is right only while A, D and E stay out of those files; re-check
  `git status` before giving the commands again. D's report on the nav console's second
  pass is still unseen.
- **State at §186 (2026-10-07, late).** The §185 push was **not yet run**; its list now
  has 23 files (K7c added), re-rehearsed green. Accepted since: A's K7c, B's v6 evidence
  (v6 **not released**), E's journal design. Prompts written: A `a_journal_3.md`, E
  `e_journal_build.md`, B `b_v6_questions.md` (first B's two missing reports, the
  hardening and K7b, both on disk and unread; then `findings/v6_open_cases.md`), D
  `d_nav_console_2.md` after the push, C in `c_city_lights_4.md`. Open with Johnny: five
  small questions (§185 three, E's two).
- **C's city lights step 3 is accepted as built and held (§184):** it goes live with
  step 4 (`c_city_lights_4.md`), after a fresh parity run. Johnny: hold (§185).
- **Called for in §185, by path (`findings/push/nav_console_files.txt`, 18 files):** D's
  nav console, A's route editing, K7a. Rehearsed green. Check `git log -1`, and the live
  orbit chunk for "already departed". **Then:** D `d_nav_console_2.md` (a leg departing
  exactly now stays editable; the unmeasured parts; the readout against a tag). **Open
  with Johnny:** the last thrust live at once; a route that ends in a jump; a compact
  console at 520 px. **Owed to A after K7c:** an optional "hours typed" field on a leg.
  B is already in K7b (`apps/api/src/universe/`), with the v6 evidence and the hardening
  report still to come.
- **Follow-up 31, a flight log for every vessel** (§181): a paper design by B after K7b.
  Ruled (G10): a logged leg may be struck (with Undo) and its note edited, never re-timed.
- **Last push `9a95a0c`** (§182), tests green and live: C's rings, corrected climate and
  city lights step 2. C has `c_city_lights_3.md`. **A trap in the rehearsal method, found
  on this push:** the scratch copy resolves `@voyage/shared` (and engines, generation,
  api) through `node_modules/@voyage/*`, which link to the **real** tree, so a rehearsal
  builds against whatever is uncommitted in `packages/`. The live file names then differ
  from the rehearsal's while the content is right. Until the scratch copy gets its own
  `@voyage` links, check a deploy by content (a string only the pushed work has, and none
  of the unpushed work's), not by the entry's name. Nothing is open with Johnny.
- **Earlier: `703041d`, green.** **The stack by agent (§169), in order:**
  A `a_course_preview.md`, then `a_vessels_on_map.md`; D `d_ghost_wiring.md`, then
  `d_waypoints.md` (follow-up 28: select on the picture, the docked tag, a course of
  waypoints, Play and the speed steps); C `c_toggle_motion_4.md`, then city lights steps 2
  to 5 (step 2 not written), then the surfaces reading `surfaceTempBand`; E
  `e_card_gap.md`; B `b_engine_t1_7.md` when v6 finishes. Slingshots and the ship's own
  numbers are backlog in `plan.md` "After 5".
- **Open with Johnny:** only D's four design choices (§144), each with a standing default.
  G7 is answered: F designed the city lights; Enhanced is to be the default.
- G5 was taken as the recommended option
  (§140). He expects a supplement ("Cluster Truck") to change travel rules later: keep the
  plotting rules easy and in `rules/`, so a change is an edit to a file.
- `findings/rules_notes/mgt2e_drives.json` holds the drive tables he pasted, for vNext; it
  is not in `rules/` and nothing reads it.
- **The orchestrator owes two recipes:** part 2b ("where a ship is") for A, and T1.4 / T1.6
  for B.
- **Both new rules files are drafts in `findings/rules_drafts/`** until Johnny copies them
  into `rules/` and runs `npm run rules:gen`. Check `ls rules/` before accepting A's or
  B's report.
- **Agent F:** parked.
- **Last push:** `c6b6841` (ship MVP part 1, the two rules files, the D brief and the
  prompt files), deployed and green (§131). Nothing finished is local except `directives/`.

## 7. Decisions Johnny has made that shape the next steps

- **Ship MVP first**, then the motion items (14 moved to C in parallel), then the docked
  card (15), the terminal card (18), the panes swap (17).
- **Many ships at once; a vessel's track is a black-box record** of dated legs, replayable
  and reusable; generated traffic later (K16); shared feeds and faction accounts (K17).
- **Sensor designators** are vector wireframes (Homeworld-style); **plotting mode** is a
  toggle with pointer-tracking hairlines and coordinates, 2D; fuel and time rules after.
- **The orbit view's chrome:** yes to all twelve K15 choices and all seven drawer choices.
- **After the campaign MVP comes the Builder** (`plan.md`): own universe as an overlay on
  the truth, generation with names and rollups, Mongoose 2e and T5 (both already in
  `packages/generation`). The engine corrections gate it; F2 is still open.
- All sixteen of D's campaign design choices are adopted; D's own design notes are the
  record of each built step.
- **Jump and travel rules (2026-10-06):** 100 diameters; Time = 2 × √(Distance ÷
  Acceleration); a jump is 148 + 6D hours, rolled by the app and editable; reach is the
  jump number in parsecs; fuel 10% of hull per parsec. The app shows and warns, never
  refuses (orchestrator's ruling). The climate table is provisional and editable.

## 8. Parked, with everything written down

- **Engine corrections (`plan_engine_corrections.md`): restarted 2026-10-06.** 93% of
  mainworlds contradict their charts; two tiers (v6 derived labels, v7 regenerate). F2 is
  answered (a provisional, editable array in `rules/`); T1.1 done, T1.2 with B, then T1.3
  to T1.7. No v6 build or release without Johnny's word.
- **K12 rules (G1): answered 2026-10-06** from the book (`slice_2_campaign.md` K12, "Rules
  supplied"). Not supplied, not built: Astrogation checks, inaccurate jumps, unrefined
  fuel's danger, current fuel aboard.
- **Surfaces:** enhanced shared terrain and disc, the no-WebGL painter, delighters, 2.5D.
- **Viewer leftovers:** Trade Match, legend, help, settings.
- A real Geomorph Shipyard export and its picture, from Johnny, to prove deck plan parity.

## 9. Open with Johnny (`questions_for_johnny.md`)

None blocks work. F2, G1 and G2 were answered on 2026-10-06 (G2: the MVP only measures; a
100-ton hull is assumed; ship fields and warnings are vNext) and G3 (manoeuvre drives use no
fuel; reaction drives 2.5% of tonnage per Thrust per hour) and G4 (yes: both fuel lines on
a flight; the sum is 2.5% × hull × G × hours). **Nothing is open with him on the ship MVP.**
The updated rules draft (`findings/rules_drafts/mgt2e_space_travel.json`, a `manoeuvre`
block) must be copied over `rules/` by him; check `grep manoeuvre rules/mgt2e_space_travel.json`.
Also open: E4 to E8, B1 to B5 (map), C1 to C3 (app; C3 is "deploy from
main, preview from campaign"), D2 to D4. Four `CLAUDE.md` edits only he can make are listed
in handoff §4. Put each to him in full in the chat when its turn comes (§2).
