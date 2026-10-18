# Lane M video-look report
Prompt: prompts/m_video_look.md
Status: done

Found: a fresh start. The Progress section was empty and git showed none of my files changed.
Finished: nothing was left half-done.
Backed out: nothing.

## The shared pieces (base.css, block "The version-video look")
Each piece and where it is used today. All of them are on the design page (`/design`, last section).

| Class | What it is | Used in |
|---|---|---|
| `.ui-ground` | radial gradient --bg-1 (upper left) to --bg-0, hex grid in --line-1 at 32%, sparse static star field; draws with its own `::before`/`::after` | the design sample; the journal's first-run card |
| `.ui-brand` + `.ui-brand-dot` | red-V mark (`/favicon.svg`) and TRAVELLER.VOYAGE, Orbitron 700, 0.14em; the dot in --mark-red | the design sample (for D's store header) |
| `.ui-kicker`, `.ui-kicker.is-signal` | Orbitron 700 12 px capitals, 0.4em, --signal-dim; `.is-signal` is --signal at 0.24em | the timeline's year; the journal row's kind; the design sample |
| `.ui-kicker-row` | a NEW tag beside a kicker | the design sample |
| `.ui-new` | the NEW tag, white on --mark-red with its halo | the design sample |
| `.ui-rule`, `.is-signal`, `.is-red` | the 2 px rule fading right: red into teal, teal alone, red with a halo | the design sample (the entry header and the timeline year draw the same gradient in their own CSS) |
| `.ui-frame`, `.ui-frame-label`, `.ui-frame-count` | thin --line-2 panel on --bg-0 with a teal halo, a corner label and an Orbitron count | the design sample; the journal rows, the timeline and the entry's images use the same frame values |
| `.ui-date` | outlined Orbitron date box, 12 px | the journal row's in-fiction date; the timeline's day |
| `.ui-steps` + `.ui-step` (`aria-current` or `.is-lit`) | hex nodes on a vertical line; the current step lit | the timeline's days (today lit); the design sample |

New tokens, appended to `tokens.css` with comments: `--mark-red`, `--on-mark-red`, `--mark-red-glow`, `--frame-glow`, `--ground-grid`, `--ground-grid-size`, `--ground-grid-alpha`, `--ground-stars`, `--ground-stars-size`, `--ground-stars-alpha`. The grid and the stars are SVG masks, so their colours stay tokens (--line-1, --text-0).

The NEW tag's text was --text-0 in the video. On --mark-red that is 4.29:1, under AA, so the tag uses `--on-mark-red` (white, 5:1). It looks the same.

## The journal and the timeline (style and layout only)
- **Journal list:** the rows sit in a frame on --bg-0. The kind (Session, Note…) is a bright kicker over the name, where it was a chip at the right. The in-fiction date is in a `.ui-date` box at the start of the meta line. The kind glyphs are hexes. The session number is in Orbitron. On a narrow panel the buttons wrap under the search, so the field is no longer squeezed to "Sea". The first-run card is a ground with an Orbitron title.
- **Entry page:** the title is in Orbitron over the red-into-teal rule. Every section heading on the entry is a kicker: Entry, Images, Mentioned, and also the Where block's heading. "In fiction" and "Played" are kickers, and their dates sit in boxes. The images strip is a frame with an Orbitron count.
- **Timeline:** the list sits in a frame. Each year is a kicker over a fading rule. Each day is a step on the line, with its date in a `.ui-date` box and "Today" in Orbitron; today's node is lit.

Word changes (no words were rewritten):
1. A journal row's meta line now shows the date box first. "Players · 213-1105 · Regina 1910" reads as [213-1105] "Players · Regina 1910". The text is the same, in a different order.
2. A timeline row's own date (`.tl-when`) is hidden. Rows are grouped by that date, so it always repeated the day's box just above it. It is still in the DOM, and the day group's aria-label names the date.
3. A journal row's kind moved from a chip at the right to a kicker over the name. Same word.

To show the date box, `rowFace` (journal/list.ts) gained `when` and `metaRest`. `meta` is unchanged, and its existing tests pass as they were.

Shots in `findings/ui_design_shots/`:
- the design page: `km_look_design_1600.png`, `_390.png`
- before and after, 22 of each: `km_journal_{before,after}_{list,entry}_{empty,one,many,long}_{1600,390}`, `km_journal_*_full_{many,long}_1600` (full width, list and entry side by side) and `km_timeline_{before,after}_{empty,one,many,long}_{1600,390}`

The shots come from a harness that mounts the real components in the real Panel with a seeded store: `findings/km_harness/` (index.html, harness.ts, and objects.mjs, a stand-in that answers image requests). Gap: the "before" entry shots have no images, because I added images to the harness after taking them. So the images frame has no before shot; before this pass the strip had a plain "Images" heading and no frame.

## Changed files
- apps/web/src/design/base.css: the new "version-video look" block at the end (nothing else touched)
- apps/web/src/design/tokens.css: the ten token lines above, appended
- apps/web/src/views/DesignView.vue: a new last section, "The version-video look", plus its `design-look*` styles
- apps/web/src/workspace/journal/JournalList.vue: a `jn-list` root class, the row markup (kind kicker, date box), the first-run card on the ground, and the look styles
- apps/web/src/workspace/journal/list.ts: `RowFace.when` and `RowFace.metaRest`; `metaLine` can leave the date out
- apps/web/src/workspace/journal/EntryPage.vue: the look styles only, no template change
- apps/web/src/workspace/TimelineList.vue: year h3 `ui-kicker`, day `ui-step` (`is-lit` today), date `ui-date`; the style block rewritten for the look
- tests/web/km_video_look.test.js (new): every piece is in base.css, every token the block reads exists, and the row's date split
- tests/web/contrast.test.js: 18 pairs for the new text and marks (the ground, the frame, the NEW tag, the kickers, the date box, the steps, rows on --bg-0)
- findings/km_harness/ (new): the shot harness
- EntryGallery.vue was not edited: its strip takes the frame from EntryPage's CSS

## Gates
npm test:      pass (1897 tests, 1859 pass, 0 fail, the rest skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass
fourth gate:   pass (`npm run build`, vue-tsc and vite, built)

## Contract published
none

## Needs from others
- none. For Lanes D and N: the classes are in. Put `.ui-ground` on a wrapper if the element already draws its own `::before` or `::after`.

## Questions for Johnny
1. The red dot in the TRAVELLER.VOYAGE wordmark is 2.7:1 on --bg-0, under the 3:1 for marks. I recommend leaving it as it is in the videos: it is part of a logotype, which WCAG exempts, and the word reads without it. The contrast test says this in a comment rather than holding the dot to 3:1. The other option is a brighter red for the dot alone, which would no longer match the mark's V.
