# Builder, step 1: a system can be generated, removed and restored (one hex and many)

Issued 2026-10-08 by the orchestrator. The three audits and the design are accepted:
`findings/builder_server_audit.md` (B), `findings/builder_web_audit.md` (A),
`findings/builder_system_design.md` with `kb_*` (D). Read all three, whichever agent you
are: they are the spec for this step, and where they disagree the audits win over the
design and the code wins over both (say where). Common rules:
`directives/swarm_restart.md`.

**This step is create, read and delete. Editing a system in place is step 2**, because
it waits on Johnny's answers (a draft you Keep or save-as-you-go; the seven "needs the
rule" slots). Build nothing of the editor now, but leave its places as the design has
them.

## Defaults taken until Johnny says otherwise (D's recommended answers)

- **Build is a switch**, off by default. Off, the app is exactly today's.
- **"Roll again" may give a different system for the same hex**, by a roll number kept
  with the system; roll 0 is what the hex generates today.
- **Generation settings are the universe's**, set once, shown on the Generate sheet.
- **Two generators first: the full-system ones** (top down, bottom up), and only for the
  engines whose output the dossier can walk (A's audit: Mongoose and Architect of
  Worlds). The others are listed as "not yet" on the sheet, not hidden.
- **Generating over many hexes leaves the filled ones alone**, with "Regenerate them too"
  on the sheet.
- **A system removed from a pinned map** shows as a faint dashed outline while Build is
  on, and not at all otherwise.
- **No rule is checked.** Nothing from memory: every "needs the rule" slot stays empty.

## The seam for the generator rebuild (binding on all three of you)

Johnny will rebuild the planetary generator. So: the server calls `generateHex` and
stores the envelope it returns without looking inside; the browser reads a system only
through the dossier's existing walk (`pickSystem`, `mainworldProfile`, worlds and
moons); **nothing new in this step reads an engine's tree shape directly.**

## Agent B: the server

From your own audit's list for system CRUD, in the order it gives. In outline:
1. **The contract first**, in `packages/shared` (a new schema file beside the campaign's):
   the hex row as the browser sees it (hex key, state: truth, override, removed, own;
   the tree's hash; the roll number; `rev`), the changes a browser may send, the page,
   the generate request (hex keys, engine, generator, roll, the "filled too" switch) and
   its result, the job and its progress. Then `findings/builder_contract_ready.md`, as
   you did for characters. Agents A and D wait on that note.
2. **The universe Durable Object serves hexes:** read a page of rows; generate one hex
   inline (store the object, write the pointer row with its `base_hash`); remove a hex
   (back to the truth on a pinned map; to empty on an own map; "removed" as its own
   state on a pinned map); restore; each with `rev`, one write, and enough kept that
   Undo is exact. The lost-save lesson applies: say how a second change during a first
   is ordered.
3. **Many hexes:** a job on the generate queue in the batches your audit names, with
   progress the browser can read and a Stop that leaves what is done; a copy kept first
   so one Undo restores the lot (the plan's "snapshot before bulk actions", the smallest
   form of it).
4. A blank universe of one's own (`truthVersion: null`) if your audit says it is one
   small step; otherwise leave it and say so.
5. `data_model.md` and `api.md` brought to what is built. Tests as for characters: unit
   with the fakes, and one round trip on your own port.
No deploy, no production call. `wrangler.toml` changes listed line by line.

## Agent A: the browser's store

`apps/web/src/builder/`, new, the twelve functions of your audit's section 3 as far as
this step needs them (load the rows for what is in view, the state of a hex, generate
one, generate many with progress and stop, remove, restore, undo), in the pattern of
`campaign/` **with the in-flight queue done right from the start**. The map must be able
to ask "what is at this hex in this universe" without a second fetch per hex: say how
the truth's sector index and the universe's rows are laid over each other. A subsector
address (D asked). Confirm the keys D proposes are free (B, S, G, E, F2, Delete,
Alt+arrows) or say which are taken. Tested against a fake transport. Import B's contract
when its note lands; until then write to the shapes in your audit.

## Agent D: the screens

1. **Sign-in first, a small one:** the sign-in card offers Discord and Google beside X
   (`findings/signin_setup.md`, the part addressed to you; `account/session.ts`'s
   `signIn` takes the provider). A provider that is not configured on the server is not
   offered: say how the card knows (ask B for a route if there is none).
2. **Build, as designed:** the switch on the rail; selecting an empty hex and many hexes
   while it is on; the pane as "what is selected" with its line to climb; the bar of
   build acts, command first, the same names in the omnibox and the right-click menu;
   Generate for one hex with its preview and for many with the counted bar and Stop;
   "Restore to the chart" and "Remove from my map" with the Undo toast; the dashed
   outline. Against A's store; a thin stand-in behind one seam where it is not there
   yet, deleted when it is.
3. The editor's places are present and inert ("Edit" is in the bar, disabled, with a
   word saying it is next).
Column, half, full, 520 px; keyboard; reduced motion; contrast pairs. A browser pass on
your own ports: generate one, roll again, generate a block of twelve with three already
filled, stop one mid-way, remove, restore, undo each. `kb_built_*` beside the mockups.

## Agents C and E

Free unless handed something else.

## Everyone

Gates pasted. What you built, stubbed, skipped; your questions. Stop and report.

## Johnny's answers (2026-10-08): "all your recommendations sound good"

Every default above stands as a ruling: Build is a switch; "Roll again" may differ, by a
roll number; generation settings are the universe's; the two full-system generators
first, on the engines the dossier can walk; filled hexes are left alone unless
"Regenerate them too"; a removed system is a dashed outline while Build is on; **no rule
is checked, every value is the referee's to type** (R1 to R7 stay empty slots).

**And one more, in his words: "the system CRUD shouldn't work like the Google Docs
functionality that we were going for with the character sheet and other data types."**
So the Builder is **not live**: no socket, no presence, no box-by-box sync between two
people. One person edits a system as **a draft, and Keeps it** (step 2); a save is one
request with a `rev`, and a newer copy on the server is a conflict shown to the person,
as the campaign's saves are. Nothing in this step or the next opens a room for a hex.
