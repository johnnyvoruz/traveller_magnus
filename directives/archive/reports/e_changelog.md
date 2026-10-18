Found: the prompt had no Progress lines, and the owned files had no diff.
Finished: nothing was half-done.
Backed out: nothing.

# E changelog report
Prompt: prompts/e_changelog.md
Status: done

## Changed files
- apps/web/src/changelog.ts: 22 releases, newest first, 1.2.6 down to 1.1.1. The first entry is APP_VERSION.
- apps/web/src/workspace/ChangelogBody.vue: heading "What's new". Each release is a disclosure, version and date then title, items as a list. The current release is open.
- apps/web/src/workspace/ChangelogWindow.vue: the one modal frame (`.ui-modal`). Close, Escape and the scrim close it. Focus starts on Close and returns to the opener. The card's height includes its padding, so the list scrolls inside the viewport at 1600 and at 390.
- apps/web/src/views/ChangesView.vue: the map, with the window over it. Close replaces the route with `/`.
- apps/web/src/router.ts: `/changes` lazy-loads that view.
- apps/web/src/map/routes.ts: one condition. `/changes` uses the same home rect as `/`, so the map does not send that URL home.
- apps/web/src/workspace/AccountMenu.vue: the signed-in version line is a button, "Version 1.2.6 · What's new", in the store's text-link look. It opens ChangelogWindow. The window loads on first open.
- apps/web/src/workspace/passkey/AccountPage.vue: the same button on the signed-in account page, and the same window.
- apps/web/src/workspace/passkey/SignInBody.vue: the version button on the sign-in card. What's new replaces that card's body with Back and the list. The list scrolls inside the card, so Back stays on screen. Escape returns to the card and leaves the pop-up open. ChangelogBody loads on first open. The card does not import ChangelogWindow.
- tests/web/changelog.test.js: the first entry is APP_VERSION; order, dates and player wording; `/changes` stays on the map; the window renders one open release.
- tests/web/version_label.test.js: the three buttons read the live version and "What's new".
- findings/ui_design_shots/kb30_changes_menu.png, kb30_changes_signin.png, kb30_changes_back.png, kb30_changes_1600.png, kb30_changes_390.png. `findings/` is gitignored.

The version control on the sign-in card lives inside SignInBody, which is already the body of the account pop-up and of the signed-out account page. Opening What's new sets the card to the changelog. Back, and Escape, return to the sign-in choices. The signed-in account menu and the signed-in account page are not themselves modals, so they open ChangelogWindow.

The production build keeps the list out of the sign-in chunk: `ChangelogBody-BtPD-I-U.js` (7.36 kB), `ChangelogWindow-ruk-vgOH.js` (1.77 kB), `SignInBody-D-qPNEiV.js` (17.85 kB).

Browser, isolated Chrome, port 5231: the sign-in button opens the list, Back returns to the card, and `/changes` stays on that URL. Close, Escape and the scrim each leave `/changes` for `/` and remove the window. Escape on the sign-in list returns to the card, keeps the pop-up open, and focuses the version button. The signed-in menu and the signed-in account page were not opened. Those need a session.

## Five newest entries

**1.2.6 · 17 October 2026 — Record packages**
- A package made of records shows how many records it holds.
- The import panel matches the rest of the store.
- A package page looks right the first time you open it.

**1.2.5 · 17 October 2026 — Packages of records**
- You can publish a package that holds records and no map.
- Its page does not ask you to place it on the map.
- The featured row is shown once.
- Your own ship's route is drawn in cyan.

**1.2.4 · 16 October 2026 — Filters and courses**
- The marketplace has filters in a column on the left.
- A ship's route is a solid line, with the course ahead marked.
- You choose whether your ship's course ahead is shown.
- A public ship's card uses the same lime as its track.
- Back returns you to your place in the store.

**1.2.3 · 15 October 2026 — Scrolling and surface detail**
- The store scrolls on every screen.
- You can zoom much further into a world's surface map, and it stays sharp.
- The UWP tiles no longer use a dotted underline.

**1.2.2 · 15 October 2026 — Storefront and ship traffic**
- Public ships show as lime tracks at every zoom, out to the whole sector.
- The marketplace is a storefront, with a featured row and a page for every package.
- You add a cover by choosing a file, by dropping one, or by pasting.
- When you zoom out, the map shows the published chart.

## Gates
npm test:      fail (1845 pass, 8 fail, 38 skipped). The changelog tests and the version-label test passed. The eight failures are named under Needs from others.
npm run check: pass
typecheck:     pass (`tsc --noEmit -p apps/api`; `vue-tsc -b` inside the web build)
fourth gate:   pass (`npm run build`)

## Contract published
none

## Needs from others
- tests/api/quota_reservation.test.js: "a failed put releases, and an expired reservation stops counting" (`false !== true`).
- tests/web/surface_soft_disc.test.js: seven failures in "globes match the dossier sheets" and "the worker paints tiles for the page" (vanilla globe budget, eclipse, rings, fast spin, worker ready, unchanged frame, sharper large disc).

## Questions for Johnny
none
