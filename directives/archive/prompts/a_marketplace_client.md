# Lane A — the marketplace stub's browser client (size b), against the contract

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/A.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your store and dossier-frame reports are accepted (the dossier needed no
change: no frame that starts after the click reaches 50 ms).

## Goal

Johnny's order: the galaxy Builder, then the content marketplace stubbed, then public
games. The stub is **size b**: a signed-in referee publishes a named part of a universe
they own and sees their own listings; nobody else browses, nobody installs. Lane B has
written the contract and has not built the server (it is finishing Builder work
first). Build the browser's client logic now, against the contract and a fake
transport, so the screens (Lane D) and the server (Lane B) meet in the middle.

## Contract to read

`directives/contracts/b_marketplace.md`, all of it; the section **"What the browser
lanes call"** is your list. Every route there is marked "not built": you test against
a fake transport that answers exactly as the contract says, the way
`tests/web/builder_store.test.js` does for the Builder. Do not read `apps/api` for
shapes, and do not start a server.

Johnny's decisions that bind the client (also on the board): a listing shows title,
author handle, kind, truth version, edition, hex count, tags, latest version; any
signed-in owner publishes a subset of a universe they own; no moderation; a universe
not on a published chart cannot publish (the server answers 400
`This universe is not on a published chart.`; the client can know this beforehand from
the universe's truth version and say so before any request).

## Owned files (this pass)

- `apps/web/src/marketplace/` (new folder, yours): `store.ts` (create a package,
  publish a version with progress, list mine, read one of mine), `types.ts`,
  `index.ts`, and a `screen.ts` seam like `builder/screen.ts` so the screens depend on
  an interface, not on the store
- `tests/web/marketplace_store.test.js`
- `findings/marketplace_client_ready.md`: the signatures for Lane D, as
  `findings/builder_handle_ready.md` did
- `directives/reports/a_marketplace_client.md`

Shapes come from the contract's zod names. If a schema the contract names does not
exist yet in `packages/shared` (Lane B's), declare the type locally in `types.ts` from
the contract text, mark each "from contracts/b_marketplace.md, replace with the shared
schema", and list them in the report. Not yours: `packages/`, `apps/api`, `workspace/`,
the router, every shared file.

## What must be true (each with a test)

1. Each client call makes exactly the request the contract gives and parses exactly
   the answer it gives; an answer that does not match is an error, not a guess.
2. Publish reports progress the way the contract's publish job is read, can be
   watched after a reload (by package and version), and ends in the listing being
   updated in memory without a second fetch where the contract allows it.
3. Every error in the contract reaches the caller as the server's own message.
4. Signed out, or not the owner: the client refuses before any request, with one
   plain sentence the screen can show.
5. A universe with no truth version: refused before any request, with the server's
   sentence.
6. No global, no `window.`, no native dialog; state is a store a screen subscribes to,
   the same pattern as `builder/`.
7. Any sentence the client itself produces for a person follows the Google developer
   documentation style guide: second person, active voice, present tense, plain words,
   sentence case, no "please".

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
the list of test names against the seven points, and a table of contract route against
client function.

## Stop rule

Stop when the seven points have passing tests, the note and the report are written.
Stop early with a blocked report if the contract leaves a shape open (quote the line):
do not fill it in.

Write `directives/reports/a_marketplace_client.md` from
`directives/reports/_TEMPLATE.md`; under "Needs from others" give Lane D the seam and
Lane B every place the contract was unclear. Questions for Johnny written out in full,
recommended answer first. After each meaningful step append one line under Progress:
"done: X. next: Y."

## Progress
done: contract read. next: the marketplace store against a fake transport.
done: the store, the eight tests, and the note for Lane D are written. next: the report.
done: the report is written. next: none.
