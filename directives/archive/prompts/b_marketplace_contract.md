# Lane B — the marketplace stub's contract (size b), and the public-games feed's contract

Issued 2026-10-10 by the orchestrator, **for after `prompts/b_sector_generate.md` is
reported** (the board says when this is go). You may be a fresh session with no memory.
Read `CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`,
`directives/lanes/B.md`, then this file. No git but read-only, no deploy, no `rules/`,
no Traveller rule from memory.

## Goal

Johnny's order is: the galaxy Builder working, then the content marketplace stubbed,
then public games. He has chosen the stub's size and answered the open questions
(below). This pass writes the two contracts the browser lanes will build against.
**No code, no schema file, no migration in this pass:** contracts only, so Johnny and
the other lanes can read the shape before anything is built.

## Owned files (this pass)

- `directives/contracts/b_marketplace.md` (new)
- `directives/contracts/b_public_games.md` (new)
- `directives/reports/b_marketplace_contract.md`

Read: `findings/marketplace_gap_audit.md` (Lane C's audit: what the specs promise, what
is on disk, where the party position lives), `directives/plan.md` (the package slices),
`directives/architecture.md` §2, `directives/data_model.md`, `directives/api.md`,
`packages/shared/src/schemas/` (the package manifest type already there),
`apps/api/src/` (D1 schema, migrations, auth, the Queue jobs a publish would join),
`directives/contracts/b_builder.md` for the style. If a spec and Johnny's answers below
disagree, his answers win and the disagreement is listed in your report; do not edit
the spec.

## Johnny's decisions (2026-10-10)

Marketplace stub, **size b**: a signed-in referee can publish a named part of a
universe they own and see their own listings. Nobody else can browse it and nobody can
install it yet. Sharing is free; a publish is a snapshot locked to exact hex ids.

1. A listing shows: title, author handle, kind, truth version, edition, hex count,
   tags, latest version number. Trees and records stay on the package page.
2. Any signed-in owner may publish, and only a subset of a universe they own.
3. No moderation in the stub. Report and takedown come with the full marketplace.

Public games (built after the stub; contract now):

4. A public game shows one hex mark and the universe's name. No referee name, no
   player names, no "in jump".
5. The position is the hex from the owner's last save of the party track. No
   heartbeat, no expiry; it stays until public is turned off. Readers load it with the
   sector, not on a timer.
6. Hex precision only. Body, open-space point and jump state stay private.
7. Opt-in, default off. A new universe publishes no position.
8. Games share a map only on the same non-null `truth_version`. A from-scratch
   universe and a hex in a referee's own (`~`) sector are left out.
9. One hex draws one dot and a count, not one glyph per game.
10. A party may hold several ships: a list of vessel ids with one flagged current;
    the public mark follows the current one.

## 1. `contracts/b_marketplace.md`

For size b only, then a short "Later, not in the stub" list (public browse, install
and merge, updates, propose to canonical, report and takedown) with one line each so
nobody builds toward a different shape.

- Routes: create a package, publish a version (universe id, hex keys, record ids),
  list the caller's packages, read one of the caller's packages. For each: method and
  path, who may call it, request body and zod schema name with the file it will live
  in, response envelope, every error with its words, and what it does to storage.
- Storage: the D1 tables and columns, what goes to R2 and under what key
  (content-addressed objects and a manifest, per `architecture.md` §2), what a publish
  job does step by step and how its progress is read.
- The manifest: field by field, citing the type already in `packages/shared`.
- Limits (hexes per package, name lengths, versions) with where each number comes
  from; if a number is not in a spec, mark it "proposed" for Johnny.
- What the browser lanes need: the client calls for Lane A, the fields a publish form
  and an owner's list need for Lane D.

## 2. `contracts/b_public_games.md`

- The setting: where "public" is stored, who may set it, its default.
- The write: what is copied where when the owner saves the party track (hex only),
  and what is removed when public is turned off or the universe is deleted.
- The read: one route a map calls for a sector at a truth version; the answer is hex,
  count and, where a count is one, the universe's name (say what a count over one
  shows); cache headers; an upper bound on answer size.
- What must never appear in that answer, as a list a test can check.
- What the browser needs: the call for Lane A, the layer's data for whoever owns
  `map/` that turn.

## Gates

No code changes: run `git status --porcelain` before and after and paste both; only
the two contracts, this prompt's Progress and the report may differ. Fourth gate: every
decision 1 to 10 above is cited by number where the contract carries it.

## Stop rule

Stop when both contracts and the report are written. Stop early with a blocked report
if a decision above cannot be met by the data model as it stands without a change
Johnny has not approved: name the decision and the table.

Write `directives/reports/b_marketplace_contract.md` from
`directives/reports/_TEMPLATE.md`. Questions for Johnny written out in full,
recommended answer first, each with what it blocks. After each meaningful step append
one line under Progress: "done: X. next: Y."

## Progress
- done: read the board. The Builder push is ready and not yet made, so this prompt does not start. next: orchestrator, after that line changes.
- done: both contracts written. Decisions 1–10 cited. next: report.
- done: report written at directives/reports/b_marketplace_contract.md. next: orchestrator.
