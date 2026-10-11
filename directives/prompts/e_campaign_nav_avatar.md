# Lane E — Campaign pages: the way back at the top with breadcrumbs; the image becomes the record's avatar

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/E.md`,
`directives/design_reference.md`, then this file. No git but read-only, no deploy, no
`rules/`, no Traveller rule from memory. Your checker and `@` mention reports are
accepted.

## Johnny, on the live Campaign (2026-10-11)

> "In the campaign UX, we have the Back to Campaign button at the bottom of the pane,
> I think we should probably put it as a UI element near the top and maybe employ some
> sort of breadcrumbs maybe? I keep clicking the X and that's not the right UX. I also
> want to move the add an image to the actual icon area for the main avatar image and
> then have that be the new avatar for the record wherever it's displayed - we could
> probably do like a circle profile for characters / people and then a square profile
> for anything that's not characters / people just to have it be easier."

## Seen in the tree

- `apps/web/src/workspace/RecordPage.vue`: the way back is a button "All records" in
  the foot (about lines 265 and 281, `emit('back')`), shown when the page is not
  beside the list. The head has a fixed glyph (`camp-glyph is-large`, about line 162,
  an icon by record kind). The pane's X closes the whole Campaign pane, which is what
  Johnny keeps hitting.
- `apps/web/src/workspace/RecordGallery.vue` (about 213 to 215): the "Add an image"
  button and the upload states. `apps/web/src/workspace/images.ts` and
  `gallery_state.ts` hold the logic.
- `apps/web/src/workspace/CampaignPanel.vue`: every tab and record is an address
  (`pushPane`), so the browser's Back already works; the title is the record's name or
  "Campaign" (about line 88).
- A record's `images` is an array, at most 12 (`packages/shared/src/schemas/campaign.ts`
  about 196). There is no "cover" field.
- Breadcrumbs already exist elsewhere: `apps/web/src/shell/Panel.vue` and the dossier
  (`dossier/model.ts`, `DossierPanel.vue`) have a crumb. Manifesto: one way to do each
  thing. **Reuse that pattern; do not make a second breadcrumb.**

## Part 1. The way back, at the top

- Every Campaign page that is one level in (a record, a journal entry, the party, a
  character sheet opened from a record) shows a breadcrumb at the top of the pane,
  under the title bar: for example `Campaign › People › Captain Voss`,
  `Campaign › Journal › Session 4`. Each part but the last is a link to its address;
  the last is the page's name, not a link. The middle part is the list the person came
  from (the tab and, if a search or filter was on, that list as it was).
- The foot's "All records" button goes; nothing replaces it at the bottom.
- The X keeps its meaning (close the pane). Do not change the X. The crumb must be the
  obvious target: first in the reading order, first in the tab order, at least 32 px
  tall on touch.
- When the record is shown beside the list (full width), the list is already there:
  show the crumb without the middle link if it would repeat what is on screen; say
  what you chose.
- Escape, the browser's Back and the crumb all go to the same place. A deleted record's
  "Undo the delete" page keeps its way back at the top too.
- Narrow (520 px) and column width: the crumb truncates in the middle part first, never
  the current page's name; the full text is in the title attribute and for screen
  readers it is a `nav` with an accessible name.

## Part 2. The image is the avatar

- **The record's first image is its avatar.** No schema change, no server change: the
  order of `images` decides, and "make this the avatar" is a reorder the store can
  already save (check `gallery_state.ts`; if reordering cannot be saved today, stop
  that part and say what Lane A or Lane B must add; do not fake it).
- **The avatar area in the page head replaces the fixed glyph and is the add control.**
  With no image it shows the kind's icon and, on hover and focus, "Add an image"; a
  click or Enter opens the file picker; drag and drop onto it works; the upload's
  stages (uploading, failed with Retry) show in place. With an image it shows the
  image; a click opens the existing lightbox; a small control on it offers "Change"
  and "Remove".
- The gallery below keeps the other images and its own Add for more; each image there
  has "Make this the avatar". The separate "Add an image" button for the empty state
  goes, since the avatar area now does that.
- **Shape:** a circle for a person and for a character; a square with the token radius
  for every other kind (place, ship, organisation, job, and the rest). One component,
  `RecordAvatar.vue`, with sizes for the page head, a list row and a chip.
- **Everywhere the record is shown** uses that component: the records list rows
  (`CampaignList.vue`), the record page head, the party panel and person cards
  (`PartyPanel.vue`, `PersonCard.vue`), the record picker (`RecordPicker.vue`), the
  journal's mentions (`journal/EntryPage.vue`, your own folder) and the `@` list
  (`journal/MentionList.vue`). List what you could not reach (the map's vessel marks
  and the orbit view are not in this pass) so it can be given to its owner.
- Images are cropped to fill (cover), centred; they load lazily, have a fixed box so
  nothing shifts when they arrive, and fall back to the kind's icon when the image
  fails. The alt text is the record's name. Read-only and offline: no add or change
  control; the image still shows.

## Copy

Every label and message you write follows the Google developer documentation style
guide: second person, active voice, present tense, sentence case, plain words, the
condition before the instruction, no "please". For example "Add an image", "Change",
"Remove", "Make this the avatar", "The upload failed. Try again."

## Owned files (this pass)

Lane D owns `apps/web/src/workspace/` and is working only in `workspace/build/` this
turn; these files are **lent to you for this pass**:

- `apps/web/src/workspace/RecordPage.vue`, `RecordGallery.vue`, `CampaignPanel.vue`,
  `CampaignList.vue`, `PartyPanel.vue`, `PersonCard.vue`, `RecordPicker.vue`,
  `gallery_state.ts`, `images.ts`, and a new `RecordAvatar.vue` and, if the existing
  crumb needs a wrapper, `CampaignCrumb.vue`
- your own `apps/web/src/workspace/journal/`
- `apps/web/src/design/tokens.css`: appended lines only
- `tests/web/` for the above (the crumb's parts as a pure function; which image is the
  avatar; the shape by kind; reorder)
- `findings/campaign_nav_avatar.md` (short design note) and shots `kc2_*`
- `directives/reports/e_campaign_nav_avatar.md`

Not yours: `workspace/build/`, `apps/web/src/campaign/` (Lane A's store: read it, and
ask in the report for anything missing), `shell/Panel.vue` (reuse, do not edit),
`apps/api`, `packages/`, the three shared files, `CharacterSheet.vue` and the ship and
person sheets beyond swapping in the avatar component.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
a browser pass on your own API port and state directory and your own Vite, both stopped
after, at column, half, full and 520 px, keyboard only once through: open a person, go
back by the crumb, by Escape, by the browser's Back; add an image from the avatar area
with no image; change it; make a second image the avatar; see the avatar in the list,
the party, the picker and a journal mention; a place shows a square, a person a circle;
offline shows no add control. No layout shift when an image arrives; no frame at or
over 50 ms opening a record with 12 images (paste the worst).

## Stop rule

Stop when both parts are built and passed and the report is written. Stop early, with
what is done, if the avatar order cannot be saved through the existing store.

Write `directives/reports/e_campaign_nav_avatar.md` from
`directives/reports/_TEMPLATE.md`. Questions for Johnny written out in full, recommended
answer first. After each meaningful step append one line under Progress:
"done: X. next: Y."

## Progress

done: crumb parts, avatar shape, and reorder are pure functions, and the first image can already be saved at the front. next: wire the crumb and the avatar through the lent screens.
