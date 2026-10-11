# Board

One line per lane. Only the orchestrator edits this file. Updated 2026-10-11 13:50.

**The Builder push is ready and not yet made** (findings/push/builder_2026-10-11.md).
Every prompt below says "start only after the board says the push is made": until
this line changes, no lane starts.

| Lane | Status | Current prompt | Blocker / next |
|---|---|---|---|
| A | waits for the push | prompts/a_dossier_open_frame.md | holds DossierPanel.vue and DossierBody.vue this turn |
| B | waits for the push | prompts/b_marketplace_contract.md | two contracts, no code |
| C | free | | |
| D | waits for the push | prompts/d_grow_one_act.md | grow_acts.ts onto B's one act |
| E | waits for the push | prompts/e_checker_colours.md | checker patch and allowlist; no product file |
| F | parked | | |

## Shared files this turn
- dossier/DossierPanel.vue, dossier/DossierBody.vue: **A only**, first-render path.
- views/OrbitView.vue: no lane.
- design/tokens.css: any lane may append its own token lines.

## Contracts
- contracts/b_builder.md (B): the Builder routes, the draft cycle, sectors, undo, and
  the one act: `POST .../generate` with `makeSectors`, `POST .../sectors/undo-generate`.
- Next: contracts/b_marketplace.md, contracts/b_public_games.md.

## Direction (Johnny, 2026-10-10)
1. Get the galaxy Builder working (this push, then D's one-act Undo).
2. Then the content marketplace, stub size b.
3. Then public games: the party ship as a non-interactive mark on other users' maps
   on the same base truth.
4. Campaign steps alongside where they need no server and no shared file: E's order
   (findings/campaign_gap_audit.md §4), steps 1 to 5 first. Step 4 (`@` mention) is done.

## Known, not fixed
- **The last commit fails five golden tests on a fresh checkout**
  (`tests/golden/esm.test.js`: mgt2e_topdown_bare, mgt2e_flesh_from_tsv,
  mgt2e_society_expand, orbit_normalize_1, orbit_normalize_2), with or without this
  push. They are the five fixtures of the held water-against-ice set: the working tree
  passes only because the nine engine lines and the five fixtures are on disk. The push
  neither causes nor cures it. Put to Johnny.
- Opening a body's dossier presents a 58 to 75 ms frame (budget 50): A, after the push.
- Letting go of a 409-hex box: 175 ms in headless software rendering; not measured on
  a real GPU.
- D's empty-slot Undo is two calls until prompts/d_grow_one_act.md is done.
- D's browser pass did not show the paired-star removal ask (unit test only) or read
  the blank request body (read from what the server stored).

## Pending push
findings/push/builder_2026-10-11.md and builder_2026-10-11_files.txt. In: Builder
steps 2 and 3 with select-hexes and the step 3 close, the one-act generate on the
server, the orbit fix and star colour tokens, the hybrid surface map with its colour
tokens, the `@` mention, the file bus. Out: the six engine paths, B's parked
truth-build hardening (with router.ts and scripts/dev_make_admin.js), and
assets/HybridSurfaceMap_Design.md (no report claims it).

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

## Open with Johnny
1. The five golden tests red on the last commit: ship the held engine set, or leave it?
2. D: reserve the "Design by hand…" line in the right-click menu with "Checking…"?
3. assets/HybridSurfaceMap_Design.md: in the push or not?
