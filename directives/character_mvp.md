# Character MVP — the one spec

Written 2026-10-07 by the orchestrator. Johnny: *"let's focus full speed ahead on getting
character MVP done in the fewest amount of turns as possible."* So there is no paper
round. This file is the contract; four agents build to it at once. Where it is wrong
against the code, the agent says so in its report and builds the nearest thing that
keeps the contract's shape; nobody stops for a ruling unless a production risk forks.

## What the MVP is (Johnny's words are in `slice_2_campaign.md`, K10/K11, and handoff §190 to §198)

1. **A Character is its own thing**, owned by an account, existing with or without a
   campaign. It carries a name, a summary and the sheet (the 420 boxes of
   `rules/mgt2e_character_sheet_fields.json`).
2. **Either side can own it.** A player makes one and shares it with a referee; or a
   referee makes one and gives a player access. Same sheet, same rights model.
3. **Live, like two people in Google Sheets.** A box committed by one appears for the
   other at once; you see who else is on the sheet and which box they are in; the later
   commit to a box stands.
4. **Pregens.** A referee makes several and hands each out by a link that is claimed by
   signing in.
5. **In a game** a person record can be backed by a Character; the game's own layer
   (place, links, the referee's notes) stays in the game.

**Not in the MVP:** portraits and images on a Character; publishing or copying through
the marketplace; a dice roller (backlog: our own 3D physics dice, there is no Roll20 API); locks on parts of a sheet; a history of a box's past values; a
player seeing anything of a referee's universe; new sign-in providers (it uses whatever
sign-in is switched on); any rule that computes a box (every box is typed).

## The model

- **Catalogue (D1).** `characters` (`id` `ch_<uuid>`, `owner_id`, `name`, `summary`,
  `schema` = `mgt2e_character@1`, stamps, `deleted_at`). `character_access`
  (`character_id`, `user_id`, `role` `owner | editor`, `granted_by`, stamp; the owner has
  a row). `character_invites` (`id`, a **hash** of the token, `character_id`, `role`
  `editor`, `created_by`, `expires_at`, `claimed_by`, `claimed_at`, `revoked_at`).
- **The sheet lives in its own Durable Object, one per character** (`CharacterRoom`,
  SQLite): `fields` (`name`, `value`, `rev`, `updated_by`, `updated_at`) and a `seq`
  counter. It is the live room: it holds the open pages' WebSockets (the hibernation
  API), orders commits, and broadcasts. One Durable Object per document is the same
  rule as one per universe.
- **Every box is one flat field**, keyed by the PDF's own name, as the ship sheet's are.
  The PDF has no repeating structure that is not already named boxes (`Ally Name 1` …),
  so there are no row operations: **the only write is "set this box"**. A text box holds
  a string; a checkbox a boolean; an empty string or `false` removes the row. Names not
  in the rules file are refused. Limits: 2,000 characters a box, 20,000 for
  `History & Background`'s box; say them in the schema.
- **Access is per character, by grant.** Two accounts are connected by nothing else: no
  membership of a universe is needed, and none is built. Owner: everything, including
  rename, delete, make and revoke links, remove an editor. Editor: read and set boxes,
  see who else has access. Anyone else: 404.
- **Sharing is a link.** The owner makes an invite; the link carries a random token
  (stored hashed); whoever opens it signed in and claims it becomes an editor. One claim
  per link. Links expire (14 days) and can be revoked. **A claimed pregen is shared, not
  given** (the referee stays owner; G22's recommended answer, taken until Johnny says
  otherwise); "make them the owner" is one owner-only call, built, behind a control.
- **A pregen is a duplicate.** `POST /api/characters` with `from` copies the name
  (suffixed) and every box into a new character owned by the caller. A referee makes one
  master, duplicates it per seat, and makes a link for each.
- **In a universe.** A person record's `sheet` becomes
  `{ schema: 'mgt2e_character@1', characterId: 'ch_…' }`. The page shows the Character's
  name and sheet live; the record keeps its own place, links, notes and visibility.
  Detaching writes the boxes as they stand into the record's own
  `sheet: { schema, fields }` (the frozen copy, G19) and drops the reference. A person
  may also keep a plain per-record sheet with no Character at all: that is what Agent D
  is building first, and it stays.

## The API (all under the existing session auth and origin checks)

| Call | Does |
|---|---|
| `GET /api/characters` | mine and those shared with me: `{ character, role, ownerName }[]` |
| `POST /api/characters` `{ name, from? }` | create (optionally a duplicate of one I can read) |
| `GET /api/characters/:id` | `{ character, role, doc: { fields, revs, seq } }` |
| `PATCH /api/characters/:id` `{ name?, summary? }` | owner |
| `DELETE /api/characters/:id` | owner; soft; open pages are told and closed |
| `POST /api/characters/:id/fields` `{ sets: [{ field, value }] }` | the same write as the live `set`, for a page with no socket |
| `GET /api/characters/:id/access` | owner and editors: who has access |
| `DELETE /api/characters/:id/access/:userId` | owner; that person's pages are closed |
| `POST /api/characters/:id/owner` `{ userId }` | owner hands ownership to an editor |
| `POST /api/characters/:id/invites` | owner; returns `{ id, url, expiresAt }` once |
| `GET /api/characters/:id/invites`, `DELETE …/invites/:inviteId` | owner; list (never the token) and revoke |
| `POST /api/characters/claim` `{ token }` | signed in; grants editor; returns `{ characterId }` |
| `GET /api/characters/:id/live` | WebSocket upgrade into the character's room |

## The live protocol (JSON text frames; zod schemas in `packages/shared`)

- Server on open: `{ t: 'hello', you: { id, name, colour }, doc: { fields, revs, seq },
  who: [{ id, name, colour, field | null }] }`. `colour` is an index 0 to 7; the browser
  maps it to tokens.
- Client: `{ t: 'set', id, field, value }` → server applies in arrival order, bumps that
  box's `rev`, and sends everyone `{ t: 'set', field, value, rev, seq, by }` (the sender
  also gets `{ t: 'ack', id, rev }`). No `baseRev`, no refusal for being late: the later
  commit stands, as in a spreadsheet. A bad field or value gets `{ t: 'no', id, why }`.
- Client: `{ t: 'focus', field | null }` → everyone gets `{ t: 'who', who: [...] }`.
  Presence is never stored. A closed socket leaves the list.
- Server: `{ t: 'meta', name, summary }` on a rename; `{ t: 'gone', why }` then close, on
  delete or on that person's access being removed.
- Reconnect: the browser reopens with backoff, takes the new `hello` as the truth for
  every box it has no unsent `set` for, and resends its unsent sets in order.

## Who builds what, at once

| Agent | Builds | Prompt |
|---|---|---|
| **B** | The shared schemas (`packages/shared/src/schemas/character.ts`, new), the D1 migration, `CharacterRoom`, every route above, invites and claims, the live socket, `wrangler.toml`, tests, `data_model.md` and `api.md` | `prompts/b_characters.md` |
| **A** | The browser's side with no screen: `apps/web/src/characters/` (the list, one open character, the live connection with reconnect and the unsent queue, presence, the REST fallback), tested against a fake socket | `prompts/a_characters_client.md` |
| **D** | The sheet component (in flight, `prompts/d_character_sheet_2.md`), then its second wiring: a Character through A's store, with presence drawn, on the person's page ("Start a character", "Attach one of mine", "Detach") | `prompts/d_character_sheet_2.md`, then its "Part 2" below |
| **E** | The screens around it: "My characters" (mine, shared with me), new, duplicate, share by link, who has access, the claim page a link opens | `prompts/e_characters_screens.md` |

A and E build against this contract and against B's schema file, which B writes
**first** and says so in a one-line note at `findings/characters_contract_ready.md`, so
the others can import it within the same turn. Until it exists they write to the shapes
in this file.

### D, Part 2 (when the sheet component is reported and A's store is on disk)

On the person's page: no sheet yet shows two choices, "Start a character sheet" (a plain
sheet on this record, as built) and "Make this a Character" (creates one owned by the
signed-in account and attaches it), plus "Attach one of mine" (a picker over A's list).
An attached Character shows its name, the live sheet with presence, who owns it, and
"Detach" (keeps a frozen copy). The rust PC tag as designed. The same component, the
second wiring; nothing inside the sheet changes.

## Order of the pushes (Johnny's)

1. B's server alone, behind no screen: the migration applied in production
   (`wrangler d1 migrations apply`, the command given at the time), the new Durable
   Object class in `wrangler.toml`.
2. A's store, D's sheet, E's screens together.
Both rehearsed. Two pushes, if the parts land together.
