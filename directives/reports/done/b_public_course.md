# Lane B public course report
Prompt: prompts/b_public_course.md
Status: done

Found: no Progress lines, and no course edits in the owned files.
Finished: `PublicShipCard.course`, `universes.show_course` (default on), migration 0020, and the Lane D section of the public-games contract.
Backed out: nothing.

## Changed files
- `packages/shared/src/schemas/public_games.ts`: optional `showCourse` on the setting; required `course` on the card, same leg shape as `legs`.
- `packages/shared/src/schemas/campaign.ts`: optional `Universe.showCourse`, present only after 0020. The browser drops an unknown key, so the field has to be declared for the new bundle to keep it.
- `packages/shared/src/public_hex.ts`: `publicCourseLegs`. `fitPublicCard` counts `course` in the byte budget and never drops it.
- `packages/shared/src/index.ts`: exports `publicCourseLegs`.
- `apps/api/src/db/migrations/0020_public_course.sql`: `universes.show_course` default 1, `public_cards.course` default `[]`. No Drizzle journal entry.
- `apps/api/src/db/schema.ts`: a comment only. The new columns stay off the Drizzle `universes` table.
- `apps/api/src/auth/public_schema.ts`: `courseReady`. A yes is kept; a no is asked again. Both columns must exist.
- `apps/api/src/universe/public_mark.ts`: stores `course` when 0020 is applied, or `[]` when the switch is off.
- `apps/api/src/routes/public_ships.ts`: the card includes `course`, or `[]` before 0020 and when the switch is off.
- `apps/api/src/routes/public_games.ts`: `showCourse` on the same PATCH. Before 0020 that field is 503 "The course switch is not available yet." and nothing else in the request is saved.
- `apps/api/src/routes/universes.ts`: owner list and one-universe reads add `showCourse` when 0020 is applied.
- `directives/contracts/b_public_games.md`: section "Course ahead (0020) — for Lane D".
- `tests/shared/public_games.test.js`: the split between finished legs and course, and the budget.
- `tests/api/public_course.test.js`: the four worker cases, with 0020 and without it, including a column add while the Worker is up.
- `tests/api/public_card.test.js`: the planned leg is now on `course`. `zzunfinished` is no longer treated as a leak.

## Gates
npm test:      pass (1776 pass, 0 fail, 36 skipped). The skipped rows are the worker suites, which need `RUN_API_TESTS=1`.
npm run check: pass
typecheck:     pass (`tsc --noEmit -p apps/api`)
fourth gate:   pass. `public_course` (2), `public_games` (1), `party_ships` (2), `public_card` (2), all with `RUN_API_TESTS=1`.

## Contract published
contracts/b_public_games.md

## Needs from others
- Lane D: draw `course` and add the checkbox from the new contract section. The PATCH is `{ public: true, showCourse }`. Refetch the card after it. The key is absent until 0020.
- Lane Z: `tools/examples/seed_games.mjs` still inserts `public_cards` without `course` and does not call `publicCourseLegs`. The new column's default keeps that insert valid, and the stored course is `[]`.

## Questions for Johnny
1. Example games already on production will show an empty course until something rewrites their cards (a campaign save that already refreshes the mark, or a public-games PATCH while the game is on). Recommended: leave them until the next seed, or one PATCH per example universe after 0020. The card read does not open those campaigns.
