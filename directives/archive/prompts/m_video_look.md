# Lane M — the version-video look as shared pieces, then the journal and timeline

Issued 2026-10-17 by the orchestrator, for today only. You may be a fresh session with no memory.
Read `CLAUDE.md`, `directives/manifesto.md`, `directives/design_reference.md`,
`directives/board.md`, `directives/lanes/M.md`, then this file. No git but read-only, no deploy, no
`rules/`.

## Johnny's words (2026-10-17)
- "We are building these great traveller-voyage version videos, that's the sort of look and feel
  that I'd love on the marketplace."
- "It's a totally different experience … keep the logo or some top nav or something to tie the two
  features together."
- "I'm okay with them also focusing on UX / UI improvements … because Claude is good at frontend."

The marketplace felt foreign because it built its own look. This pass makes the videos' look a set
of shared pieces every screen uses. Lane D's store pass (`prompts/d_store_harden.md` item 5) and
Lane N's record page use yours: **do step 1 first and fast.**

## 1. The shared pieces (first; aim for about an hour)
Study the videos: `versionvideo/out/traveller-voyage-1.2.3-1080x1080.mp4` (and 1.2.2, 1.2.0),
drawn by `versionvideo/scene/scene.css`, `scene.js`, `spotlight.js`. Read them; don't edit or import
anything in `versionvideo/` (Johnny's tool). Then add one block to `apps/web/src/design/base.css`,
headed "The version-video look", with:
- `.ui-ground`: the radial gradient from `--bg-1` at upper left to `--bg-0`, a faint hex grid and a
  sparse static star field (CSS or one small SVG; no animation behind text);
- `.ui-kicker`: small Orbitron capitals, letter-spacing about 0.4em, `--signal-dim`;
- `.ui-new`: the red NEW tag;
- `.ui-rule`: the hairline under a heading that fades out to the right (signal or the mark's red);
- `.ui-frame` with `.ui-frame-label` and `.ui-frame-count`: the thin-bordered panel with a corner
  label and an Orbitron count ("PUBLIC SHIPS 6");
- `.ui-date`: the small outlined Orbitron date box;
- `.ui-steps`: the timeline with hex nodes on a vertical line;
- `.ui-brand`: the red-V mark (`public/favicon.svg`) and "TRAVELLER.VOYAGE" wordmark, Orbitron 700,
  0.14em, the dot in the mark's red.
Tokens only: append a token line for each value the tokens lack (the mark's red, the glow), with a
comment. Add a section to the design-system page (`views/DesignView.vue`, `/design`) showing every
piece, and shots `findings/ui_design_shots/km_look_design_1600.png` and `_390.png`. Then append the
Progress line **"done: shared pieces in base.css"**, which Lanes D and N watch for.

## 2. The journal and the timeline in that look
Restyle `workspace/journal/` (the list, an entry page, the entry gallery) and
`workspace/TimelineList.vue` with the shared pieces: kickers over sections, entries' dates in
`.ui-date`, the timeline as `.ui-steps`, frames where a group sits in a panel. **Style and layout
only**: no change to what is stored, the order, the controls' behaviour or the words (unless a word
breaks Google style; list each change). Every state: empty, one, many, long titles, 390 px.
Before and after shots for each screen: `km_journal_*`, `km_timeline_*`.

## Gates
- `npm test`, `npm run check` (no literal colour or `ms`), the typecheck and `npm run build`.
- The contrast test (`tests/web/contrast.test.js`) covers every new text colour on its background.

## Report
Write `directives/reports/m_video_look.md` from the template, with the class list and where each
is used.

**Owned:** the new block in `design/base.css`; `views/DesignView.vue` (your section only); token lines
appended to `tokens.css`; `workspace/journal/` and `workspace/TimelineList.vue` (style and layout);
tests under `tests/web/`; your shots and report. Lane E is in the account files this turn, not the
journal.

After each meaningful step, append one line under Progress: "done: X. next: Y."

## Progress
- done: shared pieces in base.css (block "The version-video look": .ui-ground, .ui-brand + .ui-brand-dot, .ui-kicker + .is-signal, .ui-kicker-row, .ui-new, .ui-rule + .is-signal/.is-red, .ui-frame + .ui-frame-label/.ui-frame-count, .ui-date, .ui-steps + .ui-step (aria-current or .is-lit); tokens --mark-red, --on-mark-red, --mark-red-glow, --frame-glow, --ground-*; /design section and km_look_design_1600/_390.png). next: journal and timeline before shots.
- done: journal list, entry page, gallery and timeline restyled (frames, kickers, date boxes, steps); harness findings/km_harness/; km_journal_*/km_timeline_* before and after shots. next: tests, gates, report.
- done: tests (km_video_look.test.js, 18 contrast pairs), gates green (test, check, typecheck, build), servers stopped, report directives/reports/m_video_look.md. next: none.
