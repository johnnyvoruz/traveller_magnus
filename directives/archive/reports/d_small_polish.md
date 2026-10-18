# Lane D small_polish report
Prompt: prompts/d_small_polish.md
Status: done

What I found: a fresh prompt with no Progress lines and none of its files changed in the working tree.
What I finished: all three items, a test, the before and after shots, and the gates.
What I backed out: nothing.

## Changed files
- `apps/web/src/workspace/StardateChip.vue`: the date shows at every width. All in this file, with no `shell/` change:
  - **From 861 px up:** unchanged. The chip sits in the search row with the weekday.
  - **From 860 to 681 px:** unchanged. The chip stays in the search row, and the weekday goes. With no campaign date set, the chip shows its icon only, as before; in the row, "No campaign date" needs about 705 px.
  - **From 680 to 600 px:** the chip sits under the search field, on the right, in the same place Lane E's rule puts it below 600 px.
    - The short date shows, and "No campaign date" shows again because there is room.
    - The chip's z-index is 2, so an open side panel draws over it, as it does over Build's strip.
    - While a side panel is open it is hidden (`.app:has(.panel.is-open)`). At these widths the panel covers its place, and without this a sliver of the chip showed past the panel's edge.
  - **Below 600 px:** Lane E's rule in `shell/Panel.vue` moves the same chip, with z-index 6, above the bottom sheet. Before, below 600 px the date showed only once the panel's styles had loaded, which is after a panel first opens. Now my rule shows it from the first load.
  - **Never twice:** there is one chip in the app (`MapView.vue` mounts it once), and E's rule moves it; it doesn't draw a second one. The test holds both facts.
- `apps/web/src/views/Account.vue`: the `<style>` block with the global `h1` and `p` rules is removed.
- `apps/web/src/design/base.css`: the same two rules, unchanged, near the top. They were the only bare `h1` and `p` rules in the app, so moving them can't change which rule wins.
- `apps/web/src/workspace/build/OrbitPicker.vue`: the picker's card drops its own `--panel-raised` background and `font: inherit`, so it takes the frame's `--bg-1` and 14 px type. Its 780 px width and its scrolling stay.
- `tests/web/small_polish.test.js` (new, 3 tests): the chip's rules at each width and the one chip; the reset in `base.css` and no style in `Account.vue`; the picker's card with no colour or type of its own.

## Gates
npm test:      pass. 1,707 tests: 1,678 pass, 0 fail, 29 skipped.
npm run check: pass (manifesto: clean)
typecheck:     pass
build:         pass. `index-Bs_zP0ph.js` 183.47 kB (gzip 61.93 kB); `index-Brju1SCQ.css` 25.33 kB. My changes are CSS only.
fourth gate:   pass. Browser pass on my own ports (API 8794, Vite 5194 with its own cache, Edge 9394), all stopped after. Shots are `findings/ui_design_shots/kb19_before_*` and `kb19_after_*`.

**The date:** signed in, with no date set, at each width, without a panel and then with the dossier open.
- Before: nothing at 640 px, with or without a panel. Nothing at 520 px without a panel.
- After, measured at 861, 860, 705, 681, 680, 640, 600, 599 and 520 px:
  - The chip shows at every width, and its right edge is inside the window every time.
  - It's always one element.
  - Nothing covers it except a side panel open between 600 and 680 px, where it is hidden.
- Signed out, the short date `002-1105` shows at 681, 680, 640 and 600 px. Before, it showed only at 681 px.
- Build's strip ends at x 341 and the chip starts at x 345 or more, down to 520 px.
- Shots: `date_1600`, `date_860`, `date_640`, `date_520`, and `date_panel_*` for the same widths with the dossier open.

**`h1` and `p`:** I compared the sign-in card, the account page (signed out and signed in) and a record page before and after.
- Every visible `h1`, `h2` and `p` has the same margin, font, weight, size, colour, letter spacing, position and height.
- The before and after shots at 1600 px are pixel-identical (`signin_1600`, `account_1600`, `record_1600`).

**The orbit picker:** the card is `--bg-1` at 14 px.
- The title and the read-out line go from 16 px to 14 px, as in the other three dialogs.
- The orbit numbers are fixed 9 px labels inside the picture and don't change.
- The picker has no table, so nothing keeps 16 px. It reads well at both widths (`picker_1600`, `picker_520`).

## Contract published
none

## Needs from others
none

## Questions for Johnny
none
