# Lane C — twelve example games for the public map (story content)

Issued 2026-10-14 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/board.md`, `directives/lanes/C.md`, then this file,
`directives/contracts/b_party_ships.md` ("The public card", "Example games") and
`directives/prompts/z_example_packages.md` (answer 2, item 6: Lane Z turns your files into
example games on the map). No git but read-only, no deploy, no `rules/`.

## Johnny's words (2026-10-14)

"All party ships that are published or public should show up on the map, you might need to
create some pseudo accounts to showcase the feature so we make like 6 or 12 accounts each
with a ship and it shows the ship and who's on it." Public ships are "really just for
flavor ... to establish a 'Community' feeling vibe." Example games carry an "Example"
tag. A referee chooses whether their name shows.

## Do

Write **12 games**, one file each: `tools/examples/games/<slug>.json`.

```json
{
  "game": "The Long Haul",
  "referee": "quiet_navigator",
  "showReferee": true,
  "clockDays": 403501,
  "ships": [
    {
      "name": "Kestrel's Due",
      "crew": ["Mara Quell", "Tobin Ashe"],
      "legs": [
        { "from": "Spinward_Marches/1910", "to": "Spinward_Marches/2007", "departs": 403480, "arrives": 403487 }
      ]
    }
  ],
  "journal": [
    { "title": "Docked at Roup", "body": "…", "when": { "year": 1105, "day": 132 } }
  ]
}
```

- **The days:** `clockDays` is the game's current date as a day count,
  `year * 365 + day - 1` (the app's own rule: `PUBLIC_DEFAULT_DAYS` in
  `packages/shared/src/public_hex.ts`). Every leg in the file is **finished**: it arrives
  on or before `clockDays`. Legs are in time order, and each departs at or after the
  previous one arrives. A ship stands where its last leg arrived, so that is where its
  dart shows.
- **Ships:** 8 games with one ship and 4 with two or three, about 18 ships in all. Each
  ship has 1 to 5 crew names and 2 to 6 finished legs.
- **Where:** each leg joins two real v10 systems (hex keys read from `truth-local/v10/`)
  at most 2 hexes apart. That limit is a choice for this content, not a rule claim. Put
  most games in the Spinward Marches, and a few in other charted sectors, so the map
  feels lived in beyond Regina. **Two games' ships end on the same hex**, so the stacked
  darts show.
- **Referees:** made-up handles, all different, none like a real person's name. Set
  `showReferee` true on about half. Check the app's handle rule (find where a profile
  handle is validated) and follow it.
- **Journal:** one to three public entries per game. Each is a short log a crew might post:
  at most about 80 words, in plain prose. `when` is a date on or before the game's
  clock.
- **Rules for the content** (as in your packs): original only, nothing from a published
  Traveller book; no game statistics, prices or UWP digits; nothing that contradicts what
  the truth says about a world; list every truth fact you relied on in
  `findings/examples/c_example_games.md`. No name may repeat one already in
  `tools/examples/packs/`.

Add `tests/web/example_games_c.test.js`: every file has the shape above; every hex key
exists in the v10 truth; every leg is finished by `clockDays`, in time order, and at most
2 hexes long (use the app's hex distance from `packages/shared` or `packages/engines`
core, not your own); handles are unique and pass the app's rule; no name repeats across
the games and the packs; two games end on one hex.

## Owned files (this pass)

`tools/examples/games/`, `tests/web/example_games_c.test.js`,
`findings/examples/c_example_games.md`, `directives/reports/c_example_games.md`. Nothing
else.

## Gates

`npm test`, `npm run check`, pasted.

## Stop rule

Stop when the 12 files exist, the test passes and the report is written. The report lists
each game: name, referee (and whether shown), ships with their final hex, and crew.
Write `directives/reports/c_example_games.md` from `directives/reports/_TEMPLATE.md`.
After each meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: read the public-card contract, Z's item 6, the day-count rule, judgeUsername, and getHexDistance. No game files were in the tree. next: write the twelve games from v10 systems.
done: wrote 12 game files, the test, and the chart notes. Handles follow judgeUsername. Two ships end at Spinward_Marches/2007. next: run the test and the gates.
done: example games test passed. npm test 1726 pass, 0 fail, 33 skipped. check clean. Report written. next: stop.
done: chart lookups moved into their own tests and skip when truth-local/v10/sectors is absent. Other checks still run. next: prove both ways, then the gates.
done: with the chart present, 6 pass. With VOYAGE_TRUTH_SECTORS pointed at a missing folder, 4 pass and 2 skip on that sentence. npm test 1730 pass, 0 fail, 33 skipped. check clean. next: stop.

## Fix 1 (orchestrator, 2026-10-14; go again)

Accepted, with one fault that would turn GitHub's test run red. `truth-local/` is
gitignored, so a fresh checkout (`npm ci` then `npm test`, as `.github/workflows/test.yml`
runs it) has no `truth-local/v10/`. `tests/web/example_packs_c.test.js` reads it at load
(line 10) and fails the whole file. `tests/web/example_games_c.test.js` fails its
shape test.

In both files, when `truth-local/v10/sectors` does not exist, **skip only the checks that
need it** (a hex key exists on the chart), with node:test's
`{ skip: 'truth-local/v10 is not in this checkout' }`. Every other check keeps running:
parsing, links, names, finished legs, distances (the app's hex math needs no chart),
handles. Prove it both ways: run each file normally, then with the folder hidden (for
example, by pointing the path at an environment variable you set to a missing folder in
the test run, not by moving `truth-local/`). Owned files: those two tests only. Gates:
`npm test`, `npm run check`. Add a line to `directives/reports/done/c_example_games.md`.
