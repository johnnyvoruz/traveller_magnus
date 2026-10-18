# Lane Z — seed the six covers onto the packages already on production

Issued 2026-10-15 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/Z.md`,
`tools/examples/README.md`, your report `directives/reports/done/z_package_covers.md`, then
this file. No git but read-only, no deploy, no `rules/`. **Nothing runs against production:
Johnny runs the production commands from your report.**

## The problem (found by the orchestrator)

1.2.2 is live and 0019 is applied on production. Every catalogue card answers `cover: null`.

The covers are in the built state `findings/examples/local_covers`, but its six packages have
**different ids** from the six on production:

| Title | Production (`findings/examples/local`) | `local_covers` |
|---|---|---|
| Feri terraces | `pk_W5FTJF8B2M77XHXT7FTBT1XB08` | `pk_EWPHFMTRBR11S7BFFFKJPWS5Y1` |
| Hollow Verge | `pk_0ER3XMWG1PZD4AHJD89T2XM5GZ` | `pk_0279WVJSR9EVYRFW52TXZ8SKV2` |
| The Glass Hand | `pk_EVYJKYKRDDNYJMVJ8V2KWP8H14` | `pk_1JMEXKWRVHB3R1PWJ3EZJK7ANP` |

(and likewise for the other three). `seed_production.mjs` upserts by `id`. Seeding from
`local_covers` would therefore put six **duplicate** packages and their universes on production.

## Do

1. **Put the covers on the state production was seeded from.** Bring `findings/examples/local`
   up to 0019, then upload the six cover pairs to its six packages (the same ids as production)
   through the app's own route, as `build_local.mjs` does. Keep its packages, versions and
   manifests byte-identical apart from the cover columns. If that state cannot be brought up
   without a rebuild that changes ids, stop and report: do not rebuild it.
2. **A duplicate guard in `seed_production.mjs`.** Before writing anything, if the target holds an
   example-author package with the same title as a source package but a different id, refuse
   with one sentence naming both ids, and write nothing. Add a test in `tests/tools/examples.test.js`.
3. **Prove it on a stand-in that matches production:** a stand-in seeded from `local` *before*
   the covers (production's shape). The dry run then names 0 new packages, the six existing ids,
   and six covers. Apply, then check that each of the six ids carries `cover_hash`. Run the dry
   run from `local_covers` against the same stand-in and confirm the guard refuses it.
4. Gates: `npm test`, `npm run check`.

## Report

`directives/reports/z_cover_seed.md` from the template. **Write out Johnny's production commands
in full:** the dry run first (with what its output must say: 0 new packages, the six ids, six
covers), then the `--apply`, each with `cd D:/webstorm/traveller_magnus` and forward slashes.

Owned: `tools/examples/seed_production.mjs`, `tools/examples/build_local.mjs` (only if step 1
needs it), `tests/tools/examples.test.js`, `findings/examples/`, your report. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: local brought to 0019 (and B's 0020), six covers uploaded through the route; rows and manifests identical apart from cover columns; duplicate guard and column fit in seed_production with tests; stand-in from pre-cover local: dry run 0 new, 6 updated, 6 covers; apply sets cover_hash on all six; local_covers refused by the guard. next: gates and report.
done: report written (reports/z_cover_seed.md) with Johnny's two production commands. next: z_records_only.
