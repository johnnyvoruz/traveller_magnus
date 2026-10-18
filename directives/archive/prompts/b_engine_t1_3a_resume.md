# Agent B — T1.3a, resumed: the ruling on the two hydrographics codes

Issued 2026-10-06 by the orchestrator. Stopping was right, and the finding is useful: on 337
Spinward Marches mainworlds `hydro` follows the chart's UWP and `hydroCode` follows the
generated `uwpSecondary`. That split is the plan's defects B01 and B03, and it is Tier 2's
to repair. Tier 1 does not pick a winner between them and changes neither.

## The ruling

For the question "does this body have a liquid to validate", **either code above 0 counts**.
The test of `b_engine_t1_3a.md` step 1 becomes: the body carries a liquid label; or
`hydroPercent` is present (a number, or anything else stored there, such as the object
`{"$num":"NaN"}`); or `hydro` is above 0; or `hydroCode` is above 0. Read each code as the
engine stores it; a value that is not a finite number is not above 0.

As you found, this changes no Marches body's answer (every split already has a percentage
and a label). It is written down so the rule is whole.

## Then finish `b_engine_t1_3a.md` as written

Steps 2 to 4, the tests, and the Marches counts in the same two tables as your T1.3 report.
Add one line to the report: how many bodies have `hydro` and `hydroCode` both present and
different, by body type (337 mainworlds in the Marches, by your count), so it stands beside
the audit's B01 and B03 rows.

The eleven mainworlds and the two gas giants are as you listed them; nothing more is needed
on those. The two gas giants keep their blocking diagnostic: a label and a percentage that
is not a number is exactly what the diagnostic is for.

`npm test` and `npm run check` green, pasted. Do not touch `rules/`, `js/`, `apps/` or any
copied engine. T1.4 is not this step. Stop and report.
