# Lane D store_scroll report
Prompt: prompts/d_store_scroll.md
Status: done

## Cause
`App.vue` makes the app frame `.app { position: fixed; inset: 0 }`, so `html`, `body` and `#app`
are 0 px tall and the document's scroll height is the window's. The store's
`<main class="mk-page">` sat in that frame with no scroller of its own (`overflow: visible`,
`min-height: 100vh`). It spilled out of the fixed box, and nothing could scroll it. The orchestrator
found the same on production. The account page was never affected: `.pk-page` is its own
full-window scroller (`position: absolute; inset: 0; overflow-y: auto`).

## Fix
- The store is now wrapped in `<div class="mk-scroll">`, using the account page's pattern: `position: absolute`,
  `inset: 0`, `overflow-y: auto` and the page background. The whole window is the scroller, so the wheel works
  over the side margins too. The centred 1240 px column sits inside it, and `min-height: 100vh` is gone.
- The catalogue, a product page, the empty states and "My packages" all go through this one scroller, since they
  are all `PackagesView.vue`.
- The lightbox and the ask dialogs are fixed or teleported overlays, so the scroller does not affect them.
- The publish form is not in the store: it lives in the map's dossier and build panels and scrolls there. It was
  not changed.
- The router's scroll-to-top moves the window, which never moves now. So the scroller goes back to the top
  whenever the path changes: card to product page, More by, and back to the Marketplace. The proof checks this
  (scrollTop 0).
- `App.vue` is unchanged.

## Changed files
- apps/web/src/workspace/market/PackagesView.vue: the `.mk-scroll` wrapper and its rule, `min-height: 100vh` dropped from `.mk-page`, and the scroller back to its top on a new path.
- tests/web/store_scroll.test.js (new): `.app` is fixed; the store's root is `.mk-scroll` with absolute, inset 0 and overflow-y auto, and the column inside does not scroll; a new path resets the scroller; `.pk-page` is a full-window scroller too. It fails on the old tree.
- tests/web/packages_entry.test.js: the server render of `/packages` and `/packages/:id` starts with `<div class="mk-scroll"><main class="... mk-page">`.
- findings/storefront/scroll.mjs (new) and scroll_proof.log, scroll_proof_in.log: the browser proof.
- findings/ui_design_shots/kb27_scroll_*: 18 shots.

## Gates
npm test:      pass (1807 tests, 1772 pass, 0 fail, 35 skipped)
npm run check: pass
typecheck:     pass
fourth gate:   npm run build pass

Browser proof: headless Edge on the local build, using `vite dev` against a local `wrangler dev` state with the
six example packages. Scrolling used real wheel events: at x = 60 at 1600 px, which is the side margin outside the
column, and at the centre at 768 and 390. Results, as measured:
- **Store, signed out, arriving directly and from the map's rail Marketplace button.** At every width the wheel
  reached the end of the scroller, and the last card was fully in view:

  | Width | Scroller (scroll height / window) | Last card bottom |
  |---|---|---|
  | 1600 | 1153 / 1000 | 960 of 1000 |
  | 768 | 1447 / 1024 | 984 of 1024 |
  | 390 | 2492 / 844 | 804 of 844 |

- **Product page (The Glass Hand), signed in as a reader.** Report shows only to a signed-in reader who is not the
  author. The wheel reached "Report this package" in view at every width:
  - 1600: bottom at 960 of 1000.
  - 768: bottom at 984 of 1024.
  - 390: bottom at 732, above the fixed Import bar, whose top is at 779.

  Signed out, the product page also scrolls to its end at all three widths.
- **`document.scrollingElement`** is exactly window height on every page (for example 1000 / 1000). The only element
  that scrolls is `.mk-scroll`.
- **`/account`.** It does not have the fault: `.pk-page` is its own scroller.
  - Signed out, or signed in at 1600 and 768, the local content is shorter than the window, so there is nothing
    to scroll.
  - Signed in at 390, the content is 898 px in an 844 px window, and the wheel scrolls it to the end (54 / 54).

  The orchestrator saw the account page's 1,163 px scroll on production.
- No console errors.
- Shots:
  - `kb27_scroll_store_{1600,768,390}_{direct,rail}_end`
  - `kb27_scroll_product_{1600,768,390}[_in]_end`
  - `kb27_scroll_account_{1600,768,390}[_in]_end`
- Every server and the browser are stopped. Ports 8941, 9941, 5341 and 9541 are free.

Not done: reproducing the fault on production, which the prompt no longer needs. I did not run the proof against
`vite preview` of the built `dist`. The build passes, and the fix is CSS plus one template wrapper.

## Contract published
none

## Needs from others
- none

## Questions for Johnny
1. Going back from a product page now lands at the top of the store, not where you were in the grid. The router
   remembers the window's position, which no longer moves. Should the store remember its own scroll position for
   Back? Suggested answer: yes, in d_store_2, where the store layout changes anyway. The scroller would save its
   position per history entry. The alternative is to leave it: before this fix the store could not scroll at all,
   so nothing regressed.
