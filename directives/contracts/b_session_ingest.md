# Session ingest contract

**Status:** built, 2026-10-18. Johnny 20:24 and 20:27 are written in as decided. SI1 built the server: migration 0023, the token routes, the proposal tables in the Durable Object, the agent routes, and `POST /mcp`. The store waits until P3. The screens wait until P6.

Source: `directives/spec_session_ingest.md` §2.1, §2.2, §2.4, §2.5, and the note at the top of that file (the MCP endpoint is in phase 1). The zod outline is appendix A of `directives/reports/x_session_ingest.md`. The decisions are `directives/decisions.md`, 2026-10-17 20:24 and 20:27.

Envelope, as `directives/api.md`: `{ ok: true, data }` or `{ ok: false, error: { code, message, details? } }`.

## Decided

Johnny, 2026-10-17 20:24: the referee's own agent records, transcribes and extracts. We take only the proposal batch, over MCP. Phase 6 (transcription by us) is dropped. Question 27 is the referee.

Johnny, 2026-10-17 20:27, questions 26 and 28 to 36, every recommendation:

- Phase 1 is tokens, the MCP endpoint and the routes under it, proposals, and the review screen. SI0 (this paper) and SI5 (Lane Z) are now. The server is after P2b. The store is after P3. The screens are after P6.
- Nothing an agent sends is applied without the referee. That is a rule, not a setting. No scope and no MCP tool applies a change.
- A proposal keeps at most three quotes, each at most 300 characters. A pending batch lasts 30 days. A reviewed batch lasts 90. We never store audio or a transcript.
- Character sheets are phase 4. Players run the skill in phase 5, not before. Until then the actor is the referee only.
- The skill the referee's agent runs is the tracked `skill/SKILL.md`, with `skill/references/` and the example batch `skill/example_batch.json` beside it (ZF1b, 2026-10-18).
- The words in the app are "Proposals", "Agent access", "Bring in a session", and "your AI agent". "SI" is not in app copy.
- OAuth waits until a referee asks (phase 3). Phase 1 authenticates with the bearer token.
- Set a billing alert of $20 a month before SI1 ships. The alert does not cap spend. The kill switch does.
- A token is bound to one campaign by default. "All my campaigns" is a tick, and that tick is the only way `universeId` is null.
- `campaign:read` returns referee-only text. It is the referee's own agent reading the referee's campaign. The players projection is not this route.

The spec's §2.3 heading still says the MCP server is phase 2. Johnny's 20:24 note and the 20:27 decision move that endpoint into phase 1, on the same functions as the REST routes. The REST routes stay.

## The token table

Checked against the installed Better Auth, `node_modules/better-auth` 1.7.7 (the version `apps/web/package.json` pins). `dist/plugins` has no `api-key` directory. `package.json` does not export an API-key plugin. `@better-auth/api-key` is not a dependency of `apps/api` or `apps/web`. The four checks in the spec §2.1 therefore fail: there is no plugin `permissions` map, no metadata read on verify, no hashed key or `Authorization` header setting, and no CLI table to land in `auth-schema.ts`. The hand-written table below is the design. The routes, scopes, limits, log line and kill switch are the ones in this file either way.

Tokens are account-level rows in D1, not rows in a universe Durable Object. Migration `0023_access_tokens.sql`, hand-written. 0022 is `universe_summaries`, so the token tables took the next free number. `platform_flags` is in the same migration.

```sql
CREATE TABLE access_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id),
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL,
  universe_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE INDEX access_tokens_user_id ON access_tokens(user_id);
CREATE TABLE platform_flags (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
```

- `id` is `at_` plus a uuid. `name` is 1 to 60 characters. `prefix` is the first 12 characters of the token, for the list. `token_hash` is the SHA-256 hex of the whole token. `scopes` is a JSON array.
- The token text is `tv_pat_` plus 43 characters of base64url from 32 random bytes. The create response shows it once. No later read returns it.
- `universe_id` null means every universe this account owns. Create sends null only for the "all my campaigns" tick. Omitting `universeId` is 400, not "all".
- Scopes in phase 1: `campaign:read`, `proposals:write`. No scope applies changes. `characters:read` and `characters:propose` are phase 4. `notes:propose` is phase 5.
- Expiry defaults to 90 days and is at most 365. A token past `expires_at`, a revoked token, and an unknown token answer the same 401.
- Revoke sets `revoked_at`. The next request is 401. There is no cache between the request and the row.
- An account holds 10 live tokens. A live token has `revoked_at` null and `expires_at` in the future. The list still shows tokens revoked in the last 30 days, without the secret.
- Per token, on the Worker, the `publicLimited` pattern, per isolate: 120 reads a minute and 10 submits a minute. Per universe, on the Durable Object: 10 submits a minute.
- `requireAgent(c, scope)` in `apps/api/src/auth/tokens.ts`. A cookie session of the owner passes. `Authorization: Bearer tv_pat_…` is hashed and checked for revoked, expired, banned, the kill switch, and the scope. It yields the session user plus `{ via: 'token', tokenId, universeId }`. `requireUser` keeps reading only the cookie, so a route that does not call `requireAgent` does not accept a token.
- `ownedUniverse` takes an optional actor. A token bound to one universe answers 404 on any other universe, the same body as a missing universe.
- A bearer request with no `Origin` passes the existing Origin check. `POST /mcp` accepts no `Origin`, or an `Origin` equal to this site. Any other `Origin` is 403.
- The request log gains `via` (`cookie` or `token`) and `tokenId`. The token text is never in a log line, a URL, or an error body.
- `platform_flags.agent_access`: only a row with value `on` is on. No table, no row, any other value, and a read error are off, so a deploy does not turn token minting or `POST /mcp` on. `off` and the default both make every token request and every MCP request answer 503. Cookie routes are unchanged. The flag is read once per isolate per 30 seconds. Admin `POST /api/admin/flags` is audit logged. A one-line `wrangler d1 execute` belongs in the runbook.

## Routes

`agent(scope)` means a cookie session of the owner, or a token with that scope whose universe binding allows `:id`. `owner` and `user` are cookie only.

| Method | Path | Auth | Answer |
|---|---|---|---|
| GET | `/api/tokens` | user | 200 `AccessTokenList`. Live tokens, and tokens revoked in the last 30 days. Never the token text. |
| POST | `/api/tokens` | user | 201 `AccessTokenCreated`. The token text is in this body only. |
| DELETE | `/api/tokens/:id` | user | 200. Revokes. The same answer when it is already revoked. Another account's id is 404. |
| GET | `/api/agent/campaigns` | agent(`campaign:read`) | 200 `AgentCampaignList`. A bound token lists that one universe. |
| GET | `/api/universes/:id/campaign/index` | agent(`campaign:read`) | 200 `CampaignIndex`. Live rows, including `visibility: 'referee'`. The journal list is the last 50 by sequence. `cache-control: private, no-store`. |
| GET | `/api/universes/:id/campaign/records?ids=` | agent(`campaign:read`) | 200 `CampaignRecordsRead`: up to 50 full records and every live link that touches one of them. An unknown id is omitted. |
| GET | `/api/universes/:id/campaign/search?q=&type=&limit=` | agent(`campaign:read`) | 200 `CampaignSearchPage`. `q` is 2 to 40 characters, matched without case against name, tags and summary. `limit` is at most 20. No FTS table. The Durable Object uses `LIKE`, and the stored pattern is at most 50 bytes. |
| GET | `/api/universes/:id/campaign?after=&limit=` | agent(`campaign:read`) | The owner's campaign read, already built. A token with `campaign:read` may call it and receives the owner's full view. |
| POST | `/api/universes/:id/campaign/proposals` | agent(`proposals:write`) | 201 `{ batch }`. Each proposal has its minted id. A create also has its minted record, link or entry id. |
| GET | `/api/universes/:id/campaign/proposals?state=` | agent(`campaign:read`) | 200 `ProposalBatchList`. `state` is `open` (default) or `reviewed`. Counts only. |
| GET | `/api/universes/:id/campaign/proposals/:batchId` | agent(`campaign:read`) | 200 `ProposalBatch`, including each proposal's `state`, `targetId` and `appliedRev`, and `reviewUrl`. |
| POST | `/api/universes/:id/campaign/proposals/:batchId/resolve` | owner | 200 `ProposalResolveResult`. At most 50 decisions. |
| DELETE | `/api/universes/:id/campaign/proposals/:batchId` | owner | 200. Deletes the batch, its proposals and its quotes. |
| POST | `/mcp` | bearer token | Phase 1. One Streamable HTTP endpoint. JSON or SSE. No session. `GET` and `DELETE` are 405. |
| GET | `/api/admin/flags` | admin | 200. The flag row, or absent. |
| POST | `/api/admin/flags` | admin | 200 `PlatformFlagSet`. Audit logged. |

`POST /mcp` is the same Worker, not a second Worker and not `McpAgent`. SI1 pins `@modelcontextprotocol/server` exactly in `apps/api/package.json` and mounts `app.all('/mcp', …)`. That dependency is not added by this paper. Tools, one to one with the routes, and no tool that applies, resolves, deletes, or writes visibility, settings, the party, images, sheets or hexes:

| Tool | Route |
|---|---|
| `list_campaigns` | `GET /api/agent/campaigns` |
| `read_campaign_index` | `GET …/campaign/index` |
| `read_records` | `GET …/campaign/records` |
| `search_records` | `GET …/campaign/search` |
| `submit_proposals` | `POST …/campaign/proposals` |
| `read_proposal_batch` | `GET …/campaign/proposals/:batchId` |

Read tools set `readOnlyHint: true`. `submit_proposals` sets `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`. A tool returns `structuredContent` for its output schema and the same JSON as text. A refusal is `isError: true` with this file's error envelope. `read_proposal_batch` on an unreviewed batch returns every proposal `pending` and `reviewUrl`. The tool description tells the agent to stop there.

## Proposals

Stored in the universe Durable Object. `apps/api/src/universe/proposals.ts` installs the tables with `CREATE TABLE IF NOT EXISTS`. No campaign column changes. `schemaVersion` of the campaign document stays `'3'`. The batch document's own `schemaVersion` is `1`.

```sql
CREATE TABLE IF NOT EXISTS proposal_batches (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  body_hash TEXT NOT NULL,
  token_id TEXT,
  source TEXT NOT NULL,
  state TEXT NOT NULL,
  pending INTEGER NOT NULL,
  accepted INTEGER NOT NULL,
  dropped INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS proposal_batches_state ON proposal_batches(state, created_at);
CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  ref TEXT,
  op TEXT NOT NULL,
  target_id TEXT,
  base_rev INTEGER,
  payload TEXT NOT NULL,
  evidence TEXT NOT NULL,
  state TEXT NOT NULL,
  decided_at TEXT,
  applied_rev INTEGER,
  note TEXT
);
CREATE INDEX IF NOT EXISTS proposals_batch ON proposals(batch_id, ordinal);
```

- Batch id `pb_` plus a ulid. Proposal id `pp_` plus a ulid. `state` on a batch is `open`, `reviewed`, or `expired`. `state` on a proposal is `pending`, `accepted`, `dropped`, or `conflict`.
- `token_id` is null when a cookie session submitted the batch. `source` is JSON `{ kind, label, realDate, durationSeconds, tool }`. `kind` is `transcript`, `notes`, or `other`.
- A batch is `open` while any proposal is `pending`, and `reviewed` when none is. On the next list or read, a batch with a pending proposal older than 30 days becomes `expired` and its pending rows are dropped. No alarm. Reviewed and expired batches are deleted 90 days after `reviewed_at` or `expires_at`, in that same sweep, at most 100 rows a call. Deleting the universe deletes the object.
- The only transcript text stored is `evidence[].quote` (at most three, at most 300 characters) and `source.label`. Never audio, never a transcript file.
- Submit mints `cr_`, `cl_` and `cj_` ids for creates, stores them on `target_id`, and resolves a `ref` to an earlier create in the same batch. An accept then sends a create with a known id and `baseRev` 0.
- Every stored row has `visibility: 'referee'`, whatever the body said. A journal proposal stores `author: 'referee'`.
- The same `idempotencyKey` and the same body hash answer 200 and the stored batch. The same key and a different hash answer 409. A second identical submit does not insert a second batch.
- Ops in phase 1: `record.create`, `record.update`, `link.create`, `journal.create`, `clock.set`, `track.append`, `cargo.append`, `passengers.append`, `ledger.append`, `question`. No `sheet.set` until phase 4.
- The field on a stored proposal is `targetId` (column `target_id`). The batch read returns that name. `appliedId` is not a field.
- For SI1: the check that an update changes something is a `superRefine` on `Proposal`, not a refine on the update option. A zod 3 discriminated union takes plain objects only. The message stays `nothing to change` and the path stays `set`.

`POST …/resolve` accepts `{ decisions: [{ proposalId, action: 'accept' | 'drop', change?, baseRev? }] }`. `change`, when present, is the proposal's own shape after the referee's edit. Absent means as proposed. Accepts become one `applyCampaignChanges`. A conflict stays `pending` and comes back in `conflicts` with `current`. The call spends the referee's mutation budget once.

## Budget

`allowMutation` stays 120 non-read calls a minute per universe for the referee's own writes.

- `POST …/campaign/proposals` uses its own counter, 10 a minute per universe, and does not call `allowMutation`. The same 10 a minute is counted per token on the Worker.
- `POST …/resolve` calls `allowMutation` once, for any number of decisions up to 50.
- `DELETE` of a batch calls `allowMutation` once.
- A GET of proposals, the index, records, or search spends neither counter. It does spend the token's 120 reads a minute.

An 11th submit in a minute, by token or by universe, is 429, and the owner's `PATCH …/campaign/changes` in that same minute still succeeds.

## Errors

| Status | Code | When | Message |
|---|---|---|---|
| 401 | `unauthenticated` | a cookie route, and there is no session | Sign in to continue. |
| 401 | `token_invalid` | the bearer is missing, unknown, revoked, or expired. Those four answer one body. | That token is not valid. |
| 403 | `scope_missing` | the token is live and does not have the route's scope | That token cannot do that. |
| 403 | `forbidden` | `POST /mcp` and `Origin` is present and is not this site | That request was blocked. Reload the page and try again. |
| 404 | `not_found` | the universe is missing, deleted, or outside the token's binding; the batch is missing or another owner's | No such universe. |
| 400 | `validation` | a bad body, a `ref` that names nothing in the batch, an id that is not live in this universe, `q` outside 2 to 40 characters | Invalid request. |
| 400 | `too_large` | an eleventh live token | An account holds at most ten tokens. |
| 400 | `too_large` | 201 proposals in one batch | A batch holds at most 200 proposals. |
| 400 | `too_large` | the batch body is over 256 KB | A batch is at most 256 KB. |
| 400 | `too_large` | a 21st open batch, or 2,001 pending proposals in the universe | Review or drop some proposals first. |
| 400 | `too_large` | a fourth quote, a quote over 300 characters, or a question over 1,000 characters | A proposal keeps at most three quotes of 300 characters, and a question is at most 1,000 characters. |
| 400 | `too_large` | 51 decisions | Resolve at most 50 proposals at a time. |
| 409 | `idempotency_conflict` | the same `idempotencyKey` and a different body hash | That key was already used for a different batch. |
| 429 | `rate_limited` | the 11th submit in a minute, or the 121st read in a minute. `retry-after: 60`. | Too many requests. |
| 503 | `agents_paused` | `agent_access` is not the row `on` (missing table, missing row, any other value, or a read error). Token routes and `/mcp` (every method) only. | Agent access is paused. |
| 503 | `tokens_unavailable` | migration 0023 is not applied, on a token route or a bearer request | Agent access is not available yet. |
| 503 | `proposals_unavailable` | the Durable Object has no proposal tables, on a proposal route | Proposals are not available yet. |

An id that is not in this universe and an id that is missing answer the same 400 `validation` body. An unknown batch and another owner's batch answer the same 404 body.

## Guards

`PROPOSAL_LIMITS` in `packages/shared/src/schemas/proposals.ts`. Each number is a guard.

| Key | Value | Sentence |
|---|---|---|
| `perBatch` | 200 | A batch holds at most 200 proposals. |
| `batchBytes` | 256000 | A batch is at most 256 KB. |
| `evidence` | 3 | A proposal keeps at most three quotes. |
| `quote` | 300 | A quote is at most 300 characters. |
| `question` | 1000 | A question is at most 1,000 characters. |
| `openBatches` | 20 | Review or drop some proposals first. |
| `pendingPerUniverse` | 2000 | Review or drop some proposals first. |
| `decisions` | 50 | Resolve at most 50 proposals at a time. |

The 10-token sentence and the rate-limit sentence are in the error table. They are not fields of `PROPOSAL_LIMITS`.

## Schema exports

Lane Z writes `packages/shared/src/schemas/proposals.ts` in SI5, zod 3 style, as appendix A. This paper does not add the file. The export list SI1 consumes:

`PROPOSAL_LIMITS`, `Evidence`, `RecordDraft`, `RecordPatch`, `RecordAppend`, `EntryDraft`, `Proposal`, `ProposalSource`, `ProposalBatchSubmit`, `ProposalState`, `StoredProposal`, `ProposalBatch`, `ProposalBatchList`, `ProposalDecision`, `ProposalResolve`, `ProposalResolveResult`, `CampaignIndex`, `CampaignSearchPage`, `AgentCampaignList`, `ACCESS_SCOPES`, `AccessScope`, `AccessTokenCreate`, `AccessTokenRow`, `AccessTokenCreated`, `AccessTokenList`, `PlatformFlagSet`.

`CampaignRecordsRead` is `{ records, links }` from the campaign schema. It needs no new object.

`AccessTokenCreate.universeId` stays `string | null` as in the appendix. Null is valid only as the all-campaigns tick. The server rejects a missing field before that schema's null default could mean "all".

## Before 0023, and either order

0023 is the D1 token tables. The proposal tables are Durable Object statements, not a D1 migration. Either may land first. Neither statement depends on the other.

| Caller | 0023 absent | Proposal tables absent | Both present |
|---|---|---|---|
| GET, POST, DELETE `/api/tokens` | 503 `tokens_unavailable` | Those routes use D1 only. They answer as in the routes table. | As in the routes table. |
| A bearer token on any agent route | 503 `tokens_unavailable` | Once 0023 is in, a proposal route is 503 `proposals_unavailable`. An index, records, search, or owner campaign read does not need the proposal tables. | As in the routes table. |
| Cookie owner, proposal write or read | 503 `proposals_unavailable` when the tables are absent. 0023 is not required. | 503 `proposals_unavailable` | As in the routes table. |
| Cookie owner, today's campaign read and write | Unchanged. | Unchanged. | Unchanged. A proposal submit does not spend `allowMutation`. |
| `POST /mcp` | 503 `tokens_unavailable` until tokens can be checked. | A tool that only reads the campaign answers. `submit_proposals` and `read_proposal_batch` are 503 `proposals_unavailable`. | As in the routes table. |
| `platform_flags` missing, or no `agent_access` row | Off. Token routes and `/mcp` answer 503 `agents_paused`. Cookie routes stay as they are. | Same. | Only `value = 'on'` allows tokens and MCP. |

A Worker that does not register the routes never calls the tables. A request to an unregistered path is today's 404.

## What this paper does not build

No screen and no store. The $20 billing alert is Johnny's, in the Cloudflare dashboard. The alert does not cap spend. The kill switch does. SI1 built the server this file describes. The migration file is `0023_access_tokens.sql`.
