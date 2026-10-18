# Agent B — engine corrections T1.3a: which bodies need a liquid validated

Issued 2026-10-06 by the orchestrator. T1.3 is accepted as built, with one correction. (The
one failing test you saw was Agent C's renderer test in mid-edit; the tree is green now.)

## What is wrong

Your count has 1,276 bodies as `hydro-invalid`, each with a **blocking** diagnostic and a
`liquidStatus` of unknown. The orchestrator ran `reconcileTree` over the same 439 Spinward
Marches trees and looked at them:

| Bodies | Kind | `hydroPercent` | Liquid label | Hydro code |
|---|---|---|---|---|
| 701 | Gas Giant | absent | none | none |
| 444 | Planetoid Belt | absent | none | 0 |
| 118 | Empty | absent | none | none |
| 11 | Mainworld | absent | none | 0 |
| 2 | Gas Giant | NaN | **set** | 0 |

Plan section 3.3 says a blocking diagnostic is for "a body whose liquid needs validation".
A gas giant, a belt or an empty orbit that never had a percentage or a liquid has nothing to
validate. Marking 1,263 of them unknown and blocking would make every one read as a fault to
T1.5's consumers and to the release count.

## The correction

1. **A body needs its liquid validated** when any of these is true: it carries a liquid label
   (`liquidType` not null or absent); or `hydroPercent` is present, valid or not; or its
   hydrographics code is above 0. Read the code the way the engine's own fields give it; if
   two fields disagree about the code, stop and say which.
2. A body that does **not** need validation gets no liquid write at all: no `liquidStatus`,
   no diagnostic, no change entry. It stays byte-identical in that respect. Its climate
   bands from T1.2 are written as before.
3. A body that does need validation and has a missing or invalid percentage is what it is
   today: unknown, blocking, the label kept.
4. The eleven mainworlds (percentage absent, code 0, no label) fall under rule 2 by this
   test. **List them** (hex, name, UWP) in your report, with the two gas giants that carry
   a label and a NaN percentage, so Johnny can see them. Change nothing about them.

Tests: one body of each of the five rows above; idempotence; the allowlist. Then the Marches
counts again, in the same two tables as your T1.3 report, so the two can be laid side by side.

`npm test` and `npm run check` green, pasted. Do not touch `rules/`, `js/`, `apps/` or any
copied engine. T1.4 is not this step. Stop and report.
