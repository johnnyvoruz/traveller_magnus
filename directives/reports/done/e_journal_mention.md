# E journal mention report
Prompt: prompts/e_journal_mention.md
Status: done

## Changed files
- apps/web/src/workspace/journal/mention.ts: `@` at a word start, the token text, backspace of a whole token, and the capped filter.
- apps/web/src/workspace/journal/MentionList.vue: the record-picker list, fixed at the caret. Empty campaign: one line, "No records yet."
- apps/web/src/workspace/journal/JournalBody.vue: the list opens, narrows, and inserts. Escape leaves the typed text. Clicking away still saves.
- apps/web/src/workspace/journal/EntryPage.vue: the body receives the campaign records.
- tests/web/journal_mention.test.js: token round-trip, email does not open, backspace range, 2,000 records under 50 ms.

## Gates
npm test:      pass (1302 pass, 0 fail, 14 skipped)
npm run check: pass (manifesto: clean)
typecheck:     fail outside this pass. `tsc --noEmit -p apps/api` reports `apps/api/src/routes/builder.ts(373,43): error TS2304: Cannot find name 'generateWithSectors'.` This pass did not edit that file. `vue-tsc -b` inside `npm run build` passed.
fourth gate:   pass. Own API on 127.0.0.1:8833 (persist `.tmp/e-mention-8833`) and own Vite on 127.0.0.1:5191, both stopped after. Typed `@`, narrowed with Vos, Enter inserted the token, Ctrl+Enter saved, reload still lists Captain Voss under Mentioned. Shots: `findings/ui_design_shots/kj_mention_open.png`, `kj_mention_chosen.png`, `kj_mention_saved.png`, and the same three at 520 px.

## Contract published
none

## Needs from others
- The builder route: `generateWithSectors` is called in `apps/api/src/routes/builder.ts` and is not defined, so `npm run typecheck` is red. Not required for the mention.

## Questions for Johnny
none

## Token
Inserted text, including the trailing space: `[[cr_dfa0dbba-2904-4905-abf3-19784fbac12c|Captain Voss]] `

Parsed by `mentionsOf` in `packages/shared/src/schemas/campaign.ts`. The pattern is line 279, `MENTION_TOKEN`, and the function starts at line 286. `saveEntry` in `apps/web/src/campaign/journal.ts` line 207 sets `mentions: mentionsOf(entry.body)`. Nothing new is sent.
