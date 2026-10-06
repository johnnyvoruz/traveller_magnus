# Agent E — the info card must touch the space it is given (a correction)

Issued 2026-10-06 by the orchestrator. The Scout Survey card, the card following the drawer
and the Locate button are **accepted and pushed**. One thing in the card is not what Johnny
asked for, and it is small.

## What is wrong

Johnny: *"have the info card in the orbit view stick to whatever the shortest values is to
the drawer, if there's no drawer it should fill the space, and if the drawer is larger, it
should push the card down."*

Your measurements: with no drawer the card's top is 74 px below the top of the picture, and
with a drawer open it is 74 px below the drawer. `fu25_card_time.png` shows it: a band of
empty picture between the Time drawer and the card. The 74 is 18 px of gap plus a 56 px
shift that `views/OrbitView.vue` puts on every card (`.orbit-stage .orbit-body-card`,
`top: 56px`, about line 1330). That shift was there to clear a control that used to sit at
the top left of the picture and was removed when the drawers were built. Nothing is there
now.

## Build

- **No drawer: the card's top is 18 px below the top of the picture** (it fills the space).
- **A drawer open: the card's top is 18 px below the drawer's bottom edge**, whichever
  drawer it is.
- The 56 px shift goes. **You may edit that one rule in `views/OrbitView.vue`** (the
  `top: 56px` on the body card and nothing else in the file; Agent D is working in the same
  file's script, so re-read it immediately before your edit and list the lines you
  changed), and take the matching `56px` back out of `BodyCard.vue`'s bottom.
- Everything else you built stays: the height shrinking with the drawer, the body
  scrolling when it must, moving with the drawer's own tokens, no motion under reduced
  motion, the hover card in the same stack.
- Check nothing else relied on the shift: the card must clear the ship strip and the
  toasts at the top right, and the body chips at the bottom, at every width.

## Check

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. The same table
of measurements as your last report (closed; Time, View and Layers settled; a swap; half;
520 px), with the gap column reading 18 each time. Screenshots `fu25b_*` beside your
`fu25_*`. Stop and report.
