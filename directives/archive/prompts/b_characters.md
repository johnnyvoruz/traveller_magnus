# Agent B — Characters on the server: the catalogue, the live room, sharing by link

Issued 2026-10-07 by the orchestrator. **This replaces everything else you hold.**
Johnny: *"hold off on a definitive ice… I want to essentially rebuild that whole planetary
generator anyway… let's focus full speed ahead on getting character MVP done in the fewest
amount of turns as possible."* So `b_hardening_2.md` and `b_liquid_policy_2.md` are
**parked**: if you have begun either, stop at a green point and say in two lines where
it stands. v6 stays staged and unreleased; the hardening stays on disk, unpushed; touch
neither.

## Read `directives/character_mvp.md` first. It is the contract.

It fixes the model (a D1 catalogue, one Durable Object per character holding the boxes
and the open sockets, access by grant, sharing by a claimed link, a pregen as a
duplicate), the routes, and the live protocol. You build all of the server side of it,
in this order:

1. **`packages/shared/src/schemas/character.ts`, first, within the hour.** `Character`,
   the role, the list item, the doc (`fields`, `revs`, `seq`), the invite as the owner
   sees it, the access row, every request and response body in the route table, and the
   live messages both ways as discriminated unions; the box limits; `CHARACTER_SCHEMA =
   'mgt2e_character@1'`. Export from the package's index. Tests beside the campaign
   schema tests. Then write `findings/characters_contract_ready.md` (the file's path,
   the exported names, anything where you departed from the spec and why): Agents A and
   E are waiting on exactly that note. Nobody else edits that schema file.
2. **The D1 migration** (the next number): `characters`, `character_access`,
   `character_invites`, with the indexes the routes need. Drizzle schema beside the
   others.
3. **`CharacterRoom`**, the Durable Object: the `fields` table and `seq`; `set` applied
   in arrival order with a new `rev`; the names checked against the rules file's 420
   (say how the Worker reads that list, and what it costs the bundle), the value's type
   against the widget's (`text` a string, `checkbox` a boolean), the limits; the
   WebSocket hibernation API for the open pages; `hello`, `set`, `ack`, `no`, `focus`,
   `who`, `meta`, `gone` as the spec has them; presence held in the sockets' attachments
   and never stored; a duplicate (`from`) as one read of the source room and one write.
4. **The routes** in the spec's table, under the existing session auth, origin check and
   error envelope. A character one has no access to is a 404, never a 403. The claim
   route is rate-limited as sign-in is. An invite's token is random, returned once,
   stored as a hash, single use, 14 days, revocable. Removing someone's access, deleting
   the character or handing over ownership reaches the open pages (`gone`, or a fresh
   `hello` with the new role).
5. **`wrangler.toml`:** the new binding and its migration tag for a SQLite-backed class.
   List the exact lines; Johnny deploys by pushing, and applies the D1 migration himself:
   put the one command in your report.
6. **`directives/data_model.md` and `directives/api.md`.**

## Tests

Unit, with the fakes the campaign tests use and a fake pair of sockets: two editors, a
set by one reaching the other with the new rev; two sets to one box in order, the later
standing for both; a bad name and a wrong type refused to the sender only; presence on
focus, blur and close; an editor removed while connected; delete while connected; a
duplicate; an invite claimed once, twice, expired, revoked, by the owner themselves;
ownership handed over; a stranger getting 404 on every route and on the socket. The
`tests/api` suite with `RUN_API_TESTS=1` on **your own port and state directory** (a
stuck process holds 8787): one round trip with two cookies and a live socket.
`npm test`, `npm run check`, `npx tsc --noEmit -p apps/api`, pasted.

## Not yours, and not now

`apps/web`; the campaign record's `sheet` reference (Agent D writes it through the
existing record save; the server already stores `sheet` as given); portraits; the
marketplace; a dice roller; new sign-in providers. No deploy, no production call, no git. Stop
and report, with the two lines on the parked steps first.
