# Report: z_install_reservation

## Prompt

`directives/prompts/z_install_reservation.md` (issued 2026-10-17): imports through the quota reservation (Lane B's need in `reports/done/b_quota_reservation.md`), and the catalogue's `family=` and `author=` queries.

## Status

Done. All gates pass. Two worker suites failed once in the batch and passed alone, as noted under Gates.

## Changed files

- `apps/api/src/routes/installs.ts`, the install POST:
  - The charge id `in_<ulid>` is made before the copy and reserves the preview's `bytes` with `reserveObjectBytes`.
  - A refusal from the quota is 400 `too_large`, "This universe is out of space.", the sentence a full universe already answers here.
  - The copy, the Durable Object `/install` call and `chargeObjectBytes` run inside `try`. The `finally` releases the reservation with `releaseObjectBytes`, after the charge or on any failure (a failed put, a 409 or 429, a thrown error).
  - The D1 `overQuota` check stays in front as the cheap first refusal. The preview is unchanged and reads D1 only.
- `packages/shared/src/schemas/package.ts`:
  - `PACKAGE_KIND_FAMILIES`: the store's table, word for word.
  - `PackageFamily`: an enum of the 8 families.
  - `PackageCatalogueQuery` gains `family` (a list of 1 to 8) and `author` (1 to 64 characters after trim).
- `packages/shared/src/index.ts`: one export line (`PACKAGE_KIND_FAMILIES`, `PackageFamily`). Board line 45 lets Z add export lines.
- `apps/api/src/routes/packages.ts`:
  - `family` and `author` are catalogue keys, so either alone selects the catalogue rather than the stub's list. `family` is read with `getAll`.
  - `familySql` gives each family one SQL test with the store's first-match rule: the kind contains one of the family's words and none of an earlier family's. `other` contains none.
  - `author` is `author_id IN (SELECT user_id FROM profile WHERE handle = ?)`.
  - All keys combine with AND, and `kind=` is unchanged.
- `directives/contracts/b_marketplace.md`:
  - F2 query table: `family` and `author` rows, plus an AND note for Lane D.
  - F8: the install's reserve and release.
- `tests/shared/package_family.test.js` (new):
  - the server table equals `KIND_FAMILIES` and `FAMILIES` in `apps/web/src/marketplace/covers.ts` (read only), so drift fails a test;
  - the query schema accepts and refuses as it should.
- `tests/api/install_reservation.test.js` (new), on port 18897 with its own state:
  - **Held:** a paused generate job reserves the room. An install that fits D1 is refused 400 with "This universe is out of space." and charges nothing.
  - **Released:** after the job's reservation expires, the same install is accepted. An image that fills the rest of the room exactly is then accepted, which shows the install released its own reservation.
  - **Alone:** an install one byte over is refused, and one that fits exactly is accepted.
  - **Catalogue:** `family=people` excludes "Contact map" (first match is map); `family=map`; `family=people&family=other`; `family=ship`; `author=` for each of two publishers; `author=` with `family=` (AND); an unknown handle gives an empty page; `kind=` with `family=`; `family=dragons` is 400.
- `directives/prompts/z_install_reservation.md`: Progress lines.

## Gates

- `npm test`: 1927 tests, 1888 pass, 0 fail, 39 skipped.
- `npm run check`: manifesto clean.
- `npm run typecheck`: clean.
- With `RUN_API_TESTS=1`, each suite on its own port and state:
  - install 1/1, install_links 1/1, install_records_only 1/1, packages 1/1, install_reservation 1/1;
  - install_delete: EPERM on temp-directory cleanup in the batch, then 1/1 alone. This is the known Windows cleanup flake.
  - quota_reservation (Lane B's): 401 on a universe create in the batch, then 2/2 alone.
- Servers: every suite started and stopped its own wrangler dev, and none of mine are left (nothing listens on 18897 or 19897).
  - Other lanes' servers were running and I left them: `findings/kn_runtime` (PIDs 47152, 58900, 65260), `findings/storefront/local` on 8941 (PIDs 59760, 59396, 56840), a dev on 55746 (PIDs 29380, 57616, 66584), and `r2 object get` on `vwide` (PIDs 59368, 33612, 57100, 43424).
- Nothing ran against production.

## Contract published

`directives/contracts/b_marketplace.md`: the F2 query rows `family` and `author`, and the F8 reservation sentence.

## Needs from others

- **Lane B:** `contracts/b_builder.md` still says of the install "This path does not reserve." That's now out of date. The line is B's to change, and I didn't edit it.
- **Lane D:** the store can switch to `family=` and `author=` (contract F2).
  - The server's table is a copy of `KIND_FAMILIES`. A change there must change `PACKAGE_KIND_FAMILIES` too; `tests/shared/package_family.test.js` fails until they match.
  - The browser could import the shared table instead.

## Questions for Johnny

1. Should `author=` match the publisher's current profile handle, or the handle stored on each package's latest manifest (the one the card shows)? Recommended: the current profile handle. It's one indexed lookup, and a renamed publisher's packages stay together. Manifest handles would need a read of each manifest.
2. Should the browser import `PACKAGE_KIND_FAMILIES` from `@voyage/shared` instead of keeping its own copy in `covers.ts`? Recommended: yes, as a small Lane D change later. Until then the shared test keeps the two in step.
