# B generate cap report
Prompt: prompts/b_generate_cap.md
Status: done

found: the daily cap was not built. `fieldLabel` took the text after the first dot, so `star.0.temp` was labelled `0.temp`. A bare star's profile roll kept the cells and, when the engine wrote a full profile, the message was `Rolled this profile.` with no `Set Type, Subtype, and Class.`
finished: the allowance table, the charge on preview and generate, both hand-form fixes, and the worker gate.
backed out: nothing.

## Changed files
- `apps/api/src/db/migrations/0011_generation_allowance.sql`: `generation_allowance` (`user_id`, `daily_limit` default 100, `day`, `used`).
- `apps/api/src/auth/allowance.ts` and `allowance_clock.ts`: one `UPDATE` reserves the exact write count. Admins are not counted. A failed request before accept releases the count. Undo does not.
- `apps/api/src/routes/builder.ts`, `generate.ts`, `auth.ts`: charge before queue or write. `GET /api/me` and every generate answer include `allowance`.
- `apps/api/src/universe/hexes.ts`: `GET /hexes/hold-rows` so density can be rolled before the write. `forward.ts` keeps the signed-in actor on the owned universe.
- `packages/shared` `GenerationAllowance`: optional on `BuilderGenerateDone`, `BuilderJobAccepted`, and `SectorGenerateDone`.
- `packages/generation/src/hand.ts`: a numbered owner is labelled by its leaf. A bare star's roll message includes `Set Type, Subtype, and Class.` Cells already written stay.
- `tests/api/builder_allowance.test.js`, `tests/api/allowance_clock.test.js`, `tests/generation/hand_field_label.test.js`. The density worker test inserts a limit of 10000 so its four subsectors still run.
- `directives/contracts/b_builder.md`: section "Daily generation allowance", and the roll-profile paragraph.

## Gates
npm test:      pass (1474 pass, 0 fail, 19 skipped)
npm run check: pass
typecheck:     pass
fourth gate:   pass. `RUN_API_TESTS=1` `tests/api/builder_allowance.test.js` on 18843/19843. The server is stopped. A non-admin stops at the stored limit. The next request is 429 `generation_allowance` with remaining, limit, resetsAt, and the sentence, and the hex is not written. A request for 3 when 2 remain is refused whole. Two requests at once cannot both pass a limit of 1. Undo leaves `used` where it was. An admin (`user.role` `admin`, the same check as `requireRole`) generates past a stored limit of 1, and `GET /api/me` has `limit` and `remaining` null. A row updated from 1 to 3 is honoured after the worker restarts. A stored day of `1999-01-01` with `used` already at the limit counts the next generate as 1. A sparse pair reserves 1. A second generate of the same hex does not count. A blank hand system does not count. Preview counts 1.

## Contract published
contracts/b_builder.md

## Needs from others
- Lane A and Lane D: the code is `generation_allowance`.
- The fields are `limit`, `used`, `remaining`, and `resetsAt`.
- `limit` and `remaining` are null for an admin. Hide the line.
- Read `data.allowance` on `GET /api/me` and on every generate answer (`data.allowance`).
- The 429 message is the sentence. The schema field is optional, so an older answer still parses.

## Questions for Johnny
none

## What stopped the job at 68 of 80

That stall was the product. In `directives/reports/done/b_generate_density.md`, posts of 4 hexes were one `UniverseDO` mutation each, and the 120-per-minute budget returned `Too many requests.` on the fifth subsector, so the job stayed at 68 of 80. A person can still hit that budget by generating many sectors quickly. The slice is 32 now, so an 80-hex subsector is 3 posts and that run does not reproduce the stall. The separate stop at 32 of 80 was the local broker dropping a job's later message.
