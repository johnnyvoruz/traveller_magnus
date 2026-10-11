# Orchestrator state — 2026-10-11 13:50

Overwritten every turn. History is `handoff.md` (last section: 233).

## Where the roadmap is
The Builder push is ready: list and commands in `findings/push/builder_2026-10-11.md`,
paths in `builder_2026-10-11_files.txt`. Johnny has not made it yet. After it: D's
one-act Undo, the marketplace contracts (stub size b), then public games.

## Checked this turn
- All of yesterday's reports accepted and filed (A two, B, D, E). Whole tree: 1,323
  tests, 0 fail, check clean, typecheck clean.
- Clean copy (`git archive HEAD` plus the push paths, `rules:gen`, `names:gen` via
  build): check clean, typecheck clean, build passes, 1,288 tests with one file red:
  `tests/golden/esm.test.js`, five fixtures.
- **Those five are red on a pure copy of `3d28e33` too.** They are the held
  water-against-ice fixtures. Not caused by the push. Asked of Johnny. Nobody has
  looked for which committed change moved the output; "reported, never fixed".

## Lanes (all wait for the push; the board's first line is the switch)
- A `a_dossier_open_frame` (holds DossierPanel.vue and DossierBody.vue).
- B `b_marketplace_contract` (two contracts, no code).
- C free.
- D `d_grow_one_act` (item 6, the menu placeholder, only if the board says yes).
- E `e_checker_colours` (scripts/check_manifesto.js and the allowlist).

## Next turn
1. When Johnny says the push is made: change the board's first line to "The Builder
   push is made (<hash>)" so the prompts' start condition is met; record his answers
   to the three open questions (the menu one goes under Decisions for D's item 6).
2. Then reports as they come. Watch: A's line ranges in the two shared files; D
   blocked on A's store is likely (the store must send `makeSectors` and call
   `undo-generate`) and A is busy, so be ready to write A a small prompt.
3. After B's contracts: marketplace build prompts (B schema and routes, A client,
   D publish form and owner's list, E the menu entry).
4. Campaign steps 1, 2, 3, 5 for D after its one-act pass; the multi-ship party needs
   a B contract first.

## Traps
- `handoff.md` is 448 KB: read by offset (section 227 starts near line 6166).
- A clean copy needs `npm run rules:gen` and `npm run names:gen` before tests, and
  junctions for `node_modules` and `apps/api/node_modules`.
- The gates rewrite `packages/engines/src/generated/` and `apps/web/dist` (not edits).
- Never print a golden test's assertion output: it is a whole system as one line.
- The engine water-against-ice set and B's truth-build hardening stay out of pushes.
