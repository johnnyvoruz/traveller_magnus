# Agent E — what the corrections say about a world's seas; and the ribbon at half width

Issued 2026-10-06 by the orchestrator. The card gap is **accepted and pushed** (18 px,
closed and open, at every width). The same rules and the same closed file list as before
(`apps/web/src/dossier/` except that `DayNight.vue` is yours again only when a prompt says
so; `orbit/card.ts`; `orbit/BodyCard.vue`; your tests). No git.

## 1. A row for the surface liquid

A corrected truth version (v6) is being built. In it every world with seas carries a
corrected `liquidType` and a `liquidStatus` (`packages/engines/src/reconcile_environment.js`:
read every status and the phase notes it writes). In your T1.5 step you found that the
dossier shows no liquid at all. For v6 it should, because it is the one thing the
corrections change that a referee would look for.

- On the world page, in the section where it reads best (say why), **one row for the
  surface liquid, shown only when the body carries `liquidStatus`**:
  - a resolved liquid: its name, and its phase note in plain words when it has one (frozen
    at the low, boils at the high; use the module's own fields, no chemistry of yours);
  - `none`: "None";
  - `unresolved`: "Unresolved", with a short plain sentence that no listed liquid fits this
    world's temperature (never shown as a dry world, never the old label);
  - `unknown`: "Not classified".
- A body with no `liquidStatus` (every world today) shows no such row: the page is byte for
  byte what it is now.
- One pure function, tested with `reconcileTree` over your fixtures for each status the
  module can produce. The orbit card does not gain a line.
- No number and no substance table in `apps/web`: the words come from the body.

## 2. The UWP ribbon at half width

You noted that the half-width ribbon crowds its captions (PORT, SIZE, ATM…), on the live
site too. Fix it in `dossier/UwpRibbon.vue`: the eight cells and their captions read
cleanly at column, half and full and in a 520 px window, on the system page (where the
ribbon is a link) and on a world page; nothing shifts when the tree arrives; tokens only.
Say what gave (cell width, caption size, the gap) and measure the narrowest cell.

## Check

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted (name any failure
that is another agent's). The liquid row cannot be seen on the released chart yet: show it
from the model tests, and from a screen only if you can without a file that is not yours.
The ribbon: screenshots `fu29_ribbon_*` at each width, beside the live site's. Stop and
report, in the same format.
