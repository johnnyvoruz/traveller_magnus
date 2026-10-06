# Agent B — engine corrections T1.7: the evidence for the v6 shadow build

Issued 2026-10-06 by the orchestrator. T1.6 is accepted and deployed (`6fc2d60`). Johnny has
said "go" to the shadow build and runs the admin command himself. **Start this only when
the orchestrator's paste says the build has finished** (every sector done, the version still
`building`).

Read `directives/plan_engine_corrections.md` sections 3.4, 7.3 and the last line of the
Tier 1 table (T1.7). This step is **read-only**: you have no admin session and need none.
Everything is fetched from the public CDN (`https://cdn.traveller.voyage/truth/v6/...`,
`https://cdn.traveller.voyage/objects/<hash>`). No production write of any kind, no deploy,
no git, no file under `truth/` or `universe/` changed.

## Gather

1. `truth/v6/reconciliation.json` (the provenance) and `truth/v6/reconciliation/report.json`
   (the total). Check the policy digest equals the digest of the policy in this tree
   (`environmentPolicy`), and say which climate table that is.
2. The per-sector reports, all 512: sum them and check the sum equals the total report.
   List any sector with no report or with an error.

## Check the invariants (section 7.3), read-only

3. **Spinward Marches, every tree** of v6, beside the same hex's tree in v5:
   - only the allowlisted fields differ (`surfaceTempBand`, `orbitalTempBand`, `liquidType`,
     `liquidStatus`, `reconciliation`); every other byte of the canonical tree is equal;
   - no resolved liquid outside its window at the mean temperature; no liquid label on a
     body with zero coverage; `surfaceTempBand` equals the classifier's answer for the
     body's `meanTempK`; unknowns counted, not passed;
   - a tree whose bytes did not change has the same object hash in both versions.
4. **The same checks on a stratified sample of other sectors:** the eight sectors of your
   earlier scan (`tools/truth/scan_environment.js`, `findings/environment_scan_v5.json`),
   so the numbers sit beside that scan's.
5. **v5 is untouched:** its manifest, its Spinward Marches index and the eight sectors'
   indexes are byte-for-byte what they were (the manifest's own hashes say so).
6. Every object a v6 index of those nine sectors points at exists.

## Write `findings/v6_shadow_evidence.md` for Johnny

Plain words and tables, no code. The whole chart: bodies seen, bodies changed; how many
worlds get a Climate word and how many are "not classified"; the Climate words by count;
how often the Climate differs from the old temperature band; liquids corrected by outcome;
**unresolved and blocking, with the count by kind and twenty named examples** (hex, world,
what was stored, why nothing fits); the mainworld digit mismatches Tier 2 still has to fix.
Then the nine sectors' invariant results, each pass or fail with the count. Then what a
release would change for a visitor, in five lines, and what is not yet ready for it (the
planet renderer still classifies by its own Kelvin rule in `apps/web/src/surface/profile.ts`).

## Report

One sentence, the headline numbers, any invariant that failed with its first example, the
file written. If a report or an object is missing, or the totals do not add up, stop and
say exactly which. Stop and report.
