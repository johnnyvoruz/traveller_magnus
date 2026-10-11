# Board

One line per lane. Only the orchestrator edits this file. Updated 2026-10-11 16:30 (clock corrected).

**The Builder push is made: `8118f72`, 2026-10-11.** Every prompt that says "start
only after the board says the push is made" may start.

| Lane | Status | Current prompt | Blocker / next |
|---|---|---|---|
| A | go | prompts/a_belt_around_world.md | draw a belt that orbits a world |
| B | go | prompts/b_hand_followups.md | orbits kept on "Design by hand", star class, star dropdowns, messages. Then prompts/b_marketplace_server.md |
| C | **not started** (no Progress line, no report) | prompts/c_orbit_textures_2.md | urgent: grey discs at middle zoom (Azgul Kou, Meshan 2008) |
| D | **not started** (no Progress line, no report) | prompts/d_marketplace_screens.md | then prompts/d_hand_designer_3.md after B's follow-ups |
| E | working (files changing; the build fails in its files meanwhile) | prompts/e_campaign_nav_avatar.md | |
| F | parked | | |

## Shared files this turn
- dossier/DossierPanel.vue, dossier/DossierBody.vue, views/OrbitView.vue: no lane.
  (C may read OrbitView.vue for the texture fault and must not edit it.)
- design/tokens.css: any lane may append its own token lines.
- workspace/ outside build/ (RecordPage.vue, RecordGallery.vue, CampaignPanel.vue,
  CampaignList.vue, PartyPanel.vue, PersonCard.vue, RecordPicker.vue,
  gallery_state.ts, images.ts): **lent to E** this turn; D stays in workspace/build/.
- orbit/disc_batch.ts and the disc drawing in orbit/OrbitRenderer.ts: **lent to C**.

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
- **Live: the orbit view's worlds are grey discs with day and night but no texture**
  (Johnny's screenshot, Azgul Kou, Meshan 2008, middle zoom). C's first pass tested a
  world filling the frame, which is textured; the middle zoom is another path.
  Whether it is a regression or was never textured at that zoom is part of C's job.
- The profile roll is not built yet (B, prompts/b_hand_roll_belt.md); D's button is
  drawn, not wired.
- "Design by hand" on a generated system drops every orbit (D found it): B,
  prompts/b_hand_followups.md.
- About fifty Builder server messages break the copy standard (raw ids, raw JSON,
  legacy control names): B, same prompt.
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
**Ready: findings/push/builder_2026-10-11b.md** (98 paths, version 1.1.1). Johnny reads
findings/engine_roll_body.md first. E's Campaign work in flight stays out.

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

## Open with Johnny
1. Is it right that only the app version moves per push, not the engine version?
