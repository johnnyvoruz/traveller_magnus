# The proposal batch shape and the routes

The authoritative schema is `ProposalBatchSubmit` in `packages/shared` (draft in
`directives/reports/x_session_ingest.md`, appendix A). This page is the agent's reading of it.

## The batch

```json
{
  "format": "voyage-proposals",
  "schemaVersion": 1,
  "idempotencyKey": "<uuid you made once for this session>",
  "source": { "kind": "transcript", "label": "Session 12, 2026-10-16", "realDate": "2026-10-16", "durationSeconds": 14400, "tool": "whisperx" },
  "proposals": [ ... ]
}
```

- At most 200 proposals and 256 KB. Split larger batches; keep a link in the same batch as the
  `ref`s it names.
- `source.label` is what the referee will see as the batch's name in Proposals. At most 120
  characters; keep it short.
- Order matters: a link may name a `ref` only after the `record.create` that made it. A `ref` used
  twice, or a link `ref` that names no earlier create, refuses the whole batch.
- `idempotencyKey` is 8 to 64 characters; a UUID is right.

## A proposal

Every proposal has `op`, `evidence` (1 to 3 of `{ "at": "01:12:40", "quote": "…≤300 chars…",
"speaker": "REFEREE" }`), and may have `ref` (lowercase letters, digits, hyphens, at most 40,
unique in the batch). `ref` is required on `record.create`.

| op | fields | when |
|---|---|---|
| `record.create` | `ref`, `record: { type, kind, name, summary, details, tags, anchor, when?, status? }` | a person, place, business, organization, job, event, item, vessel or note that matched nothing |
| `record.update` | `id`, `baseRev`, `set?: { name, kind, summary, details, tags, anchor, when }`, `append?: { details, tags }` | a fact about an existing record; prefer `append.details` so nothing the referee wrote is lost; at least one of `set` or `append` |
| `link.create` | `link: { from, to, kind, role, notes?, since?, until? }`; `from` and `to` are `{ "id": "cr_…" }` or `{ "ref": "…" }` | a relationship; kinds: member, owns, crew, passenger, commands, ally, rival, enemy, contact, patron, client, target, involved |
| `journal.create` | `entry: { kind, title, body, when, realDate, sequence, anchor }` | the session entry (kind `session`, with `sequence`); a handout or rumor the referee read aloud (kind `handout` or `rumor`, `sequence` null) |
| `clock.set` | `days`, `baseRev` | the campaign date at the end of the session, as the table said it, in the campaign's own day count (read the clock first; add the days the table named) |
| `track.append` | `id` (a vessel), `baseRev`, `leg: { from, to, departs, arrives, mode, note? }` | a movement the table narrated; `departs` and `arrives` are the campaign's day numbers as said; `mode` is docked, orbit, flight or jump |
| `cargo.append` | `id`, `baseRev`, `lots: [{ label, tons, value?, origin?, destination?, note? }]` | cargo taken aboard, as said |
| `passengers.append` | `id`, `baseRev`, `passengers: [{ label, class, note? }]` | passengers taken, as said |
| `ledger.append` | `id`, `baseRev`, `lines: [{ when: { year, day }, amount, memo, kind }]` | money in or out of the ship's ledger, as said; `kind` is income, expense or recurring |
| `question` | `text` (≤ 1,000 characters) | a loose thread, a deferred rule question, anything you could not place |

Anchors: `null`, `{ "kind": "system", "hexKey": "Spinward_Marches/1910", "locationLabel": "Startown" }`
(a `bodyKey` such as `w3` when the table named a body), or `{ "kind": "record", "id": "cr_…" }` (aboard
a ship, inside a place). Use a hex only when the index or a record gives it; never guess a hex from a
world name.

Every object is strict: an unknown key refuses the batch. Things the shape refuses on purpose: `id` on a create, `visibility`, `author`, `images`, `sheet`,
`playerNotes`, `provenance`, `rev`, `createdAt`, `deleted`, settings, the party, hexes. A delete is
not a proposal; tell the referee in a `question`.

## Routes (when no MCP client is present)

All with `Authorization: Bearer $VOYAGE_TOKEN`, JSON bodies, answers in `{ ok, data }` or
`{ ok: false, error: { code, message, details } }`.

| MCP tool | Route |
|---|---|
| `list_campaigns` | `GET https://traveller.voyage/api/agent/campaigns` |
| `read_campaign_index` | `GET https://traveller.voyage/api/universes/<universeId>/campaign/index` |
| `read_records` | `GET https://traveller.voyage/api/universes/<universeId>/campaign/records?ids=<a,b,c>` (≤ 50) |
| `search_records` | `GET https://traveller.voyage/api/universes/<universeId>/campaign/search?q=<2 to 40 chars>&type=<optional>&limit=<≤20>` |
| `submit_proposals` | `POST https://traveller.voyage/api/universes/<universeId>/campaign/proposals` with the batch |
| `read_proposal_batch` | `GET https://traveller.voyage/api/universes/<universeId>/campaign/proposals/<batchId>` |

Limits you will meet: 120 reads a minute, 10 submits a minute per token; `429` carries `retry-after`.
