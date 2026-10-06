# Agent D — after the panes: the signed-in pass, and the fixes that were waiting

Issued 2026-10-06 by the orchestrator. Do this after `d_fixes_now.md` is reported.

## What changed under you

- **Agent A has rebuilt the panes** (follow-up 17), from the design you and A settled
  (`findings/panes_swap_design.md`): the path names the view, a `panel` query names the
  pane, `shell/PanelHost.vue` in `App.vue` is the only mount of the dossier and the campaign
  panel, the views publish a frame (`shell/frame.ts`), every pane change is
  `router.push(atPane(...))` and every query writer is `withQuery` (`shell/pane.ts`). The
  three `/campaign` paths redirect. **Read `shell/pane.ts`, `frame.ts` and `PanelHost.vue`
  before touching a view.** Any address you push from now on goes through those helpers.
- **Agent E has rebuilt the dossier pages** and given `orbit/BodyCard.vue` an optional
  `surveyElsewhere` prop. `dossier/`, `orbit/card.ts` and `BodyCard.vue` stay E's.

## 1. The signed-in pass Agent A could not run

A's browser session could not sign in, so nothing signed-in was seen. You can. On the real
chart (`VOYAGE_TRUTH_API`, as your brief says), signed in, on the map **and** in the orbit
view:

- the campaign list opens over the view and the view stays; a record opens and closes; the
  Party tab; "Records here" and a dossier row opening a record; the omnibox's campaign rows;
  the account menu's campaign entries; a vessel's "Open the orbit view";
- Back and Forward across each; a cold load of `?panel=campaign`, `&record=…`,
  `?panel=party` on a hex, a body and an orbit path; the three old `/campaign` links;
- **focus after each swap**, against the focus table in the design's section 2 (A saw the
  dossier and Rail cases signed out; nobody has seen list-search, party-tab, record-title or
  record-row);
- a pan and a scrub with a record open keep it open; Esc steps record → list → shut;
- the look: nothing shifted, the panel's width and the rail behave as before at column,
  half and full, and in a 520 px window.

**Fix what is broken inside your own files and A's panes files** (`shell/`, `App.vue`, the
views, the address lines in `workspace/`); list each fix. If the fault is in the design
itself, stop and say so.

## 2. The fixes that were waiting (`d_orbit_small_fixes.md` items 6, 7, 9, 10)

6. the vessel's own Where block follows the track;
7. the jump's parsecs and fuel line (`parsecsBetween` is in `map/geometry.ts`; the sector
   positions are `x`, `y` on `SectorOverview`);
9. `surveyElsewhere` passed to the body card, true exactly when the dossier is open on the
   same body (the address says so now: `addressPane`);
10. the design page's samples brought in line with E's pages.

The ghosts' wiring is **not** this step: Agent A is drawing them now, and your wiring
prompt follows its report.

## Check

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Screenshots
`fu17_*` (the campaign over the orbit view, a record over the orbit view, the old link
redirected) and `fu19b_*`. Notes into `findings/orbit_view_design.md` and
`findings/campaign_workspace_design.md`. Do not touch `dossier/`, `orbit/card.ts`,
`BodyCard.vue`, `OrbitRenderer.ts`, `orbit/ships.ts`, `orbit/distance.ts`, `surface/`,
`campaign/`. No git. Stop and report, in the brief's format.
