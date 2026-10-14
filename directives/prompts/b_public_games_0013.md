# Lane B — make migration 0013 safe to ship; `publicGames` on the universe list; two speed leftovers

Issued 2026-10-12 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/B.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Version 1.1.11 (`ef92359`) is pushed and deployed: passkey sign-in with
migration 0012 applied, the body-less sign-out accepted, and the public games server
**without** `0013_public_games.sql` and `tests/api/public_games.test.js`, which the
orchestrator held out. Production today answers the feed with `{ hexes: [] }`.

## 1. Why 0013 was held, and what releases it

With 0013 applied, `ownedUniverse` (`apps/api/src/universe/forward.ts`) stops using
the Drizzle select and maps a hand-written row. Every Builder, campaign, object and
generate route goes through it. Your report ran the public games, passkey and health
suites, not the Builder ones.

- **Run every worker suite with 0013 applied**: builder, allowance, close, density,
  dots, form, sector, sector generate, generate speed, campaign entry images,
  campaign, objects, packages, characters, and any other file under `tests/api/`
  that starts a Worker. **One file at a time, each on its own ports, each server
  stopped before the next** (your sessions have frozen at this step four times: do
  not run them in one command, and append a Progress line after each file). Paste
  one line per file: pass or fail, seconds.
- Say why the hand-written row was needed (Drizzle's schema would select a column
  that is missing before 0013) and whether a smaller change does the same: for one,
  keep the Drizzle select as it is and read `public_games` with one extra statement
  only on the two routes that need it (the switch, and the recompute after a
  campaign save). If the smaller change is sound, make it, so a new `universes`
  column can never be forgotten in a hand-written list. A test that fails if the
  two row shapes drift, if the hand-written row stays.
- Then say plainly in the report: "0013 is safe to push", or what is not.

## 2. `publicGames` on the owner's universe list (Johnny, 2026-10-12: yes)

`GET /api/universes` and the single-universe read carry `publicGames: boolean` for
the owner, only when 0013 is present; without it the field is omitted and the answer
is today's. Shared schema optional field; contract updated; a test both ways.

## 3. Two leftovers from your speed report (small; skip either if it is not small)

- Two jobs on one universe can race the 250 MB object quota. You proposed a lock
  taken by the slice read in the Durable Object. Build it if it is a few lines and
  cannot stall a job; otherwise write the design and stop.
- A crash between the D1 byte add and the settled mark double-counts bytes on retry.
  Close the window (the mark first, or an idempotent add keyed by job) with a test.

## Owned files (this pass)

`apps/api/`, `packages/shared/`, tests in `tests/api/` and `tests/shared/`,
`directives/contracts/b_public_games.md`, `b_builder.md`,
`directives/reports/b_public_games_0013.md`. Not yours: `apps/web/src/`.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
the per-file table in part 1.

## Stop rule

Stop when the table is complete and the report is written. If you must stop early,
the report says which files ran.

Write `directives/reports/b_public_games_0013.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: no half-finished edit in Lane B's files. 0013 and public_games.test.js were already untracked. The dirty jobs and truth-build files belong to another lane and were left. next: drop the hand-written universe row and read public_games only where it is used.
done: ownedUniverse is the Drizzle select again. public_games is read on the switch, the campaign recompute, the owner list, and the single read. The byte charge is one D1 batch keyed by job. The quota lock is not built. next: run each worker suite on its own ports with 0013 applied.
done: health.test.js pass 3.3s, 0013 and 0014 applied. next: universes.test.js.

done: universes.test.js fail exit 1 4.9s with 0013 applied. next: objects.test.js.
done: objects.test.js pass 17s with 0013 applied. next: characters.test.js.
done: characters.test.js pass 16.4s with 0013 applied. next: campaign_export.test.js.
done: campaign_export.test.js pass 5.2s with 0013 applied. next: parity.test.js.
done: parity.test.js pass 5.4s with 0013 applied. next: campaign.test.js.
done: campaign.test.js pass 21.2s with 0013 applied. next: builder.test.js.
done: builder.test.js pass 11s with 0013 applied. next: builder_form.test.js.
done: builder_form.test.js pass 10.7s with 0013 applied. next: builder_close.test.js.
done: builder_close.test.js pass 12.1s with 0013 applied. next: builder_sector.test.js.
done: builder_sector.test.js pass 21.5s with 0013 applied. next: builder_sector_generate.test.js.
done: builder_sector_generate.test.js pass 18.5s with 0013 applied. next: builder_dots.test.js.
done: builder_dots.test.js pass 17s with 0013 applied. next: builder_allowance.test.js.
done: builder_allowance.test.js pass 22.7s with 0013 applied. next: campaign_entry_images.test.js.
done: campaign_entry_images.test.js pass 12.5s with 0013 applied. next: generate_speed.test.js.
done: generate_speed.test.js pass 16.2s with 0013 applied. next: packages.test.js.
done: packages.test.js pass 31s with 0013 applied. next: passkeys.test.js.
done: passkeys.test.js pass 29.6s with 0013 applied. next: passkey_schema.test.js.
done: passkey_schema.test.js fail exit 1 16.3s with 0013 applied. next: public_games.test.js.
done: public_games.test.js pass 42.6s with 0013 applied. next: builder_density.test.js.
done: builder_density.test.js pass 16.3s with 0013 applied. next: truth_build.test.js.
done: truth_build.test.js fail exit 1 156.6s with 0013 applied. The failure is an audit-row count in another lane's uncommitted truth-remove test. next: re-run universes and passkey schema, then the gates.
done: universes.test.js pass 16.7s after the expected engine version was set to 1.1.0. passkey_schema.test.js pass 12.7s on the retry. The first passkey run died deleting its state directory. next: npm test, check, typecheck, build.
done: npm test pass (1562, 24 skipped), check clean, typecheck pass, build pass. Report written. next: stop.
