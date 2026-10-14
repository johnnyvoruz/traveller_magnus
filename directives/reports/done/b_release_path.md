# Lane B release path report

the ten stay out

Found: the prompt's Progress was empty, and no cap patch or release note existed yet. `tests/api/truth_build.test.js` was already modified.
Finished: the pushed-shape copy, the cap-only patch, the local v9 release, and the audit check scoped to this call.
Backed out: nothing.

Prompt: prompts/b_release_path.md
Status: done

## Changed files
- findings/push/admin_cap_only.patch: HEAD `admin.ts` plus the `ONE_SECTOR_LIMIT` import and the two refusals
- findings/release_path.md: local v9 build, upload, release, and the matching hashes
- tests/api/truth_build.test.js: the `truth.remove` count is limited to rows written by this call

## Gates
npm test: fail in the copy. 1642 tests, 1611 pass, 2 fail, 29 skipped after the empty `apps/web/dist` stub was removed (that stub had made `bundle_size` fail; the test skips when dist is absent).
- `tests/golden/esm.test.js` `profile_regina`: Lane C's surface work. Not changed.
- `tests/generation/liquid_temperature_census.test.js`: `ENOENT` for `universe/raw/Core.tsv`. That TSV is gitignored, so the archive does not contain it.
npm run check: pass (`manifesto: clean`)
typecheck: pass (`tsc --noEmit -p apps/api` in the copy)
fourth gate:
- `one_sector.test.js` on the working tree: pass (3)
- `health.test.js` on the working tree, port 18874: pass
- `truth_build.test.js` on the working tree, port 18872: fail at line 1523, after the audit check. `POST /api/admin/truth/build` with `sectors: 'all'` for 14 slugs returns 400 `The limit is one sector per request.` The parked test expects 202. The route is the cap. That assertion was not changed. The file stays out of the push.

## Contract published
none

## Needs from others
- Lane C: `profile_regina` is red from the surface work in flight. `surface_enhanced_map` line 339 did not fail in this copy run.
- The census test needs `universe/raw/Core.tsv`, which is not in git.

## Questions for Johnny
1. Push `apps/api/src/routes/admin.ts` by `findings/push/admin_cap_only.patch`, and leave the ten parked files out of the push. Suggested answer: yes. A one-sector v9 build uploaded and released on that shape, and the released overview and sector index match the local build.
