# Lane D d_import_style report
Prompt: prompts/d_import_style.md
Status: done

Found: no earlier session on this prompt (Progress was empty). Finished: everything below. Backed out: nothing.

## What was borrowed (step 1)
These are the classes `ImportPanel.vue` and `ProductPage.vue` used whose style lived only in a file that may not be loaded. The new test checks every component the store loads, not just these two; none of the others had a borrowed class.

| Class | Used for | Styled only in | Cold product page |
|---|---|---|---|
| `.mk-sum` | the preview's "11 records." | `PublishFields.vue` (publish forms) | no box |
| `.build-fine` | the panel's hints ("Records only. They go into…", "Every hex goes…", "For every conflict:", "Choose theirs or mine…") and the page's own fine print ("Reading the package…", "Records only. Nothing is placed on the map.", "No description.", "No version is published yet.") | `GenerateSheet.vue` (Build pane); the page's `.mk-buy .build-fine` covered only the buy box | plain text in the body colour |
| `.build-link` | "Move it" after a placement | `BuildPane.vue` | a bare button |

`.mk-err` was not borrowed after all: `PackagesView.vue` already has `.mk-page .mk-err`, which loads with the page and styles the panel's error line. `.ui-heading` and `.ui-count` come from `design/base.css`, which `tokens.css` imports at app start. `is-small` on the conflict segments matches no rule anywhere, so it changes nothing; I left it.

## Changed files
- `apps/web/src/workspace/market/market.css` (new): `.mk-sum`, `.mk-sum span` and `.mk-fine`, each defined once.
  - Both `PackagesView.vue` and `PublishFields.vue` import it, so it loads with a cold product page and with a publish form opened on the map, whichever comes first.
  - The build puts it in its own chunk (`market-*.css`), which the store, Build, the dossier and the campaign panel all preload.
  - This differs from the prompt's two homes (the store's global block or the panel itself). `.mk-sum` is also used by the publish forms, which load without the store, so a single definition has to sit in a file both of them import.
- `PublishFields.vue`: imports `market.css`; its `.mk-sum` rules are removed (moved, unchanged).
- `PackagesView.vue`: imports `market.css`.
- `ImportPanel.vue`:
  - `build-fine` is now `mk-fine`, and "Move it" is now `mk-link` (the store's own text button).
  - It has its own spacing: 10 px above a line or the preview, 8 px between the preview's fine print. These lines used to sit flush against the campaign row and the summary box.
- `ProductPage.vue`: `build-fine` is now `mk-fine`, and the `.mk-buy .build-fine` rule is removed (`.mk-fine` has the same 12.5 px muted look).
- `CoverEditor.vue`, `ImportsList.vue`: `build-fine` is now `mk-fine`. Both are on the store page; the cover editor is also in the publish forms.
- `tests/web/import_style.test.js` (new, 4 tests). It reads the sources:
  - It follows static imports and CSS `@import` from `main.ts` and the store.
  - It parses each store template with its ancestors, including where the component sits in its parent.
  - It matches every element's classes against every rule in `apps/web/src`, ancestors included. A class that only a lazily loaded file styles fails, with the file, the line and the file that does style it.
  - It also checks that the store loads `base.css`, `market.css`, the product page and the panel, but not the publish forms or the Build pane, and that `.mk-sum` and `.mk-fine` each have one home.
  - On the old `ImportPanel.vue` it fails with 9 borrowed classes; it passes now.
- `findings/storefront/store4.mjs` and `store4.log`: the browser pass. Gate logs `s4_test.log`, `s4_check.log`, `s4_types.log`, `s4_build.log`.
- `findings/ui_design_shots/kb29_*` (7 shots).
- `directives/prompts/d_import_style.md`: Progress lines.

## Gates
npm test:      pass (1849 tests: 1812 pass, 0 fail, 37 skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass (`tsc -p apps/api`; `vue-tsc -b` runs inside the build)
build:         pass
browser:       pass. Headless Edge on my own ports (Vite 5341, API 8941/9941, Edge 9541), all stopped afterwards. Signed in as the reader, the import went into "Reader second campaign"; nothing was installed or published.
- Each page was opened cold: about:blank, then a full load of its URL.
- **Records-only page** ("Regina highport people"):
  - Panel line: "Records only. They go into the campaign, with nothing to place on the map." in 12.5 px muted.
  - Preview: "11 records." in a box with a 3 px signal border on `--bg-2`, then the attention line "2 records lose their place on the map."
  - Shots: `kb29_records_import_1600`, `kb29_records_import_390`, `kb29_records_preview_390`.
- **Hex page** ("Hollow Verge"):
  - "Every hex goes where it is in the package."
  - Preview: "6 hexes, 6 records." in the box, then the New group.
  - Shots: `kb29_hexes_import_1600`, `kb29_hexes_import_390`, `kb29_hexes_preview_390`.
- On every cold load, the page fetched none of `PublishFields`, `PublishForm`, `RecordsPublish`, `BuildPane` or `GenerateSheet`.
- **Publish records dialog** at 1600 (`kb29_publish_records_1600`): the summary keeps its box (3 px signal border, 14 px).
  - A pixel diff against `kb28_publish_records_1600` differs only at x 785–1050, y 677–773: the cover editor's hint.
  - The hint is now the store's 12.5 px muted fine print, so it wraps to two lines instead of three.
  - Before, that hint had no style at all unless the Build pane's Generate sheet had loaded earlier in the session (see question 1).

## Contract published
none

## Needs from others
none

## Found, not fixed
- `PublishForm.vue` (Build's Publish selection) and `RecordsPublish.vue` still use `build-fine` for their limits line ("A package holds up to…"). That style is in `GenerateSheet.vue`. Publish records opens from the records list, where the Generate sheet has usually not loaded, so the line shows in the body colour at full size. I left them because the prompt says the publish forms keep looking the same (question 2).

## Questions for Johnny
1. **The cover hint in the publish forms changed:** the hint "Add a picture for your package. For a map, take a screenshot of it and paste it here." now uses the store's fine print (12.5 px, muted) in both the publish dialog and the product page. Before, it was unstyled unless the Build pane's Generate sheet had loaded. Keep the new look? I suggest yes: it matches the other hints, and the old look depended on what had loaded before. The alternative is for the cover editor to keep `build-fine`, which leaves the hint unstyled for the author on a cold product page and fails the new test.
2. **The publish forms' limits line:** should the next pass move it to `mk-fine` as well, so it is styled wherever the form opens? I suggest yes, as a two-line change. It would change how the publish dialog looks: the line would get smaller and muted. The alternative is to leave it until the publish forms get a design pass.
