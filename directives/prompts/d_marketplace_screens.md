# Lane D — the marketplace stub's screens (size b): publish, and my packages

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/D.md`,
`directives/agent_d_brief.md`, `directives/design_reference.md`, then this file. No git
but read-only, no deploy, no `rules/`, no Traveller rule from memory. Your
hand-designer report is accepted.

## Goal

Johnny's order: the galaxy Builder, then the content marketplace stubbed, then public
games. The stub is **size b**: a signed-in referee publishes a named part of a universe
they own and sees their own packages. Nobody else browses; nobody installs. Lane A has
built the client; Lane B is building the server to the same contract. Build the two
screens against Lane A's seam with a fake store, so they are ready when the server is.

## Contract and seam to read

- `directives/contracts/b_marketplace.md`: the shapes (`PackageCreate`,
  `PackagePublish`, `PackageListing`, `PackageVersion`, `PackagePage`), the errors with
  their words, the limits (approved by Johnny: 1,280 hexes, 500 records, title 1 to 80,
  description to 2000, kind 1 to 40, 32 tags of 1 to 40, 100 versions).
- `findings/marketplace_client_ready.md` and `apps/web/src/marketplace/screen.ts`
  (Lane A's): `asMarketplaceStore`, `publish` returning `{ accepted, finished }`,
  progress as a `PackageVersion`, `listings()`, `page()`, `tick()`. Build against this
  interface only. Do not call `fetch`, do not import `store.ts`, do not edit
  `marketplace/`.

## Johnny's decisions that bind the screens

- A listing shows: title, author handle, kind, truth version, edition, hex count,
  tags, latest version number.
- Any signed-in owner publishes, and only a subset of a universe they own. A universe
  that is not on a published chart cannot publish: say so before the form is offered,
  in the server's sentence, `This universe is not on a published chart.`
- No install, no browse, no moderation: offer no control for them and no "coming soon"
  placeholder that looks pressable.

## What to build

1. **Publish, from Build.** The selection the person already has in Build (hexes,
   subsector, sector) is what gets published: a command "Publish selection…" in the
   palette and the Build bar's More menu (a feature gets no chrome until it works from
   the palette). It opens a form in the pane: title, kind, description, tags, which
   package (a new one, or a new version of one of mine), a summary of what goes in
   ("48 hexes in 2 sectors, 12 records") and the limits said in words before they are
   hit. Records: the campaign records that sit on the selected hexes are listed with
   checkboxes, all on by default; say plainly that a published package is a snapshot
   and public to anyone who has its address.
2. **Progress and result.** Publish shows the version's states as the contract lists
   them, survives a reload (watch by package and version), and ends on the package
   page. A failure says what failed in the server's words and leaves the form filled.
3. **My packages.** A panel registered like the others (`shell/registry.ts` pattern;
   name the registry line you add in the report), reached from the palette and from
   the account menu entry Lane E will add later: the caller's listings with the eight
   listing fields, empty state, loading without layout shift, then a package page with
   its versions. Each has an address so Back works; **the route line in
   `apps/web/src/router.ts` is not yours: give the exact line to add in your report**
   and build the view so it works once the line is there (test it by mounting the
   view).
4. Signed out: the commands are not offered; the panel shows the sign-in card.

## Copy

Every sentence follows the Google developer documentation style guide: second person,
active voice, present tense, sentence case, plain words, the condition before the
instruction, no "please". Put the strings in one table in the design note.

## Owned files (this pass)

- `apps/web/src/workspace/market/` (new): the form, the list, the package page, their
  pure logic; `workspace/build/commands.ts` and `BuildBar.vue` for the command only
- `apps/web/src/shell/registry.ts`: one registration line, named in the report
- `tests/web/market_*.test.js` against a fake `MarketplaceStore`
- `findings/marketplace_screens_design.md` with mockups `km_*` first, then the build;
  shots `km_built_*`
- `directives/reports/d_marketplace_screens.md`

Lane E has `workspace/RecordPage.vue`, `RecordGallery.vue`, `CampaignPanel.vue`,
`CampaignList.vue`, `PartyPanel.vue`, `PersonCard.vue`, `RecordPicker.vue`,
`gallery_state.ts` and `images.ts` on loan this turn: do not edit them. Not yours:
`marketplace/`, `builder/`, `campaign/`, `apps/api`, `packages/`, `router.ts`, the
three shared files.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
a browser pass on your own ports with the fake store wired in a dev-only way that does
not ship (say how), at column, half, full and 520 px, keyboard only once through:
publish a new package, publish a second version, a failed publish, the limits, my
packages empty and with five, signed out. Servers stopped.

## Stop rule

Stop when the screens pass against the fake store and the report is written. Stop
early with a blocked report if the seam lacks something a screen needs: give Lane A
the exact function.

Write `directives/reports/d_marketplace_screens.md` from
`directives/reports/_TEMPLATE.md`. Questions for Johnny written out in full,
recommended answer first. After each meaningful step append one line under Progress:
"done: X. next: Y."

## Progress
done: mockups km_*; workspace/market/ (form, packages view, logic, command, fake); build-publish command, More item, registry line; 7 tests; browser pass km_built_* against the fake (dev console only); servers stopped; report written (route lines and one DossierPanel line asked for). next: prompts/d_hand_designer_3.md after B's follow-ups (and the build_hand classText expectation then).
