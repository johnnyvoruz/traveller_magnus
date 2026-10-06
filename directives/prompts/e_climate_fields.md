# Agent E — the dossier and the orbit card read the corrected climate (engine corrections T1.5)

Issued 2026-10-06 by the orchestrator. The system page, the world page and the card's two
groups are **accepted as built** and are being pushed. Your two notes are taken: the design
page's samples and the `surveyElsewhere` prop are Agent D's to do.

The same rules as your first prompt (`e_dossier_identities.md` sections 1 to 3): the same
closed file list (`apps/web/src/dossier/` but for `DayNight.vue`; `orbit/card.ts`;
`orbit/BodyCard.vue`; `tests/web/dossier_model.test.js` and new tests of your own), no git,
nothing else edited, no Traveller meaning from memory.

## Why

Agent B has built a reconciliation pass (`packages/engines/src/reconcile_environment.js`)
that a coming truth version will run over every world. It adds fields to a body and never
removes the old ones:

- `surfaceTempBand`: `{ status: 'known', band }` or `{ status: 'unknown' }`. The climate
  word for the world's **actual mean temperature**, from a table Johnny approved.
- `orbitalTempBand`: `{ status: 'known', band, provenance }` or `{ status: 'unknown',
  missing }`. The band the world's **orbit** puts it in. This is what the old `tempBand`
  field really held (and sometimes did not: it could be overwritten).
- `liquidStatus`, with a corrected `liquidType`: read the module for its statuses
  (`none`, `unknown`, `unresolved`, and the resolved ones with their phase notes).

Today's released worlds do not carry these fields yet. The screens must be right in both
cases: with the fields, and without them.

## Read

`packages/engines/src/reconcile_environment.js` (what is written, and every status);
`directives/plan_engine_corrections.md` section 3.4, last paragraph but one ("The UI displays
surfaceTempBand as Climate…"); your own `dossier/model.ts` and `orbit/card.ts`.

## Build

1. **Climate.** Where a body has `surfaceTempBand` known, the world page shows a row
   "Climate" with that word, and the orbit card's "Climate" line shows the same. Known or
   not, the temperatures stay as they are.
2. **Orbital zone.** Where a body has `orbitalTempBand` known, the world page shows a row
   "Orbital zone" with that word. The old row "Temperature band" is not shown for such a
   body: its two meanings are now these two rows.
3. **Unknown is said, never guessed.** A body that has the new fields with status unknown
   shows "Climate: not classified" (and the same for the zone), and never falls back to the
   old `tempBand`. No word is derived from a temperature on the screen's side; there is no
   Kelvin table in `apps/web`.
4. **A body without the new fields** (every world today) is shown exactly as now: the old
   "Temperature band" row, the card's present line.
5. **Liquids.** Find every place your files show a body's liquid. With `liquidStatus`
   present: `none` shows no liquid; `unresolved` and `unknown` say so in plain words and are
   never shown as a dry world or as the old label; a resolved liquid shows its name and its
   phase note if it has one. Without `liquidStatus`: as now. If your files show no liquid
   at all today, say so and add nothing.
6. One pure function per decision, in `dossier/model.ts` or a new file beside it, used by
   both the page and the card: not two copies.

## Tests

A test may import the engines; the app may not. In `tests/web/`: run `reconcileTree` over
the fixture trees your dossier tests already use, and assert the rows and the card lines
for: a body with both bands known; each unknown; a body with no new fields (unchanged from
today, byte for byte in the model); each liquid status the module can produce. And one test
that the web app's source contains no climate threshold: the words come only from the body.

## Check

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. In the browser
the released chart has no reconciled world yet, so show the screens from a fixture: say how
you rendered them (a dev-only route is not yours to add; a test rendering or the design
page's sample data is Agent D's; if you cannot show it without a file that is not yours,
say so and rely on the model tests). Screenshots `fu23_*` if you can make them. Stop and
report, in the same format as before.
