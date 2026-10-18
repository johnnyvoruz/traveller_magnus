# Lane D version_label report
Prompt: prompts/d_version_label.md
Status: done

What I found: a fresh prompt with no Progress lines and none of its files changed in the working tree. The board has two Lane D rows: a "go" row for this prompt above the table, written at 13:21 with the prompt file, and a "free" row in the table, stamped 12:30. I followed the go.
What I finished: the line in three places, a test, the shots and the gates.
What I backed out: nothing.

## Changed files
- `apps/web/src/workspace/passkey/SignInBody.vue`: the last line of the sign-in card is `Version {{ APP_VERSION }}`, below the fine print and in every state of the card (sign in, and "I lost my passkey"). This is the card in the rail's pop-up and on `/account` when signed out.
- `apps/web/src/workspace/passkey/AccountPage.vue`: the same line, last on the account page, below Sign out. It's hidden while the page loads, and while signed out, because then the sign-in card on the page already says it.
- `apps/web/src/workspace/AccountMenu.vue` (step 3): the same line, last in the signed-in account menu, below Sign out.
  - It sits outside the `role="menu"` list, so the arrow keys don't stop on it.
  - I added it here because the account window people open from the rail is this menu. The account page is a full page that the menu's "Account and sign-in" item leads to. The shots are `kb18_version_menu_*`.
- Each line is styled the same way:
  - 11 px, the smallest size the app uses for words. 9 to 10.5 px are only map glyph and UWP labels.
  - `--text-muted`, right-aligned, line height 1.3, `user-select: text`, not a link.
  - The number comes from `APP_VERSION`; it is not typed anywhere.
  - No new tokens.
- `tests/web/version_label.test.js` (new, 4 tests):
  - Each file imports `APP_VERSION` and never types the number, and its rule is 11 px, muted and selectable.
  - `--text-muted` has at least 4.5:1 contrast on `--bg-0`, `--bg-1` and `--chrome-bg`.
  - A server render of the sign-in card ends with the line.
  - A server render of the signed-in menu ends with the line, after Sign out and outside the items.

## Gates
npm test:      pass. 1,690 tests: 1,661 pass, 0 fail, 29 skipped.
npm run check: pass (manifesto: clean)
typecheck:     pass
build:         pass. `index-CskeduGN.js` 178.36 kB (gzip 59.99 kB); `index-6qkl4-yl.css` 25.10 kB.
fourth gate:   pass. Browser pass on my own ports (API 8794, Vite 5194 with its own cache, Edge 9394), all stopped after. Shots are `findings/ui_design_shots/kb18_version_*`:
- `signin_1600`, `signin_520`: the rail's sign-in card, signed out. The line is 17 px from the card's foot and right edge, which matches the card's padding. The card is 321 px tall, the same at both widths.
- `account_out_1600`, `account_out_520`: `/account` signed out. The line appears once, inside the sign-in card.
- `menu_1600`, `menu_520`: the signed-in account menu. The line is last, below Sign out. A triple click selects "Version 1.1.15" and the menu stays open.
- `account_1600`, `account_520`: the account page, with the line below Sign out.

**Size at 520 px:** each line is one line, 14 px high. It adds that line plus the card's own gap to each card, nothing more. Every card fits the window, with no sideways scroll.

## Contract published
none

## Needs from others
- Orchestrator: the board has two Lane D rows, a go above the table and "free" in it. The table row needs updating.

## Questions for Johnny
none
