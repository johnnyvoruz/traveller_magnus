# Lane Z cover-seed report
Prompt: prompts/z_cover_seed.md
Status: done

## Changed files
- `findings/examples/local`: the state production was seeded from.
  - I brought it up to the current migrations with `wrangler d1 migrations apply --local`. That applied 0019 and also Lane B's 0020, which adds `universes.show_course` and `public_cards.course`.
  - I then uploaded the six cover pairs to its six packages through `PUT /api/packages/:id/cover` (`findings/examples/covers_onto_local.mjs`). The ids are the same as on production.
  - A snapshot of every package and version row (cover columns left out) and every manifest hash is byte-identical before and after (`local_snap_before.json` and `local_snap_after.json`, both sha `b7efb2f6…`).
  - A copy from before the change is at `findings/examples/local_backup_pre_covers`.
- `tools/examples/seed_production.mjs`:
  - **Duplicate guard** (`duplicateRefusal`): before anything is written, a target package by the example author with a source package's title but another id makes the script refuse with one sentence naming both ids. Nothing is written.
  - **A "new packages N, updated M" line** in the dry run.
  - **Column fit** (`fitColumns`): the apply writes only the columns the target has. A source with 0020 therefore still seeds a production that may not have 0020 yet.
- `tests/tools/examples.test.js`: two new tests, the guard and the column fit.
- `findings/examples/`: new files.
  - The stand-in `standin_prod`.
  - Scripts: `covers_onto_local.mjs`, `snap_local.mjs`, `check_prod_standin.mjs`.
  - Logs: `cover_seed_dry.txt`, `cover_seed_apply.txt`, `cover_seed_check.txt`, `cover_seed_guard.txt`.

## Gates
npm test:      pass (1813 tests, 1777 pass, 0 fail, 36 skipped)
npm run check: pass
typecheck:     not required by this prompt
fourth gate:   `tests/tools/examples.test.js` 11 of 11. The stand-in proof:
1. **Stand-in matching production:** `findings/examples/standin_prod` was made with `build_local.mjs --bare` (0019 applied), then seeded from `local` *before* the covers. It has the six production ids and no covers.
2. **Dry run from the covered `local`:** each of the six ids is an `update`, the summary reads `new packages 0, updated 6`, there are six `cover` lines, and the last line reads `covers 6`.
3. **Apply:** all six ids carry `cover_hash`, and both objects are present with matching hashes:

| Package id | Title | Cover |
|---|---|---|
| `pk_0ER3XMWG1PZD4AHJD89T2XM5GZ` | Hollow Verge | `f443c6d143e2…` |
| `pk_DTT2SSMM1Y6EHWW0GXBQ1H8W9W` | Free traders of the Marches | `5de45bdce543…` |
| `pk_EVYJKYKRDDNYJMVJ8V2KWP8H14` | The Glass Hand | `093563dc783e…` |
| `pk_HP3HB90KFC95QD6FTM408WMNHS` | Regina highport contacts | `5529879db3b9…` |
| `pk_KQ4ACZ3HTJ927X2T8BNMD1PBZF` | Jewell patrons | `d6f076b1bf55…` |
| `pk_W5FTJF8B2M77XHXT7FTBT1XB08` | Feri terraces | `148a25df598d…` |

4. **Guard:** a dry run from `local_covers` against the same stand-in refuses with exit 1, and nothing is written. The message is: The target already has "Hollow Verge" as pk_0ER3XMWG1PZD4AHJD89T2XM5GZ, and this source has it as pk_0279WVJSR9EVYRFW52TXZ8SKV2; seed from the state the target came from. Nothing written.

Servers: the cover upload API on `local` was PID 33660 (port 8831); the script started and stopped it. No other server was left running.

## Johnny's production commands
Run them in this order, from PowerShell.

**1. Dry run.** It writes nothing.
```
cd D:/webstorm/traveller_magnus
node tools/examples/seed_production.mjs --from findings/examples/local --production
```
The output must show:
- `House account found: traveller_voyage (e2b2245a-5260-4b91-8f33-1e02997fd9d5).`
- six `update` lines, for `pk_0ER3XMWG1PZD4AHJD89T2XM5GZ`, `pk_DTT2SSMM1Y6EHWW0GXBQ1H8W9W`, `pk_EVYJKYKRDDNYJMVJ8V2KWP8H14`, `pk_HP3HB90KFC95QD6FTM408WMNHS`, `pk_KQ4ACZ3HTJ927X2T8BNMD1PBZF` and `pk_W5FTJF8B2M77XHXT7FTBT1XB08`, with no `insert`;
- `new packages 0, updated 6`;
- six `cover` lines, then `universes 6, manifests 6, objects 33, covers 6`.

Stop if it shows any `insert`, the duplicate-guard sentence, or the "no 0019" sentence.

**2. Apply.**
```
cd D:/webstorm/traveller_magnus
node tools/examples/seed_production.mjs --from findings/examples/local --production --apply
```
The output must end with `Applied: 6 packages on the target.` Install counts are kept, and every catalogue card should then show `cover.source: 'upload'`.

## Contract published
none (F17 is unchanged)

## Needs from others
- none

## Questions for Johnny
1. The apply also rewrites the six universe and version rows with the values they already have, plus any column the target has. Is that acceptable? Suggested: yes. Only the cover columns differ from what production holds now.
2. Should `findings/examples/local_backup_pre_covers` be deleted after the production apply? Suggested: yes, once production shows the covers.
