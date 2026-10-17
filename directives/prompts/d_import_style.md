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
