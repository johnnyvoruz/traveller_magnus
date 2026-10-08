# Agent A — live character sheets and copies: the design, on paper

Issued 2026-10-07 by the orchestrator. Do this after the PDF inventory
(`a_character_fields.md`) is reported. **Paper only: no file under `apps/`, `packages/`
or `rules/` changes.**

## What Johnny said (2026-10-07), in his words

> "For the character sheets, I want to make two different concepts. There's one main
> character sheet that can be shared and it's the 'live' sheet, that is tied to a player
> and then shared, and when updates are made it's updated throughout all sheets that are
> using that sheet in their universe (i.e. a Ref and a player account: the player account
> creates their sheet, Ref and player can co-edit, and it's the live sheet). The
> marketplace idea is that this character can be essentially copied to other universe
> instances (which is one of the main features: we're going to be building a community
> where people can make systems and publish them to the free marketplace and then others
> can add them to their universe)."

So, two things:
1. **The live sheet.** Owned by a player's account. Used by reference in one or more
   universes. The player and the referee of a universe that uses it both edit it. One
   copy of the truth; every place that shows it shows the same.
2. **The copy.** A character taken into another universe as its own independent
   instance, including through the free marketplace (publish a snapshot; whoever adds
   it gets their own).

## What the specs already hold: read these first

- `slice_2_campaign.md` **K10** (copy between campaigns, "instanced") and **K11** (shared
  records in an **account library**, "one more universe-shaped store per account", with
  the proposed split: what the character *is* is shared; where they are and who they
  know *in this game* belongs to each campaign). Johnny's words are K11 with an owner
  (the player) and a second editor (the referee), and K10 widened to the marketplace.
- `packages/shared/src/schemas/campaign.ts`: `CampaignProvenance`
  (`mode: 'copy' | 'shared'`) is already on every record; `campaign_copy.ts` beside it.
- `architecture.md` §2 (the git model: objects, pointers, manifests, packages, install),
  §3, §4, §8 (the sync model); `data_model.md`; `api.md` (auth, who may read and write a
  universe); `manifesto.md` (the marketplace: free, snapshot on publish); `plan.md`
  Slice 4 (Sharing) and what it defers ("live co-editing", "player accounts").
- What exists in code: one Durable Object per universe; an account owns its universes;
  **no account can yet see anything in another account's universe**; the browser's
  store commits changes with `baseRev` and takes conflicts; nothing is pushed to an open
  page from the server.
- Agent D is building the sheet itself behind a clean boundary (a sheet document in,
  changes out: `prompts/d_character_sheet.md`), so where the values live can change
  without the screen changing.

## Write `findings/live_sheet_design.md`

1. **The model, in one page.** Where a live character lives (the account library as
   K11 sketches it, or something else: argue it against the git model and the
   one-DO-per-universe rule); what a universe holds to use one (a record whose sheet is
   a reference); what is shared and what stays per game (start from K11's split and say
   where Johnny's words change it); ids; what `provenance` records for each case.
2. **Who may do what.** The player who owns it; a referee whose universe uses it;
   anyone else. How a referee comes to use a player's character at all: today nothing
   connects two accounts. Set out the smallest thing that does (an invitation, a share
   link, a membership), what it must let each side see, and what it must not (a referee's
   universe is private). This is the piece that does not exist yet: be exact about its
   size.
3. **"Live": the bar is set (Johnny, 2026-10-07): "Think of it like two people working
   in Google Sheets at the same time."** So this is not a poll and not a reload. Design
   to that, and be exact about what it means for a sheet of boxes:
   - a change to a box by one person appears for everyone who has the sheet open, about
     as fast as a spreadsheet does, without anyone reloading or pressing anything;
   - **presence:** who else has the sheet open, and which box each of them is in, shown
     on the box in that person's colour;
   - a box changes when its editor commits it (leaves the box, presses Enter), as a
     spreadsheet cell does; two commits to the same box, the later stands, and the other
     person sees it change. Say plainly that typing inside one box is not merged letter
     by letter, which a spreadsheet does not do either;
   - a table's rows: adding, removing and reordering by two people at once;
   - leaving and coming back, a dropped connection, a laptop lid: what is queued, what
     is replayed, what the person is told.
   Then how it is carried: the Durable Object that is the live character's home holding
   the open pages' WebSockets (the hibernation API), changes as per-box operations with
   an order the object assigns, presence as messages that are never stored; who may
   open the socket and how it is authorised; what the Worker and `wrangler.toml` need;
   the limits and the cost at rest and in use. Set the existing commit-and-conflict
   road beside it and say what is reused. The plan deferred "live co-editing with
   Durable Objects" to after Slice 5: this pulls it forward for sheets only, and the
   design says what is the least that meets the bar and what is deliberately left.
4. **The edges.** The player deletes the character, or their account; the referee
   removes it from a game (does the game keep a frozen copy?); the character is in two
   games and one referee's change shows in the other; a live character is aboard a
   vessel that exists only in one game; the sheet's schema version changes; offline or
   signed out; export.
5. **The copy and the marketplace.** K10 for one character: what is copied (the record,
   the sheet, images, links among a copied set), what is not (the game layer), new ids,
   `provenance`. Then publishing a character to the free marketplace beside systems:
   how it fits the package and manifest of `architecture.md` §2 and Slice 4, what a
   snapshot on publish means for images and for a live sheet (a published copy is never
   live), and how "add to my universe" lands.
6. **What it costs and in what order.** The steps, each small enough to be one prompt,
   naming the agent's lane (shared schemas, the Worker and Durable Objects, the store,
   the screens), and which of them need a migration or a new binding in `wrangler.toml`
   (Johnny's to deploy). What must be decided before step 1, and what can wait.
7. **Questions for Johnny,** each in plain words with your recommended answer first,
   only where the design truly forks. The orchestrator has already put four to him
   (what a referee keeps private about a player's character; whether a referee may edit
   the whole sheet; whether a game keeps a frozen copy when a character leaves; how live
   "live" is): do not repeat them; build on his answers if they are at the foot of this
   file when you start, and say where your design would differ.

No Traveller rule is involved here; nothing from memory is needed. Read-only: no code,
no production call, no git. Stop and report with the design and the questions.

## Johnny's answers to the orchestrator's four (added when given)

- **How live (G20), 2026-10-07:** "Think of it like two people working in Google Sheets
  at the same time." Section 3 above is rewritten to that bar.
- **May the referee edit the whole sheet (G18):** taken as yes from the same answer (two
  people in one spreadsheet both edit anything), until he says otherwise.
- **What stays the referee's own (G17), 2026-10-07: yes to the recommended answer.** The
  sheet, the name, the portrait and the summary are live and shared. Each game keeps its
  own layer, which the player does not see unless the referee shares it: where the
  character is, who they are linked to, and the referee's notes.
- **A frozen copy when a live character leaves a game (G19), 2026-10-07: yes.** The game
  keeps a copy as it stood, marked as no longer live.
Both are rulings, not assumptions.
