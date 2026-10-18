# Lane Z — example packages for the marketplace: the pipeline, two map packs, the copy to production

Issued 2026-10-14 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/Z.md`,
`directives/contracts/b_marketplace.md` (all of it, F0 to the end), then this file. You built
the marketplace (`prompts/z_marketplace.md`, `findings/marketplace/`); reuse that setup.
No git but read-only, no deploy, **no production command of any kind** (no `--remote`), no
`rules/`.

## Johnny's words (2026-10-14)

"Let's have some of the agents make some example content for the marketplace, it's empty
right now."

## The whole job

Six example packages, published by one house account, on chart **v10**:

| Slug | Kind | Made by |
|---|---|---|
| `regina-highport-contacts` | people | C (`prompts/c_example_packs.md`) |
| `jewell-patrons` | patrons | C |
| `free-traders-of-the-marches` | ships | E (`prompts/e_example_packs.md`) |
| `the-glass-hand` | organization | E |
| your placeable piece (you name it) | sector piece | you |
| your charted system (you name it) | system | you |

C and E write theirs as **campaign export files** (`apps/web/src/campaign/import.ts`
`CampaignExport`) at `tools/examples/packs/<slug>/campaign.json` with
`tools/examples/packs/<slug>/listing.json` (`title`, `kind`, `description`, `tags`). They
contain records and links only, anchored on charted v10 hexes. You turn all six into
published packages and give Johnny one command that puts them on production.

The house account (Johnny, 2026-10-14, created on production with a passkey): handle
**`Traveller_Voyage`**, user id **`e2b2245a-5260-4b91-8f33-1e02997fd9d5`**. Keep both as
parameters (`EXAMPLE_HANDLE`, `EXAMPLE_USER_ID`) with these defaults, never scattered
through the code. The local publish uses the handle exactly as written (case included)
so the manifests' `authorHandle` matches production. The copy refuses unless production
has a user with that id **and** that handle on its profile, and prints what it found.

## Do

1. **The two map packs (yours).** On a local wrangler state of your own (like
   `findings/marketplace/`, with the v10 overview in its bucket), as the house account:
   - **A sector piece:** a small cluster in an own sector, made with the Builder (engine
     generation only, no hand-typed world data), named by you, with a few records
     (places, a note) so it reads as a place worth visiting. It must import **placed**
     onto another campaign's map, the feature Johnny asked for ("place it like a puzzle
     piece somewhere else").
   - **A charted system:** one v10 system with what the Builder lets a referee add to it,
     plus a few records. It imports **in place**.
   Original names and prose only. No game statistic you did not get from the engine or
   the truth. Plain, game-ready prose: a referee can use any record at the table in
   under a minute.
2. **The loader** `tools/examples/build_local.mjs`: from a fresh local state, creates the
   house account, one universe per pack on v10, loads each C/E `campaign.json` into its
   universe through the app's own routes (the campaign changes API or the import path,
   whichever `import.ts` uses), recreates or restores your two map packs, and publishes
   all six through `POST /api/packages` and `.../versions` with the hexes and records
   each needs. Re-running it on a fresh state gives the same packages. It refuses a pack
   whose files fail `CampaignExport` parsing and names the file and the field.
3. **The copy to production** `tools/examples/seed_production.mjs`. It reads the local
   state after step 2 and writes what production needs: the D1 rows (packages, versions,
   and whatever rows they depend on, such as the house account's universes) and the R2
   objects (manifests and content-addressed objects). It looks up the house account on
   production by handle and **refuses if that account does not exist** (Johnny creates it
   with a passkey first). Rules:
   - It prints exactly what it will write and asks for nothing; Johnny runs it with
     `--apply`. Without `--apply` it changes nothing.
   - Running it twice adds nothing the second time.
   - `--remove` deletes the D1 rows it made (plain delete, Johnny's standing rule; the
     content-addressed objects may stay).
   - Install counts start at 0.
   - **You never run it with `--apply` against production.** You run it against a
     second, fresh local state standing in for production (its own wrangler config and
     database, with the house account created there first).
4. **The rehearsal**, on that second local state after the copy: signed out, the
   catalogue lists six packages with the right kinds and tags; each package page shows
   its outline; a second local account imports every pack into a v10 campaign (the
   sector piece placed, the others in place) and the records arrive with their links.
   Shots `findings/ui_design_shots/kb20_examples_*` at 1600 and 520 px.
5. **Johnny's steps**, at the end of your report and in `tools/examples/README.md`:
   the exact commands, in order, starting with "sign up on traveller.voyage with the
   handle X", each with what it should print.

## Owned files (this pass)

`tools/examples/` (except `tools/examples/packs/regina-highport-contacts/`,
`jewell-patrons/`, `free-traders-of-the-marches/`, `the-glass-hand/`, which are C's and
E's: read them, never edit them; a fault in one goes under "Needs from others"), your
notes under `findings/examples/`, shots, tests under `tests/tools/` or `tests/web/`,
`directives/reports/z_example_packages.md`.

If the copy needs a change in `apps/api` (for example a route or column the copy cannot
reach from outside), stop and write it under Halt & Challenge with the smallest change;
do not make it. Lane B is working in `packages/shared/src/schemas/campaign.ts`,
`public_games.ts`, `public_hex.ts`, `apps/api/src/universe/campaign.ts`, `public_mark.ts`
and `routes/public_games.ts` this turn: do not touch them. If B's work changes the
settings shape under you mid-run, use the tree as it stands and say so.

**Never touch:** the ten parked truth-build files, `versionvideo/`, `packages/engines`,
the fixtures, `rules/`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted; the loader's
and the copy's output on the rehearsal state, pasted.

## Stop rule

Stop when the rehearsal passes and the report is written. If C's or E's packs are not
there yet when everything else is done, finish with your two and say which are missing.

Write `directives/reports/z_example_packages.md` from `directives/reports/_TEMPLATE.md`.
After each meaningful step append one line under Progress: "done: X. next: Y."

## Progress
done: read the contract chain for the copy; halted: a placed import reads the source universe's Durable Object (installs.ts ownSlots), which a D1+R2 copy cannot create; report written with two smallest changes. next: wait for the orchestrator's choice.
done: F15 (manifest ownSectors, place() reads it first, contract F15, tests/api/install_source_gone.test.js passes); seeding checked: generateHex reseeds per hexKey and own sector ids are random, so the loader records and restores. next: build_local.mjs and the two Z packs.
done: tools/examples/lib.mjs, build_local.mjs, packs_z/feri-terraces and packs_z/hollow-verge (recorded once); two fresh runs give the same six fingerprints. found: links are not in a package (publish ships records only). next: seed_production.mjs and the rehearsal.
done: seed_production.mjs (print, --apply twice, --remove) and the rehearsal on findings/examples/standin: 6 packages signed out, 82 records imported, Hollow Verge placed from the manifest, 0 links; shots kb20_examples_*; gates green. next: report, stop.
done: F16 (manifest records.links, publish job ships links with both ends published, install writes them with provenance, remove tombstones them; contract F16; tests/api/install_links.test.js passes). next: rebuild the six, reseed the stand-in, rehearse links.
done: rebuilt the six (two fresh runs, same fingerprints), reseeded a fresh stand-in, rehearsal: 82 records and 64 of 64 links arrive. seed_games.mjs built and rehearsed with a Lane Z fixture (C's games/ not on disk yet): signed-out feed shows 3 example ships, cards right, --remove --apply leaves no example row, user or profile; README has the production order; gates green. next: report, stop; seed C's twelve when they land.

## Orchestrator answer, 2026-10-14 (your two questions; go again)

1. **Change 2, the fuller one, and you make it.** Reason: the same fault hits a real
   referee who publishes a sector piece and later deletes or empties that map. Every
   placed import of their package would then fail. Production has no published package
   yet, so a manifest field costs nothing now.
   - The publish job writes each own sector's slot into the manifest (an optional field,
     so a manifest without it still parses). `place()` in `routes/installs.ts` reads
     source slots from the manifest first and falls back to the source universe's
     object only when the field is absent.
   - Add a worker test: publish a piece, empty or delete the source universe, then a
     placed preview and install still land where they did before.
   - Write the field and the rule into `contracts/b_marketplace.md` as a new F section.
   - Added to your owned files for this: `packages/shared/src/schemas/package.ts`,
     `apps/api/src/jobs/publish_queue.ts`, `apps/api/src/routes/installs.ts`,
     `directives/contracts/b_marketplace.md`, and their tests. Lane B is in
     `schemas/campaign.ts`, `routes/universes.ts` and the public files this turn, not
     these.
2. **The charted system: records only, as you read it.** The charted tree stays
   unchanged, and the records sit on the system and its bodies. A fresh engine roll would
   replace the chart, which is the opposite of the point.
3. Your note on own-sector ids and seeding: check how `generateHex` seeds first. If a
   fresh run makes different systems, the loader records the engine output once and
   restores it, so the packages come out the same on every run.
4. C's and E's four packs are on disk now (`tools/examples/packs/`). E is renaming two
   people in `the-glass-hand` that clash with C's names. Load whatever is there when you
   reach that step.
5. **Johnny, 2026-10-14: deleting content never claws it back from anyone who installed
   it.** An install is a full copy, and it must stay whole whatever the publisher does
   later. Extend the step 1 worker test: after an install, delete the source universe
   (`DELETE /api/universes/:id`) and take the package down. The installed hexes, objects
   and records in the other campaign are byte-identical before and after, and a new
   placed preview from the manifest still lands. Add one sentence saying this to the new
   F section of `contracts/b_marketplace.md`.

## Orchestrator answer 2, 2026-10-14 (your five questions; go again)

Accepted as partial: F15, the never-claw-back test, the loader, the copy and the
rehearsal all check out. Answers:

1. **Links travel in a package: yes, F16, yours.** A "people to know" pack without who
   works where loses half its value. Add `links` to the manifest's records object: the
   links whose two ends are both published, with their visibility. Install them with the
   records, ends rewritten to the installed ids, provenance like the records. A manifest
   without `links` still parses and installs as today. Remove deletes them with the
   import's records (plain delete). Write F16 in `contracts/b_marketplace.md`. Files:
   `schemas/package.ts`, `jobs/publish_queue.ts`, `routes/installs.ts`,
   `apps/api/src/universe/install.ts`, tests. Then rebuild the six packages and rerun
   the rehearsal: the records **and their links** arrive (64 of 64).
2. **Keep the seeded universes live.** They are the house account's own list.
3. **Keep the engine's names in Hollow Verge.** It is what every referee gets from the
   Builder. Johnny can rename by publishing version 2 from the house account later.
4. **Leave the provenance.** An import overwrites it.
5. **Keep the charted hexes in a records pack.**
6. **Then the example games** (Johnny: "make like 6 or 12 accounts each with a ship and it
   shows the ship and who's on it"; tagged Example; "make them easy to remove later").
   Lane C is writing the content now as `tools/examples/games/*.json`
   (`prompts/c_example_games.md` gives the format). Build `tools/examples/seed_games.mjs`:
   - One user and profile per game (the referee's handle from the file), never able to
     sign in: no passkey, no session.
   - One universe per game on v10 with `public_games = 1`, `example = 1`, and
     `show_referee` from the file.
   - The feed and the card read D1 only (`public_ships`, `public_cards`). Write those rows
     directly, in exactly the shape B's write produces. Use B's own functions from
     `packages/shared/src/public_hex.ts` (`publicMarkId`, `fitPublicCard`, and so on) so
     the shape cannot drift. The universes' Durable Objects stay empty: nobody signs in
     as these accounts, so nothing ever saves over the rows.
   - Same rules as the package copy: dry by default, `--apply`, idempotent, `--remove`
     deletes every example account, universe and row (B's contract, "Example games",
     gives the order). `--to-local` for rehearsal, `--production` for Johnny only.
   - Rehearse on a stand-in with 0017 and 0018: signed out, the feed shows every example
     ship with `example: true`; each card shows its finished legs and public entries; then
     `--remove --apply` leaves no example row, user or profile behind.
   - Johnny's steps go into `tools/examples/README.md`.

**Order on production (for the README): push 1.2.1 first** (it carries F15, F16, 0017 and
0018), then the package copy, then the games. Say so at the top of Johnny's steps.

Owned files: as before, plus `apps/api/src/universe/install.ts` and
`tools/examples/seed_games.mjs`. `tools/examples/games/` is C's: read it, never edit it.
Lane B is in `apps/api/src/universe/campaign.ts`, `routes/universes.ts`,
`routes/public_*.ts` and `packages/shared/src/schemas/campaign.ts` this turn (Fix 1). Do
not touch them. Update your report; the Status line says which of 1 and 6 are done.

## Orchestrator answer 3, 2026-10-14 (your four questions; go again)

F16 accepted: 64 of 64 links arrive. C's twelve games are on disk (`tools/examples/games/`).

1. **Email:** keep `<handle>@example.invalid`, `email_verified = 0`.
2. **Handles:** use the app's own rule, `judgeUsername` in
   `apps/api/src/auth/passkey_words.ts` (C's test follows it too). Drop your own pattern.
   Keep the "not another account's handle" check.
3. **Accept** that the example universes have no Durable Object state. Nobody can sign
   in as them.
4. **Run `seed_games.mjs` on C's twelve** on a fresh stand-in with 0017 and 0018, and take
   the shots there: signed out, the map with every example ship (Spinward Marches,
   Deneb, Trojan Reach, Gvurrdon), the stacked pair at Spinward_Marches/2007, two cards
   (one showing its referee, one not), at 1600 and 390 px, as
   `findings/ui_design_shots/kb23_example_games_*`. Then `--remove --apply` leaves nothing.
5. **A push is being prepared.** Change only `tools/examples/seed_games.mjs`, its test and
   the README this pass, nothing in `apps/` or `packages/`. Update your report; when it
   is done, the Status line says done.

done: answer 3 (judgeUsername, twelve seeded, rehearsed, shots, removed to zero, gates green). next: orchestrator on the 390 card tap and the hidden stacked ship.
