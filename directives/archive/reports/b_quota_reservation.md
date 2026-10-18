Found: Progress was only the heading, and no reservation code was in the tree. The parked truth-build diffs were left untouched.
Finished: the universe Durable Object now reserves object bytes before a put and releases them on a failed put or after the D1 add.
Backed out: nothing.

# Lane B quota reservation report
Prompt: prompts/b_quota_reservation.md
Status: done

## Changed files
- apps/api/src/universe/quota.ts: the reservation table, the check, and the calls a writer makes.
- apps/api/src/universe/schema.ts: creates `object_reservations` when the Durable Object wakes. No D1 migration.
- apps/api/src/universe/UniverseDO.ts: `POST /quota/reserve` and `POST /quota/release`. A refusal is 400, not a wait.
- apps/api/src/env.ts: optional `QUOTA_RESERVATION_MS` for a test. Unset means 15 minutes.
- apps/api/src/jobs/generate_queue.ts: a slice reserves its new bytes, a failed put releases them, and `finishCounts` releases after the D1 add.
- apps/api/src/routes/objects.ts: an image upload reserves and releases in the same request.
- apps/api/src/routes/builder.ts: one-hex generate, Keep, and one-hex generate-with-sectors do the same.
- directives/contracts/b_builder.md: the open race is replaced with this rule.
- tests/api/quota_reservation.test.js: the new suite.

## Gates
npm test: fail. 1854 pass, 2 fail, 38 skipped. Both failures are `tests/web/km_video_look.test.js` (Lane M): `ui-kicker-row` is not in `base.css`, and the token check for `--bg-1` does not match. Nothing in this prompt touches those files.
npm run check: pass
typecheck: pass
worker, own port and state: pass for `objects`, `builder` (one hex and a job), `builder_sector_generate`, `generate_speed`, `install`, and `quota_reservation`. `universes` fails on an existing pin: the catalogue test expects `engineVersion` `1.1.0` and `packages/engines` is `1.2.0`. I did not change that test or the engines package.

The new suite:
- Two image uploads that each fit, and together pass 250 MB: one is 201, one is 400 `250 MB of objects per universe.`, and `object_bytes` stays at or under 250 MB.
- A failed put releases. Covered on the reservation table with `node:sqlite`, the same functions the Durable Object runs. A release leaves the bytes free for the next reserve.
- An expired reservation stops counting. The table test deletes it at the expiry. On the worker, a generate job pauses before `finishCounts` with `QUOTA_RESERVATION_MS` at 4 seconds. An upload is refused while the reservation counts, and the same size is accepted after it expires.
- One writer alone: one hex under the cap stores the tree and adds its bytes. One hex at the cap is 400 with the same sentence, and `object_bytes` is unchanged.

The worker expiry case ends over the cap by the 64-byte probe. The reservation had expired, the probe was stored, and `finishCounts` then added the slice. That is the tradeoff of letting a dead job go: a job that is still going to charge can be overtaken. Releasing before the D1 add would open the original race, so the charge still happens.

## Contract published
directives/contracts/b_builder.md

The reservation lives 15 minutes. One sector finishes in seconds, so that covers a slow retry, and a dead job stops counting. A later slice on the same job id refreshes the expiry. There is no D1 migration: the Durable Object creates the table on wake. Old code ignores it. New code creates it. Either order is safe.

## Needs from others
- Lane Z: `routes/installs.ts` still reads only D1 `object_bytes`, copies objects, then calls `chargeObjectBytes`. An install can pass 250 MB while a reservation is held. Before the puts, call `POST /quota/reserve` on the universe stub with `{ id, bytes, universeId }`, using the install's charge id. Release that id after `chargeObjectBytes`, and release it if a put fails. I did not edit `installs.ts` or `packages.ts`.
- Lane M: `tests/web/km_video_look.test.js` fails as listed under Gates.

## Questions for Johnny
none
