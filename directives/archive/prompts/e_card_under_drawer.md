# Agent E — the orbit view's info card sits under the drawer

Issued 2026-10-06 by the orchestrator. Do this after `e_daynight_locked.md` is reported.
The same rules and the same closed file list as your earlier prompts; this one is in
`apps/web/src/orbit/BodyCard.vue`, which is yours.

## What Johnny asked

*"have the info card in the orbit view stick to whatever the shortest values is to the
drawer, if there's no drawer it should fill the space, and if the drawer is larger, it
should push the card down."*

The pinned body card is placed at a fixed `top: 18px` on the picture. The header's drawers
(Time, View, Layers) open over the top of the picture, at different heights, so an open
drawer covers the card or the card sits behind it.

## Build

- **The card's top edge follows the drawer's bottom edge.** No drawer open: the card is
  where it is today and may use the full height of the picture. A drawer open: the card
  starts just under it, with the same small gap it has from the top today, however tall
  that drawer is; a taller drawer pushes it further down.
- The view already publishes the open drawer's height as the CSS variable
  `--drawer-height` on `.orbit-stage` (`views/OrbitView.vue`, zero when none is open; the
  toasts use it). **Read it; do not edit the view.** If it is not what you need (not zero
  when closed, or set too late), say exactly what is wrong instead of working round it.
- **The card never runs off the bottom:** its available height shrinks by the same amount,
  and its own body scrolls inside it as it does today when it is too tall.
- **It moves with the drawer, not after it:** the same tokens the drawer's reveal uses
  (`--t-base`, `--ease-out` to open; `--t-fast` to close; read `orbit/Drawer.vue`), and no
  motion under reduced motion. Nothing may jump when a drawer opens, closes, or one is
  swapped for another of a different height.
- The hover card (not pinned) and the narrow layout: say what each does, and keep whatever
  they do today unless it now collides with a drawer.

## Second, also from Johnny: a "Locate" button on the system page

*"On the system right pane, I can easily move the map and lose the system, add a button next
to explore orbits that will do our badass tracking effect and recenter the view to the
active system. 'Locate' button."*

- In `dossier/DossierOverview.vue`, **"Locate" sits beside Explore orbits** (the pair
  became three: Mainworld, Explore orbits, Locate, in `.doss-callout-actions`; and in the
  fallback row when there is no callout). Johnny placed Explore orbits there himself: keep
  his order and add Locate after it. It shows only where the panel sits beside the map
  (the same condition as Explore orbits, `orbitLink`), not in the orbit view.
- The effect is the app's locator and already exists: `workspace/locate.ts`
  (`startLocate(subject, hexKey, from)`, `locating`). **Import it; do not edit it** (it is
  Agent D's, who is making it work for a system and for a signed-out visitor in the same
  hours). Call `startLocate('hex:' + hexKey, hexKey, from)`, where `from` returns the
  button's own height on the page, as the record pages' Locate buttons do (read
  `workspace/WhereBlock.vue` for the pattern; do not edit it). The button reads
  "Locating" while `locating.recordId` is this subject, as theirs do.
- The page knows its hex through `DossierPanel.vue` (slug and hex); pass what the overview
  needs as a prop. The button holds its place before the tree arrives, like its neighbours.
- If the locator does nothing signed out when you test it, D's half has not landed: say so
  and show it signed in, or from a test of the call.

## Check

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. For Locate: on
the map, a system's page open, the map dragged away, Locate pressed: the line, the flight
back, the ring; at column, half and full; by keyboard. Then, for the card, in the browser,
signed out, on the released chart: Regina's orbit view with a body pinned, then each drawer
opened and closed and swapped for another; the card's top and bottom measured in each case
(report the numbers); at full width, with the dossier at column and half, and in a 520 px
window; reduced motion on. Screenshots `fu25_*`. Stop and report, in the same format.
