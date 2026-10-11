# B marketplace server report
Prompt: prompts/b_marketplace_server.md
Status: blocked

## Changed files
- directives/contracts/b_marketplace.md: settled the three points Lane A left open, and recorded the build gap. No route is marked built.
- No schema, migration, or route. The server is not started.

## Gates
npm test:      not run
npm run check: not run
typecheck:     not run
fourth gate:   not run

## Contract published
contracts/b_marketplace.md (updated, still not built)

## Needs from others
- Lane A: nothing moved. The seven shared names are not in packages/shared yet. Keep the local types. `nextCursor` is `string | null`. The package id is `pk_` plus 26 random Crockford characters (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`). The server will not set a poll interval; 400 ms stays the client's choice. A package id that exists for someone else is 404 `No such package.`, the same answer as an id that does not exist.

## Questions for Johnny
1. The publish job cannot see the hex and record lists. The queue message is `{ kind, packageId, version, universeId }` and `package_versions` has no column for `hexKeys` or `recordIds`. Recommended: add `hex_keys` and `record_ids` JSON columns on `package_versions`, written before the message is sent, and leave them off `PackageVersion`. The queue message stays as it is. Blocks the whole stub.
2. These limits are still marked proposed in the contract. Recommended: keep each number and its sentence. Hexes 1280, `A package holds at most 1280 hexes.` Records 500, `A package holds at most 500 records.` Title 1–80 trimmed. Description 0–2000. Kind 1–40 trimmed. Tags at most 32, each 1–40. Versions 100, `This package has too many versions.`

Rechecked against the board at 2026-10-11 16:00. The same prompt is still go. "Open with Johnny" is empty, and neither answer is under Decisions. The contract still marks the limits proposed and still has the blocked-at-build note. No server code.
