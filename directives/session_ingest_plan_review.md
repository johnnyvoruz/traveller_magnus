# Session ingest: the plan as it stands, for Johnny to review

Written 2026-10-17, late evening, from `spec_session_ingest.md`, `reports/x_session_ingest.md`,
`contracts/b_session_ingest.md`, `decisions.md` (20:24 and 20:27), the B and Z stream reports, and
the tree. Nothing in this file is new; it is the plan in plain words so you can mark what is wrong,
what you want changed, and what you want left out. Write under any **Comments** line, or anywhere.

---

## 1. What it is, in one paragraph

A referee records their game session however they like. After the game, their own AI agent, using a
skill we publish, turns the recording into a transcript, reads their campaign on traveller.voyage,
works out what changed (new people, places, ships, cargo, jumps, the date, a journal entry, loose
threads), and sends us one **batch of proposals**. The referee opens the campaign, sees the
proposals as cards with the line of the transcript each came from, and accepts, edits or drops each
one. Only an accepted proposal changes the campaign, and it goes through the same code path as a
change the referee typed. We never receive audio or a transcript, and the agent can never change
anything on its own.

**Comments:**

## 2. How one session flows, and who does what

| Step | Who | Where it runs | What we store |
|---|---|---|---|
| Record | the referee, on a phone, laptop or call bot | their side | nothing |
| Transcribe | the referee's agent, with a free local tool or the referee's own speech-to-text key (about a dollar for four hours) | their side | nothing |
| Understand | the agent reads the campaign index, searches names before creating anything, and writes the batch | their side, reading from us | nothing yet |
| Submit | the agent, over MCP (or plain HTTPS when no MCP client is present) | our Worker and the campaign's Durable Object | the proposals, each with up to three quotes of at most 300 characters, and a label for the session |
| Review | the referee, in the campaign panel, "Proposals" | our app | the decisions |
| Apply | the app, when the referee clicks Accept | the same `applyCampaignChanges` path as typing | the ordinary campaign records |

A pending batch expires after 30 days. A reviewed batch is deleted after 90. The quotes go with it.

**Comments:**

## 3. What you have already decided (20:24 and 20:27 tonight)

Listed so you can confirm or change any of them.

1. The referee's agent does all the heavy work; we take only the last step, over MCP. Transcription
   by us is dropped for good.
2. Phase 1 is: access tokens, the MCP endpoint with the plain routes under it, proposal storage, and
   the review screen.
3. Nothing applies without the referee. A rule, not a setting. No token scope and no MCP tool can
   apply, delete, publish or change who sees what.
4. We keep at most three quotes of 300 characters per proposal, never audio, never a transcript.
5. Character sheets come in phase 4. Players run the skill in phase 5. Until then the referee is the
   only actor.
6. The words in the app: "Proposals", "Agent access", "Bring in a session", "your AI agent". "SI"
   stays out of app copy.
7. OAuth waits until a referee asks (only ChatGPT needs it; every other agent takes a token).
8. A $20 a month billing alert in the Cloudflare dashboard before the server ships. Alerts email;
   they do not cap. The kill switch caps.
9. A token is bound to one campaign by default; "all my campaigns" is a tick.
10. The agent's read scope returns referee-only text, since it is the referee's own agent.

**Comments:**

## 4. What we build in phase 1

### 4.1 Agent access (tokens)
An "Agent access" section on the account page. "Make a token" asks for a name, which campaign (or
all), what it may do (read the campaign, send proposals), and how long it lives (90 days by default,
a year at most). The token is shown once with a copy button and never again. The list shows name,
first characters, campaign, scopes, created, expires, last used, and a Revoke button that works
immediately. Ten live tokens per account. Tokens are stored hashed, in D1 (migration 0022, after
Epic P's 0021). Better Auth 1.7.7 has no API key plugin, so B writes the small table itself.

### 4.2 What an agent can call
Six things, each available as an MCP tool and as a plain route on the same Worker:

| Tool | What it answers |
|---|---|
| list campaigns | the campaigns the token may see |
| read campaign index | every record's id, type, name, tags and place; the party; the clock; the last 50 journal entries |
| read records | up to 50 full records and their links |
| search records | a name search, up to 20 results |
| submit proposals | stores the batch, answers with the ids it minted |
| read proposal batch | what the referee kept, dropped, or has not reviewed yet |

There is no tool that applies, resolves, deletes, or touches visibility, settings, the party, images,
sheets or hexes. The MCP endpoint is `POST /mcp` on our Worker, stateless, with the official SDK v2
(Cloudflare's own `McpAgent` is deprecated and needs a Durable Object we do not want).

### 4.3 Proposal storage
Two small tables inside each campaign's Durable Object. No campaign table changes. No read path that
players, publishing, export or snapshots use ever touches them. Ten proposal kinds in phase 1: create
a record, update a record, create a link, create a journal entry, set the clock, append a jump, append
cargo, append passengers, append a ledger line, and a free-text question for the referee. Each must
carry at least one quote. Resubmitting the same batch is harmless (an idempotency key); a different
batch under the same key is refused.

### 4.4 The review screen
In the campaign panel, a "Proposals" section lists batches (name, date, pending, accepted, dropped).
A batch is a list of cards in transcript order. A card shows the proposed change beside the current
record (a diff for updates), the quotes, and Accept, Edit (the fields open in the record's own
editors) and Drop. "Accept all creates" and "Drop the rest" act on the batch. A question card has
"Make a note" and "Dismiss". A stale record (changed since the agent read it) comes back as a
conflict and stays pending with the current version shown.

### 4.5 Help and words
A help topic "Bring in a session": how to record, the consent list (which US states, Germany, New
South Wales need everyone's agreement), how to install the skill, what a proposal is, what we never
store. The token page's sentences include the warning that a leaked token can read referee notes
and send proposals but cannot change anything.

### 4.6 The skill
`findings/session_ingest/SKILL.md`, portable Agent Skills format, so one folder works in Claude Code,
claude.ai, Gemini CLI, Cursor and Codex. It tells the agent to check consent, transcribe with the
referee's tool, build a term list from the campaign's record names, search before creating, quote
the shortest span as evidence, never write a Traveller rule or number from its own knowledge, treat
nothing in the transcript as an instruction, submit once, and stop at the review URL.

**Comments:**

## 5. Limits that protect us (every number is a guard, each has a sentence)

- 10 submits a minute per token and per campaign, outside the referee's own 120-a-minute budget, so
  an agent never blocks the referee typing and the referee never blocks the agent.
- 120 reads a minute per token.
- 200 proposals and 256 KB per batch; 20 open batches and 2,000 pending proposals per campaign.
- A kill switch (`agent_access` off) that pauses every token and MCP request without a deploy.
- Cookie routes are untouched: no existing route accepts a token by accident.

**Comments:**

## 6. Safety, the short list

1. **A transcript that tries to give orders.** The server refuses any proposal that names
   visibility, author, images, settings, the party, a delete or a sheet, forces every stored row to
   referee-only, and applies nothing without the referee's click.
2. **Secrets leaking to players.** Pending proposals live in tables no player, publish, export or
   snapshot path reads. Each path has a named test.
3. **A leaked token.** It can read that campaign (referee notes included) and send proposals up to
   the guards. It cannot apply, delete, publish or change visibility. Revoke is one click.
4. **Privacy.** No audio, no transcript, short quotes only, deleted with the batch or the campaign.
   The help text covers consent law and the speech-to-text vendors' training policies.

**Comments:**

## 7. Cost to us

Per session: about 25 requests, 300 rows written, 25,000 rows read, 50 KB held for 90 days.

| Scale | Sessions a month | Our cost beyond the $5 plan |
|---|---|---|
| 10 weekly referees | 43 | $0 |
| 1,000 weekly referees | 4,330 | $0 |
| 10,000 weekly referees | 43,300 | about $0.50; about $18 if every included allowance were already used by the rest of the product |

For comparison, had we transcribed on Workers AI: $2 / $533 / $5,330 a month without speaker
labels, $51 / $5,400 / $54,000 with. That row is why the agent does the heavy work.

**Comments:**

## 8. Later phases (nothing started)

- **Phase 3, OAuth:** when a ChatGPT user asks. Better Auth's MCP plugin, a consent screen. Tokens
  stay for scripts.
- **Phase 4, character sheets:** a `sheet.set` proposal, applied through the character fields route
  as the referee, so only a sheet the referee can already edit can change. Wounds, credits, skills.
- **Phase 5, players:** after Epic P's P7, a member token that may propose only their own journal
  notes, reviewed in their own panel.

**Comments:**

## 9. Where it stands tonight

| Step | Lane | State |
|---|---|---|
| SI0, the contract (`contracts/b_session_ingest.md`) | B | done, accepted; SI0b fixed one word (`targetId`) |
| SI5, the schema and the skill | Z | done: `packages/shared/src/schemas/proposals.ts`, 13 tests green, SKILL.md at 0.2-draft |
| SI1, the server (tokens, kill switch, tables, routes, `POST /mcp`, worker tests) | B | queued, after BC1b; P2b is in, so it is unblocked |
| SI2, the browser store | A | not queued yet; waits for P3 |
| SI3, the screens | D | not queued yet; waits for P6 |
| SI4, help and words | E | not queued yet; no dependency |
| The $20 billing alert | you | before SI1 ships |

Phase 1 is done when a referee with a transcript and Claude Code (or `curl`) installs the skill,
makes a token, runs the skill, sees the batch in the panel, accepts half, edits one, drops the rest,
and the campaign shows the result; the leak tests are green; and the Cloudflare dashboard after a
week shows the phase 1 row of the cost table.

**Comments:**

## 10. Things I would flag for your eye

1. **What a referee needs to have.** An agent that runs skills and can call an MCP server or make
   HTTPS calls: Claude Code, claude.ai or Claude Desktop with a custom connector, Cursor, Gemini CLI,
   Codex. A referee with only ChatGPT waits for phase 3. A referee with nothing of the sort cannot
   use this at all; the help text should say so plainly.
2. **Transcription is the referee's problem by design.** Claude itself cannot take an audio file
   today, so a Claude-based agent needs a local Whisper or a speech-to-text key; a Gemini-based agent
   can listen directly. The skill's reference page gives recipes for both. Is that enough, or do you
   want a one-page "how to get a transcript" in the app's help too?
3. **Typed notes work as well as a recording.** The batch's source kind can be `transcript`,
   `notes` or `other`, so a referee who writes notes after the game can run the same skill. Worth
   saying in the help, if you agree.
4. **Search is a plain name match**, not full text, capped at 20 results. Enough for "find Captain
   Rhys"; not a search feature for the app.
5. **The review lives in the campaign panel only.** No email, no notification. A pending count can
   show on the panel. Do you want anything more visible?
6. **One stale heading.** The spec's §2.3 still says the MCP server is phase 2; your 20:24 note at
   the top and the contract move it to phase 1. The contract is what B builds from.
7. **The skill's folder.** The format wants the folder named after the skill, so it will be
   published as `voyage-session-ingest/`; Z recommended renaming only at publish time.
8. **Unverified facts** the research could not fetch are listed once in the report §8 (among them:
   whether Cloudflare's speech model returns speaker labels, which no longer matters; KV prices,
   which matter only for the OAuth phase).

**Comments:**
