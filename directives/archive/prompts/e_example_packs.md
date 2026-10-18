# Lane E — two example packs for the marketplace (story content)

Issued 2026-10-14 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/board.md`, `directives/lanes/E.md`, then this file and
`directives/prompts/z_example_packages.md` (the whole job; Lane Z turns your files into
published packages). No git but read-only, no deploy, no `rules/`.

Johnny, 2026-10-14: "Let's have some of the agents make some example content for the
marketplace, it's empty right now."

## Your two packs

1. **`free-traders-of-the-marches`**, kind `ships`. Five `vessel` records working the
   Spinward Marches, each with its captain and two or three crew (`person` records,
   linked with `commands` and `crew`), a home port anchor, and one hook per ship (a debt,
   a rival, a strange cargo). Ship classes may be named in words ("a far trader") but
   carry no statistics.
2. **`the-glass-hand`**, kind `organization`. A smuggling ring or shady guild (you name
   it; the slug stays) with its leader and four to six members (`member` links), two or
   three `place` records (safehouses, a front business), and three `note` records holding
   rumours a crew might hear, spread across three or four systems in one subsector.

## Rules for the content

- **The chart is the source.** Find each world's hex key in the v10 truth
  (`truth-local/v10/`). Anchor every record to a real hex. Write nothing that contradicts
  what the truth says about a world (starport, size, atmosphere, population, government,
  law, tech level, bases, trade codes). List every truth fact you relied on, with the
  file, in your notes.
- **No game statistics and no rule from memory:** no characteristics, skill levels,
  UWP digits, prices or ship statistics, no `sheet` (it stays `null`), no `track` on the
  vessels.
- **Original only.** Invent every person, ship, group and plot. No character, ship,
  company, adventure or text from a published Traveller book. World names from the
  chart are fine.
- **Plain and game-ready.** `summary` is one sentence. `details` is at most about 120
  words: who they are, what they want, the hook. No purple prose; the app follows
  developers.google.com/style for its own copy, and these records should read as clean.
- `visibility`: `referee` for secrets and hooks, `players` for what a crew would know.
  Use both.

## Format

`tools/examples/packs/<slug>/campaign.json`, a `CampaignExport` (`apps/web/src/campaign/import.ts`)
with `records` and `links`, `journal: []`. Every record and link must pass
`CampaignRecord` / `CampaignLink` in `packages/shared/src/schemas/campaign.ts`
(ids, revs, timestamps, the link kinds' allowed types). `tools/examples/packs/<slug>/listing.json`:
`{ "title", "kind", "description", "tags" }`, the description two or three sentences,
three to five tags (include the subsector name and `example`).

Add `tests/web/example_packs_e.test.js`: each of your two files parses as an export the
app's import accepts, every anchor is a hex that exists in the v10 truth, every link's
ends exist in the same file.

## Owned files (this pass)

`tools/examples/packs/free-traders-of-the-marches/`, `tools/examples/packs/the-glass-hand/`,
`tests/web/example_packs_e.test.js`, your notes under `findings/examples/e_*.md`,
`directives/reports/e_example_packs.md`. Nothing else. Lane B is changing the campaign
settings schema this turn; your files carry no settings, so that does not reach you.

## Gates

`npm test`, `npm run check`, pasted.

## Stop rule

Stop when both packs parse, the test passes and the report is written. Write
`directives/reports/e_example_packs.md` from `directives/reports/_TEMPLATE.md`, with the
records' names listed per pack. After each meaningful step append one line under
Progress: "done: X. next: Y."

## Progress

done: no half-finished pack files on disk. next: write both packs from the v10 chart.
done: both packs are written and the pack test passes. next: the notes, then the gates.
done: notes are written. npm test and npm run check passed. next: the report.
done: Wynn Solas and Edric Holm replace the two names that clashed with C. next: the cross-pack name test, then the gates.
done: the name test passes across all four packs. npm test and npm run check passed. next: the report.
done: Fix 2 is open. The chart check still reads truth-local/v10 directly. next: skip that check when the folder is absent, then both proofs.
done: the chart check skips when the sectors folder is missing, and runs when it is present. next: the report line.

## Fix 1 (orchestrator, 2026-10-14; go again)

Two people in `the-glass-hand` have the same names as two different people in C's
`regina-highport-contacts`: **Sera Quill** (C: a broker in Gallery C; yours: the Glass
Hand's leader and owner of Lantern Chandlery) and **Bram Keller** (C: a night-shift
crate mover at Regina; yours: at Efate). A referee who imports both packs would get two
unrelated records with one name. Rename yours: new original names, and every mention in
`details`, `summary` and your notes changes with them. Then check all four packs together
for any other repeated name, and add that check to `tests/web/example_packs_e.test.js`
(no record name appears in more than one pack under `tools/examples/packs/`). Leave the
settings as they are: Lane B's change reads that old empty party correctly (the test
suite passes with it). Owned files as before. Gates: `npm test`, `npm run check`. Update
your report.

## Fix 2 (orchestrator, 2026-10-14; go again)

`truth-local/` is gitignored, so a fresh checkout (`npm ci` then `npm test`, as
`.github/workflows/test.yml` runs it) has no `truth-local/v10/`, and
`tests/web/example_packs_e.test.js` fails both pack tests there (line 20). When
`truth-local/v10/sectors` does not exist, **skip only the hex-on-the-chart checks** with
node:test's `{ skip: 'truth-local/v10 is not in this checkout' }`. Parsing, link ends and
the cross-pack name check keep running. Prove it both ways: normally, and with the path
pointed at a missing folder through an environment variable (do not move `truth-local/`).
Owned files: that test only. Gates: `npm test`, `npm run check`. Add a line to
`directives/reports/done/e_example_packs.md`.
