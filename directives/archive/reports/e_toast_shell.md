# E e_toast_shell report

found: Progress was empty. ToastStrip.vue, toast.ts, App.vue, and the ToastStrip lines in MapView and OrbitView were clean.
finished: nothing from an earlier session.
backed out: nothing.

Prompt: prompts/e_toast_shell.md
Status: done

## Changed files

- apps/web/src/App.vue: the one mount. The rail stays in the views. App.vue is the frame around every route, beside PanelHost.
- apps/web/src/shell/ToastStrip.vue: spinner, an action that can stay open, a busy toast said once, and the same corners as today.
- apps/web/src/shell/toast.ts: `busy` and `action.close`.
- apps/web/src/views/MapView.vue: the ToastStrip import and the one element, nothing else.
- apps/web/src/views/OrbitView.vue: the ToastStrip import and the one element, nothing else.
- tests/web/toast_shell.test.js: busy, close, one announcement, one mount, the orbit corner.
- findings/ui_design_shots/ke3_*.png

## Gates

npm test:      pass (1443 tests, 1426 pass, 0 fail, 17 skipped)
npm run check: fail. One file, not this lane: apps/web/src/dossier/SurfaceStage.vue matches the window. ban in the comment "The map fills the window." The checker was clean before that line appeared.
typecheck:     pass (tsc -p apps/api)
npm run build: fail in apps/web/src/builder/store.ts, which this lane does not own. vue-tsc: copyUndo, spendFollowed, dropHear, and stopJob are unused; the returned object is missing job and stopJob on type Builder. No error in the toast files.
fourth gate:   pass. Own Vite cache and API persist, ports 5214 / 8874 / 9374, stopped after. Servers are stopped and the scratch is deleted.

A toast raised on the map was still there on /account, /packages, the characters pane, and back. At 520 px it did not cover the sign-in button, the packages header, the characters pane's Column / Half / Full / close, the search field, or the rail. Map and orbit keep today's corners. Pages with no chart use the lower right. When the panel leaves under 180 px at the chart's foot, the toast uses the lower right so it stays on screen.

A subsector A generate on Spinward Marches showed "Generating 80 hexes · 0 of 80" with Stop. That toast was on /account and /packages. It had become "Generated 80 systems." with Undo on the characters pane and back on the subsector. Undo closed that toast, and the systems it had just added were gone on the next shot.

Reduced motion: the ring is drawn, its animation is none, and the words stay. Orbit: the toast sat 18 px under the picture's top and 18 px in from its right (stage top 68, right 1269; toast top 86, right 1251).

## Contract published

none

## Needs from others

- Lane D: pass `busy: true` to showToast for a running job. The strip draws the ring while it is set and announces that toast once, not again when the count changes.
- Lane D: set `close: false` on the action to leave the toast up. Omit `close`, or set it true, and the strip still closes the toast before `run`, as today.
- Lane D: Stop can set `close: false` and change that same toast's words, instead of opening a second toast.
- Lane C: `npm run check` fails on apps/web/src/dossier/SurfaceStage.vue, the comment "The map fills the window."
- builder/store.ts: `npm run build` fails there, as named under Gates. Not this lane.

## Questions for Johnny

1. Should workspace/build/BuildSpin.vue move to design/ so the toast strip and Build share one spinner? I recommend yes. I did not move it, because build/ is Lane D's. Until then the strip draws the same ring from currentColor, and reduced motion holds it still.
