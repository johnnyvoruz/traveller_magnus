# Lane D — the import panel's own styles

Issued 2026-10-17 by the orchestrator. **Start only after Johnny pushes 1.2.5.** You may be a fresh
session with no memory. Read `CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`,
`directives/lanes/D.md`, your report `directives/reports/done/d_store_3.md` ("Found, not fixed"),
then this file. No git but read-only, no deploy, no `rules/`.

## The fault (yours, found in `d_store_3`)
On a product page opened cold, the import panel's summary ("11 records.") and its error line have no
box: `.mk-sum` and `.mk-err` are styled in the publish forms, which load only when one opens.

## Do
1. Find every class `ImportPanel.vue` and `ProductPage.vue` use whose style lives only in a file that
   may not be loaded (the publish forms, `PublishFields.vue`, the Build pane). List them.
2. Give each a style that is loaded with the page: in `PackagesView.vue`'s global block (where
   `.mk-link` went) or in the panel itself. One definition per class; the publish forms keep looking
   the same.
3. A test that fails if a class used by `ImportPanel.vue` or `ProductPage.vue` is defined only in a
   lazily loaded file (read the sources, as `store_scroll.test.js` does).

## Gates
- `npm test`, `npm run check`, the typecheck and `npm run build`.
- Browser: a records-only package page and a hex package page, each opened cold (a new tab on its
  URL), with the import panel open: kb29 shots at 1600 and 390. The publish dialog unchanged at 1600.

## Report
Write `directives/reports/d_import_style.md` from the template.

**Owned:** `apps/web/src/workspace/market/`, tests under `tests/web/` (not `renderer.test.js`), your
shots and report.

After each meaningful step, append one line under Progress: "done: X. next: Y."

## Progress
done: listed the classes (.mk-sum only in PublishFields; build-fine only in the Build pane and GenerateSheet, with ProductPage's .mk-buy copy; build-link only in BuildPane) and moved them: new market/market.css (.mk-sum, .mk-fine) imported by PackagesView and PublishFields, the store's fine print as .mk-fine, Move it as .mk-link. next: the test.
done: tests/web/import_style.test.js (4 tests; reads the sources, follows the store's static imports, matches each element's classes against every rule with its ancestors; fails on the old ImportPanel with 9 borrowed classes, passes now). next: gates and the browser pass.
done: browser pass (kb29, 7 shots: records and hex pages cold at 1600 and 390 with the import previewed, the Publish records dialog at 1600; no publish-form or Build module fetched; dialog differs from kb28 only in the cover hint) and the panel's own spacing; gates green (npm test 1849/1812 pass/0 fail/37 skipped, check, typecheck, build); servers stopped. next: the report.
done: report written (directives/reports/d_import_style.md). next: none, stopped.
