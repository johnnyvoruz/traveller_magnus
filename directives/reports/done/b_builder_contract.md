# B builder contract report
Prompt: prompts/b_builder_contract.md
Status: done

## Changed files
- directives/contracts/b_builder.md: the Builder routes as they stand, the draft cycle, and the proposed sector-and-generate route (not built)
- directives/prompts/b_builder_contract.md: Progress lines only
- directives/reports/b_builder_contract.md: this report

No code, tests, or findings notes were edited.

## Gates
npm test:      pass (1310 tests, 1296 pass, 0 fail, 14 skipped; API files skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass (tsc --noEmit -p apps/api)
fourth gate:   pass. All 22 `route.get` / `route.post` lines in apps/api/src/routes/builder.ts have a heading in contracts/b_builder.md:

```
GET    /:id/hexes
GET    /:id/hexes/:sector/:local
POST   /:id/hexes/:sector/:local/remove
POST   /:id/hexes/:sector/:local/restore
POST   /:id/hexes/:sector/:local/revert
GET    /:id/jobs/:jobId
POST   /:id/jobs/:jobId/stop
POST   /:id/jobs/:jobId/undo
GET    /:id/hexes/:sector/:local/form
POST   /:id/hexes/:sector/:local/draft
POST   /:id/hexes/:sector/:local/keep
GET    /:id/sectors
POST   /:id/sectors
POST   /:id/sectors/:sectorId/rename
POST   /:id/sectors/:sectorId/move
POST   /:id/sectors/:sectorId/delete
POST   /:id/sectors/:sectorId/undo
POST   /:id/sectors/:sectorId/subsectors/:letter/clear
POST   /:id/sectors/:sectorId/subsectors/:letter
POST   /:id/hexes/:sector/:local/blank
POST   /:id/hexes/:sector/:local/design
POST   /:id/generate
```

npm run build: pass (vue-tsc -b && vite build, 488 modules).

## Contract published
contracts/b_builder.md

## Needs from others
- Lane D: read contracts/b_builder.md, section "Make a sector and generate, as one Undo". The server cannot make a sector and generate its hexes as one call, and the two calls do not share one undo token. Do not fake that Undo. The screen can call POST .../sectors and then POST .../generate. The proposed POST .../sectors/generate and POST .../sectors/:sectorId/undo-generate are not built. A box that makes several sectors is one of those calls per sector once it exists.
- Lane A: handWalk still sets orbitType P-Type, parentStarIdx, and pairStarIdx. apps/web/src/orbit/hand_present.ts does not copy those three. Noted in the older findings note; the contract does not assign that file to B.

## Notes where a findings file disagrees with the code
- findings/builder_step3_close_ready.md section 1 says removing either star of a pair is refused. The code cascades: star.remove takes the paired star and every world and moon that orbits them. Section 5 of that same note matches the code. The sentence "A body orbits these two stars together. Give it to one star first." remains for a pair that names a star which is not in the system. Unpairing is still "These two stars are not paired."
- findings/builder_form_ready.md says the blank body is edition plus baseRev. FormBlank on disk requires only baseRev. edition and the star fields may be sent and are ignored.

## Questions for Johnny
none
