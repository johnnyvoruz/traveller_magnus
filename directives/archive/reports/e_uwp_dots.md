Found: the prompt had no Progress lines, and UwpRibbon.vue, CodeNote.vue and tests/web had no diff.
Finished: nothing was half-done.
Backed out: nothing.

# E uwp dots report
Prompt: prompts/e_uwp_dots.md
Status: done

## Changed files
- apps/web/src/dossier/CodeNote.vue: a `bare` prop drops the `doss-note-underline` class. The focus ring, the tooltip and `cursor: help` stay. Other notes still get the dotted underline.
- apps/web/src/dossier/UwpRibbon.vue: each UWP tile passes `bare`. The whole-code line does not. A tile hover or focus lifts the background to `--wash` and draws a 1px inset `--signal-edge`. Reduced motion turns the transition off.
- tests/web/uwp_dots.test.js: the eight ribbon cells render with no underline class. The plain UWP line and a travel-zone stat row keep `doss-note-underline`.
- findings/ui_design_shots/kb27_uwp_1600_rest.png, kb27_uwp_1600_hover.png, kb27_uwp_390_rest.png, kb27_uwp_390_hover.png: Regina (Spinward Marches 1910, body w4m1), ribbon in frame. `findings/` is gitignored, so the shots are on disk only.

## Gates
npm test:      pass (1774 pass, 0 fail, 35 skipped)
npm run check: pass
typecheck:     pass (`tsc --noEmit -p apps/api`; `vue-tsc -b` inside the web build)
fourth gate:   pass (`npm run build`)

## Contract published
none

## Needs from others
none

## Questions for Johnny
none
