# A orbit colours report
Prompt: prompts/a_orbit_colours.md
Status: done

## Changed files
- apps/web/src/orbit/system.ts: the nine hex literals are gone. STAR_TOKENS (line 203) carries --star-o through --star-bd. starColor (line 270) keeps the one-argument call. An optional resolver receives the token name. With no resolver, the page's computed style is read once; in Node, where there is no stylesheet, the same tokens.css is read once. No hex fallback table.
- apps/web/src/design/tokens.css: no new lines. --star-o through --star-bd were already at lines 182–190, each holding today's value. Appending the same nine names would have duplicated them. No other line was changed.
- tests/web/orbit_system.test.js: a resolver is handed the token name, and with no page each type's colour is the value of that token in tokens.css.
- findings/ui_design_shots/kb_star_tokens_before.png and kb_star_tokens_after.png: Regina (1910), F7 V, BD 0 V, and M3 V. The canvas already paints from orbit/theme.ts, which reads those tokens. The picture is the same after the table moved. OrbitView.vue was not edited.

Readers checked, not edited: views/OrbitView.vue does not call starColor. OrbitRenderer paints theme.stars from readOrbitTheme. tests/golden/cases_esm.js still calls starColor(star) with one argument; orbit_text_1 and orbit_text_2 still match, because that call returns the token's colour.

## Gates
npm test:      pass (1316 tests, 1302 pass, 0 fail, 14 skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass (tsc --noEmit -p apps/api, exit 0)
fourth gate:   pass (npm run build exit 0, 492 modules; node scan of apps/web/src/orbit/system.ts for #[0-9a-fA-F]{3,8} printed "no matches". rg is not on PATH in this shell.)

## Contract published
none

## Needs from others
none

## Questions for Johnny
none
