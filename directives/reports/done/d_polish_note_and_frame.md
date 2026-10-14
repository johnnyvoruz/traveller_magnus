# Lane D polish_note_and_frame report
Prompt: prompts/d_polish_note_and_frame.md
Status: done

What I found: a fresh prompt with no Progress lines and none of its files changed in the working tree.
What I finished: both items, the before and after shots, a test, and the gates.
What I backed out: nothing.

## Changed files
- `apps/web/src/workspace/build/GenerateSheet.vue`: line 71's note says "from the star outward", which matches the method's label. "bottom up" is unchanged.
- `apps/web/src/design/base.css`: adds the modal frame, which is the Lightbox's frame moved here rule for rule:
  - `.ui-modal`: the fixed layer, with z-index 40, 24 px padding and the `--t-fast` fade.
  - `.ui-modal-scrim` and `.ui-modal-card`.
  - Three classes for the card's top line, beyond the three the prompt names: `.ui-modal-bar`, `.ui-modal-title` and `.ui-modal-meta`. See "Differences" item 2.
  - `@keyframes ui-modal-in`, and no fade under reduced motion.
- `apps/web/src/workspace/Lightbox.vue`: uses the frame. Its own copies of the layer, scrim, card, bar, count, meta and fade are removed. The stage, image, arrows and caption stay.
- `apps/web/src/workspace/PersonCard.vue` (lent): uses the frame, and no longer uses any `lightbox-*` class. It keeps its 520 px width and its small uppercase title.
- `apps/web/src/workspace/PlanModal.vue` (lent): uses the frame, and no longer uses any `lightbox-*` class. It keeps its 16 px padding and its full-window card.
- `apps/web/src/workspace/build/OrbitPicker.vue`: uses the frame. `.pick` and `.pick-scrim` are removed. `.ui-modal-card.pick-card` keeps what was the picker's own: 780 px wide, scrolling, `box-sizing: border-box`, the `--panel-raised` colour, and the page's type. The narrow-window padding of 8 px stays.
- The header comments of the last three now name the frame, not "the lightbox's" pattern.
- `tests/web/modal_frame.test.js` (new, 4 tests):
  - `base.css` draws the frame with the Lightbox's values.
  - Each of the four uses the layer, the scrim and the card, and keeps no layer, scrim or fade of its own.
  - No file under `apps/web/src` uses a `lightbox-card`, `-scrim`, `-bar`, `-count` or `-meta` class.
  - The Generate note matches the label.
- `findings/builder_system_design.md` §35.
- Shots: `findings/ui_design_shots/kb17_before_*` and `kb17_after_*`, 16 in all.

## Gates
npm test:      pass. 1,661 tests: 1,634 pass, 0 fail, 27 skipped.
- On the first run, one test failed: "draw reports animating while a title fades in, then settles (B1.12b)" in `tests/web/renderer.test.js` ("the fade took more than one frame").
- That run happened while my servers and browser were still loading the machine. The file passed 3 times out of 3 on its own, and the full suite passed when I ran it again.
- It's a timing test, not one of my files.
npm run check: pass (manifesto: clean)
typecheck:     pass
build:         pass.
- `index-C2ftxTCS.js` is 178.33 kB (gzip 59.97 kB). My change adds no JavaScript.
- `index-6qkl4-yl.css` is 25.10 kB (gzip 6.17 kB), and now carries the frame.
- No built CSS file has `.lightbox-card` or `.lightbox-scrim`.
fourth gate:   pass. Browser pass on my own ports: API 8794, Vite 5194 with its own cache, Edge 9394. All stopped after.

**How the pass worked:**
- Each of the four dialogs was opened from a cold page load, at 1600 × 1000 and at 520 × 900.
- The order was the person card, the deck plan, the Lightbox, then the orbit picker:
  - The person card is the passenger pill on ref1's vessel.
  - The deck plan is the vessel's full-size button.
  - The Lightbox is the vessel's image.
  - The orbit picker is Build at 1704, then Edit, then Pick orbit on a world.
- For each one I recorded the computed styles of the layer, scrim, card, bar and title, the card's box and the Close button's box, then compared before and after.

**Results:**
- **Layout and styles:** every card and every Close button is in the same place and the same size, at both widths. Every computed style is the same, except the animation name and the picker's fade (see "Differences" item 1).
- **Pixels at 1600 px:** all four are identical to the before shots.
- **Pixels at 520 px:** inside each card, no pixel differs by more than 24 of 255 in any channel. The screen around the card differs because the pane behind the scrim is now Lane E's half-height bottom sheet (`e_phone_sheet`, in flight). Compare `kb17_before_person_520.png` and `kb17_after_person_520.png`.
- **Without the Lightbox's chunk:** before, the person card and the deck plan got their frame only because the Lightbox's styles had loaded; in every before case they had. After, no stylesheet on the page has a `.lightbox-card` rule at all, and both look the same.
- **No sideways scroll** at 520 px in any case.
- **Lane E's file during the pass:** Lane E's in-flight `shell/Panel.vue` briefly failed to compile (a duplicate attribute at line 89). Vite's error overlay covered my first after-shot of the picker. By the next minute it compiled, and I took all the after shots again.

## Differences
1. **The orbit picker now fades in.** It takes the frame's fade (`--t-fast`, 0.2 s; none under reduced motion), as the other three always have. Before, it appeared at once. The shots show the settled state, so this can't be seen in them. One line, `.ui-modal.pick { animation: none; }`, would undo it. I kept the fade because the prompt asks for one frame with one motion. See question 1.
2. **Three more classes in `base.css` than the prompt names:** `.ui-modal-bar`, `.ui-modal-title` and `.ui-modal-meta`.
   - The person card and the deck plan also borrowed the Lightbox's `.lightbox-bar`, `.lightbox-count` and `.lightbox-meta`.
   - Without those rules, the top line is no longer a row and Close isn't at the right end. So "look right without the Lightbox's chunk" needs them.
   - The picker keeps its own bar, which wraps on a narrow window.
3. **The picker's card is still not the frame's card colour.** It keeps `--panel-raised` and the page's 16 px type, as it was drawn. The other three use `--bg-1` and 14 px. I left it, because nothing else was to change.
4. **One fault removed:** the dev deck-plan page (`dev/deck-plan/DeckPlanPage.vue`) has a `<label class="pick">`. Before, once the picker's CSS had loaded, the picker's bare `.pick` rule made that label a fixed full-window layer. The picker no longer has a bare `.pick` rule.

## Contract published
none

## Needs from others
none

## Questions for Johnny
1. The orbit picker now fades in over 0.2 s, like the Lightbox, the person card and the deck plan; before, it appeared at once. Should it keep the fade? I recommend yes, so the app has one modal with one motion. The other choice is one line that makes the picker appear at once again.
