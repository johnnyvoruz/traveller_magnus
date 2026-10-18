Found: the prompt already contained the signed-out rail section, and Progress was empty. OmniBox.vue, Lightbox.vue, and Rail.vue had no half-done edits.
Finished at the start: nothing.
Backed out: nothing.

# Lane E palette runnable report
Prompt: prompts/e_palette_runnable.md
Status: done

## Changed files
- apps/web/src/components/OmniBox.vue: a command is listed only when it has no `runnable` or `runnable()` is true. Signed out, `campaign` and `build` are left out. Choosing a row runs the command only when that same check passes. While the palette is open, a computed stamp re-reads the session, the campaign status and universe, whether Build is on, the route, and every `runnable()`, then runs the search again. `commands()` is a plain array, so the stamp is what notices commands being registered. The one selected hex is not reactive; the route is, and the parent updates that hex before this stamp runs. Many-hex publish is reactive because `runnable()` reads `build.selection`. An empty list says "Nothing can run right now." with no query, and "No results match your search." when the query matched nothing. "Search is unavailable." is unchanged.
- apps/web/src/workspace/focus_trap.ts: `wrapFocus`, copied from the orbit picker. The Lightbox does not import `workspace/build/`.
- apps/web/src/workspace/Lightbox.vue: Tab uses `wrapFocus`. A `focusin` listener brings focus back inside. Close still returns focus to the opener.
- apps/web/src/shell/Rail.vue: after `loadSession()` resolves with no user, and only where the account command exists, Campaign and Build stay in their places with class `is-locked` (the same opacity 0.35 as `:disabled`). They use `aria-disabled`, not the `disabled` attribute. The tooltip and accessible name are "Campaign: sign in to keep records, a party, and a journal." and "Build: sign in to generate systems and sectors on your map." Choosing either runs the account command, which opens the sign-in card. Until the session read finishes, they keep today's visibility, so a signed-in person does not see them switched off first. Signed in, Campaign still depends on its command and Build still depends on `buildOffered`. No other rail item changed. The design page has no account command, so it does not gain the two locked items.
- tests/web/lightbox_focus.test.js: one test. `wrapFocus` wraps both ways, and the Lightbox source wires Tab, `focusin`, and the return of focus.
- findings/ui_design_shots/ke2_rail_collapsed.png, ke2_rail_expanded.png, ke2_rail_520.png, ke2_signin_pointer.png, ke2_signin_key.png, ke2_palette_empty.png, ke2_palette_system.png, ke2_palette_build_off.png.

## Gates
npm test: fail. 1425 tests, 1404 pass, 4 fail, 17 skipped. None of the failures are in this pass. Failures:
- tests/web/surface_enhanced_map.test.js: "a row of the sheet is the latitude the vanilla projection gives it" (row 1, 255 !== 253).
- tests/web/surface_gl.test.js: "orbit disc shaders match js/planet_gl.js" (the shader now moves the ice edge).
- tests/web/surface_oracle.test.js: "surface oracle is deterministic and matches fixtures" (regina-w0 differs).
- tests/web/surface_service.test.js: "the page path paints when workers are unavailable" (`false !== true` at line 260).
npm run check: pass
typecheck: pass
npm run build: pass (includes `vue-tsc -b`)
fourth gate: pass. Own ports, API 8861 and Vite 5207, Vite cache `.tmp/e-palette-vite-cache`. Isolated headless Chrome from `.tmp/atlas-testing`. Servers stopped and the scratch directory removed.

Checked in the browser, keyboard for the palette (Ctrl+K, Escape, b):
- Spinward Marches 1911, Build on: the open list has "Generate a system" and does not have "Publish selection…".
- With that list still open, moving to Spinward Marches 1910 (the route updated, and the address gained the camera query) made "Publish selection…" appear without opening the palette again.
- Build off: "Publish selection…" and "Generate a system" are gone. "Build: on or off" remains.
- Signed out, expanded, collapsed, and at 520 px: both items are switched off. A pointer click and Enter each open the sign-in card (`#account-pop`, heading "Sign in") and do not open Campaign or Build.
- The signed-out palette does not list Campaign or Build.
- A signed-in reload recorded no `is-locked` button. The account control read as signed in, and Build was offered without `aria-disabled`.

## Contract published
none

## Needs from others
- Lane C: the four surface failures above. They are in C's files. This pass did not change them.

## Questions for Johnny
none
