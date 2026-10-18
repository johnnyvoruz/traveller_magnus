# Lane C — two example packs for the marketplace (story content)

Issued 2026-10-14 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/board.md`, `directives/lanes/C.md`, then this file and
`directives/prompts/z_example_packages.md` (the whole job; Lane Z turns your files into
published packages). No git but read-only, no deploy, no `rules/`.

Johnny, 2026-10-14: "Let's have some of the agents make some example content for the
marketplace, it's empty right now."

## Your two packs

1. **`regina-highport-contacts`**, kind `people`. The people and businesses a crew
   meets at Regina's starport: about 8 persons, 3 businesses, 1 or 2 places, linked
   (who works where, who owns what, who knows whom). Each person has a hook a referee
   can use tonight.
2. **`jewell-patrons`**, kind `patrons`. Six jobs in the Jewell subsector, each a `job`
   record with its patron (a `person`), spread over four to six different systems, plus
   one or two `event` records that tie two of the jobs together. Leave pay to the
   referee: write "Pay: the referee's call" rather than a figure.

## Rules for the content

- **The chart is the source.** Find each world's hex key in the v10 truth
  (`truth-local/v10/`; Regina is in the Spinward Marches). Anchor every record to a real
  hex. Write nothing that contradicts what the truth says about a world (starport,
  size, atmosphere, population, government, law, tech level, bases, trade codes). List
  every truth fact you relied on, with the file, in your notes.
- **No game statistics and no rule from memory:** no characteristics, skill levels,
  UWP digits, prices or ship statistics, no `sheet` (it stays `null`).
- **Original only.** Invent every person, business and plot. No character, company,
  adventure or text from a published Traveller book. World names from the chart are
  fine.
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

Add `tests/web/example_packs_c.test.js`: each of your two files parses as an export the
app's import accepts, every anchor is a hex that exists in the v10 truth, every link's
ends exist in the same file.

## Owned files (this pass)

`tools/examples/packs/regina-highport-contacts/`, `tools/examples/packs/jewell-patrons/`,
`tests/web/example_packs_c.test.js`, your notes under `findings/examples/c_*.md`,
`directives/reports/c_example_packs.md`. Nothing else. Lane B is changing the campaign
settings schema this turn; your files carry no settings, so that does not reach you.

## Gates

`npm test`, `npm run check`, pasted.

## Stop rule

Stop when both packs parse, the test passes and the report is written. Write
`directives/reports/c_example_packs.md` from `directives/reports/_TEMPLATE.md`, with the
records' names listed per pack. After each meaningful step append one line under
Progress: "done: X. next: Y."

## Progress

done: read the export schema and the v10 Spinward Marches index. next: write both packs from those facts.
done: both packs, the parse test, and the chart notes. npm test 1680 pass, 0 fail. check clean. Report written. next: stop.
