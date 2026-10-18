# Stream M — the version-video look, across the app

Read `streams/README.md` first; it is the loop. Today only (Johnny, 2026-10-17), until he stops you.

**Area:** **style and layout only** in `apps/web/src/workspace/` (not `market/`: Lane D's; not
`RecordPage.vue` and its blocks: Lane N styled them), `dossier/`, `shell/` (not `Rail.vue` while Lane D
is in it), `components/OmniBox.vue`, `characters/screens/`, the account and sign-in screens; and you
own the block "The version-video look" in `design/base.css` and its `/design` section. No change to
stored data, the order of things, the words (unless a word breaks Google style: list it) or what a
control does. Legacy polish is the bar (`design_reference.md`); the videos are the look
(`versionvideo/out/*.mp4`, read-only).

Lane N works on behaviour in some of the same files: the claims file keeps you apart.

## Queue
- [x] M1 **The campaign panel's frame:** `CampaignPanel.vue` (header, the Records / Party / Timeline
  tabs), `CampaignCrumb.vue`, `ClockLine.vue`, `StardateChip.vue` (dates in `.ui-date`).
  (Orchestrator, 14:30, from Lane N's N0 shots: at 1600 the tab strip overlaps, "Jour" runs under
  "Timeline" with a scrollbar under the tabs, `sN_N0_party_after_1600.png`. Fix it in this item.)
- [x] M2 **The records list:** `CampaignList.vue`: rows, avatars, type chips, search, the Publish and
  Timeline buttons, the empty state.
- [x] M3 **The party:** `PartyPanel.vue`, `ShipSheet.vue`, `PersonSheet.vue`, `PersonCard.vue`,
  `TrackBlock.vue`, `VesselPlan.vue`, `WhereBlock.vue` if N has released it.
- [x] M4 **Characters:** `CharacterSheet.vue`, `SheetPanel.vue`, `SheetBox.vue`,
  `characters/screens/CharactersPanel.vue`, `ClaimPage.vue`.
- [x] M5 (orchestrator 15:00, from N1: the "Your records here" heading isn't a kicker yet; N's new "In your campaign" is) **The dossier:** `DossierPanel.vue`, `DossierOverview.vue`, `DossierBody.vue` (shared: style
  only), `FactTiles`, `StatRows`, `SocioBlock`, `StellarLines`, `SystemTree`, `JourneyTimes`,
  `SurfaceKey`, `DayNight`, `UwpRibbon`. Section kickers, frames; keep every number where it is.
- [x] M6 (orchestrator 15:00: Lane D's D3 already put `BuildStrip.vue` and `BuildMarks.vue` in the look; check them and do the rest) **The Build pane:** `workspace/build/*.vue`, style only.
- [x] M7 **Account and sign-in:** `views/Account.vue`, `passkey/AccountPage.vue`, `passkey/SignInBody.vue`
  (`.ui-brand` at the top), `AccountMenu.vue`, `views/ChangesView.vue` (Lane E's changelog window:
  dates in `.ui-date`, versions in `.ui-steps`).
- [x] M8 (orchestrator 15:00: Lane D's D3 already did `OmniBox.vue` and `Panel.vue`; review them against the videos, then `ToastStrip.vue` and `PanelHost.vue`) **The shell:** `OmniBox.vue` (the command palette), `ToastStrip.vue`, `Panel.vue` and
  `PanelHost.vue` (the panel frame at its three widths).
- [ ] M9 (orchestrator 15:00: D's D3 restyled `FirstHint.vue`; make the pattern from it) **Empty states, one pattern:** every "nothing here yet" across your area (`FirstHint.vue` and
  the lists' empty text) in one shared look; propose the class for `base.css` if it is new.
- [ ] M10 **`/design` complete:** every shared control and piece shown, with its states; the contrast
  test covers every text colour on its background.

## Found by me
- [ ] M1b **The campaign panel's header and tabs** (`CampaignPanel.vue`), split from M1 (waiting on CampaignPanel.vue, N)
