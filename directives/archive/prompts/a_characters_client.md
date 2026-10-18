# Agent A — Characters in the browser, with no screen: the list, one open sheet, the live connection

Issued 2026-10-07 by the orchestrator. **This goes ahead of everything else you hold.**
Johnny: *"let's focus full speed ahead on getting character MVP done in the fewest amount
of turns as possible."*

- **`a_nav_drag.md`:** if you have not started it, leave it. If you are in it, stop at
  the nearest green point (`npm test`, `npm run typecheck` passing), say in three lines
  what is done and what is not, and leave the orbit files as they are; nobody else will
  touch them. It resumes after this step.
- **`a_live_sheet_design.md` is withdrawn.** There is no paper round: the design is
  `directives/character_mvp.md`.

## Read `directives/character_mvp.md` first. It is the contract.

Agent B is building the server and writes the shared schemas first
(`packages/shared/src/schemas/character.ts`; a note lands at
`findings/characters_contract_ready.md`). Import from it the moment it exists; until
then write to the shapes in the spec. Do not edit that file: say what you need.

## Build: `apps/web/src/characters/`, new, in the store's own patterns

1. **`store.ts`: the list.** `characters` (mine and shared with me, with my role and the
   owner's name), `loadCharacters()`, `createCharacter(name, from?)`,
   `renameCharacter`, `deleteCharacter` (with the app's Undo toast only if the server
   can restore; if not, a confirm in the app's own pattern, never a native dialog),
   signed out: empty and silent.
2. **`open.ts`: one open character.** `openCharacter(id)` returns a reactive handle:
   `character`, `role`, `fields` (box name to value), `who` (the others here and the box
   each is in), `status` (`connecting | live | offline | gone`), and `setField(name,
   value)`, `focusField(name | null)`, `close()`. Several may be open at once (a person's
   page and the Characters screen). The same handle is returned for the same id.
3. **`live.ts`: the connection.** The socket to `/api/characters/:id/live`; `hello` as
   the truth; a `set` applied at once locally and sent with a client id; `ack` and `no`
   (a refused set is undone and the reason surfaced); another person's `set` applied to
   the box **unless that box has an unsent set of mine**; presence from `who`; `meta`;
   `gone`. Reconnect with backoff and jitter, the unsent sets replayed in order, a page
   hidden for a while reconnecting on return. With no socket (blocked, or the upgrade
   fails twice) it falls back to `POST …/fields` and a reload of the doc on focus and
   every few seconds while visible, and `status` says so. The transport is injected, as
   the campaign store's is, so every line of this runs under a fake socket.
4. **`share.ts`:** `makeInvite(id)`, `listInvites(id)`, `revokeInvite`, `listAccess(id)`,
   `removeAccess`, `giveOwnership`, `claim(token)`.
5. **The sheet document for Agent D's component:** one small adapter that turns a handle
   into exactly what D's sheet takes (a document, `mayEdit`, the presence map of box to
   `{ name, colour }`) and its events into `setField` and `focusField`. Read
   `prompts/d_character_sheet.md` ("the bar for live is Google Sheets") for the three
   rules the component keeps, and D's component if it is on disk. Do not edit
   `workspace/`.

## Tests (`tests/web/characters_*.test.js`)

The list; two handles on one id; a set, its ack, a refusal undone; another person's set
under my unsent set left alone, then applied after mine is acked; presence in and out;
`meta`; `gone`; a dropped socket with three unsent sets replayed in order; the fallback
path; signed out. `npm test`, `npm run check`, `npm run typecheck`, `npm run build`,
pasted. End the report with **the signatures D and E call, in one block**.

Not yours: `apps/api`, `packages/shared/src/schemas/character.ts`, `workspace/`,
`views/`. No git. Stop and report.
