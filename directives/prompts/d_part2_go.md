# Agent D — Part 1 accepted; go on with Part 2

Issued 2026-10-06 by the orchestrator. Part 1 of `d_visible_first.md` is **accepted and
pushed**, with your two panes fixes (keys inside a pane reaching the view; the list search
focused when the campaign first opens). They were right to make and right to keep: the keys
were dead on the live site.

Your two questions: (2) yes, the panes fixes went out with Part 1. (1) Amber for the
readout's calendar icon: Johnny answered by asking for a reset button instead (below), and
the icon's colour is now yours to settle with it.

## First, new from Johnny: the way back to the campaign date is a reset button before Play

He has seen where Part 1 put it (in the Time drawer) and wants it in the header instead:
*"let's move it to before the play button and have it be like a reset button and it will
bring view back to campaign date."*

- **One button, immediately before Play in the orbit header** (`orbit/HeaderClock.vue`). It
  reads as a reset (pick the icon from the set that says "back to where it was"; not the
  calendar-star, which is the readout's), and it does one thing: the view returns to the
  campaign date (`orbit-go-campaign`, key C, as now).
- **It must never be a button that does nothing.** That was Johnny's complaint about the
  old mark. On the campaign date it is disabled and quiet, and its title says the view is
  on the campaign date; off the date it is the live control, with the date it returns to in
  its title and spoken label. It holds its place either way: nothing in the header moves
  when the view leaves or reaches the date, or under a held scrub (your `time_row.ts` test
  pins that; extend it). No campaign open, or signed out: it is not there, and its place
  is not held.
- **One control per command.** With the button in the header, the "Go to DDD-YYYY" control
  you added to the Time drawer goes; "Set as campaign date" stays there. The Keys table and
  the test that every command has one control stay true.
- **The readout's calendar icon:** with a reset button that lights when the view is off the
  date, decide whether the icon still needs its amber, and say which you chose and why
  (Johnny was asked "amber or quiet" and answered with this button instead).
- The narrow header (under 620 px) and the compact one (under 1,180 px): say what gives.
  Contrast pairs for the two states. Your drawers note updated.

## Also new from Johnny: back one week, and Line up hidden for now

*"We should also have back one 1 week button and then we can hide the line up button for
now."* In the Time drawer (`orbit/TimeControls.vue`, `orbit/clock.ts`, `orbit/commands.ts`):

- **"Back 1 week"**, the mirror of "1 week": seven days back, the same time of day, beside
  it and before it in reading order, with the mirrored icon. Its own command and a key (the
  pair of W that reads naturally; say which you chose; no key may do two things). It cannot
  take the view before day zero: there it is disabled, not clamped silently.
- **It writes the campaign date exactly as "1 week" does:** when a campaign is open and the
  view sits on the campaign date, it moves the campaign date back a week too, with the same
  undo by toast; otherwise it moves the view only. (Orchestrator's ruling, so that back
  undoes forward; Johnny may overrule.)
- **The Line up control leaves the Time drawer for now.** Its code, its worker and its
  tests stay; only the control goes. Keep the registry honest: either the command is not
  registered while it has no control, or the "every command has a control" rule gets one
  named, commented exception. Say which. The Time tab's help text and the Keys table no
  longer mention it.
- Nothing in the drawer shifts between the campaign-date states; your contrast pairs and
  the drawers note updated.

## Also new from Johnny: a click on the picture must not close the drawer

*"When I click on the map, it's hiding whatever the active drawer was, I don't want that."*
Today `onStagePress` in `views/OrbitView.vue` closes the open drawer on any press on the
picture (`pressCloses` in `orbit/drawers.ts`; your drawers design chose it). He works with a
drawer open and the picture under it: switching layers and looking, scrubbing and
selecting, plotting. **A press on the picture leaves the drawer as it is.** A drawer closes
by its own tab, by Esc, and when another drawer opens; nothing else. Update `drawers.ts`
and its test (the rule is pure there), the drawers note (this supersedes that choice), and
check that a body can be selected, the camera dragged and a destination plotted with each
drawer open, and that the body card and the toast still sit clear of an open drawer.

## Also new from Johnny: the open sidebar survives a change of view

*"Whatever sidebar is active, keep that active when I transition back from the orbit view to
the universe view, if I have campaign open it closes when it shouldn't."*

`backToMap` in `views/OrbitView.vue` pushes the map's path with
`withQuery(route.query, { panel: null, record: null })`: it throws the pane away on
purpose, so the campaign shuts and the dossier takes its place. **Going between the map and
the orbit view, in either direction, keeps the pane exactly as it is**: the campaign list,
an open record, the Party tab, the dossier, or shut. Check every way across: the Map
button, the last step of Esc in the orbit view, a double-click on the map, "Explore orbits"
(Agent E has fixed that push in `dossier/`; do not edit it, check it), the vessel page's
"Open the orbit view", the Where block's "Show in orbit". Back and Forward return to the
pane each entry had. Say whether the pure helpers in `shell/pane.ts` needed a change, and
add the case to `tests/web/pane.test.js` if they did.

## Also new from Johnny: "Locate" for the system on screen (your half)

*"On the system right pane, I can easily move the map and lose the system, add a button next
to explore orbits that will do our badass tracking effect and recenter the view to the
active system. 'Locate' button."*

The effect exists: the locator (`workspace/locate.ts`, the map's campaign layer, the flight
in `views/MapView.vue`). Today it is for a campaign record only, and
`snapshotFromStore()` in `MapView.vue` returns nothing unless a campaign is open, so a
signed-out visitor has no locator at all. **Your half:**

- **A system can be located, by anyone.** `startLocate` takes a subject that need not be a
  record: for a system the subject is `'hex:' + hexKey` (it can never collide with a record
  id). Everything that reads `locating.recordId` to show "Locating" for its own record
  keeps working. The line, the flight and the ring run with no campaign open and signed
  out: the layer is handed the locate line whether or not there is a party to draw.
- The line starts from the button that asked, as it does for a record; the camera flies to
  the hex, centred in the space the panel leaves, and the ring beats on arrival; a click on
  the chart ends it, as now. Reduced motion: as the record locator does.
- A command for it, registered first ("Locate this system"), with a key if one is free.
- **The button itself is Agent E's** (`dossier/DossierOverview.vue`, beside Explore orbits);
  E calls `startLocate('hex:' + hexKey, hexKey, from)`. Do not edit `dossier/`. Prove your
  half from the command.

## Then Part 2 of `directives/prompts/d_visible_first.md`, exactly as written there

(item 4; `settleFlight`, pure and unwired; items 6, 7, 9 and 10; then what is left of the
signed-in pass). Three things to know:

- **Agent A is mid-step on the ghosts** in `orbit/OrbitRenderer.ts`, `orbit/ships.ts`,
  `orbit/distance.ts` and their tests, and has added a `preview` prop to
  `orbit/OrbitCanvas.vue`. Three tests in A's files fail while it works; they are A's.
  For item 4, re-read `OrbitCanvas.vue` immediately before each edit and change only your
  lines.
- **Agent E** is building the locked world's card in `dossier/DayNight.vue` and
  `DossierPanel.vue`; `dossier/`, `orbit/card.ts` and `BodyCard.vue` stay closed to you.
  `dossier/DossierOverview.vue` now has Explore orbits beside the Mainworld button
  (Johnny's own change): the design page's sample (item 10) should show it so.
- **One thing seen in your `fu19_header_off_date.png`:** the strip's status reads "Docked
  at Regi…" with room to spare beside it. A place's name should not be cut while the strip
  has the width; cut it only when it truly does not fit, and then with the whole name in
  the title. Add it to this part.

Check and report as `d_visible_first.md` and the brief say. Screenshots `fu19b_*` and
`fu17_*`. No git. Stop and report.
