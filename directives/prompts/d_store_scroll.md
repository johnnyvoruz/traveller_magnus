# Lane D — the store does not scroll (live, 1.2.2)

Issued 2026-10-15 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/D.md`, then
this file. No git but read-only, no deploy, no `rules/`. **This pass is the fix alone**, so it
can be pushed at once. The rest of Johnny's notes are `d_store_2.md`, next.

Johnny, 2026-10-15: "There's a critical missing aspect to the packages that there's no scroll."

## The fault

On `https://traveller.voyage/packages` Johnny cannot scroll the page. His browser is Edge on
Windows, which has no WebGL there.

The orchestrator found no global scroll lock in the source: no `overflow: hidden` on
`html`, `body` or `#app`, no `body.style`, and no window-level wheel or touch listener. Your
own `_full` shots predate your "full-page height" fix.

- **Reproduce first** on production with your headless Edge:
  - signed out;
  - at 1600, 768 and 390;
  - both arriving at `/packages` directly and arriving from the map through the rail.
- Find the cause, fix it, and prove it on the local build: scroll to the last card at every
  width, and on a product page to Report at its foot.
- Check the account page (`/account`) for the same fault and say what you found.
- **Name the cause in your report.**

## Cause (found by the orchestrator in Chrome on production, 21:40)

- `App.vue` 16: `.app { position: fixed; inset: 0 }`. The store's `<main class="mk-page is-store">`
  sits in it with `overflow: visible` and is 1,239 px tall in a 1,034 px window.
- `html`, `body` and `#app` are 0 px tall, so the document's scroll height is the window's:
  there is nothing to scroll, and the store spills out of the fixed box.
- The account page does it right: `.pk-page { position: absolute; inset: 0; overflow-y: auto; }`
  (`workspace/passkey/AccountPage.vue` 548). It is its own full-window scroller, and its content
  is 1,163 px and scrolls.

**The fix:** give the store the same pattern in your own files. A full-window scroller wraps the
page, so the wheel works over the side margins too, and the centred 1240 px column sits inside
it. Do not change `App.vue`: the map needs `.app` fixed. A product page, the empty state, the
publish form and the lightbox go through the same scroller.

Reproducing it on production is no longer needed. Prove the fix on the local build as below,
and check with `document.scrollingElement` that nothing else on the page scrolls.

## Owned files (this pass)

`apps/web/src/workspace/market/`, tests under `tests/web/`, shots
`findings/ui_design_shots/kb27_scroll_*`, `directives/reports/d_store_scroll.md`. If the cause
sits elsewhere, name the file and the fix under "Needs from others" and stop.

## Gates

`npm test`, `npm run check`, the typecheck, `npm run build`, and the browser proof above.
A test that would have caught it, if one can be written without a browser.

Write `directives/reports/d_store_scroll.md` from the template. After each meaningful step
append one line under Progress: "done: X. next: Y."

## Progress
done: the store wrapped in a full-window scroller (.mk-scroll, PackagesView.vue) and reset to the top on a new path. next: a test, then the gates and the browser proof.
done: tests/web/store_scroll.test.js and two shell assertions in packages_entry.test.js (fail on the old tree). next: the gates and the browser proof.
done: gates green (npm test 1807/1772 pass/0 fail/35 skipped, check, typecheck, build) and the browser proof at 1600, 768 and 390 (findings/storefront/scroll_proof*.log, 18 kb27_scroll_* shots); servers stopped. next: none.
done: report written (directives/reports/d_store_scroll.md). next: none, stopped.
