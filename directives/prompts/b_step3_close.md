# Agent B — Builder step 3, the close: four contract changes Agent D's screens need

Issued 2026-10-10 by the orchestrator. Common rules: `directives/swarm_restart.md`.
Accepted from your step 3 report: referee sectors and their routes, the hand document
(`kind: 'hand'`), the empty blank system, `findings/builder_isolation.md`. Agent D has
built the step 3 screens on Agent A's real store and found four things the contract
cannot do. Rulings 4, 5 and 6 below are from `prompts/d_restart_2026-10-09.md`.

Nothing here may depend on what an engine produces. No rule is checked. Write the shared
contract first, then one ready note, `findings/builder_step3_close_ready.md`, with the
exact shapes, because D reads only that.

## 1. A world that orbits two stars together (ruling 4)

Today a body's `parentId` is one star or one world (`packages/shared/src/schemas/hand.ts`).
D's "orbits" picker has one entry for each pair of paired stars, and it cannot be stored.
Make the document able to say "this body orbits these two stars together". Choose the
shape and say why; conditions: a document stored today reads and writes exactly as
before; a pair is only two stars that are paired in the document; removing or re-pairing
one of the two is refused in words or handled, and you say which; `handWalk` gives the
dossier and the orbit walk what it can and leaves the rest absent, never invented.

## 2. "Design by hand" on a charted system (ruling 5)

`POST /:id/hexes/:sector/:local/design` refuses Regina: an untouched chart hex has no
row, so there is no rev to send. Accept `baseRev: 0` for a hex with no row and a chart
tree; Keep makes it the referee's; "Restore to the chart" still works; Undo is the hex
revert as now. A test over a published chart hex (the sqlite test if a local catalogue
has no chart; say which).

## 3. Several adds, and changes to a just-added body, in one draft

Today the server takes one new body per Keep and refuses a change to a body it has not
stored, so D stores every add and remove at once with its own Undo. That is against
Johnny's ruling of 2026-10-08 (a system is a draft you Keep; one request with a `rev`).
Make draft and Keep accept, in one set of changes: any number of added stars and bodies,
changes to their fields, re-parenting and reordering among them, and removals, in the
order sent. Say how a body that does not exist yet is named in a change (an id the
client makes, or one the draft answer hands back) and keep it stable through to Keep.

## 4. "Blank system" without an edition (ruling 6)

D still sends an edition and star fields that you ignore. The blank route takes neither;
old clients that still send them are not refused.

## Also, say which (report only)

- Hex 0110 in Agent A's pass: a Kept name "Orbit Edit" became the system's title, and
  the mainworld body is still named Naawan. On a generated system, which stored fields
  does the form's name field write, and is the mainworld's own name a separate field?
- Your question on Roll in hand mode is with Johnny. Until he answers, Roll on a hand
  field stays as it is ("Nothing rolls this field.").

## Check and report

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, and
`RUN_API_TESTS=1` for `builder_form`, `builder_sector` and any new file, on your own
ports, pasted. The isolation test still passes. What you built, stubbed, skipped; every
question written out. The parked build-hardening files stay parked. No git, no deploy.
Stop and report.

## Added 2026-10-10, Johnny's rulings (do these too)

5. **A star can be removed with what orbits it.** Removing a star takes every body that
   orbits it (its worlds, their moons, and any star paired under it), as removing a
   world takes its moons. It is one change in the draft like any other (item 3), so
   nothing is gone until Keep, and the hex revert undoes it. The draft answer says how
   many bodies go, so the screen can say it before the referee confirms.
6. **Hand and generated go both ways.** Johnny: a referee who designed by hand may want
   to generate the system again, and one who generated may want to tweak by hand. So:
   "Design by hand" on a generated or charted system stays as built; and **generate
   works on a hex that holds a hand-made system** (`filledToo`, a roll number, preview
   first), replacing the hand document with a generated tree as one rev that the hex
   revert undoes. Test both directions in a row on one hex: generate, design by hand,
   edit, Keep, generate again, Undo back to the hand version. Nothing says "one-way".
7. **Adds and removes wait for Keep** (confirms item 3). **A world that has moons cannot
   be given to another world**: refused in words, as now. **Roll in hand mode rolls
   nothing**, as now.
